import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { ShippingModule } from '../shipping/shipping.module.js';
import { MailModule } from '../../common/services/mail/mail.module.js';
import { OutboxService } from './outbox.service.js';
import { OutboxProcessorController } from './processors/outbox-processor.controller.js';
import { EmailProcessorController } from './processors/email-processor.controller.js';
import { OutboxSweeperController } from './outbox-sweeper.controller.js';

@Module({
  imports: [DrizzleModule, ShippingModule, MailModule, ConfigModule],
  controllers: [
    OutboxProcessorController,
    EmailProcessorController,
    OutboxSweeperController,
  ],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
