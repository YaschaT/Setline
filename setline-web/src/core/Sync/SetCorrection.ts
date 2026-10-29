import type { LoggedSet, TrainingSession } from "../Domain/Model";
import type { JSONObject, JSONValue } from "../Legacy/JSONValue";
import { JSONValue as JSON_ } from "../Legacy/JSONValue";
import { decodeBool, decodeInt, decodeNumber, decodeString, KeyedContainer } from "../Support/codable";
import { decimalDescription } from "../Support/sync";

// One logged set, corrected after the fact.
//
// A correction carries only the values a set was logged with, and names the
// set by the only identity the shared wire format has: the session's id, the
// exercise result inside it, and the set's place in that result's list. Sets
// have no id on the wire — `LoggedSet.id` is minted while parsing and is
// gone on the next read — so position is what both clients agree on, and it
// is what `StateMerge` already uses to keep a set's unknown fields.
//
// Nothing else about the set is touched: whether it was a warm-up, what it
// stood in for, whether the program prescribed it or the session added it,
// and any field a newer client wrote all stay exactly as stored.

/**
 * One set to take out of a stored session.
 *
 * Named exactly the way a correction names one — the exercise it was logged
 * under, which result that is when a session holds the same exercise twice,
 * and its place in that result — so removing a set and correcting one speak
 * the same language about where a set sits.
 */
export interface SetRemoval {
  readonly exerciseID: string;
  readonly occurrence: number;
  readonly setIndex: number;
}

export const SetRemoval = {
  make(a: { exerciseID: string; occurrence?: number; setIndex: number }): SetRemoval {
    return { exerciseID: a.exerciseID, occurrence: a.occurrence ?? 0, setIndex: a.setIndex };
  },

  /** Synthesized `Encodable`. */
  encode(self: SetRemoval): JSONObject {
    return { exerciseID: self.exerciseID, occurrence: self.occurrence, setIndex: self.setIndex };
  },

  /** Synthesized `Decodable`: every key is required. */
  decode(json: JSONValue): SetRemoval {
    const container = new KeyedContainer(json);
    return {
      exerciseID: container.decode("exerciseID", decodeString),
      occurrence: container.decode("occurrence", decodeInt),
      setIndex: container.decode("setIndex", decodeInt),
    };
  },
};

export interface SetCorrection {
  /** The exercise the set was logged under, as the session stored it. */
  readonly exerciseID: string;
  /**
   * Which result with that exercise id, when a session holds more than one
   * (a swap back to an exercise already done). Zero for the first.
   */
  readonly occurrence: number;
  /** The set's place in that result's list. */
  readonly setIndex: number;

  readonly weightKg: number;
  readonly reps: number;
  readonly rirReported?: number;
  readonly pausedReps?: number;
  readonly partialReps?: number;
  readonly pauseEnabled: boolean;
  readonly pauseSeconds?: number;
}

function makeCorrection(a: {
  exerciseID: string;
  occurrence?: number;
  setIndex: number;
  weightKg: number;
  reps: number;
  rirReported?: number;
  pausedReps?: number;
  partialReps?: number;
  pauseEnabled?: boolean;
  pauseSeconds?: number;
}): SetCorrection {
  return {
    exerciseID: a.exerciseID,
    occurrence: a.occurrence ?? 0,
    setIndex: a.setIndex,
    weightKg: a.weightKg,
    reps: a.reps,
    rirReported: a.rirReported,
    pausedReps: a.pausedReps,
    partialReps: a.partialReps,
    pauseEnabled: a.pauseEnabled ?? false,
    pauseSeconds: a.pauseSeconds,
  };
}

export const SetCorrection = {
  /**
   * `init(exerciseID:occurrence:setIndex:weightKg:reps:…)`, and
   * `init(exerciseID:occurrence:setIndex:set:)` — the set as it now reads,
   * for a set already stored in that session.
   */
  make: ((a: Parameters<typeof makeCorrection>[0] | { exerciseID: string; occurrence?: number; setIndex: number; set: LoggedSet }) => {
    if ("set" in a) {
      const set = a.set;
      return makeCorrection({
        exerciseID: a.exerciseID,
        occurrence: a.occurrence ?? 0,
        setIndex: a.setIndex,
        weightKg: set.weightKg ?? 0,
        reps: set.reps,
        rirReported: set.rirReported,
        pausedReps: set.pausedReps,
        partialReps: set.partialReps,
        pauseEnabled: set.modifiers.pauseEnabled,
        pauseSeconds: set.modifiers.pauseSeconds,
      });
    }
    return makeCorrection(a);
  }) as {
    (a: Parameters<typeof makeCorrection>[0]): SetCorrection;
    (a: { exerciseID: string; occurrence?: number; setIndex: number; set: LoggedSet }): SetCorrection;
  },

  /**
   * A stored set is a logged set: history holds what was performed, so a
   * correction may change what a set says and never whether it happened.
   * Removing a set is a deletion, which this operation deliberately is not.
   */
  isLogged(self: SetCorrection): boolean {
    return self.weightKg > 0 && self.reps > 0;
  },

  /**
   * The corrected values laid over the set as stored, in the same shapes
   * the app writes a set with. Keys neither client's set model owns are
   * left untouched; `rir` and `partialReps` are removed when the
   * correction clears them, because absent is how both clients read "none".
   */
  applied(self: SetCorrection, a: { to: JSONObject }): JSONObject {
    const object: JSONObject = { ...a.to };
    object["weight"] = decimalDescription(self.weightKg);
    object["reps"] = `${self.reps}`;
    object["pausedReps"] = self.pausedReps === undefined ? "" : `${self.pausedReps}`;
    object["pauseSeconds"] = self.pauseSeconds === undefined ? "" : `${Math.trunc(self.pauseSeconds)}`;
    object["pauseEnabled"] = self.pauseEnabled;
    if (self.rirReported !== undefined) {
      object["rir"] = self.rirReported;
    } else {
      delete object["rir"];
    }
    if (self.partialReps !== undefined && self.partialReps > 0) {
      object["partialReps"] = self.partialReps;
    } else {
      delete object["partialReps"];
    }
    // Reps per side that no longer match the corrected reps would say two
    // different things about one set: the correction wins.
    const left = JSON_.intValue(object["repsLeft"]);
    const right = JSON_.intValue(object["repsRight"]);
    if (left !== undefined && right !== undefined && Math.min(left, right) !== self.reps) {
      delete object["repsLeft"];
      delete object["repsRight"];
    }
    return object;
  },

  /** Synthesized `Encodable`: optionals left out when nil. */
  encode(self: SetCorrection): JSONObject {
    const object: JSONObject = {
      exerciseID: self.exerciseID,
      occurrence: self.occurrence,
      setIndex: self.setIndex,
      weightKg: self.weightKg,
      reps: self.reps,
    };
    if (self.rirReported !== undefined) object["rirReported"] = self.rirReported;
    if (self.pausedReps !== undefined) object["pausedReps"] = self.pausedReps;
    if (self.partialReps !== undefined) object["partialReps"] = self.partialReps;
    object["pauseEnabled"] = self.pauseEnabled;
    if (self.pauseSeconds !== undefined) object["pauseSeconds"] = self.pauseSeconds;
    return object;
  },

  /** Synthesized `Decodable`: every non-optional key is required, defaults included. */
  decode(json: JSONValue): SetCorrection {
    const container = new KeyedContainer(json);
    return {
      exerciseID: container.decode("exerciseID", decodeString),
      occurrence: container.decode("occurrence", decodeInt),
      setIndex: container.decode("setIndex", decodeInt),
      weightKg: container.decode("weightKg", decodeNumber),
      reps: container.decode("reps", decodeInt),
      rirReported: container.decodeIfPresent("rirReported", decodeInt),
      pausedReps: container.decodeIfPresent("pausedReps", decodeInt),
      partialReps: container.decodeIfPresent("partialReps", decodeInt),
      pauseEnabled: container.decode("pauseEnabled", decodeBool),
      pauseSeconds: container.decodeIfPresent("pauseSeconds", decodeNumber),
    };
  },
};

/**
 * Sets added afterwards to one exercise of a saved workout: done, just not
 * logged at the time. They go after the sets already there.
 */
export interface SetAddition {
  readonly exerciseID: string;
  /** Which result with that exercise id; zero for the first. */
  readonly occurrence: number;
  readonly sets: LoggedSet[];
}

export const SetAddition = {
  make(a: { exerciseID: string; occurrence?: number; sets: LoggedSet[] }): SetAddition {
    return { exerciseID: a.exerciseID, occurrence: a.occurrence ?? 0, sets: a.sets };
  },
};

/**
 * `extension TrainingSession { func adding(_:) }`.
 *
 * The workout with the added sets in place, numbered after the sets each
 * exercise already has. An exercise that isn't in the workout is skipped.
 */
export function TrainingSession_adding(self: TrainingSession, additions: SetAddition[]): TrainingSession {
  const results = self.results.map((result) => ({ ...result, sets: [...result.sets] }));
  for (const addition of additions) {
    if (addition.sets.length === 0) continue;
    const matches = results.flatMap((result, index) => (result.exerciseID === addition.exerciseID ? [index] : []));
    if (!(addition.occurrence >= 0 && addition.occurrence < matches.length)) continue;
    const index = matches[addition.occurrence];
    for (const set of addition.sets) {
      results[index].sets.push({ ...set, index: results[index].sets.length });
    }
  }
  return { ...self, results };
}
