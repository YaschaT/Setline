// Port of ios/SetlineCore/Tests/SetlineCoreTests/FriendFeedbackTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertNil, assertNotNil, assertTrue } from "../helpers";
import { RestTimerState } from "../../src/core/Engine/RestPrescription";
import { Schedule } from "../../src/core/Engine/Schedule";
import { WeekPlan } from "../../src/core/Engine/WeekPlan";
import { LoggedSet } from "../../src/core/Domain/Model";
import { CustomWorkout, CustomWorkout_Item } from "../../src/core/Domain/CustomWorkout";
import { CustomWorkoutLink } from "../../src/core/Domain/CustomWorkoutLink";
import { dateFrom } from "../../src/core/Support/calendar";

/** What friends asked for after testing on their own phones (2026-10-30). */
describe("FriendFeedbackTests", () => {
  test("a typed rest length reads the way people type it", () => {
    assertEqual(RestTimerState.parseLength("1:30"), 90);
    assertEqual(RestTimerState.parseLength("1.30"), 90);
    assertEqual(RestTimerState.parseLength("1,5"), 90);
    assertEqual(RestTimerState.parseLength("2"), 120);
    assertEqual(RestTimerState.parseLength("90"), 90);
    assertEqual(RestTimerState.parseLength("130"), 90);
    assertEqual(RestTimerState.parseLength("245"), 165);
    assertNil(RestTimerState.parseLength("1:75"));
    assertEqual(RestTimerState.parseLength("5"), 300);
    assertNil(RestTimerState.parseLength("abc"));
    assertNil(RestTimerState.parseLength("16:00"));
  });

  test("a set without weight is a set", () => {
    assertTrue(LoggedSet.isLogged(LoggedSet.make({ index: 0, weightKg: 0, reps: 8 })));
    assertTrue(!LoggedSet.isLogged(LoggedSet.make({ index: 0, weightKg: undefined, reps: 8 })));
    assertTrue(!LoggedSet.isLogged(LoggedSet.make({ index: 0, weightKg: 0, reps: 0 })));
  });

  test("your own week wins over the program's, from its start date on", () => {
    const friday = dateFrom({ year: 2026, month: 10, day: 30 });
    const thursday = dateFrom({ year: 2026, month: 10, day: 29 });
    const week = { [Schedule.weekKey(5)]: "custom-abc", [Schedule.weekKey(4)]: "custom-abc", [Schedule.weekFromKey]: "2026-10-30" };
    assertEqual(Schedule.canonicalDay({ for: friday, overrides: week }), "custom-abc");
    // Before it was made, the week stays as it was: nothing turns into a missed day.
    assertEqual(Schedule.canonicalDay({ for: thursday, overrides: week }), Schedule.defaultWeek[4]);
    // A date's own change still wins.
    assertEqual(Schedule.canonicalDay({ for: friday, overrides: { ...week, "2026-10-30": "rest" } }), "rest");
    assertEqual(WeekPlan.defaultDay({ for: friday, overrides: week }), "custom-abc");
  });

  test("a workout survives the trip through a link", () => {
    const workout = CustomWorkout.make({
      name: "Friday Pump 💪",
      items: [CustomWorkout_Item.make({ exerciseID: "flat-bench", sets: 4, repLow: 6, repHigh: 8 }), CustomWorkout_Item.make({ exerciseID: "hack-squat" })],
    });
    const received = CustomWorkoutLink.received(CustomWorkoutLink.code(workout));
    assertNotNil(received);
    assertEqual(received!.workout.name, "Friday Pump 💪");
    assertEqual(received!.workout.items, workout.items);
    assertTrue(received!.workout.id !== workout.id);
    assertEqual(received!.skipped, 0);
  });

  test("a link with exercises this app doesn't know keeps the rest, or offers nothing", () => {
    const code = Buffer.from(JSON.stringify({ n: "Mix", i: ["flat-bench~3~8~12", "made-up~3~8~12"] })).toString("base64url");
    assertEqual(CustomWorkoutLink.received(code)?.skipped, 1);
    const none = Buffer.from(JSON.stringify({ n: "None", i: ["made-up~3~8~12"] })).toString("base64url");
    assertNil(CustomWorkoutLink.received(none));
    assertNil(CustomWorkoutLink.received("%%%"));
  });
});
