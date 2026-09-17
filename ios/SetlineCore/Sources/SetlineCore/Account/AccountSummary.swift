import Foundation

/// What the Account screen (artboard 23) states about this account.
///
/// Every value is read from what is actually stored. A row the data cannot
/// fill is left out rather than filled in: the design's `2.250 kcal · 165 g`
/// is a mock's numbers, not a default to ship.
public struct AccountSummary: Equatable, Sendable {

    /// Rest inherits from the exercise's role (addendum 13R, TRAINING_LOGIC
    /// §6), so the account states the prescriptions it actually uses instead
    /// of the single 2:00 the base artboard shows.
    public struct RestLine: Equatable, Sendable {
        public let role: ExerciseRole
        public let roleLabel: String
        public let label: String

        public init(role: ExerciseRole, roleLabel: String, label: String) {
            self.role = role
            self.roleLabel = roleLabel
            self.label = label
        }
    }

    public let planName: String
    /// Weekday labels carrying a session this week — "ma", "wo", "vr", "za".
    public let trainingDays: [String]
    /// Only when the account stores them; otherwise the row is not shown.
    public let targets: NutritionTargets?
    public let rest: [RestLine]
    public let sessionCount: Int
    public let loggedExerciseCount: Int
    public let weighInCount: Int

    public init(
        planName: String,
        trainingDays: [String],
        targets: NutritionTargets?,
        rest: [RestLine],
        sessionCount: Int,
        loggedExerciseCount: Int,
        weighInCount: Int
    ) {
        self.planName = planName
        self.trainingDays = trainingDays
        self.targets = targets
        self.rest = rest
        self.sessionCount = sessionCount
        self.loggedExerciseCount = loggedExerciseCount
        self.weighInCount = weighInCount
    }

    public static func make(
        state: LegacyState,
        plan: [WorkoutDay],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> AccountSummary {
        let (mode, scienceID) = LegacyAdapter.planMode(from: state)
        let overrides = LegacyAdapter.scheduleOverrides(from: state)
        let sessions = LegacyAdapter.sessions(from: state)

        let days = Schedule.mondayFirstWeek(containing: now, calendar: calendar)
            .filter { date in
                let canonical = Schedule.canonicalDay(for: date, overrides: overrides, calendar: calendar)
                return Schedule.day(for: canonical, in: plan) != nil
            }
            .map(Schedule.weekdayLabel)

        // An exercise counts as trained once it carries a written set, so the
        // export line never promises more than it holds.
        let trained = Set(
            sessions
                .flatMap(\.results)
                .filter { $0.sets.contains(where: \.isLogged) }
                .map(\.exerciseID)
        )

        return AccountSummary(
            planName: planName(plan: plan, mode: mode, sciencePlanID: scienceID),
            trainingDays: days,
            targets: LegacyAdapter.targets(from: state),
            rest: restLines(),
            sessionCount: sessions.filter { $0.kind == .workout }.count,
            loggedExerciseCount: trained.count,
            weighInCount: LegacyAdapter.metrics(from: state).count
        )
    }

    /// The plan as the user picked it, worded as the plan row on the training
    /// home already words it, so the two screens never disagree.
    public static func planName(plan: [WorkoutDay], mode: String, sciencePlanID: String) -> String {
        if mode == "science" {
            switch sciencePlanID {
            case "upper-lower": return "Upper / Lower"
            case "full-body": return "Full body"
            default: return "Push / Pull / Benen"
            }
        }
        return plan.count == 5 ? "Push / Pull / Benen" : "\(plan.count) dagen"
    }

    /// One line per distinct rest prescription, strongest role first. Accessory
    /// and isolation share a prescription, so they share a line.
    public static func restLines() -> [RestLine] {
        var seen: Set<Int> = []
        return [ExerciseRole.primaryStrength, .secondaryCompound, .isolation].compactMap { role in
            let prescription = RestPrescription.forRole(role)
            guard seen.insert(prescription.defaultSeconds).inserted else { return nil }
            return RestLine(role: role, roleLabel: roleLabel(role), label: prescription.displayLabel)
        }
    }

    /// The role names the rest timer already announces during a session.
    public static func roleLabel(_ role: ExerciseRole) -> String {
        switch role {
        case .primaryStrength: return "primaire lift"
        case .secondaryCompound: return "samengesteld"
        case .accessory, .isolation: return "isolatie"
        }
    }
}
