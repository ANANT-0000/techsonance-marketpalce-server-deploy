import { emailLayout } from './layout.template';

export function userRegistrationTemplate(userName: string, actionUrl?: string): string {
    // Fallback URL if no specific action URL (like email verification) is provided
    const targetUrl = actionUrl || `${process.env.FRONTEND_URL || 'https://techsonance.com'}/shopping`;

    const content = `
            <!-- Content Section -->
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #2c3e50; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Welcome to Techsonance! 🎉</h1>
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Hi ${userName},</p>
                    </td>
                </tr>
                
                <!-- Main Body Text -->
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Your account has been successfully created. We are thrilled to have you join our growing community of tech enthusiasts and top-tier vendors!
                        </p>
                        
                        <!-- Features Box -->
                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 25px 0;">
                            <p style="margin: 0 0 10px 0; color: #334155; font-size: 15px; font-weight: bold; font-family: Helvetica, Arial, sans-serif;">With your new account, you can:</p>
                            <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 15px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                                <li style="margin-bottom: 5px;">Discover and shop the latest tech products.</li>
                                <li style="margin-bottom: 5px;">Track your orders in real-time.</li>
                                <li style="margin-bottom: 5px;">Save your favorite items to your wishlist.</li>
                            </ul>
                        </div>

                        <!-- CTA Button -->
                        <!--  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                            <tr>
                                <td align="center">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                        <tr>
                                            <td style="border-radius: 6px; background: #0D9488;">
                                                <a href="${targetUrl}" target="_blank" style="background: #0D9488; border: 1px solid #0D9488; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 6px; font-weight: bold; padding: 14px 28px; color: #ffffff;">
                                                    ${actionUrl ? 'Verify Email & Get Started' : 'Start Shopping Now'} &nbsp; &rarr;
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table> -->

                        <p style="margin: 40px 0 0 0; color: #64748b; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            Happy Shopping,<br><strong>The Techsonance Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
    `;
    return emailLayout(content, 'Welcome to Techsonance Marketplace!');
}