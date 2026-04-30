import { emailLayout } from './layout.template';

export function orderPlacedTemplate(customerName: string, orderId: string, totalAmount: number, currency: string = 'USD'): string {
    const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(totalAmount);
    const orderUrl = `${process.env.FRONTEND_URL || 'https://techsonance.com'}/customerProfile/orders/${orderId}`;

    const content = `
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Hi ${customerName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #2c3e50; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Order Confirmed! 🛍️</h1>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Thank you for shopping with Techsonance Marketplace! We've successfully received your order and the vendor is currently processing it.
                        </p>
                        
                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 25px 0;">
                            <p style="margin: 0 0 10px 0; color: #334155; font-size: 15px; font-weight: bold; font-family: Helvetica, Arial, sans-serif;">Order Summary:</p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 5px 0; color: #64748b; font-size: 15px; font-family: Helvetica, Arial, sans-serif;">Order ID:</td>
                                    <td style="padding: 5px 0; color: #0f4c5c; font-size: 15px; font-weight: bold; text-align: right; font-family: Helvetica, Arial, sans-serif;">#${orderId}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 5px 0; color: #64748b; font-size: 15px; font-family: Helvetica, Arial, sans-serif;">Total Amount:</td>
                                    <td style="padding: 5px 0; color: #0D9488; font-size: 15px; font-weight: bold; text-align: right; font-family: Helvetica, Arial, sans-serif;">${formattedAmount}</td>
                                </tr>
                            </table>
                        </div>

                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            We will send you another email with tracking information as soon as your order ships.
                        </p>

                         <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                            <tr>
                                <td align="center">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                        <tr>
                                            <td style="border-radius: 6px; background: #0D9488;">
                                                <a href="${orderUrl}" target="_blank" style="background: #0D9488; border: 1px solid #0D9488; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 6px; font-weight: bold; padding: 14px 28px; color: #ffffff;">
                                                    View Order Details
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
    return emailLayout(content, `Order Confirmed: #${orderId}`);
}