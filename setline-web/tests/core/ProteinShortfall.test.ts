// Port of ios/SetlineCore/Tests/SetlineCoreTests/ProteinShortfallTests.swift.
//
// "Aandacht": days in a row under the protein target, read from what was
// logged and from nothing else.
import { test } from "node:test";
import { NutritionTargets } from "../../src/core/Domain/Model";
import { NutritionEntry, ProteinShortfall } from "../../src/core/Nutrition/NutritionDay";
import { assertEqual, assertNil } from "../helpers";

// Calendar: Gregorian, Europe/Brussels — the zone the test run is pinned to.
const today = new Date(2026, 8, 9, 14);
const targets = NutritionTargets.make({ calories: 2450, protein: 175, carbs: 280, fat: 70 });

function entry(date: string, protein: number): NutritionEntry {
  return NutritionEntry.make({
    id: `${date}-${protein}`, date, meal: "Lunch", name: "Eten",
    calories: 500, protein, carbs: 40, fat: 10,
  });
}

test("testThreeShortDaysAreCountedAndAveraged", () => {
  const entries = [
    entry("2026-09-08", 150), // 25 short
    entry("2026-09-07", 140), // 35 short
    entry("2026-09-06", 100), // 21 short, with the next
    entry("2026-09-06", 54),
  ];
  const result = ProteinShortfall.makeEntries({ entries, targets, today });
  assertEqual(result, ProteinShortfall.make({ days: 3, averageGrams: 27 }));
});

test("testOneShortDayIsNotAPattern", () => {
  const entries = [entry("2026-09-08", 150), entry("2026-09-07", 180)];
  assertNil(ProteinShortfall.makeEntries({ entries, targets, today }));
});

test("testTodayNeverCounts", () => {
  // Today is short so far, and that says nothing: the day is not over.
  const entries = [entry("2026-09-09", 40), entry("2026-09-08", 150)];
  assertNil(ProteinShortfall.makeEntries({ entries, targets, today }));
});

test("testADayWithNothingLoggedEndsTheRun", () => {
  const entries = [
    entry("2026-09-08", 150),
    // 7 Sep: nothing logged.
    entry("2026-09-06", 100),
    entry("2026-09-05", 100),
  ];
  assertNil(ProteinShortfall.makeEntries({ entries, targets, today }));
});

test("testADayOnTargetEndsTheRun", () => {
  const entries = [
    entry("2026-09-08", 150),
    entry("2026-09-07", 150),
    entry("2026-09-06", 175),
    entry("2026-09-05", 100),
  ];
  const result = ProteinShortfall.makeEntries({ entries, targets, today });
  assertEqual(result?.days, 2);
  assertEqual(result?.averageGrams, 25);
});

test("testWithoutATargetNothingIsShort", () => {
  const entries = [entry("2026-09-08", 10), entry("2026-09-07", 10)];
  assertNil(ProteinShortfall.makeEntries({ entries, targets: undefined, today }));
  const zero = NutritionTargets.make({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  assertNil(ProteinShortfall.makeEntries({ entries, targets: zero, today }));
});
