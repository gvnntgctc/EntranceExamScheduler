const mongoose = require('mongoose');

const rescheduleRequestSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule', required: false },
  requestedDate: { type: Date, required: false },
  requestedTime: { type: String, default: '', trim: true },
  requestedRoom: { type: String, default: '', trim: true },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  reviewedAt: { type: Date, required: false },
  adminNote: { type: String, default: '', trim: true, maxlength: 1000 }
}, { timestamps: true });

module.exports = mongoose.model('RescheduleRequest', rescheduleRequestSchema);
