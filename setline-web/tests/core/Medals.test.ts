// Port of ios/SetlineCore/Tests/SetlineCoreTests/MedalsTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertTrue } from "../helpers";
import { ExerciseResult, LoggedSet, TrainingSession } from "../../src/core/Domain/Model";
import { Medals } from "../../src/core/Progress/Medals";
import { dateFromEpoch } from "../../src/core/Support/calendar";

describe("MedalsTests", () => {
  const session = (day: number, weight: number, reps = 5, id?: string): TrainingSession =>
    TrainingSession.make({
      id: id ?? `s${day}`,
      date: dateFromEpoch(day * 86_400),
      dayID: "push",
      dayLabel: "Push",
      completion: 100,
      results: [
        ExerciseResult.make({ exerciseID: "bench", name: "Bench", sets: [LoggedSet.make({ index: 0, weightKg: weight, reps })] }),
      ],
    });

  const medals = (today: TrainingSession, all: TrainingSession[]) => Medals.medals({ for: today, in: all });

  test("testNoMedalBeforeThreeComparableSessions", () => {
    const history = [session(1, 80), session(2, 82.5)];
    const today = session(3, 100);
    assertTrue(medals(today, [...history, today]).length === 0);
  });

  test("testHeaviestDayEverIsGold", () => {
    const history = [session(1, 80), session(2, 85), session(3, 90)];
    const today = session(4, 95);
    const medal = medals(today, [...history, today])[0];
    assertTrue(medal !== undefined);
    assertEqual(medal.place, 1);
    assertEqual(medal.weightKg, 95);
    assertEqual(medal.sessionsCompared, 3);
  });

  test("testSecondAndThirdBestEarnSilverAndBronze", () => {
    const history = [session(1, 80), session(2, 100), session(3, 90), session(4, 70)];
    const silver = session(5, 95);
    assertEqual(medals(silver, [...history, silver])[0]?.place, 2);
    const bronze = session(5, 85);
    assertEqual(medals(bronze, [...history, bronze])[0]?.place, 3);
    const none = session(5, 75);
    assertTrue(medals(none, [...history, none]).length === 0);
  });

  test("testMoreRepsAtTheSameLoadCountsAsAStrongerEffort", () => {
    const history = [session(1, 100, 5), session(2, 100, 5), session(3, 100, 6)];
    const today = session(4, 100, 8);
    assertEqual(medals(today, [...history, today])[0]?.place, 1);
  });

  test("testLaterSessionsNeverCount", () => {
    const history = [session(1, 80), session(2, 85), session(3, 90)];
    const today = session(4, 95);
    const later = session(9, 140);
    assertEqual(medals(today, [...history, today, later])[0]?.place, 1);
  });

  test("testMatchingTheBestIsSilverNotGold", () => {
    const history = [session(1, 80), session(2, 95), session(3, 90)];
    const today = session(4, 95);
    assertEqual(medals(today, [...history, today])[0]?.place, 2);
  });

  test("testRepeatingTheSameWeightEveryTimeEarnsNothing", () => {
    const history = [session(1, 100), session(2, 100), session(3, 100)];
    const today = session(4, 100);
    assertTrue(medals(today, [...history, today]).length === 0);
  });

  test("testTheHeaviestWeightEverIsGoldEvenWhenFewerReps", () => {
    // 100 × 8 estimates stronger than 102.5 × 6, but 102.5 is heavier
    // than anything before: the records call it the heaviest ever.
    const history = [session(1, 100, 8), session(2, 100, 8), session(3, 95, 8)];
    const today = session(4, 102.5, 6);
    const medal = medals(today, [...history, today])[0];
    assertTrue(medal !== undefined);
    assertEqual(medal.place, 1);
    assertEqual(medal.weightKg, 102.5);
  });
});
