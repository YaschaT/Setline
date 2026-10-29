// Port of ios/SetlineCore/Tests/SetlineCoreTests/SetAdditionTests.swift
import { describe, test } from "node:test";
import { ExerciseResult, LoggedSet, TrainingSession } from "../../src/core/Domain/Model";
import { SetAddition, TrainingSession_adding } from "../../src/core/Sync/SetCorrection";
import { assertEqual } from "../helpers";

describe("SetAdditionTests", () => {
  function session(): TrainingSession {
    return TrainingSession.make({
      id: "s",
      date: new Date(),
      dayID: "push",
      dayLabel: "Push",
      completion: 100,
      results: [
        ExerciseResult.make({
          exerciseID: "flat-bench",
          name: "Flat bench press",
          sets: [LoggedSet.make({ index: 0, weightKg: 100, reps: 6 }), LoggedSet.make({ index: 1, weightKg: 100, reps: 6 })],
        }),
        ExerciseResult.make({ exerciseID: "pec-fly", name: "Pec fly", sets: [LoggedSet.make({ index: 0, weightKg: 40, reps: 12 })] }),
      ],
    });
  }

  test("testAddedSetsGoAfterTheOnesThereNumberedOn", () => {
    const extra = LoggedSet.make({ index: 99, weightKg: 100, reps: 5, origin: "sessionAdded" });
    const updated = TrainingSession_adding(session(), [SetAddition.make({ exerciseID: "flat-bench", sets: [extra, extra] })]);
    assertEqual(updated.results[0].sets.map((s) => s.index), [0, 1, 2, 3]);
    assertEqual(updated.results[0].sets[updated.results[0].sets.length - 1]?.reps, 5);
    assertEqual(updated.results[1].sets.length, 1);
  });

  test("testAnExerciseNotInTheWorkoutIsSkipped", () => {
    const base = session();
    const updated = TrainingSession_adding(base, [
      SetAddition.make({ exerciseID: "squat", sets: [LoggedSet.make({ index: 0, weightKg: 140, reps: 5 })] }),
    ]);
    assertEqual(updated, base);
    assertEqual(updated.results.map((r) => r.sets.length), [2, 1]);
  });
});
