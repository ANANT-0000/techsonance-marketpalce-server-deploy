import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@upstash/qstash';
import { OUTBOX_CONSTANTS } from './constants/outbox.constants';

@Injectable()
export class OutboxService {
  private readonly client: Client;
  private readonly callbackBaseUrl: string;
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly configService: ConfigService) {
    const qstashToken = this.configService.get<string>('QSTASH_TOKEN');
    this.callbackBaseUrl = this.configService.get<string>('QSTASH_CALLBACK_BASE_URL') || '';

    if (!qstashToken) {
      this.logger.error('QSTASH_TOKEN is not configured in environment variables.');
    }

    this.client = new Client({
      token: qstashToken || '',
    });
  }

  /**
   * Publishes a message to QStash to trigger the background processing of a Shiprocket order sync.
   * QStash will call back POST /api/v1/internal/process-shipment
   */
  async publishShiprocketJob(outboxId: string): Promise<void> {
    if (!this.callbackBaseUrl) {
      this.logger.error('QSTASH_CALLBACK_BASE_URL is not configured. Cannot publish QStash job.');
      return;
    }

    // Dynamic URL generation using OUTBOX_CONSTANTS
    const callbackUrl = `${this.callbackBaseUrl}/api/v1/${OUTBOX_CONSTANTS.INTERNAL_PATH}/${OUTBOX_CONSTANTS.ROUTE_PROCESS_SHIPMENT}`;
    this.logger.log(`Publishing QStash job for outbox ID ${outboxId} targeting: ${callbackUrl}`);

    try {
      await this.client.publishJSON({
        url: callbackUrl,
        body: { outboxId },
        retries: OUTBOX_CONSTANTS.DEFAULT_RETRY_LIMIT,
      });
      this.logger.log(`Successfully published outbox job ${outboxId} to QStash`);
    } catch (err: any) {
      this.logger.error(
        `Failed to publish outbox job ${outboxId} to QStash: ${err?.message || err}`,
        err?.stack,
      );
    }
  }

  /**
   * Publishes a one-shot QStash job to deliver an email via the email processor endpoint.
   * QStash handles retries automatically. No outbox_jobs DB row is created.
   */
  async publishEmailJob(payload: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (!this.callbackBaseUrl) {
      this.logger.error('QSTASH_CALLBACK_BASE_URL is not configured. Cannot publish email job.');
      return;
    }

    const callbackUrl = `${this.callbackBaseUrl}/api/v1/${OUTBOX_CONSTANTS.INTERNAL_PATH}/${OUTBOX_CONSTANTS.ROUTE_PROCESS_EMAIL}`;

    try {
      await this.client.publishJSON({
        url: callbackUrl,
        body: payload,
        retries: OUTBOX_CONSTANTS.DEFAULT_RETRY_LIMIT,
      });
      this.logger.log(`Published email job to QStash (to: ${payload.to})`);
    } catch (err: any) {
      this.logger.error(
        `Failed to publish email job to QStash: ${err?.message || err}`,
        err?.stack,
      );
    }
  }
}
