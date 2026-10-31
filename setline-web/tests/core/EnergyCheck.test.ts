// Port of ios/SetlineCore/Tests/SetlineCoreTests/EnergyCheckTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertTrue } from "../helpers";
import { BodyProfile, EnergyCheck } from "../../src/core/Progress/EnergyCheck";

/** Nutrition › Your plan: whether the eating fits the goal, by the equations. */
describe("EnergyCheckTests", () => {
  const now = new Date(2026, 9, 31, 12);
  const profile: BodyProfile = { heightCm: 182, sex: "male", birthYear: 1999 };
  const check = (a: { profile?: BodyProfile; target?: number; kcal?: number; protein?: number } = { target: 2250, kcal: 696, protein: 71 }) =>
    EnergyCheck.make({
      profile: a.profile ?? profile,
      weightKg: 82.4,
      goal: "cut",
      workoutsPerWeek: 2,
      calorieTarget: a.target,
      averageKcal: a.kcal,
      averageProtein: a.protein,
      now,
    });

  test("Mifflin–St Jeor times activity gives maintenance", () => {
    const energy = check();
    assertEqual(energy.bmr, 1830);
    assertEqual(energy.activityFactor, 1.375);
    assertEqual(energy.maintenance, 2520);
    assertEqual(energy.bmi, 24.9);
    assertEqual(energy.bmiLabel, "Healthy range");
  });

  test("a cut never asks to eat below resting energy", () => {
    const energy = check();
    assertEqual(energy.calorieRange.lowerBound, 1850);
    assertEqual(energy.calorieRange.upperBound, 2050);
    assertEqual(energy.proteinRange.lowerBound, 165);
    assertEqual(energy.proteinRange.upperBound, 198);
  });

  test("target, intake and protein are judged against the range", () => {
    const energy = check();
    assertEqual(energy.target, "high");
    assertEqual(energy.intake, "low");
    assertEqual(energy.protein, "low");
    const good = check({ target: 1950, kcal: 2000, protein: 170 });
    assertEqual(good.target, "good");
    assertEqual(good.intake, "good");
    assertEqual(good.protein, "good");
    const unknown = check({});
    assertEqual(unknown.target, "unknown");
    assertEqual(unknown.intake, "unknown");
  });

  test("sex changes resting energy by 166", () => {
    assertEqual(check({ profile: { heightCm: 182, sex: "female", birthYear: 1999 }, target: 2250, kcal: 696, protein: 71 }).bmr, 1670);
  });

  test("the weight trend decides once it can", () => {
    assertEqual(EnergyCheck.direction({ kind: "onTrack" }, "low"), "right");
    assertEqual(EnergyCheck.direction({ kind: "wrongWay" }, "good"), "off");
    assertEqual(EnergyCheck.direction({ kind: "tooEarly", weighInsNeeded: 2, daysNeeded: 5 }, "good"), "right");
    assertEqual(EnergyCheck.direction(undefined, "high"), "off");
    assertEqual(EnergyCheck.direction({ kind: "unclear" }, "unknown"), "unknown");
  });

  test("workouts a week come from the last four weeks", () => {
    const dates = Array.from({ length: 10 }, (_, i) => new Date(now.getTime() - i * 3 * 86_400_000));
    assertEqual(EnergyCheck.workoutsPerWeek(dates, now), 2.5);
    assertTrue(!BodyProfile.isValid({ heightCm: 182, sex: "male", birthYear: 2020 }, now));
    assertTrue(BodyProfile.isValid(profile, now));
  });
});
