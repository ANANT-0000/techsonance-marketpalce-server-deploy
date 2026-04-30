import { emailLayout } from './layout.template';

export function orderShippedTemplate(
    customerName: string, 
    orderId: string, 
    trackingUrl: string, 
    itemName?: string
): string {
    // If itemName is provided, it's a partial shipment. Otherwise, it implies the full order.
    const shipmentContext = itemName 
        ? `Your item <strong>${itemName}</strong> from order` 
        : `Your order`;

    const content = `
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Hi ${customerName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #2563eb; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Your Order is on the Way! 🚚</h1>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Great news! ${shipmentContext} <strong>#${orderId}</strong> has been shipped and is currently on its way to you.
                        </p>
                        
                        <!-- Tracking Box -->

                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            You can track the live status of your shipment by clicking the button below. Please note that it may take up to 24 hours for the tracking information to update on the courier's website.
                        </p>

                         <!-- CTA Button -->
                         <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                            <tr>
                                <td align="center">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                        <tr>
                                            <td style="border-radius: 6px; background: #2563eb;">
                                                <a href="${trackingUrl}" target="_blank" style="background: #2563eb; border: 1px solid #2563eb; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 6px; font-weight: bold; padding: 14px 28px; color: #ffffff;">
                                                    Track Your Order
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        <p style="margin: 40px 0 0 0; color: #64748b; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            Thank you for shopping with us!<br><br>Best regards,<br><strong>The Techsonance Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
    `;
    return emailLayout(content, `Your Order #${orderId} has Shipped`);
}