// Port of ios/SetlineCore/Tests/SetlineCoreTests/TrainingStreakTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertFalse, assertTrue } from "../helpers";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { TrainingSession, type WorkoutDay } from "../../src/core/Domain/Model";
import { WeekPlan, WeekPlan_Day } from "../../src/core/Engine/WeekPlan";
import { TrainingStreak } from "../../src/core/Progress/TrainingStreak";
import { addingTimeInterval, dateFrom } from "../../src/core/Support/calendar";

/** The weekly streak: weeks in a row with as many workouts as the plan asks. */
describe("TrainingStreakTests", () => {
  // The Swift test pins a Brussels Gregorian calendar; TZ is Europe/Brussels here.
  const plan = (): WorkoutDay[] => PlanCatalog.personal;

  const date = (day: number, month = 9, hour = 17): Date => dateFrom({ year: 2026, month, day, hour });

  const session = (day: number, month = 9): TrainingSession =>
    TrainingSession.make({
      id: `s-${month}-${day}`,
      date: date(day, month),
      dayID: "push",
      dayLabel: "Push",
      completion: 100,
      results: [],
    });

  /** How many training days the personal plan has in a week. */
  const goal = (): number =>
    WeekPlan.week({ containing: date(7), overrides: {}, plan: plan() }).filter((day) => WeekPlan_Day.isTraining(day)).length;

  const full = (monday: number): TrainingSession[] => Array.from({ length: goal() }, (_, i) => session(monday + i));

  const streak = (sessions: TrainingSession[], now: Date): TrainingStreak =>
    TrainingStreak.make({ sessions, plan: plan(), overrides: {}, now });

  test("testNoWorkoutsIsNoStreak", () => {
    const result = streak([], date(9));
    assertEqual(result.weeks, 0);
    assertEqual(result.thisWeekDone, 0);
    assertEqual(result.thisWeekGoal, goal());
  });

  test("testFullWeeksInARowCountAndTheRunningWeekDoesNotBreakIt", () => {
    // Weeks of 31 aug, 7 sep and 14 sep met; the week of 21 sep has begun.
    const met = [
      ...Array.from({ length: goal() }, (_, day) =>
        TrainingSession.make({
          id: `a${day}`,
          date: addingTimeInterval(date(31, 8), day * 86_400),
          dayID: "push",
          dayLabel: "Push",
          completion: 100,
          results: [],
        }),
      ),
      ...full(7),
      ...full(14),
    ];
    const result = streak([...met, session(21)], date(22, 9, 12));
    assertEqual(result.weeks, 3);
    assertEqual(result.thisWeekDone, 1);
    assertFalse(TrainingStreak.thisWeekMet(result));
  });

  test("testAMetRunningWeekJoinsTheCount", () => {
    const result = streak([...full(7), ...full(14)], date(20, 9, 12));
    assertEqual(result.weeks, 2);
    assertTrue(TrainingStreak.thisWeekMet(result));
  });

  test("testAShortWeekBreaksTheStreak", () => {
    const short = full(7).slice(0, goal() - 1);
    const result = streak([...short, ...full(14)], date(22, 9, 12));
    assertEqual(result.weeks, 1);
  });

  test("testTwoSessionsOnOneDayAreOneTrainingDay", () => {
    const doubled = [session(14), session(14)];
    const result = streak(doubled, date(15, 9, 12));
    assertEqual(result.thisWeekDone, 1);
  });
});

describe("StreakFreezeTests", () => {
  test("testOneMissInFourIsForgiven", () => {
    const r = TrainingStreak.run([true, true, false, true]);
    assertEqual(r.streak, 3, "the missed week neither counts nor breaks");
    assertEqual(r.sinceFreeze, 1);
  });

  test("testTwoMissesInARowBreakIt", () => {
    assertEqual(TrainingStreak.run([true, true, false, false, true]).streak, 1);
  });

  test("testASecondMissWithinFourWeeksBreaksIt", () => {
    assertEqual(TrainingStreak.run([true, false, true, false, true]).streak, 1);
  });

  test("testTheFreezeComesBackAfterFourWeeks", () => {
    assertEqual(TrainingStreak.run([true, false, true, true, true, true, false, true]).streak, 6);
  });

  test("testBestRemembersTheLongestRun", () => {
    const r = TrainingStreak.run([true, true, true, true, false, false, true]);
    assertEqual(r.best, 4);
    assertEqual(r.streak, 1);
  });

  test("testNoFreezeBeforeThereIsAStreak", () => {
    assertFalse(TrainingStreak.run([false]).lastFrozen);
  });
});

describe("StreakRiskTests", () => {
  test("testRoomToSpareIsNoRisk", () => {
    assertEqual(TrainingStreak.risk(TrainingStreak.make({ weeks: 4, thisWeekDone: 1, thisWeekGoal: 3 }), { daysLeft: 4 }), "none");
  });
  test("testEveryDayLeftNeededIsTight", () => {
    assertEqual(TrainingStreak.risk(TrainingStreak.make({ weeks: 4, thisWeekDone: 1, thisWeekGoal: 3 }), { daysLeft: 2 }), "tight");
  });
  test("testOutOfDaysUsesTheFreezeOrBreaks", () => {
    assertEqual(
      TrainingStreak.risk(TrainingStreak.make({ weeks: 4, thisWeekDone: 0, thisWeekGoal: 5 }), { daysLeft: 3 }),
      "freezeCovers",
    );
    assertEqual(
      TrainingStreak.risk(TrainingStreak.make({ weeks: 4, thisWeekDone: 0, thisWeekGoal: 5, freezeAvailable: false }), {
        daysLeft: 3,
      }),
      "breaks",
    );
  });
  test("testNothingToLoseOrAlreadyMetIsNoRisk", () => {
    assertEqual(TrainingStreak.risk(TrainingStreak.make({ weeks: 0, thisWeekDone: 0, thisWeekGoal: 5 }), { daysLeft: 1 }), "none");
    assertEqual(TrainingStreak.risk(TrainingStreak.make({ weeks: 3, thisWeekDone: 3, thisWeekGoal: 3 }), { daysLeft: 0 }), "none");
  });
});
