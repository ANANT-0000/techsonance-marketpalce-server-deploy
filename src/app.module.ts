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
import { ThrottlerModule } from '@nestjs/throttler';
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
    // ThrottlerModule.forRoot([
    //   {
    //     name: "short",
    //     ttl: 1000,
    //     limit: 3,
    //   },
    //   {
    //     name: "medium",
    //     ttl: 10000,
    //     limit: 20,
    //   },
    //   {
    //     name: "long",
    //     ttl: 60000,
    //     limit: 100,
    //   },
    // ]),
  ],
  controllers: [AppController, UsersController],
  providers: [AppService, UsersService],
})
export class AppModule {}
