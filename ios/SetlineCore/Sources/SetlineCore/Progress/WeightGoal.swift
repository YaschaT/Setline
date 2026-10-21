import Foundation

/// What the lifter is doing with body weight, and the pace each goal asks
/// for, as a share of body weight per week.
///
/// The ranges follow the sports-nutrition literature most coaches use:
/// a cut loses 0.5–1 % a week (Helms et al. 2014, which found slower loss
/// keeps more muscle); a lean bulk gains about 0.5–1 % a month and a bulk
/// up to about 2 % a month (the bands intermediates are usually given);
/// maintaining or recomposing holds weight within a narrow band.
public enum WeightGoal: String, CaseIterable, Codable, Sendable {
    case cut, maintain, recomp, leanBulk, bulk

    public var title: String {
        switch self {
        case .cut: return "Cut"
        case .maintain: return "Maintain"
        case .recomp: return "Recomp"
        case .leanBulk: return "Lean bulk"
        case .bulk: return "Bulk"
        }
    }

    public var summary: String {
        switch self {
        case .cut: return "Lose fat, keep muscle. A steady loss each week."
        case .maintain: return "Hold your weight while you train."
        case .recomp: return "Weight stays put; strength and shape change."
        case .leanBulk: return "Build muscle with as little fat as possible. Slow gain."
        case .bulk: return "Build size faster. More gain, some fat with it."
        }
    }

    /// Weekly change as a share of body weight, lower and upper bound.
    public var weeklyRange: ClosedRange<Double> {
        switch self {
        case .cut: return -0.010 ... -0.005
        case .maintain, .recomp: return -0.001 ... 0.001
        case .leanBulk: return 0.001 ... 0.0025
        case .bulk: return 0.0025 ... 0.005
        }
    }

    /// Protein per kilo of body weight a day — higher on a cut, where it
    /// protects muscle (ISSN position stand: 1.4–2.0 g/kg; up to 2.3+ in a deficit).
    public var proteinPerKg: ClosedRange<Double> {
        switch self {
        case .cut: return 2.0 ... 2.4
        default: return 1.6 ... 2.2
        }
    }
}

/// How the weight trend compares with the goal.
public struct GoalCheck: Equatable, Sendable {
    public enum Verdict: Equatable, Sendable {
        /// Not enough weigh-ins yet to say anything honest.
        case tooEarly(weighInsNeeded: Int, daysNeeded: Int)
        case onTrack
        /// Moving the right way, but too slowly (or not at all).
        case tooSlow
        /// Moving the right way, faster than the goal wants.
        case tooFast
        /// Moving the wrong way.
        case wrongWay
        /// Outside the goal's range, but by less than the weigh-ins swing
        /// from day to day: it could still be water. No advice yet.
        case unclear
    }

    public let goal: WeightGoal
    public let verdict: Verdict
    /// The trend, kilos per week (negative is a loss). Nil while too early.
    public let weeklyKg: Double?
    /// The goal's range in kilos per week at the current weight.
    public let targetKg: ClosedRange<Double>
    /// About how many kcal a day to add (positive) or take away (negative)
    /// to reach the middle of the range. Nil when on track or too early.
    public let dailyKcalAdjustment: Int?
    /// Days the trend is measured over.
    public let days: Int

    public var isOffTrack: Bool {
        switch verdict {
        case .tooSlow, .tooFast, .wrongWay: return true
        default: return false
        }
    }

    /// A kilo of body weight is about 7,700 kcal of stored energy.
    public static let kcalPerKg = 7_700.0
    /// The trend is read over the last three weeks of weigh-ins.
    public static let window = 21
    /// At least this many weigh-ins, spread over at least two weeks, so a
    /// weekend's food and salt is in the line twice rather than once.
    public static let minimumWeighIns = 4
    public static let minimumDays = 14
    /// The first week of a new goal is mostly water and glycogen — up a
    /// kilo or more when the food goes up, down as much on a cut — so it
    /// is left out of the trend. Weigh-ins from before the goal belong to
    /// the old diet and are left out too.
    public static let settlingDays = 7
    /// How much one morning's weight wanders around its trend before the
    /// weigh-ins say otherwise: about 0.6 % of body weight (water, salt,
    /// glycogen, what is still being digested), counted as two weigh-ins'
    /// worth of evidence. With few weigh-ins this keeps the line honest;
    /// with many, their own scatter decides.
    public static let typicalSwing = 0.006
    static let swingWeight = 2.0
    /// How sure the trend must be before it is called off track: the gap
    /// to the range has to be at least one standard error (about 84 %
    /// confident that the real pace is outside it).
    static let confidence = 1.0

    /// Reads the trend from weigh-ins (date, kilos) with a least-squares
    /// line over the last three weeks — one heavy morning doesn't move it —
    /// and only calls it off track when it is off by more than the
    /// weigh-ins' own uncertainty. `startedAt` is when the goal was set.
    public static func evaluate(
        goal: WeightGoal,
        weighIns: [(date: Date, kg: Double)],
        startedAt: Date? = nil,
        now: Date = Date()
    ) -> GoalCheck {
        let settled = startedAt.map { $0.addingTimeInterval(Double(settlingDays) * 86_400) } ?? .distantPast
        let since = max(now.addingTimeInterval(-Double(window) * 86_400), settled)
        let recent = weighIns.filter { $0.date >= since && $0.date <= now }.sorted { $0.date < $1.date }
        let latest = recent.last?.kg ?? weighIns.max { $0.date < $1.date }?.kg ?? 0
        let target = (goal.weeklyRange.lowerBound * latest)...(goal.weeklyRange.upperBound * latest)

        let span = recent.count >= 2 ? Int(((recent.last!.date.timeIntervalSince(recent.first!.date)) / 86_400).rounded()) : 0
        guard recent.count >= minimumWeighIns, span >= minimumDays, latest > 0 else {
            // Still settling: the days left of the first week come first.
            let settling = max(0, Int((settled.timeIntervalSince(now) / 86_400).rounded(.up)))
            return GoalCheck(
                goal: goal,
                verdict: .tooEarly(weighInsNeeded: max(0, minimumWeighIns - recent.count),
                                   daysNeeded: settling + max(0, minimumDays - span)),
                weeklyKg: nil, targetKg: target, dailyKcalAdjustment: nil, days: span
            )
        }

        // Least-squares slope, kilos per day.
        let t0 = recent.first!.date
        let xs = recent.map { $0.date.timeIntervalSince(t0) / 86_400 }
        let ys = recent.map(\.kg)
        let mx = xs.reduce(0, +) / Double(xs.count), my = ys.reduce(0, +) / Double(ys.count)
        let sxx = zip(xs, xs).map { ($0 - mx) * ($1 - mx) }.reduce(0, +)
        let sxy = zip(xs, ys).map { ($0 - mx) * ($1 - my) }.reduce(0, +)
        let slope = sxx > 0 ? sxy / sxx : 0
        let weekly = slope * 7

        // Its standard error, from the scatter around the line pooled with
        // the typical day-to-day swing.
        let residuals = zip(xs, ys).map { x, y in y - (my + slope * (x - mx)) }
        let swing = typicalSwing * latest
        let variance = (residuals.map { $0 * $0 }.reduce(0, +) + swingWeight * swing * swing)
            / (Double(recent.count) - 2 + swingWeight)
        let weeklyError = sxx > 0 ? (variance / sxx).squareRoot() * 7 : .infinity
        let gap = weekly < target.lowerBound ? target.lowerBound - weekly
            : weekly > target.upperBound ? weekly - target.upperBound : 0

        let verdict: Verdict
        if target.contains(weekly) {
            verdict = .onTrack
        } else if gap < confidence * weeklyError {
            verdict = .unclear
        } else {
            let wantsGain = target.lowerBound > 0, wantsLoss = target.upperBound < 0
            if (wantsGain && weekly < 0) || (wantsLoss && weekly > 0) {
                verdict = .wrongWay
            } else if wantsGain || wantsLoss {
                verdict = abs(weekly) < min(abs(target.lowerBound), abs(target.upperBound)) ? .tooSlow : .tooFast
            } else {
                // Maintaining: any drift outside the band is the wrong way.
                verdict = .wrongWay
            }
        }

        var adjustment: Int?
        if verdict != .onTrack, verdict != .unclear {
            let middle = (target.lowerBound + target.upperBound) / 2
            let kcal = (middle - weekly) * kcalPerKg / 7
            adjustment = Int((kcal / 50).rounded()) * 50
        }
        return GoalCheck(goal: goal, verdict: verdict, weeklyKg: weekly, targetKg: target,
                         dailyKcalAdjustment: adjustment, days: span)
    }
}

/// The three meal windows the reminders follow: breakfast 8–11,
/// lunch 12–15, and dinner or snacks after that.
public struct MealWindow: Equatable, Sendable {
    public let meal: Meal
    public let label: String
    public let startHour: Int
    public let endHour: Int
    /// When the reminder fires, if nothing is logged in the window yet.
    public let remindAt: (hour: Int, minute: Int)

    public static func == (a: MealWindow, b: MealWindow) -> Bool { a.meal == b.meal && a.startHour == b.startHour }

    public static let all: [MealWindow] = [
        MealWindow(meal: .ontbijt, label: "Breakfast", startHour: 8, endHour: 11, remindAt: (10, 30)),
        MealWindow(meal: .lunch, label: "Lunch", startHour: 12, endHour: 15, remindAt: (14, 30)),
        MealWindow(meal: .avondeten, label: "Dinner", startHour: 15, endHour: 24, remindAt: (20, 30)),
    ]

    /// Whether anything was logged for this window today: under its meal,
    /// or (for dinner) as a snack; or at a time inside the window.
    public func isLogged(in entries: [NutritionEntry], on date: Date, calendar: Calendar = .current) -> Bool {
        let key = Schedule.dateKey(date, calendar: calendar)
        return entries.contains { entry in
            guard entry.date == key else { return false }
            if entry.meal == meal.rawValue { return true }
            if meal == .avondeten, entry.meal == Meal.snack.rawValue { return true }
            if let at = entry.loggedAt {
                let hour = calendar.component(.hour, from: at)
                return hour >= startHour && hour < endHour
            }
            return false
        }
    }

    /// Today's reminders still worth sending, then every reminder of the next
    /// `days` days — so the phone still reminds on a day the app isn't
    /// opened. Rescheduled whenever something is logged, which takes a
    /// logged meal's reminder away.
    public static func upcoming(entries: [NutritionEntry], now: Date, days: Int = 3, calendar: Calendar = .current) -> [(window: MealWindow, fire: Date)] {
        var result = due(entries: entries, now: now, calendar: calendar)
        let today = calendar.startOfDay(for: now)
        for offset in 1...max(1, days) {
            guard let day = calendar.date(byAdding: .day, value: offset, to: today) else { continue }
            for window in all {
                if let fire = calendar.date(bySettingHour: window.remindAt.hour, minute: window.remindAt.minute, second: 0, of: day) {
                    result.append((window, fire))
                }
            }
        }
        return result
    }

    /// The meal whose reminder time has passed today with nothing logged
    /// for it, while its window is still open — what the app says in place
    /// of a notification when it is open.
    public static func missing(entries: [NutritionEntry], now: Date, calendar: Calendar = .current) -> MealWindow? {
        let hour = calendar.component(.hour, from: now)
        let minute = calendar.component(.minute, from: now)
        return all.last { window in
            (hour, minute) >= (window.remindAt.hour, window.remindAt.minute)
                && hour < window.endHour
                && !window.isLogged(in: entries, on: now, calendar: calendar)
        }
    }

    /// The reminders still worth sending today, in order.
    public static func due(entries: [NutritionEntry], now: Date, calendar: Calendar = .current) -> [(window: MealWindow, fire: Date)] {
        all.compactMap { window in
            guard let fire = calendar.date(bySettingHour: window.remindAt.hour, minute: window.remindAt.minute, second: 0, of: now),
                  fire > now, !window.isLogged(in: entries, on: now, calendar: calendar)
            else { return nil }
            return (window, fire)
        }
    }
}

// MARK: - The band

/// Where the weight should be, day by day, from the moment the goal was set:
/// the start weight grown (or shrunk) at the goal's slowest and fastest pace.
public struct GoalBand: Equatable, Sendable {
    public let start: Date
    public let startKg: Double
    public let goal: WeightGoal

    public init(goal: WeightGoal, start: Date, startKg: Double) {
        self.goal = goal
        self.start = start
        self.startKg = startKg
    }

    /// The band's low and high weight on a date.
    public func range(on date: Date) -> ClosedRange<Double> {
        let weeks = max(0, date.timeIntervalSince(start) / (7 * 86_400))
        let a = startKg * (1 + goal.weeklyRange.lowerBound * weeks)
        let b = startKg * (1 + goal.weeklyRange.upperBound * weeks)
        return min(a, b) ... max(a, b)
    }

    /// The start weight: the trend's value on the start day, or the first
    /// one after it, or the last one before.
    public static func make(goal: WeightGoal, since: Date, trend: [(date: Date, kg: Double)]) -> GoalBand? {
        let sorted = trend.sorted { $0.date < $1.date }
        guard let point = sorted.first(where: { $0.date >= since.addingTimeInterval(-86_400) }) ?? sorted.last else { return nil }
        return GoalBand(goal: goal, start: min(since, point.date), startKg: point.kg)
    }
}
