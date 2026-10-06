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

    /// How far apart two check-ins are, as far as their dates can say it: the
    /// same day, days below a week, and weeks from a week on — rounded, as 97
    /// days reads "14 weken". Never more time than there was: two pictures a
    /// day apart are a day apart, not a week.
    public enum Span: Equatable, Sendable {
        case sameDay
        case days(Int)
        case weeks(Int)

        public init(days: Int) {
            switch days {
            case ...0: self = .sameDay
            case 1..<7: self = .days(days)
            default: self = .weeks(Int((Double(days) / 7).rounded()))
            }
        }
    }

    /// Oldest first, as the strip reads.
    public let all: [Shown]
    public let first: Shown?
    public let latest: Shown?
    /// How far apart the first and the latest check-in are.
    public let span: Span?
    /// What the scale did between them, when both have a weigh-in.
    public let change: Decimal?

    public init(all: [Shown], first: Shown?, latest: Shown?, span: Span?, change: Decimal?) {
        self.all = all
        self.first = first
        self.latest = latest
        self.span = span
        self.change = change
    }

    public static let empty = CheckInGallery(all: [], first: nil, latest: nil, span: nil, change: nil)

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
            return CheckInGallery(all: shown, first: shown.first, latest: shown.last, span: nil, change: nil)
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
            span: Span(days: days),
            change: change
        )
    }

    // MARK: - Two of them, side by side

    /// Two check-ins next to each other: the earlier one, the later one, and
    /// what lies between them.
    public struct Comparison: Equatable, Sendable {
        public let before: Shown
        public let after: Shown
        /// How far apart the two are.
        public let span: Span
        /// What the scale did between them, when both have a weigh-in.
        public let change: Decimal?
    }

    /// The pair the screen compares. By default the first check-in against
    /// the latest; any two can be chosen instead, and whichever is earlier is
    /// the "before" — the order they were picked in does not matter.
    ///
    /// `nil` until there are two different check-ins to compare. An id that no
    /// longer exists (the photo was removed) falls back to the default.
    public func comparison(
        _ firstID: String? = nil,
        _ secondID: String? = nil,
        calendar: Calendar = .current
    ) -> Comparison? {
        func find(_ id: String?) -> Shown? { id.flatMap { id in all.first { $0.checkIn.id == id } } }
        var pair: (Shown, Shown)?
        if let one = find(firstID), let other = find(secondID), one.checkIn.id != other.checkIn.id {
            pair = one.date <= other.date ? (one, other) : (other, one)
        } else if let first, let latest, first.checkIn.id != latest.checkIn.id {
            pair = (first, latest)
        }
        guard let (before, after) = pair else { return nil }

        let days = calendar.dateComponents([.day], from: before.date, to: after.date).day ?? 0
        let change: Decimal? = {
            guard let from = before.weightKg, let to = after.weightKg else { return nil }
            return to - from
        }()
        return Comparison(before: before, after: after, span: Span(days: days), change: change)
    }

    // MARK: - All of them, one after another

    /// One picture in the player: when it was taken counted from the first
    /// picture the player shows.
    public struct Frame: Equatable, Sendable {
        public let shown: Shown
        public let since: Span
    }

    /// How far back the player looks: every picture, or the last stretch of
    /// them — counted back from the latest picture, not from today, so a
    /// month without photos does not empty "the last three months".
    public enum Period: String, CaseIterable, Sendable {
        case all, year, halfYear, quarter, month

        var days: Int? {
            switch self {
            case .all: return nil
            case .year: return 365
            case .halfYear: return 182
            case .quarter: return 91
            case .month: return 30
            }
        }
    }

    /// The pictures of a period, oldest first, each with how long after the
    /// period's first picture it was taken.
    public func frames(in period: Period, calendar: Calendar = .current) -> [Frame] {
        let shown = pictures(in: period, calendar: calendar)
        guard let start = shown.first?.date else { return [] }
        return shown.map { picture in
            let days = calendar.dateComponents([.day], from: start, to: picture.date).day ?? 0
            return Frame(shown: picture, since: Span(days: days))
        }
    }

    /// The periods worth offering: every picture, and each shorter stretch
    /// that still holds two pictures and shows fewer than the one before it.
    public func periods(calendar: Calendar = .current) -> [Period] {
        guard all.count > 1 else { return [] }
        var offered: [Period] = [.all]
        var shown = all.count
        for period in Period.allCases.dropFirst() {
            let count = pictures(in: period, calendar: calendar).count
            guard count >= 2 else { break }
            if count < shown {
                offered.append(period)
                shown = count
            }
        }
        return offered
    }

    private func pictures(in period: Period, calendar: Calendar) -> [Shown] {
        guard let days = period.days, let latest = all.last?.date,
              let start = calendar.date(byAdding: .day, value: -days, to: latest) else { return all }
        return all.filter { $0.date >= start }
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
