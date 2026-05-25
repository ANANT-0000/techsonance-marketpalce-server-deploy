import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../../drizzle/drizzle.module';
import { refresh_tokens } from '../../../drizzle/schema';
import { user } from '../../../drizzle/schema/users.schema';
import { type DrizzleDB } from '../../../drizzle/types/drizzle';
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
import { passwordResetOtpTemplate } from './templates/password-reset-otp.template';
import { vendorApprovalTemplate } from './templates/vendor-approval.template';
import { deactivateAccountOtpTemplate } from './templates/account-deactivation-otp.template';
import { reactivateAccountOtpTemplate } from './templates/account-reactivate-otp.template';
import * as nodemailer from 'nodemailer';
@Injectable()
export class MailService {
  nodeMailerTransporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);
  // private readonly fromEmail: string;
  // private readonly oauth2Client;
  constructor(
    @Inject(DRIZZLE) private readonly drizzle: DrizzleDB,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.nodeMailerTransporter = nodemailer.createTransport({
      host: configService.get<string>('MAIL_HOST'),
      port: configService.get<number>('MAIL_PORT'),
      secure: configService.get<boolean>('MAIL_SECURE'),
      auth: {
        user: configService.get<string>('MAIL_USER'),
        pass: configService.get<string>('MAIL_PASS'),
      },
    });

    // this.fromEmail = this.configService.getOrThrow<string>('MAIL_USER');

    // Uses HTTPS under the hood — not blocked by Render
    // this.oauth2Client = new google.auth.OAuth2(
    //   this.configService.getOrThrow<string>('OAUTH_CLIENT_ID'),
    //   this.configService.getOrThrow<string>('OAUTH_CLIENT_SECRET'),
    //   'https://developers.google.com/oauthplayground',
    // );

    // this.oauth2Client.setCredentials({
    //   refresh_token: this.configService.getOrThrow<string>(
    //     'OAUTH_REFRESH_TOKEN',
    //   ),
    // });
  }
  // private async createTransporter(): Promise<nodemailer.Transporter> {
  //   // Fetches a fresh access token via HTTPS each time — never expires
  //   const { token: accessToken } = await this.oauth2Client.getAccessToken();

  //   if (!accessToken) {
  //     throw new Error('Failed to get Gmail OAuth access token');
  //   }

  //   return nodemailer.createTransport({
  //     service: 'gmail',
  //     auth: {
  //       type: 'OAuth2',
  //       user: this.fromEmail,
  //       clientId: this.configService.getOrThrow<string>('OAUTH_CLIENT_ID'),
  //       clientSecret: this.configService.getOrThrow<string>(
  //         'OAUTH_CLIENT_SECRET',
  //       ),
  //       refreshToken: this.configService.getOrThrow<string>(
  //         'OAUTH_REFRESH_TOKEN',
  //       ),
  //       accessToken,
  //     },
  //   });
  // }
  public async sendResetPasswordEmail(email: string) {
    console.log(
      `[MailService.sendResetPasswordEmail] Request received for email: ${email}`,
    );
    const expiresIn = parseInt(
      this.configService.get<string>('JWT_EXPIRES_IN') || '3600',
      10,
    ); // Default to 1 hour
    console.log(
      '[MailService.sendResetPasswordEmail] Looking up user and preparing reset token',
    );
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
    console.log('[MailService.sendResetPasswordEmail] Sending password reset email');
    return await this.sendEmail(
      email,
      'Password Reset Request',
      `<p>You requested a password reset. Click the link below to reset your password:</p>
         <a href="${this.configService.get<string>('REDIRECT_TO_LOGIN')}?token=${updatedTokenHash[0].token_hash}">Reset Password</a>
         <p>This link will expire in ${expiresIn / 3600} hour(s).</p>`,
    );
  }
  public async sendEmail(to: string, subject: string, html: string) {
    console.log(
      `[MailService.sendEmail] Sending email to ${to} with subject: ${subject}`,
    );
    const mailOptions = {
      from: `${this.configService.get<string>('MAIL_FROM_NAME')} <${this.configService.get<string>('MAIL_FROM_EMAIL')}>`,
      to,
      subject,
      html,
    };
    // const transporter = await this.createTransporter();

    // const resend = new Resend(this.configService.get<string>('RESEND_KEY'));

    // return await transporter.sendMail(mailOptions).catch((error) => {
    //   console.error('Error sending email:', error);
    //   throw new Error('Failed to send email. Please try again later.');
    // });
    return await this.nodeMailerTransporter
      .sendMail(mailOptions)
      .catch((error) => {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email. Please try again later.');
      });
  }
  public verifyResetToken(token: string): string {
    try {
      console.log('[MailService.verifyResetToken] Verifying reset token');
      // @ts-ignore
      const decoded: any = this.jwtService.verify(token, {
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
  public async sendUserWelcomeEmail(
    email: string,
    userName: string,
    verificationUrl?: string,
  ) {
    console.log(
      `[MailService.sendUserWelcomeEmail] Preparing welcome email for ${email}`,
    );
    const html = userRegistrationTemplate(userName, verificationUrl);
    return this.sendEmail(email, 'Welcome to Techsonance Marketplace!', html);
  }

  public async sendVendorRegistrationEmail(email: string, storeName: string) {
    console.log(
      `[MailService.sendVendorRegistrationEmail] Preparing vendor registration email for ${email}`,
    );
    const html = vendorRegistrationTemplate(storeName);
    return await this.sendEmail(
      email,
      'Vendor Registration Received - Techsonance',
      html,
    );
  }
  public async sendVendorApprovalEmail(email: string, storeName: string) {
    console.log(
      `[MailService.sendVendorApprovalEmail] Preparing vendor approval email for ${email}`,
    );
    const html = vendorApprovalTemplate(storeName);
    return this.sendEmail(
      email,
      'Vendor Approval - Techsonance Marketplace',
      html,
    );
  }

  async sendOrderPlacedEmail(
    email: string,
    customerName: string,
    orderId: string,
    totalAmount: number,
  ) {
    console.log(
      `[MailService.sendOrderPlacedEmail] Preparing order placed email for orderId: ${orderId}`,
    );
    const html = orderPlacedTemplate(customerName, orderId, totalAmount);
    return await this.sendEmail(email, `Order Confirmed: #${orderId}`, html);
  }

  async sendOrderReturnEmail(
    email: string,
    customerName: string,
    orderId: string,
  ) {
    console.log(
      `[MailService.sendOrderReturnEmail] Preparing order return email for orderId: ${orderId}`,
    );
    const html = orderReturnTemplate(customerName, orderId);
    return this.sendEmail(email, `Return Initiated: #${orderId}`, html);
  }
  async sendReturnRequestedEmail(
    email: string,
    customerName: string,
    orderId: string,
  ) {
    console.log(
      `[MailService.sendReturnRequestedEmail] Preparing return requested email for orderId: ${orderId}`,
    );
    const html = returnRequestedTemplate(customerName, orderId);
    return this.sendEmail(email, `Return Request Received: #${orderId}`, html);
  }

  async sendReplacementRequestedEmail(
    email: string,
    customerName: string,
    orderId: string,
  ) {
    console.log(
      `[MailService.sendReplacementRequestedEmail] Preparing replacement requested email for orderId: ${orderId}`,
    );
    const html = replacementRequestedTemplate(customerName, orderId);
    return this.sendEmail(
      email,
      `Replacement Request Received: #${orderId}`,
      html,
    );
  }
  async sendOrderReplacementEmail(
    email: string,
    customerName: string,
    orderId: string,
  ) {
    console.log(
      `[MailService.sendOrderReplacementEmail] Preparing order replacement email for orderId: ${orderId}`,
    );
    const html = orderReplacementTemplate(customerName, orderId);
    return this.sendEmail(email, `Replacement Approved: #${orderId}`, html);
  }

  async sendOrderCancelledEmail(
    email: string,
    customerName: string,
    orderId: string,
    refundInitiated: boolean,
  ) {
    console.log(
      `[MailService.sendOrderCancelledEmail] Preparing order cancelled email for orderId: ${orderId}`,
    );
    const html = orderCancelledTemplate(customerName, orderId, refundInitiated);
    return this.sendEmail(email, `Order Cancelled: #${orderId}`, html);
  }
  async sendOrderShippedEmail(
    email: string,
    customerName: string,
    orderId: string,
    trackingUrl: string,
    itemName?: string,
  ) {
    console.log(
      `[MailService.sendOrderShippedEmail] Preparing order shipped email for orderId: ${orderId}`,
    );
    const html = orderShippedTemplate(
      customerName,
      orderId,
      trackingUrl,
      itemName,
    );
    return this.sendEmail(email, `Your Order #${orderId} has Shipped 🚚`, html);
  }
  async sendPasswordResetOtp(
    email: string,
    otp: string,
    name: string,
    expireAt: string,
    companyName: string,
  ) {
    console.log(
      `[MailService.sendPasswordResetOtp] Preparing password reset OTP email for ${email}`,
    );
    const html = passwordResetOtpTemplate(name, otp, expireAt, companyName);
    return this.sendEmail(email, `Password Reset OTP - ${companyName}`, html);
  }
  async sendAccountDeactivationOtp(
    email: string,
    otp: string,
    name: string,
    expireAt: string,
    companyName: string,
  ) {
    console.log(
      `[MailService.sendAccountDeactivationOtp] Preparing account deactivation OTP email for ${email}`,
    );
    const html = deactivateAccountOtpTemplate(name, otp, expireAt, companyName);
    return this.sendEmail(
      email,
      `Confirm Account Deactivation - ${companyName}`,
      html,
    );
  }
  async sendAccountReactivationOtp(
    email: string,
    otp: string,
    name: string,
    expireAt: string,
    companyName: string,
  ) {
    console.log(
      `[MailService.sendAccountReactivationOtp] Preparing account reactivation OTP email for ${email}`,
    );
    const html = reactivateAccountOtpTemplate(name, otp, expireAt, companyName);
    return this.sendEmail(
      email,
      `Confirm Account Reactivation - ${companyName}`,
      html,
    );
  }
}
