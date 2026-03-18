import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { user, user_roles } from 'src/drizzle/schema';
import { UserRole, UserStatus } from 'src/drizzle/types/types';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import express from 'express';
import { CreateUserDtoTs, LoginDtoTs } from './dto/userAuth.dto.ts.js';
import { UpdateUserDtoTs } from './dto/update-user.dto.ts.js';
@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwtService: JwtService,
  ) {}
  // Find user by ID
  async findById(id: string) {
    try {
      const [userRecord] = await this.db
        .select({
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          country_code: user.country_code,
          phone_number: user.phone_number,
          company_id: user.company_id,
          role_id: user.role_id,
        })
        .from(user)
        .where(eq(user.id, id))
        .limit(1);
      if (!userRecord) {
        return new UnauthorizedException('User not found');
      }

      return userRecord;
    } catch (error) {
      throw new Error('Failed to fetch user', { cause: error });
    }
  }
  // update user profile
  async editProfile({
    userId,
    updateData,
  }: {
    userId: string;
    updateData: UpdateUserDtoTs;
  }) {
    try {
      const userRecord = await this.db
        .update(user)
        .set(updateData)
        .where(eq(user.id, userId))
        .returning({
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
        });
      return userRecord[0];
    } catch (error) {
      throw new Error('Failed to update user profile', {
        cause: error,
      });
    }
  }
  // Update password with current password verification
  async updatePassword({
    userId,
    currentPassword,
    newPassword,
  }: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }) {
    try {
      const [userRecord] = await this.db
        .select()
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      if (!userRecord) {
        throw new Error('User not found');
      }
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        userRecord.password_hash,
      );
      if (!isPasswordValid) {
        throw new Error('Current password is incorrect');
      }
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await this.db
        .update(user)
        .set({ password_hash: hashedNewPassword })
        .where(eq(user.id, userId));
    } catch (error) {
      throw new Error('Failed to update password', {
        cause: error,
      });
    }
  }
  // Register a new user
  async register(userData: CreateUserDtoTs) {
    const userRole = await this.db
      .select()
      .from(user_roles)
      .where(eq(user_roles.role_name, UserRole.CUSTOMER))
      .limit(1);
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const [userRecord] = await this.db
      .insert(user)
      .values({
        first_name: userData.first_name,
        last_name: userData.last_name,
        email: userData.email,
        password_hash: hashedPassword,
        role_id: userRole[0].id,
      })
      .returning();
    return { userRecord };
  }
  // User login
  async login(login: LoginDtoTs, res: express.Response) {
    const userExists = await this.findByEmail(login.email);
    if (!userExists) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }
    const isPasswordValid = await bcrypt.compare(
      login.password,
      userExists.password_hash,
    );
    if (!isPasswordValid) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }
    const payload = { sub: userExists.id, email: userExists.email };
    const expiresIn = process.env.JWT_EXPIRES_IN
      ? parseInt(process.env.JWT_EXPIRES_IN, 10)
      : 3600;
    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn,
      secret: process.env.JWT_SECRET || 'defaultSecret',
    });
    const filteredUser = { ...userExists, password_hash: undefined };
    res.cookie('access_token', access_token, {
      // httpOnly: true,
      // secure: process.env.NODE_ENV === "production",
    });

    res.send({
      user: filteredUser,
      message: 'Login successful',
    });
  }
  // Find user by email
  async findByEmail(email: string) {
    try {
      const [userRecord] = await this.db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      if (!userRecord) {
        return null;
      }
      return userRecord;
    } catch (error) {
      throw new Error('Failed to find user by email', {
        cause: error,
      });
    }
  }
  // Find user by payload (used in JWT validation)
  async findByPayload(payload: { sub: string; email: string }) {
    try {
      const [userRecord] = await this.db
        .select()
        .from(user)
        .where(and(eq(user.id, payload.sub), eq(user.email, payload.email)))
        .limit(1);
      if (!userRecord) {
        return null;
      }
      return {
        userRecord,
      };
    } catch (error) {
      throw new Error('Failed to find user by payload', {
        cause: error,
      });
    }
  }
  async disableUser(userId: string) {
    try {
      await this.db
        .update(user)
        .set({ user_status: UserStatus.INACTIVE })
        .where(eq(user.id, userId));
      return {
        message: 'User disabled successfully',
      };
    } catch (error) {
      throw new Error('Failed to disable user', { cause: error });
    }
  }
}
