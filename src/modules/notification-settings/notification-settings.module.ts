import { Module } from '@nestjs/common';
import { NotificationSettingsService } from './notification-settings.service.js';
import { NotificationSettingsController } from './notification-settings.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';

@Module({
  imports: [DrizzleModule],
  controllers: [NotificationSettingsController],
  providers: [NotificationSettingsService],
  exports: [NotificationSettingsService],
})
export class NotificationSettingsModule {}
