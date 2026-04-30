import { emailLayout } from './layout.template';

export function vendorRegistrationTemplate(storeName: string): string {
    const content = `
            <!-- Content Section -->
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Dear ${storeName} Team,</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #2c3e50; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Registration Received</h1>
                    </td>
                </tr>
                
                <!-- Main Body Text -->
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Thank you for registering to become a seller on the Techsonance Marketplace! We have successfully received your store's application.
                        </p>
                        
                         <!-- Info Box -->
                        <div style="background-color: #f0f7f9; border-left: 4px solid #0f4c5c; padding: 20px; border-radius: 4px; margin: 25px 0;">
                            <p style="margin: 0 0 5px 0; color: #0f4c5c; font-size: 15px; font-weight: bold; font-family: Helvetica, Arial, sans-serif;">What happens next?</p>
                            <p style="margin: 0; color: #334155; font-size: 15px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                                To ensure the highest quality for our customers, all new vendor accounts undergo a quick review process. Our admin team will review your business details shortly. 
                                <br><br>
                                You will receive an email regarding your approval status within the next <strong>24 to 48 hours</strong>.
                            </p>
                        </div>

                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            If we need any additional documentation to verify your business, our support team will reach out to you directly.
                        </p>

                        <p style="margin: 40px 0 0 0; color: #64748b; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            Best regards,<br><strong>The Techsonance Vendor Support Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
  `;
    return emailLayout(content, 'Vendor Registration Received - Techsonance');
}