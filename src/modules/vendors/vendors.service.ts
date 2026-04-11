import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import {
  address as addressTable,
  company as companyTable,
  gst_registrations,
  tax_profiles,
  tax_rates,
  tax_types,
  user as userTable,
  user_roles as user_rolesTable,
  vendor as vendorTable,
  vendor_document as vendor_documentTable,
} from 'src/drizzle/schema';
import { eq, or } from 'drizzle-orm';
import { UserRole, UserStatus } from 'src/drizzle/types/types';
import bcrypt from 'bcryptjs';
import express from 'express';
import { MailService } from 'src/common/services/mail/mail.service';
import { CreateVendorDto } from './dto/CreateVendorDto';
import { LoginDto } from '../users/dto/userAuth.dto.ts';
import { UploadToCloudService } from 'src/utils/upload-to-cloud/upload-to-cloud.service';
const SALT_ROUNDS = 10;
type UserType = typeof userTable.$inferSelect;
type VendorType = typeof vendorTable.$inferSelect;
type UserRoleType = typeof user_rolesTable.$inferSelect;
@Injectable()
export class VendorsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly uploadToCloudService: UploadToCloudService,
  ) {}
  async vendorRegister(
    vendorData: CreateVendorDto,
    files: Express.Multer.File[],
  ) {
    try {
      console.log('vendorData', vendorData);
      console.log('files', files);
      const docFiles = Array.isArray(files['documents'])
        ? files['documents']
        : [];
      const vendorDocuments: { secure_url: string; type: string }[] = [];
      const documentPromises = docFiles.map(
        async (file: Express.Multer.File) => {
          console.log('Received file:', file.originalname);
          return await this.uploadToCloudService.uploadDocument(
            file,
            file.originalname.split('__')[0],
          );
        },
      );
      const resolvedDocuments = await Promise.all(documentPromises);
      vendorDocuments.push(...resolvedDocuments);
      console.table(vendorDocuments);
      return await this.db.transaction(async (tx) => {
        const hashedPassword = await bcrypt.hash(
          vendorData.hash_password,
          SALT_ROUNDS,
        );

        const [vendorRole] = await tx
          .select({ id: user_rolesTable.id })
          .from(user_rolesTable)
          .where(eq(user_rolesTable.role_name, UserRole.VENDOR))
          .limit(1);
        if (!vendorRole) {
          throw new HttpException(
            'Vendor role not found in the database',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        const [newCompany] = await tx
          .insert(companyTable)
          .values({
            company_name: vendorData.store_name,
            company_domain: vendorData.company_domain,
            company_structure: vendorData.company_structure,
          })
          .returning({ id: companyTable.id });
        if (!newCompany || !newCompany.id) {
          throw new HttpException(
            'Failed to create company for vendor',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        const [newUser] = await tx
          .insert(userTable)
          .values({
            first_name: vendorData.first_name,
            last_name: vendorData.last_name,
            email: vendorData.email,
            country_code: vendorData.country_code,
            phone_number: vendorData.phone_number,
            password_hash: hashedPassword,
            role_id: vendorRole.id,
            company_id: newCompany.id,
          })
          .returning({ id: userTable.id, email: userTable.email });
        console.log(newUser);
        if (!newUser || !newUser.id) {
          throw new HttpException(
            'Failed to create user for vendor',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        const [newVendor] = await tx
          .insert(vendorTable)
          .values({
            store_owner_first_name: vendorData.first_name,
            store_owner_last_name: vendorData.last_name,
            store_name: vendorData.store_name,
            store_description: vendorData.store_description ?? '',
            category: vendorData.category,
            user_id: newUser.id,
            company_id: newCompany.id,
          })
          .returning({ id: vendorTable.id });
        if (!newVendor || !newVendor.id) {
          throw new HttpException(
            'Failed to create vendor record',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        for (const doc of vendorDocuments) {
          await tx.insert(vendor_documentTable).values({
            document_url: doc.secure_url,
            document_type: doc.type,
            vendor_id: newVendor.id,
          });
        }
        // this.mailService.sendEmail(
        //   newUser.email,
        //   'Vendor Registration Received',
        //   `<p>Thank you for registering as a vendor on our marketplace. Your application is currently under review, and we will notify you once it has been approved.</p>`,
        // );
        return;
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to register vendor', {
        cause: error,
      });
    }
  }
  async vendorLogin(loginDto: LoginDto, res: express.Response) {
    console.log(loginDto);
    try {
      const existingUser:
        | {
            user: Partial<UserType>;
            vendor: Partial<VendorType>;
            role: Partial<UserRoleType>;
          }
        | HttpException = await this.db.transaction(async (tx) => {
        if (!loginDto.email || !loginDto.password) {
          throw new HttpException(
            'Email and password are required',
            HttpStatus.BAD_REQUEST,
          );
        }
        const [userRecord]: Partial<UserType>[] = await tx
          .select()
          .from(userTable)
          .where(eq(userTable.email, loginDto.email));
        console.log('user.email', loginDto.email, 'userRecord', userRecord);
        if (!userRecord || !userRecord.id || !userRecord.password_hash) {
          throw new UnauthorizedException('User not found');
        }
        console.log(loginDto.password, 'password', userRecord.password_hash);
        const isPasswordValid = await bcrypt.compare(
          loginDto.password,
          userRecord.password_hash,
        );
        if (!isPasswordValid) {
          console.log('isPasswordValid', isPasswordValid);
          throw new UnauthorizedException('Invalid password');
        }
        const [vendorRecord]: Partial<VendorType>[] = await tx
          .select()
          .from(vendorTable)
          .where(eq(vendorTable.user_id, userRecord.id));
        console.log('vendorRecord', vendorRecord);
        if (!userRecord.role_id) {
          throw new UnauthorizedException('User role not found');
        }
        const [roleRecord]: Partial<UserRoleType>[] = await tx
          .select({ role_name: user_rolesTable.role_name })
          .from(user_rolesTable)
          .where(eq(user_rolesTable.id, userRecord.role_id));
        console.log('roleRecord', roleRecord);
        if (!vendorRecord) throw new UnauthorizedException('Vendor not found');
        const isVendorApproved =
          vendorRecord.vendor_status === UserStatus.ACTIVE;
        console.log('isVendorApproved', isVendorApproved);
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
      console.log('user', user);
      console.log('vendor', vendor);
      console.log('role', role);
      const payload: {
        sub: string | undefined;
        email: string | undefined;
      } = { sub: user.id, email: user.email };

      const accessToken = await this.jwtService.signAsync(payload, {
        expiresIn: '30d',
        secret: process.env.JWT_SECRET,
      });
      console.log('accessToken', accessToken);
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
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
      };
      const response = {
        user: responseData,
        token: accessToken,
        password_hash: undefined,
      };
      console.log('response', response);
      return response;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof UnauthorizedException
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
      const [vendorRecord] = await this.db
        .select()
        .from(vendorTable)
        .innerJoin(userTable, eq(vendorTable.user_id, userTable.id))
        .where(eq(userTable.email, email))
        .limit(1);
      if (!vendorRecord) {
        return new UnauthorizedException('Vendor not found');
      }
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
      await this.db
        .update(vendorTable)
        .set({ vendor_status: UserStatus.ACTIVE })
        .where(eq(vendorTable.id, vendorId))
        .catch((error) => {
          console.error('Database update error:', error);
          throw new InternalServerErrorException(
            'Failed to update vendor status in database',
            {
              cause: error,
            },
          );
        });
      const [vendorUser] = await this.db
        .select({ email: userTable.email })
        .from(vendorTable)
        .innerJoin(userTable, eq(vendorTable.user_id, userTable.id))
        .where(eq(vendorTable.id, vendorId))
        .limit(1);

      this.mailService.sendEmail(
        vendorUser.email,
        'Vendor Account Approved',
        `<p>Congratulations! Your vendor account has been approved. You can now log in and start managing your store.</p>`,
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
      const vendorUser = await this.db.transaction(async (tx) => {
        const [vendorUser] = await tx
          .select({ email: userTable.email })
          .from(vendorTable)
          .innerJoin(userTable, eq(vendorTable.user_id, userTable.id))
          .where(eq(vendorTable.id, vendorId))
          .limit(1);
        if (!vendorUser) {
          return {
            success: false,
            message: `Vendor with ID ${vendorId} not found or has no linked user.`,
            status: HttpStatus.NOT_FOUND,
          };
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
      const [vendorRow] = await this.db
        .select({ user_id: vendorTable.user_id })
        .from(vendorTable)
        .where(eq(vendorTable.id, vendorId))
        .limit(1);
      if (!vendorRow || !vendorRow.user_id) {
        throw new UnauthorizedException('Vendor not found');
      }
      const deleteUserResult = await this.db
        .delete(userTable)
        .where(eq(userTable.id, vendorRow.user_id));

      return;
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
  async completeVendorProfile(vendorId: string, data: any) {
    if (
      !data.addressData &&
      !data.gstData &&
      !data.taxProfileData &&
      !data.tax_typeData &&
      !data.tax_ratesData
    ) {
      throw new InternalServerErrorException('No data provided for update', {
        cause: 'vendor profile update failed',
      });
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [vendorRecord] = await tx
          .select()
          .from(vendorTable)
          .where(eq(vendorTable.id, vendorId))
          .limit(1);
        if (!vendorRecord.company_id) {
          return {
            success: false,
            message: `Vendor with ID ${vendorId} does not have an associated company.`,
            status: HttpStatus.UNAUTHORIZED,
          };
        }
        await tx.insert(gst_registrations).values({
          ...data.gstData,
          company_id: vendorRecord.company_id,
        });

        const [taxProfileResult] = await tx
          .insert(tax_profiles)
          .values({
            ...data.taxProfileData,
            company_id: vendorRecord.company_id,
          })
          .returning({ id: tax_profiles.id });
        await tx.insert(tax_types).values({
          ...data.tax_typeData,
          company_id: vendorRecord.company_id,
          tax_profile_id: taxProfileResult.id,
        });
        if (!taxProfileResult.id) {
          return {
            success: false,
            message: 'Failed to create tax profile',
            status: HttpStatus.INTERNAL_SERVER_ERROR,
          };
        }
        await tx.insert(tax_rates).values({
          ...data.tax_ratesData,
          company_id: vendorRecord.company_id,
          tax_type_id: taxProfileResult.id,
        });
        if (!vendorRecord.user_id) {
          return {
            success: false,
            message: `Vendor with ID ${vendorId} not found.`,
            status: HttpStatus.NOT_FOUND,
          };
        }
        await tx.insert(addressTable).values({
          ...data.addressData,
          user_id: vendorRecord.user_id,
        });
        return;
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to complete vendor profile',
        {
          cause: error,
        },
      );
    }
  }
  async vendorApplications() {
    try {
      const applications = await this.db
        .select()
        .from(vendorTable)
        .innerJoin(userTable, eq(vendorTable.user_id, userTable.id))
        .innerJoin(companyTable, eq(vendorTable.company_id, companyTable.id))
        .where(
          or(
            eq(vendorTable.vendor_status, UserStatus.PENDING),
            eq(vendorTable.is_verified, false),
          ),
        );
      if (!applications) {
        throw new HttpException(
          'No vendor applications found',
          HttpStatus.NOT_FOUND,
        );
      }
      console.log(applications);
      return applications;
    } catch (error) {
      if (error instanceof HttpException) {
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
      console.log('vendorId', vendorId, 'status', status);
      const [existingVendor] = await this.db
        .select()
        .from(vendorTable)
        .where(eq(vendorTable.id, vendorId))
        .limit(1);
      const vendorUser = await this.db.select().from(vendorTable);
      console.table(vendorUser);
      console.log('existingVendor', existingVendor);
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
      throw new InternalServerErrorException('Failed to update vendor status', {
        cause: error,
      });
    }
  }
  async getAllVendors() {
    try {
      const vendors = await this.db.select().from(vendorTable);
      return vendors;
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve vendors', {
        cause: error,
      });
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
        'Failed to retrieve unverified vendors',
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
          'No verified vendors found',
          HttpStatus.NOT_FOUND,
        );
      }
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
        return {
          message: 'Vendor not found',
          status: 404,
        };
      }
      return existingVendor;
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve vendor', {
        cause: error,
      });
    }
  }
}
