import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import {
  address,
  gst_registrations,
  tax_profiles,
  tax_rates,
  tax_types,
  user,
  user_roles,
  vendor,
  vendor_document,
} from 'src/drizzle/schema';
import { eq, or } from 'drizzle-orm';
import { UserRole, UserStatus } from 'src/drizzle/types/types';
import bcrypt from 'bcryptjs';
import express from 'express';
import { MailService } from 'src/common/services/mail/mail.service';
import { CreateVendorDto } from './dto/CreateVendorDto';
@Injectable()
export class VendorsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}
  async vendorRegister(vendorData: CreateVendorDto) {
    try {
      console.log('vendorData', vendorData);
      return await this.db.transaction(async (tx) => {
        const hashedPassword = await bcrypt.hash(vendorData.password, 10);
        const [vendorRole] = await tx
          .select()
          .from(user_roles)
          .where(eq(user_roles.role_name, UserRole.VENDOR))
          .limit(1);
        const [newUser] = await tx
          .insert(user)
          .values({
            first_name: vendorData.vendor_admin_full_name.split(' ')[0],
            last_name: vendorData.vendor_admin_full_name
              .split(' ')
              .slice(1)
              .join(' '),
            email: vendorData.vendor_admin_email,
            country_code: vendorData.country_code,
            phone_number: vendorData.business_number,
            password_hash: hashedPassword,
            role_id: vendorRole.id,
          })
          .returning({ id: user.id, email: user.email });
        console.log(newUser);
        await tx.insert(vendor).values({
          store_owner_full_name: vendorData.vendor_admin_full_name,
          store_name: vendorData.business_name,
          store_description: vendorData.category,
          category: vendorData.category,
          user_id: newUser.id,
        });

        this.mailService.sendEmail(
          newUser.email,
          'Vendor Registration Received',
          `<p>Thank you for registering as a vendor on our marketplace. Your application is currently under review, and we will notify you once it has been approved.</p>`,
        );
        return {
          message:
            'Vendor registration successful. Your application is under review.',
        };
      });
    } catch (error) {
      throw new Error('Failed to register vendor', {
        cause: error,
      });
    }
  }
  async vendorLogin(
    loginDto: { email: string; password: string },
    res: express.Response,
  ) {
    try {
      const [existingUser] = await this.db
        .select()
        .from(user)
        .where(eq(user.email, loginDto.email))
        .limit(1);
      if (!existingUser) {
        throw new Error('Vendor not found');
      }
      const isPasswordValid: boolean = await bcrypt.compare(
        loginDto.password,
        existingUser.password_hash,
      );
      if (!isPasswordValid) {
        throw new Error('Invalid password');
      }
      const payload = {
        sub: existingUser.id,
        email: existingUser.email,
      };
      const expiresIn = process.env.JWT_EXPIRES_IN
        ? parseInt(process.env.JWT_EXPIRES_IN, 10)
        : 3600;
      const access_token = await this.jwtService.signAsync(payload, {
        expiresIn,
        secret: process.env.JWT_SECRET || 'defaultSecret',
      });
      const filteredUser = {
        ...existingUser,
        password_hash: undefined,
      };
      res.cookie('access_token', access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
      });

      res.send({
        user: filteredUser,
        message: 'Login successful',
      });
    } catch (error) {
      throw new Error('Failed to login vendor', { cause: error });
    }
  }
  async findVendorByEmail(email: string) {
    try {
      const [vendorRecord] = await this.db
        .select()
        .from(vendor)
        .innerJoin(user, eq(vendor.user_id, user.id))
        .where(eq(user.email, email))
        .limit(1);
      if (!vendorRecord) {
        return new UnauthorizedException('Vendor not found');
      }
      return vendorRecord;
    } catch (error) {
      throw new Error('Failed to find vendor by email', {
        cause: error,
      });
    }
  }
  async approveVendor(vendorId: string) {
    try {
      await this.db
        .update(vendor)
        .set({ vendor_status: UserStatus.ACTIVE })
        .where(eq(vendor.id, vendorId))
        .returning();
      const [vendorUser] = await this.db
        .select({ email: user.email })
        .from(vendor)
        .innerJoin(user, eq(vendor.user_id, user.id))
        .where(eq(vendor.id, vendorId))
        .limit(1);
      this.mailService.sendEmail(
        vendorUser.email,
        'Vendor Account Approved',
        `<p>Congratulations! Your vendor account has been approved. You can now log in and start managing your store.</p>`,
      );
      return;
    } catch (error) {
      throw new Error('Failed to approve vendor', { cause: error });
    }
  }
  async rejectVendor(vendorId: string) {
    try {
      const vendorUser = await this.db.transaction(async (tx) => {
        const [vendorUser] = await tx
          .select({ email: user.email })
          .from(vendor)
          .innerJoin(user, eq(vendor.user_id, user.id))
          .where(eq(vendor.id, vendorId))
          .limit(1);
        if (!vendorUser) {
          throw new Error(
            `Vendor with ID ${vendorId} not found or has no linked user.`,
          );
        }
        await tx
          .update(vendor)
          .set({ vendor_status: UserStatus.REJECTED })
          .where(eq(vendor.id, vendorId));

        if (!vendorUser.email) {
          throw new Error(
            `User linked to vendor with ID ${vendorId} has no email.`,
          );
        }
        return {
          email: vendorUser.email,
        };
      });
      await this.mailService.sendEmail(
        vendorUser.email,
        'Vendor Account Rejected',
        `<p>We regret to inform you that your vendor account has been rejected...</p>`,
      );
    } catch (error) {
      console.error('RejectVendor Error:', error);
      throw new Error('Failed to reject vendor', { cause: error });
    }
  }
  async removeVendor(vendorId: string) {
    try {
      const [vendorRow] = await this.db
        .select({ user_id: vendor.user_id })
        .from(vendor)
        .where(eq(vendor.id, vendorId))
        .limit(1);
      if (!vendorRow || !vendorRow.user_id) {
        throw new Error('Vendor not found');
      }
      await this.db.delete(user).where(eq(user.id, vendorRow.user_id));
    } catch (error) {
      throw new Error('Failed to remove vendor', { cause: error });
    }
  }
  async completeVendorProfile(
    vendorId: string,
    data: {
      vendorId: string;
      addressData: typeof address.$inferInsert;
      gstData: typeof gst_registrations.$inferInsert;
      taxProfileData: typeof tax_profiles.$inferInsert;
      tax_typeData: typeof tax_types.$inferInsert;
      tax_ratesData: typeof tax_rates.$inferInsert;
    },
  ) {
    if (
      !data.addressData &&
      !data.gstData &&
      !data.taxProfileData &&
      !data.tax_typeData &&
      !data.tax_ratesData
    ) {
      throw new Error('No data provided for update');
    }
    return await this.db.transaction(async (tx) => {
      const [vendorRecord] = await tx
        .select()
        .from(vendor)
        .where(eq(vendor.id, vendorId))
        .limit(1);
      if (!vendorRecord.company_id) {
        throw new Error(
          `Vendor with ID ${vendorId} has no associated company_id.`,
        );
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
        throw new Error(
          `Failed to create tax profile for vendor with ID ${vendorId}.`,
        );
      }
      await tx.insert(tax_rates).values({
        ...data.tax_ratesData,
        company_id: vendorRecord.company_id,
        tax_type_id: taxProfileResult.id,
      });
      if (!vendorRecord.user_id) {
        throw new Error(`Vendor with ID ${vendorId} not found.`);
      }
      await tx.insert(address).values({
        ...data.addressData,
        user_id: vendorRecord.user_id,
      });
      return {
        success: true,
        message: 'All profiles updated successfully',
      };
    });
  }
  async vendorApplications() {
    try {
      const applications = await this.db
        .select()
        .from(vendor)
        .where(
          or(
            eq(vendor.vendor_status, UserStatus.PENDING),
            eq(vendor.is_verified, false),
          ),
        );
      return {
        message: 'Vendor applications retrieved successfully',
        data: applications,
      };
    } catch (error) {
      throw new Error('Failed to retrieve vendor applications', {
        cause: error,
      });
    }
  }
  async updateVendorStatus(vendorId: string, status: UserStatus) {
    try {
      const [existingVendor] = await this.db
        .select()
        .from(vendor)
        .where(eq(vendor.id, vendorId))
        .limit(1);
      if (!existingVendor) {
        throw new Error('Vendor not found');
      }
      await this.db
        .update(vendor)
        .set({ vendor_status: status })
        .where(eq(vendor.id, vendorId));
      return {
        message: 'Vendor status updated successfully',
      };
    } catch (error) {
      throw new Error('Failed to update vendor status', {
        cause: error,
      });
    }
  }
  async getAllVendors() {
    try {
      const vendors = await this.db.select().from(vendor);
      return {
        message: 'Vendors retrieved successfully',
        data: vendors,
      };
    } catch (error) {
      throw new Error('Failed to retrieve vendors', {
        cause: error,
      });
    }
  }
  async getUnverifiedVendors() {
    try {
      const vendors = await this.db
        .select()
        .from(vendor)
        .where(eq(vendor.is_verified, false));
      return {
        message: 'Unverified vendors retrieved successfully',
        data: vendors,
      };
    } catch (error) {
      throw new Error('Failed to retrieve unverified vendors', {
        cause: error,
      });
    }
  }
  async getVerifiedVendors() {
    try {
      const vendors = await this.db
        .select()
        .from(vendor)
        .where(eq(vendor.is_verified, true));
      return {
        message: 'Verified vendors retrieved successfully',
        data: vendors,
      };
    } catch (error) {
      throw new Error('Failed to retrieve verified vendors', {
        cause: error,
      });
    }
  }
  async getVendorById(vendorId: string) {
    try {
      const [existingVendor] = await this.db
        .select()
        .from(vendor)
        .innerJoin(user, eq(vendor.user_id, user.id))
        .innerJoin(vendor_document, eq(vendor.id, vendor_document.vendor_id))
        .where(eq(vendor.id, vendorId))
        .limit(1);
      if (!existingVendor) {
        throw new Error('Vendor not found');
      }
      return {
        message: 'Vendor retrieved successfully',
        data: existingVendor,
      };
    } catch (error) {
      throw new Error('Failed to retrieve vendor', {
        cause: error,
      });
    }
  }
}
