const AdmissionSettings = require('../models/AdmissionSettings');

const DEFAULT_ROOMS = [
  '3rd Floor Room 301 PTC Main Campus',
  '3rd Floor Room 302 PTC Main Campus',
  '3rd Floor Room 303 PTC Main Campus'
];

const DEFAULT_TIME_SLOTS = [
  '7:00-8:30 A.M',
  '9:00-10:30 A.M',
  '1:30-3:00 P.M',
  '3:30-5:00 P.M'
];

const DEFAULT_HOLIDAYS = [
  ['2026-01-01', "New Year's Day"],
  ['2026-02-17', 'Chinese New Year'],
  ['2026-02-25', 'EDSA People Power Revolution Anniversary'],
  ['2026-03-20', "Eid'l Fitr"],
  ['2026-04-02', 'Maundy Thursday'],
  ['2026-04-03', 'Good Friday'],
  ['2026-04-04', 'Black Saturday'],
  ['2026-04-09', 'Day of Valor'],
  ['2026-05-01', 'Labor Day'],
  ['2026-05-27', "Eid'l Adha"],
  ['2026-06-12', 'Independence Day'],
  ['2026-08-21', 'Ninoy Aquino Day'],
  ['2026-08-31', 'National Heroes Day'],
  ['2026-11-01', "All Saints' Day"],
  ['2026-11-02', "All Souls' Day"],
  ['2026-11-30', 'Bonifacio Day'],
  ['2026-12-08', 'Feast of the Immaculate Conception of Mary'],
  ['2026-12-24', 'Christmas Eve'],
  ['2026-12-25', 'Christmas Day'],
  ['2026-12-30', 'Rizal Day'],
  ['2026-12-31', 'Last Day of the Year']
];

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateInputValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatLongDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function buildDefaultSettings() {
  const slotCapacities = [];
  DEFAULT_ROOMS.forEach(room => {
    DEFAULT_TIME_SLOTS.forEach(timeSlot => {
      slotCapacities.push({ room, timeSlot, capacity: 30 });
    });
  });

  return {
    key: 'default',
    schoolYear: '2026-2027',
    cycleStartDate: parseDateOnly('2026-03-01'),
    cycleEndDate: parseDateOnly('2026-08-31'),
    dailyCapacityFallback: 50,
    rooms: DEFAULT_ROOMS.map(name => ({ name, active: true })),
    timeSlots: DEFAULT_TIME_SLOTS.map(label => ({ label, active: true })),
    slotCapacities,
    holidays: DEFAULT_HOLIDAYS.map(([date, name]) => ({ date, name })),
    scheduleWeekdays: [0, 6]
  };
}

function normalizeSettings(raw) {
  const fallback = buildDefaultSettings();
  const settings = raw ? raw.toObject ? raw.toObject() : raw : fallback;
  const merged = { ...fallback, ...settings };
  merged.rooms = Array.isArray(settings.rooms) && settings.rooms.length ? settings.rooms : fallback.rooms;
  merged.timeSlots = Array.isArray(settings.timeSlots) && settings.timeSlots.length ? settings.timeSlots : fallback.timeSlots;
  merged.slotCapacities = Array.isArray(settings.slotCapacities) && settings.slotCapacities.length ? settings.slotCapacities : fallback.slotCapacities;
  merged.holidays = Array.isArray(settings.holidays) ? settings.holidays : fallback.holidays;
  merged.scheduleWeekdays = Array.isArray(settings.scheduleWeekdays) && settings.scheduleWeekdays.length ? settings.scheduleWeekdays : fallback.scheduleWeekdays;
  merged.cycleStartDate = new Date(merged.cycleStartDate);
  merged.cycleEndDate = new Date(merged.cycleEndDate);
  merged.cycleStartDate.setHours(0, 0, 0, 0);
  merged.cycleEndDate.setHours(23, 59, 59, 999);
  return merged;
}

async function getAdmissionSettings() {
  const existing = await AdmissionSettings.findOne({ key: 'default' });
  if (existing) return normalizeSettings(existing);
  const created = await AdmissionSettings.create(buildDefaultSettings());
  return normalizeSettings(created);
}

function getAllowedMonths(settings) {
  const start = new Date(settings.cycleStartDate);
  const end = new Date(settings.cycleEndDate);
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    months.push({
      label: cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      year: cursor.getFullYear(),
      month: cursor.getMonth(),
      monthNumber: cursor.getMonth() + 1
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function getHolidayName(settings, dateValue) {
  const dateKey = typeof dateValue === 'string' ? dateValue : toDateInputValue(dateValue);
  const mdKey = dateKey.slice(5);
  const holiday = (settings.holidays || []).find(item => item.date === dateKey || item.date === mdKey);
  return holiday ? holiday.name : '';
}

function getSlotCapacity(settings, room, timeSlot) {
  const match = (settings.slotCapacities || []).find(item => item.room === room && item.timeSlot === timeSlot);
  return match ? Number(match.capacity) : Number(settings.dailyCapacityFallback || 50);
}

function validateSettingsPayload(body = {}) {
  const errors = [];
  const schoolYear = String(body.schoolYear || '').trim();
  const cycleStartDate = parseDateOnly(body.cycleStartDate);
  const cycleEndDate = parseDateOnly(body.cycleEndDate);
  const dailyCapacityFallback = Number(body.dailyCapacityFallback);

  const rooms = String(body.rooms || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  const timeSlots = String(body.timeSlots || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  const holidays = String(body.holidays || '').split(/\r?\n/).map(line => {
    const [date, ...nameParts] = line.split('|');
    return { date: String(date || '').trim(), name: nameParts.join('|').trim() };
  }).filter(item => item.date || item.name);

  if (!schoolYear) errors.push('School year is required.');
  if (!cycleStartDate) errors.push('Admission cycle start date is invalid.');
  if (!cycleEndDate) errors.push('Admission cycle end date is invalid.');
  if (cycleStartDate && cycleEndDate && cycleStartDate > cycleEndDate) errors.push('Admission cycle start date must be before the end date.');
  if (!Number.isInteger(dailyCapacityFallback) || dailyCapacityFallback < 1) errors.push('Fallback daily capacity must be a positive whole number.');
  if (rooms.length === 0) errors.push('At least one room is required.');
  if (timeSlots.length === 0) errors.push('At least one time slot is required.');

  holidays.forEach(item => {
    if (!parseDateOnly(item.date) && !/^\d{2}-\d{2}$/.test(item.date)) errors.push(`Holiday date "${item.date}" is invalid.`);
    if (!item.name) errors.push(`Holiday "${item.date}" needs a name.`);
  });

  const slotCapacities = [];
  rooms.forEach(room => {
    timeSlots.forEach(timeSlot => {
      const fieldName = `capacity__${Buffer.from(`${room}|||${timeSlot}`).toString('base64')}`;
      const raw = body[fieldName];
      const capacity = raw === undefined || raw === '' ? dailyCapacityFallback : Number(raw);
      if (!Number.isInteger(capacity) || capacity < 0) {
        errors.push(`Capacity for ${room} / ${timeSlot} must be zero or more.`);
      } else {
        slotCapacities.push({ room, timeSlot, capacity });
      }
    });
  });

  return {
    errors,
    settings: {
      schoolYear,
      cycleStartDate,
      cycleEndDate,
      dailyCapacityFallback,
      rooms: rooms.map(name => ({ name, active: true })),
      timeSlots: timeSlots.map(label => ({ label, active: true })),
      holidays,
      slotCapacities,
      scheduleWeekdays: [0, 6]
    }
  };
}

module.exports = {
  buildDefaultSettings,
  formatLongDate,
  getAdmissionSettings,
  getAllowedMonths,
  getHolidayName,
  getSlotCapacity,
  parseDateOnly,
  toDateInputValue,
  validateSettingsPayload
};
