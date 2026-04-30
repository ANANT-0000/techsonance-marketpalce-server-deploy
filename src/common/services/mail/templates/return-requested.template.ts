import { emailLayout } from './layout.template';

export function returnRequestedTemplate(customerName: string, orderId: string): string {
    const orderUrl = `${process.env.FRONTEND_URL || 'https://techsonance.com'}/customerProfile/orders/${orderId}`;

    const content = `
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Hi ${customerName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #d97706; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Return Request Received 📝</h1>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            We have successfully received your return request for order <strong>#${orderId}</strong>. The vendor is currently reviewing the details you provided.
                        </p>
                        
                        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 4px; margin: 25px 0;">
                            <p style="margin: 0 0 5px 0; color: #b45309; font-weight: bold; font-size: 14px; font-family: Helvetica, Arial, sans-serif;">WHAT HAPPENS NEXT?</p>
                            <p style="margin: 0; color: #92400e; font-size: 15px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                                Return requests are typically reviewed within 24-48 hours. Once approved, we will send you a follow-up email with your return shipping label and further instructions.
                            </p>
                        </div>

                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Please hold on to the item and its original packaging until the request is approved.
                        </p>

                         <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                            <tr>
                                <td align="center">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                        <tr>
                                            <td style="border-radius: 6px; background: #d97706;">
                                                <a href="${orderUrl}" target="_blank" style="background: #d97706; border: 1px solid #d97706; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 6px; font-weight: bold; padding: 14px 28px; color: #ffffff;">
                                                    View Request Status
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
    return emailLayout(content, `Return Request Received: #${orderId}`);
}