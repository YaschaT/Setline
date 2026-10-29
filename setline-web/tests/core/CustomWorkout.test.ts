// Port of ios/SetlineCore/Tests/SetlineCoreTests/CustomWorkoutTests.swift
// (CustomWorkoutTests and CustomWorkoutScheduleTests).
import { describe, test } from "node:test";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { CustomWorkout, CustomWorkout_Item } from "../../src/core/Domain/CustomWorkout";
import { Agenda, AgendaDay } from "../../src/core/Engine/Agenda";
import { DayPlan } from "../../src/core/Engine/DayPlan";
import { Schedule } from "../../src/core/Engine/Schedule";
import type { JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { dateFromEpoch } from "../../src/core/Support/calendar";
import { deepEqual } from "../../src/core/Support/swift";
import { StateChange } from "../../src/core/Sync/StateChange";
import { StateMerge } from "../../src/core/Sync/StateMerge";
import { assertEqual, assertTrue } from "../helpers";

describe("CustomWorkoutTests", () => {
  const workout = CustomWorkout.make({
    id: "custom-test",
    name: "Arms",
    items: [
      CustomWorkout_Item.make({ exerciseID: "strict-curl", sets: 4 }),
      CustomWorkout_Item.make({ exerciseID: "pressdown", sets: 3, repLow: 10, repHigh: 15 }),
    ],
    createdAt: dateFromEpoch(1_760_000_000),
  });

  test("testItReadsAsAPlanDay", () => {
    const day = CustomWorkout.workoutDay(workout);
    assertEqual(day.id, "custom-test");
    assertEqual(day.short, "Arms");
    assertEqual(day.exercises.map((e) => e.exerciseID), ["strict-curl", "pressdown"]);
    assertEqual(day.exercises[0].sets.length, 4);
    assertEqual(day.exercises[1].sets[0]?.repRange, { lowerBound: 10, upperBound: 15 });
    assertTrue(CustomWorkout.isCustom({ dayID: day.id }));
  });

  test("testSavedChangedAndRemovedThroughTheSharedState", () => {
    let state = StateMerge.apply([StateChange.make({ kind: "upsertCustomWorkout", value: workout })], {
      to: LegacyState.make({ raw: {} }),
    });
    assertEqual(LegacyAdapter.customWorkouts({ from: state }), [workout]);

    const renamed = { ...workout, name: "Arms day" };
    state = StateMerge.apply([StateChange.make({ kind: "upsertCustomWorkout", value: renamed })], { to: state });
    assertEqual(LegacyAdapter.customWorkouts({ from: state }).map((w) => w.name), ["Arms day"]);

    state = StateMerge.apply([StateChange.make({ kind: "removeCustomWorkout", id: workout.id })], { to: state });
    assertTrue(LegacyAdapter.customWorkouts({ from: state }).length === 0);
  });

  test("testTheChangeSurvivesTheQueue", () => {
    const change = StateChange.make({ kind: "upsertCustomWorkout", value: workout });
    const data = JSON.stringify(StateChange.encode(change));
    assertEqual(StateChange.decode(JSON.parse(data) as JSONValue).kind, change.kind);
  });
});

describe("CustomWorkoutScheduleTests", () => {
  test("testAnOwnWorkoutPutOnADayIsThatDaysWorkout", () => {
    const arms = CustomWorkout.make({
      id: "custom-arms",
      name: "Arms",
      items: [CustomWorkout_Item.make({ exerciseID: "strict-curl" })],
    });
    const plan = [...PlanCatalog.personal, CustomWorkout.workoutDay(arms)];
    const monday = Schedule.mondayFirstWeek({ containing: new Date() })[0];
    const key = Schedule.dateKey(monday);
    const week = Agenda.week({ containing: monday, plan, overrides: { [key]: arms.id }, sessions: [] });
    const day = week.find((d) => d.key === key);
    assertEqual(day ? AgendaDay.plannedDay(day)?.id : undefined, "custom-arms");

    const options = DayPlan.make({ for: monday, plan, overrides: {}, sessions: [] }).options;
    assertTrue(
      options.some((o) => deepEqual(o.kind, { kind: "session", id: "custom-arms" })),
      "offered when changing a day",
    );
  });
});
