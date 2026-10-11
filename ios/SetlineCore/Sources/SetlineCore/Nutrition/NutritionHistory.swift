import Foundation

/// The days before today, as eaten: each day's totals against the targets,
/// what fell short, and how the stretch adds up — so a weight goal can be
/// read against what was actually logged, not only the scale.
///
/// Today is left out: it is still being eaten.
public struct NutritionHistory: Equatable, Sendable {
    public enum Flag: String, Equatable, Sendable {
        case lowProtein, lowCarbs, overCalories, underCalories

        public var label: String {
            switch self {
            case .lowProtein: return "Low protein"
            case .lowCarbs: return "Low carbs"
            case .overCalories: return "Over kcal"
            case .underCalories: return "Under kcal"
            }
        }
    }

    public struct Day: Identifiable, Equatable, Sendable {
        public let date: Date
        public let summary: NutritionDay
        public let flags: [Flag]
        public var id: String { summary.dateKey }
        public var isLogged: Bool { !summary.entries.isEmpty }
        /// Calories within 10 % of the target and protein at 90 % or more.
        public var onTarget: Bool { isLogged && summary.hasTarget && flags.isEmpty }
    }

    /// Newest first.
    public let days: [Day]
    public let calorieTarget: Int?

    public var logged: [Day] { days.filter(\.isLogged) }

    /// The average of the days something was logged; nil when none was.
    public var averageCalories: Double? {
        let logged = logged
        guard !logged.isEmpty else { return nil }
        return logged.reduce(0) { $0 + $1.summary.calories } / Double(logged.count)
    }

    public var averageProtein: Double? {
        let logged = logged
        guard !logged.isEmpty else { return nil }
        return logged.reduce(0) { $0 + $1.summary.protein } / Double(logged.count)
    }

    public var daysOnCalories: Int {
        logged.filter { !$0.flags.contains(.overCalories) && !$0.flags.contains(.underCalories) }.count
    }

    public var daysProteinHit: Int {
        logged.filter { !$0.flags.contains(.lowProtein) }.count
    }

    /// Kcal a day the logged average sits from the target, rounded to 10.
    public var averageGap: Int? {
        guard let target = calorieTarget, target > 0, let average = averageCalories else { return nil }
        return Int(((average - Double(target)) / 10).rounded()) * 10
    }

    public static func make(
        entries: [NutritionEntry],
        targets: NutritionTargets?,
        days count: Int = 14,
        before today: Date = Date(),
        calendar: Calendar = .current
    ) -> NutritionHistory {
        let start = calendar.startOfDay(for: today)
        let days: [Day] = (1...max(1, count)).compactMap { back in
            guard let date = calendar.date(byAdding: .day, value: -back, to: start) else { return nil }
            let summary = NutritionDay.make(entries: entries, on: date, targets: targets, calendar: calendar)
            return Day(date: date, summary: summary, flags: flags(summary))
        }
        return NutritionHistory(days: days, calorieTarget: targets.map(\.calories).flatMap { $0 > 0 ? $0 : nil })
    }

    static func flags(_ day: NutritionDay) -> [Flag] {
        guard !day.entries.isEmpty, let targets = day.targets else { return [] }
        var flags: [Flag] = []
        if targets.calories > 0 {
            let ratio = day.calories / Double(targets.calories)
            if ratio > 1.1 { flags.append(.overCalories) }
            if ratio < 0.9 { flags.append(.underCalories) }
        }
        if targets.protein > 0, day.protein < 0.9 * Double(targets.protein) { flags.append(.lowProtein) }
        if targets.carbs > 0, day.carbs < 0.7 * Double(targets.carbs) { flags.append(.lowCarbs) }
        return flags
    }
}
