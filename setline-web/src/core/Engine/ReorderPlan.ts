import type { Exercise } from "../Domain/Model";
import type { ExerciseRole } from "../Domain/Vocabulary";

/**
 * Doing a later exercise now, and coming back.
 *
 * TRAINING_LOGIC §8, and the highest-value answer to an occupied machine:
 * it changes nothing. The exercise, its history and its progression state
 * all survive, where a substitution preserves none of them. That is why the
 * sheet offers it above the alternatives rather than beside them.
 */
export interface ReorderPlan {
  /** Index in the session of the exercise to do now. */
  readonly candidateIndex: number;
  readonly candidate: Exercise;
  readonly current: Exercise;
}
export const ReorderPlan = {
  make(a: { candidateIndex: number; candidate: Exercise; current: Exercise }): ReorderPlan {
    return { candidateIndex: a.candidateIndex, candidate: a.candidate, current: a.current };
  },

  /** `Doe hack squat nu · Kom later terug voor bankdrukken` */
  headline(self: ReorderPlan): string {
    return `Do ${self.candidate.name.toLowerCase()} now · come back to ${self.current.name.toLowerCase()} later`;
  },

  detail(self: ReorderPlan): string {
    return `You keep ${self.current.name.toLowerCase()}, including its history and progress.`;
  },
};

export const ReorderPlanner = {
  /**
   * One exercise, or none.
   *
   * Candidates are later exercises that have not been started. A later
   * primary lift is never pulled forward: moving a heavy lift out of the
   * position it was programmed in is a bigger change than "the machine is
   * busy" asks for, and it demotes whatever it jumps ahead of.
   */
  plan(a: {
    current: Exercise;
    currentIndex: number;
    currentIsComplete?: boolean;
    later: { exercise: Exercise; role: ExerciseRole; hasStarted: boolean }[];
  }): ReorderPlan | undefined {
    // "Kom later terug" only means something while there is something
    // left to come back for.
    if (a.currentIsComplete ?? false) return undefined;
    for (const [offset, item] of a.later.entries()) {
      if (item.hasStarted) continue;
      if (item.role === "primaryStrength") continue;
      return ReorderPlan.make({
        candidateIndex: a.currentIndex + 1 + offset,
        candidate: item.exercise,
        current: a.current,
      });
    }
    return undefined;
  },
};
