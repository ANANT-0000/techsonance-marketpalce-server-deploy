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
import { company, user, user_and_company, user_roles } from 'src/drizzle/schema';
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
  ) { }

  async adminLogin(
    email: string,
    password: string,
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
        .where(eq(user.email, email))
        .limit(1);
      console.log('existing user', existingUser);
      if (!existingUser) {
        throw new HttpException(
          'Admin user not found',
          HttpStatus.UNAUTHORIZED,
        );
      }

      //--------------------------------------
      // for bypass Admin login ,uncommit in production 
      //--------------------------------------
      // const [userAndCompany] = await this.db.select().from(user_and_company).where(eq(user_and_company.user_id, existingUser.id)).limit(1);
      // if (!userAndCompany) {
      //   throw new HttpException(
      //     'User and company not found',
      //     HttpStatus.UNAUTHORIZED,
      //   );
      // }
      // const [companyRecord] = await this.db.select().from(company).where(eq(company.id, userAndCompany.company_id)).limit(1);
      // if (!companyRecord) {
      //   throw new HttpException(
      //     'Company not found',
      //     HttpStatus.UNAUTHORIZED,
      //   );
      // }

      //--------------------------------------
      const isPasswordValid: boolean =
        password === this.configService.get('ADMIN_PASSWORD');
      if (!isPasswordValid) {
        throw new HttpException('Invalid password', HttpStatus.UNAUTHORIZED);
      }
      const payload: {
        sub: string;
        email: string;
        role: string;
      } = { sub: existingUser.id, email: existingUser.email, role: adminRole.role_name };

      const accessToken = await this.jwtService.signAsync(payload, {
        expiresIn: '5h',
        secret: process.env.JWT_SECRET || 'defaultSecret',
      });
      const refreshToken = await this.jwtService.signAsync(payload, {
        expiresIn: '7d',
        secret: process.env.JWT_REFRESH_SECRET || 'defaultRefreshTokenSecret',
      });
      console.log('access token', accessToken);
      console.log('refresh token', refreshToken);
      const filteredUser = {
        ...existingUser,
        password_hash: undefined,
      };
      console.log('admin login response', filteredUser);
      return {
        user: filteredUser,
        role: UserRole.ADMIN,
        access_token: accessToken,
        refresh_token: refreshToken,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to login admin', {
        cause: error,
      });
    }
  }
}
