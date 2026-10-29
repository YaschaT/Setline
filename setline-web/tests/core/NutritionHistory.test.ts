// Port of ios/SetlineCore/Tests/SetlineCoreTests/NutritionHistoryTests.swift.
import { test } from "node:test";
import { NutritionTargets } from "../../src/core/Domain/Model";
import { Schedule } from "../../src/core/Engine/Schedule";
import { NutritionEntry } from "../../src/core/Nutrition/NutritionDay";
import { NutritionHistory, NutritionHistory_Day } from "../../src/core/Nutrition/NutritionHistory";
import { addDays } from "../../src/core/Support/calendar";
import { assertClose, assertEqual, assertFalse, assertTrue } from "../helpers";

// Calendar: Gregorian, Europe/Brussels — the zone the test run is pinned to.
const targets = NutritionTargets.make({ calories: 2700, protein: 160, carbs: 330, fat: 80 });
const today = new Date(2026, 9, 11, 9);

function entry(back: number, o: { kcal: number; protein: number; carbs: number }): NutritionEntry {
  const date = addDays(today, -back);
  return NutritionEntry.make({
    id: `e${back}-${o.kcal}`, date: Schedule.dateKey(date), meal: "lunch",
    name: "Food", calories: o.kcal, protein: o.protein, carbs: o.carbs, fat: 60,
  });
}

test("testTodayIsLeftOutAndDaysRunNewestFirst", () => {
  const history = NutritionHistory.make({
    entries: [entry(0, { kcal: 900, protein: 50, carbs: 100 }), entry(1, { kcal: 2700, protein: 160, carbs: 330 })],
    targets, days: 7, before: today,
  });
  assertEqual(history.days.length, 7);
  assertEqual(NutritionHistory.logged(history).length, 1);
  assertTrue(NutritionHistory_Day.isLogged(history.days[0]));
  assertTrue(NutritionHistory_Day.onTarget(history.days[0]));
});

test("testFlagsLowProteinLowCarbsAndUnderCalories", () => {
  const history = NutritionHistory.make({
    entries: [entry(2, { kcal: 2000, protein: 120, carbs: 200 })],
    targets, days: 7, before: today,
  });
  const day = NutritionHistory.logged(history)[0];
  assertEqual(day.flags, ["underCalories", "lowProtein", "lowCarbs"]);
  assertFalse(NutritionHistory_Day.onTarget(day));
});

test("testAveragesCountOnlyLoggedDays", () => {
  const history = NutritionHistory.make({
    entries: [entry(1, { kcal: 2500, protein: 160, carbs: 300 }), entry(3, { kcal: 2200, protein: 140, carbs: 300 })],
    targets, days: 7, before: today,
  });
  assertClose(NutritionHistory.averageCalories(history) ?? 0, 2350, 0.1);
  assertEqual(NutritionHistory.averageGap(history), -350);
  assertEqual(NutritionHistory.daysOnCalories(history), 1);
  assertEqual(NutritionHistory.daysProteinHit(history), 1);
});
