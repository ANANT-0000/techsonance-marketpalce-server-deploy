import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DrizzleModule } from './drizzle/drizzle.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersService } from './modules/users/users.service.js';
import { UsersController } from './modules/users/users.controller.js';
import { UsersModule } from './modules/users/users.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { VendorsModule } from './modules/vendors/vendors.module.js';
import { TicketsModule } from './modules/tickets/tickets.module.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminModule } from './modules/admin/admin.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { MailModule } from './common/services/mail/mail.module.js';
import { AddressModule } from './modules/address/address.module.js';
import { CategoryModule } from './modules/category/category.module.js';
import { CloudinaryModule } from './utils/cloudinary/cloudinary.module.js';
import { ProductReviewModule } from './modules/product-review/product-review.module.js';
import { PermissionsModule } from './modules/permissions/permissions.module.js';
import { ProductVariantModule } from './modules/product-variant/product-variant.module.js';
import { UploadToCloudModule } from './utils/upload-to-cloud/upload-to-cloud.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { WishlistModule } from './modules/wishlist/wishlist.module.js';
import { ShippingModule } from './modules/shipping/shipping.module.js';
import { CheckoutModule } from './modules/checkout/checkout.module.js';
import { CouponModule } from './modules/coupon/coupon.module.js';
import { CompanyModule } from './modules/company/company.module.js';
import { WarehouseModule } from './modules/warehouse/warehouse.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { RefundsModule } from './modules/refunds/refunds.module.js';
import { OrderItemsModule } from './modules/order-items/order-items.module.js';
import { ReturnsModule } from './modules/returns/returns.module.js';
import { FinancesModule } from './modules/finances/finances.module.js';
import { InvoiceModule } from './modules/invoice/invoice.module.js';
import { ProductPoliciesModule } from './modules/product-policies/product-policies.module.js';
import { CompanyIdentityModule } from './modules/company-identity/company-identity.module.js';
import { TemplateModule } from './modules/template/template.module.js';
import { DrizzleHealthIndicator } from './drizzle/drizzle.health.js';
import { TerminusModule } from '@nestjs/terminus';
import { PromotionsModule } from './modules/promotions/promotions.module.js';
import { BannersModule } from './modules/banners/banners.module.js';
import { AudiencesModule } from './modules/audiences/audiences.module.js';
import { ComplianceModule } from './modules/compliance/compliance.module.js';
import { SubscriptionModule } from './modules/subscription/subscription.module.js';
import { CmsModule } from './modules/cms/cms.module.js';
import { HelpArticlesModule } from './modules/help-articles/help-articles.module.js';
import { NavbarModule } from './modules/navbar/navbar.module.js';
import { FeedbackModule } from './modules/feedback/feedback.module.js';
import { NotificationSettingsModule } from './modules/notification-settings/notification-settings.module.js';
import { APP_GUARD } from '@nestjs/core';
import { SubscriptionGuard } from './modules/subscription/subscription.guard.js';
import { TraceModule } from './modules/trace/trace.module.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CustomersModule } from './modules/customers/customers.module.js';
import { SiteMapsModule } from './modules/site-maps/site-maps.module.js';
import { ShipRocketModule } from './modules/ship-rocket/ship-rocket.module.js';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { OutboxModule } from './modules/outbox/outbox.module.js';

import { PaymentModule } from './modules/vendors/payment/payment.module.js';
import { LandingPageModule } from './modules/landing-page/landing-page.module.js';
import { LogsController } from './common/logger/logs.controller.js';

export enum RATELIMIT_NAME {
  SHORT = 'short',
  MEDIUM = 'medium',
}
export enum RATELIMIT_TIME {
  SHORT = 1000,
  MEDIUM = 60_000,
}
export enum RATELIMIT_LIMIT {
  SHORT = 10,
  MEDIUM = 100,
}
@Module({
  imports: [
    AuthModule,
    ThrottlerModule.forRoot([
      {
        name: RATELIMIT_NAME.SHORT,
        ttl: RATELIMIT_TIME.SHORT,
        limit: RATELIMIT_LIMIT.SHORT,
      },
      {
        name: RATELIMIT_NAME.MEDIUM,
        ttl: RATELIMIT_TIME.MEDIUM,
        limit: RATELIMIT_LIMIT.MEDIUM,
      },
    ]),
    DrizzleModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    VendorsModule,
    TicketsModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const store = await redisStore({
          // socket: {
          // host: config.get<string>('REDIS_HOST', 'localhost') as string,
          // port: config.get<number>('REDIS_PORT', 6379) as number,
          // tls: (
          //   config.get<string>('REDIS_HOST', 'localhost') as string
          // ).includes('localhost')
          //   ? undefined
          //   : true,
          // },
          // password: config.get<string>('REDIS_PASSWORD') as string,
          url: config.get<string>('REDIS_URL'),
        });

        store.client.on('error', () => {});

        return { store };
      },
    }),
    AdminModule,
    RolesModule,
    MailModule,
    AddressModule,
    CategoryModule,
    CloudinaryModule,
    ProductReviewModule,
    PermissionsModule,
    ProductVariantModule,
    UploadToCloudModule,
    CartModule,
    WishlistModule,
    ShippingModule,
    CheckoutModule,
    CouponModule,
    CompanyModule,
    WarehouseModule,
    InventoryModule,
    RefundsModule,
    OrderItemsModule,
    ReturnsModule,
    FinancesModule,
    InvoiceModule,
    ProductPoliciesModule,
    CompanyIdentityModule,
    TemplateModule,
    TerminusModule,
    PromotionsModule,
    BannersModule,
    AudiencesModule,
    ComplianceModule,
    SubscriptionModule,
    CmsModule,
    NavbarModule,
    HelpArticlesModule,
    FeedbackModule,
    NotificationSettingsModule,
    ...(process.env.NODE_ENV !== 'production' ? [TraceModule] : []),
    CustomersModule,
    SiteMapsModule,
    ShipRocketModule,
    OutboxModule,
    PaymentModule,
    LandingPageModule,
  ],
  controllers: [AppController, UsersController, LogsController],
  providers: [
    AppService,
    UsersService,
    DrizzleHealthIndicator,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class AppModule {}
