import Foundation

/// What the redesign's overview screens state about the sets an account wrote
/// down: the best set of a session (Agenda · "Vorige week"), the best sets of
/// the last weeks and the tonnage per week (Progressie), and the trailing
/// average under the weight chart.
///
/// Every number is read from stored sessions and weigh-ins. Nothing is
/// estimated beyond the one estimate the app already makes — the one-rep
/// maximum that lets a heavy triple be weighed against a lighter set of eight
/// — and the screens say so where they use it.
///
/// The web app computes the same things in `lib/setline-log.ts`; the two are
/// kept to the same rules.
public enum ProgressOverview {

    // MARK: - The best set

    /// One set, named by the exercise it belongs to.
    public struct BestSet: Equatable, Sendable {
        public let exerciseID: String
        public let name: String
        public let weightKg: Decimal
        public let reps: Int
        /// `nil` above ten reps, where no estimate is made.
        public let estimate: Decimal?

        public init(exerciseID: String, name: String, weightKg: Decimal, reps: Int, estimate: Decimal?) {
            self.exerciseID = exerciseID
            self.name = name
            self.weightKg = weightKg
            self.reps = reps
            self.estimate = estimate
        }
    }

    /// The strongest of these sets: the highest estimated maximum, and among
    /// sets that carry no estimate, the heaviest. Warm-ups, breakdowns and
    /// sets that mix partial or paused reps are left out, exactly as records
    /// and progression leave them out.
    public static func best(of sets: [LoggedSet]) -> LoggedSet? {
        let candidates = sets.filter(\.countsTowardProgression)
        let estimated = candidates.compactMap { set -> (LoggedSet, Decimal)? in
            guard let weight = set.weightKg, let estimate = Estimates.e1RM(weightKg: weight, reps: set.reps) else { return nil }
            return (set, estimate)
        }
        if let top = estimated.max(by: { $0.1 < $1.1 }) { return top.0 }
        return candidates.max { lhs, rhs in
            let (left, right) = (lhs.weightKg ?? 0, rhs.weightKg ?? 0)
            return left == right ? lhs.reps < rhs.reps : left < right
        }
    }

    /// The best set a session holds, across its exercises. A set with an
    /// estimate outranks one without, so a day of bench and lateral raises is
    /// described by the bench.
    public static func best(in session: TrainingSession) -> BestSet? {
        let tops: [BestSet] = session.results.compactMap { result in
            guard let set = best(of: result.sets), let weight = set.weightKg else { return nil }
            return BestSet(
                exerciseID: result.exerciseID,
                name: result.name,
                weightKg: weight,
                reps: set.reps,
                estimate: Estimates.e1RM(weightKg: weight, reps: set.reps)
            )
        }
        return tops.max { lhs, rhs in
            switch (lhs.estimate, rhs.estimate) {
            case let (left?, right?): return left < right
            case (nil, _?): return true
            case (_?, nil): return false
            case (nil, nil): return lhs.weightKg < rhs.weightKg
            }
        }
    }

    // MARK: - Best sets of the last weeks

    /// An exercise's best set inside a window, and how it compares with the
    /// best set before the window opened.
    public struct RecentBest: Equatable, Sendable, Identifiable {
        public let exerciseID: String
        public let name: String
        public let weightKg: Decimal
        public let reps: Int
        public let date: Date
        /// Estimated maximum now minus the best one before the window, to the
        /// half kilo. `nil` when the exercise was never trained before it, or
        /// when neither side carries an estimate.
        public let delta: Decimal?

        public var id: String { exerciseID }

        public init(exerciseID: String, name: String, weightKg: Decimal, reps: Int, date: Date, delta: Decimal?) {
            self.exerciseID = exerciseID
            self.name = name
            self.weightKg = weightKg
            self.reps = reps
            self.date = date
            self.delta = delta
        }
    }

    /// Per exercise, the best set since `since`, most recently trained first.
    ///
    /// Only sets that carry an estimate take part: a comparison between two
    /// sets of fifteen would be a comparison of nothing.
    public static func bestSets(
        in sessions: [TrainingSession],
        since: Date,
        limit: Int = 5
    ) -> [RecentBest] {
        struct Entry {
            var name: String
            var best: (weight: Decimal, reps: Int, estimate: Decimal, date: Date)?
            var before: Decimal?
            var lastTrained: Date = .distantPast
        }
        var byExercise: [String: Entry] = [:]
        var order: [String] = []

        for session in sessions where session.kind == .workout {
            for result in session.results {
                guard let set = best(of: result.sets),
                      let weight = set.weightKg,
                      let estimate = Estimates.e1RM(weightKg: weight, reps: set.reps)
                else { continue }
                if byExercise[result.exerciseID] == nil {
                    byExercise[result.exerciseID] = Entry(name: result.name)
                    order.append(result.exerciseID)
                }
                guard var entry = byExercise[result.exerciseID] else { continue }
                if session.date >= since {
                    if entry.best.map({ estimate > $0.estimate }) ?? true {
                        entry.best = (weight, set.reps, estimate, session.date)
                    }
                    if session.date >= entry.lastTrained {
                        entry.lastTrained = session.date
                        entry.name = result.name
                    }
                } else if entry.before.map({ estimate > $0 }) ?? true {
                    entry.before = estimate
                }
                byExercise[result.exerciseID] = entry
            }
        }

        return order
            .compactMap { id -> (String, Entry)? in byExercise[id].map { (id, $0) } }
            .filter { $0.1.best != nil }
            .sorted { $0.1.lastTrained > $1.1.lastTrained }
            .prefix(limit)
            .compactMap { id, entry in
                guard let best = entry.best else { return nil }
                return RecentBest(
                    exerciseID: id,
                    name: entry.name,
                    weightKg: best.weight,
                    reps: best.reps,
                    date: best.date,
                    delta: entry.before.map { Estimates.round(best.estimate - $0, toIncrement: 0.5) }
                )
            }
    }

    // MARK: - Tonnage per week

    public struct WeekVolume: Equatable, Sendable, Identifiable {
        /// The Monday the week starts on.
        public let start: Date
        /// ISO 8601 week number — "w36".
        public let number: Int
        public let volumeKg: Decimal
        public let isCurrent: Bool

        public var id: Date { start }

        public init(start: Date, number: Int, volumeKg: Decimal, isCurrent: Bool) {
            self.start = start
            self.number = number
            self.volumeKg = volumeKg
            self.isCurrent = isCurrent
        }
    }

    /// Volume per Monday-to-Sunday week, oldest first, ending with the week
    /// `now` falls in. A week without a workout is zero, not missing.
    public static func weeklyVolume(
        in sessions: [TrainingSession],
        weeks: Int = 7,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [WeekVolume] {
        guard weeks > 0, let thisMonday = Schedule.mondayFirstWeek(containing: now, calendar: calendar).first else { return [] }
        var iso = Calendar(identifier: .iso8601)
        iso.timeZone = calendar.timeZone

        let starts: [Date] = (0..<weeks).compactMap { index in
            calendar.date(byAdding: .day, value: -7 * (weeks - 1 - index), to: thisMonday)
        }
        var totals: [String: Decimal] = [:]
        for session in sessions where session.kind == .workout {
            guard let monday = Schedule.mondayFirstWeek(containing: session.date, calendar: calendar).first else { continue }
            totals[Schedule.dateKey(monday, calendar: calendar), default: 0] += RecordsEngine.volumeLoad(session.results.flatMap(\.sets))
        }
        return starts.enumerated().map { index, start in
            WeekVolume(
                start: start,
                number: iso.component(.weekOfYear, from: start),
                volumeKg: totals[Schedule.dateKey(start, calendar: calendar)] ?? 0,
                isCurrent: index == starts.count - 1
            )
        }
    }

    // MARK: - Weight, smoothed

    public struct WeightPoint: Equatable, Sendable, Identifiable {
        public let date: Date
        public let weightKg: Decimal
        /// The mean of the weigh-ins in the window ending on this day.
        public let average: Decimal

        public var id: Date { date }

        public init(date: Date, weightKg: Decimal, average: Decimal) {
            self.date = date
            self.weightKg = weightKg
            self.average = average
        }
    }

    /// Every weigh-in with its trailing average: the mean of the weigh-ins in
    /// the `days` calendar days up to and including it. Oldest first.
    ///
    /// Reads the series `BodyProgress` already parsed, so the chart and the
    /// list under it can never disagree about which weigh-ins exist.
    public static func weightTrend(_ progress: BodyProgress, days: Int = 14) -> [WeightPoint] {
        let points = progress.points
        let span = TimeInterval(max(1, days) - 1) * 86_400
        return points.map { point in
            let opens = point.date.addingTimeInterval(-span)
            let window = points.filter { $0.date >= opens && $0.date <= point.date }
            let sum = window.reduce(Decimal(0)) { $0 + $1.weightKg }
            return WeightPoint(
                date: point.date,
                weightKg: point.weightKg,
                average: sum / Decimal(max(1, window.count))
            )
        }
    }
}

extension Agenda {

    /// How far a week lies from this one, in the words both clients use:
    /// "Deze week", "Vorige week", "Volgende week", "3 weken geleden",
    /// "Over 2 weken".
    public static func weekLabel(containing date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        guard let monday = Schedule.mondayFirstWeek(containing: date, calendar: calendar).first,
              let thisMonday = Schedule.mondayFirstWeek(containing: now, calendar: calendar).first
        else { return "Deze week" }
        let days = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: thisMonday),
            to: calendar.startOfDay(for: monday)
        ).day ?? 0
        let offset = Int((Double(days) / 7).rounded())
        switch offset {
        case 0: return "Deze week"
        case -1: return "Vorige week"
        case 1: return "Volgende week"
        case ..<0: return "\(-offset) weken geleden"
        default: return "Over \(offset) weken"
        }
    }
}
