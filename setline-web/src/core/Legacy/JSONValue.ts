// A lossless in-memory JSON tree.
//
// The web app stores the whole of Setline as one JSON blob, in localStorage
// under `yascha-training-v1` and in Supabase `public.user_state.state`.
// iOS models it as an enum; here it is plain JSON, which is lossless by
// nature. The accessors keep the Swift ones' exact behaviour.

export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export type JSONObject = { [key: string]: JSONValue };

/** Foundation `Decimal(string:)`: scans a leading decimal number, ignores what follows, nil when there is none. */
function decimalFromString(value: string): number | undefined {
  const match = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(value);
  return match ? Number(match[0]) : undefined;
}

export const JSONValue = {
  objectValue(self: JSONValue | undefined): JSONObject | undefined {
    return self !== null && typeof self === "object" && !Array.isArray(self) ? self : undefined;
  },
  arrayValue(self: JSONValue | undefined): JSONValue[] | undefined {
    return Array.isArray(self) ? self : undefined;
  },
  stringValue(self: JSONValue | undefined): string | undefined {
    return typeof self === "string" ? self : undefined;
  },
  /** The web app writes weights and reps as strings ("47.5", "8"); a number is only ever what the JSON already held. */
  decimalValue(self: JSONValue | undefined): number | undefined {
    if (typeof self === "number") return self;
    if (typeof self === "string") return decimalFromString(self.replaceAll(",", "."));
    return undefined;
  },
  /** `NSDecimalNumber.intValue` truncates toward zero. */
  intValue(self: JSONValue | undefined): number | undefined {
    const decimal = JSONValue.decimalValue(self);
    return decimal === undefined ? undefined : Math.trunc(decimal);
  },
  doubleValue(self: JSONValue | undefined): number | undefined {
    return JSONValue.decimalValue(self);
  },
  boolValue(self: JSONValue | undefined): boolean | undefined {
    if (typeof self === "boolean") return self;
    if (typeof self === "number") return self !== 0;
    if (typeof self === "string") return self === "true";
    return undefined;
  },
  /** `value[key]` — the member of an object, nil otherwise. */
  get(self: JSONValue | undefined, key: string): JSONValue | undefined {
    return JSONValue.objectValue(self)?.[key];
  },
};
