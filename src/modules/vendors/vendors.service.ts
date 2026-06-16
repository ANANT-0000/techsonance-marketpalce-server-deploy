import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  address as addressTable,
  categories,
  company,
  company as companyTable,
  gst_invoices,
  order_items,
  orders,
  product_variants,
  products,
  promotions,
  promotion_usage,
  refunds,
  user as userTable,
  user_and_company,
  user_roles,
  user_roles as user_rolesTable,
  vendor,
  vendor as vendorTable,
  company_document as vendor_documentTable,
} from '../../drizzle/schema';
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  like,
  lte,
  SQL,
  sql,
} from 'drizzle-orm';
import {
  AccessStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../../drizzle/types/types';
import bcrypt from 'bcryptjs';
import { MailService } from '../../common/services/mail/mail.service';
import { CreateVendorDto } from './dto/CreateVendorDto';
import { LoginDto } from '../users/dto/userAuth.dto.ts';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { formatCompanyDomain } from '../../common/filters/formatDomain.filter';
import { company_compliance } from '../../drizzle/schema/company_identity.schema';
import { CreateAddressDto } from '../address/dto/createAddress.dto';
import { AddressType } from '../../common/Types/index.type';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { randomBytes } from 'crypto';
import { extractCloudinaryPublicId } from '../../common/filters/extractCloudinaryPublicId.filter';
import { SubscriptionService } from '../subscription/subscription.service';
import { VendorsErrorKeyEnum } from './constants/vendors.enums';

const SALT_ROUNDS = 10;
type UserType = typeof userTable.$inferSelect;
type VendorType = typeof vendorTable.$inferSelect;
type UserRoleType = typeof user_rolesTable.$inferSelect;

@Injectable()
export class VendorsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleService,
    private jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly companyService: CompanyService,
    private readonly uploadToCloudService: UploadToCloudService,
    private readonly subscriptionService: SubscriptionService,
  ) {}
  async vendorRegister(
    vendorData: CreateVendorDto,
    files: Express.Multer.File[],
  ) {
    const vendorDocuments: {
      secure_url: string;
      type: string;
      resource_type: string;
    }[] = [];
    try {
      const docFiles = Array.isArray(files['documents'])
        ? files['documents']
        : [];
      const documentPromises = docFiles.map(
        async (file: Express.Multer.File) => {
          return await this.uploadToCloudService
            .uploadDocument(file, file.originalname.split('__')[0])
            .catch((error) => {
              throw new InternalServerErrorException(
                `Failed to upload document ${file.originalname}`,
                { cause: error },
              );
            });
        },
      );
      const resolvedDocuments = await Promise.all(documentPromises);
      vendorDocuments.push(...resolvedDocuments);
      const companyDomainToCheck = formatCompanyDomain(
        vendorData.company_domain,
      );
      const [existingEmail] = await this.db
        .select({ id: userTable.id })
        .from(userTable)
        .where(eq(userTable.email, vendorData.email))
        .limit(1);
      if (existingEmail) {
        throw new HttpException(
          VendorsErrorKeyEnum.EMAIL_ALREADY_IN_USE_PLEASE_USE_A_DIFFERENT_EMAIL_OR_LOGIN,
          HttpStatus.CONFLICT,
        );
      }
      const [existingDomain] = await this.db
        .select({ id: companyTable.id })
        .from(companyTable)
        .where(eq(companyTable.company_domain, companyDomainToCheck))
        .limit(1);
      if (existingDomain) {
        throw new HttpException(
          VendorsErrorKeyEnum.COMPANY_DOMAIN_ALREADY_REGISTERED_PLEASE_CHOOSE_A_DIFFERENT_DOMAIN,
          HttpStatus.CONFLICT,
        );
      }

      const result = await this.db.transaction(async (tx) => {
        const password = randomBytes(9).toString('base64').slice(0, 12);
        const hashedPassword = await bcrypt
          .hash(password, SALT_ROUNDS)
          .catch((error) => {
            throw new InternalServerErrorException(
              VendorsErrorKeyEnum.FAILED_TO_HASH_PASSWORD,
              {
                cause: error,
              },
            );
          });
        const [newRole] = await tx
          .insert(user_rolesTable)
          .values({
            role_name: UserRole.VENDOR,
          })
          .onConflictDoUpdate({
            target: user_rolesTable.role_name,
            set: { id: user_rolesTable.id },
          })
          .returning({ id: user_rolesTable.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              VendorsErrorKeyEnum.FAILED_TO_CREATE_VENDOR_ROLE,
              {
                cause: error,
              },
            );
          });

        const companyDomain = formatCompanyDomain(vendorData.company_domain);
        const [newCompany] = await tx
          .insert(companyTable)
          .values({
            company_name: vendorData.company_name,
            company_domain: companyDomain,
            company_structure: vendorData.company_structure,
          })
          .returning({ id: companyTable.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              VendorsErrorKeyEnum.FAILED_TO_CREATE_COMPANY_FOR_VENDOR,
              {
                cause: error,
              },
            );
          });
        if (!newCompany || !newCompany.id) {
          throw new HttpException(
            VendorsErrorKeyEnum.FAILED_TO_CREATE_COMPANY_FOR_VENDOR,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        const [newUser] = await tx
          .insert(userTable)
          .values({
            first_name: vendorData.store_owner_first_name,
            last_name: vendorData.store_owner_last_name,
            email: vendorData.email,
            country_code: vendorData.country_code,
            phone_number: vendorData.phone_number,
            password_hash: hashedPassword,
            password_change_required: true,
          })
          .returning({ id: userTable.id, email: userTable.email })
          .catch((error) => {
            throw new InternalServerErrorException(
              VendorsErrorKeyEnum.FAILED_TO_CREATE_USER_FOR_VENDOR,
              {
                cause: error,
              },
            );
          });
        await tx
          .insert(user_and_company)
          .values({
            user_id: newUser.id,
            company_id: newCompany.id,
            access_status: AccessStatus.PENDING,
            role_id: newRole.id,
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              VendorsErrorKeyEnum.FAILED_TO_CREATE_USER_AND_COMPANY_FOR_VENDOR,
              {
                cause: error,
              },
            );
          });
        if (!newUser || !newUser.id) {
          throw new HttpException(
            VendorsErrorKeyEnum.FAILED_TO_CREATE_USER_FOR_VENDOR,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        const [newVendor] = await tx
          .insert(vendorTable)
          .values({
            store_owner_first_name: vendorData.store_owner_first_name,
            store_owner_last_name: vendorData.store_owner_last_name,
            store_name: vendorData.company_name,
            store_description: vendorData.company_description ?? '',
            category: vendorData.category,
            user_id: newUser.id,
            company_id: newCompany.id,
          })
          .returning({ id: vendorTable.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              VendorsErrorKeyEnum.FAILED_TO_CREATE_VENDOR_RECORD,
              {
                cause: error,
              },
            );
          });
        if (!newVendor || !newVendor.id) {
          throw new HttpException(
            VendorsErrorKeyEnum.FAILED_TO_CREATE_VENDOR_RECORD,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        // After vendor documents are inserted, collect their IDs
        const insertedDocs: { id: string; document_type: string }[] = [];

        for (const doc of vendorDocuments) {
          const [insertedDoc] = await tx
            .insert(vendor_documentTable)
            .values({
              document_url: doc.secure_url,
              document_type: doc.type,
              vendor_id: newVendor.id,
            })
            .returning({
              id: vendor_documentTable.id,
              document_type: vendor_documentTable.document_type,
            })
            .catch((error) => {
              throw new InternalServerErrorException(
                VendorsErrorKeyEnum.FAILED_TO_INSERT_VENDOR_DOCUMENT,
                { cause: error },
              );
            });

          if (insertedDoc) insertedDocs.push(insertedDoc);
        }

        // Build a lookup map: document_type -> document_id
        const docTypeToIdMap = new Map(
          insertedDocs.map((doc) => [doc.document_type, doc.id]),
        );
        const date = new Date(); // current date,

        date.setFullYear(date.getFullYear() + 2);

        const compliancePayloads = vendorData.company_compliance.map(
          (compliance) => {
            const matchedDocId =
              docTypeToIdMap.get(compliance.field_key) ?? null;

            return {
              company_id: newCompany.id,
              country_code: vendorData.country_code.replace('+', ''),
              field_key: compliance.field_key,
              field_value: compliance.field_value,
              field_details: compliance.field_details,
              is_active: compliance.is_active ?? true,
              valid_until:
                compliance.valid_until && compliance.valid_until !== ''
                  ? compliance.valid_until
                  : date.toISOString(), // default to 2 year validity if not provided
              document_id: matchedDocId, // null if no matching doc
            };
          },
        );

        // Bulk insert all compliance records at once, skip duplicates
        if (compliancePayloads.length > 0) {
          await tx
            .insert(company_compliance)
            .values(compliancePayloads)
            .onConflictDoNothing({
              target: [
                company_compliance.company_id,
                company_compliance.country_code,
                company_compliance.field_key,
              ],
            })
            .catch((error) => {
              throw new InternalServerErrorException(
                VendorsErrorKeyEnum.FAILED_TO_INSERT_COMPANY_COMPLIANCE,
                { cause: error },
              );
            });
        }

        return {
          vendorMail: newUser.email,
          randomPassword: password,
          vendorCompany_name: vendorData.company_name,
          message: 'Vendor registered successfully',
        };
      });

      try {
        await this.mailService
          .sendVendorRegistrationEmail(
            result.vendorMail,
            result.vendorCompany_name,
            result.randomPassword,
          )
          .catch((error) => {
            throw new InternalServerErrorException(
              VendorsErrorKeyEnum.FAILED_TO_SEND_REGISTRATION_EMAIL,
              {
                cause: error,
              },
            );
          });
      } catch (emailError) {}
      return {
        message: 'Vendor registered successfully',
      };
    } catch (error) {
      for (const file of vendorDocuments) {
        const publicId = extractCloudinaryPublicId(file.secure_url);
        if (publicId) {
          this.uploadToCloudService
            .deleteFile(publicId, file.resource_type)
            .catch((deleteError) => {});
        }
      }
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_REGISTER_VENDOR,
        {
          cause: error,
        },
      );
    }
  }
  async vendorLogin(loginDto: LoginDto) {
    try {
      const existingUser:
        | {
            user: Partial<UserType>;
            vendor: Partial<VendorType>;
            role: Partial<UserRoleType>;
          }
        | HttpException = await this.db
        .transaction(async (tx) => {
          if (!loginDto.email || !loginDto.password) {
            throw new HttpException(
              VendorsErrorKeyEnum.EMAIL_AND_PASSWORD_ARE_REQUIRED,
              HttpStatus.BAD_REQUEST,
            );
          }
          const [userRecord]: Partial<UserType>[] = await tx
            .select()
            .from(userTable)
            .where(eq(userTable.email, loginDto.email))
            .catch((error) => {
              throw new InternalServerErrorException(
                VendorsErrorKeyEnum.USER_NOT_FOUND,
                {
                  cause: error,
                },
              );
            });
          if (!userRecord || !userRecord.id || !userRecord.password_hash) {
            throw new UnauthorizedException(VendorsErrorKeyEnum.USER_NOT_FOUND);
          }
          const isPasswordValid = await bcrypt.compare(
            loginDto.password,
            userRecord.password_hash,
          );
          if (!isPasswordValid) {
            throw new UnauthorizedException(
              VendorsErrorKeyEnum.INVALID_PASSWORD,
            );
          }
          const [vendorRecord] = await tx
            .select()
            .from(vendorTable)
            .where(eq(vendorTable.user_id, userRecord.id))
            .catch((error) => {
              throw new InternalServerErrorException(
                VendorsErrorKeyEnum.VENDOR_NOT_FOUND,
                {
                  cause: error,
                },
              );
            });
          // uncomment in future
          // const [userAndCompanyRecord] = await tx
          //   .select()
          //   .from(user_and_company)
          //   .where(eq(user_and_company.user_id, userRecord.id));
          // ('vendorRecord', vendorRecord);
          if (!userRecord) {
            throw new UnauthorizedException(
              VendorsErrorKeyEnum.USER_ROLE_NOT_FOUND,
            );
          }
          // ('userAndCompanyRecord', userAndCompanyRecord)
          //------------------------------------------------------
          // uncomment in future
          //------------------------------------------------------
          // const [roleRecord] = await tx
          //   .select({ role_name: user_rolesTable.role_name })
          //   .from(user_rolesTable)
          //   .where(eq(user_rolesTable.id, userAndCompanyRecord.role_id)).limit(1);

          //-----------------------------------------------------
          // for bypassing the role check in future comment this and uncomment above
          //-----------------------------------------------------
          const [roleRecord] = await tx
            .select({ role_name: user_rolesTable.role_name })
            .from(user_rolesTable)
            .where(eq(user_rolesTable.role_name, UserRole.VENDOR))
            .limit(1)
            .catch((error) => {
              throw new InternalServerErrorException(
                VendorsErrorKeyEnum.USER_ROLE_NOT_FOUND,
                {
                  cause: error,
                },
              );
            });
          if (!vendorRecord)
            throw new UnauthorizedException(
              VendorsErrorKeyEnum.VENDOR_NOT_FOUND,
            );
          const isVendorApproved =
            vendorRecord.vendor_status === UserStatus.ACTIVE;
          // const isVendorApproved = vendorRecord.vendor_status === UserStatus.ACTIVE &&  userAndCompanyRecord.access_status === AccessStatus.ACTIVE;
          if (!isVendorApproved)
            throw new HttpException(
              VendorsErrorKeyEnum.VENDOR_APPLICATION_IS_STILL_UNDER_REVIEW,
              HttpStatus.UNAUTHORIZED,
            );
          return { user: userRecord, vendor: vendorRecord, role: roleRecord };
        })
        .catch((error) => {
          if (error instanceof HttpException) {
            throw error;
          }
          throw new InternalServerErrorException(
            VendorsErrorKeyEnum.FAILED_TO_LOGIN_VENDOR,
            {
              cause: error,
            },
          );
        });
      if (existingUser instanceof HttpException) {
        throw existingUser;
      }

      const user = existingUser?.user;
      const vendor = existingUser?.vendor;
      const role = existingUser?.role;
      const payload: {
        sub: string | undefined;
        email: string | undefined;
        role: string | undefined;
        company_id: string | undefined;
        password_change_required: boolean | undefined;
      } = {
        sub: user.id,
        email: user.email,
        role: role?.role_name,
        company_id: vendor.company_id ?? undefined,
        password_change_required: user.password_change_required,
      };

      const expiresIn: any = process.env.JWT_EXPIRES_IN
        ? (isNaN(Number(process.env.JWT_EXPIRES_IN)) ? process.env.JWT_EXPIRES_IN : parseInt(process.env.JWT_EXPIRES_IN, 10))
        : '7d';

      const accessToken = await this.jwtService.signAsync(payload, {
        expiresIn,
        secret: process.env.JWT_SECRET,
      });
      const refreshToken = await this.jwtService.signAsync(payload, {
        expiresIn: '7d',
        secret: process.env.JWT_REFRESH_SECRET,
      });
      const responseData = {
        company_id: vendor.company_id,
        vendor_id: vendor.id,
        user_id: user.id,
        role: role?.role_name,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        country_code: user.country_code,
        phone_number: user.phone_number,
        store_name: vendor.store_name,
        category: vendor.category,
        vendor_status: vendor.vendor_status,
        joined_at: vendor.created_at,
        password_change_required: user.password_change_required,
      };
      const response = {
        user: responseData,
        access_token: accessToken,
        refresh_token: refreshToken,
        role: role?.role_name,
      };
      return response;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_LOGIN_VENDOR,
        {
          cause: error,
        },
      );
    }
  }
  async findVendorByEmail(email: string) {
    try {
      const [vendorRecord] = await this.db
        .select()
        .from(vendorTable)
        .innerJoin(userTable, eq(vendorTable.user_id, userTable.id))
        .where(eq(userTable.email, email))
        .limit(1);
      if (!vendorRecord) {
        return new UnauthorizedException(VendorsErrorKeyEnum.VENDOR_NOT_FOUND);
      }
      return vendorRecord;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_FIND_VENDOR_BY_EMAIL,
        {
          cause: error,
        },
      );
    }
  }
  async approveVendor(vendorId: string) {
    try {
      const [isVendorExists] = await this.db
        .select({
          id: vendorTable.id,
          user_id: vendorTable.user_id,
          email: userTable.email,
          store_name: vendorTable.store_name,
        })
        .from(vendorTable)
        .where(eq(vendorTable.id, vendorId))
        .limit(1);
      if (!isVendorExists || !isVendorExists.user_id) {
        return new UnauthorizedException(VendorsErrorKeyEnum.VENDOR_NOT_FOUND);
      }
      await this.db
        .update(vendorTable)
        .set({ vendor_status: UserStatus.ACTIVE })
        .where(eq(vendorTable.id, vendorId))
        .catch((error) => {
          throw new InternalServerErrorException(
            VendorsErrorKeyEnum.FAILED_TO_UPDATE_VENDOR_STATUS_IN_DATABASE,
            {
              cause: error,
            },
          );
        });

      const [updatedUserAndCompany] = await this.db
        .update(user_and_company)
        .set({ access_status: AccessStatus.ACTIVE })
        .where(eq(user_and_company.user_id, isVendorExists.user_id))
        .returning({ company_id: user_and_company.company_id });
      const [companyDetails] = await this.db
        .select({ company_name: company.company_name })
        .from(company)
        .where(eq(company.id, updatedUserAndCompany.company_id))
        .limit(1);

      await this.subscriptionService.startTrial(
        updatedUserAndCompany.company_id,
      );

      await this.mailService.sendVendorApprovalEmail(
        isVendorExists.email,
        companyDetails.company_name,
      );
      return {
        success: true,
        message: 'Vendor approved and notification email sent successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_APPROVE_VENDOR,
        {
          cause: error,
        },
      );
    }
  }
  async rejectVendor(vendorId: string) {
    try {
      const vendorUser = await this.db.transaction(async (tx) => {
        const [vendorUser] = await tx
          .select({ email: userTable.email })
          .from(vendorTable)
          .innerJoin(userTable, eq(vendorTable.user_id, userTable.id))
          .where(eq(vendorTable.id, vendorId))
          .limit(1);
        if (!vendorUser) {
          throw new UnauthorizedException(
            `Failed to retrieve vendor user details for vendor ID ${vendorId}.`,
          );
        }
        await tx
          .update(vendorTable)
          .set({ vendor_status: UserStatus.REJECTED })
          .where(eq(vendorTable.id, vendorId));

        if (!vendorUser.email) {
          throw new UnauthorizedException(
            `User linked to vendor with ID ${vendorId} has no email.`,
          );
        }
        return {
          email: vendorUser.email,
        };
      });
      if (!vendorUser || !vendorUser.email) {
        throw new UnauthorizedException(
          `Failed to retrieve vendor user email for vendor ID ${vendorId}.`,
        );
      }
      await this.mailService.sendEmail(
        vendorUser.email,
        'Vendor Account Rejected',
        `<p>We regret to inform you that your vendor account has been rejected...</p>`,
      );
      return {
        message: 'Vendor rejected and notification email sent successfully',
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_REJECT_VENDOR,
        {
          cause: error,
        },
      );
    }
  }
  async removeVendor(vendorId: string) {
    try {
      const [vendorRow] = await this.db
        .select({ user_id: vendorTable.user_id })
        .from(vendorTable)
        .where(eq(vendorTable.id, vendorId))
        .limit(1);
      if (!vendorRow || !vendorRow.user_id) {
        throw new UnauthorizedException(VendorsErrorKeyEnum.VENDOR_NOT_FOUND);
      }
      const deleteUserResult = await this.db
        .delete(userTable)
        .where(eq(userTable.id, vendorRow.user_id));
      return {
        message: 'Vendor and associated user removed successfully',
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_REMOVE_VENDOR,
        {
          cause: error,
        },
      );
    }
  }
  async suspendedVendor(vendorId: string) {
    try {
      const suspendedVendor = await this.db.transaction(async (tx) => {
        const [vendorUser] = await tx
          .select({
            email: userTable.email,
            store_name: vendorTable.store_name,
            user_id: userTable.id,
          })
          .from(vendorTable)
          .innerJoin(userTable, eq(vendorTable.user_id, userTable.id))
          .where(eq(vendorTable.id, vendorId))
          .limit(1);
        if (!vendorUser) {
          throw new UnauthorizedException(
            `Failed to retrieve vendor details for vendor ID ${vendorId}.`,
          );
        }
        await tx
          .update(vendorTable)
          .set({ vendor_status: UserStatus.SUSPENDED })
          .where(eq(vendorTable.id, vendorId));
        await tx
          .update(userTable)
          .set({ user_status: UserStatus.SUSPENDED })
          .where(eq(userTable.id, vendorUser.user_id))
          .returning({ user_id: userTable.id });
        await tx
          .update(user_and_company)
          .set({ access_status: AccessStatus.SUSPENDED })
          .where(eq(user_and_company.user_id, vendorUser.user_id))
          .returning({ user_id: user_and_company.user_id });
        return {
          email: vendorUser.email,
          store_name: vendorUser.store_name,
        };
      });
      // await this.mailService.sendVendorSuspendedEmail(suspendedVendor.email, suspendedVendor.store_name);
      return {
        message: 'Vendor suspended successfully',
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_SUSPEND_VENDOR,
        {
          cause: error,
        },
      );
    }
  }

  async vendorApplicationCount() {
    try {
      const count = await this.db
        .select()
        .from(vendor)
        .innerJoin(company, eq(vendor.company_id, company.id))
        .where(eq(vendor.vendor_status, UserStatus.PENDING))
        .catch((error) => {
          throw new InternalServerErrorException(
            VendorsErrorKeyEnum.FAILED_TO_COUNT_VENDOR_APPLICATIONS,
            {
              cause: error,
            },
          );
        });
      return { count: count.length };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_COUNT_VENDOR_APPLICATIONS,
        {
          cause: error,
        },
      );
    }
  }
  async vendorApplications(filters: {
    search: string;
    limit: number;
    offset: number;
    status: UserStatus | undefined;
    date: string;
    sortby: 'asc' | 'desc';
  }) {
    try {
      const whereConditions: SQL[] = [];
      if (filters.status) {
        whereConditions.push(eq(vendor.vendor_status, filters.status));
      }
      if (filters.search) {
        whereConditions.push(ilike(vendor.store_name, `%${filters.search}%`));
      }
      const applications = await this.db.query.vendor
        .findMany({
          limit: filters.limit ?? 10,
          offset: filters.offset ?? 0,
          where: and(...whereConditions),
          with: {
            company: true,
            user: true,
            documents: true,
          },
          orderBy:
            filters.sortby == 'desc'
              ? desc(vendor.created_at)
              : asc(vendor.created_at),
        })
        .then((results) => {
          return results;
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_VENDOR_APPLICATIONS,
            {
              cause: error,
            },
          );
        });
      return applications;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_VENDOR_APPLICATIONS,
        {
          cause: error,
        },
      );
    }
  }
  async updateVendorStatus(vendorId: string, status: UserStatus) {
    try {
      const [existingVendor] = await this.db
        .select()
        .from(vendorTable)
        .where(eq(vendorTable.id, vendorId))
        .limit(1);
      if (!existingVendor) {
        return {
          success: false,
          message: 'Vendor not found',
          status: HttpStatus.NOT_FOUND,
        };
      }
      await this.db
        .update(vendorTable)
        .set({ vendor_status: status })
        .where(eq(vendorTable.id, vendorId));
      return {
        success: true,
        status: HttpStatus.OK,
        message: 'Vendor status updated successfully',
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_UPDATE_VENDOR_STATUS,
        {
          cause: error,
        },
      );
    }
  }
  async getAllVendors(
    offset?: string,
    limit?: string,
    status?: string,
    sort?: string,
  ) {
    try {
      const offsetClause = offset ? Number(offset) : 0;
      const limitClause = limit ? Number(limit) : 10;
      const statusClause = status
        ? eq(vendorTable.vendor_status, status as UserStatus)
        : undefined;
      const sortClause =
        sort === 'desc'
          ? desc(vendorTable.created_at)
          : asc(vendorTable.created_at);
      const vendors = await this.db.query.vendor.findMany({
        where: statusClause,
        offset: offsetClause,
        limit: limitClause,
        orderBy: sortClause,
        with: {
          company: true,
          user: true,
        },
      });
      return vendors;
    } catch (error) {
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_VENDORS,
        {
          cause: error,
        },
      );
    }
  }
  async getUnverifiedVendors() {
    try {
      const vendors = await this.db
        .select()
        .from(vendorTable)
        .where(eq(vendorTable.is_verified, false));
      return vendors;
    } catch (error) {
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_UNVERIFIED_VENDORS,
        {
          cause: error,
        },
      );
    }
  }
  async getVerifiedVendors() {
    try {
      const vendors = await this.db
        .select()
        .from(vendorTable)
        .where(eq(vendorTable.is_verified, true));
      if (!vendors) {
        throw new HttpException(
          VendorsErrorKeyEnum.NO_VERIFIED_VENDORS_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      return vendors;
    } catch (error) {
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_VERIFIED_VENDORS,
        {
          cause: error,
        },
      );
    }
  }
  async getVendorById(vendorId: string) {
    try {
      const [existingVendor] = await this.db
        .select()
        .from(vendorTable)
        .innerJoin(userTable, eq(vendorTable.user_id, userTable.id))
        .innerJoin(
          vendor_documentTable,
          eq(vendorTable.id, vendor_documentTable.vendor_id),
        )
        .where(eq(vendorTable.id, vendorId))
        .limit(1);
      if (!existingVendor) {
        throw new UnauthorizedException(VendorsErrorKeyEnum.VENDOR_NOT_FOUND);
      }
      return existingVendor;
    } catch (error) {
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_VENDOR,
        {
          cause: error,
        },
      );
    }
  }
  async getVendorDetails(vendorId: string) {
    try {
      const [roleRecord] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.CUSTOMER))
        .limit(1);
      const vendorDetails = await this.db.query.vendor
        .findFirst({
          where: eq(vendorTable.id, vendorId),
          with: {
            company: {
              with: {
                userAndCompany: {
                  where: eq(user_and_company.role_id, roleRecord?.id),
                  with: {
                    user: {
                      columns: {
                        id: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            user: true,
            documents: true,
          },
        })
        .then((res) => {
          return res;
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_VENDOR_DETAILS,
            {
              cause: error,
            },
          );
        });

      if (
        !vendorDetails ||
        !vendorDetails.company_id ||
        !vendorDetails.company
      ) {
        throw new HttpException(
          VendorsErrorKeyEnum.VENDOR_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const [orderStats] = await this.db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)`,
          totalOrders: sql<number>`COUNT(${orders.id})`,
        })
        .from(orders)
        .where(eq(orders.company_id, vendorDetails.company_id));
      const [activeProducts] = await this.db
        .select({ count: countDistinct(product_variants.id) })
        .from(products)
        .innerJoin(
          product_variants,
          and(
            eq(products.id, product_variants.product_id),
            eq(product_variants.status, ProductStatus.ACTIVE),
          ),
        )
        .where(eq(products.company_id, vendorDetails.company_id))
        .limit(1);
      const response = {
        owner: {
          ...vendorDetails,
          user: { ...vendorDetails.user, password: undefined },
          company: undefined,
          documents: undefined,
        },
        company: {
          ...vendorDetails.company,
          userAndCompany: undefined,
          documents: undefined,
        },
        stats: {
          total_orders: Number(orderStats.totalOrders),
          total_revenue: Number(orderStats.totalRevenue),
          active_products: activeProducts.count,
          total_customers: vendorDetails.company.userAndCompany.length,
        },
        documents: vendorDetails.documents,
      };
      // const response = vendorDetails
      return response;
    } catch (error) {
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_VENDOR,
        {
          cause: error,
        },
      );
    }
  }
  async createRegistrationAddress(
    domain: string,
    addressData: CreateAddressDto,
  ) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    try {
      const payload = {
        company_id: companyId,
        name: addressData.name,
        number: addressData.phone,
        address_type: AddressType.BUSINESS,
        address_line_1: addressData.address_line_1,
   
        street: addressData.street,
        city: addressData.city,
        state: addressData.state,
        postal_code: addressData.postal_code,
        country: addressData.country,
        landmark: addressData.landmark,
        is_default: addressData.is_default,
      };
      const [createdAddress] = await this.db
        .insert(addressTable)
        .values(payload)
        .returning({ id: addressTable.id })
        .catch((error) => {
          throw new InternalServerErrorException(
            VendorsErrorKeyEnum.FAILED_TO_CREATE_REGISTRATION_ADDRESS,
            {
              cause: error,
            },
          );
        });

      if (!createdAddress || !createdAddress.id) {
        throw new HttpException(
          VendorsErrorKeyEnum.FAILED_TO_CREATE_REGISTRATION_ADDRESS,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return {
        message: 'Registration address created successfully',
        address_id: createdAddress.id,
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_CREATE_REGISTRATION_ADDRESS,
        {
          cause: error,
        },
      );
    }
  }
  async getCompanyAddresses(domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    try {
      const addresses = await this.db
        .select()
        .from(addressTable)
        .where(eq(addressTable.company_id, companyId))
        .catch((error) => {
          throw new InternalServerErrorException(
            VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_COMPANY_ADDRESSES,
            {
              cause: error,
            },
          );
        });
      return addresses;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_COMPANY_ADDRESSES,
        {
          cause: error,
        },
      );
    }
  }

  async getAnalyticsData(domain: string, start?: string, end?: string) {
    try {
      // 1. Resolve Company ID from Domain
      const filteredDomain = domainExtractor(domain);
      const companyId = await this.companyService.find(filteredDomain);

      if (!companyId) {
        throw new UnauthorizedException(
          VendorsErrorKeyEnum.COMPANY_NOT_FOUND_FOR_THE_PROVIDED_DOMAIN,
        );
      }

      // 2. Parse Dates (Default to last 30 days if not provided)
      const startDate = start
        ? new Date(start)
        : new Date(new Date().setDate(new Date().getDate() - 30));
      const endDate = end ? new Date(end) : new Date();

      const baseFilter = and(
        eq(orders.company_id, companyId),
        gte(orders.created_at, startDate),
        lte(orders.created_at, endDate),
      );

      // 3A. Gross Revenue & Orders
      const [salesStats] = await this.db
        .select({
          grossRevenue: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)::float`,
          totalOrders: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
        })
        .from(orders)
        .where(baseFilter);

      // 3B. Tax Collected
      const [taxStats] = await this.db
        .select({
          taxCollected: sql<number>`COALESCE(SUM(${gst_invoices.total_tax}), 0)::float`,
        })
        .from(gst_invoices)
        .innerJoin(orders, eq(gst_invoices.order_id, orders.id))
        .where(baseFilter);

      // 3C. Refunds
      const [refundStats] = await this.db
        .select({
          refunds: sql<number>`COALESCE(SUM(${refunds.refund_amount}), 0)::float`,
        })
        .from(refunds)
        .innerJoin(orders, eq(refunds.order_id, orders.id))
        .where(baseFilter);

      // 3D. Calculate Net Earnings
      const platformFees = 0; // Replace with actual logic if platform fees are added to schema later
      const netEarnings =
        salesStats.grossRevenue -
        taxStats.taxCollected -
        refundStats.refunds -
        platformFees;

      // 4. Monthly Trend
      const monthlyTrend = await this.db
        .select({
          month: sql<string>`TO_CHAR(${orders.created_at}, 'Mon YYYY')`,
          sortDate: sql<string>`TO_CHAR(${orders.created_at}, 'YYYY-MM')`,
          revenue: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)::float`,
          orders: sql<number>`COUNT(${orders.id})::int`,
        })
        .from(orders)
        .where(baseFilter)
        .groupBy(
          sql`TO_CHAR(${orders.created_at}, 'Mon YYYY')`,
          sql`TO_CHAR(${orders.created_at}, 'YYYY-MM')`,
        )
        .orderBy(sql`TO_CHAR(${orders.created_at}, 'YYYY-MM')`);

      // 5. Top Selling Products
      const topProducts = await this.db
        .select({
          sku: product_variants.sku,
          revenue: sql<number>`COALESCE(SUM(${order_items.price} * ${order_items.quantity}), 0)::float`,
        })
        .from(order_items)
        .innerJoin(orders, eq(order_items.order_id, orders.id))
        .innerJoin(
          product_variants,
          eq(order_items.product_variant_id, product_variants.id),
        )
        .where(baseFilter)
        .groupBy(product_variants.sku)
        .orderBy(desc(sql`SUM(${order_items.price} * ${order_items.quantity})`))
        .limit(5);

      // 6. Category Performance
      const categoryPerformance = await this.db
        .select({
          name: categories.name,
          value: sql<number>`COALESCE(SUM(${order_items.price} * ${order_items.quantity}), 0)::float`,
        })
        .from(order_items)
        .innerJoin(orders, eq(order_items.order_id, orders.id))
        .innerJoin(
          product_variants,
          eq(order_items.product_variant_id, product_variants.id),
        )
        .innerJoin(products, eq(product_variants.product_id, products.id))
        .innerJoin(categories, eq(products.category_id, categories.id))
        .where(baseFilter)
        .groupBy(categories.name);

      return {
        summary: {
          grossRevenue: salesStats.grossRevenue,
          totalOrders: salesStats.totalOrders,
          taxCollected: taxStats.taxCollected,
          refunds: refundStats.refunds,
          platformFees,
          netEarnings,
        },
        monthlyTrend,
        topProducts,
        categoryPerformance,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_VENDOR_ANALYTICS_DATA,
        {
          cause: error,
        },
      );
    }
  }

  // ─── PDF Analytics Export ────────────────────────────────────────────────────
  // Returns a single, comprehensive payload for the frontend HTML+Chart.js PDF.
  async getAnalyticsPdfData(domain: string, start?: string, end?: string) {
    try {
      const filteredDomain = domainExtractor(domain);
      const companyId = await this.companyService.find(filteredDomain);

      if (!companyId) {
        throw new UnauthorizedException(
          VendorsErrorKeyEnum.COMPANY_NOT_FOUND_FOR_THE_PROVIDED_DOMAIN,
        );
      }

      const startDate = start
        ? new Date(start)
        : new Date(new Date().setDate(new Date().getDate() - 30));
      const endDate = end ? new Date(end) : new Date();

      const baseFilter = and(
        eq(orders.company_id, companyId),
        gte(orders.created_at, startDate),
        lte(orders.created_at, endDate),
      );

      // ── 1. Summary (Gross Revenue, Net Earnings, Tax, Refunds) ──────────────
      const [salesStats] = await this.db
        .select({
          grossRevenue: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)::float`,
          totalOrders: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
        })
        .from(orders)
        .where(baseFilter);

      const [taxStats] = await this.db
        .select({
          taxCollected: sql<number>`COALESCE(SUM(${gst_invoices.total_tax}), 0)::float`,
        })
        .from(gst_invoices)
        .innerJoin(orders, eq(gst_invoices.order_id, orders.id))
        .where(baseFilter);

      const [refundStats] = await this.db
        .select({
          refunds: sql<number>`COALESCE(SUM(${refunds.refund_amount}), 0)::float`,
        })
        .from(refunds)
        .innerJoin(orders, eq(refunds.order_id, orders.id))
        .where(baseFilter);

      const platformFees = 0;
      const netEarnings =
        salesStats.grossRevenue -
        taxStats.taxCollected -
        refundStats.refunds -
        platformFees;

      // ── 2. Monthly Revenue + Order Count Trend ───────────────────────────────
      const monthlyTrend = await this.db
        .select({
          month: sql<string>`TO_CHAR(${orders.created_at}, 'Mon YYYY')`,
          sortDate: sql<string>`TO_CHAR(${orders.created_at}, 'YYYY-MM')`,
          revenue: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)::float`,
          orderCount: sql<number>`COUNT(${orders.id})::int`,
        })
        .from(orders)
        .where(baseFilter)
        .groupBy(
          sql`TO_CHAR(${orders.created_at}, 'Mon YYYY')`,
          sql`TO_CHAR(${orders.created_at}, 'YYYY-MM')`,
        )
        .orderBy(sql`TO_CHAR(${orders.created_at}, 'YYYY-MM')`);

      // ── 3. Top Selling Products (by units sold) ──────────────────────────────
      const topProducts = await this.db
        .select({
          name: product_variants.variant_name,
          sku: product_variants.sku,
          unitsSold: sql<number>`COALESCE(SUM(${order_items.quantity}), 0)::int`,
          revenue: sql<number>`COALESCE(SUM(${order_items.price} * ${order_items.quantity}), 0)::float`,
        })
        .from(order_items)
        .innerJoin(orders, eq(order_items.order_id, orders.id))
        .innerJoin(
          product_variants,
          eq(order_items.product_variant_id, product_variants.id),
        )
        .where(baseFilter)
        .groupBy(
          product_variants.id,
          product_variants.variant_name,
          product_variants.sku,
        )
        .orderBy(desc(sql`SUM(${order_items.quantity})`))
        .limit(8);

      // ── 4. Category Revenue Breakdown ────────────────────────────────────────
      const categoryBreakdown = await this.db
        .select({
          name: categories.name,
          revenue: sql<number>`COALESCE(SUM(${order_items.price} * ${order_items.quantity}), 0)::float`,
          unitsSold: sql<number>`COALESCE(SUM(${order_items.quantity}), 0)::int`,
        })
        .from(order_items)
        .innerJoin(orders, eq(order_items.order_id, orders.id))
        .innerJoin(
          product_variants,
          eq(order_items.product_variant_id, product_variants.id),
        )
        .innerJoin(products, eq(product_variants.product_id, products.id))
        .innerJoin(categories, eq(products.category_id, categories.id))
        .where(baseFilter)
        .groupBy(categories.name)
        .orderBy(
          desc(sql`SUM(${order_items.price} * ${order_items.quantity})`),
        );

      // ── 5. Order Status Distribution ─────────────────────────────────────────
      const orderStatusBreakdown = await this.db
        .select({
          status: order_items.order_status,
          count: sql<number>`COUNT(DISTINCT ${order_items.order_id})::int`,
        })
        .from(order_items)
        .innerJoin(orders, eq(order_items.order_id, orders.id))
        .where(baseFilter)
        .groupBy(order_items.order_status);

      // ── 6. Top Promotions by Discount Given ─────────────────────────────────
      const topPromotions = await this.db
        .select({
          name: promotions.name,
          promotionType: promotions.promotion_type,
          timesUsed: sql<number>`COUNT(${promotion_usage.id})::int`,
          totalDiscount: sql<number>`COALESCE(SUM(${promotion_usage.discount_amount}), 0)::float`,
          status: promotions.status,
        })
        .from(promotion_usage)
        .innerJoin(promotions, eq(promotion_usage.promotion_id, promotions.id))
        .innerJoin(orders, eq(promotion_usage.order_id, orders.id))
        .where(and(eq(promotions.company_id, companyId), baseFilter))
        .groupBy(
          promotions.id,
          promotions.name,
          promotions.promotion_type,
          promotions.status,
        )
        .orderBy(desc(sql`SUM(${promotion_usage.discount_amount})`))
        .limit(5);

      // ── 7. Daily Revenue for the period (for sparkline / area chart) ─────────
      const dailyRevenue = await this.db
        .select({
          date: sql<string>`TO_CHAR(${orders.created_at}, 'YYYY-MM-DD')`,
          revenue: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)::float`,
          orderCount: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
        })
        .from(orders)
        .where(baseFilter)
        .groupBy(sql`TO_CHAR(${orders.created_at}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${orders.created_at}, 'YYYY-MM-DD')`);

      return {
        meta: {
          generatedAt: new Date().toISOString(),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        summary: {
          grossRevenue: salesStats.grossRevenue,
          totalOrders: salesStats.totalOrders,
          taxCollected: taxStats.taxCollected,
          refunds: refundStats.refunds,
          platformFees,
          netEarnings,
          avgOrderValue:
            salesStats.totalOrders > 0
              ? salesStats.grossRevenue / salesStats.totalOrders
              : 0,
        },
        monthlyTrend,
        dailyRevenue,
        topProducts,
        categoryBreakdown,
        orderStatusBreakdown,
        topPromotions,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        VendorsErrorKeyEnum.FAILED_TO_RETRIEVE_PDF_ANALYTICS_DATA,
        { cause: error },
      );
    }
  }
}
