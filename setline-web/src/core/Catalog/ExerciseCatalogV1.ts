import type { Exercise } from "../Domain/Model";
import type { ExerciseRole } from "../Domain/Vocabulary";
import { dictionary } from "../Support/dictionary";
import { GeneratedExerciseCatalog } from "./ExerciseCatalog";
import { ExerciseMetadata } from "./ExerciseMetadata";

// Swift statics are lazy; these are too, which also keeps the
// ExerciseCatalog ↔ ExerciseCatalogV1 re-export cycle safe at load time.
let allCache: Record<string, Exercise> | undefined;
let rolesCache: Record<string, ExerciseRole> | undefined;

function enrich(exercise: Exercise): Exercise {
  return {
    ...exercise,
    station: ExerciseMetadata.stations[exercise.id],
    attributes: ExerciseMetadata.attributes[exercise.id],
  };
}

/**
 * The curated V1 exercise catalogue.
 *
 * Two sources, one table. `GeneratedExerciseCatalog` holds the 39 exercises
 * the shipped plans actually prescribe, transcribed from the web app.
 * `ExerciseMetadata.additions` holds the 54 adds — exercises no plan
 * prescribes: substitution targets, and the staples a lifter looks for in
 * the picker (back squat, deadlift, Nordic curl, hip abductor…). Both are
 * enriched here with the station and attribute metadata the ranking needs.
 *
 * The split matters: regenerating the plans must never silently drop curated
 * metadata, and adding a substitution target must never require touching a
 * generated file.
 */
export const ExerciseCatalog = {
  get all(): Record<string, Exercise> {
    if (!allCache) {
      const result = dictionary<Exercise>({});
      for (const [id, base] of Object.entries(GeneratedExerciseCatalog.exercises)) result[id] = enrich(base);
      for (const [id, base] of Object.entries(ExerciseMetadata.additions)) result[id] = enrich(base);
      allCache = result;
    }
    return allCache;
  },

  get roles(): Record<string, ExerciseRole> {
    if (!rolesCache) {
      // `merging(_:) { generated, _ in generated }`: the generated role wins.
      const result = dictionary<ExerciseRole>({ ...ExerciseMetadata.additionRoles });
      for (const [id, role] of Object.entries(GeneratedExerciseCatalog.roles)) result[id] = role;
      rolesCache = result;
    }
    return rolesCache;
  },

  /**
   * Every exercise the ranking may put in front of a user. Anything outside
   * this set can still be logged and progressed — it just isn't offered as
   * an alternative, because we have not authored the metadata to rank it.
   */
  get v1Recommendable(): Set<string> {
    return ExerciseMetadata.v1Recommendable;
  },

  exercise(id: string): Exercise | undefined {
    return ExerciseCatalog.all[id];
  },

  role(id: string): ExerciseRole {
    return ExerciseCatalog.roles[id] ?? "accessory";
  },

  get recommendable(): Exercise[] {
    return [...ExerciseCatalog.v1Recommendable].flatMap((id) => {
      const exercise = ExerciseCatalog.all[id];
      return exercise ? [exercise] : [];
    });
  },
};
