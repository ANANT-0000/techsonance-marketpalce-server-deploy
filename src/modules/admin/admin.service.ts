import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { user, user_roles } from 'src/drizzle/schema';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import { UserRole } from 'src/drizzle/types/types';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private jwtService: JwtService,
  ) {}

  async adminLogin(email: string, password: string) {
    try {
      const [adminRole] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.ADMIN))
        .limit(1);
      const [existingUser] = await this.db
        .select()
        .from(user)
        .where(and(eq(user.email, email), eq(user.role_id, adminRole.id)))
        .limit(1);
      if (!existingUser) {
        throw new Error('Admin not found');
      }
      const isPasswordValid: boolean = password === process.env.ADMIN_PASSWORD;
      if (!isPasswordValid) {
        throw new Error('Invalid password');
      }
      const payload: {
        sub: string;
        email: string;
      } = { sub: existingUser.id, email: existingUser.email };
      const accessToken = this.jwtService.sign(payload);
      const response: any = {
        ...existingUser,
        password_hash: undefined,
      };
      return {
        message: 'Admin login successful',
        status: 201,
        user: response,
        token: accessToken,
      };
    } catch (error) {
      throw new Error('Failed to login admin', { cause: error });
    }
  }
}
