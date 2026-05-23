const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true }
}, { _id: false });

const timeSlotSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true }
}, { _id: false });

const slotCapacitySchema = new mongoose.Schema({
  room: { type: String, required: true, trim: true },
  timeSlot: { type: String, required: true, trim: true },
  capacity: { type: Number, required: true, min: 0 }
}, { _id: false });

const holidaySchema = new mongoose.Schema({
  date: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true }
}, { _id: false });

const admissionSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  schoolYear: { type: String, required: true, trim: true },
  cycleStartDate: { type: Date, required: true },
  cycleEndDate: { type: Date, required: true },
  dailyCapacityFallback: { type: Number, default: 50, min: 1 },
  rooms: { type: [roomSchema], default: [] },
  timeSlots: { type: [timeSlotSchema], default: [] },
  slotCapacities: { type: [slotCapacitySchema], default: [] },
  holidays: { type: [holidaySchema], default: [] },
  scheduleWeekdays: { type: [Number], default: [0, 6] }
}, { timestamps: true });

module.exports = mongoose.model('AdmissionSettings', admissionSettingsSchema);
