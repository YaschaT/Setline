import Foundation

/// Artboard 20 · segment Lichaam, read-only.
///
/// The weigh-ins the account already holds: what the scale last said, how it
/// moved over four weeks, and the series behind it. Waist and entry are not
/// drawn anywhere in the approved design, so neither is built.
public struct BodyProgress: Equatable, Sendable {

    public struct Entry: Equatable, Sendable, Identifiable {
        public let id: String
        public let date: Date
        public let weightKg: Decimal
        /// Against the weigh-in before it, when there is one.
        public let change: Decimal?

        public init(id: String, date: Date, weightKg: Decimal, change: Decimal?) {
            self.id = id
            self.date = date
            self.weightKg = weightKg
            self.change = change
        }
    }

    public struct Change: Equatable, Sendable {
        public let value: Decimal
        public let weeks: Int

        public init(value: Decimal, weeks: Int) {
            self.value = value
            self.weeks = weeks
        }
    }

    /// Newest first, as the list shows them.
    public let entries: [Entry]
    public let change: Change?

    public init(entries: [Entry], change: Change?) {
        self.entries = entries
        self.change = change
    }

    /// No weigh-ins yet.
    public static let empty = BodyProgress(entries: [], change: nil)

    public var latest: Entry? { entries.first }
    /// Oldest first, for the chart.
    public var points: [Entry] { entries.reversed() }

    /// The window the design states on the wide layout ("+0,3 / 4 weken").
    public static let changeWindowWeeks = 4

    public static func make(metrics: [BodyMetric], calendar: Calendar = .current) -> BodyProgress {
        let weighed = metrics
            .compactMap { metric -> (id: String, date: Date, weight: Decimal)? in
                guard metric.weight > 0, let date = parse(metric.date) else { return nil }
                return (metric.id, date, decimal(metric.weight))
            }
            .sorted { $0.date < $1.date }

        var entries: [Entry] = []
        for (index, weighIn) in weighed.enumerated() {
            let previous = index > 0 ? weighed[index - 1].weight : nil
            entries.append(Entry(
                id: weighIn.id,
                date: weighIn.date,
                weightKg: weighIn.weight,
                change: previous.map { weighIn.weight - $0 }
            ))
        }

        return BodyProgress(entries: entries.reversed(), change: change(in: entries, calendar: calendar))
    }

    /// Against the weigh-in nearest to four weeks back — before or after it,
    /// whichever is closer, so a gap in the series does not silently stretch
    /// the window. The weeks are then counted, never assumed.
    static func change(in oldestFirst: [Entry], calendar: Calendar) -> Change? {
        guard let latest = oldestFirst.last, oldestFirst.count > 1 else { return nil }
        let windowStart = calendar.date(byAdding: .weekOfYear, value: -changeWindowWeeks, to: latest.date) ?? latest.date
        let earlier = oldestFirst.dropLast()
        guard let baseline = earlier.min(by: {
            abs($0.date.timeIntervalSince(windowStart)) < abs($1.date.timeIntervalSince(windowStart))
        }) else { return nil }
        guard baseline.date < latest.date else { return nil }

        let days = calendar.dateComponents([.day], from: baseline.date, to: latest.date).day ?? 0
        return Change(value: latest.weightKg - baseline.weightKg, weeks: max(1, Int((Double(days) / 7).rounded())))
    }

    /// The web app writes `yyyy-MM-dd`; older rows carry a full timestamp.
    static func parse(_ text: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: text) ?? LegacyAdapter.isoDate(text)
    }

    /// Scale readings arrive as doubles; one decimal is all a scale claims.
    static func decimal(_ value: Double) -> Decimal {
        Decimal(string: String(format: "%.2f", value)) ?? 0
    }
}
