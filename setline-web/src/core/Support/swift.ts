// Swift standard-library behaviour the port depends on, in one place, so
// every ported file rounds, compares and picks exactly as the iOS app does.

/** Swift `x.rounded()`: to nearest, halves away from zero (−2.5 → −3). */
export function rounded(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** Swift `.rounded(.up)` / `.rounded(.down)` / `.rounded(.towardZero)`. */
export const roundedUp = Math.ceil;
export const roundedDown = Math.floor;
export const roundedTowardZero = Math.trunc;

/**
 * Swift `Decimal` is exact base 10; JS numbers are binary. Results that the
 * iOS code keeps as Decimal go through `dec` before they are compared or
 * shown, so 0.1 + 0.2 reads 0.3 as it does there.
 */
export function dec(x: number): number {
  return Math.round(x * 1e9) / 1e9;
}

/** `NSDecimalNumber` rounding to `places` decimals, halves away from zero. */
export function roundPlaces(x: number, places: number): number {
  const f = 10 ** places;
  return dec(rounded(dec(x * f)) / f);
}

/** Swift `Comparable` ordering for the tuples and strings `max(by:)` sorts on. */
export function compare(a: unknown, b: unknown): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = compare(a[i], b[i]);
      if (c !== 0) return c;
    }
    return a.length - b.length;
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return (a as number) - (b as number);
}

/** Swift `seq.max(by:)`: replaces only when strictly greater, so the FIRST maximal element wins, as in Swift. */
export function maxBy<T>(items: readonly T[], areInIncreasingOrder: (a: T, b: T) => boolean): T | undefined {
  let best: T | undefined;
  let first = true;
  for (const item of items) {
    if (first || areInIncreasingOrder(best as T, item)) {
      best = item;
      first = false;
    }
  }
  return best;
}

/** Swift `seq.min(by:)`: the FIRST minimal element wins, as in Swift. */
export function minBy<T>(items: readonly T[], areInIncreasingOrder: (a: T, b: T) => boolean): T | undefined {
  let best: T | undefined;
  let first = true;
  for (const item of items) {
    if (first || areInIncreasingOrder(item, best as T)) {
      best = item;
      first = false;
    }
  }
  return best;
}

/** `max(by:)` / `min(by:)` on a key, the common case. */
export function maxOf<T>(items: readonly T[], key: (t: T) => unknown): T | undefined {
  return maxBy(items, (a, b) => compare(key(a), key(b)) < 0);
}
export function minOf<T>(items: readonly T[], key: (t: T) => unknown): T | undefined {
  return minBy(items, (a, b) => compare(key(a), key(b)) < 0);
}

/** Swift `sorted { … }` is not stable; ours is, which only makes ties deterministic. */
export function sortedBy<T>(items: readonly T[], key: (t: T) => unknown, descending = false): T[] {
  return [...items].sort((a, b) => (descending ? -1 : 1) * compare(key(a), key(b)));
}

/** Swift `Equatable` for value types: structural equality. Dates compare by time. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((v) => b.has(v));
  if (a instanceof Map && b instanceof Map) {
    return a.size === b.size && [...a].every(([k, v]) => b.has(k) && deepEqual(v, b.get(k)));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Swift `UUID().uuidString`: upper-case. */
export function uuid(): string {
  return crypto.randomUUID().toUpperCase();
}

/** Swift `Array(Set(xs))` keeps no order; callers that need one sort after. */
export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** Swift `Dictionary(grouping:by:)`, keeping first-seen key order. */
export function grouping<T, K extends string | number>(items: readonly T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Swift `xs.reduce(0, +)`. */
export function sum(items: readonly number[]): number {
  let total = 0;
  for (const x of items) total += x;
  return total;
}

/** Swift `Int(x)` truncates toward zero; `Int("12")` parses or fails. */
export function int(x: number): number {
  return Math.trunc(x);
}
export function parseIntStrict(s: string): number | undefined {
  return /^[+-]?\d+$/.test(s.trim()) ? Number.parseInt(s.trim(), 10) : undefined;
}
/** Swift `Double("1.5")` / `Decimal(string:)`: a plain decimal number or nothing. */
export function parseNumberStrict(s: string): number | undefined {
  const t = s.trim();
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) ? Number(t) : undefined;
}
