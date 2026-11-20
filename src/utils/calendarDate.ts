/**
 * Helper thuần cho DateField: ngày hợp lệ trong khoảng 1900 → hôm nay.
 * Quy tắc khớp với normalizeIssueDate trong SubmitScreen (không import để
 * tránh phụ thuộc UI ↔ helper và giữ helper test được bằng Node).
 */

export const MIN_DATE_YEAR = 1900;
export const YEAR_PAGE_SIZE = 20;

export interface CalendarDate {
  day: number;
  month: number;
  year: number;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function isValidCalendarDate(
  { day, month, year }: CalendarDate,
  today: Date = new Date(),
): boolean {
  if (year < MIN_DATE_YEAR || year > today.getFullYear()) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return new Date(year, month - 1, day).getTime() <= today.getTime();
}

export function parseCalendarDate(
  value: string,
  today: Date = new Date(),
): CalendarDate | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((value ?? '').trim());
  if (!match) return null;
  const parts = {
    day: Number(match[1]),
    month: Number(match[2]),
    year: Number(match[3]),
  };
  return isValidCalendarDate(parts, today) ? parts : null;
}

export function formatCalendarDate({ day, month, year }: CalendarDate): string {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}
