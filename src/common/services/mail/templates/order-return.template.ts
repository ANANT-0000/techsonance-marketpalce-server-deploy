import { emailLayout } from './layout.template';

export function orderReturnTemplate(customerName: string, orderId: string): string {
    const returnUrl = `${process.env.FRONTEND_URL || 'https://techsonance.com'}/customerProfile/orders/${orderId}/return`;

    const content = `
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Hi ${customerName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #0284c7; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Return Initiated 📦</h1>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            We have received your return request for item(s) from order <strong>#${orderId}</strong>.
                        </p>
                        
                        <div style="background-color: #f0f9ff; border: 1px solid #e0f2fe; padding: 20px; border-radius: 8px; margin: 25px 0;">
                            <p style="margin: 0 0 10px 0; color: #0369a1; font-size: 15px; font-weight: bold; font-family: Helvetica, Arial, sans-serif;">Next Steps:</p>
                            <ol style="margin: 0; padding-left: 20px; color: #0c4a6e; font-size: 15px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                                <li style="margin-bottom: 5px;">Pack the item securely in its original packaging.</li>
                                <li style="margin-bottom: 5px;">Attach the return label provided in your dashboard.</li>
                                <li style="margin-bottom: 5px;">Drop it off at the designated courier facility.</li>
                            </ol>
                        </div>

                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Once the vendor receives and inspects the item, your refund will be processed automatically.
                        </p>

                         <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                            <tr>
                                <td align="center">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                        <tr>
                                            <td style="border-radius: 6px; background: #0284c7;">
                                                <a href="${returnUrl}" target="_blank" style="background: #0284c7; border: 1px solid #0284c7; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 6px; font-weight: bold; padding: 14px 28px; color: #ffffff;">
                                                    Track Return Status
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
    return emailLayout(content, `Return Initiated: #${orderId}`);
}