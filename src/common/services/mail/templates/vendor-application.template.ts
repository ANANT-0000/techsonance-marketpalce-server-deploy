import { emailLayout } from './layout.template';

export function vendorApplicationTemplate(storeName: string): string {
  const content = `
            <!-- Content Section -->
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Dear ${storeName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #2c3e50; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Application Received</h1>
                    </td>
                </tr>
                
                <!-- Main Body Text -->
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Thank you for applying to become a vendor on the Techsonance Marketplace. We have successfully received your application.
                        </p>
                        
                         <!-- Info Box -->
                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 25px 0;">
                            <p style="margin: 0; color: #334155; font-size: 15px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                                <strong>Next Steps:</strong> Our admin team will review your business details shortly. You can expect an update regarding your approval status within the next 24 to 48 hours.
                            </p>
                        </div>

                        <p style="margin: 40px 0 0 0; color: #64748b; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            Best regards,<br><strong>The Techsonance Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
  `;
  return emailLayout(content, 'Application Received - Techsonance');
}