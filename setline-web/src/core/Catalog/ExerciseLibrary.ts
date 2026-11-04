// ExerciseLibrary.swift — the online exercise library: free-exercise-db's
// exercises (Unlicense), for when the picker's own list runs out. Strength work
// only — no stretches, cardio or plyometrics — and nothing the catalogue
// already holds.
import type { MuscleGroup } from "../Domain/MuscleGroup";
import { MuscleGroup as Groups } from "../Domain/MuscleGroup";
import { CustomExercise } from "../Domain/Substitution";
import type { Equipment } from "../Domain/Vocabulary";

export interface ExerciseLibrary_Entry {
  /** The dataset's folder, which is also where its photos are. */
  id: string;
  name: string;
  equipment: string | null;
  primaryMuscles: string[];
  mechanic: string | null;
  category: string;
}

const categories = new Set(["strength", "powerlifting", "olympic weightlifting", "strongman"]);

export const ExerciseLibrary_Entry = {
  /** Which of the picker's six groups its main muscle falls in. */
  muscleGroup(self: ExerciseLibrary_Entry): MuscleGroup | undefined {
    switch (self.primaryMuscles[0]) {
      case "chest":
        return Groups.borst;
      case "lats":
      case "middle back":
      case "lower back":
      case "traps":
      case "neck":
        return Groups.rug;
      case "shoulders":
        return Groups.schouders;
      case "biceps":
      case "triceps":
      case "forearms":
        return Groups.armen;
      case "quadriceps":
      case "hamstrings":
      case "glutes":
      case "calves":
      case "abductors":
      case "adductors":
        return Groups.benen;
      case "abdominals":
        return Groups.core;
      default:
        return undefined;
    }
  },

  equipmentKind(self: ExerciseLibrary_Entry): Equipment {
    switch (self.equipment) {
      case "barbell":
      case "e-z curl bar":
        return "barbell";
      case "dumbbell":
      case "kettlebells":
        return "dumbbell";
      case "cable":
      case "bands":
        return "cable";
      case "machine":
      case "other":
        return "machineSelectorised";
      default:
        return "bodyweight";
    }
  },

  /** "Barbell", "Bodyweight", "E-z curl bar". */
  equipmentLabel(self: ExerciseLibrary_Entry): string {
    if (self.equipment === null || self.equipment === "body only") return "Bodyweight";
    return self.equipment.slice(0, 1).toUpperCase() + self.equipment.slice(1);
  },

  /** What adding it writes: an exercise of your own that keeps its group, so the picker lists it, and its photos. */
  customExercise(self: ExerciseLibrary_Entry): CustomExercise {
    return CustomExercise.make({
      name: self.name,
      equipment: ExerciseLibrary_Entry.equipmentKind(self),
      isCompound: self.mechanic === "compound",
      muscleGroup: ExerciseLibrary_Entry.muscleGroup(self),
      photoFolder: self.id,
    });
  },
};

export class ExerciseLibrary {
  readonly entries: ExerciseLibrary_Entry[];

  constructor(entries: ExerciseLibrary_Entry[]) {
    this.entries = entries.filter((entry) => categories.has(entry.category));
  }

  /** Every word of the query in the name, shortest names first, so the plain version of a movement comes before its variations. */
  search(query: string, a: { excludingNames?: Set<string>; limit?: number } = {}): ExerciseLibrary_Entry[] {
    const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
    if (words.length === 0) return [];
    const excluded = new Set([...(a.excludingNames ?? [])].map((n) => n.toLowerCase()));
    return this.entries
      .filter((entry) => {
        const name = entry.name.toLowerCase();
        return !excluded.has(name) && words.every((w) => name.includes(w));
      })
      .sort((x, y) => x.name.length - y.name.length || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
      .slice(0, a.limit ?? 8);
  }
}
