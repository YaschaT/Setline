import Foundation

/// One suggested ramp set. Display only: never logged, never stored, never
/// counted (§7, and artboard 30's "opwarmsets krijgen geen statusstip en geen
/// rusttimer").
public struct WarmupSet: Hashable, Sendable {
    public let weightKg: Decimal
    public let reps: Int

    public init(weightKg: Decimal, reps: Int) {
        self.weightKg = weightKg
        self.reps = reps
    }
}

/// Builds the ramp from today's top set.
///
/// The evidence here is thin — §7 is explicit that there is no good support
/// for a specific number of ramp sets — so this is a suggestion, framed as
/// one, and dismissible per exercise.
public enum WarmupPlanner {

    /// What the rule is allowed to look at.
    ///
    /// §7's real rule keys off `isFirstForMuscleGroup` and `stabilityDemand`,
    /// neither of which exists until the §1 attributes arrive with the
    /// substitution ranking in Phase 3. Until then this proxy stands in:
    /// position in the session, and whether the lift is compound. Replacing
    /// it means changing this one type and `ladder(topSetKg:exercise:context:)`
    /// — nothing else reads these inputs.
    public struct Context: Hashable, Sendable {
        public let positionInSession: Int
        public let isCompound: Bool

        public init(positionInSession: Int, isCompound: Bool) {
            self.positionInSession = positionInSession
            self.isCompound = isCompound
        }
    }

    /// Loads at or below this need no ramp worth showing.
    static let negligibleLoadKg: Decimal = 20

    public static func ladder(
        topSetKg: Decimal,
        exercise: Exercise,
        context: Context
    ) -> [WarmupSet] {
        guard topSetKg > negligibleLoadKg else { return [] }

        // Proxy for §7's "not first for this muscle group, and not compound":
        // isolation work later in the session is already warm.
        if context.positionInSession > 0 && !context.isCompound { return [] }

        let step = exercise.incrementKg
        func ramp(_ fraction: Double, _ reps: Int) -> WarmupSet {
            let raw = topSetKg * Decimal(fraction)
            return WarmupSet(weightKg: max(step, Estimates.round(raw, toIncrement: step)), reps: reps)
        }

        // A supported machine or cable needs less of a ramp than a free lift.
        let isSupported = exercise.equipment == .machineSelectorised
            || exercise.equipment == .machinePlate
            || exercise.equipment == .cable
        if isSupported && topSetKg < 60 { return [ramp(0.5, 10)] }

        // Trimmed from the top when the load is light (§7).
        if topSetKg < 40 { return [ramp(0.5, 8)] }
        if topSetKg < 70 { return [ramp(0.45, 8), ramp(0.7, 4)] }
        return [ramp(0.45, 8), ramp(0.65, 4), ramp(0.85, 2)]
    }

    /// "Reeks gerekend uit de topset van 105 kg."
    public static func footnote(topSetKg: Decimal, formatter: NumberDisplay = .dutch) -> String {
        "Reeks gerekend uit de topset van \(formatter.kg(topSetKg)). Opwarmsets krijgen geen statusstip en geen rusttimer."
    }
}
