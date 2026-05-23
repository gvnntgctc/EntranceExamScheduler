const express = require('express');
const dns = require('dns').promises;
const https = require('https');
const User = require('../models/User');
const { buildEmailHtml } = require('../utils/emailUtils');
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  console.warn('nodemailer not installed; email sending is disabled.');
}
const twilio = require('twilio');
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  console.log('✓ Twilio client initialized for:', process.env.TWILIO_ACCOUNT_SID);
  console.log('✓ Twilio phone number:', process.env.TWILIO_PHONE_NUMBER);
} else {
  console.warn('⚠ Twilio credentials missing. ACCOUNT_SID:', !!process.env.TWILIO_ACCOUNT_SID, 'AUTH_TOKEN:', !!process.env.TWILIO_AUTH_TOKEN);
}

const router = express.Router();

let transporter = null;
if (nodemailer && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  const service = (process.env.EMAIL_SERVICE || 'gmail').toLowerCase();
  const transportConfig = { auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } };
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

  transporter = nodemailer.createTransport(transportConfig);
  transporter.verify().then(() => {
    console.log(`${service} transporter verified for:`, process.env.EMAIL_USER);
  }).catch(err => {
    console.error('Transporter verify failed:', err);
  });
  console.log('Email transporter initialized for:', process.env.EMAIL_USER, 'service:', service);
} else {
  console.log('Email transporter NOT initialized. nodemailer:', !!nodemailer, 'EMAIL_USER:', !!process.env.EMAIL_USER, 'EMAIL_PASS:', !!process.env.EMAIL_PASS);
}

async function isEmailDomainValid(address) {
  try {
    const domain = address.split('@')[1];
    if (!domain) return false;
    const mxRecords = await dns.resolveMx(domain);
    return Array.isArray(mxRecords) && mxRecords.length > 0;
  } catch (err) {
    console.warn('MX lookup failed for domain:', address, err.message);
    return false;
  }
}

async function validateEmailExistence(address) {
  const domainValid = await isEmailDomainValid(address);
  if (!domainValid) return false;

  const apiKey = process.env.EMAIL_VALIDATION_API_KEY;
  if (!apiKey) {
    return true;
  }

  return new Promise((resolve) => {
    const url = `https://api.apilayer.com/email_verification/check?email=${encodeURIComponent(address)}`;
    const options = {
      headers: {
        apikey: apiKey
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.smtp_check === true && json.format_valid === true);
        } catch (error) {
          console.warn('Email verification API parse error:', error.message);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.warn('Email verification API request failed:', err.message);
      resolve(false);
    });
  });
}

async function sendEmail({ to, subject, text, html }) {
  console.log('sendEmail called with to:', to, 'subject:', subject);
  if (!nodemailer) {
    console.warn('sendEmail skipped: nodemailer not available');
    return false;
  }

  if (!transporter) {
    console.warn('sendEmail skipped: transporter not configured with credentials');
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
    console.log('Email sent successfully to:', to);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

async function sendSMS(to, message) {
  try {
    console.log('sendSMS called with to:', to, 'from:', process.env.TWILIO_PHONE_NUMBER);
    
    // Mock SMS - log to console for development
    console.log('\n' + '='.repeat(60));
    console.log('📱 SMS MESSAGE');
    console.log('='.repeat(60));
    console.log('TO:', to);
    console.log('MESSAGE:', message);
    console.log('='.repeat(60) + '\n');

    return true;
  } catch (error) {
    console.error('SMS send failed:', error.code, error.message, error.details);
    return false;
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isGmail(address) {
  return /^([\w.+-]+)@gmail\.com$/i.test(address);
}

// Auth Page - Admin login only
router.get('/login', (req, res) => {
  const error = req.query.error || '';
  const success = req.query.success || '';
  const showLogin = req.query.showLogin === '1' || !!error;
  res.render('auth', { error, success, showLogin });
});

// Redirect /register to /apply
router.get('/register', (req, res) => {
  return res.redirect('/auth/apply');
});

// Admin Login (POST)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });

    if (!user || user.role !== 'admin' || user.password !== password) {
      return res.redirect('/auth/login?error=Invalid admin credentials.&showLogin=1');
    }

    req.session.userId = user._id;
    req.session.role = user.role;
    return res.redirect('/admin');
  } catch (err) {
    console.error('[LOGIN] ERROR:', err);
    return res.redirect('/auth/login?error=Login failed. Please try again.');
  }
});

// Application page for candidates
router.get('/apply', (req, res) => {
  const error = req.query.error || '';
  const success = req.query.success || '';
  const fullName = req.query.fullName || '';
  const phoneNumber = req.query.phoneNumber || '';
  const email = req.query.email || '';
  res.render('apply', { error, success, fullName, phoneNumber, email });
});

// POST /apply-review - validate submitted data and show confirmation
router.post('/apply-review', async (req, res) => {
  try {
    const fullName = (req.body.fullName || '').trim();
    const phoneNumber = (req.body.phoneNumber || '').trim();
    const rawEmail = (req.body.email || '').trim().toLowerCase();

    console.log('=== APPLY-REVIEW ATTEMPT ===');
    console.log('Input data:', { fullName, phoneNumber, rawEmail });

    const phoneRegex = /^(\+63|0)9\d{9}$/;
    const emailRegex = /^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$/;
    const nameRegex = /^[A-Za-z. ]+$/;

    if (!fullName || !phoneNumber || !rawEmail) {
      const params = new URLSearchParams({ error: 'All fields are required.', fullName, phoneNumber, email: rawEmail });
      return res.redirect(`/auth/apply?${params.toString()}`);
    }

    if (!nameRegex.test(fullName)) {
      const params = new URLSearchParams({ error: 'Invalid name format. Only letters, periods, and spaces are allowed.', fullName, phoneNumber, email: rawEmail });
      return res.redirect(`/auth/apply?${params.toString()}`);
    }

    if (!phoneRegex.test(phoneNumber)) {
      const params = new URLSearchParams({ error: 'Invalid phone number format.', fullName, phoneNumber, email: rawEmail });
      return res.redirect(`/auth/apply?${params.toString()}`);
    }

    if (!emailRegex.test(rawEmail)) {
      const params = new URLSearchParams({ error: 'Invalid email format.', fullName, phoneNumber, email: rawEmail });
      return res.redirect(`/auth/apply?${params.toString()}`);
    }

    const existingUser = await User.findOne({
      $or: [
        { phoneNumber },
        { email: rawEmail },
        { fullName: new RegExp(`^${escapeRegExp(fullName)}$`, 'i') }
      ]
    });

    console.log('Existing user found in apply-review:', existingUser ? {
      id: existingUser._id,
      name: existingUser.fullName,
      email: existingUser.email,
      phone: existingUser.phoneNumber,
      verified: existingUser.isVerified,
      status: existingUser.status
    } : 'None');

    if (existingUser && existingUser.isVerified) {
      let errorMessage = 'This information is already registered.';
      if (existingUser.phoneNumber === phoneNumber) {
        errorMessage = `Phone number ${phoneNumber} is already registered and verified.`;
      } else if (existingUser.email === rawEmail) {
        errorMessage = `Email ${rawEmail} is already registered and verified.`;
      } else if (existingUser.fullName && existingUser.fullName.toLowerCase() === fullName.toLowerCase()) {
        errorMessage = `Name "${fullName}" is already registered and verified.`;
      }
      const params = new URLSearchParams({ error: errorMessage, fullName, phoneNumber, email: rawEmail });
      return res.redirect(`/auth/apply?${params.toString()}`);
    }

    return res.render('apply-review', {
      fullName,
      phoneNumber,
      email: rawEmail
    });
  } catch (err) {
    console.error('[APPLY-REVIEW] ERROR:', err);
    return res.redirect('/auth/apply?error=Application failed. Please try again.');
  }
});

// POST /apply-confirm - create/update user after review
router.post('/apply-confirm', async (req, res) => {
  try {
    const fullName = (req.body.fullName || '').trim();
    const phoneNumber = (req.body.phoneNumber || '').trim();
    const rawEmail = (req.body.email || '').trim().toLowerCase();

    const phoneRegex = /^(\+63|0)9\d{9}$/;
    const emailRegex = /^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$/;
    const nameRegex = /^[A-Za-z. ]+$/;

    if (!fullName || !phoneNumber || !rawEmail) {
      const params = new URLSearchParams({ error: 'All fields are required.', fullName, phoneNumber, email: rawEmail });
      return res.redirect(`/auth/apply?${params.toString()}`);
    }

    if (!nameRegex.test(fullName)) {
      const params = new URLSearchParams({ error: 'Invalid name format. Only letters, periods, and spaces are allowed.', fullName, phoneNumber, email: rawEmail });
      return res.redirect(`/auth/apply?${params.toString()}`);
    }

    if (!phoneRegex.test(phoneNumber)) {
      const params = new URLSearchParams({ error: 'Invalid phone number format.', fullName, phoneNumber, email: rawEmail });
      return res.redirect(`/auth/apply?${params.toString()}`);
    }

    if (!emailRegex.test(rawEmail)) {
      const params = new URLSearchParams({ error: 'Invalid email format.', fullName, phoneNumber, email: rawEmail });
      return res.redirect(`/auth/apply?${params.toString()}`);
    }

    const existingUser = await User.findOne({
      $or: [
        { phoneNumber },
        { email: rawEmail },
        { fullName: new RegExp(`^${escapeRegExp(fullName)}$`, 'i') }
      ]
    });

    console.log('=== REGISTRATION ATTEMPT ===');
    console.log('Input data:', { fullName, phoneNumber, rawEmail });
    console.log('Existing user found:', existingUser ? {
      id: existingUser._id,
      name: existingUser.fullName,
      email: existingUser.email,
      phone: existingUser.phoneNumber,
      verified: existingUser.isVerified,
      status: existingUser.status,
      otp: existingUser.otp ? 'EXISTS' : 'NULL',
      otpExpiry: existingUser.otpExpiry
    } : 'None');

    if (existingUser && existingUser.isVerified) {
      let errorMessage = 'This information is already registered.';
      if (existingUser.phoneNumber === phoneNumber) {
        errorMessage = `Phone number ${phoneNumber} is already registered and verified.`;
      } else if (existingUser.email === rawEmail) {
        errorMessage = `Email ${rawEmail} is already registered and verified.`;
      } else if (existingUser.fullName && existingUser.fullName.toLowerCase() === fullName.toLowerCase()) {
        errorMessage = `Name "${fullName}" is already registered and verified.`;
      }
      console.log('❌ BLOCKING: Found verified user -', errorMessage);
      const params = new URLSearchParams({ error: errorMessage, fullName, phoneNumber, email: rawEmail });
      return res.redirect(`/auth/apply?${params.toString()}`);
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = new Date(Date.now() + 3 * 60 * 1000);

    // Store registration data in session instead of creating user immediately
    req.session.pendingRegistration = {
      fullName,
      phoneNumber,
      email: rawEmail,
      otp,
      otpExpiry: otpExpiry.toISOString() // Convert to string for session storage
    };

    console.log('✅ Registration data stored in session for:', rawEmail);

    const pendingSubject = 'Application Received - Entrance Examination Registration Confirmation';
    const pendingText = `Dear ${fullName || rawEmail},\n\nThank you for submitting your application for admission to our Bachelor of Science in Information Technology (BSIT) program.\n\nWe are pleased to confirm that we have successfully received your registration. Your application is currently under review by our Admissions Committee.\n\nYour one-time verification code is: ${otp}\n\nIMPORTANT: This code will expire in 3 minutes. Please enter this code to complete your email verification.\n\nNext steps:\n1. Enter your verification code in the portal\n2. Wait for admission decision notification\n3. Once approved, you will receive your exam schedule details\n\nWe will communicate with you via email regarding all updates about your application status and examination schedule. Please monitor your inbox regularly.\n\nIf you have any questions or concerns, please contact our Admissions Office.\n\nBest regards,\n\nAdmissions Office\nBachelor of Science in Information Technology Program\nEntranceExam Administration`;
    const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '';
    const pendingHtml = buildEmailHtml({
      appName: 'PTC Admission System',
      systemName: 'Pateros Technological College',
      heroText: 'Registration received and verification code issued.',
      greetingName: fullName || rawEmail,
      heading: 'Application Received',
      introText: 'Thank you for completing your registration. Your application is now being reviewed by the Admissions Committee.',
      applicantDetails: [
        { label: 'Applicant Name', value: fullName || rawEmail },
        { label: 'Email Address', value: rawEmail },
        { label: 'Phone Number', value: phoneNumber }
      ],
      statusLabel: 'Verification Required',
      statusMessage: `Your one-time verification code is ${otp}. It expires in 3 minutes.`,
      buttonText: appUrl ? 'Verify Your Email' : '',
      buttonUrl: appUrl ? `${appUrl}/auth/verify-otp` : '',
      footerNote: 'If you did not request this email, please disregard it.'
    });

    const emailSent = await sendEmail({
      to: rawEmail,
      subject: pendingSubject,
      text: pendingText,
      html: pendingHtml
    });

    if (!emailSent) {
      return res.redirect('/auth/apply?error=Failed to send pending notification email. Try again later.');
    }

    req.session.registrationEmail = rawEmail;

    return res.redirect('/auth/verify-otp?success=Registration received and pending review. Verification code sent to your email.');
  } catch (err) {
    console.error('[APPLY-CONFIRM] ERROR:', err);
    return res.redirect('/auth/apply?error=Application failed. Please try again.');
  }
});

// Verify OTP Page (GET)
router.get('/verify-otp', (req, res) => {
  if (!req.session.pendingRegistration || !req.session.registrationEmail) {
    return res.redirect('/auth/apply?error=Session expired. Apply again.');
  }
  const error = req.query.error || '';
  const success = req.query.success || '';
  const otpExpiry = new Date(req.session.pendingRegistration.otpExpiry);
  const countdownSeconds = Number.isFinite(otpExpiry.getTime())
    ? Math.max(0, Math.ceil((otpExpiry - Date.now()) / 1000))
    : 180;
  res.render('verify-otp', {
    email: req.session.registrationEmail,
    error,
    success,
    countdownSeconds
  });
});

// Verify OTP (POST)
router.post('/verify-otp', async (req, res) => {
  try {
    const { otp } = req.body;
    const email = req.session.registrationEmail;
    const pendingRegistration = req.session.pendingRegistration;

    if (!email || !pendingRegistration) {
      return res.redirect('/auth/apply?error=Session expired. Apply again.');
    }
    if (!otp) {
      return res.redirect('/auth/verify-otp?error=Please enter the verification code.');
    }

    // Check OTP against session data
    if (pendingRegistration.otp !== otp) {
      return res.redirect('/auth/verify-otp?error=Invalid code.');
    }

    const otpExpiry = new Date(pendingRegistration.otpExpiry);
    if (Date.now() > otpExpiry) {
      return res.redirect('/auth/apply?error=Code expired. Apply again.');
    }

    // Create user only after successful OTP verification
    const user = new User({
      phoneNumber: pendingRegistration.phoneNumber,
      email: pendingRegistration.email,
      fullName: pendingRegistration.fullName,
      role: 'student',
      status: 'pending',
      isVerified: true,
      resultMessage: 'Your application is pending review. We will notify you by email once schedule/result is set.'
    });

    try {
      await user.save();
      console.log('✅ User created and verified with ID:', user._id);
    } catch (err) {
      console.error('❌ Error creating verified user:', err);
      return res.redirect('/auth/verify-otp?error=Failed to complete registration.');
    }

    const verificationDate = new Date().toLocaleDateString('en-PH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const verifiedText = `Dear ${user.fullName || user.email},\n\n` +
      `Congratulations. Your email address has been successfully verified for the Pateros Technological College entrance examination registration.\n\n` +
      `Applicant Name: ${user.fullName}\n` +
      `Email Address: ${user.email}\n` +
      `Phone Number: ${user.phoneNumber}\n` +
      `Verification Status: Verified\n` +
      `Verification Date: ${verificationDate}\n\n` +
      `Next steps:\n` +
      `1. Your application is now pending review by the Admissions Committee.\n` +
      `2. You will receive a separate email once your exam schedule has been confirmed.\n` +
      `3. Please monitor your inbox regularly and add our address to your safe sender list.\n\n` +
      `If you have questions, please contact the Admissions Office.\n\n` +
      `Best regards,\n\n` +
      `Admissions Office\n` +
      `Pateros Technological College\n` +
      `Entrance Exam Administration`;
    const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '';
    const verifiedHtml = buildEmailHtml({
      appName: 'PTC Admission System',
      systemName: 'Pateros Technological College',
      heroText: 'Your registration has been verified successfully.',
      greetingName: user.fullName || user.email,
      heading: 'Application Verified',
      introText: 'Thank you for verifying your email. Your application is now pending review by our Admissions Committee.',
      applicantDetails: [
        { label: 'Applicant Name', value: user.fullName },
        { label: 'Email Address', value: user.email },
        { label: 'Phone Number', value: user.phoneNumber }
      ],
      statusLabel: 'Verification Complete',
      statusMessage: 'Your application is now under review. We will notify you when the exam schedule is ready.',
      buttonText: appUrl ? 'Return to Applicant Portal' : '',
      buttonUrl: appUrl ? `${appUrl}/auth/login` : '',
      footerNote: 'If you have any questions, please contact our Admissions Office.'
    });

    await sendEmail({
      to: user.email,
      subject: 'Application Verified — Entrance Exam Registration',
      text: verifiedText,
      html: verifiedHtml
    });

    // Clean up session
    delete req.session.registrationEmail;
    delete req.session.pendingRegistration;

    return res.redirect('/auth/apply?success=Email verified successfully. Registration complete.');
  } catch (err) {
    console.error('[VERIFY-OTP] ERROR:', err);
    return res.redirect('/auth/verify-otp?error=Verification failed. Please try again.');
  }
});

router.post('/resend-otp', async (req, res) => {
  try {
    const email = req.session.registrationEmail;
    const pendingRegistration = req.session.pendingRegistration;

    if (!email || !pendingRegistration) {
      return res.redirect('/auth/apply?error=Session expired. Apply again.');
    }

    // Generate new OTP and update session
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = new Date(Date.now() + 3 * 60 * 1000);

    pendingRegistration.otp = otp;
    pendingRegistration.otpExpiry = otpExpiry.toISOString();

    console.log('✅ New OTP generated for resend:', email);

    const otpMessage = `Dear Applicant,\n\n` +
      `Your request for a new verification code has been processed. Please use the code below to complete your email verification.\n\n` +
      `One-time verification code: ${otp}\n` +
      `Expires in: 3 minutes\n\n` +
      `Please enter this code in the portal to verify your email address.\n\n` +
      `If you did not request this code, please disregard this email.\n\n` +
      `Best regards,\n\n` +
      `Admissions Office\n` +
      `Pateros Technological College\n` +
      `Entrance Exam Administration`;
    const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '';
    const otpHtml = buildEmailHtml({
      appName: 'PTC Admission System',
      systemName: 'Pateros Technological College',
      heroText: 'Your verification code has been resent.',
      greetingName: 'Applicant',
      heading: 'Verification Code Resent',
      introText: 'A new one-time verification code has been generated for your registration.',
      statusLabel: 'Verification Code',
      statusMessage: `Your current verification code is ${otp} and it expires in 3 minutes.`,
      buttonText: appUrl ? 'Continue Verification' : '',
      buttonUrl: appUrl ? `${appUrl}/auth/verify-otp` : '',
      footerNote: 'If you did not request this code, please ignore this message.'
    });

    const emailSent = await sendEmail({
      to: email,
      subject: 'Entrance Exam — Verification Code Resent',
      text: otpMessage,
      html: otpHtml
    });

    if (!emailSent) {
      return res.redirect('/auth/verify-otp?error=Failed to send code.');
    }

    return res.redirect('/auth/verify-otp?success=New code sent to your email.');
  } catch (err) {
    console.error('[RESEND-OTP] ERROR:', err);
    return res.redirect('/auth/verify-otp?error=Failed to resend code.');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;
