import { dec, rounded } from "../Support/swift";

/** Estimated one-rep max, and the guards that keep it honest. */
export const Estimates = {
  /**
   * TRAINING_LOGIC §10.2: computed only for sets of ≤10 reps, because every
   * formula of this kind loses accuracy as reps rise — above that the app
   * uses Load PR and Rep PR only.
   */
  maxRepsForEstimate: 10,

  /**
   * Brzycki: `weight × 36 / (37 − reps)`.
   *
   * The web app computes the same number from the same rule, and both read
   * `tests/fixtures/one-rep-max.json`, so neither side can change it alone.
   */
  e1RM(a: { weightKg: number; reps: number }): number | undefined {
    const { weightKg, reps } = a;
    if (!(weightKg > 0 && reps > 0 && reps <= Estimates.maxRepsForEstimate)) return undefined;
    return dec((weightKg * 36) / (37 - reps));
  },

  /**
   * Explicit epsilon, replacing the web app's 0.05.
   *
   * §15 change 5: 0.5 kg on load and on e1RM, so floating-point noise and
   * 0.25 kg rounding never manufacture a record.
   */
  epsilonKg: 0.5,

  /** Rounds a proposed load onto a real, loadable step. */
  round(value: number, a: { toIncrement: number }): number {
    const increment = a.toIncrement;
    if (!(increment > 0)) return value;
    const steps = dec(value / increment);
    const r = Math.trunc(rounded(steps));
    return dec(r * increment);
  },
};
