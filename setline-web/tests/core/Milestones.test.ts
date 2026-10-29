// Port of ios/SetlineCore/Tests/SetlineCoreTests/MilestonesTests.swift.
import { describe, test } from "node:test";
import { assertClose, assertEqual, assertNil, assertTrue } from "../helpers";
import { ExerciseResult, LoggedSet, TrainingSession } from "../../src/core/Domain/Model";
import { Milestone, Milestones } from "../../src/core/Progress/Milestones";
import { dateFromEpoch } from "../../src/core/Support/calendar";

describe("MilestonesTests", () => {
  const session = (day: number, weight: number, reps = 5): TrainingSession =>
    TrainingSession.make({
      id: `s${day}`,
      date: dateFromEpoch(day * 86_400),
      dayID: "push",
      dayLabel: "Push",
      completion: 100,
      results: [
        ExerciseResult.make({ exerciseID: "bench", name: "Bench", sets: [LoggedSet.make({ index: 0, weightKg: weight, reps })] }),
      ],
    });

  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

  test("testSessionMarksCarryTheDateOfTheNthWorkout", () => {
    const sessions = range(1, 10).map((day) => session(day, 50));
    const list = Milestones.make({ sessions, bestStreak: 0 });
    const first = list.find((m) => m.id === "sessions-1");
    const ten = list.find((m) => m.id === "sessions-10");
    const twentyFive = list.find((m) => m.id === "sessions-25");
    assertTrue(first !== undefined && ten !== undefined && twentyFive !== undefined);
    assertEqual(first!.reachedOn, sessions[0].date);
    assertEqual(ten!.reachedOn, sessions[9].date);
    assertNil(twentyFive!.reachedOn);
    assertClose(Milestone.fraction(twentyFive!), 0.4, 0.001);
  });

  test("testHeaviestSetIsDatedByTheSessionThatFirstHitIt", () => {
    const list = Milestones.make({ sessions: [session(1, 90), session(2, 102.5)], bestStreak: 0 });
    assertEqual(list.find((m) => m.id === "heaviest-80")?.reachedOn, session(1, 90).date);
    assertEqual(list.find((m) => m.id === "heaviest-100")?.reachedOn, session(2, 0).date);
    assertNil(list.find((m) => m.id === "heaviest-120")?.reachedOn);
  });

  test("testVolumeAddsUpAcrossSessions", () => {
    // 200 kg × 5 = 1 t per session; ten sessions = 10 t.
    const sessions = range(1, 10).map((day) => session(day, 200));
    const ten = Milestones.make({ sessions, bestStreak: 0 }).find((m) => m.id === "volume-10");
    assertTrue(ten !== undefined);
    assertEqual(ten!.reachedOn, sessions[9].date);
  });

  test("testReachedSinceFindsWhatIsNew", () => {
    const sessions = range(1, 10).map((day) => session(day, 50));
    const list = Milestones.make({ sessions, bestStreak: 0 });
    const fresh = Milestones.reached({ in: list, since: sessions[9].date });
    assertEqual(fresh.map((m) => m.id), ["sessions-10"]);
  });
});
