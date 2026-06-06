import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { NotificationSettingsService } from './notification-settings.service';

@Controller({ version: '1', path: 'users/:userId/notification-settings' })
export class NotificationSettingsController {
  constructor(private readonly notificationSettingsService: NotificationSettingsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getSettings(@Param('userId') userId: string) {
    return this.notificationSettingsService.getSettings(userId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @Param('userId') userId: string,
    @Body()
    data: {
      email_tickets?: boolean;
      email_orders?: boolean;
      email_returns?: boolean;
      email_newsletters?: boolean;
      in_app_notifications?: boolean;
      quiet_hours_start?: string;
      quiet_hours_end?: string;
    },
  ) {
    return this.notificationSettingsService.updateSettings(userId, data);
  }
}
