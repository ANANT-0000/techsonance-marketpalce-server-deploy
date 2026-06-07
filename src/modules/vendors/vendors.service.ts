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
      console.log(
        '[VendorsService.vendorRegister] Request received for vendor: ',
        vendorData.email,
      );
      const docFiles = Array.isArray(files['documents'])
        ? files['documents']
        : [];
      console.log(
        `[VendorsService.vendorRegister] Processing ${docFiles.length} document(s)`,
      );
      const documentPromises = docFiles.map(
        async (file: Express.Multer.File) => {
          console.log(
            `[VendorsService.vendorRegister] Uploading document: ${file.originalname}`,
          );
          return await this.uploadToCloudService
            .uploadDocument(file, file.originalname.split('__')[0])
            .catch((error) => {
              console.error(
                `Error uploading document ${file.originalname}:`,
                error,
              );
              throw new InternalServerErrorException(
                `Failed to upload document ${file.originalname}`,
                { cause: error },
              );
            });
        },
      );
      const resolvedDocuments = await Promise.all(documentPromises);
      vendorDocuments.push(...resolvedDocuments);
      console.log(
        '[VendorsService.vendorRegister] All documents uploaded successfully',
      );
      console.log(
        '[VendorsService.vendorRegister] Checking email and company domain uniqueness',
      );
      const companyDomainToCheck = formatCompanyDomain(vendorData.company_domain);
      const [existingEmail] = await this.db
        .select({ id: userTable.id })
        .from(userTable)
        .where(eq(userTable.email, vendorData.email))
        .limit(1);
      if (existingEmail) {
        throw new HttpException('Email already in use. Please use a different email or login.', HttpStatus.CONFLICT);
      }
      const [existingDomain] = await this.db
        .select({ id: companyTable.id })
        .from(companyTable)
        .where(eq(companyTable.company_domain, companyDomainToCheck))
        .limit(1);
      if (existingDomain) {
        throw new HttpException('Company domain already registered. Please choose a different domain.', HttpStatus.CONFLICT);
      }

      console.log(
        '[VendorsService.vendorRegister] Starting database transaction for vendor registration',
      );
      const result = await this.db.transaction(async (tx) => {
        console.log(
          '[VendorsService.vendorRegister] Database transaction started',
        );
        const password = randomBytes(9).toString('base64').slice(0, 12);
        const hashedPassword = await bcrypt
          .hash(password, SALT_ROUNDS)
          .catch((error) => {
            console.error(
              '[VendorsService.vendorRegister] Error hashing password:',
              error,
            );
            throw new InternalServerErrorException('Failed to hash password', {
              cause: error,
            });
          });
        console.log(
          '[VendorsService.vendorRegister] Password hashed successfully',
        );
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
            console.error('Error creating vendor role:', error);
            throw new InternalServerErrorException(
              'Failed to create vendor role',
              {
                cause: error,
              },
            );
          });

        console.log('[VendorsService.vendorRegister] Creating company record');
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
            console.error(
              '[VendorsService.vendorRegister] Error creating company:',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to create company for vendor',
              {
                cause: error,
              },
            );
          });
        console.log(
          `[VendorsService.vendorRegister] Company created with ID: ${newCompany?.id}`,
        );
        if (!newCompany || !newCompany.id) {
          throw new HttpException(
            'Failed to create company for vendor',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        console.log(
          '[VendorsService.vendorRegister] Creating vendor admin user',
        );
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
            console.error(
              '[VendorsService.vendorRegister] Error creating user:',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to create user for vendor',
              {
                cause: error,
              },
            );
          });
        console.log(
          '[VendorsService.vendorRegister] User created, linking to company',
        );
        await tx
          .insert(user_and_company)
          .values({
            user_id: newUser.id,
            company_id: newCompany.id,
            access_status: AccessStatus.PENDING,
            role_id: newRole.id,
          })
          .catch((error) => {
            console.error(
              '[VendorsService.vendorRegister] Error creating user-company association:',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to create user_and_company for vendor',
              {
                cause: error,
              },
            );
          });
        console.log(
          `[VendorsService.vendorRegister] User-company association created for user: ${newUser?.id}`,
        );
        if (!newUser || !newUser.id) {
          throw new HttpException(
            'Failed to create user for vendor',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        console.log('[VendorsService.vendorRegister] Creating vendor record');
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
            console.error(
              '[VendorsService.vendorRegister] Error creating vendor:',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to create vendor record',
              {
                cause: error,
              },
            );
          });
        console.log(
          `[VendorsService.vendorRegister] Vendor record created with ID: ${newVendor?.id}`,
        );
        if (!newVendor || !newVendor.id) {
          throw new HttpException(
            'Failed to create vendor record',
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
              console.error('Error inserting vendor document record:', error);
              throw new InternalServerErrorException(
                'Failed to insert vendor document',
                { cause: error },
              );
            });

          if (insertedDoc) insertedDocs.push(insertedDoc);
        }

        console.log(
          '[VendorsService.vendorRegister] Vendor documents inserted successfully',
        );

        // Build a lookup map: document_type -> document_id
        const docTypeToIdMap = new Map(
          insertedDocs.map((doc) => [doc.document_type, doc.id]),
        );
        const date = new Date(); // current date,

        date.setFullYear(date.getFullYear() + 2);
        console.log('date', date);

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
              console.error('Error inserting company compliance:', error);
              throw new InternalServerErrorException(
                'Failed to insert company compliance',
                { cause: error },
              );
            });
        }

        console.log(
          '[VendorsService.vendorRegister] Company compliance records inserted',
        );

        return {
          vendorMail: newUser.email,
          randomPassword: password,
          vendorCompany_name: vendorData.company_name,
          message: 'Vendor registered successfully',
        };
      });

      try {
        console.log(
          '[VendorsService.vendorRegister] Transaction completed, sending registration email',
        );
        await this.mailService
          .sendVendorRegistrationEmail(
            result.vendorMail,
            result.vendorCompany_name,
            result.randomPassword,
          )
          .catch((error) => {
            console.error(
              '[VendorsService.vendorRegister] Error sending registration email:',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to send registration email',
              {
                cause: error,
              },
            );
          });
        console.log(
          '[VendorsService.vendorRegister] Registration email sent successfully',
        );
      } catch (emailError) {
        console.error(
          '[VendorsService.vendorRegister] Failed to send welcome email, but vendor is registered:',
          emailError,
        );
      }
      console.log(
        '[VendorsService.vendorRegister] Vendor registration process completed successfully',
      );
      return {
        message: 'Vendor registered successfully',
      };
    } catch (error) {
      for (const file of vendorDocuments) {
        console.log(file);
        const publicId = extractCloudinaryPublicId(file.secure_url);
        if (publicId) {
          this.uploadToCloudService
            .deleteFile(publicId, file.resource_type)
            .catch((deleteError) => {
              console.error(
                '[VendorsService.vendorRegister] Error deleting uploaded documents after failure:',
                deleteError,
              );
            });
        }
      }
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to register vendor', {
        cause: error,
      });
    }
  }
  async vendorLogin(loginDto: LoginDto) {
    console.log(
      `[VendorsService.vendorLogin] Login request received for email: ${loginDto.email}`,
    );
    try {
      const existingUser:
        | {
            user: Partial<UserType>;
            vendor: Partial<VendorType>;
            role: Partial<UserRoleType>;
          }
        | HttpException = await this.db.transaction(async (tx) => {
        console.log(
          '[VendorsService.vendorLogin] Starting database transaction for authentication',
        );
        if (!loginDto.email || !loginDto.password) {
          throw new HttpException(
            'Email and password are required',
            HttpStatus.BAD_REQUEST,
          );
        }
        console.log('[VendorsService.vendorLogin] Querying user by email');
        const [userRecord]: Partial<UserType>[] = await tx
          .select()
          .from(userTable)
          .where(eq(userTable.email, loginDto.email));
        if (!userRecord || !userRecord.id || !userRecord.password_hash) {
          throw new UnauthorizedException('User not found');
        }
        console.log('[VendorsService.vendorLogin] Validating password');
        const isPasswordValid = await bcrypt.compare(
          loginDto.password,
          userRecord.password_hash,
        );
        if (!isPasswordValid) {
          throw new UnauthorizedException('Invalid password');
        }
        console.log(
          '[VendorsService.vendorLogin] Password validated, querying vendor record',
        );
        const [vendorRecord] = await tx
          .select()
          .from(vendorTable)
          .where(eq(vendorTable.user_id, userRecord.id));
        // uncommit in future
        // const [userAndCompanyRecord] = await tx
        //   .select()
        //   .from(user_and_company)
        //   .where(eq(user_and_company.user_id, userRecord.id));
        // console.log('vendorRecord', vendorRecord);
        if (!userRecord) {
          throw new UnauthorizedException('User role not found');
        }
        // console.log('userAndCompanyRecord', userAndCompanyRecord)
        //------------------------------------------------------
        // uncommit in future
        //------------------------------------------------------
        // const [roleRecord] = await tx
        //   .select({ role_name: user_rolesTable.role_name })
        //   .from(user_rolesTable)
        //   .where(eq(user_rolesTable.id, userAndCompanyRecord.role_id)).limit(1);

        //-----------------------------------------------------
        // for bypassing the role check in future comment this and uncommit above
        //-----------------------------------------------------
        console.log('[VendorsService.vendorLogin] Fetching vendor role');
        const [roleRecord] = await tx
          .select({ role_name: user_rolesTable.role_name })
          .from(user_rolesTable)
          .where(eq(user_rolesTable.role_name, 'vendor'))
          .limit(1);
        if (!vendorRecord) throw new UnauthorizedException('Vendor not found');
        console.log(
          '[VendorsService.vendorLogin] Checking vendor approval status',
        );
        const isVendorApproved =
          vendorRecord.vendor_status === UserStatus.ACTIVE;
        // const isVendorApproved = vendorRecord.vendor_status === UserStatus.ACTIVE &&  userAndCompanyRecord.access_status === AccessStatus.ACTIVE;
        if (!isVendorApproved)
          throw new HttpException(
            'Vendor application is still under review',
            HttpStatus.UNAUTHORIZED,
          );
        return { user: userRecord, vendor: vendorRecord, role: roleRecord };
      });
      if (existingUser instanceof HttpException) {
        throw existingUser;
      }

      const user = existingUser?.user;
      const vendor = existingUser?.vendor;
      const role = existingUser?.role;
      console.log(
        '[VendorsService.vendorLogin] Transaction completed, generating JWT tokens',
      );
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

      console.log('[VendorsService.vendorLogin] Signing access token');
      const accessToken = await this.jwtService.signAsync(payload, {
        expiresIn: '1h',
        secret: process.env.JWT_SECRET,
      });
      console.log('[VendorsService.vendorLogin] Signing refresh token');
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
      console.log(
        '[VendorsService.vendorLogin] Login successful, returning response',
      );
      return response;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to Login vendor', {
        cause: error,
      });
    }
  }
  async findVendorByEmail(email: string) {
    try {
      console.log(
        `[VendorsService.findVendorByEmail] Querying vendor by email: ${email}`,
      );
      const [vendorRecord] = await this.db
        .select()
        .from(vendorTable)
        .innerJoin(userTable, eq(vendorTable.user_id, userTable.id))
        .where(eq(userTable.email, email))
        .limit(1);
      if (!vendorRecord) {
        console.log(
          `[VendorsService.findVendorByEmail] Vendor not found for email: ${email}`,
        );
        return new UnauthorizedException('Vendor not found');
      }
      console.log(
        `[VendorsService.findVendorByEmail] Vendor found with ID: ${vendorRecord.vendor?.id}`,
      );
      return vendorRecord;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to find vendor by email', {
        cause: error,
      });
    }
  }
  async approveVendor(vendorId: string) {
    try {
      console.log(
        `[VendorsService.approveVendor] Request to approve vendor: ${vendorId}`,
      );
      console.log('[VendorsService.approveVendor] Querying vendor details');
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
        console.log(
          `[VendorsService.approveVendor] Vendor not found: ${vendorId}`,
        );
        return new UnauthorizedException('Vendor not found');
      }
      console.log(
        '[VendorsService.approveVendor] Updating vendor status to ACTIVE',
      );
      await this.db
        .update(vendorTable)
        .set({ vendor_status: UserStatus.ACTIVE })
        .where(eq(vendorTable.id, vendorId))
        .catch((error) => {
          console.error(
            '[VendorsService.approveVendor] Database update error:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to update vendor status in database',
            {
              cause: error,
            },
          );
        });

      console.log(
        '[VendorsService.approveVendor] Updating user-company access status to ACTIVE',
      );
      const [updatedUserAndCompany] = await this.db
        .update(user_and_company)
        .set({ access_status: AccessStatus.ACTIVE })
        .where(eq(user_and_company.user_id, isVendorExists.user_id))
        .returning({ company_id: user_and_company.company_id });
      console.log('[VendorsService.approveVendor] Fetching company details');
      const [companyDetails] = await this.db
        .select({ company_name: company.company_name })
        .from(company)
        .where(eq(company.id, updatedUserAndCompany.company_id))
        .limit(1);

      console.log(
        `[VendorsService.approveVendor] Activating trial subscription for company: ${updatedUserAndCompany.company_id}`,
      );
      await this.subscriptionService.startTrial(
        updatedUserAndCompany.company_id,
      );

      console.log('[VendorsService.approveVendor] Sending approval email');
      await this.mailService.sendVendorApprovalEmail(
        isVendorExists.email,
        companyDetails.company_name,
      );
      console.log(
        '[VendorsService.approveVendor] Vendor approval process completed',
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
      throw new InternalServerErrorException('Failed to approve vendor', {
        cause: error,
      });
    }
  }
  async rejectVendor(vendorId: string) {
    try {
      console.log(
        `[VendorsService.rejectVendor] Request to reject vendor: ${vendorId}`,
      );
      const vendorUser = await this.db.transaction(async (tx) => {
        console.log(
          '[VendorsService.rejectVendor] Starting database transaction',
        );
        console.log(
          '[VendorsService.rejectVendor] Querying vendor user details',
        );
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
        console.log(
          '[VendorsService.rejectVendor] Updating vendor status to REJECTED',
        );
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
      console.log('[VendorsService.rejectVendor] Sending rejection email');
      await this.mailService.sendEmail(
        vendorUser.email,
        'Vendor Account Rejected',
        `<p>We regret to inform you that your vendor account has been rejected...</p>`,
      );
      console.log(
        '[VendorsService.rejectVendor] Vendor rejection process completed',
      );
      return {
        message: 'Vendor rejected and notification email sent successfully',
      };
    } catch (error) {
      console.error('RejectVendor Error:', error);
      if (
        error instanceof HttpException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to reject vendor', {
        cause: error,
      });
    }
  }
  async removeVendor(vendorId: string) {
    try {
      console.log(
        `[VendorsService.removeVendor] Request to remove vendor: ${vendorId}`,
      );
      console.log('[VendorsService.removeVendor] Querying vendor record');
      const [vendorRow] = await this.db
        .select({ user_id: vendorTable.user_id })
        .from(vendorTable)
        .where(eq(vendorTable.id, vendorId))
        .limit(1);
      if (!vendorRow || !vendorRow.user_id) {
        throw new UnauthorizedException('Vendor not found');
      }
      console.log(
        '[VendorsService.removeVendor] Deleting user and associated vendor record',
      );
      const deleteUserResult = await this.db
        .delete(userTable)
        .where(eq(userTable.id, vendorRow.user_id));
      console.log('[VendorsService.removeVendor] Vendor removal completed');
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
      throw new InternalServerErrorException('Failed to remove vendor', {
        cause: error,
      });
    }
  }
  async suspendedVendor(vendorId: string) {
    try {
      console.log(
        `[VendorsService.suspendedVendor] Request to suspend vendor: ${vendorId}`,
      );
      const suspendedVendor = await this.db.transaction(async (tx) => {
        console.log(
          '[VendorsService.suspendedVendor] Starting database transaction',
        );
        console.log('[VendorsService.suspendedVendor] Querying vendor details');
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
        console.log(
          '[VendorsService.suspendedVendor] Updating vendor status to SUSPENDED',
        );
        await tx
          .update(vendorTable)
          .set({ vendor_status: UserStatus.SUSPENDED })
          .where(eq(vendorTable.id, vendorId));
        console.log(
          '[VendorsService.suspendedVendor] Updating user status to SUSPENDED',
        );
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
      console.log(
        '[VendorsService.suspendedVendor] Vendor suspension completed',
      );
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
      throw new InternalServerErrorException('Failed to suspend vendor', {
        cause: error,
      });
    }
  }

  async vendorApplicationCount() {
    try {
      console.log(
        '[VendorsService.vendorApplicationCount] Querying pending vendor applications count',
      );
      const count = await this.db
        .select()
        .from(vendor)
        .innerJoin(company, eq(vendor.company_id, company.id))
        .where(eq(vendor.vendor_status, UserStatus.PENDING))
        .catch((error) => {
          console.error(
            '[VendorsService.vendorApplicationCount] Error counting vendor applications:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to count vendor applications',
            {
              cause: error,
            },
          );
        });
      console.log(
        `[VendorsService.vendorApplicationCount] Found ${count.length} pending vendor applications`,
      );
      return { count: count.length };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to count vendor applications',
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
      console.log(
        '[VendorsService.vendorApplications] Fetching all pending vendor applications',
      );
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
          console.log(
            `[VendorsService.vendorApplications] Successfully retrieved ${results.length} applications`,
          );
          return results;
        })
        .catch((error) => {
          console.error(
            '[VendorsService.vendorApplications] Error fetching vendor applications:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to retrieve vendor applications',
            {
              cause: error,
            },
          );
        });
      console.log(
        `[VendorsService.vendorApplications] Retrieved ${applications.length} pending applications`,
      );
      return applications;
    } catch (error) {
      console.log(`[VendorsService.vendorApplications] `, error);
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to retrieve vendor applications',
        {
          cause: error,
        },
      );
    }
  }
  async updateVendorStatus(vendorId: string, status: UserStatus) {
    try {
      console.log(
        `[VendorsService.updateVendorStatus] Request to update vendor: ${vendorId} to status: ${status}`,
      );
      console.log('[VendorsService.updateVendorStatus] Querying vendor record');
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
      console.log(
        `[VendorsService.updateVendorStatus] Updating vendor status to: ${status}`,
      );
      await this.db
        .update(vendorTable)
        .set({ vendor_status: status })
        .where(eq(vendorTable.id, vendorId));
      console.log(
        '[VendorsService.updateVendorStatus] Vendor status updated successfully',
      );
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
      throw new InternalServerErrorException('Failed to update vendor status', {
        cause: error,
      });
    }
  }
  async getAllVendors(
    offset?: string,
    limit?: string,
    status?: string,
    sort?: string,
  ) {
    try {
      console.log(
        `[VendorsService.getAllVendors] Request received with offset: ${offset}, limit: ${limit}, status: ${status}, sort: ${sort}`,
      );
      const offsetClause = offset ? Number(offset) : 0;
      const limitClause = limit ? Number(limit) : 10;
      const statusClause = status
        ? eq(vendorTable.vendor_status, status as UserStatus)
        : undefined;
      const sortClause =
        sort === 'desc'
          ? desc(vendorTable.created_at)
          : asc(vendorTable.created_at);
      console.log(
        '[VendorsService.getAllVendors] Querying vendors from database',
      );
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
      console.log(
        `[VendorsService.getAllVendors] Retrieved ${vendors.length} vendors`,
      );
      return vendors;
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve vendors', {
        cause: error,
      });
    }
  }
  async getUnverifiedVendors() {
    try {
      console.log(
        '[VendorsService.getUnverifiedVendors] Querying unverified vendors',
      );
      const vendors = await this.db
        .select()
        .from(vendorTable)
        .where(eq(vendorTable.is_verified, false));
      console.log(
        `[VendorsService.getUnverifiedVendors] Retrieved ${vendors.length} unverified vendors`,
      );
      return vendors;
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to retrieve unverified vendors',
        {
          cause: error,
        },
      );
    }
  }
  async getVerifiedVendors() {
    try {
      console.log(
        '[VendorsService.getVerifiedVendors] Querying verified vendors',
      );
      const vendors = await this.db
        .select()
        .from(vendorTable)
        .where(eq(vendorTable.is_verified, true));
      if (!vendors) {
        throw new HttpException(
          'No verified vendors found',
          HttpStatus.NOT_FOUND,
        );
      }
      console.log(
        `[VendorsService.getVerifiedVendors] Retrieved ${vendors.length} verified vendors`,
      );
      return vendors;
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to retrieve verified vendors',
        {
          cause: error,
        },
      );
    }
  }
  async getVendorById(vendorId: string) {
    try {
      console.log(
        `[VendorsService.getVendorById] Querying vendor details for ID: ${vendorId}`,
      );
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
        console.log(
          `[VendorsService.getVendorById] Vendor not found: ${vendorId}`,
        );
        throw new UnauthorizedException('Vendor not found');
      }
      console.log(`[VendorsService.getVendorById] Vendor found and returned`);
      return existingVendor;
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve vendor', {
        cause: error,
      });
    }
  }
  async getVendorDetails(vendorId: string) {
    try {
      console.log(
        `[VendorsService.getVendorDetails] Fetching detailed vendor information for ID: ${vendorId}`,
      );
      console.log('[VendorsService.getVendorDetails] Querying customer role');
      const [roleRecord] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.CUSTOMER))
        .limit(1);
      console.log(
        '[VendorsService.getVendorDetails] Fetching vendor with related company and user data',
      );
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
          console.log(
            '[VendorsService.getVendorDetails] Vendor details retrieved successfully',
          );
          return res;
        })
        .catch((error) => {
          console.error(
            '[VendorsService.getVendorDetails] Error fetching vendor details:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to retrieve vendor details',
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
        throw new HttpException('Vendor not found', HttpStatus.NOT_FOUND);
      }
      console.log(
        '[VendorsService.getVendorDetails] Calculating order statistics for vendor',
      );
      const [orderStats] = await this.db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)`,
          totalOrders: sql<number>`COUNT(${orders.id})`,
        })
        .from(orders)
        .where(eq(orders.company_id, vendorDetails.company_id));
      console.log(
        '[VendorsService.getVendorDetails] Counting active products for vendor',
      );
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
      console.log(
        '[VendorsService.getVendorDetails] Building comprehensive vendor response with statistics',
      );
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
      throw new InternalServerErrorException('Failed to retrieve vendor', {
        cause: error,
      });
    }
  }
  async createRegistrationAddress(
    domain: string,
    addressData: CreateAddressDto,
  ) {
    console.log(
      `[VendorsService.createRegistrationAddress] Creating address for domain: ${domain}`,
    );
    console.log(
      '[VendorsService.createRegistrationAddress] Extracting and resolving company ID',
    );
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    try {
      console.log(
        `[VendorsService.createRegistrationAddress] Company ID resolved: ${companyId}`,
      );
      const payload = {
        company_id: companyId,
        name: addressData.name,
        number: addressData.phone,
        address_type: AddressType.BUSINESS,
        address_line_1: addressData.address_line_1,
        address_line_2: addressData.address_line_2,
        street: addressData.street,
        city: addressData.city,
        state: addressData.state,
        postal_code: addressData.postal_code,
        country: addressData.country,
        landmark: addressData.landmark,
        is_default: addressData.is_default,
      };
      console.log(
        '[VendorsService.createRegistrationAddress] Inserting address record into database',
      );
      const [createdAddress] = await this.db
        .insert(addressTable)
        .values(payload)
        .returning({ id: addressTable.id })
        .catch((error) => {
          console.error(
            '[VendorsService.createRegistrationAddress] Error creating registration address:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to create registration address',
            {
              cause: error,
            },
          );
        });

      if (!createdAddress || !createdAddress.id) {
        throw new HttpException(
          'Failed to create registration address',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      console.log(
        `[VendorsService.createRegistrationAddress] Address created with ID: ${createdAddress?.id}`,
      );
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
        'Failed to create registration address',
        {
          cause: error,
        },
      );
    }
  }
  async getCompanyAddresses(domain: string) {
    console.log(
      `[VendorsService.getCompanyAddresses] Fetching addresses for domain: ${domain}`,
    );
    console.log(
      '[VendorsService.getCompanyAddresses] Extracting and resolving company ID',
    );
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    try {
      console.log(
        `[VendorsService.getCompanyAddresses] Querying addresses for company ID: ${companyId}`,
      );
      const addresses = await this.db
        .select()
        .from(addressTable)
        .where(eq(addressTable.company_id, companyId))
        .catch((error) => {
          console.error(
            '[VendorsService.getCompanyAddresses] Error retrieving company addresses:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to retrieve company addresses',
            {
              cause: error,
            },
          );
        });
      console.log(
        `[VendorsService.getCompanyAddresses] Retrieved ${addresses.length} addresses for company`,
      );
      return addresses;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to retrieve company addresses',
        {
          cause: error,
        },
      );
    }
  }

  async getAnalyticsData(domain: string, start?: string, end?: string) {
    try {
      console.log(
        `[VendorsService.getAnalyticsData] Fetching analytics data for domain: ${domain}`,
      );
      // 1. Resolve Company ID from Domain
      console.log(
        '[VendorsService.getAnalyticsData] Resolving company ID from domain',
      );
      const filteredDomain = domainExtractor(domain);
      const companyId = await this.companyService.find(filteredDomain);

      if (!companyId) {
        throw new UnauthorizedException(
          'Company not found for the provided domain',
        );
      }
      console.log(
        `[VendorsService.getAnalyticsData] Company ID resolved: ${companyId}`,
      );

      // 2. Parse Dates (Default to last 30 days if not provided)
      console.log(
        `[VendorsService.getAnalyticsData] Parsing date range - start: ${start}, end: ${end}`,
      );
      const startDate = start
        ? new Date(start)
        : new Date(new Date().setDate(new Date().getDate() - 30));
      const endDate = end ? new Date(end) : new Date();
      console.log(
        `[VendorsService.getAnalyticsData] Date range set: ${startDate} to ${endDate}`,
      );

      const baseFilter = and(
        eq(orders.company_id, companyId),
        gte(orders.created_at, startDate),
        lte(orders.created_at, endDate),
      );

      // 3A. Gross Revenue & Orders
      console.log(
        '[VendorsService.getAnalyticsData] Calculating gross revenue and total orders',
      );
      const [salesStats] = await this.db
        .select({
          grossRevenue: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)::float`,
          totalOrders: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
        })
        .from(orders)
        .where(baseFilter);

      // 3B. Tax Collected
      console.log(
        '[VendorsService.getAnalyticsData] Calculating tax collected',
      );
      const [taxStats] = await this.db
        .select({
          taxCollected: sql<number>`COALESCE(SUM(${gst_invoices.total_tax}), 0)::float`,
        })
        .from(gst_invoices)
        .innerJoin(orders, eq(gst_invoices.order_id, orders.id))
        .where(baseFilter);

      // 3C. Refunds
      console.log(
        '[VendorsService.getAnalyticsData] Calculating total refunds',
      );
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
      console.log(
        '[VendorsService.getAnalyticsData] Calculating monthly revenue trend',
      );
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
      console.log(
        '[VendorsService.getAnalyticsData] Fetching top selling products',
      );
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
      console.log(
        '[VendorsService.getAnalyticsData] Calculating category performance metrics',
      );
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

      console.log(
        '[VendorsService.getAnalyticsData] All analytics data calculated successfully, building response',
      );
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
      console.error(
        '[VendorsService.getAnalyticsData] Error retrieving vendor analytics data:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve vendor analytics data',
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
      console.log(
        `[VendorsService.getAnalyticsPdfData] Fetching PDF analytics data for domain: ${domain}`,
      );

      const filteredDomain = domainExtractor(domain);
      const companyId = await this.companyService.find(filteredDomain);

      if (!companyId) {
        throw new UnauthorizedException(
          'Company not found for the provided domain',
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
        .groupBy(product_variants.id, product_variants.variant_name, product_variants.sku)
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
        .orderBy(desc(sql`SUM(${order_items.price} * ${order_items.quantity})`));

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

      console.log(
        '[VendorsService.getAnalyticsPdfData] All PDF analytics data compiled successfully',
      );

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
      console.error(
        '[VendorsService.getAnalyticsPdfData] Error:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve PDF analytics data',
        { cause: error },
      );
    }
  }
}
