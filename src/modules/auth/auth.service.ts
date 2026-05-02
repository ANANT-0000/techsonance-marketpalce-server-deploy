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
import { company, user, user_roles } from 'src/drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { MailService } from 'src/common/services/mail/mail.service';
import express from 'express';
import { CompanyService } from '../company/company.service';
import { randomInt } from 'crypto';
import bcrypt from 'bcrypt';
import { UserRole, UserStatus } from 'src/drizzle/types/types';
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

    return;
  }
  async forgetPassword(email: string) {
    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const mailExits = await this.db
        .select()
        .from(user)
        .where(eq(user.email, email));
      if (!mailExits) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      await this.mail.sendResetPasswordEmail(email);
      return {
        message: 'Password reset link sent to email (not implemented)',
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
      await this.db
        .update(user)
        .set({ password_hash: newPassword })
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
      const [userExits] = await this.db
        .select()
        .from(user)
        .where(eq(user.email, email));
      if (!userExits) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const otp = randomInt(100000, 999999).toString();
      const companyId = await this.companyService.find(domain);
      const [comanyDetails] = await this.db.select().from(company).where(eq(company.id, companyId));
      if (!companyId || !comanyDetails) {
        throw new HttpException('Domain not found', HttpStatus.NOT_FOUND);
      }
      const otpExpires = new Date();
      otpExpires.setMinutes(otpExpires.getMinutes() + 15); //15 minutes from now
      await this.db.update(user).set({ otp: otp, otpExpires: otpExpires }).where(eq(user.email, email));
      const formattedExpireTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      }).format(otpExpires);
      await this.mail.sendPasswordResetOtp(email, otp, userExits.first_name + ' ' + userExits.last_name, formattedExpireTime, comanyDetails.company_name);
      return {
        message: 'Password reset OTP sent to email'
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to reset password', {
        cause: error,
      });
    }
  }
  async resetPasswordWithOtp(email: string, otp: string, newPassword: string) {

    const [userRecord] = await this.db.select().from(user).where(eq(user.email, email));
    if (!userRecord) throw new HttpException('User not found', HttpStatus.NOT_FOUND);


    if (!userRecord.otp || userRecord.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }
    if (!userRecord.otpExpires) {
      throw new UnauthorizedException('Invalid OTP');
    }

    if (new Date() > new Date(userRecord.otpExpires)) {

      await this.db.update(user).set({ otp: null, otpExpires: null }).where(eq(user.id, userRecord.id));
      throw new UnauthorizedException('OTP has expired. Please request a new one.');
    }
    const hashedPassword = bcrypt.hashSync(newPassword, 10)

    await this.db.update(user)
      .set({
        password_hash: hashedPassword,
        otp: null,
        otpExpires: null
      })
      .where(eq(user.id, userRecord.id));

    return { message: "Password reset successfully!" };
  }

  async validateOAuthLogin(oauthUser: any, domain: string) {
    const companyId = await this.companyService.find(domain);
    if (!companyId) {
      throw new HttpException('Domain not found', HttpStatus.NOT_FOUND);
    }
    const [userRecord] = await this.db.select().from(user).where(and(eq(user.email, oauthUser.email), eq(user.company_id, companyId)))
    if (userRecord) {
      throw new HttpException('User already exists', HttpStatus.BAD_REQUEST);
    }
    const [roleRecord] = await this.db.select({ id: user_roles.id , role_name: user_roles.role_name }).from(user_roles).where(eq(user_roles.role_name, UserRole.CUSTOMER))
    if (!roleRecord) {
      throw new HttpException('Role not found', HttpStatus.NOT_FOUND);
    }
    const hashedPassword = bcrypt.hashSync(oauthUser.password, 10)
    const [newUser] = await this.db.insert(user).values({
      profile_picture_url: oauthUser.profileImage,
      first_name: oauthUser.firstName,
      last_name: oauthUser.lastName,  
      email: oauthUser.email,
      phone_number: oauthUser.phoneNumber,
      password_hash: hashedPassword,
      user_status: UserStatus.ACTIVE,
      company_id: companyId,
      role_id: roleRecord.id,
    }).returning().catch(err => {
      console.log("FAILED TO CREATE USER WITH GOOGLE OAUTH", err);
      throw new HttpException('Failed to create user with Google OAuth', HttpStatus.INTERNAL_SERVER_ERROR);
    })

    // 3. Generate your standard JWT Token

    const payload = { sub: newUser?.id, email: newUser?.email, role: roleRecord.role_name };
    return this.jwtService.sign(payload);
  }
}
