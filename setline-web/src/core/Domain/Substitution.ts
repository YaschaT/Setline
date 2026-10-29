import type { SwapReason } from "../Engine/SubstitutionRanking";
import type { JSONValue } from "../Legacy/JSONValue";
import { KeyedContainer, decodeBool, decodeDate, decodeRaw, decodeString, encodeJSON } from "../Support/codable";
import { Exercise } from "./Model";
import { Equipment } from "./Vocabulary";

/**
 * One exercise standing in for another, for one session only.
 *
 * TRAINING_LOGIC §12.5: the sets belong to the substitute's series for
 * progression, trend and records — never the origin's. The origin's
 * progression state freezes for that occurrence: not advanced, not reset,
 * and no penalty for the session it sat out.
 */
export interface Substitution {
  originExerciseID: string;
  substituteExerciseID: string;
  reason: SwapReason;
  date: Date;
}

export const Substitution = {
  make(p: { originExerciseID: string; substituteExerciseID: string; reason: SwapReason; date?: Date }): Substitution {
    return {
      originExerciseID: p.originExerciseID,
      substituteExerciseID: p.substituteExerciseID,
      reason: p.reason,
      date: p.date ?? new Date(),
    };
  },
};

/**
 * How far a permanent replacement reaches (artboard 15Rb).
 *
 * `always` rewrites every future occurrence across every plan, which is why
 * it is the one scope that needs the clearest confirmation in the app.
 */
export type ReplacementScope = "thisDay" | "thisPlan" | "always";
export const ReplacementScope = {
  thisDay: "thisDay" as ReplacementScope,
  thisPlan: "thisPlan" as ReplacementScope,
  always: "always" as ReplacementScope,
  allCases: ["thisDay", "thisPlan", "always"] as ReplacementScope[],

  label(self: ReplacementScope): string {
    switch (self) {
      case "thisDay":
        return "This day only";
      case "thisPlan":
        return "This plan";
      case "always":
        return "Every time";
    }
  },

  detail(self: ReplacementScope): string {
    switch (self) {
      case "thisDay":
        return "Only on this training day.";
      case "thisPlan":
        return "Everywhere in this plan.";
      case "always":
        return "Also in plans you switch to later.";
    }
  },
};

/**
 * A replacement written into the program, as opposed to a swap for today.
 *
 * This is also the audit record: what was replaced, by what, how far the
 * change reached and when. Nothing about a permanent replacement is carried
 * on the logged sets — `substitutedFrom` means "standing in for something
 * else today", which a program change is not.
 */
export interface ProgramReplacement {
  originExerciseID: string;
  substituteExerciseID: string;
  scope: ReplacementScope;
  /** The day the replacement was made on, which `thisDay` is scoped to. */
  dayID: string;
  date: Date;
}

export const ProgramReplacement = {
  make(p: {
    originExerciseID: string;
    substituteExerciseID: string;
    scope: ReplacementScope;
    dayID: string;
    date?: Date;
  }): ProgramReplacement {
    return {
      originExerciseID: p.originExerciseID,
      substituteExerciseID: p.substituteExerciseID,
      scope: p.scope,
      dayID: p.dayID,
      date: p.date ?? new Date(),
    };
  },

  /**
   * Identity is the change itself, not the instant it was made.
   *
   * Dates lose sub-second precision on the way through the state blob, so
   * a decoded record never compares equal to the one held in memory —
   * which silently turned "undo" into a no-op that left the program
   * changed while the screen said otherwise.
   */
  id(self: ProgramReplacement): string {
    return [self.originExerciseID, self.substituteExerciseID, self.scope, self.dayID].join("|");
  },

  applies(self: ProgramReplacement, a: { toDay: string }): boolean {
    switch (self.scope) {
      case "thisDay":
        return a.toDay === self.dayID;
      case "thisPlan":
      case "always":
        return true;
    }
  },

  encode(self: ProgramReplacement): JSONValue {
    return encodeJSON(self);
  },

  decode(json: JSONValue): ProgramReplacement {
    const c = new KeyedContainer(json);
    return {
      originExerciseID: c.decode("originExerciseID", decodeString),
      substituteExerciseID: c.decode("substituteExerciseID", decodeString),
      scope: c.decode("scope", decodeRaw(ReplacementScope.allCases)),
      dayID: c.decode("dayID", decodeString),
      date: c.decode("date", decodeDate),
    };
  },
};

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Swift `Character.isLetter || Character.isNumber`: read off the character's first scalar. */
function isLetterOrNumber(character: string): boolean {
  return /^[\p{Alphabetic}\p{N}]/u.test(character);
}

/**
 * An exercise the user typed in themselves.
 *
 * Deliberately thin: a name, and optionally what it is loaded with. No
 * ranking metadata — a custom exercise is never a recommendation source, it
 * is somewhere to put honest work the catalogue has no name for. It goes
 * straight to calibration, because by definition it has no history.
 */
export interface CustomExercise {
  id: string;
  name: string;
  equipment: Equipment;
  isCompound: boolean;
  createdAt: Date;
}

export const CustomExercise = {
  make(p: { id?: string; name: string; equipment?: Equipment; isCompound?: boolean; createdAt?: Date }): CustomExercise {
    return {
      id: p.id ?? CustomExercise.identifier({ for: p.name }),
      name: p.name,
      equipment: p.equipment ?? "machineSelectorised",
      isCompound: p.isCompound ?? false,
      createdAt: p.createdAt ?? new Date(),
    };
  },

  /**
   * Namespaced so a custom exercise can never collide with a catalogue id
   * and quietly inherit its history.
   */
  identifier(a: { for: string }): string {
    let slug = "";
    for (const { segment } of graphemes.segment(a.for.toLowerCase())) {
      const character = isLetterOrNumber(segment) ? segment : "-";
      if (character === "-" && slug.endsWith("-")) continue;
      slug += character;
    }
    slug = slug.replace(/^-+|-+$/g, "");
    return `custom:${slug === "" ? "oefening" : slug}`;
  },

  exercise(self: CustomExercise): Exercise {
    return Exercise.make({ id: self.id, name: self.name, equipment: self.equipment, isCompound: self.isCompound });
  },

  isCustom(id: string): boolean {
    return id.startsWith("custom:");
  },

  encode(self: CustomExercise): JSONValue {
    return encodeJSON(self);
  },

  decode(json: JSONValue): CustomExercise {
    const c = new KeyedContainer(json);
    return {
      id: c.decode("id", decodeString),
      name: c.decode("name", decodeString),
      equipment: c.decode("equipment", decodeRaw(Equipment.allCases)),
      isCompound: c.decode("isCompound", decodeBool),
      createdAt: c.decode("createdAt", decodeDate),
    };
  },
};
