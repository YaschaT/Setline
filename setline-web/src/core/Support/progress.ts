// Foundation behaviour the Progress port needs beyond swift.ts / calendar.ts.

import { formatFixed } from "./engine";

const collator = new Intl.Collator(undefined, { sensitivity: "accent" });

/**
 * `a.localizedCaseInsensitiveCompare(b)`: the current locale's collation,
 * ignoring case only. Returns -1, 0 or 1 (`.orderedAscending`, `.orderedSame`,
 * `.orderedDescending`).
 */
export function localizedCaseInsensitiveCompare(a: string, b: string): number {
  return Math.sign(collator.compare(a, b));
}

/** `a.localizedCaseInsensitiveContains(b)`. */
export function localizedCaseInsensitiveContains(text: string, other: string): boolean {
  return text.toLocaleLowerCase().includes(other.toLocaleLowerCase());
}

/** `s.trimmingCharacters(in: .whitespacesAndNewlines)`. */
export function trimmingWhitespacesAndNewlines(s: string): string {
  return s.replace(/^[\s\u0085]+|[\s\u0085]+$/gu, "");
}

/**
 * `DateFormatter` with `en_US_POSIX`, `TimeZone(secondsFromGMT: 0)` and
 * `dateFormat = "yyyy-MM-dd"`: the start of that day in UTC, or nil when the
 * text is not exactly such a date.
 */
export function dateFromUTCDayKey(text: string): Date | undefined {
  const match = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 100) date.setUTCFullYear(year);
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date;
}

/** `Decimal(string: String(format: "%.2f", value)) ?? 0`. */
export function decimalFromTwoPlaces(value: number): number {
  const text = formatFixed(value, 2);
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * `Calendar(identifier: .iso8601)` in the local time zone:
 * `component(.weekOfYear, from:)`, the ISO 8601 week number.
 */
export function isoWeekOfYear(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = (day.getUTCDay() + 6) % 7; // 0 = Monday
  day.setUTCDate(day.getUTCDate() - weekday + 3); // the week's Thursday
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  return 1 + Math.round((day.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/** Swift `Date.distantPast`. */
export const distantPast = new Date(-62135769600000);
