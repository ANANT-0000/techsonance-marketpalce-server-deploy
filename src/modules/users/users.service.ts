import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  company,
  user,
  user_and_company,
  user_roles,
} from '../../drizzle/schema';
import { AccessStatus, UserRole, UserStatus } from '../../drizzle/types/types';
import { and, eq, InferSelectModel,} from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';

import bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';

import { CreateUserDto, LoginDto } from './dto/userAuth.dto.ts.js';
import { UpdateUserDtoTs } from './dto/update-user.dto.ts.js';
import { MailService } from '../../common/services/mail/mail.service';
import { CompanyService } from '../company/company.service.js';
import { randomInt } from 'crypto';
 
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';
type UserRecord = InferSelectModel<typeof user>;
type UserRoleRecord = InferSelectModel<typeof user_roles>;
@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly jwtService: JwtService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

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
        })
        .from(user)
        .where(and(eq(user.id, id), eq(user.user_status, UserStatus.ACTIVE)))
        .limit(1);
      if (!userRecord) {
        throw new HttpException(
          'User not found or deactivated',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const [userAndCompanyRecord] = await this.db
        .select()
        .from(user_and_company)
        .where(eq(user_and_company.user_id, userRecord.id))
        .limit(1);
      if (!userAndCompanyRecord) {
        throw new HttpException(
          'User and company not found',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const [roleRecord] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.id, userAndCompanyRecord.role_id))
        .limit(1);
      if (!roleRecord) {
        throw new HttpException('User role not found', HttpStatus.UNAUTHORIZED);
      }
      return {
        ...userRecord,
        role: roleRecord.role_name,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to find user', {
        cause: error,
      });
    }
  }

  async getAllCustomers() {
    try {
      const [customerRole] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.CUSTOMER))
        .limit(1);
      if (!customerRole) {
        throw new InternalServerErrorException('Customer role not found');
      }
      const customers = await this.db.query.user_and_company.findMany({
        where: eq(user_and_company.role_id, customerRole?.id),
        columns: {
          id: true,
          user_id: true,
          company_id: true,
          role_id: true,
        },
        with: {
          user: {
            columns: {
              id: true,
              first_name: true,
            },
          },
        },
      });

      return customers;
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve customers', {
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
      // ── 1. Resolve company ──────────────────────────────────────────
      const companyId = await this.resolveCompanyId(domain);

      if (!companyId) {
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }

      // ── 2. Check if user already exists ────────────────────────────
      console.log('[UsersService.register] Checking if user already exists', {
        email: userData.email,
      });
      const [existingUser] = await this.db
        .select()
        .from(user)
        .where(eq(user.email, userData.email))
        .catch((error) => {
          console.error(
            '[UsersService.register] Error checking existing user:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to check existing user',
            {
              cause: error,
            },
          );
        });

      // ── 3. FIXED: Only query user_and_company if user exists ────────
      //    Previously crashed with existingUser.id when existingUser = undefined
      if (existingUser) {
        console.log(
          '[UsersService.register] User exists, checking company link',
          { existingUserId: existingUser.id, companyId },
        );
        const [existingCompanyUser] = await this.db
          .select()
          .from(user_and_company)
          .where(
            and(
              eq(user_and_company.user_id, existingUser.id),
              eq(user_and_company.company_id, companyId),
            ),
          )
          .catch((error) => {
            console.error(
              '[UsersService.register] Error checking existing company user:',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to check existing company user',
              { cause: error },
            );
          });

        if (existingCompanyUser) {
          // User exists AND is already in this company → conflict
          throw new ConflictException(
            'User with this email already exists in this company',
          );
        }

        // User exists but NOT in this company → just link them
        const [userRole] = await this.getCustomerRole();
        await this.db.insert(user_and_company).values({
          user_id: existingUser.id,
          company_id: companyId,
          role_id: userRole.id,
        });

        return existingUser; // Return early, no welcome email (already registered)
      }

      // ── 4. Brand-new user: fetch role, hash password, create ────────
      const [userRole] = await this.getCustomerRole();
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      const [userRecord] = await this.db
        .insert(user)
        .values({
          first_name: userData.first_name,
          last_name: userData.last_name,
          email: userData.email,
          password_hash: hashedPassword,
        })
        .returning()
        .catch((error) => {
          console.error('[UsersService.register] Error inserting user:', error);
          throw new InternalServerErrorException('Failed to create user', {
            cause: error,
          });
        });

      await this.db.insert(user_and_company).values({
        user_id: userRecord.id,
        company_id: companyId,
        role_id: userRole.id,
      });

      // ── 5. Send welcome email (non-blocking on failure) ──────────────
      await this.mailService.sendUserWelcomeEmail(
        userData.email,
        userData.first_name,
      );

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

  // ── Extracted helper to avoid repeating role fetch logic ────────────
  private async getCustomerRole() {
    const result = await this.db
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

    if (!result[0]) {
      throw new InternalServerErrorException('Customer role not found');
    }

    return result;
  }
  async login(login: LoginDto, domain: string) {
    console.log('[UsersService.login] Request received for domain:', domain);
    try {
      console.log('[UsersService.login] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      if (!companyId) {
        throw new HttpException('Company not found', HttpStatus.UNAUTHORIZED);
      }

      const records = await this.findByEmail(login.email);
      if (!records) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }
      const [userAndCompanyRecord] = await this.db
        .select()
        .from(user_and_company)
        .where(
          and(
            eq(user_and_company.user_id, records.userRecord.id),
            eq(user_and_company.company_id, companyId),
          ),
        );
      if (userAndCompanyRecord.access_status === AccessStatus.INACTIVE) {
        throw new HttpException(
          'Your account has been deactivated. Please Activate Your Account.',
          HttpStatus.LOCKED,
        );
      }
      const { userRecord, roleRecord } = records;
      const [existingCompanyUser] = await this.db
        .select()
        .from(user_and_company)
        .where(
          and(
            eq(user_and_company.user_id, userRecord.id),
            eq(user_and_company.company_id, companyId),
          ),
        )
        .limit(1);
      if (!existingCompanyUser) {
        throw new ConflictException('User is not registered to this company');
      }
      if (!userRecord || !userRecord?.password_hash) {
        console.log(
          '[UsersService.login] Stopping: User record incomplete or missing password hash',
        );
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }
      console.log(
        '[UsersService.login] Verifying password for user:',
        userRecord.email,
      );
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

      const payload = {
        sub: userRecord?.id,
        email: userRecord?.email,
        role: roleRecord.role_name,
      };
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
      console.log(
        '[UsersService.login] Login successful for user:',
        filteredUser.email,
      );

      return {
        user: filteredUser,
        role: roleRecord.role_name,
        access_token: accessToken,
        refresh_token: refreshToken,
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to login user', {
        cause: error,
      });
    }
  }

  async listCustomersByDomain(domain: string) {
    console.log(
      '[UsersService.listCustomersByDomain] Request received for domain:',
      domain,
    );
    try {
      const companyId = await this.resolveCompanyId(domain);
      if (!companyId) {
        console.log(
          '[UsersService.listCustomersByDomain] Stopping: Company not found',
        );
        throw new HttpException('Company not found', HttpStatus.UNAUTHORIZED);
      }
      console.log(
        '[UsersService.listCustomersByDomain] Querying role record for CUSTOMER',
      );
      const [roleRecord] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.CUSTOMER))
        .catch((error) => {
          console.error(
            '[UsersService.listCustomersByDomain] Error fetching role record:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to fetch role record',
            {
              cause: error,
            },
          );
        });

      if (!roleRecord) {
        console.log(
          '[UsersService.listCustomersByDomain] Stopping: Role not found',
        );
        throw new HttpException(
          'Role not found',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      const customers = await this.db.query.user_and_company
        .findMany({
          where: and(
            eq(user_and_company.company_id, companyId),
            eq(user_and_company.role_id, roleRecord.id),
          ),
          with: {
            user: true,
            role: true,
          },
        })
        .then((data) => {
          console.log(
            '[UsersService.listCustomersByDomain] Customer data retrieved',
            { count: data.length },
          );
          return data.map((item) => {
            return {
              id: item.user.id,
              first_name: item.user.first_name,
              last_name: item.user.last_name,
              user_status: item.user.user_status,
              created_at: item.created_at,
              role: item.role.role_name,
            };
          });
        })
        .catch((error) => {
          console.error(
            '[UsersService.listCustomersByDomain] Error listing customers:',
            error,
          );
          throw new InternalServerErrorException('Failed to list customers', {
            cause: error,
          });
        });

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
      if (!userRecord) {
        return null;
      }
      const [userAndCompanyRecord] = await this.db
        .select()
        .from(user_and_company)
        .where(eq(user_and_company.user_id, userRecord.id))
        .limit(1);
      if (!userAndCompanyRecord) {
        return null;
      }
      const [roleRecord] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.id, userAndCompanyRecord.role_id))
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
  async initializeAccountActionOtp(
    domain: string,
    actionType: UserStatus,
    customer_id?: string,
    email?: string,
  ) {
    console.log('[UsersService.initializeAccountActionOtp] Request received', {
      domain,
      actionType,
      customer_id,
      email,
    });
    try {
      if (!email && !customer_id) {
        console.log(
          '[UsersService.initializeAccountActionOtp] Stopping: Either email or customer_id must be provided',
        );
        throw new HttpException(
          'Either email or customer_id not provided',
          HttpStatus.BAD_REQUEST,
        );
      }
      const isCustomerExists = customer_id ? eq(user.id, customer_id) : null;
      const isEmailExists = email ? eq(user.email, email) : null;
      const condition = isCustomerExists || isEmailExists;
      if (!condition) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const [userRecord] = await this.db
        .select()
        .from(user)
        .where(condition)
        .catch((error) => {
          console.error('Error fetching user record:', error);
          throw new InternalServerErrorException(
            'Failed to fetch user record',
            {
              cause: error,
            },
          );
        });
      if (!userRecord || userRecord?.id == null) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const otp = randomInt(100000, 999999).toString();
      const companyId = await this.resolveCompanyId(domain);
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
        .set({ otp: otp, otp_expires: otpExpires })
        .where(eq(user.id, userRecord.id));
      const formattedExpireTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      }).format(otpExpires);
      console.log('[UsersService.initializeAccountActionOtp] Sending OTP mail');
      if (actionType === UserStatus.INACTIVE)
        await this.mailService.sendAccountDeactivationOtp(
          userRecord?.email,
          otp,
          userRecord.first_name + ' ' + userRecord.last_name,
          formattedExpireTime,
          companyDetails.company_name,
        );
      else if (actionType === UserStatus.ACTIVE)
        await this.mailService.sendAccountReactivationOtp(
          userRecord?.email,
          otp,
          userRecord.first_name + ' ' + userRecord.last_name,
          formattedExpireTime,
          companyDetails.company_name,
        );
      console.log(
        '[UsersService.initializeAccountActionOtp] Sent OTP mail successfully',
      );
      return {
        message:
          actionType === UserStatus.INACTIVE
            ? 'Confirm Account Deactivation OTP sent to email'
            : 'Confirm Account Reactivation OTP sent to email',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to send OTP to user', {
        cause: error,
      });
    }
  }
  async confirmAccountAction(
    domain: string,
    actionType: UserStatus,
    otp: string,
    customer_id?: string,
    email?: string,
  ) {
    console.log('[UsersService.confirmAccountAction] Request received', {
      domain,
      actionType,
      customer_id,
      email,
    });
    try {
      if (!email && !customer_id) {
        console.log(
          '[UsersService.confirmAccountAction] Stopping: Either email or customer_id must be provided',
        );
        throw new HttpException(
          'Either email or customer_id not provided',
          HttpStatus.BAD_REQUEST,
        );
      }
      const isCustomerExists = customer_id ? eq(user.id, customer_id) : null;
      const isEmailExists = email ? eq(user.email, email) : null;
      const condition = isCustomerExists || isEmailExists;
      if (!condition) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      const [userRecord] = await this.db
        .select()
        .from(user)
        .where(condition)
        .catch((error) => {
          console.error('Error fetching user record:', error);
          throw new InternalServerErrorException(
            'Failed to fetch user record',
            {
              cause: error,
            },
          );
        });
      if (!userRecord || userRecord?.id == null) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      if (!userRecord.otp || userRecord.otp !== otp) {
        throw new UnauthorizedException('Invalid OTP.');
      }
      console.log(
        '[UsersService.confirmAccountAction] OTP matches successfully',
      );
      if (!userRecord.otp_expires) {
        throw new UnauthorizedException('Invalid OTP');
      }
      console.log(
        '[UsersService.confirmAccountAction] Validating OTP expiration',
        { expires: userRecord.otp_expires , current: new Date() },
      );
      if (new Date() > new Date(userRecord.otp_expires)) {
        await this.db
          .update(user)
          .set({ otp: null, otp_expires: null })
          .where(eq(user.id, userRecord.id));
        throw new UnauthorizedException(
          'OTP has expired. Please request a new one.',
        );
      }
      const companyId = await this.resolveCompanyId(domain);
      if (!companyId) {
        console.log(
          '[UsersService.confirmAccountAction] Stopping: Action not allowed for this company/domain',
        );
        throw new HttpException(
          'You cannot perform this action. Please try again.',
          HttpStatus.UNAUTHORIZED,
        );
      }
      console.log(
        '[UsersService.confirmAccountAction] Starting database updates',
      );
      const [userAndCompany] = await this.db
        .select()
        .from(user_and_company)
        .where(
          and(
            eq(user_and_company.user_id, userRecord.id),
            eq(user_and_company.company_id, companyId),
          ),
        )
        .limit(1);
      if (!userAndCompany) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      await this.db
        .update(user_and_company)
        .set({
          access_status:
            actionType === UserStatus.INACTIVE
              ? AccessStatus.INACTIVE
              : AccessStatus.ACTIVE,
        })
        .where(
          and(
            eq(user_and_company.user_id, userRecord.id),
            eq(user_and_company.company_id, companyId),
          ),
        );
      await this.db
        .update(user)
        .set({ otp: null, otp_expires: null })
        .where(eq(user.id, userRecord.id));
      console.log(
        '[UsersService.confirmAccountAction] Action confirmed and records updated successfully',
      );
      return {
        message:
          actionType === UserStatus.INACTIVE
            ? 'User deactivated successfully'
            : 'User reactivated successfully',
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to deactivate user', {
        cause: error,
      });
    }
  }
}
