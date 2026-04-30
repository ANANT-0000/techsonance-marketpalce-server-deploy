import { emailLayout } from './layout.template';

export function reviewRequestTemplate(customerName: string, productName: string, productId: string): string {
    const reviewUrl = `${process.env.FRONTEND_URL || 'https://techsonance.com'}/shopping/${productId}#reviews`;

    const content = `
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Hi ${customerName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #4f46e5; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">How did we do? ⭐</h1>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            We hope you're loving your recent purchase of the <strong>${productName}</strong>!
                        </p>
                        
                        <div style="background-color: #eef2ff; border-left: 4px solid #4f46e5; padding: 20px; border-radius: 4px; margin: 25px 0;">
                            <p style="margin: 0; color: #312e81; font-size: 15px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                                Your feedback means the world to us and helps other tech enthusiasts make informed decisions. It only takes a minute to share your thoughts.
                            </p>
                        </div>

                         <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                            <tr>
                                <td align="center">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                        <tr>
                                            <td style="border-radius: 6px; background: #4f46e5;">
                                                <a href="${reviewUrl}" target="_blank" style="background: #4f46e5; border: 1px solid #4f46e5; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 6px; font-weight: bold; padding: 14px 28px; color: #ffffff;">
                                                    Leave a Review
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        <p style="margin: 40px 0 0 0; color: #64748b; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            Thanks for being a valued member of the Techsonance community!<br><br>Best regards,<br><strong>The Techsonance Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
    `;
    return emailLayout(content, `What do you think of your ${productName}?`);
}