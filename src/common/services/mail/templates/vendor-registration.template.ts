import { EMAIL_PLATFORM_THEME } from '../../../constants.js';
import { emailLayout } from './layout.template.js';

export function vendorRegistrationTemplate(
  storeName: string,
  randomPassword: string,
): string {
  const loginUrl = `${process.env.FRONTEND_URL || 'https://techsonance.com'}/vendor/login`;

  const content = `
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: ${EMAIL_PLATFORM_THEME.text_muted}; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Dear ${storeName} Team,</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: ${EMAIL_PLATFORM_THEME.text_title}; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Registration Received</h1>
                    </td>
                </tr>
                
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: ${EMAIL_PLATFORM_THEME.text_body}; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Thank you for registering to become a seller on the Techsonance Marketplace! We have successfully received your store's application.
                        </p>
                        
                         <div style="background-color: ${EMAIL_PLATFORM_THEME.bg_muted}; border-left: 4px solid ${EMAIL_PLATFORM_THEME.primary}; padding: 20px; border-radius: 4px; margin: 25px 0;">
                            <p style="margin: 0 0 5px 0; color: ${EMAIL_PLATFORM_THEME.primary}; font-size: 15px; font-weight: bold; font-family: Helvetica, Arial, sans-serif;">Account Credentials</p>
                            <p style="margin: 0 0 15px 0; color: ${EMAIL_PLATFORM_THEME.text_body}; font-size: 15px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                                Your temporary login password is: <strong>${randomPassword}</strong><br>
                                <em>Please note: You will be required to change this password immediately after your first successful login following account approval.</em>
                            </p>

                            <!-- CTA Button for Login -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0;">
                                <tr>
                                    <td align="left">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                            <tr>
                                                <td style="border-radius: 6px; background: ${EMAIL_PLATFORM_THEME.cta_bg};">
                                                    <a href="${loginUrl}" target="_blank" style="background: ${EMAIL_PLATFORM_THEME.cta_bg}; border: 1px solid ${EMAIL_PLATFORM_THEME.cta_bg}; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 6px; font-weight: bold; padding: 14px 28px; color: ${EMAIL_PLATFORM_THEME.cta_text};">
                                                        Log in to Dashboard
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0 0 5px 0; color: ${EMAIL_PLATFORM_THEME.primary}; font-size: 15px; font-weight: bold; font-family: Helvetica, Arial, sans-serif;">What happens next?</p>
                            <p style="margin: 0; color: ${EMAIL_PLATFORM_THEME.text_body}; font-size: 15px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                                To ensure the highest quality for our customers, all new vendor accounts undergo a quick review process. Our admin team will review your business details shortly. 
                                <br><br>
                                You will receive an email regarding your approval status within the next <strong>24 to 48 hours</strong>.
                            </p>
                        </div>

                        <p style="margin: 0 0 20px 0; color: ${EMAIL_PLATFORM_THEME.text_body}; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            If we need any additional documentation to verify your business, our support team will reach out to you directly.
                        </p>

                        <p style="margin: 40px 0 0 0; color: ${EMAIL_PLATFORM_THEME.text_muted}; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            Best regards,<br><strong>The Techsonance Vendor Support Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
  `;
  return emailLayout(content, 'Vendor Registration Received - Techsonance');
}
