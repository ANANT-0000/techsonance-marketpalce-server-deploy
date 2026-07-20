import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../drizzle/drizzle.module.js';
import {
  audit_logs,
  company,
  order_items,
  product_variants,
  products,
  user,
  user_and_company,
  user_roles,
  vendor,
} from '../../drizzle/schema/index.js';
import { type DrizzleDB } from '../../drizzle/types/drizzle.js';
import { AccessStatus, OrderStatus, UserRole } from '../../drizzle/types/types.js';
import { ConfigService } from '@nestjs/config';
import { AdminErrorKeyEnum } from './constants/admin.enums.js';
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
  ): Promise<Record<string, unknown>> {
    if (!email || !password) {
      throw new HttpException(
        AdminErrorKeyEnum.EMAIL_AND_PASSWORD_ARE_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const [adminRole] = await this.db
        .select()
        .from(user_roles)
        .where(eq(user_roles.role_name, UserRole.ADMIN))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException('Failed to fetch admin role details', {
            cause: error,
          });
        });
      const [existingUser] = await this.db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException('Failed to fetch user account details', {
            cause: error,
          });
        });
      if (!existingUser) {
        throw new HttpException(
          AdminErrorKeyEnum.ADMIN_USER_NOT_FOUND,
          HttpStatus.UNAUTHORIZED,
        );
      }

      let [userAndCompany] = await this.db
        .select()
        .from(user_and_company)
        .where(eq(user_and_company.user_id, existingUser.id))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException('Failed to fetch user-company mapping', {
            cause: error,
          });
        });

      if (!userAndCompany) {
        const [firstCompany] = await this.db
          .select()
          .from(company)
          .limit(1)
          .catch((error) => {
            throw new InternalServerErrorException('Failed to fetch system companies', {
              cause: error,
            });
          });

        if (firstCompany) {
          const [insertedRecord] = await this.db
            .insert(user_and_company)
            .values({
              user_id: existingUser.id,
              company_id: firstCompany.id,
              role_id: adminRole.id,
              access_status: AccessStatus.ACTIVE,
            })
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException('Failed to create user-company mapping record', {
                cause: error,
              });
            });
          userAndCompany = insertedRecord;
        }
      }

      const isPasswordValid: boolean =
        password === this.configService.get('ADMIN_PASSWORD');
      if (!isPasswordValid) {
        throw new HttpException(AdminErrorKeyEnum.INVALID_PASSWORD, HttpStatus.UNAUTHORIZED);
      }
      const payload: {
        sub: string;
        email: string;
        role: string;
        company_id?: string;
      } = {
        sub: existingUser.id,
        email: existingUser.email,
        role: adminRole.role_name,
      };

      if (userAndCompany) {
        payload.company_id = userAndCompany.company_id;
      }

      const expiresIn: any = process.env.JWT_EXPIRES_IN
        ? (isNaN(Number(process.env.JWT_EXPIRES_IN)) ? process.env.JWT_EXPIRES_IN : parseInt(process.env.JWT_EXPIRES_IN, 10))
        : '7d';

      const accessToken = await this.jwtService.signAsync(payload, {
        expiresIn,
        secret: process.env.JWT_SECRET || 'defaultSecret',
      });
      const refreshToken = await this.jwtService.signAsync(payload, {
        expiresIn: '7d',
        secret: process.env.JWT_REFRESH_SECRET || 'defaultRefreshTokenSecret',
      });
      const filteredUser = {
        ...existingUser,
        password_hash: undefined,
      };
      return {
        user: filteredUser,
        role: UserRole.ADMIN,
        access_token: accessToken,
        refresh_token: refreshToken,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(AdminErrorKeyEnum.FAILED_TO_LOGIN, {
        cause: error,
      });
    }
  }
  async getTopVendors(limit: number = 5) {
    try {
      const topVendors = await this.db
        .select({
          vendor_id: vendor.id,
          // Assuming vendor ties to user for the name, adjust based on your users.schema.ts
          vendor_name: user.first_name,
          total_revenue: sql<number>`CAST(SUM(${order_items.price} * ${order_items.quantity}) AS FLOAT)`,
          items_sold: sql<number>`CAST(SUM(${order_items.quantity}) AS INTEGER)`,
        })
        .from(order_items)
        .innerJoin(
          product_variants,
          eq(order_items.product_variant_id, product_variants.id),
        )
        .innerJoin(products, eq(product_variants.product_id, products.id))
        .innerJoin(vendor, eq(products.vendor_id, vendor.id))
        .innerJoin(user, eq(vendor.user_id, user.id))
        .where(
          sql`${order_items.order_status} NOT IN (${OrderStatus.CANCELLED}, ${OrderStatus.RETURNED})`,
        )
        .groupBy(vendor.id, user.first_name)
        .orderBy(sql`SUM(${order_items.price} * ${order_items.quantity}) DESC`)
        .limit(limit)
        .catch((error) => {
          throw new InternalServerErrorException('Failed to fetch top vendors data', {
            cause: error,
          });
        });

      return topVendors;
    } catch (error) {
      throw new InternalServerErrorException(AdminErrorKeyEnum.FAILED_TO_FETCH_TOP_VENDORS, {
        cause: error,
      });
    }
  }
  async getAuditLogs(limit: number = 10) {
    const logs = await this.db
      .select()
      .from(audit_logs)
      .innerJoin(user, eq(audit_logs.admin_id, user.id))
      .orderBy(sql`${audit_logs.created_at} DESC`)
      .limit(limit)
      .catch((error) => {
        throw new InternalServerErrorException('Failed to fetch admin audit logs', {
          cause: error,
        });
      });
    // return await this.db.query.audit_logs.findMany({

    //   with: { admin: { columns: { name: true, email: true } } },
    //   orderBy: (logs, { desc }) => [desc(logs.created_at)],
    //   limit,
    // });
  }

  async logAdminAction(
    adminId: string,
    action: string,
    entityType: string,
    entityId?: string,
    details?: any,
  ) {
    // await this.db.insert(audit_logs).values({
    //   admin_id: adminId,
    //   action,
    //   entity_type: entityType,
    //   entity_id: entityId || '',
    //   details,
    // });
  }

  async getTicketsOverview() {
    // Aggregate ticket statuses (Replace 'support_tickets' with your actual Drizzle table variable)
    /*
  const stats = await this.db
    .select({
      status: support_tickets.status,
      count: sql<number>`CAST(COUNT(${support_tickets.id}) AS INTEGER)`
    })
    .from(support_tickets)
    .groupBy(support_tickets.status);
    
  const recentTickets = await this.db.query.support_tickets.findMany({
    orderBy: (tickets, { desc }) => [desc(tickets.created_at)],
    limit: 5
  });

  return { stats, recentTickets };
  */
  }
}
