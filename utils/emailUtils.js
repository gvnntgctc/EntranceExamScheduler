const nodemailer = require('nodemailer');

/**
 * Build a nodemailer transporter configured for Gmail.
 * Requires EMAIL_USER and EMAIL_PASS in environment variables.
 * @returns {object|null}
 */
function createTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const service = (process.env.EMAIL_SERVICE || 'gmail').toLowerCase();

  if (!user || !pass) {
    console.warn('Email transporter not created: EMAIL_USER or EMAIL_PASS is missing.');
    return null;
  }

  const transportConfig = {
    auth: {
      user,
      pass
    }
  };

  if (service === 'outlook') {
    transportConfig.host = 'smtp.office365.com';
    transportConfig.port = 587;
    transportConfig.secure = false;
  } else if (service === 'gmail') {
    transportConfig.host = 'smtp.gmail.com';
    transportConfig.port = 587;
    transportConfig.secure = false;
  } else {
    transportConfig.service = service;
  }

  return nodemailer.createTransport(transportConfig);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatParagraphs(text) {
  return String(text || '')
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => `<p style="margin:0 0 14px;color:#5f6c7a;font-size:15px;line-height:1.7;">${escapeHtml(line)}</p>`)
    .join('');
}

function formatDetailRows(items) {
  return items.map(item => {
    const label = escapeHtml(item.label || 'Detail');
    const value = escapeHtml(item.value || 'N/A');
    return `
      <tr>
        <td style="padding:10px 0 10px 0;font-size:14px;color:#6b7a8c;width:40%;vertical-align:top;">${label}</td>
        <td style="padding:10px 0 10px 0;font-size:14px;color:#2f3e4d;vertical-align:top;">${value}</td>
      </tr>`;
  }).join('');
}

function buildEmailHtml({
  appName = 'PTC Admission System',
  systemName = 'Pateros Technological College',
  heroText = 'Admissions update from the PTC Application Portal.',
  greetingName = 'Applicant',
  heading = 'Admissions Update',
  introText = '',
  applicantDetails = [],
  examDetails = [],
  statusLabel = '',
  statusMessage = '',
  buttonText = '',
  buttonUrl = '',
  footerNote = 'If you have any questions, please contact our Admissions Office.',
  logoUrl = ''
}) {
  const safeAppName = escapeHtml(appName);
  const safeSystemName = escapeHtml(systemName);
  const safeGreetingName = escapeHtml(greetingName || 'Applicant');
  const safeHeading = escapeHtml(heading);
  const safeHeroText = escapeHtml(heroText);
  const safeStatusLabel = escapeHtml(statusLabel);
  const safeStatusMessage = escapeHtml(statusMessage);
  const safeFooterNote = escapeHtml(footerNote);
  const logoImage = logoUrl && /^https?:\/\//i.test(logoUrl)
    ? `<img src="${escapeHtml(logoUrl)}" width="80" alt="${safeAppName} logo" style="display:block;margin:0 auto 14px;max-width:80px;border-radius:16px;">`
    : '';
  const detailsSection = applicantDetails.length > 0
    ? `
      <tr>
        <td style="padding:0 0 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f8fafc;border:1px solid #e6edf3;border-radius:14px;width:100%;">
            <tr>
              <td style="padding:20px;">
                <h3 style="font-size:16px;color:#1f2937;margin:0 0 12px;">Applicant Information</h3>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                  ${formatDetailRows(applicantDetails)}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';
  const examSection = examDetails.length > 0
    ? `
      <tr>
        <td style="padding:0 0 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#ffffff;border:1px solid #e0e8ef;border-radius:14px;width:100%;">
            <tr>
              <td style="padding:20px;">
                <h3 style="font-size:16px;color:#1f2937;margin:0 0 12px;">Exam Schedule Details</h3>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                  ${formatDetailRows(examDetails)}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';
  const buttonSection = buttonText && buttonUrl
    ? `
      <tr>
        <td style="padding:0 0 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr>
              <td align="center">
                <a href="${escapeHtml(buttonUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;background:#11998e;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">${escapeHtml(buttonText)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeHeading}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#eef2f7;font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(statusMessage || heroText)}</span>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:#11998e;padding:32px 24px;text-align:center;">
                ${logoImage}
                <p style="margin:0;font-size:14px;color:#d7f1ed;text-transform:uppercase;letter-spacing:1px;font-weight:700;">${safeSystemName}</p>
                <h1 style="margin:12px 0 8px;font-size:26px;color:#ffffff;font-weight:700;line-height:1.1;">${safeAppName}</h1>
                <p style="margin:0;font-size:15px;color:#e0f7f1;line-height:1.7;">${safeHeroText}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 0;">
                <p style="margin:0 0 6px;color:#6b8097;font-size:14px;text-transform:uppercase;letter-spacing:0.08em;">Hello ${safeGreetingName},</p>
                <h2 style="margin:0 0 20px;font-size:22px;color:#1f2937;line-height:1.2;">${safeHeading}</h2>
                ${formatParagraphs(introText)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f8fafc;border:1px solid #dce7ef;border-radius:16px;width:100%;">
                  <tr>
                    <td style="padding:20px;">
                      <p style="margin:0;font-size:14px;color:#11998e;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Status</p>
                      <h3 style="margin:10px 0 0;font-size:18px;color:#1f2937;line-height:1.4;">${safeStatusLabel || 'Update Available'}</h3>
                      <p style="margin:12px 0 0;color:#48545f;font-size:15px;line-height:1.75;">${escapeHtml(statusMessage)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${detailsSection}
            ${examSection}
            ${buttonSection}
            <tr>
              <td style="padding:0 24px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-top:1px solid #e5edf4;">
                  <tr>
                    <td style="padding:20px 0 0;color:#7a8a99;font-size:13px;line-height:1.7;text-align:center;">
                      <p style="margin:0;">${safeFooterNote}</p>
                      <p style="margin:12px 0 0;">${safeSystemName} | ${safeAppName}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Send an email using the configured transporter.
 * @param {object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.text
 * @param {string} [options.html]
 * @returns {Promise<boolean>}
 */
async function sendEmail({ to, subject, text, html }) {
  const transporter = createTransporter();
  if (!transporter) {
    return false;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
      html
    });
    console.log('Email sent:', { to, subject });
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

/**
 * Create a verification email body for OTP delivery.
 * @param {object} options
 * @param {string} options.fullName
 * @param {string} options.otp
 * @returns {{subject: string, text: string}}
 */
function buildOtpEmail({ fullName = '', otp }) {
  const name = String(fullName).trim() || 'Applicant';
  const subject = 'Your Entrance Exam Verification Code';
  const text = `Dear ${name},\n\n` +
    `Thank you for your application. Your one-time verification code is:\n\n` +
    `   ${otp}\n\n` +
    `This code expires in 3 minutes. Please enter it in the portal to complete your registration.\n\n` +
    `If you did not request this code, please ignore this email.\n\n` +
    `Best regards,\n` +
    `Entrance Exam Admissions Team`;

  return { subject, text };
}

module.exports = {
  createTransporter,
  sendEmail,
  buildEmailHtml,
  buildOtpEmail
};
