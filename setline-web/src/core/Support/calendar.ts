// Foundation `Calendar` / `Date` operations the core uses, on the device's
// local time zone (iOS uses `Calendar.current`). Tests run with
// TZ=Europe/Brussels, the zone the iOS tests pin.

export const SECONDS_PER_DAY = 86_400;

/** `date.timeIntervalSince(other)`, in seconds. */
export function timeIntervalSince(date: Date, other: Date): number {
  return (date.getTime() - other.getTime()) / 1000;
}

/** `date.addingTimeInterval(seconds)`. */
export function addingTimeInterval(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

/** `Date(timeIntervalSince1970:)`. */
export function dateFromEpoch(seconds: number): Date {
  return new Date(seconds * 1000);
}

/** `calendar.startOfDay(for:)`. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `calendar.date(byAdding: .day, value:, to:)` — keeps the wall-clock time across DST. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** `calendar.date(byAdding: .weekOfYear, value:, to:)`. */
export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

/** `calendar.date(byAdding: .month, value:, to:)` — clamps to the month's last day as Foundation does. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

/** `calendar.dateComponents([.day], from: a, to: b).day` on the two days' starts: whole calendar days. */
export function daysBetween(from: Date, to: Date): number {
  const a = startOfDay(from);
  const b = startOfDay(to);
  // Round, because a DST change makes a day 23 or 25 hours long.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** `calendar.isDate(a, inSameDayAs: b)`. */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** `calendar.isDateInToday`. */
export function isToday(date: Date, now: Date = new Date()): boolean {
  return isSameDay(date, now);
}

/** `calendar.component(.weekday, from:)`: 1 = Sunday … 7 = Saturday, as Foundation counts. */
export function weekday(date: Date): number {
  return date.getDay() + 1;
}

/** 0 = Monday … 6 = Sunday. */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** The Monday that starts `date`'s week (`firstWeekday = 2`, `dateInterval(of: .weekOfYear)`). */
export function startOfMondayWeek(date: Date): Date {
  return addDays(startOfDay(date), -mondayIndex(date));
}

export interface DateComponents {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

/** `calendar.dateComponents([...], from:)` for the usual fields. Month is 1-based, as in Foundation. */
export function components(date: Date): Required<DateComponents> & { weekday: number } {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    weekday: weekday(date),
  };
}

/** `calendar.date(from: DateComponents(...))`. */
export function dateFrom(c: DateComponents): Date {
  return new Date(c.year ?? 2001, (c.month ?? 1) - 1, c.day ?? 1, c.hour ?? 0, c.minute ?? 0, c.second ?? 0);
}

/** `calendar.date(bySettingHour:minute:second:of:)`. */
export function settingTime(date: Date, hour: number, minute: number, second = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, second);
}

/** `calendar.component(.hour, from:)` etc. */
export const hourOf = (d: Date) => d.getHours();
export const minuteOf = (d: Date) => d.getMinutes();

/** ISO 8601 with fractional seconds, as `ISO8601DateFormatter` with `.withFractionalSeconds` writes. */
export function iso8601(date: Date): string {
  return date.toISOString();
}

/** `ISO8601DateFormatter().date(from:)`, with or without fractional seconds. */
export function parseISO8601(value: string): Date | undefined {
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t);
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** `DateFormatter` with an `en_US_POSIX` fixed format — the subset the core uses. */
export function formatPOSIX(date: Date, format: "yyyy-MM-dd" | "yyyy-MM-dd'T'HH:mm:ss" | "HH:mm"): string {
  const c = components(date);
  switch (format) {
    case "yyyy-MM-dd":
      return `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)}`;
    case "yyyy-MM-dd'T'HH:mm:ss":
      return `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}`;
    case "HH:mm":
      return `${pad(c.hour)}:${pad(c.minute)}`;
  }
}

const SHORT_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * `DateFormatter` with `locale = en_US` and a `dateFormat`, for the patterns
 * the app uses: EEEEEE (Mo), EEE (Mon), EEEE (Monday), d, dd, M, MMM, MMMM,
 * yyyy, yy, HH, H, mm, h, a. Literal text goes in single quotes, as in ICU.
 */
export function formatEnUS(date: Date, pattern: string): string {
  const c = components(date);
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "'") {
      const end = pattern.indexOf("'", i + 1);
      const literal = end === -1 ? pattern.slice(i + 1) : pattern.slice(i + 1, end);
      out += literal === "" ? "'" : literal;
      i = end === -1 ? pattern.length : end + 1;
      continue;
    }
    let run = 1;
    while (pattern[i + run] === ch) run++;
    const token = ch.repeat(run);
    i += run;
    switch (ch) {
      case "E":
        out += run >= 6 ? SHORT_WEEKDAYS[date.getDay()] : run === 4 ? WEEKDAYS[date.getDay()] : WEEKDAYS[date.getDay()].slice(0, 3);
        break;
      case "d":
        out += run >= 2 ? pad(c.day) : String(c.day);
        break;
      case "M":
        out += run >= 4 ? MONTHS[c.month - 1] : run === 3 ? SHORT_MONTHS[c.month - 1] : run === 2 ? pad(c.month) : String(c.month);
        break;
      case "y":
        out += run === 2 ? pad(c.year % 100) : String(c.year);
        break;
      case "H":
        out += run >= 2 ? pad(c.hour) : String(c.hour);
        break;
      case "h": {
        const h = c.hour % 12 === 0 ? 12 : c.hour % 12;
        out += run >= 2 ? pad(h) : String(h);
        break;
      }
      case "m":
        out += run >= 2 ? pad(c.minute) : String(c.minute);
        break;
      case "a":
        out += c.hour < 12 ? "AM" : "PM";
        break;
      default:
        out += token;
    }
  }
  return out;
}
