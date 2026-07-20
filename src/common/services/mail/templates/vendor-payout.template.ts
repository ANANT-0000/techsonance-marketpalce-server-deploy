import { EMAIL_PLATFORM_THEME } from '../../../constants.js';
import { emailLayout } from './layout.template.js';

export function vendorPayoutTemplate(
  storeName: string,
  amount: number,
  currency: string = 'USD',
): string {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
  const financeDashboardUrl = `${'http://localhost:3000'}/vendor/finances`;

  const content = `
            <!-- Content Section -->
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: ${EMAIL_PLATFORM_THEME.text_muted}; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Dear ${storeName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: ${EMAIL_PLATFORM_THEME.text_title}; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Funds are on the way! 💸</h1>
                    </td>
                </tr>
                
                <!-- Main Body Text -->
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: ${EMAIL_PLATFORM_THEME.text_body}; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            We have successfully processed a payout for your recent sales on the marketplace.
                        </p>
                        
                         <!-- Amount Box -->
                        <div style="background-color: ${EMAIL_PLATFORM_THEME.bg_base}; border: 1px solid ${EMAIL_PLATFORM_THEME.border_base}; padding: 30px 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
                            <p style="margin: 0; color: ${EMAIL_PLATFORM_THEME.text_muted}; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-family: Helvetica, Arial, sans-serif;">PAYOUT AMOUNT</p>
                            <p style="margin: 10px 0 0 0; color: ${EMAIL_PLATFORM_THEME.success}; font-size: 36px; font-weight: bold; font-family: Helvetica, Arial, sans-serif;">
                                ${formattedAmount}
                            </p>
                        </div>

                        <p style="margin: 0 0 20px 0; color: ${EMAIL_PLATFORM_THEME.text_body}; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Please allow 2-5 business days for the funds to reflect in your registered bank account, depending on your bank's standard processing times. You can view the full breakdown in your finance dashboard.
                        </p>

                         <!-- CTA Button -->
                         <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                            <tr>
                                <td align="center">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                        <tr>
                                            <td style="border-radius: 6px; background: ${EMAIL_PLATFORM_THEME.cta_bg};">
                                                <a href="${financeDashboardUrl}" target="_blank" style="background: ${EMAIL_PLATFORM_THEME.cta_bg}; border: 1px solid ${EMAIL_PLATFORM_THEME.cta_bg}; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 6px; font-weight: bold; padding: 14px 28px; color: ${EMAIL_PLATFORM_THEME.cta_text};">
                                                    View Finance Dashboard
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        <p style="margin: 40px 0 0 0; color: ${EMAIL_PLATFORM_THEME.text_muted}; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            Best regards,<br><strong>The Techsonance Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
  `;
  return emailLayout(content, 'Payout Processed');
}
