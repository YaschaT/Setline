// Port of ios/SetlineCore/Tests/SetlineCoreTests/SetRemovalTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertNil, assertTrue } from "../helpers";
import type { TrainingSession } from "../../src/core/Domain/Model";
import { JSONValue, type JSONObject } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { SetCorrection, SetRemoval } from "../../src/core/Sync/SetCorrection";
import { StateChange } from "../../src/core/Sync/StateChange";
import { StateMerge } from "../../src/core/Sync/StateMerge";
import { SyncQueue } from "../../src/core/Sync/SyncQueue";
import { decimalDescription } from "../../src/core/Support/sync";

/**
 * Taking a set out of a workout that was already saved.
 *
 * A correction rewrites a set; this removes one. Both name a set the same
 * way, and both leave everything else in the account exactly as it was.
 */
describe("SetRemovalTests", () => {
  const set = (weight: string, reps: number): JSONValue => ({
    weight,
    reps: `${reps}`,
    pausedReps: "",
    pauseEnabled: false,
  });

  const state = (a: { results: JSONValue[]; sessionID?: string; extra?: JSONObject }): LegacyState => {
    const session: JSONObject = {
      id: a.sessionID ?? "s-1",
      date: "2026-09-18T17:00:00.000Z",
      dayId: "push",
      dayLabel: "Push",
      completion: 100,
      results: a.results,
      [LegacyAdapter.plannedSetCountKey]: 3,
      [LegacyAdapter.completedSetCountKey]: 3,
    };
    for (const [key, value] of Object.entries(a.extra ?? {})) session[key] = value;
    return LegacyState.make({ raw: { sessions: [session], planMode: "personal" } });
  };

  const bench = (sets: JSONValue[], name = "Bankdrukken", id = "flat-bench"): JSONValue => ({ exerciseId: id, name, sets });

  const sessions = (s: LegacyState): TrainingSession[] => LegacyAdapter.sessions({ from: s });

  const remove = (removals: SetRemoval[], sessionID = "s-1") =>
    StateChange.make({ kind: "removeSessionSets", sessionID, removals });

  /** `"\($0.weightKg ?? 0)×\($0.reps)"`. */
  const label = (s: { weightKg?: number; reps: number }) => `${decimalDescription(s.weightKg ?? 0)}×${s.reps}`;

  // MARK: - One set

  test("testOneSetLeavesAndTheOthersKeepTheirOrder", () => {
    const start = state({ results: [bench([set("100", 8), set("100", 6), set("95", 6)])] });
    const after = StateMerge.apply([remove([SetRemoval.make({ exerciseID: "flat-bench", setIndex: 1 })])], { to: start });

    const result = sessions(after)[0]?.results[0];
    assertTrue(result !== undefined);
    assertEqual(result!.sets.map((s) => s.reps), [8, 6], "the middle set went, the ends stayed");
    assertEqual(result!.sets.map((s) => s.weightKg ?? 0), [100, 95]);
  });

  test("testSeveralSetsGoByTheIndicesTheReaderSaw", () => {
    const start = state({ results: [bench([set("100", 8), set("100", 6), set("95", 6), set("90", 6)])] });
    const after = StateMerge.apply(
      [
        remove([
          SetRemoval.make({ exerciseID: "flat-bench", setIndex: 0 }),
          SetRemoval.make({ exerciseID: "flat-bench", setIndex: 2 }),
        ]),
      ],
      { to: start },
    );

    const result = sessions(after)[0]?.results[0];
    assertTrue(result !== undefined);
    assertEqual(
      result!.sets.map(label),
      ["100×6", "90×6"],
      "removing the first set must not shift the second one out from under the request",
    );
  });

  test("testTheSameExerciseTwiceInOneSessionIsToldApartByOccurrence", () => {
    const start = state({ results: [bench([set("100", 8), set("100", 6)]), bench([set("80", 10)])] });
    const after = StateMerge.apply(
      [remove([SetRemoval.make({ exerciseID: "flat-bench", occurrence: 1, setIndex: 0 })])],
      { to: start },
    );

    const results = sessions(after)[0]?.results;
    assertTrue(results !== undefined);
    assertEqual(results!.length, 1, "the emptied second block went");
    assertEqual(results![0]?.sets.length, 2, "the first block is untouched");
  });

  // MARK: - What goes with it

  test("testAnExerciseLeftWithNoSetsLeavesTheSession", () => {
    const start = state({ results: [bench([set("100", 8)]), bench([set("60", 12)], "Flyes", "pec-fly")] });
    const after = StateMerge.apply([remove([SetRemoval.make({ exerciseID: "pec-fly", setIndex: 0 })])], { to: start });

    const session = sessions(after)[0];
    assertTrue(session !== undefined);
    assertEqual(session!.results.map((result) => result.exerciseID), ["flat-bench"]);
  });

  test("testTheLastSetTakesTheSessionWithIt", () => {
    const start = state({ results: [bench([set("100", 8)])] });
    const after = StateMerge.apply([remove([SetRemoval.make({ exerciseID: "flat-bench", setIndex: 0 })])], { to: start });
    assertTrue(sessions(after).length === 0, "an empty workout would still read as a trained day");
  });

  test("testTheDerivedSetCountsGoBecauseTheyNoLongerDescribeTheSession", () => {
    const start = state({ results: [bench([set("100", 8), set("100", 6)])] });
    const after = StateMerge.apply([remove([SetRemoval.make({ exerciseID: "flat-bench", setIndex: 0 })])], { to: start });

    const stored = JSONValue.objectValue((JSONValue.arrayValue(after.raw["sessions"]) ?? [])[0]);
    assertTrue(stored !== undefined);
    assertNil(stored![LegacyAdapter.plannedSetCountKey]);
    assertNil(stored![LegacyAdapter.completedSetCountKey]);
    assertEqual(JSONValue.stringValue(stored!["date"]), "2026-09-18T17:00:00.000Z", "the session keeps everything else");
    assertEqual(JSONValue.stringValue(stored!["dayLabel"]), "Push");
  });

  test("testNothingElseInTheAccountIsTouched", () => {
    const start = state({ results: [bench([set("100", 8), set("100", 6)])], extra: { note: "zware dag" } });
    const raw: JSONObject = { ...start.raw };
    raw["nutritionEntries"] = [{ id: "f-1", name: "Havermout" }];
    const before = LegacyState.make({ raw });

    const after = StateMerge.apply([remove([SetRemoval.make({ exerciseID: "flat-bench", setIndex: 0 })])], { to: before });
    assertEqual(after.raw["nutritionEntries"], before.raw["nutritionEntries"]);
    const stored = JSONValue.objectValue((JSONValue.arrayValue(after.raw["sessions"]) ?? [])[0]);
    assertTrue(stored !== undefined);
    assertEqual(JSONValue.stringValue(stored!["note"]), "zware dag", "keys this change does not own stay");
  });

  // MARK: - A removal that cannot be applied

  test("testAnIndexThatIsNotThereChangesNothing", () => {
    const start = state({ results: [bench([set("100", 8)])] });
    const after = StateMerge.apply([remove([SetRemoval.make({ exerciseID: "flat-bench", setIndex: 4 })])], { to: start });
    assertEqual(after.raw, start.raw);
  });

  test("testARemovalForASessionTheAccountDoesNotHoldChangesNothing", () => {
    const start = state({ results: [bench([set("100", 8)])] });
    const after = StateMerge.apply([remove([SetRemoval.make({ exerciseID: "flat-bench", setIndex: 0 })], "s-99")], {
      to: start,
    });
    assertEqual(after.raw, start.raw);
  });

  // MARK: - Corrections and removals in one save

  test("testACorrectionAndARemovalInOneSaveBothLandOnTheRightSets", () => {
    const start = state({ results: [bench([set("100", 8), set("100", 6), set("95", 6)])] });
    const after = StateMerge.apply(
      [
        StateChange.make({
          kind: "correctSessionSets",
          sessionID: "s-1",
          corrections: [SetCorrection.make({ exerciseID: "flat-bench", setIndex: 2, weightKg: 97.5, reps: 6 })],
        }),
        remove([SetRemoval.make({ exerciseID: "flat-bench", setIndex: 0 })]),
      ],
      { to: start },
    );

    const result = sessions(after)[0]?.results[0];
    assertTrue(result !== undefined);
    assertEqual(
      result!.sets.map(label),
      ["100×6", "97,5×6".replaceAll(",", ".")],
      "the correction landed by the index the reader saw, and the removal after it",
    );
  });

  // MARK: - It survives the queue

  test("testARemovalSurvivesBeingWrittenAndReadBack", () => {
    const change = remove([SetRemoval.make({ exerciseID: "flat-bench", occurrence: 1, setIndex: 2 })]);
    const data = StateChange.encodeList([change]);
    const read = StateChange.decodeList(data)[0];
    assertEqual(read.kind, change.kind);
  });

  test("testTheQueueSaysWhatIsWaiting", () => {
    const rows = SyncQueue.rows({ from: [remove([SetRemoval.make({ exerciseID: "flat-bench", setIndex: 0 })])] });
    assertEqual(rows[0]?.title, "Correction");
    assertEqual(rows[0]?.detail, "1 set removed from an earlier session");
  });
});
