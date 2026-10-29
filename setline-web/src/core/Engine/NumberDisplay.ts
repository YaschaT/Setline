import { formatEnUS } from "../Support/calendar";
import { dec } from "../Support/swift";

/**
 * Dutch (BE) number rendering, in one place.
 *
 * Every number the design shows uses a comma decimal and a dot thousands
 * separator: "102,5 kg", "6.480 kg", "+2,5". Numerals are always tabular in
 * the view layer; this type only decides the characters.
 *
 * `locale` is the Foundation identifier ("en_US"); the app only ever uses
 * `NumberDisplay.english`.
 */
export interface NumberDisplay {
  readonly locale: string;
}

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * `NumberFormatter` (.decimal, grouping on, 0…max fraction digits) on a
 * `Decimal`. Foundation's default rounding is half-even on the decimal value,
 * so the shortest decimal string of the number is formatted half-even.
 */
function decimal(self: NumberDisplay, value: number, maxFractionDigits = 2): string {
  const key = `${self.locale}|${maxFractionDigits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(self.locale.replace("_", "-"), {
      style: "decimal",
      maximumFractionDigits: maxFractionDigits,
      minimumFractionDigits: 0,
      useGrouping: true,
      roundingMode: "halfEven",
    } as Intl.NumberFormatOptions);
    formatters.set(key, formatter);
  }
  const clean = dec(value);
  // A string is formatted as the exact decimal it spells (Intl.NumberFormat v3).
  return formatter.format(String(clean) as unknown as number);
}

function dateFormatted(self: NumberDisplay, date: Date, pattern: string): string {
  // Only en_US is ever used; `formatEnUS` is its DateFormatter.
  void self;
  return formatEnUS(date, pattern);
}

export const NumberDisplay = {
  make(a: { locale: string }): NumberDisplay {
    return { locale: a.locale };
  },

  english: { locale: "en_US" } as NumberDisplay,

  /** "102,5 kg" */
  kg(self: NumberDisplay, value: number): string {
    return `${decimal(self, value)} kg`;
  },

  /** "102,5" */
  number(self: NumberDisplay, value: number): string {
    return decimal(self, value);
  },

  /** "1.840" — a whole number, grouped. */
  whole(self: NumberDisplay, value: number): string {
    return decimal(self, value, 0);
  },

  /** "1.840 kcal" — energy is always whole. */
  kcal(self: NumberDisplay, value: number): string {
    return `${decimal(self, value, 0)} kcal`;
  },

  /** "142 g" — macros, to the tenth at most. */
  grams(self: NumberDisplay, value: number): string {
    return `${decimal(self, value, 1)} g`;
  },

  /** "6.480 kg" — volume, always whole kilos. */
  volumeKg(self: NumberDisplay, value: number): string {
    return `${decimal(self, value, 0)} kg`;
  },

  /** "+2,5" / "−1" / "=" — the delta column. Uses a real minus sign. */
  signedDelta(self: NumberDisplay, value: number): string {
    if (value === 0) return "=";
    const magnitude = decimal(self, Math.abs(value));
    return value > 0 ? `+${magnitude}` : `−${magnitude}`;
  },

  /** "+2 reps" / "−1 rep" */
  signedReps(self: NumberDisplay, value: number): string {
    void self;
    const noun = Math.abs(value) === 1 ? "rep" : "reps";
    return value > 0 ? `+${value} ${noun}` : `−${Math.abs(value)} ${noun}`;
  },

  /** "47,5 × 8" — a previous set, as shown in the delta column. */
  setReference(self: NumberDisplay, a: { weightKg: number; reps: number }): string {
    return `${decimal(self, a.weightKg)} × ${a.reps}`;
  },

  /** "7 sep" — the short date the delta column header and history rows use. */
  shortDate(self: NumberDisplay, date: Date): string {
    return dateFormatted(self, date, "d MMM").replaceAll(".", "");
  },

  /** "7:40" — the hour something was logged at (42d), as the clock had it. */
  clock(self: NumberDisplay, date: Date): string {
    return dateFormatted(self, date, "H:mm");
  },

  /** "53 min" */
  minutes(self: NumberDisplay, seconds: number): string {
    void self;
    return `${Math.trunc(seconds / 60)} min`;
  },
};

/**
 * What a reader is allowed to type into a number field.
 *
 * `.decimalPad` governs the on-screen keyboard only; a hardware keyboard can
 * send anything at all, so the field itself has to hold the line.
 */
export const NumberInput = {
  /** Digits plus at most one decimal separator, always written as a comma. */
  numericOnly(text: string): string {
    let seenSeparator = false;
    let out = "";
    for (const character of text) {
      // Swift `Character.isNumber`: any Unicode number.
      if (/^\p{N}$/u.test(character)) {
        out += character;
        continue;
      }
      if (character === "," || character === ".") {
        if (seenSeparator) continue;
        seenSeparator = true;
        out += ",";
      }
    }
    return out;
  },

  /** What that text is worth, once it has been filtered. */
  value(text: string): number {
    const normalised = NumberInput.numericOnly(text).replaceAll(",", ".");
    // Swift `Double(_:)`: the whole string must be a number.
    return /^(\d+\.?\d*|\.\d+)$/.test(normalised) ? Number(normalised) : 0;
  },

  /**
   * The same, exactly: a weight typed by hand is a tenth of a kilo, not a
   * binary approximation of one. Empty text is no number at all.
   */
  decimal(text: string): number | undefined {
    const normalised = NumberInput.numericOnly(text).replaceAll(",", ".");
    if (normalised === "" || normalised === ".") return undefined;
    // `Decimal(string:locale:)` scans a leading number and ignores the rest.
    const match = /^(\d+(\.\d*)?|\.\d+)/.exec(normalised);
    return match ? Number(match[0]) : undefined;
  },
};
