import { emailLayout } from './layout.template';

export function orderCancelledTemplate(customerName: string, orderId: string, refundInitiated: boolean): string {
    const content = `
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Hi ${customerName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #475569; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Order Cancelled</h1>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Your order <strong>#${orderId}</strong> has been successfully cancelled as requested.
                        </p>
                        
                        ${refundInitiated ? `
                        <div style="background-color: #f8fafc; border-left: 4px solid #64748b; padding: 20px; border-radius: 4px; margin: 25px 0;">
                            <p style="margin: 0 0 5px 0; color: #334155; font-weight: bold; font-size: 14px; font-family: Helvetica, Arial, sans-serif;">REFUND STATUS</p>
                            <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                                A full refund has been initiated to your original payment method. Please allow 3-5 business days for the funds to appear in your account.
                            </p>
                        </div>
                        ` : ''}
 
                        <p style="color: #888; font-size: 12px;">
                            If you did not request this cancellation, please contact our support team immediately.
                        </p>
                        <p style="margin: 40px 0 0 0; color: #64748b; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            If you have any questions, feel free to contact our support team.<br><br>Best regards,<br><strong>The Techsonance Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
    `;
    return emailLayout(content, `Order Cancelled: #${orderId}`);
}