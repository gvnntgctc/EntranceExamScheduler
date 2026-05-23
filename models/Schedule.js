const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  examDate: { type: Date, required: true },
  examTime: { type: String, required: true }, // e.g., "10:00 AM"
  location: { type: String, required: true }, // e.g., "Room 101"
});

scheduleSchema.index({ studentId: 1, examDate: 1, examTime: 1 }, { unique: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
