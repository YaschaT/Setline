// Port of ios/SetlineCore/Tests/SetlineCoreTests/WeekPlanTests.swift.
//
// The Swift test pins a UTC gregorian calendar; the web always reads local
// time (TZ=Europe/Brussels in the test run). Every date here is noon UTC, so
// it falls on the same calendar day in both zones.
import { describe, test } from "node:test";
import { assertEqual, assertFalse, assertGreaterThan, assertNil, assertTrue } from "../helpers";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { PlannedExercise } from "../../src/core/Domain/Model";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import type { StateChange_Kind } from "../../src/core/Sync/StateChange";
import { Schedule } from "../../src/core/Engine/Schedule";
import { WeekDraft, WeekPlan, WeekPlan_Day } from "../../src/core/Engine/WeekPlan";
import { addDays } from "../../src/core/Support/calendar";
import { deepEqual } from "../../src/core/Support/swift";

/** Swift `Set(a) == Set(b)` for values without a JS identity. */
function sameSet<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((x) => b.some((y) => deepEqual(x, y))) && b.every((y) => a.some((x) => deepEqual(x, y)));
}

/**
 * The week of Monday 14 September 2026, which the plan shapes as
 * push · pull · legs · rest · lower · upper · rest.
 */
describe("WeekPlanTests", () => {
  const monday = LegacyAdapter.isoDate("2026-09-14T12:00:00.000Z")!;
  const plan = () => PlanCatalog.personal;

  const week = (overrides: Record<string, string> = {}) => WeekPlan.week({ containing: monday, overrides, plan: plan() });

  const draft = (overrides: Record<string, string> = {}) =>
    WeekDraft.make({ dates: Schedule.mondayFirstWeek({ containing: monday }), overrides });

  // MARK: Reading the week

  test("testTheWeekIsTheShapeThePlanGivesIt", () => {
    const days = week();
    assertEqual(days.map((d) => d.key), [
      "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17",
      "2026-09-18", "2026-09-19", "2026-09-20",
    ]);
    assertEqual(days.map((d) => WeekPlan_Day.workout(d)?.id), ["push", "pull", "legs", undefined, "lower", "upper", undefined]);
    assertEqual(days[0]?.weekday, "Mo");
  });

  test("testADayThePlanRestsOnAndNobodyTouchedIsOpen", () => {
    assertEqual(week()[3].kind, { kind: "open" });
  });

  test("testMarkingThatDayMakesItARestDay", () => {
    assertEqual(week({ "2026-09-17": "rest" })[3].kind, { kind: "rest" });
  });

  test("testNothingIsAnnouncedAsMovedWhenNothingMoved", () => {
    assertTrue(week().every((d) => d.movedFrom === undefined));
  });

  test("testASessionSittingElsewhereSaysWhereItUsuallyIs", () => {
    const days = week({ "2026-09-14": "rest", "2026-09-17": "push" });
    assertEqual(WeekPlan_Day.workout(days[3])?.id, "push");
    assertEqual(days[3].movedFrom, "Monday");
    assertEqual(days[0].kind, { kind: "rest" });
  });

  test("testASecondCopyIsNotAMove", () => {
    // Push is on Thursday as well, but it never left Monday.
    const days = week({ "2026-09-17": "push" });
    assertNil(days[3].movedFrom);
    assertNil(days[0].movedFrom);
  });

  // MARK: Rearranging

  test("testMovingASessionLeavesTheDateItCameFromHoldingTheOtherDay", () => {
    let d = draft();
    d = WeekDraft.move(d, { from: "2026-09-14", to: "2026-09-17" });
    assertEqual(WeekDraft.canonical(d, { on: "2026-09-17" }), "push");
    assertEqual(WeekDraft.canonical(d, { on: "2026-09-14" }), "rest", "or the plan would put push straight back");

    const days = WeekDraft.week(d, { plan: plan() });
    assertEqual(days[3].movedFrom, "Monday");
    assertEqual(days[0].kind, { kind: "rest" });
  });

  test("testASessionDraggedOffADayThePlanRestsOnLeavesItEmpty", () => {
    // Thursday is a rest day in the plan and is holding a session anyway;
    // Sunday rests too. Moving it there leaves Thursday with nothing
    // planned and nothing decided.
    let d = draft({ "2026-09-17": "push", "2026-09-14": "rest" });
    d = WeekDraft.move(d, { from: "2026-09-17", to: "2026-09-20" });

    const days = WeekDraft.week(d, { plan: plan() });
    assertEqual(days[3].kind, { kind: "open" });
    assertEqual(WeekPlan_Day.workout(days[6])?.id, "push");
    assertEqual(
      WeekDraft.changes(d, { programKey: "personal" }).map((c) => c.kind),
      [
        { kind: "removeScheduleOverride", key: "personal:2026-09-17" },
        { kind: "setScheduleDay", key: "personal:2026-09-20", dayID: "push" },
      ] as StateChange_Kind[],
    );
  });

  test("testDraggingASessionBackToItsOwnWeekdayTidiesUp", () => {
    let d = draft({ "2026-09-14": "rest", "2026-09-17": "push" });
    d = WeekDraft.move(d, { from: "2026-09-17", to: "2026-09-14" });
    assertTrue(Object.keys(WeekDraft.assignments(d)).length === 0, "the plan says this already");
    assertNil(WeekDraft.week(d, { plan: plan() })[0].movedFrom);
  });

  test("testTwoSessionsTradePlaces", () => {
    let d = draft();
    d = WeekDraft.move(d, { from: "2026-09-14", to: "2026-09-16" });
    assertEqual(WeekDraft.canonical(d, { on: "2026-09-16" }), "push");
    assertEqual(WeekDraft.canonical(d, { on: "2026-09-14" }), "legs");
  });

  test("testMovingWritesDownOnlyTheTwoDatesThatChanged", () => {
    let d = draft();
    d = WeekDraft.move(d, { from: "2026-09-14", to: "2026-09-17" });
    const changes = WeekDraft.changes(d, { programKey: "personal" });
    assertEqual(changes.length, 2);
    assertTrue(sameSet(changes.map((c) => c.kind), [
      { kind: "setScheduleDay", key: "personal:2026-09-14", dayID: "rest" },
      { kind: "setScheduleDay", key: "personal:2026-09-17", dayID: "push" },
    ] as StateChange_Kind[]));
  });

  test("testAnUntouchedWeekHasNothingToSave", () => {
    const d = draft({ "2026-09-17": "rest" });
    assertFalse(WeekDraft.isChanged(d));
    assertTrue(WeekDraft.changes(d, { programKey: "personal" }).length === 0);
  });

  test("testMarkingARestDayIsRecordedEvenWhereThePlanRestsAnyway", () => {
    let d = draft();
    d = WeekDraft.markRest(d, "2026-09-17");
    assertEqual(
      WeekDraft.changes(d, { programKey: "personal" }).map((c) => c.kind),
      [{ kind: "setScheduleDay", key: "personal:2026-09-17", dayID: "rest" }] as StateChange_Kind[],
    );
  });

  test("testHandingADateBackToThePlanDeletesTheOverride", () => {
    let d = draft({ "2026-09-17": "rest" });
    d = WeekDraft.clear(d, "2026-09-17");
    assertEqual(
      WeekDraft.changes(d, { programKey: "personal" }).map((c) => c.kind),
      [{ kind: "removeScheduleOverride", key: "personal:2026-09-17" }] as StateChange_Kind[],
    );
    assertEqual(WeekDraft.week(d, { plan: plan() })[3].kind, { kind: "open" });
  });

  test("testAnotherWeeksDatesAreNeverTouched", () => {
    let d = draft({ "2026-09-07": "rest", "2026-09-17": "rest" });
    d = WeekDraft.clear(d, "2026-09-07");
    d = WeekDraft.move(d, { from: "2026-09-14", to: "2026-09-15" });
    assertTrue(WeekDraft.changes(d, { programKey: "personal" }).every((change) => {
      if (change.kind.kind === "setScheduleDay") return change.kind.key.endsWith("-14") || change.kind.key.endsWith("-15");
      return false;
    }));
  });

  test("testTheProgramScopesEveryChange", () => {
    let d = draft();
    d = WeekDraft.markRest(d, "2026-09-17");
    assertEqual(
      WeekDraft.changes(d, { programKey: "science-upper-lower" }).map((c) => c.kind),
      [{ kind: "setScheduleDay", key: "science-upper-lower:2026-09-17", dayID: "rest" }] as StateChange_Kind[],
    );
  });

  // MARK: Labels

  test("testTheWeekIsNamedByItsDates", () => {
    assertEqual(WeekPlan.range(Schedule.mondayFirstWeek({ containing: monday })), "14–20 Sep");
  });

  test("testAWeekAcrossTwoMonthsNamesBoth", () => {
    const end = LegacyAdapter.isoDate("2026-09-30T12:00:00.000Z")!;
    assertEqual(WeekPlan.range(Schedule.mondayFirstWeek({ containing: end })), "28 Sep–4 Oct");
  });

  test("testWeekOneIsTheWeekOfTheFirstSession", () => {
    assertEqual(WeekPlan.number({ firstSession: undefined, on: monday }), 1);
    assertEqual(WeekPlan.number({ firstSession: monday, on: monday }), 1);
    const sixWeeksOn = addDays(monday, 42);
    assertEqual(WeekPlan.number({ firstSession: monday, on: sixWeeksOn }), 7);
  });

  test("testASessionReportsItsSetsAndAnEstimate", () => {
    const push = plan().find((d) => d.id === "push")!;
    assertEqual(WeekPlan.sets({ of: push }), push.exercises.reduce((n, p) => n + PlannedExercise.targetSets(p), 0));
    assertGreaterThan(WeekPlan.minutes({ of: push }), 0);
  });
});
