const bcrypt = require('bcryptjs');

const PHONE_REGEX = /^(?:\+63|0)9\d{9}$/;
const EMAIL_REGEX = /^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$/;
const NAME_REGEX = /^[A-Za-z. ]+$/;

/**
 * Normalize an email address to lowercase.
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

/**
 * Normalize a full name string.
 * @param {string} fullName
 * @returns {string}
 */
function normalizeFullName(fullName = '') {
  return String(fullName).trim().replace(/\s+/g, ' ');
}

/**
 * Normalize a Philippine mobile number into the +63 format.
 * @param {string} phoneNumber
 * @returns {string}
 */
function normalizePhoneNumber(phoneNumber = '') {
  const raw = String(phoneNumber).trim();
  if (/^0/.test(raw)) {
    return `+63${raw.slice(1)}`;
  }
  if (/^\+63/.test(raw)) {
    return raw;
  }
  return raw;
}

/**
 * Validate applicant registration fields.
 * @param {object} data
 * @param {string} data.fullName
 * @param {string} data.phoneNumber
 * @param {string} data.email
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateApplicantData(data = {}) {
  const errors = [];
  const fullName = normalizeFullName(data.fullName);
  const phoneNumber = normalizePhoneNumber(data.phoneNumber);
  const email = normalizeEmail(data.email);

  if (!fullName) {
    errors.push('Full name is required.');
  } else if (!NAME_REGEX.test(fullName)) {
    errors.push('Invalid name format. Only letters, periods, and spaces are allowed.');
  }

  if (!phoneNumber) {
    errors.push('Phone number is required.');
  } else if (!PHONE_REGEX.test(phoneNumber)) {
    errors.push('Invalid phone number format. Use a Philippine mobile number starting with 09 or +63.');
  }

  if (!email) {
    errors.push('Email address is required.');
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push('Invalid email format.');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      fullName,
      phoneNumber,
      email
    }
  };
}

/**
 * Generate a numeric OTP code.
 * @param {number} digits
 * @returns {string}
 */
function generateOtp(digits = 6) {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

/**
 * Generate an OTP expiration timestamp.
 * @param {number} minutes
 * @returns {Date}
 */
function getOtpExpiry(minutes = 3) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Check whether an OTP is still valid.
 * @param {string} otp
 * @param {string} expectedOtp
 * @param {Date|string} expiry
 * @returns {boolean}
 */
function isOtpValid(otp, expectedOtp, expiry) {
  if (!otp || !expectedOtp || otp !== expectedOtp) {
    return false;
  }

  const expiryDate = expiry instanceof Date ? expiry : new Date(expiry);
  return expiryDate instanceof Date && !Number.isNaN(expiryDate.getTime()) && Date.now() <= expiryDate.getTime();
}

/**
 * Create a formatted verification email message for a registration OTP.
 * @param {object} options
 * @param {string} options.fullName
 * @param {string} options.otp
 * @returns {string}
 */
function buildRegistrationOtpMessage({ fullName, otp }) {
  const name = normalizeFullName(fullName) || 'Applicant';
  return `Dear ${name},\n\n` +
    `Thank you for registering. Your verification code is ${otp}.\n\n` +
    `This code expires in 3 minutes. Please return to the portal and enter it to complete your registration.\n\n` +
    `If you did not request this code, please ignore this message.`;
}

/**
 * Hash a plaintext password using bcrypt.
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(String(password), saltRounds);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(String(password), String(hash));
}

module.exports = {
  normalizeEmail,
  normalizeFullName,
  normalizePhoneNumber,
  validateApplicantData,
  generateOtp,
  getOtpExpiry,
  isOtpValid,
  buildRegistrationOtpMessage,
  hashPassword,
  comparePassword
};
