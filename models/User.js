const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  firstName: {
    type: String,
    required: false,
    default: ''
  },
  middleName: {
    type: String,
    required: false,
    default: ''
  },
  surname: {
    type: String,
    required: false,
    default: ''
  },
  fullName: {
    type: String,
    required: false,
    default: ''
  },
  password: {
    type: String,
    required: false,
    default: ''
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  otp: {
    type: String,
    default: null
  },
  otpExpiry: {
    type: Date,
    default: null
  },
  role: {
    type: String,
    enum: ['admin', 'student'],
    default: 'student'
  },
  status: {
    type: String,
    enum: ['pending', 'passed', 'failed'],
    default: 'pending'
  },
  notificationSent: {
    type: Boolean,
    default: false
  },
  resultMessage: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
