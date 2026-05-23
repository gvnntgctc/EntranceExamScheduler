require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:Arial,sans-serif;background:#eef2f7;padding:24px;margin:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
    <tr>
      <td style="background:#11998e;padding:40px;text-align:center;border-radius:20px 20px 0 0;">
        <h1 style="color:white;margin:0;font-size:28px;">PTC Admission System</h1>
        <p style="color:#e0f0ed;margin:12px 0 0;">HTML Email Test - Styled with Branding</p>
      </td>
    </tr>
    <tr>
      <td style="background:white;padding:40px;border-radius:0 0 20px 20px;">
        <p style="color:#1f2937;font-size:16px;margin:0 0 20px;">This email verifies that HTML content is rendering correctly.</p>
        <div style="background:#f8fafc;border:1px solid #e0e8ef;border-radius:12px;padding:20px;margin:20px 0;">
          <h3 style="color:#1f2937;margin:0 0 10px;">What This Proves</h3>
          <ul style="margin:0;padding-left:20px;color:#5f6c7a;">
            <li>The email is HTML formatted</li>
            <li>Styles are being applied correctly</li>
            <li>The teal header color (#11998e) renders properly</li>
            <li>Email client supports CSS styling</li>
          </ul>
        </div>
        <p style="color:#7a8a99;font-size:14px;margin:20px 0 0;border-top:1px solid #e5edf4;padding-top:20px;">
          PTC Admissions Office<br>
          Pateros Technological College
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

transporter.sendMail({
  from: process.env.EMAIL_USER,
  to: process.env.EMAIL_USER,
  subject: '[TEST] HTML Email Rendering - PTC Admission System',
  text: 'This is a test email. If you see styled content with a teal header, HTML rendering is working.',
  html: htmlContent
}, (err, info) => {
  if (err) {
    console.error('Send Error:', err.message);
    process.exit(1);
  } else {
    console.log('\n✓ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('\nHTML FIELD STATUS: ✓ Included in email');
    console.log('Expected appearance: Styled card with teal header, white content area');
    console.log('\nCheck your Gmail inbox for the styled email');
    process.exit(0);
  }
});
