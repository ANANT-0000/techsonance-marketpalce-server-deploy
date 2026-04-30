import { emailLayout } from './layout.template';

export function replacementRequestedTemplate(customerName: string, orderId: string): string {
    const orderUrl = `${process.env.FRONTEND_URL || 'https://techsonance.com'}/customerProfile/orders/${orderId}`;

    const content = `
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Hi ${customerName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #0284c7; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Replacement Request Received 🔄</h1>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            We have successfully received your request to replace an item from order <strong>#${orderId}</strong>. 
                        </p>
                        
                        <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 20px; border-radius: 4px; margin: 25px 0;">
                            <p style="margin: 0 0 5px 0; color: #0369a1; font-weight: bold; font-size: 14px; font-family: Helvetica, Arial, sans-serif;">UNDER REVIEW</p>
                            <p style="margin: 0; color: #0c4a6e; font-size: 15px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                                The vendor is reviewing your request to ensure a replacement unit is available in stock. You can expect an update within the next 24-48 hours.
                            </p>
                        </div>

                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Once approved, we will notify you with the tracking details for your new item, along with any necessary instructions for returning the original product.
                        </p>

                         <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                            <tr>
                                <td align="center">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                        <tr>
                                            <td style="border-radius: 6px; background: #0284c7;">
                                                <a href="${orderUrl}" target="_blank" style="background: #0284c7; border: 1px solid #0284c7; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 6px; font-weight: bold; padding: 14px 28px; color: #ffffff;">
                                                    Check Request Status
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
    `;
    return emailLayout(content, `Replacement Request Received: #${orderId}`);
}