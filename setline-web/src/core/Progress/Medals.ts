import { LoggedSet, type TrainingSession } from "../Domain/Model";
import { SetModifiers } from "../Domain/Vocabulary";
import { Estimates } from "../Engine/Estimates";
import { ExerciseHistory } from "../Engine/ExerciseHistory";
import { maxBy, maxOf } from "../Support/swift";

// Gold, silver and bronze for a lift: the day's best effort on an exercise
// ranked against every comparable session before it. A workout that sets
// no record can still be the second- or third-best day a lift has had, and
// that is worth saying — the way a run that misses a best time still earns
// a medal for the second-fastest.
//
// The effort is the strongest working set by estimated one-rep max, or by
// load where reps run past the estimate's range. Medals wait for the same
// reference the records do: three comparable sessions before this one.

export type LiftMedal_Place = 1 | 2 | 3;

export const LiftMedal_Place = {
  gold: 1 as LiftMedal_Place,
  silver: 2 as LiftMedal_Place,
  bronze: 3 as LiftMedal_Place,
  /** `Place(rawValue:)`. */
  fromRawValue(rawValue: number): LiftMedal_Place | undefined {
    return rawValue === 1 || rawValue === 2 || rawValue === 3 ? rawValue : undefined;
  },
  title(self: LiftMedal_Place): string {
    switch (self) {
      case 1:
        return "Best ever";
      case 2:
        return "2nd best";
      case 3:
        return "3rd best";
    }
  },
};

export interface LiftMedal {
  place: LiftMedal_Place;
  exerciseID: string;
  name: string;
  /** The set the medal is for. */
  weightKg: number;
  reps: number;
  /** Earlier sessions it was ranked against. */
  sessionsCompared: number;
}

export const LiftMedal = {
  make(a: {
    place: LiftMedal_Place;
    exerciseID: string;
    name: string;
    weightKg: number;
    reps: number;
    sessionsCompared: number;
  }): LiftMedal {
    return {
      place: a.place,
      exerciseID: a.exerciseID,
      name: a.name,
      weightKg: a.weightKg,
      reps: a.reps,
      sessionsCompared: a.sessionsCompared,
    };
  },
  id(self: LiftMedal): string {
    return self.exerciseID;
  },
};

/** Swift `Int.max`. */
const INT_MAX = Number.MAX_SAFE_INTEGER;

export const Medals = {
  /**
   * The effort a set stands for: its estimated one-rep max, or its load
   * where the estimate does not reach.
   */
  effort(set: LoggedSet): number {
    const load = set.weightKg ?? 0;
    return Estimates.e1RM({ weightKg: load, reps: set.reps }) ?? load;
  },

  /** The strongest working set of one appearance. */
  best(sets: LoggedSet[]): LoggedSet | undefined {
    return maxBy(
      sets.filter((set) => LoggedSet.countsTowardProgression(set) && (set.weightKg ?? 0) > 0),
      (x, y) => Medals.effort(x) < Medals.effort(y),
    );
  },

  /**
   * The place one exercise's sets earn against its history, if any.
   *
   * Two ways a day can rank: its strongest set (the estimate), and its
   * heaviest. The better of the two counts — so the heaviest weight ever
   * moved is always gold, as the records screen says it is, even on a day
   * whose estimate trails a lighter set done for more reps.
   */
  place(a: { for: LoggedSet[]; history: ExerciseHistory }): { place: LiftMedal_Place; set: LoggedSet } | undefined {
    const sets = a.for;
    const history = a.history;
    const strongest = Medals.best(sets);
    if (!ExerciseHistory.hasReference(history) || strongest === undefined) return undefined;
    const earlier = history.appearances.map((appearance) => appearance.sets);

    // Matching a day is not beating it: an equal effort ranks below the
    // day that did it first, so repeating a weight earns no gold.
    const byEffort =
      1 +
      earlier
        .flatMap((day) => {
          const best = Medals.best(day);
          return best === undefined ? [] : [Medals.effort(best)];
        })
        .filter((effort) => effort >= Medals.effort(strongest) - Estimates.epsilonKg).length;

    const heaviest = maxOf(
      sets.filter((set) => LoggedSet.countsTowardProgression(set) && (set.weightKg ?? 0) > 0),
      (set) => set.weightKg ?? 0,
    );
    const byLoad =
      heaviest === undefined
        ? INT_MAX
        : 1 +
          earlier
            .flatMap((day) => {
              const loads = day
                .filter((set) => LoggedSet.countsTowardProgression(set))
                .flatMap((set) => (set.weightKg === undefined ? [] : [set.weightKg]));
              return loads.length === 0 ? [] : [Math.max(...loads)];
            })
            .filter((load) => load >= (heaviest.weightKg ?? 0) - Estimates.epsilonKg).length;

    const rank = Math.min(byEffort, byLoad);
    const place = LiftMedal_Place.fromRawValue(rank);
    if (place === undefined) return undefined;
    return { place, set: byLoad < byEffort ? heaviest ?? strongest : strongest };
  },

  /**
   * Every medal one workout earns, gold first, judged against what came
   * before that day — never against sessions logged since.
   */
  medals(a: { for: TrainingSession; in: TrainingSession[] }): LiftMedal[] {
    const session = a.for;
    if (session.kind !== "workout") return [];
    return session.results
      .flatMap((result) => {
        const history = ExerciseHistory.build({
          exerciseID: result.exerciseID,
          modifiers: result.sets[0]?.modifiers ?? SetModifiers.none,
          from: a.in.filter((other) => other.id !== session.id),
          before: session.date,
        });
        const earned = Medals.place({ for: result.sets, history });
        if (earned === undefined) return [];
        return [
          LiftMedal.make({
            place: earned.place,
            exerciseID: result.exerciseID,
            name: result.name,
            weightKg: earned.set.weightKg ?? 0,
            reps: earned.set.reps,
            sessionsCompared: history.appearances.length,
          }),
        ];
      })
      .sort((x, y) => x.place - y.place);
  },
};
