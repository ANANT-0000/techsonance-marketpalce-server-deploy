import { emailLayout } from './layout.template';

export function vendorApprovalTemplate(storeName: string): string {
  // Ensure you have your frontend URL set in your environment variables
  const dashboardUrl = `${process.env.FRONTEND_URL || 'https://techsonance.com'}/vendor/dashboard`;

  const content = `
            <!-- Content Section -->
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 16px; font-weight: 500; font-family: Helvetica, Arial, sans-serif;">Dear ${storeName},</p>
                        <h1 class="mobile-header" style="margin: 0 0 15px 0; color: #0D9488; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; font-family: Helvetica, Arial, sans-serif;">Store Approved! 🎉</h1>
                    </td>
                </tr>
                
                <!-- Main Body Text -->
                <tr>
                    <td style="padding: 0 40px 40px 40px;" class="mobile-padding">
                        <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6; font-family: Helvetica, Arial, sans-serif;">
                            Great news! Your vendor application has been successfully reviewed and your store is now approved on Techsonance.
                        </p>
                        
                        <!-- Success Box -->
                         <div style="background-color: #f0fdf4; border-left: 4px solid #0D9488; padding: 20px; border-radius: 4px; margin: 25px 0; color: #166534;">
                            <p style="margin: 0; font-size: 15px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                                You can now log into your vendor dashboard, complete your business profile, and start listing your products to our customers.
                            </p>
                        </div>

                        <!-- CTA Button -->
                         <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                            <tr>
                                <td align="left">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                        <tr>
                                            <td style="border-radius: 6px; background: #0D9488;">
                                                <a href="${dashboardUrl}" target="_blank" style="background: #0D9488; border: 1px solid #0D9488; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 6px; font-weight: bold; padding: 14px 28px; color: #ffffff;">
                                                    Go to Dashboard &nbsp; &rarr;
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        <p style="margin: 40px 0 0 0; color: #64748b; font-size: 16px; line-height: 1.5; font-family: Helvetica, Arial, sans-serif;">
                            We are excited to partner with you!<br><br>Best regards,<br><strong>The Techsonance Team</strong>
                        </p>
                    </td>
                </tr>
            </table>
  `;
  return emailLayout(content, 'Your Store is Approved!');
}