// Port of ios/SetlineCore/Tests/SetlineCoreTests/AutosavedSessionTests.swift
import { describe, test } from "node:test";
import { ActiveSessionSnapshot } from "../../src/core/Domain/ActiveSession";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { addingTimeInterval } from "../../src/core/Support/calendar";
import { assertEqual, assertFalse, assertTrue } from "../helpers";

/** A workout left open survives the app being closed in the background. */
describe("AutosavedSessionTests", () => {
  const start = LegacyAdapter.isoDate("2026-10-19T17:00:00.000Z")!;

  function snapshot(runningSince: Date | undefined): ActiveSessionSnapshot {
    return ActiveSessionSnapshot.make({
      dayID: "push",
      dayLabel: "Push",
      startedAt: start,
      currentIndex: 0,
      results: [],
      activeSeconds: 600,
      runningSince,
    });
  }

  test("testAPauseKeepsOnlyTheBankedTime", () => {
    const paused = snapshot(undefined);
    assertEqual(ActiveSessionSnapshot.activeSecondsResumingAt(paused, { resumingAt: addingTimeInterval(start, 3600) }), 600);
    assertFalse(ActiveSessionSnapshot.reopensOnLaunch(paused, { at: addingTimeInterval(start, 60) }));
  });

  test("testTimeAwayFromAnOpenWorkoutCounts", () => {
    const left = snapshot(addingTimeInterval(start, 600));
    assertEqual(
      ActiveSessionSnapshot.activeSecondsResumingAt(left, { resumingAt: addingTimeInterval(start, 600 + 180) }),
      780,
    );
    assertTrue(ActiveSessionSnapshot.reopensOnLaunch(left, { at: addingTimeInterval(start, 600 + 180) }));
  });

  test("testAForgottenWorkoutIsCappedAndNotReopened", () => {
    const left = snapshot(start);
    const nextDay = addingTimeInterval(start, 24 * 3600);
    assertEqual(
      ActiveSessionSnapshot.activeSecondsResumingAt(left, { resumingAt: nextDay }),
      600 + ActiveSessionSnapshot.maxAwaySeconds,
    );
    assertFalse(ActiveSessionSnapshot.reopensOnLaunch(left, { at: nextDay }));
  });

  test("testTheMarkSurvivesTheSharedState", () => {
    let state = LegacyState.make({ raw: {} });
    state = LegacyAdapter.applyActiveSession({ activeSession: snapshot(start), to: state });
    assertEqual(LegacyAdapter.activeSession({ from: state })?.runningSince, start);
  });
});
