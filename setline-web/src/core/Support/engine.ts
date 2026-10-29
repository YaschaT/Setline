// Foundation behaviour the Engine port needs beyond swift.ts / calendar.ts.

import { addDays, startOfDay } from "./calendar";

/**
 * Swift `sorted(by: areInIncreasingOrder)` with a predicate rather than a key.
 * Swift's sort is stable in practice, and so is ours.
 */
export function sortedWhere<T>(items: readonly T[], areInIncreasingOrder: (a: T, b: T) => boolean): T[] {
  return [...items].sort((a, b) => (areInIncreasingOrder(a, b) ? -1 : areInIncreasingOrder(b, a) ? 1 : 0));
}

/**
 * `calendar.dateComponents([.day], from: a, to: b).day` on two instants (not
 * day starts): whole days elapsed on the wall clock, truncated toward zero,
 * as Foundation counts them.
 */
export function dayComponent(from: Date, to: Date): number {
  const a = startOfDay(from);
  const b = startOfDay(to);
  let days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (to.getTime() >= from.getTime()) {
    if (addDays(from, days).getTime() > to.getTime()) days -= 1;
  } else if (addDays(from, days).getTime() < to.getTime()) {
    days += 1;
  }
  return days;
}

/** `calendar.dateComponents([.weekOfYear], from: a, to: b).weekOfYear`: whole weeks, truncated toward zero. */
export function weekOfYearComponent(from: Date, to: Date): number {
  return Math.trunc(dayComponent(from, to) / 7);
}

/** `calendar.isDate(a, equalTo: b, toGranularity: .month)`. */
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Swift `String.capitalized`: every word's first letter upper-cased, the rest lower-cased. */
export function capitalized(text: string): string {
  return text.toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * `String(format: "%.<digits>f", x)`: printf rounds the exact binary value,
 * and an exact tie goes to the even digit (2.25 → "2.2"), where
 * `toFixed` would round it up.
 */
export function formatFixed(x: number, digits: number): string {
  const f = 10 ** digits;
  const scaled = x * f;
  const floor = Math.floor(scaled);
  if (scaled - floor === 0.5 && Number.isInteger(scaled * 2) && scaled / f === x) {
    const even = floor % 2 === 0 ? floor : floor + 1;
    return (even / f).toFixed(digits);
  }
  return x.toFixed(digits);
}

/** `String(format: "%02d", n)`. */
export function pad2(n: number): string {
  const v = Math.trunc(n);
  return v < 0 ? `-${String(-v).padStart(1, "0")}` : String(v).padStart(2, "0");
}

/** Swift `Int("12")`: an optional sign and ASCII digits, nothing else (no whitespace). */
export function swiftInt(text: string): number | undefined {
  return /^[+-]?\d+$/.test(text) ? Number.parseInt(text, 10) : undefined;
}
