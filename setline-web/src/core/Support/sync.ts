// Foundation behaviour the Sync port needs beyond swift.ts / calendar.ts /
// codable.ts.

import { dec } from "./swift";

/**
 * `"\(decimal)"` — how Swift prints a `Decimal`: plain digits, a point, no
 * exponent and no trailing zeros ("102.5", "100", "-2.5").
 */
export function decimalDescription(x: number): string {
  const value = dec(x);
  const text = String(value);
  if (!/e/i.test(text)) return text;
  const fixed = value.toFixed(20);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/**
 * `ISO8601DateFormatter` as `JSONDecoder`'s `.iso8601` strategy reads it on
 * current Foundation: internet date-time, with or without fractional seconds,
 * `Z` or a numeric offset.
 */
export function parseISO8601Internet(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match) return undefined;
  const fraction = match[7] ? `.${match[7].slice(1, 4).padEnd(3, "0")}` : "";
  const zone = match[8] === "Z" ? "Z" : match[8].length === 5 ? `${match[8].slice(0, 3)}:${match[8].slice(3)}` : match[8];
  const t = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${fraction}${zone}`);
  return Number.isNaN(t) ? undefined : new Date(t);
}
