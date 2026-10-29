import { Exercise } from "../Domain/Model";
import { dec } from "../Support/swift";
import { Estimates } from "./Estimates";
import { NumberDisplay } from "./NumberDisplay";

/**
 * One suggested ramp set. Display only: never logged, never stored, never
 * counted (§7, and artboard 30's "opwarmsets krijgen geen statusstip en geen
 * rusttimer").
 */
export interface WarmupSet {
  readonly weightKg: number;
  readonly reps: number;
}
export const WarmupSet = {
  make(a: { weightKg: number; reps: number }): WarmupSet {
    return { weightKg: a.weightKg, reps: a.reps };
  },
};

/**
 * What the rule is allowed to look at.
 *
 * §7's real rule keys off `isFirstForMuscleGroup` and `stabilityDemand`,
 * neither of which exists until the §1 attributes arrive with the
 * substitution ranking in Phase 3. Until then this proxy stands in:
 * position in the session, and whether the lift is compound.
 */
export interface WarmupPlanner_Context {
  readonly positionInSession: number;
  readonly isCompound: boolean;
}
export const WarmupPlanner_Context = {
  make(a: { positionInSession: number; isCompound: boolean }): WarmupPlanner_Context {
    return { positionInSession: a.positionInSession, isCompound: a.isCompound };
  },
};

/**
 * Builds the ramp from today's top set.
 *
 * The evidence here is thin — §7 is explicit that there is no good support
 * for a specific number of ramp sets — so this is a suggestion, framed as
 * one, and dismissible per exercise.
 */
export const WarmupPlanner = {
  /** Loads at or below this need no ramp worth showing. */
  negligibleLoadKg: 20,

  ladder(a: { topSetKg: number; exercise: Exercise; context: WarmupPlanner_Context }): WarmupSet[] {
    const { topSetKg, exercise, context } = a;
    if (!(topSetKg > WarmupPlanner.negligibleLoadKg)) return [];

    // Proxy for §7's "not first for this muscle group, and not compound":
    // isolation work later in the session is already warm.
    if (context.positionInSession > 0 && !context.isCompound) return [];

    const step = Exercise.incrementKg(exercise);
    const ramp = (fraction: number, reps: number): WarmupSet => {
      const raw = dec(topSetKg * fraction);
      return WarmupSet.make({ weightKg: Math.max(step, Estimates.round(raw, { toIncrement: step })), reps });
    };

    // A supported machine or cable needs less of a ramp than a free lift.
    const isSupported = exercise.equipment === "machineSelectorised"
      || exercise.equipment === "machinePlate"
      || exercise.equipment === "cable";
    if (isSupported && topSetKg < 60) return [ramp(0.5, 10)];

    // Trimmed from the top when the load is light (§7).
    if (topSetKg < 40) return [ramp(0.5, 8)];
    if (topSetKg < 70) return [ramp(0.45, 8), ramp(0.7, 4)];
    return [ramp(0.45, 8), ramp(0.65, 4), ramp(0.85, 2)];
  },

  /** "Reeks gerekend uit de topset van 105 kg." */
  footnote(a: { topSetKg: number; formatter?: NumberDisplay }): string {
    const formatter = a.formatter ?? NumberDisplay.english;
    return `Worked out from the top set of ${NumberDisplay.kg(formatter, a.topSetKg)}. Warm-up sets get no status dot and no rest timer.`;
  },
};
