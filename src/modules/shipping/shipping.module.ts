import { forwardRef, Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { ShippingWebhookController } from './shipping-webhook.controller';
import { ShippingManagerService } from './shipping-manager.service';
import { CryptoService } from './crypto.service';
import { ShipRocketModule } from '../ship-rocket/ship-rocket.module';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';
import { MailModule } from '../../common/services/mail/mail.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    ShipRocketModule,
    DrizzleModule,
    forwardRef(() => CompanyModule),
    MailModule,
    forwardRef(() => InventoryModule),
  ],
  controllers: [ShippingController, ShippingWebhookController],
  providers: [ShippingService, ShippingManagerService, CryptoService],
  exports: [ShippingService, ShippingManagerService, CryptoService],
})
export class ShippingModule {}
