// Foundation `JSONEncoder` / `JSONDecoder` behaviour for the types the core
// stores as Codable (the iOS-only keys of the state blob, the sync queue).
//
// Encoding is structural: a plain value is written the way Swift's
// synthesized `Encodable` writes the matching struct — `nil` keys left out,
// `Set` as an array, `ClosedRange` as `[lowerBound, upperBound]`, dates per
// the strategy. Decoding needs the type, so each Codable type's companion has
// a `decode(json)` built from the helpers here; they fail exactly where
// `JSONDecoder` throws (missing key, null, wrong type, bad raw value).

import type { JSONValue, JSONObject } from "../Legacy/JSONValue";
import { closedRange, type ClosedRange } from "./range";

export class DecodingError extends Error {
  constructor(
    readonly kind: "keyNotFound" | "valueNotFound" | "typeMismatch" | "dataCorrupted",
    message: string,
  ) {
    super(`${kind}: ${message}`);
  }
}

export class EncodingError extends Error {
  constructor(message: string) {
    super(`invalidValue: ${message}`);
  }
}

/** `JSONEncoder.DateEncodingStrategy`: `.iso8601`, or the default `.deferredToDate`. */
export type DateStrategy = "iso8601" | "deferredToDate";

/** Seconds between 1970 and Foundation's reference date, 1 Jan 2001. */
const REFERENCE_DATE_EPOCH = 978_307_200;

/**
 * `ISO8601DateFormatter` with its default `.withInternetDateTime`, which
 * `.iso8601` uses: UTC, whole seconds, `Z` — `2026-10-19T17:00:00Z`.
 */
export function iso8601Seconds(date: Date): string {
  const whole = new Date(Math.floor(date.getTime() / 1000) * 1000);
  return whole.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * The `.iso8601` decoding strategy: internet date-time without fractional
 * seconds. A string carrying fractions does not decode, as in Foundation.
 */
export function parseISO8601Seconds(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match) return undefined;
  const t = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7] === "Z" ? "Z" : match[7].length === 5 ? `${match[7].slice(0, 3)}:${match[7].slice(3)}` : match[7]}`);
  return Number.isNaN(t) ? undefined : new Date(t);
}

function isClosedRange(value: object): value is ClosedRange {
  const keys = Object.keys(value).filter((k) => (value as Record<string, unknown>)[k] !== undefined);
  return (
    keys.length === 2 &&
    keys.includes("lowerBound") &&
    keys.includes("upperBound") &&
    typeof (value as ClosedRange).lowerBound === "number" &&
    typeof (value as ClosedRange).upperBound === "number"
  );
}

/** `JSONEncoder().encode(value)` read back as JSON, for plain ported values. */
export function encodeJSON(value: unknown, dates: DateStrategy = "iso8601"): JSONValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new EncodingError(`Unable to encode ${value} directly in JSON.`);
    return value;
  }
  if (value instanceof Date) {
    return dates === "iso8601" ? iso8601Seconds(value) : value.getTime() / 1000 - REFERENCE_DATE_EPOCH;
  }
  if (value instanceof Set) return [...value].map((v) => encodeJSON(v, dates));
  if (Array.isArray(value)) return value.map((v) => encodeJSON(v, dates));
  if (value instanceof Map) {
    const out: JSONObject = {};
    for (const [k, v] of value) if (v !== undefined) out[String(k)] = encodeJSON(v, dates);
    return out;
  }
  if (typeof value === "object") {
    if (isClosedRange(value)) return [value.lowerBound, value.upperBound];
    const out: JSONObject = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || typeof v === "function") continue;
      out[k] = encodeJSON(v, dates);
    }
    return out;
  }
  throw new EncodingError(`Unable to encode ${typeof value}.`);
}

// MARK: - Decoding

export type Decode<T> = (json: JSONValue) => T;

function describe(json: JSONValue): string {
  if (json === null) return "null";
  if (Array.isArray(json)) return "an array";
  return typeof json === "object" ? "a dictionary" : `a ${typeof json}`;
}

export function decodeString(json: JSONValue): string {
  if (typeof json !== "string") throw new DecodingError("typeMismatch", `Expected to decode String but found ${describe(json)} instead.`);
  return json;
}

export function decodeInt(json: JSONValue): number {
  if (typeof json !== "number") throw new DecodingError("typeMismatch", `Expected to decode Int but found ${describe(json)} instead.`);
  if (!Number.isInteger(json)) throw new DecodingError("dataCorrupted", `Parsed JSON number <${json}> does not fit in Int.`);
  return json;
}

/** `Double` and `Decimal`. */
export function decodeNumber(json: JSONValue): number {
  if (typeof json !== "number") throw new DecodingError("typeMismatch", `Expected to decode Double but found ${describe(json)} instead.`);
  return json;
}

export function decodeBool(json: JSONValue): boolean {
  if (typeof json !== "boolean") throw new DecodingError("typeMismatch", `Expected to decode Bool but found ${describe(json)} instead.`);
  return json;
}

/** `UUID`: decoded from its string form, and held as Swift prints it, upper-case. */
export function decodeUUID(json: JSONValue): string {
  const string = decodeString(json);
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(string)) {
    throw new DecodingError("dataCorrupted", `Attempted to decode UUID from invalid UUID string.`);
  }
  return string.toUpperCase();
}

/** A `Date` under `.iso8601`. */
export function decodeDate(json: JSONValue): Date {
  const string = decodeString(json);
  const date = parseISO8601Seconds(string);
  if (!date) throw new DecodingError("dataCorrupted", "Expected date string to be ISO8601-formatted.");
  return date;
}

/** A `String`-backed enum: the raw value must be one of the cases. */
export function decodeRaw<T extends string>(cases: readonly T[]): Decode<T> {
  return (json) => {
    const raw = decodeString(json);
    if (!(cases as readonly string[]).includes(raw)) {
      throw new DecodingError("dataCorrupted", `Cannot initialize from invalid String value ${raw}`);
    }
    return raw as T;
  };
}

export function decodeArray<T>(element: Decode<T>): Decode<T[]> {
  return (json) => {
    if (!Array.isArray(json)) throw new DecodingError("typeMismatch", `Expected to decode Array but found ${describe(json)} instead.`);
    return json.map((item) => element(item));
  };
}

export function decodeSet<T>(element: Decode<T>): Decode<Set<T>> {
  const array = decodeArray(element);
  return (json) => new Set(array(json));
}

/** `[String: T]`. */
export function decodeDictionary<T>(element: Decode<T>): Decode<Record<string, T>> {
  return (json) => {
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      throw new DecodingError("typeMismatch", `Expected to decode Dictionary but found ${describe(json)} instead.`);
    }
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(json)) out[k] = element(v);
    return out;
  };
}

/** `ClosedRange<Int>`: an unkeyed `[lower, upper]` with `lower <= upper`. */
export function decodeClosedRange(json: JSONValue): ClosedRange {
  if (!Array.isArray(json)) throw new DecodingError("typeMismatch", `Expected to decode Array but found ${describe(json)} instead.`);
  if (json.length < 2) throw new DecodingError("valueNotFound", "Unkeyed container is at end.");
  const lower = decodeInt(json[0]);
  const upper = decodeInt(json[1]);
  if (!(lower <= upper)) {
    throw new DecodingError("dataCorrupted", "Cannot initialize ClosedRange with a lowerBound greater than upperBound");
  }
  return closedRange(lower, upper);
}

/** `decoder.container(keyedBy:)`. */
export class KeyedContainer {
  private readonly object: JSONObject;

  constructor(json: JSONValue) {
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      throw new DecodingError("typeMismatch", `Expected to decode Dictionary but found ${describe(json)} instead.`);
    }
    this.object = json;
  }

  /** `container.decode(_:forKey:)`: the key must be there and not null. */
  decode<T>(key: string, decode: Decode<T>): T {
    if (!Object.prototype.hasOwnProperty.call(this.object, key)) {
      throw new DecodingError("keyNotFound", `No value associated with key "${key}".`);
    }
    const value = this.object[key];
    if (value === null) throw new DecodingError("valueNotFound", `Expected value for key "${key}" but found null instead.`);
    return decode(value);
  }

  /** `container.decodeIfPresent(_:forKey:)`: absent or null is nil; anything else must decode. */
  decodeIfPresent<T>(key: string, decode: Decode<T>): T | undefined {
    const value = Object.prototype.hasOwnProperty.call(this.object, key) ? this.object[key] : undefined;
    if (value === undefined || value === null) return undefined;
    return decode(value);
  }
}
