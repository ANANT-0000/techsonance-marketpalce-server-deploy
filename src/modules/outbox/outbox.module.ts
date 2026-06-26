import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { ShippingModule } from '../shipping/shipping.module';
import { MailModule } from '../../common/services/mail/mail.module';
import { OutboxService } from './outbox.service';
import { OutboxProcessorController } from './processors/outbox-processor.controller';
import { EmailProcessorController } from './processors/email-processor.controller';
import { OutboxSweeperController } from './services/outbox-sweeper.controller';

@Module({
  imports: [DrizzleModule, ShippingModule, MailModule, ConfigModule],
  controllers: [OutboxProcessorController, EmailProcessorController, OutboxSweeperController],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}

