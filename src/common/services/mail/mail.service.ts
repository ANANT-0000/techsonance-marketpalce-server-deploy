import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { refresh_tokens } from 'src/drizzle/schema';
import { user } from 'src/drizzle/schema/users.schema';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import * as nodemailer from 'nodemailer';
import { BadRequestException } from '@nestjs/common';
import { userRegistrationTemplate } from './templates/user-registration.template';
import { vendorRegistrationTemplate } from './templates/vendor-registration.template';
import { orderPlacedTemplate } from './templates/order-placed.template';
import { orderCancelledTemplate } from './templates/order-cancelled.template';
import { orderReturnTemplate } from './templates/order-return.template';
import { orderReplacementTemplate } from './templates/order-replacement-approve.template';
import { returnRequestedTemplate } from './templates/return-requested.template';
import { replacementRequestedTemplate } from './templates/replacement-requested.template';
import { orderShippedTemplate } from './templates/order-shipped.template';
@Injectable()
export class MailService {
  nodeMailerTransporter: nodemailer.Transporter;
  constructor(
    @Inject(DRIZZLE) private readonly drizzle: DrizzleDB,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.nodeMailerTransporter = nodemailer.createTransport({
      host: configService.get<string>('MAIL_HOST'),
      port: configService.get<number>('MAIL_PORT'),
      secure: configService.get<boolean>('MAIL_SECURE'),
      auth: {
        user: configService.get<string>('MAIL_USER'),
        pass: configService.get<string>('MAIL_PASS'),
      },
    });
  }
  public async sendResetPasswordEmail(email: string): Promise<void> {
    const expiresIn = parseInt(
      this.configService.get<string>('JWT_EXPIRES_IN') || '3600',
      10,
    ); // Default to 1 hour
    const [userExists] = await this.drizzle
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (!userExists) {
      throw new Error('User not found');
    }
    const token = this.jwtService.sign(
      { userExists },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn,
      },
    );
    const updatedTokenHash = await this.drizzle
      .update(refresh_tokens)
      .set({
        token_hash: token,
      })
      .where(
        and(
          eq(refresh_tokens.user_id, userExists.id),
          eq(refresh_tokens.is_revoked, false),
        ),
      )
      .returning();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.sendEmail(
      email,
      'Password Reset Request',
      `<p>You requested a password reset. Click the link below to reset your password:</p>
         <a href="${this.configService.get<string>('REDIRECT_TO_LOGIN')}?token=${updatedTokenHash[0].token_hash}">Reset Password</a>
         <p>This link will expire in ${expiresIn / 3600} hour(s).</p>`,
    );
  }
  public async sendEmail(to: string, subject: string, html: string) {
    const mailOptions = {
      from: `${this.configService.get<string>('MAIL_FROM_NAME')} <${this.configService.get<string>('MAIL_FROM_EMAIL')}>`,
      to,
      subject,
      html,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await this.nodeMailerTransporter.sendMail(mailOptions);
  }
  public verifyResetToken(token: string): string {
    try {
      const decoded = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      if (
        typeof decoded === 'object' &&
        decoded !== null &&
        'email' in decoded
      ) {
        return decoded?.email as string;
      }

      // If the payload is valid JWT but missing the email field
      throw new BadRequestException('Invalid token payload structure.');
    } catch (error: any) {
      // 1. Handle Expired Tokens
      if (error?.name === 'TokenExpiredError') {
        throw new BadRequestException(
          'Token has expired. Please request a new password reset link.',
        );
      }
      throw new UnauthorizedException('Invalid or malformed token.');
    }
  }
  public async sendUserWelcomeEmail(email: string, userName: string, verificationUrl?: string) {
    const html = userRegistrationTemplate(userName, verificationUrl);
    return this.sendEmail(email, 'Welcome to Techsonance Marketplace!', html);
  }

  public async sendVendorRegistrationEmail(email: string, storeName: string) {
    const html = vendorRegistrationTemplate(storeName);
    return this.sendEmail(email, 'Vendor Registration Received - Techsonance', html);
  }

  async sendOrderPlacedEmail(email: string, customerName: string, orderId: string, totalAmount: number) {
    const html = orderPlacedTemplate(customerName, orderId, totalAmount);
    return this.sendEmail(email, `Order Confirmed: #${orderId}`, html);
  }

  async sendOrderReturnEmail(email: string, customerName: string, orderId: string) {
    const html = orderReturnTemplate(customerName, orderId);
    return this.sendEmail(email, `Return Initiated: #${orderId}`, html);
  }
  async sendReturnRequestedEmail(email: string, customerName: string, orderId: string) {
    const html = returnRequestedTemplate(customerName, orderId);
    return this.sendEmail(email, `Return Request Received: #${orderId}`, html);
  }

  async sendReplacementRequestedEmail(email: string, customerName: string, orderId: string) {
    const html = replacementRequestedTemplate(customerName, orderId);
    return this.sendEmail(email, `Replacement Request Received: #${orderId}`, html);
  }
  async sendOrderReplacementEmail(email: string, customerName: string, orderId: string) {
    const html = orderReplacementTemplate(customerName, orderId);
    return this.sendEmail(email, `Replacement Approved: #${orderId}`, html);
  }

  async sendOrderCancelledEmail(email: string, customerName: string, orderId: string, refundInitiated: boolean) {
    const html = orderCancelledTemplate(customerName, orderId, refundInitiated);
    return this.sendEmail(email, `Order Cancelled: #${orderId}`, html);
  }
  async sendOrderShippedEmail(
    email: string,
    customerName: string,
    orderId: string,
    trackingUrl: string,
    itemName?: string
  ) {
    const html = orderShippedTemplate(customerName, orderId,trackingUrl, itemName);
    return this.sendEmail(email, `Your Order #${orderId} has Shipped 🚚`, html);
  }
}
