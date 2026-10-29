import { CustomWorkout } from "../Domain/CustomWorkout";
import { PainFlag } from "../Domain/PainFlag";
import { CustomExercise, ProgramReplacement } from "../Domain/Substitution";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import { JSONValue, type JSONObject } from "../Legacy/JSONValue";
import { LegacyState } from "../Legacy/LegacyState";
import { SetCorrection, type SetRemoval } from "./SetCorrection";
import type { StateChange } from "./StateChange";

/**
 * Applies iOS changes to the latest stored state without destroying what
 * another client wrote.
 *
 * Both clients follow one loop: fetch the latest stored state, apply only
 * their own changes to it, write it back only if nobody wrote in between, and
 * otherwise fetch again and reapply. This is the "apply" step for iOS. The web
 * app implements the same rules in `lib/state-merge.ts`, and both are tested
 * against the shared scenarios in `tests/fixtures/sync`.
 *
 * The rules that keep deletion honest:
 * - A key or field iOS does not write is never removed by it.
 * - An explicit `null` clears a value; a missing value never does.
 * - A change made before a deletion (a tombstone) or before an explicit reset
 *   of the account loses to it. A change made after it wins.
 *
 * Swift's `inout [String: JSONValue]` becomes a raw object owned by one
 * `apply` call: it is a copy of the state's top level, and every nested
 * value is replaced, never edited, so nothing the caller holds is touched.
 */

type Raw = JSONObject;

const hasOwn = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

/** `value["id"]?.stringValue`. */
const idOf = (value: JSONValue | undefined) => JSONValue.stringValue(JSONValue.get(value, "id"));

/** A Codable list item, as `LegacyAdapter.decodeValue` / `jsonValue` handle it. */
interface ListCodec<Item> {
  decode(json: JSONValue): Item;
  encode(item: Item): JSONValue;
}

/** `[String] → Set → sorted()`, Swift's ordering of plain strings. */
function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export const StateMerge = {
  tombstonesKey: "syncTombstones",
  resetKey: "syncReset",

  /** Session fields iOS writes, and therefore owns when it rewrites a session. */
  sessionFields: new Set<string>([
    "id",
    "date",
    "dayId",
    "dayLabel",
    "completion",
    "results",
    "sessionType",
    "durationSeconds",
    "note",
    "iosPlannedSetCount",
    "iosCompletedSetCount",
  ]),
  resultFields: new Set<string>(["exerciseId", "name", "sets"]),
  setFields: new Set<string>([
    "weight",
    "reps",
    "pausedReps",
    "pauseSeconds",
    "pauseEnabled",
    "rir",
    "isWarmup",
    "partialReps",
    "substitutedFrom",
    "origin",
    "side",
    "failed",
    "drops",
    "repsLeft",
    "repsRight",
  ]),
  /**
   * Counts derived from a session's results. They stop describing the
   * session once it holds results iOS did not write.
   */
  derivedSessionFields: ["iosPlannedSetCount", "iosCompletedSetCount"],

  apply(changes: readonly StateChange[], a: { to: LegacyState; now?: Date }): LegacyState {
    const now = a.now ?? new Date();
    let raw: Raw = { ...a.to.raw };
    for (const change of changes) raw = StateMerge.applyChange(change, raw, now);
    return LegacyState.make({ raw });
  },

  /** When the account was explicitly wiped, if it was. */
  resetDate(raw: Raw): Date | undefined {
    const at = JSONValue.stringValue(JSONValue.get(raw[StateMerge.resetKey], "at"));
    return at === undefined ? undefined : LegacyAdapter.isoDate(at);
  },

  /** `apply(_ change:to:now:)` on one raw object, returned changed. */
  applyChange(change: StateChange, input: Raw, now: Date): Raw {
    const reset = StateMerge.resetDate(input);
    if (reset !== undefined && change.createdAt.getTime() < reset.getTime()) return input;
    let raw: Raw = { ...input };

    const kind = change.kind;
    switch (kind.kind) {
      case "upsertSession":
        raw = StateMerge.upsertSession(kind.value, { createdAt: change.createdAt, into: raw });
        break;

      case "correctSessionSets":
        raw = StateMerge.correctSessionSets({ sessionID: kind.sessionID, corrections: kind.corrections, into: raw });
        break;

      case "removeSessionSets":
        raw = StateMerge.removeSessionSets({ sessionID: kind.sessionID, removals: kind.removals, into: raw });
        break;

      case "removeSession":
        // The same tombstone the web app writes when it deletes one.
        raw = StateMerge.removeItem(kind.id, { in: raw, collection: "sessions", at: change.createdAt });
        break;

      case "setActiveSession":
        raw[LegacyAdapter.activeSessionKey] = kind.value;
        break;

      case "addPainFlag": {
        const flag = kind.value;
        raw = StateMerge.updateList(raw, { key: LegacyAdapter.painFlagsKey, as: PainFlag }, (flags) =>
          PainFlag.active(
            [...flags.filter((item) => PainFlag.id(item) !== PainFlag.id(flag)), flag],
            { on: now },
          ),
        );
        break;
      }

      case "removePainFlag": {
        const id = kind.id;
        raw = StateMerge.updateList(raw, { key: LegacyAdapter.painFlagsKey, as: PainFlag }, (flags) =>
          PainFlag.active(
            flags.filter((item) => PainFlag.id(item) !== id),
            { on: now },
          ),
        );
        break;
      }

      case "addProgramReplacement": {
        const replacement = kind.value;
        raw = StateMerge.updateList(raw, { key: LegacyAdapter.replacementsKey, as: ProgramReplacement }, (list) => [
          ...list.filter((item) => ProgramReplacement.id(item) !== ProgramReplacement.id(replacement)),
          replacement,
        ]);
        break;
      }

      case "removeProgramReplacement": {
        const id = kind.id;
        raw = StateMerge.updateList(raw, { key: LegacyAdapter.replacementsKey, as: ProgramReplacement }, (list) =>
          list.filter((item) => ProgramReplacement.id(item) !== id),
        );
        break;
      }

      case "addCustomExercise": {
        const exercise = kind.value;
        raw = StateMerge.updateList(raw, { key: LegacyAdapter.customExercisesKey, as: CustomExercise }, (list) =>
          list.some((item) => item.id === exercise.id) ? list : [...list, exercise],
        );
        break;
      }

      case "upsertCustomWorkout": {
        const workout = kind.value;
        raw = StateMerge.updateList(raw, { key: LegacyAdapter.customWorkoutsKey, as: CustomWorkout }, (list) => {
          const index = list.findIndex((item) => item.id === workout.id);
          if (index !== -1) {
            const copy = [...list];
            copy[index] = workout;
            return copy;
          }
          return [...list, workout];
        });
        break;
      }

      case "removeCustomWorkout": {
        const id = kind.id;
        raw = StateMerge.updateList(raw, { key: LegacyAdapter.customWorkoutsKey, as: CustomWorkout }, (list) =>
          list.filter((item) => item.id !== id),
        );
        break;
      }

      case "hideWarmup": {
        const hidden = new Set(
          (JSONValue.arrayValue(raw[LegacyAdapter.hiddenWarmupsKey]) ?? []).flatMap((value) => {
            const string = JSONValue.stringValue(value);
            return string === undefined ? [] : [string];
          }),
        );
        hidden.add(kind.exerciseID);
        raw[LegacyAdapter.hiddenWarmupsKey] = sortedStrings(hidden);
        break;
      }

      case "setFavoriteExercise": {
        // One exercise, added or taken out of the list — never the list
        // rewritten, so a star set on another device survives this one.
        const favorites = new Set(
          (JSONValue.arrayValue(raw[LegacyAdapter.favoriteExercisesKey]) ?? []).flatMap((value) => {
            const string = JSONValue.stringValue(value);
            return string === undefined ? [] : [string];
          }),
        );
        if (kind.isFavorite) favorites.add(kind.exerciseID);
        else favorites.delete(kind.exerciseID);
        raw[LegacyAdapter.favoriteExercisesKey] = sortedStrings(favorites);
        break;
      }

      case "setScheduleDay": {
        // One date, never the map: a day the web moved stays moved.
        const overrides: JSONObject = { ...(JSONValue.objectValue(raw["scheduleOverrides"]) ?? {}) };
        overrides[kind.key] = kind.dayID;
        raw["scheduleOverrides"] = overrides;
        break;
      }

      case "removeScheduleOverride": {
        // Explicit: this date goes back to the program's default week.
        // A date nobody mentions is never removed by any of this.
        const stored = JSONValue.objectValue(raw["scheduleOverrides"]);
        if (stored === undefined) return input;
        const overrides: JSONObject = { ...stored };
        delete overrides[kind.key];
        raw["scheduleOverrides"] = overrides;
        break;
      }

      case "upsertNutritionEntry":
        raw = StateMerge.upsertItem(kind.value, {
          in: raw,
          collection: "nutritionEntries",
          fields: StateMerge.nutritionFields,
          createdAt: change.createdAt,
        });
        break;

      case "removeNutritionEntry":
        raw = StateMerge.removeItem(kind.id, { in: raw, collection: "nutritionEntries", at: change.createdAt });
        break;

      case "upsertMetric":
        // A weigh-in is one row among the account's own: the day's entry is
        // written again by its id, and every other weigh-in stays as
        // stored — including a waist the web app measured, which is not a
        // field this client owns.
        raw = StateMerge.upsertItem(kind.value, {
          in: raw,
          collection: "metrics",
          fields: StateMerge.metricFields,
          createdAt: change.createdAt,
        });
        break;

      case "setProgram":
        // Which programme the account is on, and nothing more. The plan it
        // edited itself is left exactly as the web app wrote it, because a
        // science programme is not stored in `plan` at all — and switching
        // back has to find that plan intact.
        raw["planMode"] = kind.mode;
        if (kind.sciencePlanID !== undefined) raw["sciencePlanId"] = kind.sciencePlanID;
        break;

      case "setExperience":
        // One key. The web app does not read it yet and must not lose it:
        // a key nobody mentions is a key nobody deletes.
        raw["experienceLevel"] = kind.value;
        break;

      case "setEquipment":
        raw["plates"] = [...kind.plates];
        raw["barWeightKg"] = kind.barKg;
        break;

      case "setDeload":
        // A lighter week, or `null` to end one early. iOS's own key.
        raw[LegacyAdapter.deloadKey] = kind.value;
        break;

      case "setTarget": {
        // One field. Targets the app does not model stay as they are.
        const targets: JSONObject = { ...(JSONValue.objectValue(raw["targets"]) ?? {}) };
        targets[kind.field] = kind.value;
        raw["targets"] = targets;
        break;
      }
    }
    return raw;
  },

  // MARK: - Sessions

  upsertSession(session: JSONValue, a: { createdAt: Date; into: Raw }): Raw {
    const incoming = JSONValue.objectValue(session);
    const id = idOf(incoming ?? undefined);
    if (incoming === undefined || id === undefined) return a.into;
    const raw: Raw = { ...a.into };

    const tombstones: JSONObject = { ...(JSONValue.objectValue(raw[StateMerge.tombstonesKey]) ?? {}) };
    const deleted: JSONObject = { ...(JSONValue.objectValue(tombstones["sessions"]) ?? {}) };
    const deletedText = JSONValue.stringValue(deleted[id]);
    const deletedAt = deletedText === undefined ? undefined : LegacyAdapter.isoDate(deletedText);
    if (deletedAt !== undefined) {
      // Changed before someone deleted it: it stays deleted.
      if (!(a.createdAt.getTime() >= deletedAt.getTime())) return a.into;
      // Logged again after the deletion: that is a new decision.
      delete deleted[id];
      if (Object.keys(deleted).length === 0) {
        delete tombstones["sessions"];
      } else {
        tombstones["sessions"] = deleted;
      }
      raw[StateMerge.tombstonesKey] = tombstones;
    }

    const sessions = [...(JSONValue.arrayValue(raw["sessions"]) ?? [])];
    const index = sessions.findIndex((value) => idOf(value) === id);
    const stored = index === -1 ? undefined : JSONValue.objectValue(sessions[index]);
    if (index !== -1 && stored !== undefined) {
      sessions[index] = StateMerge.mergeSession(incoming, { over: stored });
    } else {
      sessions.unshift(incoming);
    }
    raw["sessions"] = sessions;
    return raw;
  },

  /**
   * Corrections to sets already logged, applied where they were logged.
   *
   * Unlike an upsert, this never rewrites a session's results: it reaches
   * the named sets and changes only the values a set carries. A session
   * that is not stored — never written here, or deleted meanwhile — is left
   * alone rather than recreated, and a set that has moved or is no longer
   * there is skipped rather than guessed at. Missing is never a deletion.
   */
  correctSessionSets(a: { sessionID: string; corrections: SetCorrection[]; into: Raw }): Raw {
    const sessions = [...(JSONValue.arrayValue(a.into["sessions"]) ?? [])];
    const sessionIndex = sessions.findIndex((value) => idOf(value) === a.sessionID);
    if (sessionIndex === -1) return a.into;
    const storedSession = JSONValue.objectValue(sessions[sessionIndex]);
    if (storedSession === undefined) return a.into;
    const session: JSONObject = { ...storedSession };

    const results = [...(JSONValue.arrayValue(session["results"]) ?? [])];
    let corrected = false;

    for (const correction of a.corrections) {
      if (!SetCorrection.isLogged(correction)) continue;

      const matches = results.flatMap((result, index) =>
        JSONValue.stringValue(JSONValue.get(result, "exerciseId")) === correction.exerciseID ? [index] : [],
      );
      if (!(correction.occurrence >= 0 && correction.occurrence < matches.length)) continue;
      const resultIndex = matches[correction.occurrence];

      const storedResult = JSONValue.objectValue(results[resultIndex]);
      if (storedResult === undefined) continue;
      const storedSets = JSONValue.arrayValue(storedResult["sets"]);
      if (storedSets === undefined) continue;
      if (!(correction.setIndex >= 0 && correction.setIndex < storedSets.length)) continue;
      const storedSet = JSONValue.objectValue(storedSets[correction.setIndex]);
      if (storedSet === undefined) continue;

      const sets = [...storedSets];
      sets[correction.setIndex] = SetCorrection.applied(correction, { to: storedSet });
      results[resultIndex] = { ...storedResult, sets };
      corrected = true;
    }

    if (!corrected) return a.into;
    session["results"] = results;
    sessions[sessionIndex] = session;
    return { ...a.into, sessions };
  },

  /**
   * Takes named sets out of one stored session.
   *
   * Indices are the ones the reader saw, so the removals are applied from
   * the back of each result forward: taking set 1 out first would move set
   * 2 under the finger that asked for it. A result left with no sets is
   * dropped, and a session left with no results is dropped too — a workout
   * with nothing in it would still count as a trained day everywhere that
   * reads the list.
   *
   * The set counts iOS derives from the results go, exactly as they do
   * when any other client rewrites them: a count that no longer matches
   * the sets is worse than no count, and the history falls back to the
   * percentage the session stored.
   */
  removeSessionSets(a: { sessionID: string; removals: SetRemoval[]; into: Raw }): Raw {
    const sessions = [...(JSONValue.arrayValue(a.into["sessions"]) ?? [])];
    const sessionIndex = sessions.findIndex((value) => idOf(value) === a.sessionID);
    if (sessionIndex === -1) return a.into;
    const storedSession = JSONValue.objectValue(sessions[sessionIndex]);
    if (storedSession === undefined) return a.into;
    const session: JSONObject = { ...storedSession };

    let results = [...(JSONValue.arrayValue(session["results"]) ?? [])];
    let removed = false;

    // Highest index first, inside each result.
    for (const removal of [...a.removals].sort((x, y) => y.setIndex - x.setIndex)) {
      const matches = results.flatMap((result, index) =>
        JSONValue.stringValue(JSONValue.get(result, "exerciseId")) === removal.exerciseID ? [index] : [],
      );
      if (!(removal.occurrence >= 0 && removal.occurrence < matches.length)) continue;
      const resultIndex = matches[removal.occurrence];

      const storedResult = JSONValue.objectValue(results[resultIndex]);
      if (storedResult === undefined) continue;
      const storedSets = JSONValue.arrayValue(storedResult["sets"]);
      if (storedSets === undefined) continue;
      if (!(removal.setIndex >= 0 && removal.setIndex < storedSets.length)) continue;

      const sets = [...storedSets];
      sets.splice(removal.setIndex, 1);
      results[resultIndex] = { ...storedResult, sets };
      removed = true;
    }

    if (!removed) return a.into;

    results = results.filter((result) => (JSONValue.arrayValue(JSONValue.get(result, "sets")) ?? []).length > 0);

    if (results.length === 0) {
      sessions.splice(sessionIndex, 1);
      return { ...a.into, sessions };
    }

    session["results"] = results;
    for (const field of StateMerge.derivedSessionFields) delete session[field];
    sessions[sessionIndex] = session;
    return { ...a.into, sessions };
  },

  /**
   * iOS's version of a session laid over the stored one.
   *
   * Fields iOS writes come from iOS. Everything else on the session, on
   * each exercise result and on each set is kept. Exercises already logged
   * in this session that iOS did not log again are kept too — the same rule
   * the web app follows when a day is re-logged.
   */
  mergeSession(incoming: JSONObject, a: { over: JSONObject }): JSONObject {
    const stored = a.over;
    const merged: JSONObject = { ...incoming };
    for (const [key, value] of Object.entries(stored)) {
      if (!StateMerge.sessionFields.has(key) && !hasOwn(merged, key)) merged[key] = value;
    }

    const incomingResults = JSONValue.arrayValue(incoming["results"]) ?? [];
    const storedResults = JSONValue.arrayValue(stored["results"]) ?? [];
    const incomingExercises = new Set(
      incomingResults.flatMap((result) => {
        const exercise = JSONValue.stringValue(JSONValue.get(result, "exerciseId"));
        return exercise === undefined ? [] : [exercise];
      }),
    );
    const claimed = new Set<number>();

    const results: JSONValue[] = incomingResults.map((result) => {
      const incomingResult = JSONValue.objectValue(result);
      if (incomingResult === undefined) return result;
      const exercise = JSONValue.stringValue(incomingResult["exerciseId"]);
      if (exercise === undefined) return result;
      const match = storedResults.findIndex(
        (value, index) => !claimed.has(index) && JSONValue.stringValue(JSONValue.get(value, "exerciseId")) === exercise,
      );
      if (match === -1) return result;
      const storedResult = JSONValue.objectValue(storedResults[match]);
      if (storedResult === undefined) return result;
      claimed.add(match);

      const object: JSONObject = { ...incomingResult };
      for (const [key, value] of Object.entries(storedResult)) {
        if (!StateMerge.resultFields.has(key) && !hasOwn(object, key)) object[key] = value;
      }
      const sets = JSONValue.arrayValue(object["sets"]);
      if (sets !== undefined) {
        const storedSets = JSONValue.arrayValue(storedResult["sets"]) ?? [];
        object["sets"] = sets.map((set, index) => {
          const setObject = JSONValue.objectValue(set);
          if (setObject === undefined || !(index < storedSets.length)) return set;
          const storedSet = JSONValue.objectValue(storedSets[index]);
          if (storedSet === undefined) return set;
          const mergedSet: JSONObject = { ...setObject };
          for (const [key, value] of Object.entries(storedSet)) {
            if (!StateMerge.setFields.has(key) && !hasOwn(mergedSet, key)) mergedSet[key] = value;
          }
          return mergedSet;
        });
      }
      return object;
    });

    const kept = storedResults.flatMap((value, index) => {
      if (claimed.has(index)) return [];
      const exercise = JSONValue.stringValue(JSONValue.get(value, "exerciseId"));
      if (exercise === undefined) return [index];
      return incomingExercises.has(exercise) ? [] : [index];
    });
    if (kept.length > 0) {
      results.push(...kept.map((index) => storedResults[index]));
      for (const field of StateMerge.derivedSessionFields) delete merged[field];
    }
    merged["results"] = results;
    return merged;
  },

  // MARK: - Shared collections, by id

  /**
   * What a weigh-in is made of here. `waist` is deliberately absent: the
   * web app measures it, this app does not, and a field a client does not
   * own is carried through untouched.
   */
  metricFields: new Set<string>(["id", "date", "weight"]),

  /** The fields a meal carries, and therefore the ones iOS may rewrite. */
  nutritionFields: new Set<string>(["id", "date", "meal", "name", "calories", "protein", "carbs", "fat"]),

  /**
   * Writes one item into a shared collection without touching its
   * neighbours, and without resurrecting something already deleted.
   */
  upsertItem(item: JSONValue, a: { in: Raw; collection: string; fields: Set<string>; createdAt: Date }): Raw {
    const incoming = JSONValue.objectValue(item);
    const id = idOf(incoming ?? undefined);
    if (incoming === undefined || id === undefined) return a.in;
    const ranked = StateMerge.isOutrankedByDeletion({ id, collection: a.collection, createdAt: a.createdAt, in: a.in });
    if (ranked.outranked) return a.in;
    const raw: Raw = { ...ranked.raw };

    const items = [...(JSONValue.arrayValue(raw[a.collection]) ?? [])];
    const index = items.findIndex((value) => idOf(value) === id);
    const stored = index === -1 ? undefined : JSONValue.objectValue(items[index]);
    if (index !== -1 && stored !== undefined) {
      const merged: JSONObject = { ...incoming };
      for (const [key, value] of Object.entries(stored)) {
        if (!a.fields.has(key) && !hasOwn(merged, key)) merged[key] = value;
      }
      items[index] = merged;
    } else {
      // Appended, because the web app appends: a day's food reads in the
      // order it was eaten on both clients or on neither.
      items.push(incoming);
    }
    raw[a.collection] = items;
    return raw;
  },

  /**
   * Removes one item and records the deletion, so a client still holding an
   * older copy cannot put it back.
   */
  removeItem(id: string, a: { in: Raw; collection: string; at: Date }): Raw {
    const raw: Raw = { ...a.in };
    raw[a.collection] = (JSONValue.arrayValue(raw[a.collection]) ?? []).filter((value) => idOf(value) !== id);

    const tombstones: JSONObject = { ...(JSONValue.objectValue(raw[StateMerge.tombstonesKey]) ?? {}) };
    const deleted: JSONObject = { ...(JSONValue.objectValue(tombstones[a.collection]) ?? {}) };
    deleted[id] = LegacyAdapter.isoString(a.at);
    tombstones[a.collection] = deleted;
    raw[StateMerge.tombstonesKey] = tombstones;
    return raw;
  },

  /**
   * A change made before someone deleted the item loses to the deletion;
   * one made after it is a new decision and clears the record.
   *
   * Swift's `inout raw` comes back as `raw`, changed only when the record
   * was cleared.
   */
  isOutrankedByDeletion(a: { id: string; collection: string; createdAt: Date; in: Raw }): { outranked: boolean; raw: Raw } {
    const tombstones: JSONObject = { ...(JSONValue.objectValue(a.in[StateMerge.tombstonesKey]) ?? {}) };
    const deleted: JSONObject = { ...(JSONValue.objectValue(tombstones[a.collection]) ?? {}) };
    const deletedText = JSONValue.stringValue(deleted[a.id]);
    const deletedAt = deletedText === undefined ? undefined : LegacyAdapter.isoDate(deletedText);
    if (deletedAt === undefined) return { outranked: false, raw: a.in };
    if (!(a.createdAt.getTime() >= deletedAt.getTime())) return { outranked: true, raw: a.in };

    delete deleted[a.id];
    if (Object.keys(deleted).length === 0) {
      delete tombstones[a.collection];
    } else {
      tombstones[a.collection] = deleted;
    }
    return { outranked: false, raw: { ...a.in, [StateMerge.tombstonesKey]: tombstones } };
  },

  // MARK: - iOS-owned lists

  /**
   * Edits a stored list by identity. Entries this build cannot read are
   * kept exactly as they are.
   */
  updateList<Item>(raw: Raw, a: { key: string; as: ListCodec<Item> }, update: (items: Item[]) => Item[]): Raw {
    const items: Item[] = [];
    const unreadable: JSONValue[] = [];
    for (const entry of JSONValue.arrayValue(raw[a.key]) ?? []) {
      let item: Item | undefined;
      try {
        item = a.as.decode(entry);
      } catch {
        item = undefined;
      }
      if (item !== undefined) items.push(item);
      else unreadable.push(entry);
    }
    const updated = update(items);
    const encoded = updated.flatMap((item) => {
      try {
        return [a.as.encode(item)];
      } catch {
        return [];
      }
    });
    return { ...raw, [a.key]: [...encoded, ...unreadable] };
  },
};
