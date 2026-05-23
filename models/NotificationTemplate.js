const mongoose = require('mongoose');

const notificationTemplateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  channel: { type: String, enum: ['email', 'sms'], default: 'email' },
  subject: { type: String, default: '', trim: true },
  body: { type: String, required: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
