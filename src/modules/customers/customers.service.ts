import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  user as userTable,
  address as addressTable,
  orders,
  wishlist,
  wishlist_items,
  product_reviews,
  company as companyTable,
} from '../../drizzle/schema';
import { eq, and, count } from 'drizzle-orm';
import { formatCompanyDomain } from '../../common/filters/formatDomain.filter';
import { UserStatus } from '../../drizzle/types/types';

import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CompanyService } from '../company/company.service';
import { ComplianceErrorKeyEnum } from '../compliance/constants/compliance.enums';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleService,
    private companyService: CompanyService,
  ) {}
  private async resolveCompanyId(domain: string): Promise<string> {
    const filtered = domainExtractor(domain);
    const id = await this.companyService.find(filtered);
    if (!id)
      throw new HttpException(
        ComplianceErrorKeyEnum.COMPANY_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return id;
  }
  async getDashboardData(userId: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      // Get user profile
      const [userProfile] = await this.db
        .select()
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to fetch user profile',
            { cause: error },
          );
        });

      if (!userProfile) {
        throw new NotFoundException('User not found');
      }

      // Get total orders count
      const [ordersCountResult] = await this.db
        .select({ value: count() })
        .from(orders)
        .where(
          and(eq(orders.user_id, userId), eq(orders.company_id, companyId)),
        );

      // Get wishlist count
      // We need to join wishlist and wishlist_items
      const [wishlistCountResult] = await this.db
        .select({ value: count(wishlist_items.id) })
        .from(wishlist_items)
        .innerJoin(wishlist, eq(wishlist.id, wishlist_items.wishlist_id))
        .where(
          and(eq(wishlist.user_id, userId), eq(wishlist.company_id, companyId)),
        );

      // Get reviews count
      const [reviewsCountResult] = await this.db
        .select({ value: count() })
        .from(product_reviews)
        .where(
          and(
            eq(product_reviews.user_id, userId),
            eq(product_reviews.company_id, companyId),
          ),
        );

      // Get default address
      const [addressResult] = await this.db
        .select()
        .from(addressTable)
        .where(
          and(
            eq(addressTable.user_id, userId),
            eq(addressTable.is_default, true),
          ),
        )
        .limit(1);

      // Build the response payload
      return {
        profile: {
          id: userProfile.id,
          firstName: userProfile.first_name,
          lastName: userProfile.last_name,
          email: userProfile.email,
          phoneNumber: userProfile.phone_number,
          avatarUrl: userProfile.profile_picture_url,
          memberSinceDate: userProfile.created_at.toISOString(),
          verification: {
            isVerified: userProfile.user_status === UserStatus.ACTIVE,
            verificationDate: userProfile.updated_at.toISOString(),
          },
        },
        stats: {
          totalOrders: ordersCountResult?.value || 0,
          wishlistCount: wishlistCountResult?.value || 0,
          reviewsCount: reviewsCountResult?.value || 0,
        },
        addressesInfo: {
          hasDefaultAddress: !!addressResult,
          defaultAddress: addressResult?.is_default
            ? {
                id: addressResult.id,
                street: addressResult.address_line_1,
                city: addressResult.city,
                state: addressResult.state,
                postalCode: addressResult.postal_code,
                country: addressResult.country,
                formattedAddress: `${addressResult.address_line_1}, ${addressResult.city}, ${addressResult.state} ${addressResult.postal_code}`,
              }
            : null,
        },
        securityStatus: {
          passwordLastUpdated: userProfile.updated_at.toISOString(),
          mfaEnabled: false, // Currently not supported in schema
        },
        notificationsPreferences: {
          emailAlertsEnabled: true,
          pushAlertsEnabled: false,
          smsAlertsEnabled: false,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to fetch customer dashboard data',
        { cause: error },
      );
    }
  }
}
