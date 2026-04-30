import { emailLayout } from './layout.template';

export function vendorRejectionTemplate(storeName: string, reason?: string): string {
    const contactUrl = `${process.env.FRONTEND_URL || 'https://techsonance.com'}/contact`;

    const content = `
            <!-- Content Section -->
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Dear ${storeName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #e11d48; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Application Update</h1>
                        <div style="height: 4px; width: 40px; background-color: #e11d48; border-radius: 2px; margin-bottom: 30px;"></div>
                    </td>
                </tr>
                
                <!-- Main Body Text -->
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Thank you for your interest in joining Techsonance Marketplace. After carefully reviewing your application, we regret to inform you that we cannot approve your store at this time.
                        </p>

                        ${reason ? `
                        <!-- Reason Box -->
                        <div style="background-color: #fff1f2; border-left: 4px solid #f43f5e; padding: 20px; border-radius: 4px; margin: 25px 0;">
                            <p style="margin: 0 0 5px 0; color: #9f1239; font-weight: bold; font-size: 14px; font-family: Helvetica, Arial, sans-serif;">REASON FOR REJECTION</p>
                            <p style="margin: 0; color: #be123c; font-size: 15px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                                ${reason}
                            </p>
                        </div>
                        ` : ''}

                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            If you have resolved the issues mentioned above or feel this was a mistake, please reach out to our support team for a secondary review.
                        </p>

                        <p style="margin: 40px 0 0 0; color: #64748b; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            Best regards,<br><strong>The Techsonance Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
    `;
    return emailLayout(content, 'Update on your Vendor Application');
}