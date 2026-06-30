import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import { UsersService } from '../users/users.service.js';
import { VendorsService } from '../vendors/vendors.service.js';
import {
  company,
  user,
  user_and_company,
  user_roles,
} from '../../drizzle/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { MailService } from '../../common/services/mail/mail.service.js';
import express from 'express';
import { CompanyService } from '../company/company.service.js';
import { randomInt, randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { AccessStatus, UserRole, UserStatus } from '../../drizzle/types/types.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';
import { AuthErrorKeyEnum } from './constants/auth.enums.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private jwtService: JwtService,
    private usersService: UsersService,
    private vendorService: VendorsService,
    private mail: MailService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

  async validateUser(userId: string, email: string) {
    const user = await this.usersService.findByPayload({
      sub: userId,
      email: email,
    });
    if (!user) {
      throw new HttpException(
        AuthErrorKeyEnum.USER_NOT_FOUND,
        HttpStatus.UNAUTHORIZED,
      );
    }
    return user;
  }

  logout(res: express.Response) {
    res.clearCookie('accessToken');
    return { message: 'Logged out successfully' };
  }

  setAuthCookie(res: express.Response, token: string) {
    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  async forgetPassword(email: string) {
    if (!email) {
      throw new HttpException(
        AuthErrorKeyEnum.EMAIL_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const mailExists = await this.db
        .select()
        .from(user)
        .where(eq(user.email, email));
      if (!mailExists || mailExists.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 100));
        return {
          status: 'success',
          message: 'Verification instructions have been dispatched if the account exists.',
        };
      }
      await this.mail.sendResetPasswordEmail(email);
      return {
        status: 'success',
        message: 'Verification instructions have been dispatched if the account exists.',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        AuthErrorKeyEnum.FAILED_TO_RESET_PASSWORD,
        {
          cause: error,
        },
      );
    }
  }

  async resetPassword(token: string, newPassword: string) {
    const email = this.mail.verifyResetToken(token);
    if (!email) {
      throw new HttpException(
        AuthErrorKeyEnum.INVALID_OR_EXPIRED_TOKEN,
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
      throw new InternalServerErrorException(
        AuthErrorKeyEnum.FAILED_TO_RESET_PASSWORD,
        {
          cause: error,
        },
      );
    }
  }

  async requestPasswordReset(email: string, domain: string) {
    if (!email) {
      throw new HttpException(
        AuthErrorKeyEnum.EMAIL_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const [userExists] = await this.db
        .select()
        .from(user)
        .where(eq(user.email, email));
      if (!userExists) {
        await new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 100));
        return {
          status: 'success',
          message: 'Verification instructions have been dispatched if the account exists.',
        };
      }
      const otp = randomInt(100000, 999999).toString();
      const companyId = await this.resolveCompanyId(domain);
      const [companyDetails] = await this.db
        .select()
        .from(company)
        .where(eq(company.id, companyId));
      if (!companyId || !companyDetails) {
        throw new HttpException(
          AuthErrorKeyEnum.DOMAIN_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const otpExpires = new Date();
      otpExpires.setMinutes(otpExpires.getMinutes() + 15); //15 minutes from now
      await this.db
        .update(user)
        .set({ otp: otp, otp_expires: otpExpires, otp_attempts: 0 })
        .where(eq(user.id, userExists.id));
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
        status: 'success',
        message: 'Verification instructions have been dispatched if the account exists.',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        AuthErrorKeyEnum.FAILED_TO_RESET_PASSWORD,
        {
          cause: error,
        },
      );
    }
  }

  async resetPasswordWithOtp(email: string, otp: string, newPassword: string) {
    const [userRecord] = await this.db
      .select()
      .from(user)
      .where(eq(user.email, email));
    if (!userRecord)
      throw new HttpException(
        AuthErrorKeyEnum.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );

    if (!userRecord.otp || userRecord.otp !== otp) {
      const newAttempts = (userRecord.otp_attempts || 0) + 1;
      if (newAttempts >= 3) {
        await this.db
          .update(user)
          .set({ otp: null, otp_expires: null, otp_attempts: 0 })
          .where(eq(user.id, userRecord.id));
        throw new HttpException(
          'Verification token has expired or is invalid. Please request a new code.',
          HttpStatus.BAD_REQUEST,
        );
      } else {
        await this.db
          .update(user)
          .set({ otp_attempts: newAttempts })
          .where(eq(user.id, userRecord.id));
        throw new UnauthorizedException(AuthErrorKeyEnum.INVALID_OTP);
      }
    }
    if (!userRecord.otp_expires) {
      throw new UnauthorizedException(AuthErrorKeyEnum.INVALID_OTP);
    }

    if (new Date() > new Date(userRecord.otp_expires)) {
      await this.db
        .update(user)
        .set({ otp: null, otp_expires: null, otp_attempts: 0 })
        .where(eq(user.id, userRecord.id));
      throw new UnauthorizedException(
        AuthErrorKeyEnum.OTP_HAS_EXPIRED_PLEASE_REQUEST_A_NEW_ONE,
      );
    }
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    await this.db
      .update(user)
      .set({
        password_hash: hashedPassword,
        otp: null,
        otp_expires: null,
        otp_attempts: 0,
      })
      .where(eq(user.id, userRecord.id));

    return { message: 'Password reset successfully!' };
  }

  async validateOAuthLogin(
    oauthUser: any,
    domain: string,
  ): Promise<
    | { access_token: string; refresh_token: string }
    | { message: string; status: number; email: string }
  > {
    try {
      const filteredDomain = domainExtractor(domain);
      // Find company by domain
      const companyId = await this.companyService.find(filteredDomain);
      if (!companyId) {
        throw new HttpException(
          AuthErrorKeyEnum.DOMAIN_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      const [existingUser] = await this.db
        .select()
        .from(user)
        .innerJoin(user_and_company, eq(user.id, user_and_company.user_id))
        .where(
          and(
            eq(user.email, oauthUser.email),
            eq(user_and_company.company_id, companyId),
          ),
        )
        .catch((error) => {
          throw new InternalServerErrorException(
            AuthErrorKeyEnum.FAILED_TO_VALIDATE_OAUTH_LOGIN,
            {
              cause: error,
            },
          );
        });

      // If user exists, log them in
      if (existingUser) {
        // Get user role
        const [roleRecord] = await this.db
          .select({ id: user_roles.id, role_name: user_roles.role_name })
          .from(user_roles)
          .where(eq(user_roles.role_name, UserRole.CUSTOMER));

        if (!roleRecord) {
          throw new HttpException(
            AuthErrorKeyEnum.USER_ROLE_NOT_FOUND,
            HttpStatus.NOT_FOUND,
          );
        }
        const [userAndCompany] = await this.db
          .select()
          .from(user_and_company)
          .where(
            and(
              eq(user_and_company.user_id, existingUser.user.id),
              eq(user_and_company.company_id, companyId),
            ),
          );
        if (!userAndCompany) {
          throw new HttpException(
            AuthErrorKeyEnum.USER_AND_COMPANY_NOT_FOUND,
            HttpStatus.NOT_FOUND,
          );
        }
        const isDeactivated =
          userAndCompany.access_status === AccessStatus.INACTIVE;
        if (isDeactivated) {
          return {
            email: existingUser.user.email,
            message:
              'Your account has been deactivated. Please Activate Your Account.',
            status: 423,
          };
        }

        const access_payload = {
          sub: existingUser.user.id,
          email: existingUser.user.email,
          company_id: companyId,
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
        };

        const expiresIn: any = process.env.JWT_EXPIRES_IN
          ? isNaN(Number(process.env.JWT_EXPIRES_IN))
            ? process.env.JWT_EXPIRES_IN
            : parseInt(process.env.JWT_EXPIRES_IN, 10)
          : '7d';

        const accessToken = this.jwtService.sign(access_payload, {
          secret: process.env.JWT_SECRET,
          expiresIn,
        });
        const refreshToken = this.jwtService.sign(refresh_payload, {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: '7d',
        });

        return { access_token: accessToken, refresh_token: refreshToken };
      }

      const [roleRecord] = await this.db
        .select({ id: user_roles.id, role_name: user_roles.role_name })
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.CUSTOMER));

      if (!roleRecord) {
        throw new HttpException(
          AuthErrorKeyEnum.CUSTOMER_ROLE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      const randomPassword = randomBytes(16).toString('hex');
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
        })
        .returning()
        .catch((err) => {
          throw new HttpException(
            AuthErrorKeyEnum.FAILED_TO_CREATE_USER_ACCOUNT,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });
      await this.db.insert(user_and_company).values({
        user_id: newUser.id,
        company_id: companyId,
        access_status: AccessStatus.ACTIVE,
        role_id: roleRecord.id,
      });

      // Send welcome email
      try {
        await this.mail.sendUserWelcomeEmail(
          newUser.email,
          `${newUser.first_name} ${newUser.last_name}`,
        );
      } catch (emailError) {
        // Don't fail the registration if email fails
      }

      // Generate JWT token for new user
      const payload = {
        sub: newUser.id,
        email: newUser.email,
        company_id: companyId,
        user: {
          id: newUser.id,
          email: newUser.email,
        },
        role: roleRecord.role_name,
      };

      const expiresIn: any = process.env.JWT_EXPIRES_IN
        ? isNaN(Number(process.env.JWT_EXPIRES_IN))
          ? process.env.JWT_EXPIRES_IN
          : parseInt(process.env.JWT_EXPIRES_IN, 10)
        : '7d';

      const accessToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn,
      });
      const refreshToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });

      return { access_token: accessToken, refresh_token: refreshToken };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        AuthErrorKeyEnum.FAILED_TO_PROCESS_OAUTH_LOGIN,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async verifyEmail(email: string) {
    try {
      const [isEmailExists] = await this.db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      if (isEmailExists) {
        return {
          exists: true,
          message: 'Email  already exists ,Please use Different Email',
        };
      } else {
        return {
          exists: false,
          message:
            'Email verified successfully it does not exist in our records, you can use this email ',
        };
      }
    } catch (error) {
      throw new HttpException(
        AuthErrorKeyEnum.FAILED_TO_VERIFY_EMAIL,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
