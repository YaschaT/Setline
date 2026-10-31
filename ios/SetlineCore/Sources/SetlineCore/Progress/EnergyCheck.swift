import Foundation

/// Height, sex and age: what the energy equations need besides weight.
/// The birth year is kept rather than the age, so the age stays right.
public struct BodyProfile: Codable, Equatable, Sendable {
    public enum Sex: String, Codable, CaseIterable, Sendable {
        case male, female
        public var label: String { self == .male ? "Male" : "Female" }
    }

    public var heightCm: Double
    public var sex: Sex
    public var birthYear: Int

    public init(heightCm: Double, sex: Sex, birthYear: Int) {
        self.heightCm = heightCm
        self.sex = sex
        self.birthYear = birthYear
    }

    public func age(now: Date = Date()) -> Int {
        Calendar(identifier: .gregorian).component(.year, from: now) - birthYear
    }

    /// Plausible values only: 120–230 cm, 13–100 years.
    public func isValid(now: Date = Date()) -> Bool {
        (120...230).contains(heightCm) && (13...100).contains(age(now: now))
    }
}

/// Whether the numbers point the right way for the goal, from the equations
/// sports dietitians start from: resting energy by Mifflin–St Jeor, times an
/// activity factor from how often the lifter trains, plus or minus the energy
/// the goal's weekly pace asks for (about 7,700 kcal per kilo). The scale
/// stays the judge: these are estimates, and the weight trend wins once there
/// is one.
public struct EnergyCheck: Equatable, Sendable {
    public enum Status: Equatable, Sendable {
        case good, high, low, unknown
    }

    public enum Direction: Equatable, Sendable {
        case right, off, unknown
    }

    public struct Source: Equatable, Sendable, Identifiable {
        public let id: String
        public let claim: String
        public let citation: String
    }

    /// Resting energy, kcal a day.
    public let bmr: Int
    public let activityFactor: Double
    /// "3–4 workouts a week".
    public let activityLabel: String
    /// Resting energy times activity, kcal a day.
    public let maintenance: Int
    /// What the goal's pace asks to eat, kcal a day.
    public let calorieRange: ClosedRange<Int>
    /// Protein for the goal, grams a day.
    public let proteinRange: ClosedRange<Int>
    public let bmi: Double
    public let bmiLabel: String
    /// The calorie target against the range.
    public let target: Status
    /// What was eaten, on average over the logged days, against the range.
    public let intake: Status
    public let averageKcal: Int?
    /// Protein eaten against the goal's range.
    public let protein: Status
    public let averageProtein: Int?

    /// Logging is never exact: within this many kcal of the range is in it.
    static let tolerance = 100.0
    /// The energy in a kilo of body weight change (Wishnofsky's rule of thumb).
    static let kcalPerKg = 7_700.0

    public static func make(
        profile: BodyProfile,
        weightKg: Double,
        goal: WeightGoal,
        workoutsPerWeek: Double,
        calorieTarget: Int?,
        averageKcal: Double?,
        averageProtein: Double?,
        now: Date = Date()
    ) -> EnergyCheck {
        let age = Double(profile.age(now: now))
        let rest = 10 * weightKg + 6.25 * profile.heightCm - 5 * age + (profile.sex == .male ? 5 : -161)
        let (factor, label) = activity(workoutsPerWeek)
        let maintenance = rest * factor
        let pace = goal.weeklyRange
        // Never below resting energy: a deficit deeper than that costs muscle.
        let low = max(rest, maintenance + pace.lowerBound * weightKg * kcalPerKg / 7)
        let high = max(rest, maintenance + pace.upperBound * weightKg * kcalPerKg / 7)
        let range = round50(low)...max(round50(low), round50(high))
        let proteinPerKg = goal.proteinPerKg
        let proteinRange = Int((proteinPerKg.lowerBound * weightKg).rounded())...Int((proteinPerKg.upperBound * weightKg).rounded())
        let meters = profile.heightCm / 100
        let bmi = weightKg / (meters * meters)

        func status(_ value: Double?, in range: ClosedRange<Int>) -> Status {
            guard let value else { return .unknown }
            if value < Double(range.lowerBound) - tolerance { return .low }
            if value > Double(range.upperBound) + tolerance { return .high }
            return .good
        }
        let proteinStatus: Status = {
            guard let averageProtein else { return .unknown }
            // More protein than the range costs nothing but money.
            return averageProtein >= Double(proteinRange.lowerBound) * 0.9 ? .good : .low
        }()

        return EnergyCheck(
            bmr: Int((rest / 10).rounded()) * 10,
            activityFactor: factor,
            activityLabel: label,
            maintenance: Int((maintenance / 10).rounded()) * 10,
            calorieRange: range,
            proteinRange: proteinRange,
            bmi: (bmi * 10).rounded() / 10,
            bmiLabel: bmiLabel(bmi),
            target: status(calorieTarget.map(Double.init), in: range),
            intake: status(averageKcal, in: range),
            averageKcal: averageKcal.map { Int($0.rounded()) },
            protein: proteinStatus,
            averageProtein: averageProtein.map { Int($0.rounded()) }
        )
    }

    /// The weight trend decides once it can; before that, what was eaten.
    public static func direction(trend: GoalCheck.Verdict?, intake: Status) -> Direction {
        switch trend {
        case .onTrack: return .right
        case .tooSlow, .tooFast, .wrongWay: return .off
        default:
            switch intake {
            case .good: return .right
            case .high, .low: return .off
            case .unknown: return .unknown
            }
        }
    }

    /// Workouts a week from the last four weeks.
    public static func workoutsPerWeek(sessionDates: [Date], now: Date = Date()) -> Double {
        let start = now.addingTimeInterval(-28 * 86_400)
        return Double(sessionDates.filter { $0 > start && $0 <= now }.count) / 4
    }

    static func activity(_ perWeek: Double) -> (Double, String) {
        switch perWeek {
        case ..<1: return (1.2, "Under 1 workout a week")
        case ..<3: return (1.375, "1–2 workouts a week")
        case ..<5: return (1.55, "3–4 workouts a week")
        default: return (1.725, "5 or more workouts a week")
        }
    }

    static func bmiLabel(_ bmi: Double) -> String {
        switch bmi {
        case ..<18.5: return "Underweight"
        case ..<25: return "Healthy range"
        case ..<30: return "Overweight"
        default: return "Obese"
        }
    }

    static func round50(_ value: Double) -> Int { Int((value / 50).rounded()) * 50 }

    public static let sources: [Source] = [
        Source(id: "mifflin", claim: "Resting energy from weight, height, age and sex.",
               citation: "Mifflin MD et al. (1990). Am J Clin Nutr 51(2):241–247."),
        Source(id: "frankenfield", claim: "Mifflin–St Jeor is the most accurate of the common equations, within 10 % for most adults.",
               citation: "Frankenfield D et al. (2005). J Am Diet Assoc 105(5):775–789."),
        Source(id: "helms", claim: "On a cut, lose 0.5–1 % of body weight a week and keep protein high to hold on to muscle.",
               citation: "Helms ER, Aragon AA, Fitschen PJ (2014). J Int Soc Sports Nutr 11:20."),
        Source(id: "morton", claim: "Protein beyond about 1.6 g per kilo a day adds little muscle; up to 2.2 g covers nearly everyone.",
               citation: "Morton RW et al. (2018). Br J Sports Med 52(6):376–384."),
        Source(id: "iraki", claim: "When building, gain about 0.25–0.5 % of body weight a week to limit fat gain.",
               citation: "Iraki J et al. (2019). Sports 7(7):154."),
        Source(id: "who", claim: "BMI bands: 18.5–24.9 healthy. Muscular lifters often read high without excess fat.",
               citation: "World Health Organization, BMI classification."),
    ]
}
