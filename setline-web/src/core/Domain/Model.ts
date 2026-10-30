import type { JSONValue } from "../Legacy/JSONValue";
import {
  KeyedContainer,
  decodeArray,
  decodeBool,
  decodeClosedRange,
  decodeInt,
  decodeNumber,
  decodeRaw,
  decodeString,
  decodeUUID,
  encodeJSON,
} from "../Support/codable";
import { closedRange, type ClosedRange } from "../Support/range";
import { uuid } from "../Support/swift";
import type { ExerciseAttributes, Station } from "./ExerciseAttributes";
import { exerciseGroup } from "./MuscleGroup";
import { loggedSetExecution } from "./SetExecution";
import { Equipment, ExerciseRole, SetFlags, SetModifiers, SetOrigin } from "./Vocabulary";

// MARK: - Catalogue

/**
 * An exercise as a thing that exists, independent of any plan.
 *
 * Phase 1 carries only the attributes the vertical slice needs. The full
 * attribute set from TRAINING_LOGIC §1 — muscle contribution vectors,
 * jointActions, resistanceProfile, fatigueCost, loadTags — arrives with the
 * substitution ranking in Phase 3, which is the only thing that consumes it.
 */
export interface Exercise {
  readonly id: string;
  /**
   * Dutch display name. The design writes exercise names in Dutch
   * ("Bankdrukken"); the web app mixes Dutch and English.
   */
  name: string;
  equipment: Equipment;
  isCompound: boolean;
  unilateral: boolean;
  /** Per-gym override of `equipment.defaultIncrementKg`, when set. */
  incrementKgOverride?: number;
  /**
   * The apparatus this exercise needs, where two exercises genuinely
   * contend for one. `nil` for anything a gym has several of.
   */
  station?: Station;
  /**
   * Ranking metadata. Optional so the catalogue can grow incrementally —
   * but every exercise offered as a V1 recommendation has it, and a test
   * enforces that.
   */
  attributes?: ExerciseAttributes;
}

export const Exercise = {
  make(p: {
    id: string;
    name: string;
    equipment: Equipment;
    isCompound: boolean;
    unilateral?: boolean;
    incrementKgOverride?: number;
    station?: Station;
    attributes?: ExerciseAttributes;
  }): Exercise {
    return {
      id: p.id,
      name: p.name,
      equipment: p.equipment,
      isCompound: p.isCompound,
      unilateral: p.unilateral ?? false,
      incrementKgOverride: p.incrementKgOverride,
      station: p.station,
      attributes: p.attributes,
    };
  },

  incrementKg(self: Exercise): number {
    return self.incrementKgOverride ?? Equipment.defaultIncrementKg(self.equipment);
  },

  /** `exercise.group`, declared in MuscleGroup.swift. */
  group: exerciseGroup,
};

/**
 * One set's prescription. A `"1×5–6 + 2×6–8"` string becomes three of these,
 * which is the whole point of TRAINING_LOGIC §15 change 1: text is a
 * rendering of the model, never the model.
 */
export interface SetPrescription {
  repRange: ClosedRange;
  targetRIR: ClosedRange;
}

export const SetPrescription = {
  make(p: { repRange: ClosedRange; targetRIR?: ClosedRange }): SetPrescription {
    return { repRange: p.repRange, targetRIR: p.targetRIR ?? closedRange(1, 2) };
  },

  encode(self: SetPrescription): JSONValue {
    return encodeJSON(self);
  },

  decode(json: JSONValue): SetPrescription {
    const c = new KeyedContainer(json);
    return {
      repRange: c.decode("repRange", decodeClosedRange),
      targetRIR: c.decode("targetRIR", decodeClosedRange),
    };
  },
};

export interface PlannedExercise {
  exerciseID: string;
  role: ExerciseRole;
  sets: SetPrescription[];
  modifiers: SetModifiers;
  /**
   * The curated Dutch string this prescription was authored as
   * (`"120 kg → 105–110 kg"`, `"Topset + back-offs · RIR 1–2"`).
   *
   * Kept verbatim and shown as a note. Typing the prescription must not
   * cost the coaching nuance the strings carry; nothing else in the app
   * parses this field.
   */
  authoredNote?: LegacyPrescriptionNote;
}

export const PlannedExercise = {
  make(p: {
    exerciseID: string;
    role: ExerciseRole;
    sets: SetPrescription[];
    modifiers?: SetModifiers;
    authoredNote?: LegacyPrescriptionNote;
  }): PlannedExercise {
    return {
      exerciseID: p.exerciseID,
      role: p.role,
      sets: p.sets,
      modifiers: p.modifiers ?? SetModifiers.none,
      authoredNote: p.authoredNote,
    };
  },

  id(self: PlannedExercise): string {
    return self.exerciseID;
  },

  targetSets(self: PlannedExercise): number {
    return self.sets.length;
  },

  /**
   * The same exercise with fewer sets, for a lighter week. Keeps the first
   * `count` prescriptions, so the heaviest work is what survives.
   */
  lightened(self: PlannedExercise, a: { setsTo: number }): PlannedExercise {
    const count = a.setsTo;
    if (!(count > 0 && count < self.sets.length)) return self;
    return { ...self, sets: self.sets.slice(0, count) };
  },

  /** The rep target used for double progression: the top of each set's range. */
  repTargets(self: PlannedExercise): number[] {
    return self.sets.map((s) => s.repRange.upperBound);
  },

  encode(self: PlannedExercise): JSONValue {
    return encodeJSON(self);
  },

  decode(json: JSONValue): PlannedExercise {
    const c = new KeyedContainer(json);
    return {
      exerciseID: c.decode("exerciseID", decodeString),
      role: c.decode("role", decodeRaw(ExerciseRole.allCases)),
      sets: c.decode("sets", decodeArray(SetPrescription.decode)),
      modifiers: c.decode("modifiers", SetModifiers.decode),
      authoredNote: c.decodeIfPresent("authoredNote", LegacyPrescriptionNote.decode),
    };
  },
};

/**
 * The three free-text fields the web app authored per exercise, preserved
 * exactly as written so nothing editorial is lost in the port.
 */
export interface LegacyPrescriptionNote {
  prescription: string;
  load: string;
  rest: string;
}

export const LegacyPrescriptionNote = {
  make(p: { prescription: string; load: string; rest: string }): LegacyPrescriptionNote {
    return { prescription: p.prescription, load: p.load, rest: p.rest };
  },

  decode(json: JSONValue): LegacyPrescriptionNote {
    const c = new KeyedContainer(json);
    return {
      prescription: c.decode("prescription", decodeString),
      load: c.decode("load", decodeString),
      rest: c.decode("rest", decodeString),
    };
  },
};

export interface WorkoutDay {
  readonly id: string;
  label: string;
  short: string;
  focus: string;
  exercises: PlannedExercise[];
}

export const WorkoutDay = {
  make(p: { id: string; label: string; short: string; focus: string; exercises: PlannedExercise[] }): WorkoutDay {
    return { id: p.id, label: p.label, short: p.short, focus: p.focus, exercises: p.exercises };
  },
};

// MARK: - Logged data

/**
 * Which side a set of a one-sided exercise was done with, stored as the
 * web app would read it: "L", "R" or "both".
 */
export type SetSide = "L" | "R" | "both";
export const SetSide = {
  left: "L" as SetSide,
  right: "R" as SetSide,
  both: "both" as SetSide,
  allCases: ["L", "R", "both"] as SetSide[],

  label(self: SetSide): string {
    switch (self) {
      case "L":
        return "L";
      case "R":
        return "R";
      case "both":
        return "Both";
    }
  },
};

/** Left and right reps of one two-sided set of a one-sided exercise. */
export interface SideReps {
  left: number;
  right: number;
}

export const SideReps = {
  make(p: { left: number; right: number }): SideReps {
    return { left: p.left, right: p.right };
  },

  /** The weaker side: what the set counts as for progression and records. */
  weaker(self: SideReps): number {
    return Math.min(self.left, self.right);
  },

  /** "L 8 · R 7" */
  label(self: SideReps): string {
    return `L ${self.left} · R ${self.right}`;
  },

  decode(json: JSONValue): SideReps {
    const c = new KeyedContainer(json);
    return { left: c.decode("left", decodeInt), right: c.decode("right", decodeInt) };
  },
};

/** One lighter round of a drop set. */
export interface DropStep {
  weightKg: number;
  reps: number;
}

export const DropStep = {
  make(p: { weightKg: number; reps: number }): DropStep {
    return { weightKg: p.weightKg, reps: p.reps };
  },

  decode(json: JSONValue): DropStep {
    const c = new KeyedContainer(json);
    return { weightKg: c.decode("weightKg", decodeNumber), reps: c.decode("reps", decodeInt) };
  },
};

export interface LoggedSet {
  id: string;
  index: number;
  weightKg?: number;
  /**
   * Total reps performed. Paused reps are NOT added in.
   *
   * TRAINING_LOGIC §15 change 2: the web app's `completedReps()` returned
   * `reps + pausedReps`, which fed one number into progression, PR
   * detection and the strength trend. Addendum 16R states the same rule
   * from the design side: "pauze-reps worden nooit bij het repsaantal
   * opgeteld".
   */
  reps: number;
  rirReported?: number;
  isWarmup: boolean;
  modifiers: SetModifiers;
  flags: SetFlags;
  /** Origin exercise id when this set was logged on a substitute (§12.5). */
  substitutedFrom?: string;
  /**
   * Count of partial reps at the end of the set. Shown in history,
   * excluded from progression and PR maths (§5).
   */
  partialReps?: number;
  /**
   * How many of this set's reps were performed paused.
   *
   * A count *inside* `reps`, never beside it: "120 kg × 6, de laatste 2
   * gepauzeerd" is one set of six reps, two of which carry the pause. It
   * therefore never adds reps, never adds volume and never adds a set.
   *
   * Only a part of the set is ever recorded here. Where every rep was
   * paused the set simply *is* a paused set, which `modifiers.pauseEnabled`
   * already says, and `pausedRepsWithin(_:reps:)` drops the count — the
   * shape the model has always had, so planned paused work keeps its own
   * series.
   *
   * The web app stores the same key but adds it onto `reps`
   * (`completedReps()`); this port never sums (TRAINING_LOGIC §15 change 2).
   */
  pausedReps?: number;
  /**
   * Prescribed by the program, or added during this session. An added set
   * counts toward volume, history and records like any working set, but
   * never fills a prescribed slot when progression is judged.
   */
  origin: SetOrigin;
  /**
   * The side a set of a one-sided exercise was done with. `nil` on a
   * two-sided exercise, or where no side was said. `.both` is one set —
   * both sides done for the reps shown — and is never counted twice in
   * volume: the weight and reps are stored once, like any other set.
   */
  side?: SetSide;
  /**
   * A drop set's lighter rounds, done straight after the set without rest:
   * "102,5 × 8, then 80 × 6". Part of this set, never sets of their own —
   * they add volume, and nothing else: progression, estimates and records
   * read the set's own weight and reps only.
   */
  drops: DropStep[];
  /**
   * Reps per side, when a one-sided exercise is done on both sides in one
   * set and the sides differ: "L 8 · R 7". `reps` is then the weaker
   * side — progression and records ask both sides to make the target —
   * and volume takes the average, so equal sides count exactly once.
   */
  sideReps?: SideReps;
}

export const LoggedSet = {
  make(p: {
    id?: string;
    index: number;
    weightKg?: number;
    reps?: number;
    rirReported?: number;
    isWarmup?: boolean;
    modifiers?: SetModifiers;
    flags?: SetFlags;
    substitutedFrom?: string;
    partialReps?: number;
    pausedReps?: number;
    origin?: SetOrigin;
    side?: SetSide;
    drops?: DropStep[];
    sideReps?: SideReps;
  }): LoggedSet {
    return {
      id: p.id ?? uuid(),
      index: p.index,
      weightKg: p.weightKg,
      reps: p.reps ?? 0,
      rirReported: p.rirReported,
      isWarmup: p.isWarmup ?? false,
      modifiers: p.modifiers ?? SetModifiers.none,
      flags: p.flags ?? 0,
      substitutedFrom: p.substitutedFrom,
      partialReps: p.partialReps,
      pausedReps: p.pausedReps,
      origin: p.origin ?? "prescribed",
      side: p.side,
      drops: p.drops ?? [],
      sideReps: p.sideReps,
    };
  },

  encode(self: LoggedSet): JSONValue {
    return encodeJSON(self);
  },

  /**
   * Tolerates sets saved before `origin` existed — every one of those was a
   * prescribed set. A paused session whose sets failed to decode would not
   * fail loudly; it would simply not be there to resume.
   */
  decode(json: JSONValue): LoggedSet {
    const c = new KeyedContainer(json);
    return {
      id: c.decode("id", decodeUUID),
      index: c.decode("index", decodeInt),
      weightKg: c.decodeIfPresent("weightKg", decodeNumber),
      reps: c.decode("reps", decodeInt),
      rirReported: c.decodeIfPresent("rirReported", decodeInt),
      isWarmup: c.decode("isWarmup", decodeBool),
      modifiers: c.decode("modifiers", SetModifiers.decode),
      flags: c.decode("flags", decodeInt),
      substitutedFrom: c.decodeIfPresent("substitutedFrom", decodeString),
      partialReps: c.decodeIfPresent("partialReps", decodeInt),
      pausedReps: c.decodeIfPresent("pausedReps", decodeInt),
      origin: c.decodeIfPresent("origin", decodeRaw(SetOrigin.allCases)) ?? "prescribed",
      side: c.decodeIfPresent("side", decodeRaw(SetSide.allCases)),
      drops: c.decodeIfPresent("drops", decodeArray(DropStep.decode)) ?? [],
      sideReps: c.decodeIfPresent("sideReps", SideReps.decode),
    };
  },

  /**
   * A set with weight and reps is a complete set — 0 kg included, which is
   * a set without weight. RIR is the optional third tap (addendum 11R) and
   * never gates anything.
   */
  isLogged(self: LoggedSet): boolean {
    return self.weightKg !== undefined && self.weightKg >= 0 && self.reps > 0;
  },

  /**
   * Whether this set contributes to volume load.
   *
   * Warm-ups never do (§7). Everything else does, including paused and
   * partial sets — addendum 16R: "Telt mee in je volume, niet in je
   * progressie."
   */
  countsTowardVolume(self: LoggedSet): boolean {
    return LoggedSet.isLogged(self) && !self.isWarmup;
  },

  /**
   * A paused-rep count that means something inside the set holding it: at
   * least one rep, never more than were performed, and never all of them —
   * a set where every rep was paused is a paused set, not a partly paused
   * one, and says so through `modifiers.pauseEnabled`.
   */
  pausedRepsWithin(count: number | undefined, a: { reps: number }): number | undefined {
    const reps = a.reps;
    if (count === undefined || !(count > 0) || !(reps > 0)) return undefined;
    const bounded = Math.min(count, reps);
    return bounded === reps ? undefined : bounded;
  },

  /**
   * Whether this set may drive progression, a proposal or a record.
   *
   * Excluded: warm-ups, technical breakdowns, sets carrying partial reps
   * (§5), and sets that *mix* paused and unpaused reps — a mixed set is not
   * comparable to either series, so counting it would be exactly the
   * wrong-number bug the comparability rule exists to prevent.
   *
   * Mixed means some of the reps, not all of them. A set whose every rep
   * was paused is a paused set and belongs to the paused series
   * (`modifiers.pauseEnabled`, §9.2); reading it as mixed would silently
   * drop every paused session out of progression, records and the strength
   * trend — which is what it did for sets the web app wrote, where the
   * count is typed in full.
   */
  countsTowardProgression(self: LoggedSet): boolean {
    if (!(LoggedSet.isLogged(self) && !self.isWarmup && !SetFlags.contains(self.flags, SetFlags.technicalBreakdown))) {
      return false;
    }
    if ((self.partialReps ?? 0) > 0) return false;
    const paused = self.pausedReps;
    if (paused !== undefined && paused > 0 && paused < self.reps) return false;
    return true;
  },

  /** `set.execution`, declared in SetExecution.swift. */
  execution: loggedSetExecution,
};

export interface ExerciseResult {
  exerciseID: string;
  /**
   * Name as it was at the time of logging, so renaming an exercise never
   * rewrites history.
   */
  name: string;
  sets: LoggedSet[];
  note: string;
}

export const ExerciseResult = {
  make(p: { exerciseID: string; name: string; sets: LoggedSet[]; note?: string }): ExerciseResult {
    return { exerciseID: p.exerciseID, name: p.name, sets: p.sets, note: p.note ?? "" };
  },

  id(self: ExerciseResult): string {
    return self.exerciseID;
  },

  workingSets(self: ExerciseResult): LoggedSet[] {
    return self.sets.filter((s) => !s.isWarmup);
  },

  encode(self: ExerciseResult): JSONValue {
    return encodeJSON(self);
  },

  decode(json: JSONValue): ExerciseResult {
    const c = new KeyedContainer(json);
    return {
      exerciseID: c.decode("exerciseID", decodeString),
      name: c.decode("name", decodeString),
      sets: c.decode("sets", decodeArray(LoggedSet.decode)),
      note: c.decode("note", decodeString),
    };
  },
};

export type SessionKind = "workout" | "recovery";
export const SessionKind = {
  workout: "workout" as SessionKind,
  recovery: "recovery" as SessionKind,
};

export interface TrainingSession {
  id: string;
  date: Date;
  dayID: string;
  dayLabel: string;
  /**
   * Percentage of planned sets tracked, as the web app computed it.
   * History shows it for sessions that carry no exact counts.
   */
  completion: number;
  kind: SessionKind;
  results: ExerciseResult[];
  /**
   * Wall-clock duration, shown on artboard 17R ("Push A · 53 min · 7 sep").
   * Absent for every session imported from the web app, which never
   * recorded one.
   */
  durationSeconds?: number;
  note?: string;
  /**
   * Prescribed working sets, counted when iOS saved the session. Sets added
   * during the session are not in it. `nil` for every session without an
   * exact count — the web app's, and older ones — which show `completion`.
   */
  plannedSetCount?: number;
  /**
   * How many of those prescribed sets were logged. A logged added set never
   * raises it, and it is never more than `plannedSetCount`.
   */
  completedSetCount?: number;
}

export const TrainingSession = {
  make(p: {
    id: string;
    date: Date;
    dayID: string;
    dayLabel: string;
    completion: number;
    kind?: SessionKind;
    results: ExerciseResult[];
    durationSeconds?: number;
    note?: string;
    plannedSetCount?: number;
    completedSetCount?: number;
  }): TrainingSession {
    return {
      id: p.id,
      date: p.date,
      dayID: p.dayID,
      dayLabel: p.dayLabel,
      completion: p.completion,
      kind: p.kind ?? "workout",
      results: p.results,
      durationSeconds: p.durationSeconds,
      note: p.note,
      plannedSetCount: p.plannedSetCount,
      completedSetCount: p.completedSetCount,
    };
  },
};

export interface BodyMetric {
  id: string;
  date: string;
  weight: number;
  waist?: number;
}

export const BodyMetric = {
  make(p: { id: string; date: string; weight: number; waist?: number }): BodyMetric {
    return { id: p.id, date: p.date, weight: p.weight, waist: p.waist };
  },
};

export interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const NutritionTargets = {
  make(p: { calories: number; protein: number; carbs: number; fat: number }): NutritionTargets {
    return { calories: p.calories, protein: p.protein, carbs: p.carbs, fat: p.fat };
  },
};
