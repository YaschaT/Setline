import type { JSONValue } from "../Legacy/JSONValue";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import { addDays } from "../Support/calendar";
import { KeyedContainer, decodeDate, decodeRaw, decodeString, encodeJSON } from "../Support/codable";
import { dayComponent } from "../Support/engine";
import type { LoadTag } from "./ExerciseAttributes";

/**
 * Where something is felt. Regions, not diagnoses.
 *
 * The list is short on purpose: it exists to reach the `LoadTag`s the
 * ranking can act on, not to build a symptom vocabulary.
 */
export type PainRegion = "shoulder" | "elbow" | "upperBack" | "lowerBack" | "hip" | "knee" | "wrist" | "other";
export const PainRegion = {
  shoulder: "shoulder" as PainRegion,
  elbow: "elbow" as PainRegion,
  upperBack: "upperBack" as PainRegion,
  lowerBack: "lowerBack" as PainRegion,
  hip: "hip" as PainRegion,
  knee: "knee" as PainRegion,
  wrist: "wrist" as PainRegion,
  other: "other" as PainRegion,
  allCases: ["shoulder", "elbow", "upperBack", "lowerBack", "hip", "knee", "wrist", "other"] as PainRegion[],

  label(self: PainRegion): string {
    switch (self) {
      case "shoulder":
        return "Shoulder";
      case "elbow":
        return "Elbow";
      case "upperBack":
        return "Upper back";
      case "lowerBack":
        return "Lower back";
      case "hip":
        return "Hip";
      case "knee":
        return "Knee";
      case "wrist":
        return "Wrist";
      case "other":
        return "Elsewhere";
    }
  },

  /**
   * The region as it reads inside a sentence ("met je schouder"). `nil`
   * for `other`: it has no honest sentence form, and it never narrows a
   * list, so there is never anything to claim about it.
   */
  sentenceName(self: PainRegion): string | undefined {
    switch (self) {
      case "shoulder":
        return "shoulder";
      case "elbow":
        return "elbow";
      case "upperBack":
        return "upper back";
      case "wrist":
        return "wrist";
      case "lowerBack":
        return "lower back";
      case "hip":
        return "hip";
      case "knee":
        return "knee";
      case "other":
        return undefined;
    }
  },

  /**
   * The positions and loads this region makes worth avoiding. Empty for
   * regions the attribute model has no tag for — the flag is still stored,
   * it simply does not narrow the list.
   */
  loadTags(self: PainRegion): Set<LoadTag> {
    switch (self) {
      case "shoulder":
        return new Set<LoadTag>(["endRangeShoulder", "overheadPosition"]);
      case "elbow":
        return new Set<LoadTag>(["elbowCompression"]);
      case "wrist":
        return new Set<LoadTag>(["wristExtension"]);
      case "lowerBack":
        return new Set<LoadTag>(["axialSpinalLoad", "lumbarFlexion"]);
      case "knee":
        return new Set<LoadTag>(["deepKneeFlexion"]);
      // No attribute tag speaks for these yet: the flag is still stored, it
      // simply does not narrow the list.
      case "upperBack":
      case "hip":
      case "other":
        return new Set<LoadTag>();
    }
  },
};

/** The second and last question. Optional, like the first. */
export type PainTiming = "duringSet" | "afterTraining" | "outsideTheGym";
export const PainTiming = {
  duringSet: "duringSet" as PainTiming,
  afterTraining: "afterTraining" as PainTiming,
  outsideTheGym: "outsideTheGym" as PainTiming,
  allCases: ["duringSet", "afterTraining", "outsideTheGym"] as PainTiming[],

  label(self: PainTiming): string {
    switch (self) {
      case "duringSet":
        return "During the movement";
      case "afterTraining":
        return "After training";
      case "outsideTheGym":
        return "All the time";
    }
  },

  /**
   * The one checked signal that earns the follow-up line. Nothing else in
   * the flow escalates, and even this names no condition.
   */
  warrantsFollowUp(self: PainTiming): boolean {
    return self === "outsideTheGym";
  },
};

/**
 * A note that something was felt, on one exercise, on one day.
 *
 * Not a health record. It stores a region, a date and an exercise, it is
 * individually deletable, and it expires — §14: a flag is re-confirmed, not
 * accumulated.
 */
export interface PainFlag {
  region: PainRegion;
  timing?: PainTiming;
  exerciseID: string;
  date: Date;
}

export const PainFlag = {
  make(p: { region: PainRegion; timing?: PainTiming; exerciseID: string; date?: Date }): PainFlag {
    return { region: p.region, timing: p.timing, exerciseID: p.exerciseID, date: p.date ?? new Date() };
  },

  id(self: PainFlag): string {
    return `${self.exerciseID}|${self.region}|${LegacyAdapter.isoString(self.date)}`;
  },

  lifetimeDays: 14,

  isActive(self: PainFlag, a: { on?: Date } = {}): boolean {
    const day = a.on ?? new Date();
    const expiry = addDays(self.date, PainFlag.lifetimeDays);
    return day.getTime() < expiry.getTime();
  },

  daysRemaining(self: PainFlag, a: { on?: Date } = {}): number {
    const day = a.on ?? new Date();
    const elapsed = dayComponent(self.date, day);
    return Math.max(0, PainFlag.lifetimeDays - elapsed);
  },

  // `extension Collection where Element == PainFlag` — called with the list
  // as the first argument: `flags.active(on:)` → `PainFlag.active(flags, { on })`.

  active(self: readonly PainFlag[], a: { on?: Date } = {}): PainFlag[] {
    const day = a.on ?? new Date();
    return self.filter((flag) => PainFlag.isActive(flag, { on: day }));
  },

  /** The overload name for `active(on:)`, as the porting rules spell it. */
  activeOn(self: readonly PainFlag[], a: { on?: Date } = {}): PainFlag[] {
    return PainFlag.active(self, a);
  },

  /**
   * Everything the ranking should avoid right now. Flags on any exercise
   * count: a shoulder is a shoulder whichever lift found it.
   */
  activeLoadTags(self: readonly PainFlag[], a: { on?: Date } = {}): Set<LoadTag> {
    const result = new Set<LoadTag>();
    for (const flag of PainFlag.active(self, a)) {
      for (const tag of PainRegion.loadTags(flag.region)) result.add(tag);
    }
    return result;
  },

  /** `active(forExercise:on:)`. */
  activeForExercise(self: readonly PainFlag[], a: { forExercise: string; on?: Date }): PainFlag[] {
    return PainFlag.active(self, { on: a.on }).filter((flag) => flag.exerciseID === a.forExercise);
  },

  encode(self: PainFlag): JSONValue {
    return encodeJSON(self);
  },

  decode(json: JSONValue): PainFlag {
    const c = new KeyedContainer(json);
    return {
      region: c.decode("region", decodeRaw(PainRegion.allCases)),
      timing: c.decodeIfPresent("timing", decodeRaw(PainTiming.allCases)),
      exerciseID: c.decode("exerciseID", decodeString),
      date: c.decode("date", decodeDate),
    };
  },
};
