import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { refresh_tokens } from 'src/drizzle/schema';
import { user } from 'src/drizzle/schema/users.schema';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import * as nodemailer from 'nodemailer';
import { BadRequestException } from '@nestjs/common';
@Injectable()
export class MailService {
  nodeMailerTransporter: any;
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
  public sendEmail(to: string, subject: string, html: string) {
    const mailOptions = {
      from: `${this.configService.get<string>('MAIL_FROM_NAME')} <${this.configService.get<string>('MAIL_FROM_EMAIL')}>`,
      to,
      subject,
      html,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.nodeMailerTransporter.sendMail(mailOptions);
  }
  public verifyResetToken(token: string): string {
    try {
      const decoded = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      if (typeof decoded === 'object' && 'email' in decoded) {
        return decoded.email;
      }
      throw new Error('Invalid token');
    } catch (error) {
      if (error?.name === 'TokenExpiredError') {
        throw new BadRequestException(
          'Error: Token has expired. Please request a new password reset link.',
        );
      }
      throw new Error('Invalid or expired token');
    }
  }
}
