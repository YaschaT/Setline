import { JSONValue, type JSONObject } from "./JSONValue";

/**
 * The web app's saved state, held exactly as it arrived.
 *
 * `raw` is the whole object. Typed accessors read through it; writes patch
 * named keys and leave everything else untouched. That is what makes the
 * round-trip lossless rather than merely "complete enough".
 */
export interface LegacyState {
  readonly raw: JSONObject;
}

export class LegacyStateError extends Error {
  constructor(readonly kind: "notAnObject") {
    super(kind);
  }
}

/** JSON with sorted keys at every level, as `JSONEncoder` with `.sortedKeys` writes. */
function sortedJSON(value: JSONValue): string {
  if (Array.isArray(value)) return `[${value.map(sortedJSON).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${sortedJSON(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const LegacyState = {
  storageKey: "yascha-training-v1",

  make(a: { raw: JSONObject }): LegacyState {
    return { raw: a.raw };
  },

  /** `init(data:)`. */
  fromData(data: string): LegacyState {
    const decoded = JSON.parse(data) as JSONValue;
    const object = JSONValue.objectValue(decoded);
    if (!object) throw new LegacyStateError("notAnObject");
    return { raw: object };
  },

  /**
   * Accepts either the bare state object or a portable export
   * (`PRIVATE-DATA/yascha-training-backup.json`), which wraps it under
   * `state` alongside `photos` and export metadata.
   */
  fromExportOrState(a: { data: string }): LegacyState {
    const decoded = JSON.parse(a.data) as JSONValue;
    const object = JSONValue.objectValue(decoded);
    if (!object) throw new LegacyStateError("notAnObject");
    const nested = JSONValue.objectValue(object["state"]);
    if (nested) return { raw: nested };
    return { raw: object };
  },

  encoded(self: LegacyState): string {
    return sortedJSON(self.raw);
  },

  /** `mutating func set(_:to:)` — returns the new state (value semantics). */
  set(self: LegacyState, key: string, a: { to: JSONValue }): LegacyState {
    return { raw: { ...self.raw, [key]: a.to } };
  },

  /** `state[key]`. */
  get(self: LegacyState, key: string): JSONValue | undefined {
    return self.raw[key];
  },
};
