import {
  Controller,
  Post,
  Req,
  Body,
  Logger,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Receiver } from '@upstash/qstash';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators/public.decorator.js';
import { MailService } from '../../../common/services/mail/mail.service.js';
import { OUTBOX_CONSTANTS } from '../constants/outbox.constants.js';

interface EmailJobPayload {
  to: string;
  subject: string;
  html: string;
}

@Controller({
  version: OUTBOX_CONSTANTS.INTERNAL_VERSION,
  path: OUTBOX_CONSTANTS.INTERNAL_PATH,
})
export class EmailProcessorController {
  private readonly logger = new Logger(EmailProcessorController.name);
  private readonly receiver: Receiver | null = null;

  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    const currentSigningKey = this.configService.get<string>(
      'QSTASH_CURRENT_SIGNING_KEY',
    );
    const nextSigningKey = this.configService.get<string>(
      'QSTASH_NEXT_SIGNING_KEY',
    );

    if (currentSigningKey) {
      this.receiver = new Receiver({
        currentSigningKey,
        nextSigningKey: nextSigningKey || '',
      });
    } else {
      this.logger.warn(
        'QSTASH_CURRENT_SIGNING_KEY not configured — email processor signature verification bypassed.',
      );
    }
  }

  @Public()
  @Post(OUTBOX_CONSTANTS.ROUTE_PROCESS_EMAIL)
  @HttpCode(HttpStatus.OK)
  async processEmail(@Req() req: Request, @Body() body: EmailJobPayload) {
    // ── Signature Verification ─────────────────────────────────────────────
    if (this.receiver) {
      const signature = req.headers[
        OUTBOX_CONSTANTS.HEADER_UPSTASH_SIGNATURE
      ] as string;

      if (!signature) {
        throw new UnauthorizedException(
          `Missing ${OUTBOX_CONSTANTS.HEADER_UPSTASH_SIGNATURE} header`,
        );
      }

      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        throw new UnauthorizedException(
          'Signature verification failed: raw body missing',
        );
      }

      try {
        const isValid = await this.receiver.verify({
          signature,
          body: rawBody.toString('utf-8'),
        });

        if (!isValid) {
          throw new UnauthorizedException('Invalid QStash signature');
        }
      } catch (err: any) {
        if (err instanceof UnauthorizedException) throw err;
        throw new UnauthorizedException(
          `Signature verification failed: ${err.message}`,
        );
      }
    }

    // ── Payload Validation ─────────────────────────────────────────────────
    if (!body?.to || !body?.subject || !body?.html) {
      this.logger.error('Email job payload is missing required fields', body);
      // Return 200 so QStash does not retry a permanently invalid job
      return { success: false, message: 'Invalid email payload — skipped' };
    }

    // ── Email Delivery ─────────────────────────────────────────────────────
    try {
      await this.mailService.sendEmail(body.to, body.subject, body.html);
      this.logger.log(`Email delivered successfully to ${body.to}`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(
        `Email delivery failed for ${body.to}: ${err.message}`,
        err.stack,
      );
      // Throw 500 so QStash retries according to its retry policy
      throw new HttpException(
        `Email delivery failed: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
