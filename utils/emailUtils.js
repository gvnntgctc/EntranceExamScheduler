const fs = require('fs');
const path = require('path');
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
  importantInstructions = '',
  instructionItems = [],
  buttonText = '',
  buttonUrl = '',
  footerNote = 'If you have any questions, please contact our Admissions Office.',
  logoUrl = '',
  preferEmbeddedLogo = true
}) {
  const safeAppName = escapeHtml(appName);
  const safeSystemName = escapeHtml(systemName);
  const safeGreetingName = escapeHtml(greetingName || 'Applicant');
  const safeHeading = escapeHtml(heading);
  const safeHeroText = escapeHtml(heroText);
  const safeStatusLabel = escapeHtml(statusLabel);
  const safeStatusMessage = escapeHtml(statusMessage);
  const safeFooterNote = escapeHtml(footerNote);
  const safeImportantInstructions = escapeHtml(importantInstructions);

  const isLocalhostUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(url);
  };

  const processedLogoUrl = !preferEmbeddedLogo && logoUrl && /^https?:\/\//i.test(logoUrl) && !isLocalhostUrl(logoUrl)
    ? logoUrl
    : '';

  const defaultUrlBase = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '';
  const defaultLogoUrl = !preferEmbeddedLogo && defaultUrlBase && !isLocalhostUrl(defaultUrlBase)
    ? `${defaultUrlBase}/images/logo.png`
    : '';

  const selectedLogoUrl = processedLogoUrl || defaultLogoUrl;
  const logoSource = selectedLogoUrl || 'cid:ptc-logo@ptcadmission';
  const logoImage = `<img src="${escapeHtml(logoSource)}" width="80" alt="${safeAppName} logo" style="display:block;max-width:80px;height:auto;border-radius:6px;">`;

  const detailsSection = applicantDetails.length > 0
    ? `
      <tr>
        <td style="padding:0 24px 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#ffffff;border:1px solid #dbe7ef;border-radius:14px;width:100%;">
            <tr>
              <td style="padding:18px 20px;">
                <p style="margin:0 0 10px;color:#0f766e;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Applicant Information</p>
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
        <td style="padding:0 24px 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#ffffff;border:1px solid #dbe7ef;border-radius:14px;width:100%;">
            <tr>
              <td style="padding:18px 20px;">
                <p style="margin:0 0 10px;color:#0f766e;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Exam Schedule Details</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                  ${formatDetailRows(examDetails)}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const instructionsList = instructionItems.length > 0
    ? `
      <ul style="margin:12px 0 0 20px;padding:0;color:#4e6378;font-size:14px;line-height:1.75;">
        ${instructionItems.map(item => `<li style="margin:0 0 10px;">${escapeHtml(item)}</li>`).join('')}
      </ul>`
    : '';

  const instructionsSection = (safeImportantInstructions || instructionsList)
    ? `
      <tr>
        <td style="padding:0 24px 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#ffffff;border:1px solid #dce7ef;border-radius:16px;width:100%;">
            <tr>
              <td style="padding:20px;">
                <p style="margin:0 0 10px;color:#11998e;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Important Instructions</p>
                ${safeImportantInstructions ? `<p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.75;">${safeImportantInstructions}</p>` : ''}
                ${instructionsList}
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const buttonSection = buttonText && buttonUrl
    ? `
      <tr>
        <td style="padding:0 24px 22px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr>
              <td align="center">
                <a href="${escapeHtml(buttonUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;background:#11998e;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;">${escapeHtml(buttonText)}</a>
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
    <!--[if mso]>
      <style type="text/css">
        .email-container { width:920px !important; }
        .rounded { border-radius:6px !important; }
        .header-padding { padding:12px 20px !important; }
        .section-pad { padding:14px 18px !important; }
      </style>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;background-color:#e9f2f5;font-family:'Roboto',Arial,sans-serif;color:#102a43;">
    <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(statusMessage || heroText)}</span>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e9f2f5;padding:8px 0;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:920px;" class="email-container">
            <tr>
              <td style="padding:0 12px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#ffffff;border:1px solid #e6eef2;border-radius:6px;overflow:hidden;" class="rounded">
                  <tr>
                    <td style="background:linear-gradient(90deg,#0fa58c 0%,#26d07a 100%);padding:12px 20px;" class="header-padding">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                        <tr>
                          <td style="vertical-align:middle;padding-right:12px;width:96px;">${logoImage}</td>
                          <td style="vertical-align:middle;">
                            <p style="margin:0;font-size:12px;color:#eafaf4;text-transform:uppercase;letter-spacing:1px;font-weight:700;">${safeSystemName}</p>
                            <h1 style="margin:4px 0 0;font-size:22px;color:#ffffff;font-weight:700;line-height:1.05;">${safeAppName}</h1>
                            <p style="margin:8px 0 0;font-size:13px;color:#dff9ec;line-height:1.5;max-width:600px;">${safeHeroText}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px 0;">
                      <p style="margin:0 0 7px;color:#475569;font-size:13px;text-transform:uppercase;letter-spacing:0.11em;">Hello ${safeGreetingName},</p>
                      <h2 style="margin:0 0 18px;font-size:24px;color:#102a43;line-height:1.2;">${safeHeading}</h2>
                      ${formatParagraphs(introText)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 16px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f7fcfb;border:1px solid #e3f2ef;border-radius:8px;width:100%;" class="rounded">
                        <tr>
                          <td style="padding:14px 18px;" class="section-pad">
                            <p style="margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Admission Status</p>
                            <p style="margin:0;font-size:16px;color:#102a43;line-height:1.7;">${safeStatusMessage}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  ${detailsSection.replace(/border-radius:14px/g, 'border-radius:8px').replace(/padding:18px 20px/g, 'padding:14px 18px')}
                  ${examSection.replace(/border-radius:14px/g, 'border-radius:8px').replace(/padding:18px 20px/g, 'padding:14px 18px')}
                  ${instructionsSection.replace(/border-radius:16px/g, 'border-radius:8px').replace(/padding:20px/g, 'padding:14px')}
                  ${buttonSection}
                  <tr>
                    <td style="padding:0 24px 22px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-top:1px solid #e8eef2;">
                        <tr>
                          <td style="padding:16px 0 0;color:#475569;font-size:13px;line-height:1.6;text-align:left;">
                            <p style="margin:0;">${safeFooterNote}</p>
                            <p style="margin:10px 0 0;color:#728398;font-size:12px;line-height:1.6;">${safeSystemName} | ${safeAppName}</p>
                          </td>
                        </tr>
                      </table>
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

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    html
  };

  const logoCid = 'ptc-logo@ptcadmission';
  const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo.png');
  if (html && html.includes(`cid:${logoCid}`) && fs.existsSync(logoPath)) {
    mailOptions.attachments = [
      {
        filename: 'logo.png',
        path: logoPath,
        cid: logoCid
      }
    ];
  }

  try {
    await transporter.sendMail(mailOptions);
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
