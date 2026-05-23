const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  recipientEmail: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['sent', 'failed'],
    default: 'sent'
  },
  errorMessage: {
    type: String,
    default: ''
  },
  channel: {
    type: String,
    enum: ['email', 'sms', 'system'],
    default: 'email'
  },
  actionType: {
    type: String,
    default: '',
    index: true
  },
  retryOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notification',
    required: false
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
