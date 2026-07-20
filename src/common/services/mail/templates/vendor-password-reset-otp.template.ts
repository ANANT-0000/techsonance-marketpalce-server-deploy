import { EMAIL_PLATFORM_THEME } from '../../../constants.js';
import { emailLayout } from './layout.template.js';

export function vendorPasswordResetOtpTemplate(
  userName: string,
  otpCode: string,
  expireAt: string,
  companyName: string = 'Techsonance Marketplace',
): string {
  const content = `
            <!-- Content Section -->
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: ${EMAIL_PLATFORM_THEME.text_title}; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Vendor Password Reset Request</h1>
                        <p style="margin: 0 0 10px 0; color: ${EMAIL_PLATFORM_THEME.text_muted}; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Hi ${userName ? userName : 'there'},</p>
                    </td>
                </tr>
                
                <!-- Main Body Text -->
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: ${EMAIL_PLATFORM_THEME.text_body}; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            We received a request to reset the password for your <strong>${companyName} Vendor Dashboard</strong> account. Please use the verification code below to complete the process:
                        </p>
                        
                        <!-- OTP Box -->
                        <div style="background-color: ${EMAIL_PLATFORM_THEME.bg_muted}; border: 1px dashed ${EMAIL_PLATFORM_THEME.primary}; padding: 25px; border-radius: 8px; margin: 30px 0; text-align: center;">
                            <span style="font-family: monospace, Helvetica, Arial, sans-serif; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: ${EMAIL_PLATFORM_THEME.primary};">
                                ${otpCode}
                            </span>
                        </div>

                        <p style="margin: 0 0 25px 0; color: ${EMAIL_PLATFORM_THEME.error}; font-size: 15px; font-weight: bold; font-family: Helvetica, Arial, sans-serif;">
                            ⏱️ This code will expire at ${expireAt}.
                        </p>

                        <!-- Security Notice Box -->
                        <div style="background-color: #f8fafc; border-left: 4px solid ${EMAIL_PLATFORM_THEME.warning}; padding: 15px 20px; border-radius: 0 8px 8px 0; margin: 25px 0;">
                            <p style="margin: 0; color: ${EMAIL_PLATFORM_THEME.text_body}; font-size: 14px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                                <strong style="color: ${EMAIL_PLATFORM_THEME.warning};">Security Notice:</strong> If you did not request a password reset for your vendor account, please ignore this email or contact support immediately. Never share this code with anyone.
                            </p>
                        </div>

                        <p style="margin: 40px 0 0 0; color: ${EMAIL_PLATFORM_THEME.text_muted}; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            Stay secure,<br><strong>The ${companyName} Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
    `;

  return emailLayout(content, `Your Vendor Password Reset Code - ${companyName}`);
}
