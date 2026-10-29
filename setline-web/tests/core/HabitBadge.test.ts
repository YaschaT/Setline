// Port of ios/SetlineCore/Tests/SetlineCoreTests/HabitBadgeTests.swift.
import { describe, test } from "node:test";
import { assertClose, assertEqual, assertFalse, assertTrue } from "../helpers";
import { Schedule } from "../../src/core/Engine/Schedule";
import { Meal, NutritionEntry } from "../../src/core/Nutrition/NutritionDay";
import { Milestone, Milestone_Kind, Milestones } from "../../src/core/Progress/Milestones";
import { GoalBand } from "../../src/core/Progress/WeightGoal";
import { dateFrom } from "../../src/core/Support/calendar";

describe("HabitBadgeTests", () => {
  // The Swift test pins a Brussels Gregorian calendar; TZ is Europe/Brussels here.
  const day = (n: number): Date => dateFrom({ year: 2026, month: 9, day: 1 + n });

  const entry = (n: number, meal: Meal, protein: number): NutritionEntry =>
    NutritionEntry.make({
      id: `${n}-${meal}`,
      date: Schedule.dateKey(day(n)),
      meal,
      name: "x",
      calories: 500,
      protein,
      carbs: 50,
      fat: 10,
    });

  const badge = (badges: Milestone[], id: string): Milestone => {
    const found = badges.find((m) => m.id === id);
    if (found === undefined) throw new Error(`no badge ${id}`);
    return found;
  };

  test("testLoggingProteinAndFullDays", () => {
    const entries: NutritionEntry[] = [];
    for (let n = 0; n < 10; n++) {
      entries.push(entry(n, Meal.ontbijt, 60), entry(n, Meal.lunch, 60), entry(n, Meal.avondeten, 60));
    }
    const badges = Milestones.habits({
      entries,
      proteinTarget: 160,
      weighInDates: [],
      photoDates: [],
      bestWeeksOnTrack: 0,
    });
    assertTrue(Milestone.isReached(badge(badges, "logging-7")));
    assertFalse(Milestone.isReached(badge(badges, "logging-30")));
    assertTrue(Milestone.isReached(badge(badges, "protein-5")));
    assertFalse(Milestone.isReached(badge(badges, "protein-14")));
    assertTrue(Milestone.isReached(badge(badges, "fullday-10")));
    assertEqual(Milestone_Kind.family(badge(badges, "logging-7").kind), "food");
  });

  test("testProteinStreakBreaksOnAGap", () => {
    const entries = [0, 1, 2, 4, 5].map((n) => entry(n, Meal.lunch, 170));
    const badges = Milestones.habits({
      entries,
      proteinTarget: 160,
      weighInDates: [],
      photoDates: [],
      bestWeeksOnTrack: 0,
    });
    assertEqual(badge(badges, "protein-5").current, 3);
  });

  test("testGoalBandGrowsAtTheGoalsPace", () => {
    const band = GoalBand.make({ goal: "leanBulk", start: day(0), startKg: 80 });
    const later = GoalBand.range(band, { on: day(28) });
    assertClose(later.lowerBound, 80.32, 0.01);
    assertClose(later.upperBound, 80.8, 0.01);
  });
});
