import { emailLayout } from './layout.template';

export function reactivateAccountOtpTemplate(
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
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #2c3e50; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Account Reactivation</h1>
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Welcome back, ${userName ? userName : 'there'}!</p>
                    </td>
                </tr>
                
                <!-- Main Body Text -->
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            We received a request to reactivate your <strong>${companyName}</strong> account and restore your access. Please use the verification code below to complete the process:
                        </p>
                        
                        <!-- OTP Box -->
                        <div style="background-color: #f0fdfa; border: 1px dashed #0D9488; padding: 25px; border-radius: 8px; margin: 30px 0; text-align: center;">
                            <span style="font-family: monospace, Helvetica, Arial, sans-serif; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0D9488;">
                                ${otpCode}
                            </span>
                        </div>

                        <p style="margin: 0 0 25px 0; color: #dc2626; font-size: 15px; font-weight: bold; font-family: Helvetica, Arial, sans-serif;">
                            ⏱️ This code will expire at ${expireAt}.
                        </p>

                        <!-- Security Notice Box (Green Accent for Reactivation) -->
                        <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px 20px; border-radius: 0 8px 8px 0; margin: 25px 0;">
                            <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                                <strong style="color: #15803d;">Security Notice:</strong> If you did not request to reactivate your account, please ignore this email or contact our support team immediately.
                            </p>
                        </div>

                        <p style="margin: 40px 0 0 0; color: #64748b; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            We're glad you're back,<br><strong>The ${companyName} Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
    `;

  return emailLayout(
    content,
    `Your Account Reactivation Code - ${companyName}`,
  );
}
