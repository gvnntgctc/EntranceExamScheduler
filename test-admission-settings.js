const assert = require('assert');
const {
  buildDefaultSettings,
  getAllowedMonths,
  getHolidayName,
  getSlotCapacity,
  parseDateOnly,
  validateSettingsPayload
} = require('./utils/admissionSettings');

const settings = buildDefaultSettings();
assert.strictEqual(parseDateOnly('2026-03-01').getFullYear(), 2026);
assert.strictEqual(parseDateOnly('not-a-date'), null);
assert.deepStrictEqual(getAllowedMonths(settings).map(month => month.monthNumber), [3, 4, 5, 6, 7, 8]);
assert.strictEqual(getHolidayName(settings, '2026-04-09'), 'Day of Valor');
assert.strictEqual(getSlotCapacity(settings, '3rd Floor Room 301 PTC Main Campus', '7:00-8:30 A.M'), 30);

const badPayload = validateSettingsPayload({
  schoolYear: '',
  cycleStartDate: '2026-09-01',
  cycleEndDate: '2026-03-01',
  dailyCapacityFallback: '0',
  rooms: '',
  timeSlots: ''
});
assert.ok(badPayload.errors.length >= 5);

const goodPayload = validateSettingsPayload({
  schoolYear: '2026-2027',
  cycleStartDate: '2026-03-01',
  cycleEndDate: '2026-08-31',
  dailyCapacityFallback: '25',
  rooms: 'Room A',
  timeSlots: '8:00 AM',
  holidays: '2026-04-09|Day of Valor'
});
assert.deepStrictEqual(goodPayload.errors, []);
assert.strictEqual(goodPayload.settings.slotCapacities[0].capacity, 25);

console.log('admission settings unit checks passed');
