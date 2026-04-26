const express = require('express');
const dns = require('dns').promises;
const https = require('https');
const User = require('../models/User');
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

async function sendEmail({ to, subject, text }) {
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
      text
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

function isGmail(address) {
  return /^([\w.+-]+)@gmail\.com$/i.test(address);
}

// Auth Page - Admin login only
router.get('/login', (req, res) => {
  const error = req.query.error || '';
  const success = req.query.success || '';
  res.render('auth', { error, success });
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
      return res.redirect('/auth/login?error=Invalid admin credentials.');
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
  res.render('apply', { error, success });
});

// POST /apply - student enters full personal info + phone and email
router.post('/apply', async (req, res) => {
  try {
    console.log('Request body:', req.body);
    const fullName = (req.body.fullName || '').trim();
    const phoneNumber = (req.body.phoneNumber || '').trim();
    const rawEmail = (req.body.email || '').trim().toLowerCase();

    console.log('Received form data:', { fullName, phoneNumber, rawEmail });

    if (!fullName || !phoneNumber || !rawEmail) {
      return res.redirect('/auth/apply?error=All fields are required.');
    }

    // Validate phone number format (Philippines: 09xxxxxxxxx or +63xxxxxxxxx)
    const phoneRegex = /^(\+63|0)9\d{9}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.redirect('/auth/apply?error=Invalid phone number format. Use 09123456789 or +639123456789.');
    }

    // Basic email validation
    const emailRegex = /^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(rawEmail)) {
      return res.redirect('/auth/apply?error=Invalid email format.');
    }

    let user = await User.findOne({ phoneNumber });

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

    if (user) {
      if (user.isVerified) {
        // Allow updating personal info and email even if already verified
        user.fullName = fullName;
        user.email = rawEmail;
        try {
          await user.save();
          console.log('Updated verified user:', user);
          return res.redirect('/auth/apply?success=Your information has been updated. You are already registered and will receive notifications by email.');
        } catch (err) {
          console.error('Error updating verified user:', err);
          return res.redirect('/auth/apply?error=Failed to update information.');
        }
      }

      user.fullName = fullName;
      user.email = rawEmail;
      user.otp = otp;
      user.otpExpiry = otpExpiry;
      try {
        await user.save();
        console.log('Updated unverified user:', user);
      } catch (err) {
        console.error('Error updating unverified user:', err);
        return res.redirect('/auth/apply?error=Failed to update registration.');
      }
    } else {
      console.log('Creating new user with:', { phoneNumber, email: rawEmail, fullName });
      user = new User({
        phoneNumber,
        email: rawEmail,
        fullName,
        role: 'student',
        status: 'pending',
        isVerified: false,
        resultMessage: 'Your application is pending review. We will notify you by email once schedule/result is set.',
        otp,
        otpExpiry
      });
      try {
        await user.save();
        console.log('New user saved:', user);
      } catch (err) {
        console.error('Error saving new user:', err);
        return res.redirect('/auth/apply?error=Failed to save registration.');
      }
    }

    req.session.registrationUserId = user._id;

    const pendingSubject = 'Entrance Exam - Registration Pending';
    const pendingText = `Hello ${fullName || rawEmail},\n\nYour registration has been received and your account is currently pending review.\n\nYour verification code is ${otp}. It expires in 15 minutes.\n\nWe will notify you by email once your account is approved and when your exam schedule is available.\n\nThank you for applying.`;

    const emailSent = await sendEmail({
      to: rawEmail,
      subject: pendingSubject,
      text: pendingText
    });

    if (!emailSent) {
      return res.redirect('/auth/apply?error=Failed to send pending notification email. Try again later.');
    }

    req.session.registrationEmail = rawEmail;
    return res.redirect('/auth/verify-otp?success=Registration received and pending review. Verification code sent to your email.');
  } catch (err) {
    console.error('[APPLY] ERROR:', err);
    return res.redirect('/auth/apply?error=Application failed. Please try again.');
  }
});

// Verify OTP Page (GET)
router.get('/verify-otp', (req, res) => {
  if (!req.session.registrationUserId || !req.session.registrationEmail) {
    return res.redirect('/auth/apply?error=Session expired. Apply again.');
  }
  const error = req.query.error || '';
  const success = req.query.success || '';
  res.render('verify-otp', { email: req.session.registrationEmail, error, success });
});

// Verify OTP (POST)
router.post('/verify-otp', async (req, res) => {
  try {
    const { otp } = req.body;
    const email = req.session.registrationEmail;

    if (!email) {
      return res.redirect('/auth/apply?error=Session expired. Apply again.');
    }
    if (!otp) {
      return res.redirect('/auth/verify-otp?error=Please enter the verification code.');
    }

    const user = await User.findById(req.session.registrationUserId);
    if (!user || user.email !== email) {
      return res.redirect('/auth/apply?error=User not found.');
    }
    if (user.otp !== otp) {
      return res.redirect('/auth/verify-otp?error=Invalid code.');
    }
    if (Date.now() > user.otpExpiry) {
      return res.redirect('/auth/apply?error=Code expired. Apply again.');
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    await sendEmail({
      to: user.email,
      subject: 'Application Verified',
      text: `Your email has been verified. You will receive exam schedule and status notifications by email.`
    });

    delete req.session.registrationEmail;
    return res.redirect('/auth/apply?success=Email verified successfully.');
  } catch (err) {
    console.error('[VERIFY-OTP] ERROR:', err);
    return res.redirect('/auth/verify-otp?error=Verification failed. Please try again.');
  }
});

router.post('/resend-otp', async (req, res) => {
  try {
    const email = req.session.registrationEmail;
    const userId = req.session.registrationUserId;
    if (!email || !userId) {
      return res.redirect('/auth/apply?error=Session expired. Apply again.');
    }

    const user = await User.findById(userId);
    if (!user || user.email !== email) {
      return res.redirect('/auth/apply?error=User not found.');
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    const emailSent = await sendEmail({
      to: user.email,
      subject: 'Entrance Exam - New Verification Code',
      text: `Your new verification code is ${otp}. It expires in 15 minutes.`
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
