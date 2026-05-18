const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Check whether a value is a valid Date object.
 * @param {any} value
 * @returns {boolean}
 */
function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Convert a date string into a valid Date object.
 * @param {string} dateString
 * @returns {Date|null}
 */
function parseDate(dateString) {
  const date = new Date(dateString);
  return isValidDate(date) ? date : null;
}

/**
 * Ensure schedule input values are normalized and safe.
 * @param {object} data
 * @param {string} data.startDate
 * @param {string} data.endDate
 * @param {string} data.examType
 * @param {string[]} data.subjects
 * @param {string} data.location
 * @returns {{valid: boolean, errors: string[], schedule: object|null}}
 */
function normalizeScheduleInput(data = {}) {
  const errors = [];
  const startDate = parseDate(data.startDate);
  const endDate = parseDate(data.endDate);
  const examType = String(data.examType || '').trim();
  const subjects = Array.isArray(data.subjects) ? data.subjects.map(String).filter(Boolean) : [];
  const location = String(data.location || '').trim();

  if (!startDate) {
    errors.push('Start date is missing or invalid.');
  }

  if (!endDate) {
    errors.push('End date is missing or invalid.');
  }

  if (startDate && endDate && startDate > endDate) {
    errors.push('Start date must be on or before end date.');
  }

  if (!examType) {
    errors.push('Exam type is required.');
  }

  if (subjects.length === 0) {
    errors.push('At least one subject is required.');
  }

  if (!location) {
    errors.push('Location is required.');
  }

  return {
    valid: errors.length === 0,
    errors,
    schedule: errors.length > 0 ? null : {
      startDate,
      endDate,
      examType,
      subjects,
      location,
      createdAt: new Date()
    }
  };
}

/**
 * Calculate the number of calendar days in a schedule.
 * @param {{startDate: Date, endDate: Date}} schedule
 * @returns {number}
 */
function getScheduleDurationDays(schedule) {
  if (!schedule || !isValidDate(schedule.startDate) || !isValidDate(schedule.endDate)) {
    return 0;
  }

  const diffMs = schedule.endDate.getTime() - schedule.startDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Determine whether two schedule periods overlap.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function isScheduleOverlap(a, b) {
  if (!a || !b || !isValidDate(a.startDate) || !isValidDate(a.endDate) || !isValidDate(b.startDate) || !isValidDate(b.endDate)) {
    return false;
  }

  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/**
 * Check whether a candidate schedule overlaps any existing schedules.
 * @param {Array<object>} existingSchedules
 * @param {object} candidateSchedule
 * @returns {boolean}
 */
function hasOverlappingSchedule(existingSchedules = [], candidateSchedule) {
  return existingSchedules.some(existing => isScheduleOverlap(existing, candidateSchedule));
}

/**
 * Format a schedule object for display in views.
 * @param {object} schedule
 * @returns {object}
 */
function formatScheduleForDisplay(schedule = {}) {
  const startDate = isValidDate(schedule.startDate) ? schedule.startDate : null;
  const endDate = isValidDate(schedule.endDate) ? schedule.endDate : null;

  return {
    examType: schedule.examType || 'Unknown',
    subjects: Array.isArray(schedule.subjects) ? schedule.subjects : [],
    location: schedule.location || 'Not specified',
    startDate: startDate ? startDate.toISOString().slice(0, 10) : null,
    endDate: endDate ? endDate.toISOString().slice(0, 10) : null,
    durationDays: getScheduleDurationDays(schedule),
    startDayName: startDate ? WEEK_DAYS[startDate.getDay()] : null,
    endDayName: endDate ? WEEK_DAYS[endDate.getDay()] : null
  };
}

module.exports = {
  isValidDate,
  parseDate,
  normalizeScheduleInput,
  getScheduleDurationDays,
  isScheduleOverlap,
  hasOverlappingSchedule,
  formatScheduleForDisplay
};
