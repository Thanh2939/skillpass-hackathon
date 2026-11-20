import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_DATE_YEAR,
  daysInMonth,
  formatCalendarDate,
  isValidCalendarDate,
  parseCalendarDate,
} from '../src/utils/calendarDate.ts';

const today = new Date(2026, 10, 16, 12, 0, 0); // 16/11/2026

test('daysInMonth handles leap years and boundaries', () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2025, 2), 28);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 12), 31);
});

test('parseCalendarDate accepts valid dd/mm/yyyy only', () => {
  assert.deepEqual(parseCalendarDate('15/10/2026', today), { day: 15, month: 10, year: 2026 });
  assert.equal(parseCalendarDate('31/02/2026', today), null);
  assert.deepEqual(parseCalendarDate('16/11/2026', today), { day: 16, month: 11, year: 2026 });
  assert.equal(parseCalendarDate('17/11/2026', today), null, 'future day rejected');
  assert.equal(parseCalendarDate('15/10', today), null);
  assert.equal(parseCalendarDate('', today), null);
});

test('parseCalendarDate matches issue-date bounds (1900..today)', () => {
  assert.deepEqual(parseCalendarDate('01/01/1900', today), { day: 1, month: 1, year: 1900 });
  assert.equal(parseCalendarDate('31/12/1899', today), null);
  assert.equal(parseCalendarDate('15/10/2027', today), null);
});

test('formatCalendarDate pads to dd/mm/yyyy', () => {
  assert.equal(formatCalendarDate({ day: 5, month: 3, year: 2026 }), '05/03/2026');
  assert.equal(formatCalendarDate({ day: 16, month: 11, year: 2026 }), '16/11/2026');
});

test('isValidCalendarDate rejects impossible parts', () => {
  assert.equal(isValidCalendarDate({ day: 0, month: 1, year: 2026 }, today), false);
  assert.equal(isValidCalendarDate({ day: 1, month: 13, year: 2026 }, today), false);
  assert.equal(isValidCalendarDate({ day: 1, month: 1, year: MIN_DATE_YEAR - 1 }, today), false);
});
