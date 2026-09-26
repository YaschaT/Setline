import Foundation

/// Estimated one-rep max, and the guards that keep it honest.
public enum Estimates {
    /// TRAINING_LOGIC §10.2: computed only for sets of ≤10 reps, because every
    /// formula of this kind loses accuracy as reps rise — above that the app
    /// uses Load PR and Rep PR only.
    public static let maxRepsForEstimate = 10

    /// Brzycki: `weight × 36 / (37 − reps)`.
    ///
    /// Setline used Epley (`weight × (1 + reps/30)`) until 2026-09-26. Epley
    /// drifts high exactly where this app's readers train: at one rep it says
    /// a single is worth 3,3% more than the weight just lifted, and at four to
    /// six it reads several kilos above a real touch-and-go bench. Brzycki is
    /// exact at one rep, agrees with Epley to the decimal at ten, and sits
    /// lower in between.
    ///
    /// The web app computes the same number from the same rule, and both read
    /// `tests/fixtures/one-rep-max.json`, so neither side can change it alone.
    public static func e1RM(weightKg: Decimal, reps: Int) -> Decimal? {
        guard weightKg > 0, reps > 0, reps <= maxRepsForEstimate else { return nil }
        return weightKg * 36 / (37 - Decimal(reps))
    }

    /// Explicit epsilon, replacing the web app's 0.05.
    ///
    /// §15 change 5: 0.5 kg on load and on e1RM, so floating-point noise and
    /// 0.25 kg rounding never manufacture a record.
    public static let epsilonKg: Decimal = 0.5

    /// Rounds a proposed load onto a real, loadable step.
    public static func round(_ value: Decimal, toIncrement increment: Decimal) -> Decimal {
        guard increment > 0 else { return value }
        let steps = (value / increment) as NSDecimalNumber
        let rounded = Decimal(Int(steps.doubleValue.rounded()))
        return rounded * increment
    }
}
