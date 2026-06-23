import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DrizzleModule } from './drizzle/drizzle.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersService } from './modules/users/users.service';
import { UsersController } from './modules/users/users.controller';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminModule } from './modules/admin/admin.module';
import { RolesModule } from './modules/roles/roles.module';
import { MailModule } from './common/services/mail/mail.module';
import { AddressModule } from './modules/address/address.module';
import { CategoryModule } from './modules/category/category.module';
import { CloudinaryModule } from './utils/cloudinary/cloudinary.module';
import { ProductReviewModule } from './modules/product-review/product-review.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { ProductVariantModule } from './modules/product-variant/product-variant.module';
import { UploadToCloudModule } from './utils/upload-to-cloud/upload-to-cloud.module';
import { CartModule } from './modules/cart/cart.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { CompanyModule } from './modules/company/company.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { RefundsModule } from './modules/refunds/refunds.module';
import { OrderItemsModule } from './modules/order-items/order-items.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { FinancesModule } from './modules/finances/finances.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { ProductPoliciesModule } from './modules/product-policies/product-policies.module';
import { CompanyIdentityModule } from './modules/company-identity/company-identity.module';
import { TemplateModule } from './modules/template/template.module';
import { DrizzleHealthIndicator } from './drizzle/drizzle.health';
import { TerminusModule } from '@nestjs/terminus';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { BannersModule } from './modules/banners/banners.module';
import { AudiencesModule } from './modules/audiences/audiences.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { CmsModule } from './modules/cms/cms.module';
import { HelpArticlesModule } from './modules/help-articles/help-articles.module';
import { NavbarModule } from './modules/navbar/navbar.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { NotificationSettingsModule } from './modules/notification-settings/notification-settings.module';
import { APP_GUARD } from '@nestjs/core';
import { SubscriptionGuard } from './modules/subscription/subscription.guard';
import { TraceModule } from './modules/trace/trace.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CustomersModule } from './modules/customers/customers.module';
import { SiteMapsModule } from './modules/site-maps/site-maps.module';
import { ShipRocketModule } from './modules/ship-rocket/ship-rocket.module';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
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

        store.client.on('error', (err) => {
          console.error('Redis Client Error:', err.message || err);
        });

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
    NavbarModule,
    SiteMapsModule,
    ShipRocketModule,
  ],
  controllers: [AppController, UsersController],
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
