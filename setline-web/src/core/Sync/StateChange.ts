import { ActiveSessionSnapshot } from "../Domain/ActiveSession";
import { CustomWorkout } from "../Domain/CustomWorkout";
import type { TrainingSession } from "../Domain/Model";
import { PainFlag } from "../Domain/PainFlag";
import { CustomExercise, ProgramReplacement } from "../Domain/Substitution";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import type { JSONObject, JSONValue } from "../Legacy/JSONValue";
import {
  decodeArray,
  decodeBool,
  decodeNumber,
  decodeRaw,
  decodeString,
  decodeUUID,
  DecodingError,
  iso8601Seconds,
  KeyedContainer,
} from "../Support/codable";
import { uuid } from "../Support/swift";
import { parseISO8601Internet } from "../Support/sync";
import { SetCorrection, SetRemoval } from "./SetCorrection";

/**
 * One thing iOS changed in the shared state, recorded instead of a copy.
 *
 * iOS never pushes its whole copy of the state: a copy is stale the moment
 * the web app writes. Each save becomes a `StateChange`, kept on the device
 * until the account has it, and `StateMerge` replays the pending changes onto
 * whatever is stored when the sync runs. Every change says exactly what it
 * touches, so nothing it does not mention can be lost by applying it.
 */
export type StateChange_Kind =
  /** A finished or re-logged session, as iOS writes it. */
  | { kind: "upsertSession"; value: JSONValue }
  /**
   * Corrections to sets already logged in one stored session. Only the
   * named sets change; everything else in that session, and every other
   * session, is left exactly as stored.
   */
  | { kind: "correctSessionSets"; sessionID: string; corrections: SetCorrection[] }
  /**
   * Sets taken out of one stored session. Only the named sets go; the
   * session keeps its id, its date and everything else it holds — and
   * a session whose last set is removed goes with it, because an
   * empty workout is not a workout.
   */
  | { kind: "removeSessionSets"; sessionID: string; removals: SetRemoval[] }
  /**
   * A whole logged workout taken out of the account. It leaves a
   * tombstone, so a client still holding an older copy cannot put it
   * back; logging it again afterwards is a new decision and wins.
   */
  | { kind: "removeSession"; id: string }
  /** The paused workout, or `.null` to clear it explicitly. */
  | { kind: "setActiveSession"; value: JSONValue }
  | { kind: "addPainFlag"; value: PainFlag }
  | { kind: "removePainFlag"; id: string }
  | { kind: "addProgramReplacement"; value: ProgramReplacement }
  | { kind: "removeProgramReplacement"; id: string }
  | { kind: "addCustomExercise"; value: CustomExercise }
  /** A workout put together by the lifter, added or changed by its id. */
  | { kind: "upsertCustomWorkout"; value: CustomWorkout }
  | { kind: "removeCustomWorkout"; id: string }
  | { kind: "hideWarmup"; exerciseID: string }
  /** One exercise starred, or unstarred, in Progressie's picker (40b). */
  | { kind: "setFavoriteExercise"; exerciseID: string; isFavorite: boolean }
  /** One date of the schedule, scoped per program (`personal:2026-09-17`). */
  | { kind: "setScheduleDay"; key: string; dayID: string }
  /** Explicitly back to the program's default week for that date. */
  | { kind: "removeScheduleOverride"; key: string }
  /** One meal, by its own id. */
  | { kind: "upsertNutritionEntry"; value: JSONValue }
  | { kind: "removeNutritionEntry"; id: string }
  /**
   * One weigh-in, by its own id: a new one, or the day's own entry
   * written again. Every other weigh-in is left as stored.
   */
  | { kind: "upsertMetric"; value: JSONValue }
  /** One nutrition target, by field. */
  | { kind: "setTarget"; field: string; value: number }
  | { kind: "setProgram"; mode: string; sciencePlanID?: string }
  | { kind: "setExperience"; value: string }
  | { kind: "setEquipment"; plates: number[]; barKg: number }
  | { kind: "setDeload"; value: JSONValue };

export interface StateChange {
  /**
   * Identifies the change itself, so a sync can clear exactly the changes
   * it wrote and keep any made while it ran. A `UUID`, upper-case as Swift
   * prints it.
   */
  readonly id: string;
  /**
   * When the user made the change. A change older than a deletion or a
   * reset of the same data loses to it.
   */
  readonly createdAt: Date;
  readonly kind: StateChange_Kind;
}

// MARK: Coding
//
// The same shape the shared fixtures in `tests/fixtures/sync` use, so the
// iOS tests read the web tests' scenarios directly.

const KIND_NAMES = [
  "upsertSession",
  "correctSessionSets",
  "removeSessionSets",
  "removeSession",
  "setActiveSession",
  "addPainFlag",
  "removePainFlag",
  "addProgramReplacement",
  "removeProgramReplacement",
  "addCustomExercise",
  "hideWarmup",
  "upsertCustomWorkout",
  "removeCustomWorkout",
  "setFavoriteExercise",
  "setScheduleDay",
  "removeScheduleOverride",
  "upsertNutritionEntry",
  "removeNutritionEntry",
  "upsertMetric",
  "setTarget",
  "setProgram",
  "setExperience",
  "setEquipment",
  "setDeload",
] as const;

/** A `JSONValue` member: the key must be there; `null` is a value like any other. */
function decodeJSONValue(object: JSONObject, key: string): JSONValue {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    throw new DecodingError("keyNotFound", `No value associated with key "${key}".`);
  }
  return object[key];
}

/** `decodeIfPresent(JSONValue.self, forKey:) ?? .null`. */
function decodeJSONValueIfPresent(object: JSONObject, key: string): JSONValue {
  const value = Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
  return value === undefined ? null : value;
}

/** A `Date` under `.iso8601`, as current Foundation reads it. */
function decodeISODate(json: JSONValue): Date {
  const string = decodeString(json);
  const date = parseISO8601Internet(string);
  if (!date) throw new DecodingError("dataCorrupted", "Expected date string to be ISO8601-formatted.");
  return date;
}

export const StateChange = {
  /** `init(_ kind:createdAt:id:)`. */
  make(kind: StateChange_Kind, a: { createdAt?: Date; id?: string } = {}): StateChange {
    return { id: a.id ?? uuid(), createdAt: a.createdAt ?? new Date(), kind };
  },

  upsert(session: TrainingSession, a: { createdAt?: Date } = {}): StateChange {
    return StateChange.make({ kind: "upsertSession", value: LegacyAdapter.jsonValueSession(session) }, { createdAt: a.createdAt });
  },

  /**
   * Corrections to one stored session, recorded as one change so a save
   * either lands whole or stays pending whole.
   */
  correct(corrections: SetCorrection[], a: { sessionID: string; createdAt?: Date }): StateChange {
    return StateChange.make(
      { kind: "correctSessionSets", sessionID: a.sessionID, corrections },
      { createdAt: a.createdAt },
    );
  },

  activeSession(snapshot: ActiveSessionSnapshot | undefined, a: { createdAt?: Date } = {}): StateChange {
    let value: JSONValue = null;
    if (snapshot !== undefined) {
      try {
        value = ActiveSessionSnapshot.encode(snapshot);
      } catch {
        value = null;
      }
    }
    return StateChange.make({ kind: "setActiveSession", value }, { createdAt: a.createdAt });
  },

  /** `init(from:)` under `StateChange.decoder`. Throws `DecodingError` where Swift does. */
  decode(json: JSONValue): StateChange {
    const container = new KeyedContainer(json);
    const object = json as JSONObject;
    const id = container.decodeIfPresent("id", decodeUUID) ?? uuid();
    const createdAt = container.decode("createdAt", decodeISODate);
    const name = container.decode("kind", decodeRaw(KIND_NAMES));
    let kind: StateChange_Kind;
    switch (name) {
      case "upsertSession":
        kind = { kind: "upsertSession", value: decodeJSONValue(object, "session") };
        break;
      case "correctSessionSets":
        kind = {
          kind: "correctSessionSets",
          sessionID: container.decode("sessionID", decodeString),
          corrections: container.decode("corrections", decodeArray(SetCorrection.decode)),
        };
        break;
      case "removeSessionSets":
        kind = {
          kind: "removeSessionSets",
          sessionID: container.decode("sessionID", decodeString),
          removals: container.decode("removals", decodeArray(SetRemoval.decode)),
        };
        break;
      case "removeSession":
        kind = { kind: "removeSession", id: container.decode("targetID", decodeString) };
        break;
      case "setActiveSession":
        kind = { kind: "setActiveSession", value: decodeJSONValueIfPresent(object, "snapshot") };
        break;
      case "addPainFlag":
        kind = { kind: "addPainFlag", value: container.decode("flag", PainFlag.decode) };
        break;
      case "removePainFlag":
        kind = { kind: "removePainFlag", id: container.decode("targetID", decodeString) };
        break;
      case "addProgramReplacement":
        kind = { kind: "addProgramReplacement", value: container.decode("replacement", ProgramReplacement.decode) };
        break;
      case "removeProgramReplacement":
        kind = { kind: "removeProgramReplacement", id: container.decode("targetID", decodeString) };
        break;
      case "addCustomExercise":
        kind = { kind: "addCustomExercise", value: container.decode("exercise", CustomExercise.decode) };
        break;
      case "upsertCustomWorkout":
        kind = { kind: "upsertCustomWorkout", value: container.decode("workout", CustomWorkout.decode) };
        break;
      case "removeCustomWorkout":
        kind = { kind: "removeCustomWorkout", id: container.decode("targetID", decodeString) };
        break;
      case "hideWarmup":
        kind = { kind: "hideWarmup", exerciseID: container.decode("exerciseID", decodeString) };
        break;
      case "setFavoriteExercise":
        kind = {
          kind: "setFavoriteExercise",
          exerciseID: container.decode("exerciseID", decodeString),
          isFavorite: container.decode("isFavorite", decodeBool),
        };
        break;
      case "setScheduleDay":
        kind = {
          kind: "setScheduleDay",
          key: container.decode("scheduleKey", decodeString),
          dayID: container.decode("dayID", decodeString),
        };
        break;
      case "removeScheduleOverride":
        kind = { kind: "removeScheduleOverride", key: container.decode("scheduleKey", decodeString) };
        break;
      case "upsertNutritionEntry":
        kind = { kind: "upsertNutritionEntry", value: decodeJSONValue(object, "entry") };
        break;
      case "removeNutritionEntry":
        kind = { kind: "removeNutritionEntry", id: container.decode("targetID", decodeString) };
        break;
      case "upsertMetric":
        kind = { kind: "upsertMetric", value: decodeJSONValue(object, "metric") };
        break;
      case "setTarget":
        kind = {
          kind: "setTarget",
          field: container.decode("field", decodeString),
          value: container.decode("value", decodeNumber),
        };
        break;
      case "setProgram":
        kind = {
          kind: "setProgram",
          mode: container.decode("mode", decodeString),
          sciencePlanID: container.decodeIfPresent("sciencePlanID", decodeString),
        };
        break;
      case "setExperience":
        kind = { kind: "setExperience", value: container.decode("experience", decodeString) };
        break;
      case "setEquipment":
        kind = {
          kind: "setEquipment",
          plates: container.decode("plates", decodeArray(decodeNumber)),
          barKg: container.decode("barKg", decodeNumber),
        };
        break;
      case "setDeload":
        kind = { kind: "setDeload", value: decodeJSONValueIfPresent(object, "deload") };
        break;
    }
    return { id, createdAt, kind };
  },

  /** `encode(to:)` under `StateChange.encoder` (`.iso8601`: whole seconds, UTC). */
  encode(self: StateChange): JSONObject {
    const object: JSONObject = { id: self.id, createdAt: iso8601Seconds(self.createdAt) };
    const kind = self.kind;
    switch (kind.kind) {
      case "upsertSession":
        object["kind"] = "upsertSession";
        object["session"] = kind.value;
        break;
      case "correctSessionSets":
        object["kind"] = "correctSessionSets";
        object["sessionID"] = kind.sessionID;
        object["corrections"] = kind.corrections.map((correction) => SetCorrection.encode(correction));
        break;
      case "removeSessionSets":
        object["kind"] = "removeSessionSets";
        object["sessionID"] = kind.sessionID;
        object["removals"] = kind.removals.map((removal) => SetRemoval.encode(removal));
        break;
      case "setActiveSession":
        object["kind"] = "setActiveSession";
        object["snapshot"] = kind.value;
        break;
      case "addPainFlag":
        object["kind"] = "addPainFlag";
        object["flag"] = PainFlag.encode(kind.value);
        break;
      case "removePainFlag":
        object["kind"] = "removePainFlag";
        object["targetID"] = kind.id;
        break;
      case "addProgramReplacement":
        object["kind"] = "addProgramReplacement";
        object["replacement"] = ProgramReplacement.encode(kind.value);
        break;
      case "removeProgramReplacement":
        object["kind"] = "removeProgramReplacement";
        object["targetID"] = kind.id;
        break;
      case "addCustomExercise":
        object["kind"] = "addCustomExercise";
        object["exercise"] = CustomExercise.encode(kind.value);
        break;
      case "upsertCustomWorkout":
        object["kind"] = "upsertCustomWorkout";
        object["workout"] = CustomWorkout.encode(kind.value);
        break;
      case "removeCustomWorkout":
        object["kind"] = "removeCustomWorkout";
        object["targetID"] = kind.id;
        break;
      case "hideWarmup":
        object["kind"] = "hideWarmup";
        object["exerciseID"] = kind.exerciseID;
        break;
      case "setFavoriteExercise":
        object["kind"] = "setFavoriteExercise";
        object["exerciseID"] = kind.exerciseID;
        object["isFavorite"] = kind.isFavorite;
        break;
      case "setScheduleDay":
        object["kind"] = "setScheduleDay";
        object["scheduleKey"] = kind.key;
        object["dayID"] = kind.dayID;
        break;
      case "removeScheduleOverride":
        object["kind"] = "removeScheduleOverride";
        object["scheduleKey"] = kind.key;
        break;
      case "upsertNutritionEntry":
        object["kind"] = "upsertNutritionEntry";
        object["entry"] = kind.value;
        break;
      case "removeSession":
        object["kind"] = "removeSession";
        object["targetID"] = kind.id;
        break;
      case "removeNutritionEntry":
        object["kind"] = "removeNutritionEntry";
        object["targetID"] = kind.id;
        break;
      case "upsertMetric":
        object["kind"] = "upsertMetric";
        object["metric"] = kind.value;
        break;
      case "setTarget":
        object["kind"] = "setTarget";
        object["field"] = kind.field;
        object["value"] = kind.value;
        break;
      case "setProgram":
        object["kind"] = "setProgram";
        object["mode"] = kind.mode;
        if (kind.sciencePlanID !== undefined) object["sciencePlanID"] = kind.sciencePlanID;
        break;
      case "setExperience":
        object["kind"] = "setExperience";
        object["experience"] = kind.value;
        break;
      case "setEquipment":
        object["kind"] = "setEquipment";
        object["plates"] = [...kind.plates];
        object["barKg"] = kind.barKg;
        break;
      case "setDeload":
        object["kind"] = "setDeload";
        object["deload"] = kind.value;
        break;
    }
    return object;
  },

  /** `StateChange.encoder.encode(changes)`: how pending changes are stored on the device. */
  encodeList(changes: readonly StateChange[]): string {
    return JSON.stringify(changes.map((change) => StateChange.encode(change)));
  },

  /** `StateChange.decoder.decode([StateChange].self, from:)`. Throws where Swift does. */
  decodeList(text: string): StateChange[] {
    const json = JSON.parse(text) as JSONValue;
    return decodeArray(StateChange.decode)(json);
  },
};
