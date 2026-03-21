import { Inject, Injectable } from '@nestjs/common';
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

  async adminLogin(email: string, password: string, res: express.Response) {
    try {
      const [adminRole] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.ADMIN))
        .limit(1);
      // console.log('adminRole', adminRole);
      const [existingUser] = await this.db
        .select()
        .from(user)
        .where(and(eq(user.email, email), eq(user.role_id, adminRole.id)))
        .limit(1);
      // console.log('existingUser', existingUser);

      if (!existingUser) {
        // console.log(' in existingUser', existingUser);
        throw new Error('Admin not found');
      }
      // console.log(this.configService.get('ADMIN_PASSWORD'));
      const isPasswordValid: boolean =
        password === this.configService.get('ADMIN_PASSWORD');
      if (!isPasswordValid) {
        // console.log('Invalid password');
        throw new Error('Invalid password');
      }
      // console.log('isPasswordValid', isPasswordValid);
      // console.log('existingUser', existingUser);
      const payload: {
        sub: string;
        email: string;
      } = { sub: existingUser.id, email: existingUser.email };
      const accessToken = this.jwtService.sign(payload);
      // console.log('access token', accessToken);
      const response: any = {
        ...existingUser,
        user_role: UserRole.ADMIN,
        password_hash: undefined,
      };
      // console.log('admin login response', response);
      res.cookie('access_token', accessToken, {
        // httpOnly: true,
        // secure: process.env.NODE_ENV === 'production',
        // sameSite: 'strict',
      });
      return {
        message: 'Admin login successful',
        status: 201,
        user: response,
        token: accessToken,
      };
    } catch (error) {
      console.error('Failed to login admin', { cause: error });
      throw new Error('Failed to login admin');
    }
  }
}
