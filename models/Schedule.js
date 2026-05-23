const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  examDate: { type: Date, required: true },
  examTime: { type: String, required: true }, // e.g., "10:00 AM"
  location: { type: String, required: true }, // e.g., "Room 101"
  rescheduled: { type: Boolean, default: false },
  rescheduledAt: { type: Date, required: false },
  rescheduleCount: { type: Number, default: 0 },
  previousSchedules: {
    type: [{
      examDate: Date,
      examTime: String,
      location: String,
      changedAt: { type: Date, default: Date.now }
    }],
    default: []
  },
  permitCode: { type: String, default: '', index: true }
}, { timestamps: true });

scheduleSchema.index({ studentId: 1, examDate: 1, examTime: 1 }, { unique: true });
scheduleSchema.index({ examDate: 1, location: 1, examTime: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
