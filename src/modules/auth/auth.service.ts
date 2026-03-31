import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import { UsersService } from '../users/users.service';
import { VendorsService } from '../vendors/vendors.service';
import { user } from 'src/drizzle/schema';
import { eq } from 'drizzle-orm';
import { MailService } from 'src/common/services/mail/mail.service';
import express from 'express';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly drizzle: DrizzleDB,
    private jwtService: JwtService,
    private usersService: UsersService,
    private vendorService: VendorsService,
    private mail: MailService,
  ) {}
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
    res.clearCookie('access_token', {
      // httpOnly: true,
      // secure: process.env.NODE_ENV === "production",
      // sameSite: "strict",
    });
    return;
  }
  async forgetPassword(email: string) {
    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const mailExits = await this.drizzle
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
      await this.drizzle
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
}
