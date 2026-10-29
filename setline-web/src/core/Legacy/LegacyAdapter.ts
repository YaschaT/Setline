import { PlanCatalog } from "../Catalog/PlanCatalog";
import { ExerciseCatalog } from "../Catalog/ExerciseCatalogV1";
import { ActiveSessionSnapshot } from "../Domain/ActiveSession";
import { CustomWorkout } from "../Domain/CustomWorkout";
import { Experience, PlateInventory } from "../Domain/Intake";
import {
  BodyMetric,
  DropStep,
  ExerciseResult,
  LegacyPrescriptionNote,
  LoggedSet,
  NutritionTargets,
  PlannedExercise,
  SetPrescription,
  SetSide,
  SideReps,
  TrainingSession,
  type WorkoutDay,
} from "../Domain/Model";
import { PainFlag } from "../Domain/PainFlag";
import { CustomExercise, ProgramReplacement } from "../Domain/Substitution";
import { SetFlags, SetModifiers, SetOrigin } from "../Domain/Vocabulary";
import { Deload } from "../Engine/Fatigue";
import { PlateMath } from "../Engine/PlateMath";
import { Schedule } from "../Engine/Schedule";
import { Meal, NutritionEntry } from "../Nutrition/NutritionDay";
import { encodeJSON } from "../Support/codable";
import { closedRange } from "../Support/range";
import { dec } from "../Support/swift";
import { JSONValue, type JSONObject } from "./JSONValue";
import { LegacyState } from "./LegacyState";
import { PrescriptionParser } from "./PrescriptionParser";

/** Anything with a Codable `decode`, as the generic `decodeValue` / `decodeList` take it. */
export interface Decodable<T> {
  decode(json: JSONValue): T;
}

/**
 * `ISO8601DateFormatter` with `.withInternetDateTime`, with or without
 * `.withFractionalSeconds`: `isoDate` tries one and then the other, so it
 * reads an internet date-time whether or not it carries fractions.
 */
function parseInternetDateTime(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match) return undefined;
  const fraction = (match[7] ?? "").padEnd(3, "0").slice(0, 3);
  const zone = match[8] === "Z" ? "Z" : match[8].includes(":") ? match[8] : `${match[8].slice(0, 3)}:${match[8].slice(3)}`;
  const t = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${fraction}${zone}`);
  return Number.isNaN(t) ? undefined : new Date(t);
}

/** Swift `"\(decimal)"`: plain digits, never an exponent. */
function decimalDescription(value: number): string {
  const clean = dec(value);
  const text = String(clean);
  if (!/e/i.test(text)) return text;
  return clean.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

/**
 * Reads the web app's blob into the typed domain, and writes typed changes
 * back into the blob without disturbing anything it does not own.
 *
 * Both clients keep working while iOS is built: the blob stays the wire
 * format on `public.user_state`, and the typed model is what the app
 * reasons in. The one-way schema migration lands in a later phase, once.
 *
 * `apply(...:to:)` takes the state `inout` in Swift; here it returns the new
 * state. The `apply` overloads are named for their first label
 * (`applyActiveSession`, `applyPainFlags`, …).
 */
export const LegacyAdapter = {
  // MARK: - Reading

  sessions(a: { from: LegacyState }): TrainingSession[] {
    const rows = JSONValue.arrayValue(LegacyState.get(a.from, "sessions"));
    if (!rows) return [];
    return rows.flatMap((row) => {
      const session = LegacyAdapter.session({ from: row });
      return session ? [session] : [];
    });
  },

  session(a: { from: JSONValue }): TrainingSession | undefined {
    const object = JSONValue.objectValue(a.from);
    if (!object) return undefined;
    const id = JSONValue.stringValue(object["id"]);
    const dateString = JSONValue.stringValue(object["date"]);
    if (id === undefined || dateString === undefined) return undefined;
    const date = LegacyAdapter.isoDate(dateString);
    if (!date) return undefined;

    const kind = JSONValue.stringValue(object["sessionType"]) === "recovery" ? "recovery" : "workout";
    const results = (JSONValue.arrayValue(object["results"]) ?? []).flatMap((value) => {
      const result = LegacyAdapter.result({ from: value });
      return result ? [result] : [];
    });
    const counts = LegacyAdapter.setCounts({ in: object });

    return TrainingSession.make({
      id,
      date,
      dayID: JSONValue.stringValue(object["dayId"]) ?? "",
      dayLabel: JSONValue.stringValue(object["dayLabel"]) ?? "",
      completion: JSONValue.intValue(object["completion"]) ?? 0,
      kind,
      results,
      durationSeconds: JSONValue.intValue(object["durationSeconds"]),
      note: JSONValue.stringValue(object["note"]),
      plannedSetCount: counts?.planned,
      completedSetCount: counts?.completed,
    });
  },

  /**
   * Where iOS stores a session's exact set counts. The web app does not read
   * them, and removes them whenever it rewrites the session's results, which
   * they would then no longer describe.
   */
  plannedSetCountKey: "iosPlannedSetCount",
  completedSetCountKey: "iosCompletedSetCount",

  /**
   * Read only as a pair that holds together. Anything else counts as
   * absent, so history falls back to the stored percentage rather than
   * showing a count that cannot be right.
   */
  setCounts(a: { in: JSONObject }): { planned: number; completed: number } | undefined {
    const object = a.in;
    const planned = JSONValue.intValue(object[LegacyAdapter.plannedSetCountKey]);
    const completed = JSONValue.intValue(object[LegacyAdapter.completedSetCountKey]);
    if (planned === undefined || completed === undefined || !(planned > 0) || !(completed >= 0 && completed <= planned)) {
      return undefined;
    }
    return { planned, completed };
  },

  result(a: { from: JSONValue }): ExerciseResult | undefined {
    const value = a.from;
    const object = JSONValue.objectValue(value);
    if (!object) return undefined;
    const exerciseID = JSONValue.stringValue(object["exerciseId"]);
    if (exerciseID === undefined) return undefined;

    const name = JSONValue.stringValue(object["name"]) ?? ExerciseCatalog.exercise(exerciseID)?.name ?? exerciseID;

    const sets: LoggedSet[] = [];
    const rows = JSONValue.arrayValue(object["sets"]);
    if (rows) {
      rows.forEach((row, index) => {
        const set = LegacyAdapter.loggedSet({ from: row, index });
        if (set) sets.push(set);
      });
    } else {
      // The oldest sessions stored a single weight/reps pair on the
      // result itself rather than a `sets` array.
      const set = LegacyAdapter.loggedSet({ from: value, index: 0 });
      if (set) sets.push(set);
    }

    return ExerciseResult.make({ exerciseID, name, sets, note: JSONValue.stringValue(object["note"]) ?? "" });
  },

  loggedSet(a: { from: JSONValue; index: number }): LoggedSet | undefined {
    const object = JSONValue.objectValue(a.from);
    if (!object) return undefined;
    const index = a.index;

    const weight = JSONValue.decimalValue(object["weight"]);
    const reps = JSONValue.intValue(object["reps"]) ?? 0;
    const pausedReps = JSONValue.intValue(object["pausedReps"]) ?? 0;
    const pauseSeconds = JSONValue.doubleValue(object["pauseSeconds"]);
    // A count that covers every rep says the set was a paused set, whatever
    // else the row carries: that is what the count means, and the web app
    // types it in full rather than leaving it empty the way this app does.
    const fullyPaused = reps > 0 && pausedReps >= reps;
    const pauseEnabled =
      fullyPaused || (JSONValue.boolValue(object["pauseEnabled"]) ?? (pausedReps > 0 || (pauseSeconds ?? 0) > 0));
    // Only iOS writes an origin, and only on added sets. Everything else —
    // the web app's own unmarked "Extra set" rows included — reads as
    // prescribed (see `ProgressionEngine.prescribedSlots`).
    const originRaw = JSONValue.stringValue(object["origin"]) ?? "";
    const origin: SetOrigin = (SetOrigin.allCases as string[]).includes(originRaw)
      ? (originRaw as SetOrigin)
      : "prescribed";

    // Nothing is dropped and nothing is summed.
    //
    // The web app's `completedReps()` returned `reps + pausedReps`, so a
    // paused rep and a normal rep became one number that then drove
    // progression, PR detection and the strength trend
    // (TRAINING_LOGIC §15 change 2). Addendum 16R states the same rule
    // from the design side: "Pauze-reps tellen nooit mee in het
    // repsaantal."
    //
    // So `reps` stays `reps` and the paused count travels beside it. Two
    // sets in the existing history mix the two (flat-bench 120 kg, 6 + 2
    // paused). They keep both numbers, count toward volume, and stay out
    // of progression — a mixed set is comparable to neither series.
    const modifiers = SetModifiers.make({
      pauseEnabled,
      pauseSeconds: pauseEnabled ? (pauseSeconds ?? 2) : undefined,
    });

    if (!(weight !== undefined || reps > 0 || pausedReps > 0)) {
      // An untouched draft row. Preserved as an empty set so the grid
      // keeps its shape.
      return LoggedSet.make({ index, weightKg: undefined, reps: 0, modifiers, origin });
    }

    const sideRaw = JSONValue.stringValue(object["side"]);
    const left = JSONValue.intValue(object["repsLeft"]);
    const right = JSONValue.intValue(object["repsRight"]);

    return LoggedSet.make({
      index,
      weightKg: weight,
      reps,
      rirReported: JSONValue.intValue(object["rir"]),
      isWarmup: JSONValue.boolValue(object["isWarmup"]) ?? false,
      modifiers,
      flags: JSONValue.boolValue(object["failed"]) === true ? SetFlags.failed : 0,
      substitutedFrom: JSONValue.stringValue(object["substitutedFrom"]),
      partialReps: JSONValue.intValue(object["partialReps"]),
      // The count is kept exactly as stored, because both clients read
      // the same number from it (`tests/fixtures/paused-reps.json`).
      // Whether a set is *mixed* is a reading of that number, not a
      // rewriting of it: see `countsTowardProgression`.
      pausedReps: pausedReps > 0 ? pausedReps : undefined,
      origin,
      side:
        sideRaw !== undefined && (SetSide.allCases as string[]).includes(sideRaw) ? (sideRaw as SetSide) : undefined,
      drops: (JSONValue.arrayValue(object["drops"]) ?? []).flatMap((value) => {
        const drop = JSONValue.objectValue(value);
        if (!drop) return [];
        const dropWeight = JSONValue.decimalValue(drop["weight"]);
        if (dropWeight === undefined || !(dropWeight > 0)) return [];
        const dropReps = JSONValue.intValue(drop["reps"]);
        if (dropReps === undefined || !(dropReps > 0)) return [];
        return [DropStep.make({ weightKg: dropWeight, reps: dropReps })];
      }),
      sideReps:
        left !== undefined && right !== undefined && left > 0 && right > 0
          ? SideReps.make({ left, right })
          : undefined,
    });
  },

  metrics(a: { from: LegacyState }): BodyMetric[] {
    return (JSONValue.arrayValue(LegacyState.get(a.from, "metrics")) ?? []).flatMap((value) => {
      const object = JSONValue.objectValue(value);
      if (!object) return [];
      const id = JSONValue.stringValue(object["id"]);
      const date = JSONValue.stringValue(object["date"]);
      const weight = JSONValue.doubleValue(object["weight"]);
      if (id === undefined || date === undefined || weight === undefined) return [];
      return [BodyMetric.make({ id, date, weight, waist: JSONValue.doubleValue(object["waist"]) })];
    });
  },

  targets(a: { from: LegacyState }): NutritionTargets | undefined {
    const object = JSONValue.objectValue(LegacyState.get(a.from, "targets"));
    if (!object) return undefined;
    return NutritionTargets.make({
      calories: JSONValue.intValue(object["calories"]) ?? 0,
      protein: JSONValue.intValue(object["protein"]) ?? 0,
      carbs: JSONValue.intValue(object["carbs"]) ?? 0,
      fat: JSONValue.intValue(object["fat"]) ?? 0,
    });
  },

  /** Everything the account has logged as food, in the order it was written. */
  nutritionEntries(a: { from: LegacyState }): NutritionEntry[] {
    const array = JSONValue.arrayValue(LegacyState.get(a.from, "nutritionEntries"));
    if (!array) return [];
    return array.flatMap((value) => {
      const object = JSONValue.objectValue(value);
      if (!object) return [];
      const id = JSONValue.stringValue(object["id"]);
      const date = JSONValue.stringValue(object["date"]);
      if (id === undefined || date === undefined) return [];
      const loggedAt = JSONValue.stringValue(object["loggedAt"]);
      return [
        NutritionEntry.make({
          id,
          date,
          meal: JSONValue.stringValue(object["meal"]) ?? Meal.snack,
          name: JSONValue.stringValue(object["name"]) ?? "",
          calories: JSONValue.doubleValue(object["calories"]) ?? 0,
          protein: JSONValue.doubleValue(object["protein"]) ?? 0,
          carbs: JSONValue.doubleValue(object["carbs"]) ?? 0,
          fat: JSONValue.doubleValue(object["fat"]) ?? 0,
          amount: JSONValue.doubleValue(object["amount"]),
          unit: JSONValue.stringValue(object["unit"]),
          loggedAt: loggedAt !== undefined ? LegacyAdapter.isoDate(loggedAt) : undefined,
        }),
      ];
    });
  },

  /** How long the account has been lifting, if it ever said. */
  experience(a: { from: LegacyState }): Experience | undefined {
    const raw = JSONValue.stringValue(LegacyState.get(a.from, "experienceLevel"));
    return raw !== undefined && (Experience.allCases as string[]).includes(raw) ? (raw as Experience) : undefined;
  },

  /** The rack this account actually has, or the set the design assumes. */
  plateInventory(a: { from: LegacyState }): PlateInventory {
    const plates = JSONValue.arrayValue(LegacyState.get(a.from, "plates"))?.flatMap((value) => {
      const decimal = JSONValue.decimalValue(value);
      return decimal === undefined ? [] : [decimal];
    });
    if (!plates || plates.length === 0) return PlateInventory.default;
    return PlateInventory.make({
      plates,
      barKg: JSONValue.decimalValue(LegacyState.get(a.from, "barWeightKg")) ?? PlateMath.defaultBar,
    });
  },

  /**
   * A lighter week the account accepted. iOS-namespaced: the web app does
   * not read it and carries it through untouched.
   */
  deloadKey: "iosDeload",

  deload(a: { from: LegacyState }): Deload | undefined {
    const object = JSONValue.objectValue(LegacyState.get(a.from, LegacyAdapter.deloadKey));
    if (!object) return undefined;
    const startedRaw = JSONValue.stringValue(object["startedAt"]);
    const started = startedRaw !== undefined ? LegacyAdapter.isoDate(startedRaw) : undefined;
    if (!started) return undefined;
    return Deload.make({
      startedAt: started,
      days: JSONValue.intValue(object["days"]) ?? 5,
      setReduction: JSONValue.doubleValue(object["setReduction"]) ?? 0.4,
      rirIncrease: JSONValue.intValue(object["rirIncrease"]) ?? 2,
    });
  },

  json(deload: Deload): JSONValue {
    return {
      startedAt: LegacyAdapter.isoString(deload.startedAt),
      days: deload.days,
      setReduction: deload.setReduction,
      rirIncrease: deload.rirIncrease,
    };
  },

  planMode(a: { from: LegacyState }): { mode: string; sciencePlanID: string } {
    return {
      mode: JSONValue.stringValue(LegacyState.get(a.from, "planMode")) ?? "personal",
      sciencePlanID: JSONValue.stringValue(LegacyState.get(a.from, "sciencePlanId")) ?? "ppl-ul",
    };
  },

  /**
   * The saved plan, if the user edited theirs, otherwise the catalogue's.
   *
   * `plan` holds the account's *personal* plan and only that: on a science
   * programme the web app reads the programme's own days and leaves `plan`
   * untouched, so reading it here would show a plan the account is not on.
   */
  plan(a: { from: LegacyState }): WorkoutDay[] {
    const { mode, sciencePlanID: scienceID } = LegacyAdapter.planMode({ from: a.from });
    const days = JSONValue.arrayValue(LegacyState.get(a.from, "plan"));
    if (!(mode === "personal" && days && days.length > 0)) {
      return PlanCatalog.plan({ mode, sciencePlanID: scienceID });
    }
    const parsed = days.flatMap((value) => {
      const day = LegacyAdapter.workoutDay({ from: value });
      return day ? [day] : [];
    });
    return parsed.length === 0 ? PlanCatalog.plan({ mode, sciencePlanID: scienceID }) : parsed;
  },

  workoutDay(a: { from: JSONValue }): WorkoutDay | undefined {
    const object = JSONValue.objectValue(a.from);
    if (!object) return undefined;
    const id = JSONValue.stringValue(object["id"]);
    if (id === undefined) return undefined;
    const exercises = (JSONValue.arrayValue(object["exercises"]) ?? []).flatMap((value) => {
      const planned = LegacyAdapter.plannedExercise({ from: value });
      return planned ? [planned] : [];
    });
    return {
      id,
      label: JSONValue.stringValue(object["label"]) ?? id,
      short: JSONValue.stringValue(object["short"]) ?? id,
      focus: JSONValue.stringValue(object["focus"]) ?? "",
      exercises,
    };
  },

  plannedExercise(a: { from: JSONValue }): PlannedExercise | undefined {
    const object = JSONValue.objectValue(a.from);
    if (!object) return undefined;
    const id = JSONValue.stringValue(object["id"]);
    if (id === undefined) return undefined;
    const prescription = JSONValue.stringValue(object["prescription"]) ?? "";
    const load = JSONValue.stringValue(object["load"]) ?? "";
    const rest = JSONValue.stringValue(object["rest"]) ?? "";
    const role = ExerciseCatalog.role(id);
    const rir = PrescriptionParser.targetRIR({ from: load, role });
    let sets = PrescriptionParser.setPrescriptions({ from: prescription, targetRIR: rir });
    if (sets.length === 0) {
      sets = [SetPrescription.make({ repRange: closedRange(8, 12), targetRIR: rir })];
    }
    const paused = id === "upper-paused-bench";
    return PlannedExercise.make({
      exerciseID: id,
      role,
      sets,
      modifiers: SetModifiers.make({ pauseEnabled: paused, pauseSeconds: paused ? 2 : undefined }),
      authoredNote: LegacyPrescriptionNote.make({ prescription, load, rest }),
    });
  },

  /**
   * Date → canonical day id, for the program the account is currently on.
   *
   * Overrides are scoped per program (`personal:2026-08-28`), so the ones
   * belonging to a plan the account is not running must not be read — the
   * web app scopes the same way, and the two must agree on which day it is.
   * A bare `"2026-08-28"` is an older export, and the web app still honours
   * it on the two programs that predate the scoping.
   *
   * Both Swift overloads, `scheduleOverrides(from:)` and
   * `scheduleOverrides(from:programKey:)`: without a `programKey`, the
   * account's current program is used.
   */
  scheduleOverrides(a: { from: LegacyState; programKey?: string }): Record<string, string> {
    let programKey = a.programKey;
    if (programKey === undefined) {
      const { mode, sciencePlanID: scienceID } = LegacyAdapter.planMode({ from: a.from });
      programKey = Schedule.programKey({ mode, sciencePlanID: scienceID });
    }
    const object = JSONValue.objectValue(LegacyState.get(a.from, "scheduleOverrides"));
    if (!object) return {};
    const honoursBareKeys = programKey === "personal" || programKey === "science-ppl-ul";
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(object)) {
      const day = JSONValue.stringValue(value);
      if (day === undefined) continue;
      const separator = key.indexOf(":");
      if (separator !== -1) {
        if (key.slice(0, separator) !== programKey) continue;
        result[key.slice(separator + 1)] = day;
      } else if (honoursBareKeys && !Object.prototype.hasOwnProperty.call(result, key)) {
        result[key] = day;
      }
    }
    return result;
  },

  /**
   * The key the paused session rides in. Namespaced so the web app — which
   * reads only the keys it knows — leaves it alone, and so `LegacyState`
   * carries it through untouched on every write.
   */
  activeSessionKey: "iosActiveSession",

  activeSession(a: { from: LegacyState }): ActiveSessionSnapshot | undefined {
    const value = LegacyState.get(a.from, LegacyAdapter.activeSessionKey);
    if (value === undefined || value === null) return undefined;
    try {
      return ActiveSessionSnapshot.decode(value);
    } catch {
      return undefined;
    }
  },

  applyActiveSession(a: { activeSession: ActiveSessionSnapshot | undefined; to: LegacyState }): LegacyState {
    if (a.activeSession === undefined) {
      return LegacyState.set(a.to, LegacyAdapter.activeSessionKey, { to: null });
    }
    const value = LegacyAdapter.jsonValue(a.activeSession);
    if (value === undefined) return a.to;
    return LegacyState.set(a.to, LegacyAdapter.activeSessionKey, { to: value });
  },

  /**
   * Exercises whose warm-up ramp the user has hidden for good.
   *
   * The only thing about a warm-up that is worth persisting: the ramp
   * itself is generated on the fly and never stored as sets.
   */
  hiddenWarmupsKey: "iosHiddenWarmups",

  hiddenWarmups(a: { from: LegacyState }): Set<string> {
    const values = JSONValue.arrayValue(LegacyState.get(a.from, LegacyAdapter.hiddenWarmupsKey));
    if (!values) return new Set<string>();
    return new Set(values.flatMap((v) => (typeof v === "string" ? [v] : [])));
  },

  applyHiddenWarmups(a: { hiddenWarmups: Set<string>; to: LegacyState }): LegacyState {
    return LegacyState.set(a.to, LegacyAdapter.hiddenWarmupsKey, { to: [...a.hiddenWarmups].sort() });
  },

  // MARK: - Phase 3 keys
  //
  // Three more iOS-only keys, written the same way and for the same
  // reason: the web app does not read them, and `LegacyState` carries
  // anything it does not recognise through a round trip untouched.

  painFlagsKey: "iosPainFlags",
  favoriteExercisesKey: "iosFavoriteExercises",
  replacementsKey: "iosProgramReplacements",
  customExercisesKey: "iosCustomExercises",
  customWorkoutsKey: "iosCustomWorkouts",

  /** The lifter's own workouts, oldest first. */
  customWorkouts(a: { from: LegacyState }): CustomWorkout[] {
    return decodeList(LegacyState.get(a.from, LegacyAdapter.customWorkoutsKey), CustomWorkout) ?? [];
  },

  /** The exercises this account starred in Progressie's picker (40b). */
  favoriteExercises(a: { from: LegacyState }): Set<string> {
    const values = JSONValue.arrayValue(LegacyState.get(a.from, LegacyAdapter.favoriteExercisesKey));
    if (!values) return new Set<string>();
    return new Set(values.flatMap((v) => (typeof v === "string" ? [v] : [])));
  },

  applyFavoriteExercises(a: { favoriteExercises: Set<string>; to: LegacyState }): LegacyState {
    return LegacyState.set(a.to, LegacyAdapter.favoriteExercisesKey, { to: [...a.favoriteExercises].sort() });
  },

  painFlags(a: { from: LegacyState }): PainFlag[] {
    return decodeList(LegacyState.get(a.from, LegacyAdapter.painFlagsKey), PainFlag) ?? [];
  },

  /**
   * Expired flags are dropped on write rather than filtered on read, so a
   * flag that has run out actually leaves the account (§14: a flag is
   * re-confirmed, not accumulated).
   */
  applyPainFlags(a: { painFlags: readonly PainFlag[]; to: LegacyState }): LegacyState {
    return encodeList(PainFlag.active(a.painFlags), a.to, LegacyAdapter.painFlagsKey);
  },

  programReplacements(a: { from: LegacyState }): ProgramReplacement[] {
    return decodeList(LegacyState.get(a.from, LegacyAdapter.replacementsKey), ProgramReplacement) ?? [];
  },

  applyProgramReplacements(a: { programReplacements: readonly ProgramReplacement[]; to: LegacyState }): LegacyState {
    return encodeList(a.programReplacements, a.to, LegacyAdapter.replacementsKey);
  },

  customExercises(a: { from: LegacyState }): CustomExercise[] {
    return decodeList(LegacyState.get(a.from, LegacyAdapter.customExercisesKey), CustomExercise) ?? [];
  },

  applyCustomExercises(a: { customExercises: readonly CustomExercise[]; to: LegacyState }): LegacyState {
    return encodeList(a.customExercises, a.to, LegacyAdapter.customExercisesKey);
  },

  /**
   * One value as stored JSON, encoded the way every iOS key is
   * (`JSONEncoder` with `.iso8601` dates). `nil` when it cannot be encoded.
   */
  jsonValue(value: unknown): JSONValue | undefined {
    try {
      return encodeJSON(value, "iso8601");
    } catch {
      return undefined;
    }
  },

  /** `decodeValue<T>(_:)`: the type is passed as its companion, which carries `decode`. */
  decodeValue<T>(value: JSONValue, type: Decodable<T>): T | undefined {
    try {
      return type.decode(value);
    } catch {
      return undefined;
    }
  },

  // MARK: - Writing
  //
  // Sessions are never written back as a list. Rebuilding every session from
  // the typed model dropped what iOS does not model — a web recovery day's
  // sleep, soreness, energy and activities — and rewrote sessions nobody had
  // touched in iOS's own number format. A session change is a `StateChange`,
  // applied by `StateMerge` to exactly that one session.

  // MARK: - Dates

  isoDate(string: string): Date | undefined {
    return parseInternetDateTime(string);
  },

  /**
   * Milliseconds included, matching what the web app writes
   * (`new Date().toISOString()`).
   */
  isoString(date: Date): string {
    return date.toISOString();
  },

  // `JSONValue(session:)`, `JSONValue(result:)`, `JSONValue(set:)` — the
  // extension initialisers this file declares, also reachable here.

  jsonValueSession(session: TrainingSession): JSONValue {
    return JSONValueFrom.session(session);
  },

  jsonValueResult(result: ExerciseResult): JSONValue {
    return JSONValueFrom.result(result);
  },

  jsonValueSet(set: LoggedSet): JSONValue {
    return JSONValueFrom.set(set);
  },
};

function decodeList<T>(value: JSONValue | undefined, type: Decodable<T>): T[] | undefined {
  if (value === undefined || value === null) return undefined;
  const array = JSONValue.arrayValue(value);
  if (!array) return undefined;
  try {
    return array.map((item) => type.decode(item));
  } catch {
    return undefined;
  }
}

function encodeList<T>(list: readonly T[], state: LegacyState, key: string): LegacyState {
  const value = LegacyAdapter.jsonValue(list);
  if (value === undefined) return state;
  return LegacyState.set(state, key, { to: value });
}

/**
 * The `extension JSONValue` initialisers declared in LegacyAdapter.swift:
 * `JSONValue(session:)` → `JSONValueFrom.session(...)`, and likewise
 * `result` and `set`. They write the web app's own shapes.
 */
export const JSONValueFrom = {
  session(session: TrainingSession): JSONValue {
    const object: JSONObject = {
      id: session.id,
      date: LegacyAdapter.isoString(session.date),
      dayId: session.dayID,
      dayLabel: session.dayLabel,
      completion: session.completion,
      results: session.results.map((result) => JSONValueFrom.result(result)),
    };
    if (session.kind === "recovery") object["sessionType"] = "recovery";
    if (session.durationSeconds !== undefined) object["durationSeconds"] = session.durationSeconds;
    if (session.note !== undefined) object["note"] = session.note;
    if (session.plannedSetCount !== undefined && session.completedSetCount !== undefined) {
      object[LegacyAdapter.plannedSetCountKey] = session.plannedSetCount;
      object[LegacyAdapter.completedSetCountKey] = session.completedSetCount;
    }
    return object;
  },

  result(result: ExerciseResult): JSONValue {
    return {
      exerciseId: result.exerciseID,
      name: result.name,
      sets: result.sets.map((set) => JSONValueFrom.set(set)),
    };
  },

  set(set: LoggedSet): JSONValue {
    const object: JSONObject = {
      weight: set.weightKg !== undefined ? decimalDescription(set.weightKg) : "",
      reps: set.reps > 0 ? `${set.reps}` : "",
      pausedReps: set.pausedReps !== undefined ? `${set.pausedReps}` : "",
      pauseSeconds: set.modifiers.pauseSeconds !== undefined ? `${Math.trunc(set.modifiers.pauseSeconds)}` : "",
      pauseEnabled: set.modifiers.pauseEnabled,
    };
    if (set.rirReported !== undefined) object["rir"] = set.rirReported;
    if (set.isWarmup) object["isWarmup"] = true;
    if (set.partialReps !== undefined && set.partialReps > 0) object["partialReps"] = set.partialReps;
    if (set.substitutedFrom !== undefined) object["substitutedFrom"] = set.substitutedFrom;
    // Written only for added sets, so a prescribed set keeps the web app's
    // exact shape.
    if (set.origin === "sessionAdded") object["origin"] = "sessionAdded";
    if (set.side !== undefined) object["side"] = set.side;
    // Failed was kept on the phone only and lost on save; it is a fact
    // about the set, so it is stored with it now.
    if (SetFlags.contains(set.flags, SetFlags.failed)) object["failed"] = true;
    if (set.sideReps !== undefined) {
      object["repsLeft"] = `${set.sideReps.left}`;
      object["repsRight"] = `${set.sideReps.right}`;
    }
    if (set.drops.length > 0) {
      object["drops"] = set.drops.map((drop) => ({ weight: decimalDescription(drop.weightKg), reps: `${drop.reps}` }));
    }
    return object;
  },
};
