export const emailLayout = (content: string, title: string = 'Techsonance Marketplace') => {

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="x-apple-disable-message-reformatting">
    <title>${title}</title>

    <style>
        html, body {
            margin: 0 auto !important;
            padding: 0 !important;
            height: 100% !important;
            width: 100% !important;
            background-color: #eef7f6;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        }
        * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
        div[style*="margin: 16px 0"] { margin: 0 !important; }
        table, td { mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; }
        table { border-spacing: 0 !important; border-collapse: collapse !important; table-layout: fixed !important; margin: 0 auto !important; }
        img { -ms-interpolation-mode: bicubic; }
        a { color: #0d9488; }

        @media screen and (max-width: 600px) {
            .mobile-padding  { padding: 24px 20px !important; }
            .mobile-header   { padding: 28px 20px !important; }
            .mobile-text     { font-size: 15px !important; }
            .mobile-title    { font-size: 22px !important; }
        }
    </style>
</head>

<body width="100%" bgcolor="#eef7f6" style="margin: 0; padding: 0; mso-line-height-rule: exactly; background-color: #eef7f6;">
<center style="width: 100%; background-color: #eef7f6; text-align: left;">

    <!-- Outer wrapper -->
    <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eef7f6;">
        <tr>
            <td style="padding: 28px 16px;">

                <!-- Card -->
                <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; width: 100%; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(13,148,136,0.08);">

                    <!-- ═══ HEADER BAND ═══ -->
                    <tr>
                        <td class="mobile-header" style="padding: 36px 48px 32px; background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); position: relative;">

                            <!-- Brand name -->
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td>
                                        <p style="margin: 0 0 20px; font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: bold; color: #ffffff; letter-spacing: 0.5px;">
                                            Techsonance
                                        </p>
                                    </td>
                                    <td align="right" valign="middle">
                                        <!-- Badge / icon placeholder -->
                                        <div style="display: inline-block; width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.15); text-align: center; line-height: 40px; font-size: 20px;">
                                            ✦
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Accent rule -->
                            <div style="height: 2px; width: 48px; background: rgba(255,255,255,0.5); border-radius: 1px; margin-bottom: 0;"></div>
                        </td>
                    </tr>

                    <!-- ═══ CONTENT SLOT ═══ -->
                    <tr>
                        <td class="mobile-padding" style="padding: 40px 48px;">
                            ${content}
                        </td>
                    </tr>

                    <!-- ═══ DIVIDER ═══ -->
                    <tr>
                        <td style="padding: 0 48px;">
                            <div style="height: 1px; background: linear-gradient(90deg, transparent, #e2e8f0 20%, #e2e8f0 80%, transparent); width: 100%;"></div>
                        </td>
                    </tr>

                    <!-- ═══ FOOTER ═══ -->
                    <tr>
                        <td class="mobile-padding" style="padding: 28px 48px 36px; background-color: #f8fffe;">

                            <!-- Social row -->
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                                <tr>
                                    <td valign="middle">
                                        <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; font-weight: bold; color: #0f766e;">Techsonance</p>
                                        <p style="margin: 2px 0 0; font-size: 12px; color: #94a3b8; font-family: Helvetica, Arial, sans-serif;">Your trusted marketplace</p>
                                    </td>
                                    <td align="right" valign="middle">
                                        <!-- Social icons as styled text links for max email compatibility -->
                                        <a href="#" style="display: inline-block; margin-left: 8px; width: 32px; height: 32px; border-radius: 8px; background-color: #e6f4f3; text-align: center; line-height: 32px; text-decoration: none; font-size: 14px; color: #0d9488;" title="Facebook">f</a>
                                        <a href="#" style="display: inline-block; margin-left: 8px; width: 32px; height: 32px; border-radius: 8px; background-color: #e6f4f3; text-align: center; line-height: 32px; text-decoration: none; font-size: 14px; color: #0d9488;" title="Instagram">in</a>
                                        <a href="#" style="display: inline-block; margin-left: 8px; width: 32px; height: 32px; border-radius: 8px; background-color: #e6f4f3; text-align: center; line-height: 32px; text-decoration: none; font-size: 12px; font-weight: bold; color: #0d9488;" title="X / Twitter">𝕏</a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Legal text -->
                            <p style="margin: 0 0 12px; font-size: 12px; line-height: 1.7; color: #94a3b8; font-family: Helvetica, Arial, sans-serif;">
                                You received this email because you are registered on Techsonance Marketplace.
                                Manage your notification preferences to choose which emails you receive.
                            </p>

                            <!-- Links -->
                            <p style="margin: 0; font-size: 12px; font-family: Helvetica, Arial, sans-serif;">
                                <a href="#" style="color: #0d9488; text-decoration: none; font-weight: 600;">Unsubscribe</a>
                                <span style="color: #cbd5e1; margin: 0 8px;">|</span>
                                <a href="#" style="color: #0d9488; text-decoration: none; font-weight: 600;">View in browser</a>
                                <span style="color: #cbd5e1; margin: 0 8px;">|</span>
                                <a href="#" style="color: #0d9488; text-decoration: none; font-weight: 600;">Privacy Policy</a>
                            </p>

                        </td>
                    </tr>

                    <!-- ═══ BOTTOM ACCENT BAR ═══ -->
                    <tr>
                        <td style="height: 5px; background: linear-gradient(90deg, #0d9488, #14b8a6, #0d9488);"></td>
                    </tr>

                </table>
                <!-- /Card -->

                <!-- Below-card note -->
                <table align="center" role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; margin: 0 auto;">
                    <tr>
                        <td style="padding: 16px 0; text-align: center;">
                            <p style="margin: 0; font-size: 11px; color: #94a3b8; font-family: Helvetica, Arial, sans-serif;">
                                © ${new Date().getFullYear()} Techsonance. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>

            </td>
        </tr>
    </table>

</center>
</body>
</html>`;
};