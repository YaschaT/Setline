// Port of ios/SetlineCore/Tests/SetlineCoreTests/NutritionDayTests.swift.
import { test } from "node:test";
import { NutritionTargets } from "../../src/core/Domain/Model";
import { NumberInput } from "../../src/core/Engine/NumberDisplay";
import { JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { Meal, NutritionDay, NutritionEntry } from "../../src/core/Nutrition/NutritionDay";
import { assertClose, assertEqual, assertFalse } from "../helpers";

// NutritionDayTests

const targets = NutritionTargets.make({ calories: 2250, protein: 165, carbs: 240, fat: 70 });

function entry(id: string, o: { date?: string; calories: number; protein?: number; carbs?: number; fat?: number }): NutritionEntry {
  return NutritionEntry.make({
    id, date: o.date ?? "2026-09-17", meal: "Lunch", name: id,
    calories: o.calories, protein: o.protein ?? 0, carbs: o.carbs ?? 0, fat: o.fat ?? 0,
  });
}

function day(entries: NutritionEntry[], t?: NutritionTargets): NutritionDay {
  return NutritionDay.make({ dateKey: "2026-09-17", entries, targets: t ?? targets });
}

test("testTheDayAddsUpWhatWasLogged", () => {
  const d = day([
    entry("a", { calories: 520, protein: 40, carbs: 60, fat: 12 }),
    entry("b", { calories: 740, protein: 58, carbs: 96, fat: 14 }),
  ]);
  assertEqual(d.calories, 1260);
  assertEqual(d.protein, 98);
  assertEqual(NutritionDay.remaining(d), 990);
});

test("testOnlyThatDaysFoodCounts", () => {
  // The Swift test reads the day in UTC; noon UTC is the same day here.
  const d = NutritionDay.makeEntries({
    entries: [entry("today", { calories: 500 }), entry("yesterday", { date: "2026-09-16", calories: 900 })],
    on: LegacyAdapter.isoDate("2026-09-17T12:00:00.000Z")!,
    targets,
  });
  assertEqual(d.entries.map((e) => e.id), ["today"]);
  assertEqual(d.calories, 500);
});

test("testPastTheTargetThereIsNothingLeftToEat", () => {
  const d = day([entry("a", { calories: 2400 })]);
  assertEqual(NutritionDay.remaining(d), 0);
  assertEqual(NutritionDay.consumed(d), 1, "the ring stops at full");
});

test("testAnAccountWithoutTargetsHasNoRingToDraw", () => {
  const d = day([entry("a", { calories: 500 })], NutritionTargets.make({ calories: 0, protein: 0, carbs: 0, fat: 0 }));
  assertFalse(NutritionDay.hasTarget(d));
  assertEqual(NutritionDay.consumed(d), 0);
  assertEqual(NutritionDay.fraction(d, { of: "protein" }), 0);
});

test("testEachMacroIsMeasuredAgainstItsOwnTarget", () => {
  const d = day([entry("a", { calories: 1000, protein: 82.5, carbs: 120, fat: 35 })]);
  assertClose(NutritionDay.fraction(d, { of: "protein" }), 0.5, 0.0001);
  assertClose(NutritionDay.fraction(d, { of: "carbs" }), 0.5, 0.0001);
  assertEqual(NutritionDay.target(d, { for: "fat" }), 70);
});

test("testMacrosStandInForCaloriesTheSameWayTheWebAppDoes", () => {
  assertEqual(NutritionEntry.calories({ protein: 40, carbs: 60, fat: 12 }), 508);
  assertEqual(NutritionEntry.calories({ protein: 0, carbs: 0, fat: 0 }), 0);
});

test("testAnEntryIsWrittenInTheShapeTheWebAppReads", () => {
  const fields = JSONValue.objectValue(NutritionEntry.json(entry("m1", { calories: 520, protein: 40 })));
  if (fields === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(new Set(Object.keys(fields)), new Set(["id", "date", "meal", "name", "calories", "protein", "carbs", "fat"]));
  assertEqual(fields["calories"], 520);
  assertEqual(fields["meal"], "Lunch");
});

test("testStoredFoodIsReadBackWholeAndAnythingUnnamedIsSkipped", () => {
  const state = LegacyState.make({ raw: { nutritionEntries: [
    {
      id: "m1", date: "2026-09-17", meal: "Ontbijt",
      name: "Havermout", calories: 520, protein: 40,
      carbs: 60, fat: 12,
    },
    { name: "geen id" },
  ] } });
  const entries = LegacyAdapter.nutritionEntries({ from: state });
  assertEqual(entries.length, 1);
  assertEqual(entries[0]?.name, "Havermout");
  assertEqual(entries[0]?.protein, 40);
});

test("testTheMealPickerOpensOnWhatIsLikelyBeingEaten", () => {
  // The Swift test reads these hours on a UTC calendar; the web reads the
  // local calendar, so the same wall-clock hours are made in local time.
  const meal = (hour: number) => Meal.likely({ at: new Date(2026, 8, 17, hour) });
  assertEqual(meal(8), Meal.ontbijt);
  assertEqual(meal(10), Meal.ontbijt, "the web app's own boundary");
  assertEqual(meal(13), Meal.lunch);
  assertEqual(meal(19), Meal.avondeten);
  assertEqual(meal(23), Meal.avondeten);
});

// NumberInputTests

test("NumberInputTests.testOnlyDigitsAndOneSeparatorSurvive", () => {
  assertEqual(NumberInput.numericOnly("&'("), "");
  assertEqual(NumberInput.numericOnly("145"), "145");
  assertEqual(NumberInput.numericOnly("2.5"), "2,5");
  assertEqual(NumberInput.numericOnly("2,5,5"), "2,55");
  assertEqual(NumberInput.numericOnly("12 kcal"), "12");
});

test("NumberInputTests.testWhatTheFieldIsWorth", () => {
  assertEqual(NumberInput.value("2,5"), 2.5);
  assertEqual(NumberInput.value(""), 0);
  assertEqual(NumberInput.value("abc"), 0);
});
