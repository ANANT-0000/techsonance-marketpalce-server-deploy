import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { UsersService } from '../users/users.service';
import { VendorsService } from '../vendors/vendors.service';
import { company, user, user_and_company, user_roles } from 'src/drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { MailService } from 'src/common/services/mail/mail.service';
import express from 'express';
import { CompanyService } from '../company/company.service';
import { randomInt } from 'crypto';
import bcrypt from 'bcrypt';
import { AccessStatus, UserRole, UserStatus } from 'src/drizzle/types/types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private jwtService: JwtService,
    private usersService: UsersService,
    private vendorService: VendorsService,
    private mail: MailService,
    private readonly companyService: CompanyService,
  ) { }

  async validateUser(userId: string, email: string) {
    const user = await this.usersService.findByPayload({
      sub: userId,
      email: email,
    });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
    }
    return user;
  }

  logout(res: express.Response) {
    // Clear any auth cookies if you're using them
    return { message: 'Logged out successfully' };
  }

  async forgetPassword(email: string) {
    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const mailExists = await this.db
        .select()
        .from(user)
        .where(eq(user.email, email));
      if (!mailExists || mailExists.length === 0) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      await this.mail.sendResetPasswordEmail(email);
      return {
        message: 'Password reset link sent to email',
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to reset password', {
        cause: error,
      });
    }
  }

  async resetPassword(token: string, newPassword: string) {
    const email = this.mail.verifyResetToken(token);
    if (!email) {
      throw new HttpException(
        'Invalid or expired token',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      await this.db
        .update(user)
        .set({ password_hash: hashedPassword })
        .where(eq(user.email, email));
      return { message: 'Password reset successful' };
    } catch (error) {
      throw new InternalServerErrorException('Failed to reset password', {
        cause: error,
      });
    }
  }

  async requestPasswordReset(email: string, domain: string) {
    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }
    try {
      const [userExists] = await this.db
        .select()
        .from(user)
        .where(eq(user.email, email));
      if (!userExists) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const otp = randomInt(100000, 999999).toString();
      const companyId = await this.companyService.find(domain);
      const [companyDetails] = await this.db
        .select()
        .from(company)
        .where(eq(company.id, companyId));
      if (!companyId || !companyDetails) {
        throw new HttpException('Domain not found', HttpStatus.NOT_FOUND);
      }
      const otpExpires = new Date();
      otpExpires.setMinutes(otpExpires.getMinutes() + 15); //15 minutes from now
      await this.db
        .update(user)
        .set({ otp: otp, otpExpires: otpExpires })
        .where(eq(user.email, email));
      const formattedExpireTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      }).format(otpExpires);
      await this.mail.sendPasswordResetOtp(
        email,
        otp,
        userExists.first_name + ' ' + userExists.last_name,
        formattedExpireTime,
        companyDetails.company_name,
      );
      return {
        message: 'Password reset OTP sent to email',
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to reset password', {
        cause: error,
      });
    }
  }

  async resetPasswordWithOtp(
    email: string,
    otp: string,
    newPassword: string,
  ) {
    const [userRecord] = await this.db
      .select()
      .from(user)
      .where(eq(user.email, email));
    if (!userRecord)
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    if (!userRecord.otp || userRecord.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }
    if (!userRecord.otpExpires) {
      throw new UnauthorizedException('Invalid OTP');
    }

    if (new Date() > new Date(userRecord.otpExpires)) {
      await this.db
        .update(user)
        .set({ otp: null, otpExpires: null })
        .where(eq(user.id, userRecord.id));
      throw new UnauthorizedException(
        'OTP has expired. Please request a new one.',
      );
    }
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    await this.db
      .update(user)
      .set({
        password_hash: hashedPassword,
        otp: null,
        otpExpires: null,
      })
      .where(eq(user.id, userRecord.id));

    return { message: 'Password reset successfully!' };
  }


  async validateOAuthLogin(oauthUser: any, domain: string): Promise<{ access_token: string; refresh_token: string }> {
    try {
      console.log('Validating OAuth login for:', oauthUser.email);

      // Find company by domain
      const companyId = await this.companyService.find(domain);
      if (!companyId) {
        throw new HttpException('Domain not found', HttpStatus.NOT_FOUND);
      }


      const [existingUser] = await this.db
        .select()
        .from(user)
        .innerJoin(user_and_company, eq(user.id, user_and_company.user_id))
        .where(
          and(eq(user.email, oauthUser.email), eq(user_and_company.company_id, companyId)),
        );

      // If user exists, log them in
      if (existingUser.user) {
        console.log('Existing user found, logging in:', existingUser.user.email);

        // Get user role
        const [roleRecord] = await this.db
          .select({ id: user_roles.id, role_name: user_roles.role_name })
          .from(user_roles)
          .where(eq(user_roles.role_name, UserRole.CUSTOMER));

        if (!roleRecord) {
          throw new HttpException('User role not found', HttpStatus.NOT_FOUND);
        }


        const access_payload = {
          user: {
            id: existingUser.user.id,
            profile_picture_url: existingUser.user.profile_picture_url,
            first_name: existingUser.user.first_name,
            last_name: existingUser.user.last_name,
            email: existingUser.user.email,
            country_code: existingUser.user.country_code,
            phone_number: existingUser.user.phone_number,
            user_status: existingUser.user.user_status,
            role_id: roleRecord.id,
          },
          role: roleRecord.role_name,
        };

        const refresh_payload = {
          user: {
            id: existingUser.user.id,
            email: existingUser.user.email,
          },
          role: roleRecord.role_name,
        }

        const accessToken = this.jwtService.sign(access_payload, {
          secret: process.env.JWT_SECRET,
          expiresIn: '1d',
        });
        const refreshToken = this.jwtService.sign(refresh_payload, {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: '7d',
        });

        return { access_token: accessToken, refresh_token: refreshToken };
      }


      console.log('New user, registering:', oauthUser.email);


      const [roleRecord] = await this.db
        .select({ id: user_roles.id, role_name: user_roles.role_name })
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.CUSTOMER));

      if (!roleRecord) {
        throw new HttpException('Customer role not found', HttpStatus.NOT_FOUND);
      }

      const randomPassword = Math.random().toString(36).slice(-10);
      const hashedPassword = bcrypt.hashSync(randomPassword, 10);

      // Create new user
      const [newUser] = await this.db
        .insert(user)
        .values({
          profile_picture_url: oauthUser.profileImage || null,
          first_name: oauthUser.firstName,
          last_name: oauthUser.lastName,
          email: oauthUser.email,
          phone_number: oauthUser.phoneNumber || null,
          password_hash: hashedPassword,
          user_status: UserStatus.ACTIVE,
          role_id: roleRecord.id,
        })
        .returning()
        .catch((err) => {
          console.error('Failed to create user with Google OAuth:', err);
          throw new HttpException(
            'Failed to create user account',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });
      await this.db.insert(user_and_company).values({
        user_id: newUser.id,
        company_id: companyId,
        access_status: AccessStatus.ACTIVE,
      })
      console.log('New user created successfully:', newUser.email);

      // Send welcome email
      try {
        await this.mail.sendUserWelcomeEmail(
          newUser.email,
          `${newUser.first_name} ${newUser.last_name}`,
        );
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail the registration if email fails
      }

      // Generate JWT token for new user
      const payload = {
        sub: newUser.id,
        email: newUser.email,
        role: roleRecord.role_name,
      };

      const accessToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '1d',
      });
      const refreshToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });


      return { access_token: accessToken, refresh_token: refreshToken };
    } catch (error) {
      console.error('OAuth validation error:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to process OAuth login',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}