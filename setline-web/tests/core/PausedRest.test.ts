// Port of ios/SetlineCore/Tests/SetlineCoreTests/PausedRestTests.swift
import { describe, test } from "node:test";
import { ActiveSessionSnapshot, ActiveSessionSnapshot_PausedRest } from "../../src/core/Domain/ActiveSession";
import { ExerciseResult, LoggedSet } from "../../src/core/Domain/Model";
import { RestTimerState } from "../../src/core/Engine/RestPrescription";
import type { JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { addingTimeInterval, dateFromEpoch } from "../../src/core/Support/calendar";
import { assertEqual, assertNil, assertNotNil } from "../helpers";

/**
 * A rest that was counting when a session was paused must come back with the
 * time it has left — and only then. Rest is wall-clock time, so it keeps
 * running while the session is parked; nothing is ever added to it, and no
 * timer is made up for a session that was paused between rests.
 */
describe("PausedRestTests", () => {
  /** Whole seconds: the blob stores dates as ISO 8601 without fractions. */
  const start = dateFromEpoch(1_788_000_000);

  function rest(a: { target?: number; adjustment?: number } = {}): ActiveSessionSnapshot_PausedRest {
    return ActiveSessionSnapshot_PausedRest.make({
      timer: RestTimerState.make({ targetSeconds: a.target ?? 180, startedAt: start, adjustmentSeconds: a.adjustment ?? 0 }),
      title: "Rust · primaire lift 3:00",
    });
  }

  function snapshot(rest: ActiveSessionSnapshot_PausedRest | undefined): ActiveSessionSnapshot {
    return ActiveSessionSnapshot.make({
      dayID: "push",
      dayLabel: "Push",
      startedAt: addingTimeInterval(start, -600),
      currentIndex: 0,
      results: [
        ExerciseResult.make({
          exerciseID: "flat-bench",
          name: "Flat bench press",
          sets: [LoggedSet.make({ index: 0, weightKg: 102.5, reps: 6, pausedReps: 2 })],
        }),
      ],
      activeSeconds: 600,
      rest,
    });
  }

  test("testARunningRestTravelsWithThePausedSession", () => {
    const original = snapshot(rest({ adjustment: 15 }));
    let state = LegacyState.make({ raw: { sessions: [] } });
    state = LegacyAdapter.applyActiveSession({ activeSession: original, to: state });

    const reread = LegacyState.fromData(LegacyState.encoded(state));
    const restored = LegacyAdapter.activeSession({ from: reread });
    if (!restored) throw new Error("XCTUnwrap failed");

    assertEqual(restored, original);
    assertEqual(restored.rest?.timer.adjustmentSeconds, 15, "An adjustment made before the pause is kept");
    assertEqual(restored.rest?.title, "Rust · primaire lift 3:00");
  });

  test("testAResumedRestHasOnlyTheTimeItHasLeft", () => {
    const paused = snapshot(rest({ target: 180, adjustment: 15 }));
    const resumed = ActiveSessionSnapshot.restToResume(paused, { at: addingTimeInterval(start, 60) });
    if (!resumed) throw new Error("XCTUnwrap failed");
    assertEqual(RestTimerState.remaining(resumed.timer, { at: addingTimeInterval(start, 60) }), 135);
    assertEqual(resumed.timer.startedAt, start, "The count is not restarted on resume");
  });

  test("testARestThatRanOutWhilePausedDoesNotComeBack", () => {
    const paused = snapshot(rest({ target: 180 }));
    assertNil(ActiveSessionSnapshot.restToResume(paused, { at: addingTimeInterval(start, 180) }));
    assertNil(ActiveSessionSnapshot.restToResume(paused, { at: addingTimeInterval(start, 3_600) }));
  });

  test("testASessionPausedBetweenRestsResumesWithoutOne", () => {
    assertNil(ActiveSessionSnapshot.restToResume(snapshot(undefined), { at: start }));
  });

  test("testPausingKeepsOnlyARestThatIsStillCounting", () => {
    const timer = RestTimerState.make({ targetSeconds: 90, startedAt: start });
    assertNotNil(ActiveSessionSnapshot_PausedRest.counting(timer, { title: "Rust", at: addingTimeInterval(start, 30) }));
    assertNil(ActiveSessionSnapshot_PausedRest.counting(timer, { title: "Rust", at: addingTimeInterval(start, 90) }));
    assertNil(ActiveSessionSnapshot_PausedRest.counting(undefined, { title: "", at: start }));
  });

  /**
   * Snapshots already parked on a device or in the account were written
   * without a rest. They still open, and open without one.
   */
  test("testASnapshotWrittenBeforeRestsWereKeptStillOpens", () => {
    const json = `
        {"dayID":"push","dayLabel":"Push","startedAt":"2026-09-30T10:00:00Z","currentIndex":1,
         "results":[],"proposedReps":{},"activeSeconds":420}
        `;
    const snapshot = ActiveSessionSnapshot.decode(JSON.parse(json) as JSONValue);
    assertNil(snapshot.rest);
    assertEqual(snapshot.activeSeconds, 420);
    assertNil(ActiveSessionSnapshot.restToResume(snapshot, { at: new Date() }));
  });

  /**
   * The rest rides along; the sets do not change because of it. Six reps
   * with two of them paused stay six reps.
   */
  test("testKeepingTheRestLeavesPausedRepsAlone", () => {
    const original = snapshot(rest());
    let state = LegacyState.make({ raw: { sessions: [] } });
    state = LegacyAdapter.applyActiveSession({ activeSession: original, to: state });
    const restored = LegacyAdapter.activeSession({ from: LegacyState.fromData(LegacyState.encoded(state)) });
    const set = restored?.results[0]?.sets[0];
    if (!set) throw new Error("XCTUnwrap failed");
    assertEqual(set.reps, 6);
    assertEqual(set.pausedReps, 2);
  });
});
