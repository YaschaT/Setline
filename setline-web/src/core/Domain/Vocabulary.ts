import type { JSONValue } from "../Legacy/JSONValue";
import { KeyedContainer, decodeBool, decodeNumber, encodeJSON } from "../Support/codable";

/**
 * The role a planned exercise plays in its session.
 *
 * Role is load-bearing, not descriptive: addendum 13R derives the rest
 * prescription from it, and TRAINING_LOGIC §3.2 selects the progression rule
 * from it. Every planned exercise must carry one.
 */
export type ExerciseRole = "primaryStrength" | "secondaryCompound" | "accessory" | "isolation";
export const ExerciseRole = {
  primaryStrength: "primaryStrength" as ExerciseRole,
  secondaryCompound: "secondaryCompound" as ExerciseRole,
  accessory: "accessory" as ExerciseRole,
  isolation: "isolation" as ExerciseRole,
  allCases: ["primaryStrength", "secondaryCompound", "accessory", "isolation"] as ExerciseRole[],
};

/**
 * Smallest real-world load step, per TRAINING_LOGIC §3.3.
 *
 * Defaults only. The increment table is per user, per gym and editable —
 * "a wrong increment silently sabotages every progression decision".
 */
export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machinePlate"
  | "machineSelectorised"
  | "cable"
  | "smith"
  | "bodyweight"
  | "band";
export const Equipment = {
  barbell: "barbell" as Equipment,
  dumbbell: "dumbbell" as Equipment,
  machinePlate: "machinePlate" as Equipment,
  machineSelectorised: "machineSelectorised" as Equipment,
  cable: "cable" as Equipment,
  smith: "smith" as Equipment,
  bodyweight: "bodyweight" as Equipment,
  band: "band" as Equipment,
  allCases: [
    "barbell",
    "dumbbell",
    "machinePlate",
    "machineSelectorised",
    "cable",
    "smith",
    "bodyweight",
    "band",
  ] as Equipment[],

  /** Default increment in kilograms, before any per-gym override. */
  defaultIncrementKg(self: Equipment): number {
    switch (self) {
      case "barbell":
      case "smith":
        return 2.5;
      case "dumbbell":
        return 2;
      case "machinePlate":
        return 5;
      case "machineSelectorised":
      case "cable":
        return 5;
      case "bodyweight":
        return 1.25;
      case "band":
        return 0;
    }
  },
};

/**
 * Modifiers that change what a set *is*, and therefore what it may be
 * compared against. TRAINING_LOGIC §1: two sets are comparable only when
 * exerciseId, modifiers and unilateral all match.
 */
export interface SetModifiers {
  pauseEnabled: boolean;
  pauseSeconds?: number;
  restrictedROM: boolean;
}

const noModifiers: SetModifiers = { pauseEnabled: false, pauseSeconds: undefined, restrictedROM: false };

export const SetModifiers = {
  make(p: { pauseEnabled?: boolean; pauseSeconds?: number; restrictedROM?: boolean } = {}): SetModifiers {
    return {
      pauseEnabled: p.pauseEnabled ?? false,
      pauseSeconds: p.pauseSeconds,
      restrictedROM: p.restrictedROM ?? false,
    };
  },

  none: noModifiers,

  /**
   * §9.2: a paused set is only ever compared to other paused sets of the
   * same exercise with the same pause length, ±0.5 s.
   */
  isComparable(self: SetModifiers, a: { to: SetModifiers }): boolean {
    const other = a.to;
    if (!(self.pauseEnabled === other.pauseEnabled && self.restrictedROM === other.restrictedROM)) return false;
    if (!self.pauseEnabled) return true;
    const x = self.pauseSeconds ?? 0;
    const y = other.pauseSeconds ?? 0;
    return Math.abs(x - y) <= 0.5;
  },

  encode(self: SetModifiers): JSONValue {
    return encodeJSON(self);
  },

  decode(json: JSONValue): SetModifiers {
    const c = new KeyedContainer(json);
    return {
      pauseEnabled: c.decode("pauseEnabled", decodeBool),
      pauseSeconds: c.decodeIfPresent("pauseSeconds", decodeNumber),
      restrictedROM: c.decode("restrictedROM", decodeBool),
    };
  },
};

/**
 * Flags a logged set can carry. Deliberately not an error state: a failed
 * set is a fact about the set, not a failure of the user.
 *
 * An `OptionSet` over `Int`: the raw value is what is stored, so it is a
 * bit mask here too. `[]` is `0`, `[.failed]` is `SetFlags.failed`.
 */
export type SetFlags = number;
export const SetFlags = {
  failed: (1 << 0) as SetFlags,
  partialReps: (1 << 1) as SetFlags,
  technicalBreakdown: (1 << 2) as SetFlags,

  /** `flags.contains(member)`. */
  contains(self: SetFlags, member: SetFlags): boolean {
    return (self & member) === member;
  },
  /** `flags.insert(member)` — returns the new value. */
  insert(self: SetFlags, member: SetFlags): SetFlags {
    return self | member;
  },
  /** `flags.remove(member)` — returns the new value. */
  remove(self: SetFlags, member: SetFlags): SetFlags {
    return self & ~member;
  },
};

/**
 * The five kinds of set the design distinguishes (addendum 16R).
 *
 * Warm-up, PR, failed, paused and partial are five different things; the
 * last two share amber but are never the same row state.
 */
export type SetKind = "warmup" | "working";
export const SetKind = {
  warmup: "warmup" as SetKind,
  working: "working" as SetKind,
};

/**
 * Where a working set came from.
 *
 * The program prescribes how many sets an exercise gets; the logger never
 * caps a session at that number. A set added during the session is an
 * ordinary working set for volume, history and records, but it is not one
 * of the prescribed slots: it can never complete a prescription that was
 * otherwise incomplete, and adding it never changes the program.
 */
export type SetOrigin = "prescribed" | "sessionAdded";
export const SetOrigin = {
  prescribed: "prescribed" as SetOrigin,
  sessionAdded: "sessionAdded" as SetOrigin,
  allCases: ["prescribed", "sessionAdded"] as SetOrigin[],
};
