import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { notification_settings } from '../../drizzle/schema';
import { NotificationSettingsErrorKeyEnum } from './constants/notification-settings.enums';

@Injectable()
export class NotificationSettingsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}

  async getSettings(userId: string) {
    try {
      let settings = await this.db.query.notification_settings.findFirst({
        where: eq(notification_settings.user_id, userId),
      });

      if (!settings) {
        // Return defaults if not created yet
        const [defaultSettings] = await this.db
          .insert(notification_settings)
          .values({
            user_id: userId,
            email_tickets: true,
            email_orders: true,
            email_returns: true,
            email_newsletters: false,
            in_app_notifications: true,
          })
          .returning();
        settings = defaultSettings;
      }

      return settings;
    } catch (error) {
      throw new InternalServerErrorException(NotificationSettingsErrorKeyEnum.FAILED_TO_FETCH_NOTIFICATION_SETTINGS);
    }
  }

  async updateSettings(
    userId: string,
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
    try {
      // Check if they exist
      const existing = await this.db.query.notification_settings.findFirst({
        where: eq(notification_settings.user_id, userId),
      });

      if (existing) {
        const [updated] = await this.db
          .update(notification_settings)
          .set({
            ...data,
            updated_at: new Date(),
          })
          .where(eq(notification_settings.user_id, userId))
          .returning();
        return updated;
      } else {
        const [created] = await this.db
          .insert(notification_settings)
          .values({
            user_id: userId,
            email_tickets: data.email_tickets ?? true,
            email_orders: data.email_orders ?? true,
            email_returns: data.email_returns ?? true,
            email_newsletters: data.email_newsletters ?? false,
            in_app_notifications: data.in_app_notifications ?? true,
            quiet_hours_start: data.quiet_hours_start || null,
            quiet_hours_end: data.quiet_hours_end || null,
          })
          .returning();
        return created;
      }
    } catch (error) {
      throw new InternalServerErrorException(NotificationSettingsErrorKeyEnum.FAILED_TO_UPDATE_NOTIFICATION_SETTINGS);
    }
  }
}
