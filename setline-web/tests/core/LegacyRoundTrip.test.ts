// Port of ios/SetlineCore/Tests/SetlineCoreTests/LegacyRoundTripTests.swift
// (LegacyRoundTripTests and ActiveSessionTests).
import { describe, test } from "node:test";
import { ActiveSessionSnapshot } from "../../src/core/Domain/ActiveSession";
import { ExerciseResult, LoggedSet } from "../../src/core/Domain/Model";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { dateFromEpoch } from "../../src/core/Support/calendar";
import { assertEqual, assertFalse, assertNil, assertTrue } from "../helpers";
import { Fixtures, applySessions } from "./Fixtures";

const skipReason = "PRIVATE-DATA/yascha-training-backup.json not present";

/**
 * Phase 1's acceptance gate.
 *
 * The blob stays the wire format while iOS is built, so importing it and
 * writing it back must not change, drop or invent a single value.
 */
describe("LegacyRoundTripTests", () => {
  test("testRealBackupRoundTripsUnchanged", (t) => {
    const data = Fixtures.backupData;
    if (data === undefined) return t.skip(skipReason);
    const state = LegacyState.fromExportOrState({ data });
    const encoded = LegacyState.encoded(state);
    const reread = LegacyState.fromData(encoded);

    assertEqual(state.raw, reread.raw, "Re-encoding the state changed it");
    assertEqual(new Set(Object.keys(state.raw)), new Set(Object.keys(reread.raw)));
  });

  test("testEveryTopLevelKeySurvivesASessionWrite", (t) => {
    const data = Fixtures.backupData;
    if (data === undefined) return t.skip(skipReason);
    let state = LegacyState.fromExportOrState({ data });
    const before = new Set(Object.keys(state.raw));
    const sessions = LegacyAdapter.sessions({ from: state });

    state = applySessions(sessions, state);

    const after = new Set(Object.keys(state.raw));
    const dropped = [...before].filter((key) => !after.has(key));
    assertTrue(dropped.length === 0, `Writing sessions dropped ${dropped}`);

    // Keys the adapter does not own must be byte-identical afterwards.
    const untouched = ["nutritionEntries", "recoveryDraft", "targets", "metrics", "plan", "scheduleOverrides", "completed", "performance"];
    const original = LegacyState.fromExportOrState({ data });
    for (const key of untouched) {
      if (LegacyState.get(original, key) === undefined) continue;
      assertEqual(LegacyState.get(original, key), LegacyState.get(state, key), `Key ${key} was modified`);
    }
  });

  test("testImportReadsTheExpectedShape", (t) => {
    const data = Fixtures.backupData;
    if (data === undefined) return t.skip(skipReason);
    const state = LegacyState.fromExportOrState({ data });

    const sessions = LegacyAdapter.sessions({ from: state });
    assertEqual(sessions.length, 6, "Expected the six logged sessions from the export");
    assertEqual(sessions.filter((s) => s.kind === "recovery").length, 1);

    const totalSets = sessions.flatMap((s) => s.results).flatMap((r) => r.sets).length;
    assertEqual(totalSets, 96, "Every logged set must survive the import");

    assertEqual(LegacyAdapter.metrics({ from: state }).length, 3);
    assertEqual(LegacyAdapter.targets({ from: state })?.calories, 2750);
    assertEqual(LegacyAdapter.plan({ from: state }).length, 5);
    assertFalse(Object.keys(LegacyAdapter.scheduleOverrides({ from: state })).length === 0);
  });

  /**
   * The web app allowed one set to hold normal and paused reps and then
   * summed them (`completedReps()`). TRAINING_LOGIC §15 change 2 and
   * design addendum 16R both forbid that.
   */
  test("testPausedRepsAreNeverSummedIntoTheRepCount", (t) => {
    const data = Fixtures.backupData;
    if (data === undefined) return t.skip(skipReason);
    const state = LegacyState.fromExportOrState({ data });
    const sets = LegacyAdapter.sessions({ from: state })
      .flatMap((s) => s.results)
      .flatMap((r) => r.sets);
    const mixed = sets.filter((s) => (s.pausedReps ?? 0) > 0 && s.reps > 0);

    assertEqual(mixed.length, 2, "The export holds two mixed sets");
    for (const set of mixed) {
      assertFalse(LoggedSet.countsTowardProgression(set), "A mixed set is comparable to neither series");
      assertTrue(LoggedSet.countsTowardVolume(set), "16R: it still counts toward volume");
    }
    // 120 kg × 6 + 2 paused must read as 6, not 8.
    assertTrue(mixed.some((s) => s.weightKg === 120 && s.reps === 6 && s.pausedReps === 2));
  });

  test("testSetsWithoutAWeightSurviveAsEmptyRows", () => {
    const json = `
        {"sessions":[{"id":"1","date":"2026-09-01T10:00:00.000Z","dayId":"push","dayLabel":"Push","completion":50,
        "results":[{"exerciseId":"flat-bench","name":"Flat bench press","sets":[
        {"weight":"","reps":"","pausedReps":"","pauseSeconds":"","pauseEnabled":false},
        {"weight":"100","reps":"5","pausedReps":"","pauseSeconds":"","pauseEnabled":false}]}]}]}
        `;
    const state = LegacyState.fromData(json);
    const sets = LegacyAdapter.sessions({ from: state })
      .flatMap((s) => s.results)
      .flatMap((r) => r.sets);
    assertEqual(sets.length, 2);
    assertFalse(LoggedSet.isLogged(sets[0]));
    assertTrue(LoggedSet.isLogged(sets[1]));
    assertEqual(sets[1].weightKg, 100);
  });
});

/**
 * Pausing a workout must never cost a set, and must not disturb anything
 * else in the shared blob.
 */
describe("ActiveSessionTests", () => {
  function snapshot(): ActiveSessionSnapshot {
    return ActiveSessionSnapshot.make({
      dayID: "push",
      dayLabel: "Push",
      startedAt: dateFromEpoch(1_788_000_000),
      currentIndex: 2,
      results: [
        ExerciseResult.make({
          exerciseID: "flat-bench",
          name: "Flat bench press",
          sets: [
            LoggedSet.make({ index: 0, weightKg: 102.5, reps: 6, rirReported: 1 }),
            LoggedSet.make({ index: 1, weightKg: 102.5, reps: 0 }),
          ],
        }),
      ],
      proposedReps: { "flat-bench": 6 },
    });
  }

  test("testSnapshotRoundTripsThroughTheBlob", () => {
    // One snapshot, not two: every LoggedSet mints a fresh id, so
    // rebuilding it for the comparison would never match.
    const original = snapshot();
    let state = LegacyState.make({ raw: { sessions: [] } });
    state = LegacyAdapter.applyActiveSession({ activeSession: original, to: state });

    const encoded = LegacyState.encoded(state);
    const reread = LegacyState.fromData(encoded);
    const restored = LegacyAdapter.activeSession({ from: reread });
    if (!restored) throw new Error("XCTUnwrap failed");

    assertEqual(restored, original);
    assertEqual(ActiveSessionSnapshot.loggedSetCount(restored), 1, "The written set survived");
    assertEqual(ActiveSessionSnapshot.plannedSetCount(restored), 2, "The pre-filled draft survived too");
    assertEqual(restored.currentIndex, 2, "It reopens on the exercise it was left on");
  });

  test("testClearingLeavesTheRestOfTheBlobAlone", () => {
    let state = LegacyState.make({
      raw: {
        sessions: [],
        nutritionEntries: ["keep me"],
      },
    });
    state = LegacyAdapter.applyActiveSession({ activeSession: snapshot(), to: state });
    state = LegacyAdapter.applyActiveSession({ activeSession: undefined, to: state });

    assertNil(LegacyAdapter.activeSession({ from: state }));
    assertEqual(LegacyState.get(state, "nutritionEntries"), ["keep me"]);
  });

  /**
   * A paused session is not history: nothing in it may reach the sessions
   * list, and therefore progression, records and volume, until it is
   * finished.
   */
  test("testAPausedSessionIsNotASession", () => {
    let state = LegacyState.make({ raw: { sessions: [] } });
    state = LegacyAdapter.applyActiveSession({ activeSession: snapshot(), to: state });
    assertTrue(LegacyAdapter.sessions({ from: state }).length === 0);
  });
});
