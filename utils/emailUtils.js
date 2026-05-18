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
    service,
    auth: {
      user,
      pass
    }
  };

  return nodemailer.createTransport(transportConfig);
}

/**
 * Send an email using the configured transporter.
 * @param {object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.text
 * @returns {Promise<boolean>}
 */
async function sendEmail({ to, subject, text }) {
  const transporter = createTransporter();
  if (!transporter) {
    return false;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text
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
  buildOtpEmail
};
