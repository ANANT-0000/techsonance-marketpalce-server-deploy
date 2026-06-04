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
import { ConfigModule } from '@nestjs/config';
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
import { APP_GUARD } from '@nestjs/core';
import { SubscriptionGuard } from './modules/subscription/subscription.guard';

@Module({
  imports: [
    DrizzleModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    VendorsModule,
    TicketsModule,
    ConfigModule.forRoot({
      isGlobal: true,
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
  ],
  controllers: [AppController, UsersController],
  providers: [
    AppService,
    UsersService,
    DrizzleHealthIndicator,
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
  ],
})
export class AppModule {}
