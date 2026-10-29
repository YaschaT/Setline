import type { Muscle } from "./ExerciseAttributes";
import type { Exercise } from "./Model";
import { maxBy } from "../Support/swift";

/**
 * The six groups a reader picks an exercise from (40b).
 *
 * The engine thinks in nineteen muscles, because progression and
 * substitution need that resolution. A person looking for an exercise does
 * not: they think "borst" or "benen". This is the one place those nineteen
 * are folded into six, for choosing and for naming — nothing ranks, balances
 * or substitutes by it.
 */
export type MuscleGroup = "borst" | "rug" | "schouders" | "armen" | "benen" | "core";
export const MuscleGroup = {
  borst: "borst" as MuscleGroup,
  rug: "rug" as MuscleGroup,
  schouders: "schouders" as MuscleGroup,
  armen: "armen" as MuscleGroup,
  benen: "benen" as MuscleGroup,
  core: "core" as MuscleGroup,
  allCases: ["borst", "rug", "schouders", "armen", "benen", "core"] as MuscleGroup[],

  id(self: MuscleGroup): string {
    return self;
  },

  title(self: MuscleGroup): string {
    switch (self) {
      case "borst":
        return "Chest";
      case "rug":
        return "Back";
      case "schouders":
        return "Shoulders";
      case "armen":
        return "Arms";
      case "benen":
        return "Legs";
      case "core":
        return "Core";
    }
  },

  /**
   * Which of the six a muscle belongs to. Every muscle belongs to exactly
   * one, so no exercise can fall out of the picker.
   */
  of(muscle: Muscle): MuscleGroup {
    switch (muscle) {
      case "chestUpper":
      case "chestMid":
        return "borst";
      case "lat":
      case "upperBack":
      case "lowerBack":
      case "trap":
        return "rug";
      case "frontDelt":
      case "sideDelt":
      case "rearDelt":
        return "schouders";
      case "triceps":
      case "biceps":
      case "forearm":
        return "armen";
      case "glute":
      case "hamstring":
      case "quad":
      case "adductor":
      case "calf":
        return "benen";
      case "abs":
      case "obliques":
        return "core";
    }
  },
};

/**
 * `extension Exercise { var group: MuscleGroup? }` — exposed as
 * `Exercise.group(exercise)` on the companion in Model.ts.
 *
 * The group this exercise is filed under: the group of the muscle it
 * loads most. An exercise the catalogue has not authored attributes for
 * has no group, and the picker does not offer it.
 */
export function exerciseGroup(self: Exercise): MuscleGroup | undefined {
  const primary = self.attributes?.primaryMuscles;
  const heaviest = primary ? maxBy(primary, (a, b) => a.weight < b.weight) : undefined;
  if (!heaviest) return undefined;
  return MuscleGroup.of(heaviest.muscle);
}
