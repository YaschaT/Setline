import { describe, test } from "node:test";
import { assertEqual } from "../helpers";
import { ExercisePicker } from "../../src/core/Progress/ExercisePicker";
import { Fixtures } from "./Fixtures";

describe("ExercisePickerTests", () => {
  // The catalogue keys some exercises per training day; the picker lists each physical exercise once.
  test("testTheSameExerciseUnderTwoIdsIsOfferedOnce", () => {
    const names = ExercisePicker.rowsSessions({ sessions: [] }).map((r) => r.name.toLowerCase());
    assertEqual(names.length, new Set(names).size);
  });

  test("testTheIdTrainedMostRecentlyStandsForTheExercise", () => {
    const session = Fixtures.session({ id: "s", daysAgo: 1, exerciseID: "upper-shoulder", sets: [{ weight: 40, reps: 10, rir: undefined }] });
    const shoulder = ExercisePicker.rowsSessions({ sessions: [session] }).filter((r) => r.name.toLowerCase() === "machine shoulder press");
    assertEqual(shoulder.length, 1);
    assertEqual(shoulder[0]?.exerciseID, "upper-shoulder");
    assertEqual(shoulder[0]?.topSetKg, 40);
  });
});
