import Foundation

/// Which day of the plan falls on a given date.
///
/// Mirrors the web app: a per-date override wins, otherwise the default
/// week shape. Keys are `yyyy-MM-dd` in the device's calendar, the same
/// string the web app writes.
public enum Schedule {

    /// Index is `Calendar.component(.weekday)` − 1, i.e. 0 = Sunday, matching
    /// JavaScript's `Date#getDay()` so both clients agree.
    public static let defaultWeek: [Int: String] = [
        0: "rest", 1: "push", 2: "pull", 3: "legs", 4: "rest", 5: "lower", 6: "upper",
    ]

    public static func dateKey(_ date: Date, calendar: Calendar = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// "2026-10-11" back to the start of that day.
    public static func date(fromKey key: String, calendar: Calendar = .current) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    public static func canonicalDay(
        for date: Date,
        overrides: [String: String],
        calendar: Calendar = .current
    ) -> String {
        if let override = overrides[dateKey(date, calendar: calendar)] { return override }
        let weekday = calendar.component(.weekday, from: date) - 1
        return defaultWeek[weekday] ?? "rest"
    }

    /// Resolves a canonical id onto the active plan, whose day ids are
    /// prefixed in the science plans (`science-push`, `science-ul-upper-a`).
    public static func day(for canonical: String, in plan: [WorkoutDay]) -> WorkoutDay? {
        if canonical == "rest" { return nil }
        if let exact = plan.first(where: { $0.id == canonical }) { return exact }
        return plan.first { $0.id.hasSuffix("-\(canonical)") }
            ?? plan.first { $0.id.contains(canonical) }
    }

    public static func mondayFirstWeek(containing date: Date, calendar: Calendar = .current) -> [Date] {
        var calendar = calendar
        calendar.firstWeekday = 2
        let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    /// Overrides are scoped per program, exactly as the web app scopes them:
    /// `personal:2026-09-17`, or `science-ppl-ul:2026-09-17`.
    public static func programKey(mode: String, sciencePlanID: String) -> String {
        mode == "personal" ? "personal" : "science-\(sciencePlanID)"
    }

    public static func overrideKey(
        for date: Date,
        mode: String,
        sciencePlanID: String,
        calendar: Calendar = .current
    ) -> String {
        "\(programKey(mode: mode, sciencePlanID: sciencePlanID)):\(dateKey(date, calendar: calendar))"
    }

    public static func weekdayLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "EEEEEE"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }
}
