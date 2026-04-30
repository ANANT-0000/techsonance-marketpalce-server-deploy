export const emailLayout = (content: string, title: string = 'Techsonance Marketplace') => {

    // Use environment variable for your Techsonance logo or fallback
    const logoUrl = process.env.LOGO_URL || 'https://res.cloudinary.com/dkxpvldjs/image/upload/v1771333053/uploads/file-6388894.png';

    // Clean, professional social icons (PNG is preferred for email compatibility)
    const socialIcons = {
        facebook: "https://cdn-icons-png.flaticon.com/512/4494/4494475.png",
        instagram: "https://cdn-icons-png.flaticon.com/512/4494/4494488.png",
        twitter: "https://cdn-icons-png.flaticon.com/512/4494/4494477.png"
    };

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8"> 
    <meta name="viewport" content="width=device-width"> 
    <meta http-equiv="X-UA-Compatible" content="IE=edge"> 
    <meta name="x-apple-disable-message-reformatting"> 
    <title>${title}</title> 
    
    <style>
        /* CSS Reset */
        html, body { 
            margin: 0 auto !important; 
            padding: 0 !important; 
            height: 100% !important; 
            width: 100% !important; 
            background-color: #f8f9fa; /* Slightly softer background */
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        }
        
        /* Message Client Specific Fixes */
        * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
        div[style*="margin: 16px 0"] { margin: 0 !important; }
        table, td { mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; }
        table { border-spacing: 0 !important; border-collapse: collapse !important; table-layout: fixed !important; margin: 0 auto !important; }
        img { -ms-interpolation-mode:bicubic; }
        
        /* Mobile Styles */
        @media screen and (max-width: 600px) {
            .mobile-padding { padding: 20px !important; }
            .mobile-text { font-size: 16px !important; }
            .mobile-header { font-size: 24px !important; }
        }
    </style>
</head>

<body width="100%" bgcolor="#f8f9fa" style="margin: 0; padding: 0; mso-line-height-rule: exactly;">
    <center style="width: 100%; background-color: #f8f9fa; text-align: left;">
        
        <!-- Main Container -->
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; width: 100%; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-radius: 8px; overflow: hidden; margin-top: 20px; margin-bottom: 20px;">
            
            <!-- Logo Section -->
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto; background-color: #ffffff;">
                <tr>
                    <td style="padding: 30px 40px 20px 40px; text-align: center;" class="mobile-padding">
                        <!-- Added explicit styling to alt text for when image is broken -->
                        <img src="${logoUrl}" width="180" alt="Techsonance" style="width: 180px; max-width: 180px; height: auto; display: inline-block; border: 0; font-family: Helvetica, Arial, sans-serif; font-size: 24px; color: #2c3e50; font-weight: bold;">
                    </td>
                </tr>
            </table>

            <!-- Divider -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td style="padding: 0 40px;" class="mobile-padding">
                        <div style="height: 2px; background-color: #f1f5f9; width: 100%;"></div>
                    </td>
                </tr>
            </table>

            <!-- Content Section -->
            ${content}

            <!-- Divider -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td style="padding: 0 40px 10px 40px;" class="mobile-padding">
                        <div style="height: 1px; background-color: #eaeaea; width: 100%;"></div>
                    </td>
                </tr>
            </table>

            <!-- Footer -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa;">
                <tr>
                    <td style="padding: 30px 40px 30px 40px;" class="mobile-padding">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                                <td valign="middle" align="left" width="50%">
                                    <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-weight: bold; color: #2c3e50; font-size: 16px;">Techsonance</p>
                                </td>
                                <td valign="middle" align="right" width="50%">
                                    <a href="#" style="text-decoration: none; margin-left: 10px; display: inline-block;">
                                        <img src="${socialIcons.facebook}" width="24" height="24" alt="Facebook" style="display: block; width: 24px; border: 0;">
                                    </a>
                                    <a href="#" style="text-decoration: none; margin-left: 10px; display: inline-block;">
                                        <img src="${socialIcons.instagram}" width="24" height="24" alt="Instagram" style="display: block; width: 24px; border: 0;">
                                    </a>
                                    <a href="#" style="text-decoration: none; margin-left: 10px; display: inline-block;">
                                        <img src="${socialIcons.twitter}" width="24" height="24" alt="X" style="display: block; width: 24px; border: 0;">
                                    </a>
                                </td>
                            </tr>
                            <tr>
                                <td colspan="2" style="padding-top: 20px; color: #888888; font-size: 12px; font-family: Helvetica, Arial, sans-serif; line-height: 1.6; text-align: left;">
                                    You received this email because you are registered on Techsonance Marketplace. Update your email preferences to choose which emails you get or unsubscribe from this type of email.
                                </td>
                            </tr>
                             <tr>
                                <td colspan="2" style="padding-top: 15px; color: #888888; font-size: 12px; font-family: Helvetica, Arial, sans-serif; text-align: left;">
                                    <a href="#" style="color: #0D9488; text-decoration: none; font-weight: bold;">Unsubscribe</a> &nbsp;&bull;&nbsp; <a href="#" style="color: #0D9488; text-decoration: none; font-weight: bold;">View in browser</a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

        </div>
    </center>
</body>
</html>`;
};