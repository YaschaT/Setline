// Foundation text, number, URL and JSON behaviour the Nutrition, Photos and
// Social ports depend on, matched to what the iOS app does (checked against
// Foundation on macOS 26 / iOS 26).

// MARK: - Characters (Swift `Character` is a grapheme cluster)

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** `Array(string)`: the string's Characters. */
export function graphemes(s: string): string[] {
  const out: string[] = [];
  for (const { segment } of segmenter.segment(s)) out.push(segment);
  return out;
}

/** `string.count`. */
export function charCount(s: string): number {
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

/** `String(string.prefix(n))`. */
export function prefixChars(s: string, n: number): string {
  if (n <= 0) return "";
  let out = "";
  let i = 0;
  for (const { segment } of segmenter.segment(s)) {
    if (i++ >= n) break;
    out += segment;
  }
  return out;
}

/** `String(string.dropFirst(n))`. */
export function dropFirstChars(s: string, n = 1): string {
  return graphemes(s).slice(n).join("");
}

function firstScalar(ch: string): string {
  const cp = ch.codePointAt(0);
  return cp === undefined ? "\0" : String.fromCodePoint(cp);
}

/** `Character.isLetter`: the first scalar is Alphabetic. */
export function isLetterChar(ch: string): boolean {
  return /\p{Alphabetic}/u.test(firstScalar(ch));
}

/**
 * `Character.isNumber`: the first scalar has a numeric type. (Unicode's
 * numeric Han ideographs such as 一 also count on iOS; JavaScript's `\p{N}`
 * does not see them.)
 */
export function isNumberChar(ch: string): boolean {
  return /\p{N}/u.test(firstScalar(ch));
}

/** `Character.isWhitespace`. */
export function isWhitespaceChar(ch: string): boolean {
  return /\p{White_Space}/u.test(firstScalar(ch));
}

/** `string.filter { … }.count` over Characters. */
export function countChars(s: string, predicate: (ch: string) => boolean): number {
  let n = 0;
  for (const { segment } of segmenter.segment(s)) if (predicate(segment)) n++;
  return n;
}

/** `string.split(whereSeparator:)` over Characters, empty pieces omitted. */
export function splitChars(s: string, isSeparator: (ch: string) => boolean): string[] {
  const out: string[] = [];
  let current = "";
  for (const { segment } of segmenter.segment(s)) {
    if (isSeparator(segment)) {
      if (current !== "") out.push(current);
      current = "";
    } else {
      current += segment;
    }
  }
  if (current !== "") out.push(current);
  return out;
}

/** `string.split(separator: "x")` on one Character: empty pieces omitted. */
export function splitOn(s: string, separator: string): string[] {
  return s.split(separator).filter((piece) => piece !== "");
}

// MARK: - Character sets

/** `trimmingCharacters(in: .whitespaces)`: tab and Unicode Zs. */
export function trimmingWhitespaces(s: string): string {
  return s.replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, "");
}

/** `trimmingCharacters(in: .whitespacesAndNewlines)`: tab, Z*, U+000A–U+000D, U+0085. */
export function trimmingWhitespacesAndNewlines(s: string): string {
  return s.replace(/^[\t\n\v\f\r\u0085\p{Z}]+|[\t\n\v\f\r\u0085\p{Z}]+$/gu, "");
}

/** `components(separatedBy: .newlines)`: every newline character splits, empty pieces kept. */
export function componentsSeparatedByNewlines(s: string): string[] {
  return s.split(/[\n\v\f\r\u0085\u2028\u2029]/u);
}

/** `folding(options: .diacriticInsensitive, locale: nil)`: é → e, ø and ß stay. */
export function foldingDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Mn}/gu, "").normalize("NFC");
}

// MARK: - ICU regular expressions

// ICU's `\w` (what its `\b` is built on) is Unicode-wide; JavaScript's `\b`
// and `\d` are ASCII-only even with the `u` flag. Patterns written for
// NSRegularExpression are translated so they match what they match there.
const WORD = String.raw`[\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\u200C\u200D]`;
const BOUNDARY = `(?:(?<=${WORD})(?!${WORD})|(?<!${WORD})(?=${WORD}))`;

/** An NSRegularExpression / `.regularExpression` pattern as a JavaScript RegExp. */
export function icuRegex(pattern: string, flags = ""): RegExp {
  let out = "";
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) {
      const next = pattern[i + 1];
      i++;
      if (next === "b" && !inClass) out += BOUNDARY;
      else if (next === "d") out += String.raw`\p{Nd}`;
      else if (next === "D") out += String.raw`\P{Nd}`;
      else if (next === "w") out += inClass ? String.raw`\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\u200C\u200D` : WORD;
      else if (/[A-Za-z0-9]/.test(next)) out += "\\" + next;
      else if (/[\^$\\.*+?()[\]{}|/]/.test(next) || (inClass && next === "-")) out += "\\" + next;
      else out += next; // ICU allows escaping any punctuation; the `u` flag does not.
      continue;
    }
    if (ch === "[" && !inClass) inClass = true;
    else if (ch === "]" && inClass) inClass = false;
    out += ch;
  }
  return new RegExp(out, flags.includes("u") ? flags : flags + "u");
}

/** `replacingOccurrences(of:with:options: .regularExpression)` — `$1` templates as ICU writes them. */
export function replacingRegex(s: string, pattern: string, template: string, flags = ""): string {
  return s.replace(icuRegex(pattern, flags.includes("g") ? flags : flags + "g"), template);
}

// MARK: - Numbers

/** Swift `Double(String)`: the whole string, no whitespace; decimal, hex, inf or nan. */
export function swiftDouble(s: string): number | undefined {
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
  if (/^[+-]?(inf|infinity)$/i.test(s)) return s.startsWith("-") ? -Infinity : Infinity;
  if (/^[+-]?nan$/i.test(s)) return NaN;
  const hex = /^([+-]?)0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?(?:[pP]([+-]?\d+))?$/.exec(s);
  if (hex && (hex[2] !== "" || (hex[3] ?? "") !== "")) {
    const whole = hex[2] === "" ? 0 : Number.parseInt(hex[2], 16);
    let fraction = 0;
    const digits = hex[3] ?? "";
    for (let i = 0; i < digits.length; i++) fraction += Number.parseInt(digits[i], 16) / 16 ** (i + 1);
    const value = (whole + fraction) * 2 ** Number(hex[4] ?? 0);
    return hex[1] === "-" ? -value : value;
  }
  return undefined;
}

/**
 * `String(format: "%.Nf", x)`: printf rounds the exact binary value, and an
 * exact tie goes to the even digit (0.25 → "0.2"), unlike `toFixed`.
 */
export function formatF(x: number, places: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x > 0 ? "inf" : "-inf";
  const negative = x < 0 || Object.is(x, -0);
  const exact = Math.abs(x).toFixed(100); // exact for every value an amount takes
  const [whole, fraction] = exact.split(".");
  const kept = whole + fraction.slice(0, places);
  const rest = fraction.slice(places);
  let digits = kept;
  const roundUp =
    rest[0] > "5" ||
    (rest[0] === "5" && (/[1-9]/.test(rest.slice(1)) || Number(kept[kept.length - 1]) % 2 === 1));
  if (roundUp) {
    const arr = digits.split("").map(Number);
    let i = arr.length - 1;
    while (i >= 0) {
      if (arr[i] === 9) {
        arr[i] = 0;
        i--;
      } else {
        arr[i]++;
        break;
      }
    }
    digits = (i < 0 ? "1" : "") + arr.join("");
  }
  const intPart = digits.slice(0, digits.length - places) || "0";
  const fracPart = digits.slice(digits.length - places);
  const body = places > 0 ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${body}` : body; // printf keeps the sign: -0.04 → "-0.0"
}

/** `"\(x)"` for a Double: 150.0, 1.5, 1e-05, 1.5e+16. */
export function doubleDescription(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  const abs = Math.abs(x);
  if (abs !== 0 && (abs < 1e-4 || abs > 2 ** 53)) {
    const [mantissa, exponent] = x.toExponential().split("e");
    const sign = exponent.startsWith("-") ? "-" : "+";
    const digits = exponent.replace(/^[+-]/, "").padStart(2, "0");
    return `${mantissa}e${sign}${digits}`;
  }
  if (Number.isInteger(x)) return `${Object.is(x, -0) ? "-0" : String(x)}.0`;
  return String(x);
}

// MARK: - URLs (Swift `URL` is kept as its absolute string)

const HEX = "0123456789ABCDEF";
function percentEncode(ch: string): string {
  let out = "";
  for (const byte of new TextEncoder().encode(ch)) out += "%" + HEX[byte >> 4] + HEX[byte & 15];
  return out;
}

/** Characters URL(string:) leaves as they are in a path, query or fragment. */
const URL_SAFE = /[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]/;

function encodeInvalid(part: string): string {
  let out = "";
  const chars = [...part];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "%") {
      out += /^[0-9A-Fa-f]{2}$/.test((chars[i + 1] ?? "") + (chars[i + 2] ?? "")) ? "%" : "%25";
    } else {
      out += URL_SAFE.test(ch) ? ch : percentEncode(ch);
    }
  }
  return out;
}

interface URLParts {
  scheme?: string;
  authority?: string;
  path: string;
  query?: string;
  fragment?: string;
}

function urlParts(s: string): URLParts {
  const m = /^(?:([A-Za-z][A-Za-z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/.exec(s)!;
  return { scheme: m[1], authority: m[2], path: m[3] ?? "", query: m[4], fragment: m[5] };
}

function hostOf(authority: string): string | undefined {
  const at = authority.lastIndexOf("@");
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  if (hostPort.startsWith("[")) {
    const close = hostPort.indexOf("]");
    if (close < 0) return undefined;
    const port = hostPort.slice(close + 1);
    if (port !== "" && !/^:\d*$/.test(port)) return undefined;
    return hostPort.slice(0, close + 1);
  }
  const colon = hostPort.lastIndexOf(":");
  const host = colon >= 0 ? hostPort.slice(0, colon) : hostPort;
  if (colon >= 0 && !/^\d*$/.test(hostPort.slice(colon + 1))) return undefined;
  if (/[\s"<>\\^`{|}]/.test(host)) return undefined;
  return host;
}

/**
 * `URL(string:)`: nil for an empty string or an unusable host or port;
 * otherwise the string with invalid characters percent-encoded, as
 * Foundation writes it.
 */
export function urlFromString(s: string): string | undefined {
  if (s === "") return undefined;
  const parts = urlParts(s);
  let out = parts.scheme !== undefined ? `${parts.scheme}:` : "";
  if (parts.authority !== undefined) {
    const host = hostOf(parts.authority);
    if (host === undefined) return undefined;
    out += "//" + parts.authority.replace(/[^\x21-\x7E]/gu, (ch) => percentEncode(ch));
  }
  out += encodeInvalid(parts.path);
  if (parts.query !== undefined) out += "?" + encodeInvalid(parts.query);
  if (parts.fragment !== undefined) out += "#" + encodeInvalid(parts.fragment);
  return out;
}

/** `url.host()`: as written (case kept), percent-encoded; nil without an authority. */
export function urlHost(url: string): string | undefined {
  const parts = urlParts(url);
  if (parts.authority === undefined) return undefined;
  const host = hostOf(parts.authority);
  return host === undefined || host === "" ? undefined : host;
}

/** `url.pathComponents`: "/" first for an absolute path, empty pieces dropped, percent-decoded. */
export function urlPathComponents(url: string): string[] {
  const path = urlParts(url).path;
  if (path === "") return [];
  const pieces = path.split("/").filter((piece) => piece !== "").map((piece) => {
    try {
      return decodeURIComponent(piece);
    } catch {
      return piece;
    }
  });
  return path.startsWith("/") ? ["/", ...pieces] : pieces;
}

const QUERY_SAFE = /[A-Za-z0-9!$'()*+,\-./:;?@_~]/;

/** How `URLComponents.queryItems` writes a name or value. */
export function queryItemEncode(s: string): string {
  let out = "";
  for (const ch of s) out += QUERY_SAFE.test(ch) ? ch : percentEncode(ch);
  return out;
}

/** `URLComponents.queryItems = [...]` → the `query` it writes. */
export function queryString(items: { name: string; value?: string }[]): string {
  return items.map((item) => queryItemEncode(item.name) + (item.value === undefined ? "" : "=" + queryItemEncode(item.value))).join("&");
}

// MARK: - Data

/** `Data.base64EncodedString()`. */
export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** `Data(string.utf8)`. */
export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// MARK: - JSONSerialization casts (`as? Int`, `as? Double`, `as? String`)

/** `value as? [String: Any]`. */
export function asObject(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
/** `value as? [Any]`. */
export function asArray(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}
/** `value as? String`. */
export function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
/** `value as? Double` on an NSNumber: any number, and a boolean as 1 or 0. */
export function asDouble(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return undefined;
}
/** `value as? Int` on an NSNumber: only an exact integer, and a boolean as 1 or 0. */
export function asInt(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isInteger(v) ? v : undefined;
  if (typeof v === "boolean") return v ? 1 : 0;
  return undefined;
}
/** `JSONSerialization.jsonObject(with:)`, nil when it throws. */
export function jsonObject(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

// MARK: - JSONDecoder

export class DecodingError extends Error {
  constructor(readonly kind: "typeMismatch" | "keyNotFound" | "valueNotFound" | "dataCorrupted", readonly key?: string) {
    super(`${kind}${key ? ` (${key})` : ""}`);
  }
}

/** `decoder.container(keyedBy:)`. */
export function keyedContainer(value: unknown): Record<string, unknown> {
  const object = asObject(value);
  if (!object) throw new DecodingError("typeMismatch");
  return object;
}

/** `JSONDecoder().decode(…, from: data)`'s first step: the bytes as JSON. */
export function decodeJSON(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    throw new DecodingError("dataCorrupted");
  }
}

function present(c: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(c, key) && c[key] !== null;
}

/** `container.decode(String.self, forKey:)`. */
export function decodeString(c: Record<string, unknown>, key: string): string {
  if (!Object.prototype.hasOwnProperty.call(c, key)) throw new DecodingError("keyNotFound", key);
  const v = c[key];
  if (v === null) throw new DecodingError("valueNotFound", key);
  if (typeof v !== "string") throw new DecodingError("typeMismatch", key);
  return v;
}
/** `container.decode(Double.self, forKey:)`. */
export function decodeDouble(c: Record<string, unknown>, key: string): number {
  if (!Object.prototype.hasOwnProperty.call(c, key)) throw new DecodingError("keyNotFound", key);
  const v = c[key];
  if (v === null) throw new DecodingError("valueNotFound", key);
  if (typeof v !== "number") throw new DecodingError("typeMismatch", key);
  return v;
}
/** `container.decodeIfPresent(String.self, forKey:)`. */
export function decodeIfPresentString(c: Record<string, unknown>, key: string): string | undefined {
  return present(c, key) ? decodeString(c, key) : undefined;
}
/** `container.decodeIfPresent(Double.self, forKey:)`. */
export function decodeIfPresentDouble(c: Record<string, unknown>, key: string): number | undefined {
  return present(c, key) ? decodeDouble(c, key) : undefined;
}
/** `container.decodeIfPresent(Bool.self, forKey:)`. */
export function decodeIfPresentBool(c: Record<string, unknown>, key: string): boolean | undefined {
  if (!present(c, key)) return undefined;
  const v = c[key];
  if (typeof v !== "boolean") throw new DecodingError("typeMismatch", key);
  return v;
}
/** `container.decode([T].self, forKey:)`, one element decoder per item. */
export function decodeArray<T>(c: Record<string, unknown>, key: string, element: (value: unknown) => T): T[] {
  if (!Object.prototype.hasOwnProperty.call(c, key)) throw new DecodingError("keyNotFound", key);
  const v = c[key];
  if (v === null) throw new DecodingError("valueNotFound", key);
  if (!Array.isArray(v)) throw new DecodingError("typeMismatch", key);
  return v.map(element);
}
/** `try?` around a throwing expression. */
export function tryOptional<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** Foundation `string.contains(other)`: an empty string is never contained. */
export function swiftContains(haystack: string, needle: string): boolean {
  return needle !== "" && haystack.includes(needle);
}
