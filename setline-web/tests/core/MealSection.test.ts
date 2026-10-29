// Port of ios/SetlineCore/Tests/SetlineCoreTests/MealSectionTests.swift.
//
// Artboards 42a–42d: the four headings a day is read in, the amount behind a
// row, and the two lists the add sheet offers.
import { test } from "node:test";
import { Schedule } from "../../src/core/Engine/Schedule";
import { JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { FoodMemory } from "../../src/core/Nutrition/FoodMemory";
import { Meal, MealSection, NutritionDay, NutritionEntry } from "../../src/core/Nutrition/NutritionDay";
import { deepEqual } from "../../src/core/Support/swift";
import { assertEqual, assertGreaterThanOrEqual, assertLessThanOrEqual, assertNil, assertTrue } from "../helpers";

// The Swift tests pin a Gregorian calendar in Europe/Brussels; the web uses
// the local calendar, and the test run is pinned to Europe/Brussels.

function entry(
  name: string,
  o: {
    date?: string;
    meal?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    amount?: number;
    unit?: string;
    loggedAt?: Date;
  } = {},
): NutritionEntry {
  const date = o.date ?? "2026-09-10";
  const meal = o.meal ?? "Lunch";
  return NutritionEntry.make({
    id: `${name}-${date}-${meal}`, date, meal, name,
    calories: o.calories ?? 100, protein: o.protein ?? 0, carbs: o.carbs ?? 0, fat: o.fat ?? 0,
    amount: o.amount, unit: o.unit, loggedAt: o.loggedAt,
  });
}

function day(entries: NutritionEntry[]): NutritionDay {
  return NutritionDay.make({ dateKey: "2026-09-10", entries, targets: undefined });
}

const isoDate = (s: string) => LegacyAdapter.isoDate(s);

// MARK: - 42a · four headings, always four

test("testADayIsReadUnderFourHeadingsInTheOrderTheyAreEaten", () => {
  assertEqual(NutritionDay.sections(day([])).map((s) => s.title), ["Breakfast", "Lunch", "Dinner", "Snacks"]);
});

test("testAnEmptyMealKeepsItsHeadingSoALogAtNoonStillHasAShape", () => {
  const sections = NutritionDay.sections(day([entry("Kaas", { meal: "Lunch", calories: 100 })]));
  assertEqual(sections.length, 4);
  assertEqual(sections.filter(MealSection.isEmpty).map((s) => s.title), ["Breakfast", "Dinner", "Snacks"]);
  assertEqual(sections.find((s) => s.title === "Lunch")?.calories, 100);
});

test("testSnacksGathersEveryMealThisAppDoesNotDrawItsOwnHeadingFor", () => {
  const sections = NutritionDay.sections(day([
    entry("Whey", { meal: "Pre-workout", calories: 120 }),
    entry("Banaan", { meal: "Snack", calories: 190 }),
    entry("Soep", { meal: "Brunch", calories: 60 }),
  ]));
  const snacks = sections.find((s) => s.title === "Snacks");
  assertEqual(snacks?.entries.map((e) => e.name), ["Whey", "Banaan", "Soep"], "no entry is hidden by a heading");
  assertEqual(snacks?.calories, 370);
});

test("testAMealsHeadingCountsOnlyItsOwnFood", () => {
  const sections = NutritionDay.sections(day([
    entry("Havermout", { meal: "Ontbijt", calories: 375 }),
    entry("Magere kwark", { meal: "Ontbijt", calories: 145 }),
    entry("Kaas", { meal: "Lunch", calories: 100 }),
  ]));
  assertEqual(sections.find((s) => s.title === "Breakfast")?.calories, 520);
  assertEqual(sections.find((s) => s.title === "Lunch")?.calories, 100);
});

test("testEntriesKeepTheOrderTheyWereLoggedIn", () => {
  // 42a's annotation: nothing is re-sorted by hour, and an entry's own
  // time is never manufactured from the meal it sits under.
  const sections = NutritionDay.sections(day([
    entry("Kaas", { meal: "Lunch", loggedAt: new Date(3_000 * 1000) }),
    entry("Boterham", { meal: "Lunch", loggedAt: new Date(1_000 * 1000) }),
  ]));
  assertEqual(sections.find((s) => s.title === "Lunch")?.entries.map((e) => e.name), ["Kaas", "Boterham"]);
});

// MARK: - 42d · the amount behind a row

test("testAPortionReadsAsTheRowWritesIt", () => {
  assertEqual(NutritionEntry.portion(entry("Havermout", { amount: 100, unit: "g" })), "100 g");
  assertEqual(NutritionEntry.portion(entry("Boterham", { amount: 2, unit: "sneden" })), "2 sneden");
  assertEqual(NutritionEntry.portion(entry("Yoghurt", { amount: 1.5, unit: "potje" })), "1,5 potje");
  assertNil(NutritionEntry.portion(entry("Kaas")), "an entry the web app wrote kept no amount");
});

test("testChangingTheAmountScalesWhatItIsWorth", () => {
  const kwark = entry("Magere kwark", { calories: 145, protein: 24, carbs: 10, fat: 0.5, amount: 250, unit: "g" });
  const smaller = NutritionEntry.scaled(kwark, { to: 125 });
  assertEqual(smaller.amount, 125);
  assertEqual(smaller.calories, 73);
  assertEqual(smaller.protein, 12);
  assertEqual(smaller.carbs, 5);
  assertEqual(smaller.fat, 0.3);
  assertEqual(smaller.id, kwark.id, "the same row, at another amount");
  assertEqual(smaller.date, kwark.date);
  assertEqual(smaller.meal, kwark.meal);
});

test("testAnEntryWithoutAnAmountCannotBeScaledAndIsLeftAlone", () => {
  const kaas = entry("Kaas", { calories: 100, protein: 7 });
  assertEqual(NutritionEntry.scaled(kaas, { to: 60 }), kaas);
});

test("testTheStepperStepsInSomethingUsefulAndSaysWhichInItsLabel", () => {
  assertEqual(NutritionEntry.step(entry("a", { amount: 250, unit: "g" })), 25);
  assertEqual(NutritionEntry.step(entry("a", { amount: 100, unit: "g" })), 10);
  assertEqual(NutritionEntry.step(entry("a", { amount: 30, unit: "g" })), 5);
  assertEqual(NutritionEntry.step(entry("a", { amount: 8, unit: "g" })), 1);
  assertEqual(NutritionEntry.step(entry("a", { amount: 500, unit: "ml" })), 25);
  assertEqual(NutritionEntry.step(entry("a", { amount: 2, unit: "sneden" })), 1, "half a slice is not weighable");
  assertEqual(NutritionEntry.step(entry("a", { amount: 300, unit: "stuk" })), 1);
});

test("testFilingAnEntryUnderAnotherMealKeepsItsOwnClock", () => {
  const logged = new Date(1_757_486_400 * 1000);
  const late = entry("Boterham", { meal: "Ontbijt", amount: 2, unit: "sneden", loggedAt: logged });
  const moved = NutritionEntry.filed(late, { under: Meal.lunch });
  assertEqual(moved.meal, "Lunch");
  assertEqual(moved.loggedAt, logged, "the heading says which meal it was; the clock is not rewritten");
  assertEqual(moved.id, late.id);
  assertEqual(moved.date, late.date);
  assertEqual(moved.calories, late.calories);
});

test("testWhatIsWrittenCarriesTheAmountAndTheHourOnlyWhenThereIsOne", () => {
  const withAmount = entry("Havermout", { amount: 100, unit: "g", loggedAt: isoDate("2026-09-10T07:40:00.000Z") });
  const object = JSONValue.objectValue(NutritionEntry.json(withAmount));
  if (object === undefined) throw new Error("not an object");
  assertEqual(object["amount"], 100);
  assertEqual(object["unit"], "g");
  assertEqual(object["loggedAt"], "2026-09-10T07:40:00.000Z");

  const plain = JSONValue.objectValue(NutritionEntry.json(entry("Kaas")));
  if (plain === undefined) throw new Error("not an object");
  assertNil(plain["amount"], "no key where there is no amount");
  assertNil(plain["unit"]);
  assertNil(plain["loggedAt"]);
  assertEqual(plain["name"], "Kaas", "and the entry still reads everywhere");
});

test("testAnAmountSurvivesBeingWrittenAndReadBack", () => {
  const written = entry("Magere kwark", {
    meal: "Ontbijt", calories: 145, protein: 24, carbs: 10, fat: 0.5,
    amount: 250, unit: "g", loggedAt: isoDate("2026-09-10T07:40:00.000Z"),
  });
  const state = LegacyState.make({ raw: { nutritionEntries: [NutritionEntry.json(written)] } });
  const read = LegacyAdapter.nutritionEntries({ from: state })[0];
  if (read === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(read, written);
});

// MARK: - 42c · what this account has eaten before

test("testWhatIsEatenAtThisMealMostOftenComesFirst", () => {
  const entries = [
    entry("Kipfilet", { date: "2026-09-01", meal: "Avondeten" }),
    entry("Rijst, gekookt", { date: "2026-09-01", meal: "Avondeten" }),
    entry("Kipfilet", { date: "2026-09-02", meal: "Avondeten" }),
    entry("Broccoli", { date: "2026-09-02", meal: "Avondeten" }),
    entry("Rijst, gekookt", { date: "2026-09-03", meal: "Avondeten" }),
    entry("Havermout", { date: "2026-09-03", meal: "Ontbijt" }),
  ];
  assertEqual(
    FoodMemory.often({ at: Meal.avondeten, in: entries }).map((e) => e.name),
    ["Rijst, gekookt", "Kipfilet", "Broccoli"],
    "twice, twice, once — and of the two twices the one eaten last night comes first",
  );
});

test("testTheMostRecentVersionOfAFoodIsTheOneOffered", () => {
  const entries = [
    entry("Kipfilet", { date: "2026-09-01", meal: "Avondeten", calories: 250, amount: 150, unit: "g" }),
    entry("Kipfilet", { date: "2026-09-02", meal: "Avondeten", calories: 290, amount: 180, unit: "g" }),
  ];
  const offered = FoodMemory.often({ at: Meal.avondeten, in: entries })[0];
  if (offered === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(offered.amount, 180, "the amount it was last eaten at, not an average");
  assertEqual(offered.calories, 290);
});

test("testTodaysOwnFoodIsNotOfferedBackToTheDayItIsAlreadyOn", () => {
  const entries = [
    entry("Kipfilet", { date: "2026-09-09", meal: "Avondeten" }),
    entry("Broccoli", { date: "2026-09-10", meal: "Avondeten" }),
  ];
  assertEqual(FoodMemory.often({ at: Meal.avondeten, in: entries, excluding: "2026-09-10" }).map((e) => e.name), ["Kipfilet"]);
  assertEqual(FoodMemory.recent({ in: entries, excluding: "2026-09-10" }).map((e) => e.name), ["Kipfilet"]);
});

test("testRecentIsTheLastThingsLoggedWhateverMealTheyWereAt", () => {
  const entries = [
    entry("Havermout", { date: "2026-09-01", meal: "Ontbijt" }),
    entry("Kaas", { date: "2026-09-02", meal: "Lunch" }),
    entry("Magere kwark", { date: "2026-09-03", meal: "Ontbijt" }),
    entry("Whey", { date: "2026-09-03", meal: "Snack" }),
  ];
  assertEqual(FoodMemory.recent({ in: entries, limit: 3 }).map((e) => e.name), ["Whey", "Magere kwark", "Kaas"], "newest first");
});

test("testAFoodAppearsOnceInRecentHoweverOftenItWasLogged", () => {
  const entries = [
    entry("Whey", { date: "2026-09-01", meal: "Snack" }),
    entry("Whey", { date: "2026-09-02", meal: "Snack" }),
    entry("Kaas", { date: "2026-09-02", meal: "Lunch" }),
  ];
  assertEqual(FoodMemory.recent({ in: entries }).map((e) => e.name), ["Kaas", "Whey"]);
});

test("testAnAccountThatHasLoggedNothingIsOfferedNothing", () => {
  // 42b's rule: no fabricated foods, no suggestions, no estimates.
  assertTrue(FoodMemory.often({ at: Meal.ontbijt, in: [] }).length === 0);
  assertTrue(FoodMemory.recent({ in: [] }).length === 0);
});

test("testLoggingSomethingAgainIsANewEntryOnThisDayAtTheSameAmount", () => {
  const before = entry("Kipfilet", {
    date: "2026-09-02", meal: "Avondeten", calories: 290, protein: 62, amount: 180, unit: "g",
    loggedAt: new Date(1_000 * 1000),
  });
  const opened = isoDate("2026-09-10T18:00:00.000Z")!;
  const tapped = isoDate("2026-09-10T18:30:00.000Z")!;
  const again = FoodMemory.repeated(before, { on: opened, meal: Meal.lunch, id: "food-2", loggedAt: tapped });

  assertEqual(again.id, "food-2", "a new row, not the old one rewritten");
  assertEqual(again.date, "2026-09-10");
  assertEqual(again.meal, "Lunch", "the meal it is being added to");
  assertEqual(again.name, before.name);
  assertEqual(again.amount, 180);
  assertEqual(again.unit, "g");
  assertEqual(again.calories, 290);
  assertEqual(again.protein, 62);
  assertEqual(again.loggedAt, tapped, "the moment it was logged, not the moment the screen opened");
});

/**
 * Left to itself, a repeated entry carries the moment it is made — never
 * the day's date, which is the moment the food screen was opened.
 */
test("testARepeatedEntryIsStampedWhenItIsLogged", () => {
  const before = entry("Kipfilet", { date: "2026-09-02", meal: "Avondeten", amount: 180, unit: "g" });
  const opened = new Date(Date.now() - 40 * 60 * 1000);
  const ahead = new Date();
  const again = FoodMemory.repeated(before, { on: opened, meal: Meal.lunch });
  const behind = new Date();

  const stamped = again.loggedAt;
  if (stamped === undefined) throw new Error("XCTUnwrap failed");
  assertGreaterThanOrEqual(stamped.getTime(), ahead.getTime());
  assertLessThanOrEqual(stamped.getTime(), behind.getTime());
  assertEqual(again.date, Schedule.dateKey(opened), "the day is still the one the screen was showing");
});

// MARK: - Reading a day changes nothing

test("testReadingAndPreviewingADayLeavesTheAccountAsItWas", () => {
  const stored: JSONValue[] = [
    NutritionEntry.json(entry("Havermout", { meal: "Ontbijt", amount: 100, unit: "g" })),
    NutritionEntry.json(entry("Kaas", { meal: "Lunch" })),
  ];
  const state = LegacyState.make({ raw: { nutritionEntries: stored } });
  const before = structuredClone(state.raw);

  const entries = LegacyAdapter.nutritionEntries({ from: state });
  const today = NutritionDay.make({ dateKey: "2026-09-10", entries, targets: undefined });
  for (const section of NutritionDay.sections(today)) {
    for (const e of section.entries) {
      NutritionEntry.portion(e);
      NutritionEntry.step(e);
      NutritionEntry.scaled(e, { to: e.amount ?? 0 + 25 });
      NutritionEntry.filed(e, { under: section.meal });
      NutritionEntry.json(e);
    }
  }
  FoodMemory.often({ at: Meal.lunch, in: entries });
  FoodMemory.recent({ in: entries });

  assertTrue(deepEqual(state.raw, before), "looking at a day never writes one");
});
