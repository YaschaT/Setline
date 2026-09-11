import Foundation

/// Estimated one-rep max, and the guards that keep it honest.
public enum Estimates {
    /// Epley. TRAINING_LOGIC §10.2: computed only for sets of ≤10 reps,
    /// because the formula loses accuracy as reps rise — above that the app
    /// uses Load PR and Rep PR only.
    public static let maxRepsForEstimate = 10

    public static func e1RM(weightKg: Decimal, reps: Int) -> Decimal? {
        guard weightKg > 0, reps > 0, reps <= maxRepsForEstimate else { return nil }
        return weightKg * (1 + Decimal(reps) / 30)
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
