import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { user, user_roles } from 'src/drizzle/schema';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import { UserRole } from 'src/drizzle/types/types';
import express from 'express';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async adminLogin(
    email: string,
    password: string,
    res: express.Response,
  ): Promise<Record<string, unknown>> {
    if (!email || !password) {
      throw new HttpException(
        'Email and password are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log('email', email, password);
    try {
      const [adminRole] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.ADMIN))
        .limit(1);
      console.log('admin role', adminRole);
      const [existingUser] = await this.db

        .select()
        .from(user)
        .where(and(eq(user.email, email), eq(user.role_id, adminRole.id)))
        .limit(1);
      console.log('existing user', existingUser);
      if (!existingUser) {
        throw new HttpException(
          'Admin user not found',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const isPasswordValid: boolean =
        password === this.configService.get('ADMIN_PASSWORD');
      if (!isPasswordValid) {
        throw new HttpException('Invalid password', HttpStatus.UNAUTHORIZED);
      }
      const payload: {
        sub: string;
        email: string;
      } = { sub: existingUser.id, email: existingUser.email };
      const accessToken = this.jwtService.sign(payload);
      console.log('access token', accessToken);
      const filteredUser = {
        ...existingUser,
        password_hash: undefined,
      };
      console.log('admin login response', filteredUser);
      // res.cookie('access_token', accessToken, {
      //   httpOnly: true,
      //   secure: process.env.NODE_ENV === 'production',
      //   sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      //   path: '/',
      //   maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      // });
      return {
        user: filteredUser,
        role: UserRole.ADMIN,
        token: accessToken,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to login admin', {
        cause: error,
      });
    }
  }
}
