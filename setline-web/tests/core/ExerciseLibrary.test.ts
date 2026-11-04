import { describe, test } from "node:test";
import { ExerciseLibrary, ExerciseLibrary_Entry } from "../../src/core/Catalog/ExerciseLibrary";
import { ExercisePicker } from "../../src/core/Progress/ExercisePicker";
import { CustomExercise } from "../../src/core/Domain/Substitution";
import { assertEqual, assertTrue } from "../helpers";

const entry = (id: string, name: string, extra: Partial<ExerciseLibrary_Entry> = {}): ExerciseLibrary_Entry => ({
  id,
  name,
  equipment: "barbell",
  primaryMuscles: ["chest"],
  mechanic: "compound",
  category: "strength",
  ...extra,
});

const library = new ExerciseLibrary([
  entry("Landmine_Press", "Landmine Press", { primaryMuscles: ["shoulders"] }),
  entry("Landmine_Row", "Landmine Row", { primaryMuscles: ["middle back"] }),
  entry("Single_Arm_Landmine_Press", "Single Arm Landmine Press", { primaryMuscles: ["shoulders"] }),
  entry("Hamstring_Stretch", "Hamstring Stretch", { category: "stretching", primaryMuscles: ["hamstrings"] }),
  entry("Barbell_Squat", "Barbell Squat", { primaryMuscles: ["quadriceps"] }),
]);

describe("ExerciseLibraryTests", () => {
  test("testEveryWordMustMatchShortestFirst", () => {
    assertEqual(library.search("landmine press").map((e) => e.id), ["Landmine_Press", "Single_Arm_Landmine_Press"]);
  });

  test("testOnlyStrengthWork", () => {
    assertEqual(library.search("stretch").length, 0);
  });

  test("testWhatTheCatalogueHasIsNotOfferedAgain", () => {
    assertEqual(library.search("squat", { excludingNames: new Set(["Barbell squat"]) }).length, 0);
  });

  test("testAddingKeepsGroupAndPhotos", () => {
    const custom = ExerciseLibrary_Entry.customExercise(library.search("landmine row")[0]);
    assertEqual(custom.muscleGroup, "rug");
    assertEqual(custom.photoFolder, "Landmine_Row");
    assertEqual(custom.equipment, "barbell");
    assertTrue(custom.isCompound);
    // It comes back through sync with both, and the picker lists it.
    const back = CustomExercise.decode(CustomExercise.encode(custom));
    assertEqual(back.muscleGroup, "rug");
    assertEqual(back.photoFolder, "Landmine_Row");
    const rows = ExercisePicker.rowsSessions({ sessions: [], custom: [back] });
    assertTrue(rows.some((r) => r.exerciseID === custom.id && r.group === "rug"));
  });

  test("testAnExerciseMadeByHandEncodesAsBefore", () => {
    const made = CustomExercise.make({ name: "Cable thing", createdAt: new Date("2026-01-01T00:00:00Z") });
    const json = CustomExercise.encode(made) as Record<string, unknown>;
    assertEqual(Object.keys(json).sort(), ["createdAt", "equipment", "id", "isCompound", "name"]);
    assertTrue(!ExercisePicker.rowsSessions({ sessions: [], custom: [made] }).some((r) => r.exerciseID === made.id));
  });
});
