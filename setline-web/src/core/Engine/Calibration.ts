import { Exercise, type LoggedSet } from "../Domain/Model";
import { dec } from "../Support/swift";
import type { ExerciseHistory } from "./ExerciseHistory";
import { NumberDisplay } from "./NumberDisplay";

/**
 * The first working set of an exercise Setline has never seen.
 *
 * TRAINING_LOGIC §12.3: with no history the app proposes no weight at all.
 * It asks for one, and the rest of the exercise prefills from what the user
 * actually did. Nothing here can become a record or a proposal — the
 * three-session reference gate is still closed, and `hasReference` is what
 * every record and proposal checks.
 */
export interface CalibrationPrompt {
  /** "No history", or the origin exercise once swapping exists (§12). */
  readonly contextLabel: string;
  readonly headline: string;
  readonly body: string;
  readonly targetReps: number;
  readonly targetRIR: number;
}
export const CalibrationPrompt = {
  make(a: { contextLabel: string; headline: string; body: string; targetReps: number; targetRIR: number }): CalibrationPrompt {
    return { contextLabel: a.contextLabel, headline: a.headline, body: a.body, targetReps: a.targetReps, targetRIR: a.targetRIR };
  },
};

export const Calibration = {
  /**
   * A calibration set aims at 8 reps with 2 in reserve — the wording the
   * artboard uses, and a rep count where RIR is estimated most accurately
   * (§4: accuracy is better at ≤12 reps).
   */
  targetReps: 8,
  targetRIR: 2,

  /**
   * Calibration applies only when there is nothing to compare against at
   * all. One or two sessions is not calibration — it is a reference being
   * built, and the last session's weight is a perfectly good prefill.
   */
  isNeeded(a: { history: ExerciseHistory }): boolean {
    return a.history.appearances.length === 0;
  },

  /**
   * - Parameter origin: the exercise this one stands in for, lowercased,
   *   when it was swapped in.
   */
  prompt(a: { for: Exercise; substitutedFrom?: string }): CalibrationPrompt {
    const exercise = a.for;
    const origin = a.substitutedFrom;
    // The label joins the header's eyebrow ("Gewisseld van squat · geen
    // historiek"), so the card itself opens on the set, as artboard 28
    // draws it.
    const context = "No history";
    const body = origin !== undefined
      ? `SETLINE suggests no weight here: ${exercise.name.toLowerCase()} is a different exercise from ${origin}. Your sets, reps and RIR are kept.`
      : "SETLINE suggests no weight here: there's nothing to compare with yet. Your sets, reps and RIR are kept.";
    return CalibrationPrompt.make({
      contextLabel: context,
      headline: `Pick a weight you can lift for ${Calibration.targetReps} reps with ${Calibration.targetRIR} in reserve.`,
      body,
      targetReps: Calibration.targetReps,
      targetRIR: Calibration.targetRIR,
    });
  },

  /**
   * What the remaining sets are prefilled with once set 1 is in.
   *
   * §12.3's cheap extra: if the calibration set was clearly easy — RIR 3
   * or more — the next set may start one increment higher. That is a
   * step *within the same exercise*, which is legitimate; converting load
   * between exercises never is.
   */
  prefill(a: { after: LoggedSet; exercise: Exercise }): { weightKg: number; steppedUp: boolean } {
    const calibrationSet = a.after;
    const logged = calibrationSet.weightKg ?? 0;
    const rir = calibrationSet.rirReported;
    if (!(rir !== undefined && rir >= 3 && logged > 0)) {
      return { weightKg: logged, steppedUp: false };
    }
    return { weightKg: dec(logged + Exercise.incrementKg(a.exercise)), steppedUp: true };
  },

  /** "Gekalibreerd op 80 kg × 8 · RIR 2" */
  summary(a: { for: LoggedSet; formatter?: NumberDisplay }): string | undefined {
    const set = a.for;
    const formatter = a.formatter ?? NumberDisplay.english;
    const weight = set.weightKg;
    if (weight === undefined || !(set.reps > 0)) return undefined;
    let text = `${NumberDisplay.kg(formatter, weight)} × ${set.reps}`;
    if (set.rirReported !== undefined) text += ` · RIR ${set.rirReported}`;
    return text;
  },
};
