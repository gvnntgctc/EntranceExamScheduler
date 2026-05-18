const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/examScheduler';

/**
 * Connect to MongoDB using Mongoose.
 */
function connectToDatabase() {
  return mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
}

/**
 * Create a MongoDB-backed session store for express-session.
 */
function createSessionStore() {
  return MongoStore.create({
    mongoUrl: MONGODB_URI,
    ttl: 24 * 60 * 60 // 1 day
  });
}

/**
 * User model: stores applicant/admin accounts.
 */
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  firstName: { type: String, default: '' },
  middleName: { type: String, default: '' },
  surname: { type: String, default: '' },
  fullName: { type: String, default: '' },
  password: { type: String, default: '' },
  phoneNumber: { type: String, required: true, unique: true },
  isVerified: { type: Boolean, default: false },
  otp: { type: String, default: null },
  otpExpiry: { type: Date, default: null },
  role: { type: String, enum: ['admin', 'student'], default: 'student' },
  status: { type: String, enum: ['pending', 'passed', 'failed'], default: 'pending' },
  notificationSent: { type: Boolean, default: false },
  resultMessage: { type: String, default: '' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

/**
 * Schedule model: stores exam schedule assignments.
 */
const scheduleSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  examDate: { type: Date, required: true },
  examTime: { type: String, required: true },
  location: { type: String, required: true }
});

const Schedule = mongoose.model('Schedule', scheduleSchema);

/**
 * Notification model: stores email notification history.
 */
const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  recipientEmail: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  status: { type: String, enum: ['sent', 'failed'], default: 'sent' },
  errorMessage: { type: String, default: '' }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = {
  connectToDatabase,
  createSessionStore,
  User,
  Schedule,
  Notification
};
