import Foundation

/// A progress photo, as it is kept on the phone.
///
/// The picture itself is a file in the app's own container. This is the record
/// beside it: when it was taken, and which file it is. Nothing here goes to a
/// server — the account's state has no room for it and is not asked for any.
public struct CheckIn: Identifiable, Equatable, Codable, Sendable {
    public let id: String
    public let date: String
    public let fileName: String

    public init(id: String, date: String, fileName: String) {
        self.id = id
        self.date = date
        self.fileName = fileName
    }
}

/// The check-ins an account has, and what they say next to each other.
public struct CheckInGallery: Equatable, Sendable {

    public struct Shown: Equatable, Sendable {
        public let checkIn: CheckIn
        public let date: Date
        public let weightKg: Decimal?
    }

    /// Oldest first, as the strip reads.
    public let all: [Shown]
    public let first: Shown?
    public let latest: Shown?
    /// Whole weeks between the two shown check-ins.
    public let weeks: Int?
    /// What the scale did between them, when both have a weigh-in.
    public let change: Decimal?

    public init(all: [Shown], first: Shown?, latest: Shown?, weeks: Int?, change: Decimal?) {
        self.all = all
        self.first = first
        self.latest = latest
        self.weeks = weeks
        self.change = change
    }

    public static let empty = CheckInGallery(all: [], first: nil, latest: nil, weeks: nil, change: nil)

    /// The weight beside a check-in is the account's own weigh-in for that day,
    /// never a number typed twice: add a weigh-in later and the caption fills
    /// itself in.
    public static func make(
        _ checkIns: [CheckIn],
        metrics: [BodyMetric],
        calendar: Calendar = .current
    ) -> CheckInGallery {
        let weights = Dictionary(
            metrics.map { ($0.date, Decimal($0.weight)) },
            uniquingKeysWith: { _, latest in latest }
        )

        let shown: [Shown] = checkIns
            .compactMap { checkIn in
                guard let date = dateFormatter(calendar).date(from: checkIn.date) else { return nil }
                return Shown(checkIn: checkIn, date: date, weightKg: weights[checkIn.date])
            }
            .sorted { $0.date < $1.date }

        guard let first = shown.first, let latest = shown.last, first.checkIn.id != latest.checkIn.id else {
            return CheckInGallery(all: shown, first: shown.first, latest: shown.last, weeks: nil, change: nil)
        }

        let days = calendar.dateComponents([.day], from: first.date, to: latest.date).day ?? 0
        let change: Decimal? = {
            guard let from = first.weightKg, let to = latest.weightKg else { return nil }
            return to - from
        }()

        return CheckInGallery(
            all: shown,
            first: first,
            latest: latest,
            weeks: max(1, Int((Double(days) / 7).rounded())),
            change: change
        )
    }

    private static func dateFormatter(_ calendar: Calendar) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }
}
