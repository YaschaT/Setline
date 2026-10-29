// Port of ios/SetlineCore/Tests/SetlineCoreTests/WorkoutClockTests.swift
import { describe, test } from "node:test";
import { ActiveSessionSnapshot } from "../../src/core/Domain/ActiveSession";
import { ExerciseResult, LoggedSet } from "../../src/core/Domain/Model";
import { WorkoutClock } from "../../src/core/Domain/WorkoutClock";
import { NumberDisplay } from "../../src/core/Engine/NumberDisplay";
import type { JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { addingTimeInterval, dateFromEpoch } from "../../src/core/Support/calendar";
import { assertEqual, assertFalse, assertTrue } from "../helpers";

/**
 * Session duration is active workout time. Rest, transitions and the app
 * going to the background all count; an explicit pause does not.
 */
describe("WorkoutClockTests", () => {
  const start = dateFromEpoch(1_788_000_000);
  const later = (seconds: number) => addingTimeInterval(start, seconds);

  // MARK: 1 — a normal, uninterrupted workout

  test("testUninterruptedWorkoutCountsWallClockWhileRunning", () => {
    const clock = WorkoutClock.make({ segmentStartedAt: start });
    assertTrue(WorkoutClock.isRunning(clock));
    assertEqual(WorkoutClock.activeSeconds(clock, { at: start }), 0);
    assertEqual(WorkoutClock.activeSeconds(clock, { at: later(53 * 60) }), 53 * 60);
  });

  /**
   * Rest and walking between machines are training, not pauses. Nothing
   * stops the clock except `Pauzeer`, so a long rest simply counts.
   */
  test("testRestAndTransitionsCount", () => {
    const clock = WorkoutClock.make({ segmentStartedAt: start });
    assertEqual(WorkoutClock.activeSeconds(clock, { at: later(180) }), 180);
  });

  // MARK: 2 — pause then resume

  test("testPausedTimeIsNotCounted", () => {
    let clock = WorkoutClock.make({ segmentStartedAt: start });

    clock = WorkoutClock.pause(clock, { at: later(600) }); // ten minutes trained
    assertFalse(WorkoutClock.isRunning(clock));
    assertEqual(WorkoutClock.activeSeconds(clock, { at: later(600) }), 600);

    // Half an hour goes by while paused; none of it counts.
    assertEqual(WorkoutClock.activeSeconds(clock, { at: later(2_400) }), 600);

    clock = WorkoutClock.resume(clock, { at: later(2_400) });
    assertEqual(WorkoutClock.activeSeconds(clock, { at: later(2_400) }), 600);
    assertEqual(WorkoutClock.activeSeconds(clock, { at: later(2_700) }), 900, "Five more minutes of training");
  });

  test("testPausingTwiceBanksBothStretches", () => {
    let clock = WorkoutClock.make({ segmentStartedAt: start });
    clock = WorkoutClock.pause(clock, { at: later(300) });
    clock = WorkoutClock.resume(clock, { at: later(1_000) });
    clock = WorkoutClock.pause(clock, { at: later(1_200) });
    assertEqual(WorkoutClock.activeSeconds(clock, { at: later(9_999) }), 500);
  });

  test("testResumingAnAlreadyRunningClockChangesNothing", () => {
    let clock = WorkoutClock.make({ segmentStartedAt: start });
    clock = WorkoutClock.resume(clock, { at: later(100) });
    assertEqual(WorkoutClock.activeSeconds(clock, { at: later(200) }), 200);
  });

  // MARK: 3 — pause, cold relaunch, resume

  /**
   * The banked duration has to survive the blob, or a resumed session
   * starts counting from zero.
   */
  test("testDurationSurvivesAColdRelaunch", () => {
    let clock = WorkoutClock.make({ segmentStartedAt: start });
    clock = WorkoutClock.pause(clock, { at: later(1_500) });

    let state = LegacyState.make({ raw: { sessions: [] } });
    state = LegacyAdapter.applyActiveSession({
      activeSession: ActiveSessionSnapshot.make({
        dayID: "push",
        dayLabel: "Push",
        startedAt: start,
        currentIndex: 0,
        results: [],
        activeSeconds: WorkoutClock.activeSeconds(clock, { at: later(1_500) }),
      }),
      to: state,
    });

    // App is killed and relaunched: the blob is written out and read back.
    const reread = LegacyState.fromData(LegacyState.encoded(state));
    const restored = LegacyAdapter.activeSession({ from: reread });
    if (!restored) throw new Error("XCTUnwrap failed");
    assertEqual(restored.activeSeconds, 1_500);

    // Resuming picks up from the banked total, not from `startedAt`.
    let resumed = WorkoutClock.make({ accumulatedSeconds: restored.activeSeconds, segmentStartedAt: later(86_400) });
    assertEqual(WorkoutClock.activeSeconds(resumed, { at: later(86_400) }), 1_500);
    assertEqual(WorkoutClock.activeSeconds(resumed, { at: later(86_700) }), 1_800);
    resumed = WorkoutClock.pause(resumed, { at: later(86_700) });
    assertEqual(WorkoutClock.activeSeconds(resumed, { at: later(90_000) }), 1_800);
  });

  /**
   * A snapshot written before duration tracking existed decodes as zero
   * rather than failing.
   */
  test("testASnapshotWithoutADurationDecodes", () => {
    const json = `
        {"dayID":"push","dayLabel":"Push","startedAt":"2026-09-11T10:00:00Z",
         "currentIndex":0,"results":[],"proposedReps":{}}
        `;
    const snapshot = ActiveSessionSnapshot.decode(JSON.parse(json) as JSONValue);
    assertEqual(snapshot.activeSeconds, 0);
  });

  // MARK: 4 — paused across a date boundary

  test("testAnOvernightPauseAddsNothing", () => {
    let clock = WorkoutClock.make({ segmentStartedAt: start });
    clock = WorkoutClock.pause(clock, { at: later(2_400) }); // 40 minutes trained

    // Fourteen hours later, the next morning.
    const nextMorning = later(2_400 + 14 * 3_600);
    assertEqual(WorkoutClock.activeSeconds(clock, { at: nextMorning }), 2_400);

    clock = WorkoutClock.resume(clock, { at: nextMorning });
    assertEqual(
      WorkoutClock.activeSeconds(clock, { at: addingTimeInterval(nextMorning, 900) }),
      2_400 + 900,
      "Only the fifteen minutes actually trained the next morning",
    );
  });

  // MARK: 5 — what gets saved

  test("testSavedDurationExcludesPausedTime", () => {
    let clock = WorkoutClock.make({ segmentStartedAt: start });
    clock = WorkoutClock.pause(clock, { at: later(1_800) }); // 30 minutes
    clock = WorkoutClock.resume(clock, { at: later(80_000) }); // the next day
    const finishedAt = later(80_000 + 900); // 15 more minutes

    const snapshot = ActiveSessionSnapshot.make({
      dayID: "push",
      dayLabel: "Push",
      startedAt: start,
      currentIndex: 0,
      results: [
        ExerciseResult.make({
          exerciseID: "flat-bench",
          name: "Flat bench press",
          sets: [LoggedSet.make({ index: 0, weightKg: 100, reps: 6 })],
        }),
      ],
      activeSeconds: WorkoutClock.activeSeconds(clock, { at: finishedAt }),
    });

    const session = ActiveSessionSnapshot.finishedSession(snapshot);
    assertEqual(session.durationSeconds, 2_700, "45 minutes trained, not the 22 hours elapsed");
    assertEqual(session.date, start, "The session still belongs to the day it started");
    assertEqual(NumberDisplay.minutes(NumberDisplay.english, session.durationSeconds ?? 0), "45 min");
  });
});
