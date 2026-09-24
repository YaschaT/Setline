import Foundation

/// Writing a weigh-in, by the one rule both clients can live with: a day
/// holds one weigh-in.
///
/// The account already stores weigh-ins under `metrics`, dated `yyyy-MM-dd`,
/// and the web app has always been able to add one. This is the same row,
/// written from here: weighing again on a day the account already has replaces
/// that day's number in place, keeping its id — and with it everything else
/// the row carries, a waist the web app measured included.
///
/// Every other weigh-in is left exactly as stored; the trend is never written,
/// only recomputed from the series (`BodyProgress`).
public enum WeighIn {

    /// `yyyy-MM-dd`, the shape the web app writes and `BodyProgress` reads.
    public static func dateKey(_ date: Date, calendar: Calendar = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// The weigh-in already stored for that day, if there is one. Rows written
    /// before the web app settled on `yyyy-MM-dd` carry a full timestamp, so
    /// the day is compared, never the string.
    public static func stored(
        on date: Date,
        in metrics: [BodyMetric],
        calendar: Calendar = .current
    ) -> BodyMetric? {
        metrics.last { metric in
            guard let stored = BodyProgress.parse(metric.date) else { return false }
            return calendar.isDate(stored, inSameDayAs: date)
        }
    }

    /// The row to write for a weight on a day: that day's row updated in
    /// place, or a new one. It never touches another day, and never adds a
    /// second row for a day that already has one.
    public static func entry(
        weightKg: Decimal,
        on date: Date,
        in metrics: [BodyMetric],
        id: @autoclosure () -> String = "\(Int(Date().timeIntervalSince1970 * 1000))",
        calendar: Calendar = .current
    ) -> BodyMetric {
        let weight = (weightKg as NSDecimalNumber).doubleValue
        guard var existing = stored(on: date, in: metrics, calendar: calendar) else {
            return BodyMetric(id: id(), date: dateKey(date, calendar: calendar), weight: weight)
        }
        existing.weight = weight
        return existing
    }

    /// The same row as the shared state stores it. `waist` is written only
    /// where the row already carried one, because this client never measures
    /// it and absent is how both clients read "not measured".
    public static func json(_ metric: BodyMetric) -> JSONValue {
        // A scale reads to a tenth. Rounding here keeps the binary artifacts
        // of a Double out of the shared state, where both clients read it.
        var weight = Decimal(metric.weight)
        var rounded = Decimal()
        NSDecimalRound(&rounded, &weight, 1, .plain)
        var object: [String: JSONValue] = [
            "id": .string(metric.id),
            "date": .string(metric.date),
            "weight": .number(rounded),
        ]
        if let waist = metric.waist { object["waist"] = .number(Decimal(waist)) }
        return .object(object)
    }
}
