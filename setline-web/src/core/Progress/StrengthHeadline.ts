import { ExerciseCatalog } from "../Catalog/ExerciseCatalog";
import type { Exercise, TrainingSession, WorkoutDay } from "../Domain/Model";
import { SetModifiers } from "../Domain/Vocabulary";
import { ExerciseHistory } from "../Engine/ExerciseHistory";
import { distantPast } from "../Support/progress";
import { compare, dec, maxBy } from "../Support/swift";
import { ExercisePicker_Row } from "./ExercisePicker";
import { StrengthProgress } from "./StrengthProgress";

/**
 * Which lift a screen leads with when it states one strength number.
 *
 * An estimated one-rep max says something about a squat, a bench or a row;
 * on a cable fly or a machine stack it is a number nobody lifts, and its
 * kilos run far ahead of a barbell's. So a headline is only ever a main lift
 * — what the plan calls primary or secondary compound, or a compound free
 * weight — and lifts are ranked by percent gained, which a heavy machine
 * cannot win just by being heavy.
 */
export const StrengthHeadline = {
  /** A lift whose estimated max means something. */
  isMainLift(exerciseID: string, a: { plan: WorkoutDay[]; catalog?: Record<string, Exercise> }): boolean {
    const catalog = a.catalog ?? ExerciseCatalog.all;
    const role = a.plan.flatMap((day) => day.exercises).find((exercise) => exercise.exerciseID === exerciseID)?.role;
    if (role !== undefined) {
      return role === "primaryStrength" || role === "secondaryCompound";
    }
    const exercise = catalog[exerciseID];
    if (exercise === undefined) return false;
    return exercise.isCompound && ["barbell", "dumbbell", "smith"].includes(exercise.equipment);
  },

  /** The change the screen shows, as a percent of where it started. */
  percentChange(progress: StrengthProgress): number | undefined {
    const change = progress.change;
    const shown = StrengthProgress.shownChange(progress);
    if (change === undefined || shown === undefined || !(change.baseline > 0)) return undefined;
    return dec((shown / change.baseline) * 100);
  },

  /** The comparable series the account has for one exercise. */
  progress(a: { exerciseID: string; name: string; sessions: TrainingSession[]; plan: WorkoutDay[] }): StrengthProgress {
    const modifiers =
      ExerciseHistory.series({ exerciseID: a.exerciseID, from: a.sessions })[0]?.modifiers ??
      a.plan.flatMap((day) => day.exercises).find((exercise) => exercise.exerciseID === a.exerciseID)?.modifiers ??
      SetModifiers.none;
    return StrengthProgress.make({ exerciseID: a.exerciseID, name: a.name, modifiers, sessions: a.sessions });
  },

  /**
   * The main lift that gained most, by percent; with none gaining, the
   * main lift trained last. Only lifts with a line to draw (two or more
   * estimates) qualify. `nil` while there is none.
   */
  pick(a: {
    rows: ExercisePicker_Row[];
    sessions: TrainingSession[];
    plan: WorkoutDay[];
    catalog?: Record<string, Exercise>;
  }): StrengthProgress | undefined {
    const catalog = a.catalog ?? ExerciseCatalog.all;
    const drawn = a.rows
      .filter(
        (row) =>
          ExercisePicker_Row.hasHistory(row) && StrengthHeadline.isMainLift(row.exerciseID, { plan: a.plan, catalog }),
      )
      .map((row) =>
        StrengthHeadline.progress({ exerciseID: row.exerciseID, name: row.name, sessions: a.sessions, plan: a.plan }),
      )
      .filter((progress) => progress.estimate !== undefined && progress.points.length > 1);
    const best = maxBy(
      drawn.filter((progress) => (StrengthHeadline.percentChange(progress) ?? 0) > 0),
      (x, y) =>
        compare(
          [StrengthHeadline.percentChange(x) ?? 0, x.name],
          [StrengthHeadline.percentChange(y) ?? 0, y.name],
        ) < 0,
    );
    if (best !== undefined) return best;
    return maxBy(
      drawn,
      (x, y) =>
        (x.points[x.points.length - 1]?.date ?? distantPast).getTime() <
        (y.points[y.points.length - 1]?.date ?? distantPast).getTime(),
    );
  },
};
