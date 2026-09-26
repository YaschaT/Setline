/**
 * The estimated one-rep max, as both clients compute it.
 *
 * Brzycki: `weight × 36 / (37 − reps)`, for sets of ten reps or fewer.
 *
 * This app used Epley (`weight × (1 + reps/30)`) until 2026-09-26, on both
 * sides. Epley drifts high exactly where Setline's readers train: at one rep
 * it claims a single is worth 3,3% more than the weight that was just lifted,
 * and at four to six reps it reads several kilos above a real touch-and-go
 * bench. Brzycki is exact at one rep, agrees with Epley to the decimal at ten,
 * and sits lower in between.
 *
 * Above ten reps there is no estimate at all (TRAINING_LOGIC §10.2 guard 2):
 * every formula of this kind loses accuracy as reps rise, and a number the app
 * does not trust is worse than the Load PR and Rep PR it can state instead.
 *
 * The iOS app computes this in `SetlineCore/Engine/Estimates.swift`, and both
 * sides are checked against `tests/fixtures/one-rep-max.json`, so a change
 * that lands here alone fails there.
 */

/** Above this, the app states no estimate. */
export const MAX_REPS_FOR_ESTIMATE = 10;

/**
 * The estimate for one set, or `null` where there is nothing honest to say:
 * no weight, no reps, or more reps than the formula can carry.
 */
export function estimate1RM(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps <= 0 || reps > MAX_REPS_FOR_ESTIMATE) return null;
  return (weightKg * 36) / (37 - reps);
}
