import { forwardRef, Module } from '@nestjs/common';
import { ShippingService } from './shipping.service.js';
import { ShippingController } from './shipping.controller.js';
import { ShippingWebhookController } from './shipping-webhook.controller.js';
import { ShippingManagerService } from './shipping-manager.service.js';
import { CryptoService } from './crypto.service.js';
import { ShipRocketModule } from '../ship-rocket/ship-rocket.module.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';
import { MailModule } from '../../common/services/mail/mail.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';

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
