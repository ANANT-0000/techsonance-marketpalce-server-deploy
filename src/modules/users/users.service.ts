import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { user, user_and_company, user_roles } from 'src/drizzle/schema';
import { AccessStatus, UserRole, UserStatus } from 'src/drizzle/types/types';
import { and, eq, InferSelectModel } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';

import bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';

import { CreateUserDto, LoginDto } from './dto/userAuth.dto.ts.js';
import { UpdateUserDtoTs } from './dto/update-user.dto.ts.js';
import { MailService } from 'src/common/services/mail/mail.service';
import { CompanyService } from '../company/company.service.js';
type UserRecord = InferSelectModel<typeof user>;
type UserRoleRecord = InferSelectModel<typeof user_roles>;
@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly jwtService: JwtService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
  ) { }
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
      throw new InternalServerErrorException('Failed to find user', {
        cause: error,
      });
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
      const [userRecord] = await this.db
        .update(user)
        .set(updateData)
        .where(eq(user.id, userId))
        .returning({
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
        });
      return userRecord;
    } catch (error) {
      throw new InternalServerErrorException('Failed to update profile', {
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
        throw new UnauthorizedException('User not found');
      }
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        userRecord.password_hash,
      );
      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await this.db
        .update(user)
        .set({ password_hash: hashedNewPassword })
        .where(eq(user.id, userId));
    } catch (error) {
      throw new InternalServerErrorException('Failed to update password', {
        cause: error,
      });
    }
  }
  // Register a new user
  async register(userData: CreateUserDto, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);
      if (!companyId) {
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }
      const [existingUser] = await this.db.select().from(user).where(eq(user.email, userData.email)).limit(1);
      const existingCompanyUser = await this.db.select().from(user_and_company).where(and(eq(user_and_company.user_id, existingUser.id), eq(user_and_company.company_id, companyId))).limit(1);
      if (existingUser && existingCompanyUser) {
        throw new ConflictException('User with this email already exists in this company');
      }

      const [userRole] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.CUSTOMER))
        .limit(1)
        .catch((error) => {
          console.error('Error fetching user role:', error);
          throw new InternalServerErrorException('Failed to fetch user role', {
            cause: error,
          });
        });

      if (!userRole) {
        throw new InternalServerErrorException('Customer role not found');
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      console.log('creating user');
      if (existingUser) {
        await this.db.insert(user_and_company).values({
          user_id: existingUser.id,
          company_id: companyId,
        });
        return existingUser;
      }
      const [userRecord] = await this.db
        .insert(user)
        .values({
          first_name: userData.first_name,
          last_name: userData.last_name,
          email: userData.email,
          password_hash: hashedPassword,
          role_id: userRole.id,
        })
        .returning()
        .catch((error) => {
          console.error('Error inserting user:', error);
          throw new InternalServerErrorException('Failed to create user', {
            cause: error,
          });
        });
      await this.db.insert(user_and_company).values({
        user_id: userRecord.id,
        company_id: companyId,
      });
      console.log('created user');

      // ─────────────────────────────────────────────────────────────────
      // ─────────────────────────────────────────────────────────────────
      // Send Customer Welcome Email
      // ─────────────────────────────────────────────────────────────────
      await this.mailService.sendUserWelcomeEmail(userData.email, userData.first_name)

      return userRecord;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to register user', {
        cause: error,
      });
    }
  }
  async login(login: LoginDto, domain: string) {
    try {
      console.log(domain)
      const companyId = await this.companyService.find(domain)
      if (!companyId) {
        throw new HttpException('Company not found', HttpStatus.UNAUTHORIZED);
      }

      const records = await this.findByEmail(login.email);
      if (!records) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }
      const { userRecord, roleRecord } = records;
      const [existingCompanyUser] = await this.db.select().from(user_and_company).where(and(eq(user_and_company.user_id, userRecord.id), eq(user_and_company.company_id, companyId))).limit(1);
      if (!existingCompanyUser) {
        throw new ConflictException('User is not registered to this company');
      }
      if (!userRecord || !userRecord?.password_hash) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }
      console.log(userRecord, roleRecord);
      const isPasswordValid = await bcrypt.compare(
        login.password,
        userRecord.password_hash,
      );
      if (!isPasswordValid) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }
      if (!userRecord?.id && !userRecord?.email) {
        throw new HttpException(
          'User record is incomplete',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const payload = { sub: userRecord?.id, email: userRecord?.email, role: roleRecord.role_name };
      const expiresIn = process.env.JWT_EXPIRES_IN
        ? parseInt(process.env.JWT_EXPIRES_IN, 10)
        : 3600;

      const accessToken = await this.jwtService.signAsync(payload, {
        expiresIn,
        secret: process.env.JWT_SECRET || 'defaultSecret',
      });
      const refreshToken = await this.jwtService.signAsync(payload, {
        expiresIn,
        secret: process.env.JWT_REFRESH_SECRET || 'defaultSecret',
      });
      const filteredUser = {
        ...userRecord,
        password_hash: undefined, // Exclude password hash from the response
      };
      console.log(filteredUser);

      return {
        user: filteredUser,
        role: roleRecord.role_name,
        access_token: accessToken,
        refresh_token: refreshToken
      };
    } catch (error) {
      if (error instanceof HttpException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to login user', {
        cause: error,
      });
    }
  }

  async listCustomersByDomain(
    domain: string,
  ) {
    try {
      const companyId = await this.companyService.find(domain);
      if (!companyId) {
        throw new HttpException('Company not found', HttpStatus.UNAUTHORIZED);
      }
      const customers = this.db.query.user_and_company.findMany({
        where: eq(user_and_company.company_id, companyId),
        with: {
          user: true,
        }
      }).catch((error) => {
        console.error('Error listing customers:', error);
        throw new InternalServerErrorException('Failed to list customers', {
          cause: error,
        });
      })
      return customers;
    } catch (error) {
      throw new InternalServerErrorException('Failed to list customers', {
        cause: error,
      });
    }
  }
  // Find user by email
  async findByEmail(
    email: string,
  ): Promise<{ userRecord: UserRecord; roleRecord: UserRoleRecord } | null> {
    try {
      const [userRecord] = await this.db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      if (!userRecord.role_id) {
        return null;
      }
      const [roleRecord] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.id, userRecord.role_id))
        .limit(1);
      if (!roleRecord) {
        return null;
      }
      return { userRecord, roleRecord };
    } catch (error) {
      throw new InternalServerErrorException('Failed to find user by email', {
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
      return userRecord;
    } catch (error) {
      throw new InternalServerErrorException('Failed to find user by payload', {
        cause: error,
      });
    }
  }
  async disableUser(userId: string, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);
      if (!companyId) {
        throw new HttpException('Company not found', HttpStatus.UNAUTHORIZED);
      }
      const [userAndCompany] = await this.db
        .select()
        .from(user_and_company)
        .where(and(eq(user_and_company.user_id, userId), eq(user_and_company.company_id, companyId)))
        .limit(1);
      if (!userAndCompany) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      await this.db
        .update(user_and_company)
        .set({ access_status: AccessStatus.SUSPENDED })
        .where(and(eq(user_and_company.user_id, userId), eq(user_and_company.company_id, companyId)));

      return {
        message: 'User disabled successfully',
        status: HttpStatus.OK,
        success: true,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to disable user', {
        cause: error,
      });
    }
  }
}
