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
        /// half kilo — measured only against earlier sets performed the same
        /// way (`SetExecution.isComparable`). `nil` when there is no such set.
        public let delta: Decimal?
        /// Whether the exercise has an estimated set before the window at all,
        /// performed any way. Without a delta it tells a new exercise from one
        /// whose earlier sets were performed differently: only the first is new.
        public let hasEarlierBest: Bool

        public var id: String { exerciseID }

        public init(
            exerciseID: String,
            name: String,
            weightKg: Decimal,
            reps: Int,
            date: Date,
            delta: Decimal?,
            hasEarlierBest: Bool
        ) {
            self.exerciseID = exerciseID
            self.name = name
            self.weightKg = weightKg
            self.reps = reps
            self.date = date
            self.delta = delta
            self.hasEarlierBest = hasEarlierBest
        }
    }

    /// Per exercise, the best set since `since`, most recently trained first.
    ///
    /// Only sets that carry an estimate take part: a comparison between two
    /// sets of fifteen would be a comparison of nothing. The best set is the
    /// strongest one however it was performed — a set that paused only some
    /// of its reps included, as the set it was — but its change is stated
    /// only against earlier sets performed the same way (TRAINING_LOGIC §9.2).
    /// Measured against an earlier paused best, a touch-and-go set reads as
    /// progress that is only the pause coming off. `lib/setline-log.ts` keeps
    /// the web app to the same rule (`tests/fixtures/best-set-comparison.json`).
    public static func bestSets(
        in sessions: [TrainingSession],
        since: Date,
        limit: Int = 5
    ) -> [RecentBest] {
        struct Scored {
            let weight: Decimal
            let reps: Int
            let estimate: Decimal
            let execution: SetExecution
        }
        struct Entry {
            var name: String
            var best: (set: Scored, date: Date)?
            var earlier: [Scored] = []
            var lastTrained: Date = .distantPast
        }
        var byExercise: [String: Entry] = [:]
        var order: [String] = []

        for session in sessions where session.kind == .workout {
            for result in session.results {
                let scored = result.sets.compactMap { set -> Scored? in
                    guard weighs(set), let weight = set.weightKg,
                          let estimate = Estimates.e1RM(weightKg: weight, reps: set.reps)
                    else { return nil }
                    return Scored(weight: weight, reps: set.reps, estimate: estimate, execution: set.execution)
                }
                guard !scored.isEmpty else { continue }
                if byExercise[result.exerciseID] == nil {
                    byExercise[result.exerciseID] = Entry(name: result.name)
                    order.append(result.exerciseID)
                }
                guard var entry = byExercise[result.exerciseID] else { continue }
                if session.date >= since {
                    for set in scored {
                        if entry.best.map({ set.estimate > $0.set.estimate }) ?? true {
                            entry.best = (set, session.date)
                        }
                    }
                    if session.date >= entry.lastTrained {
                        entry.lastTrained = session.date
                        entry.name = result.name
                    }
                } else {
                    entry.earlier += scored
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
                let before = entry.earlier
                    .filter { $0.execution.isComparable(to: best.set.execution) }
                    .map(\.estimate)
                    .max()
                return RecentBest(
                    exerciseID: id,
                    name: entry.name,
                    weightKg: best.set.weight,
                    reps: best.set.reps,
                    date: best.date,
                    delta: before.map { Estimates.round(best.set.estimate - $0, toIncrement: 0.5) },
                    hasEarlierBest: !entry.earlier.isEmpty
                )
            }
    }

    /// The sets the best sets weigh: what progression counts, and a mixed set
    /// too — it is a set that was performed, and only its comparison is
    /// restricted. Warm-ups, breakdowns and partial reps stay out.
    private static func weighs(_ set: LoggedSet) -> Bool {
        guard set.isLogged, !set.isWarmup, !set.flags.contains(.technicalBreakdown) else { return false }
        return (set.partialReps ?? 0) == 0
    }

    // MARK: - Progress per training day

    /// How one kind of training day — Push, Pull, Legs, Upper, Lower — has
    /// moved inside a window.
    public struct DayProgress: Equatable, Sendable, Identifiable {
        public let dayID: String
        /// The name the latest of these sessions carried.
        public let label: String
        /// Sessions of this day inside the window.
        public let sessions: Int
        /// The mean change of the day's lifts, in percent of estimated
        /// maximum, to a tenth. `nil` while no lift has two comparable points.
        public let changePercent: Decimal?
        /// The lift that gained the most, in kilos of estimated maximum.
        public let leader: Leader?
        /// Every lift of the day with its best set in the window, in the
        /// order the day trains them.
        public let lifts: [Lift]
        /// The day's best so far after each session, against the lifts'
        /// baselines, oldest first: 100 is where the day started, 107 is
        /// seven percent stronger. Each lift counts at its best up to that
        /// session, so the line never dips on a lighter day and ends exactly
        /// at `changePercent` + 100. Sessions before any measured lift are
        /// left out.
        public let strength: [Decimal]
        public let lastTrained: Date

        public struct Leader: Equatable, Sendable {
            public let exerciseID: String
            public let name: String
            public let deltaKg: Decimal

            public init(exerciseID: String, name: String, deltaKg: Decimal) {
                self.exerciseID = exerciseID
                self.name = name
                self.deltaKg = deltaKg
            }
        }

        /// One lift's best set inside the window.
        public struct Lift: Equatable, Sendable, Identifiable {
            public let exerciseID: String
            public let name: String
            public let weightKg: Decimal
            public let reps: Int
            public let date: Date
            /// Estimated maximum gained since the lift's baseline, to the
            /// half kilo; `nil` when there is nothing comparable to measure from.
            public let deltaKg: Decimal?
            /// No set of this lift before the window and one session in it.
            public let isNew: Bool

            public var id: String { exerciseID }

            public init(exerciseID: String, name: String, weightKg: Decimal, reps: Int, date: Date, deltaKg: Decimal?, isNew: Bool) {
                self.exerciseID = exerciseID
                self.name = name
                self.weightKg = weightKg
                self.reps = reps
                self.date = date
                self.deltaKg = deltaKg
                self.isNew = isNew
            }
        }

        public var id: String { dayID }

        public init(
            dayID: String, label: String, sessions: Int, changePercent: Decimal?,
            leader: Leader?, lifts: [Lift] = [], strength: [Decimal], lastTrained: Date
        ) {
            self.dayID = dayID
            self.label = label
            self.sessions = sessions
            self.changePercent = changePercent
            self.leader = leader
            self.lifts = lifts
            self.strength = strength
            self.lastTrained = lastTrained
        }
    }

    /// Per training day, how its lifts moved since `since`, most recently
    /// trained first.
    ///
    /// Each lift of the day is measured from a baseline to its best inside
    /// the window, both as estimated maxima and only between sets performed
    /// the same way (`SetExecution.isComparable`), as the best sets are. The
    /// baseline is the lift's best before the window; for a lift with no
    /// history before it, its first session inside the window, so a young
    /// account still sees where it is going. A lift trained once and never
    /// before has nothing to compare and takes no part.
    public static func progressByDay(in sessions: [TrainingSession], since: Date) -> [DayProgress] {
        struct Scored {
            let estimate: Decimal
            let execution: SetExecution
            var weight: Decimal = 0
            var reps: Int = 0
            var date: Date = .distantPast
        }
        func scored(_ result: ExerciseResult, on date: Date = .distantPast) -> [Scored] {
            result.sets.compactMap { set in
                guard weighs(set), let weight = set.weightKg,
                      let estimate = Estimates.e1RM(weightKg: weight, reps: set.reps) else { return nil }
                return Scored(estimate: estimate, execution: set.execution, weight: weight, reps: set.reps, date: date)
            }
        }

        let workouts = sessions.filter { $0.kind == .workout }.sorted { $0.date < $1.date }
        // Every estimated set before the window, per lift, whichever day it was on.
        var before: [String: [Scored]] = [:]
        for session in workouts where session.date < since {
            for result in session.results { before[result.exerciseID, default: []] += scored(result) }
        }

        let inWindow = workouts.filter { $0.date >= since }
        var order: [String] = []
        var grouped: [String: [TrainingSession]] = [:]
        for session in inWindow {
            if grouped[session.dayID] == nil { order.append(session.dayID) }
            grouped[session.dayID, default: []].append(session)
        }

        return order.compactMap { dayID -> DayProgress? in
            guard let days = grouped[dayID], let latest = days.last else { return nil }
            // Per lift: its sets per session, in order, and its latest name.
            var lifts: [String: (name: String, perSession: [[Scored]])] = [:]
            var liftOrder: [String] = []
            for session in days {
                for result in session.results {
                    let sets = scored(result, on: session.date)
                    guard !sets.isEmpty else { continue }
                    if lifts[result.exerciseID] == nil { liftOrder.append(result.exerciseID) }
                    lifts[result.exerciseID, default: (result.name, [])].perSession.append(sets)
                    lifts[result.exerciseID]?.name = result.name
                }
            }

            var percents: [Decimal] = []
            var leader: DayProgress.Leader?
            // Per lift, what it is measured from and how it was performed.
            var references: [String: Scored] = [:]
            var liftBests: [DayProgress.Lift] = []
            for id in liftOrder {
                guard let lift = lifts[id] else { continue }
                let windowSets = lift.perSession.flatMap { $0 }
                // On a tie, the latest: the set shown is the one most recently matched.
                guard let best = windowSets.reduce(nil as Scored?, { kept, set in
                    guard let kept else { return set }
                    return set.estimate >= kept.estimate ? set : kept
                }) else { continue }
                let isNew = (before[id] ?? []).isEmpty && lift.perSession.count == 1
                func keep(_ delta: Decimal?) {
                    liftBests.append(.init(
                        exerciseID: id, name: lift.name, weightKg: best.weight, reps: best.reps, date: best.date,
                        deltaKg: delta, isNew: isNew
                    ))
                }
                let earlier = before[id] ?? []
                let baseline: Decimal?
                let current: Decimal
                if let previous = earlier.filter({ $0.execution.isComparable(to: best.execution) }).map(\.estimate).max() {
                    baseline = previous
                    current = best.estimate
                } else if earlier.isEmpty, lift.perSession.count > 1,
                          let first = lift.perSession[0].max(by: { $0.estimate < $1.estimate }) {
                    // Measured from the first session, against the later
                    // sessions' sets performed the same way.
                    let later = lift.perSession.dropFirst().flatMap { $0 }
                        .filter { $0.execution.isComparable(to: first.execution) }
                        .map(\.estimate).max()
                    baseline = later == nil ? nil : first.estimate
                    current = later ?? first.estimate
                } else {
                    baseline = nil
                    current = best.estimate
                }
                guard let baseline, baseline > 0 else {
                    keep(nil)
                    continue
                }
                references[id] = Scored(estimate: baseline, execution: best.execution)
                percents.append((current - baseline) / baseline * 100)
                let delta = Estimates.round(current - baseline, toIncrement: 0.5)
                keep(delta)
                if delta > 0, delta > (leader?.deltaKg ?? 0) {
                    leader = .init(exerciseID: id, name: lift.name, deltaKg: delta)
                }
            }
            let mean = percents.isEmpty ? nil : percents.reduce(0, +) / Decimal(percents.count)
            return DayProgress(
                dayID: dayID,
                label: latest.dayLabel,
                sessions: days.count,
                changePercent: mean.map { Estimates.round($0, toIncrement: 0.1) },
                leader: leader,
                lifts: liftBests,
                strength: {
                    var bestSoFar: [String: Decimal] = [:]
                    return days.compactMap { session -> Decimal? in
                        for result in session.results {
                            guard let reference = references[result.exerciseID],
                                  let top = scored(result)
                                    .filter({ $0.execution.isComparable(to: reference.execution) })
                                    .map(\.estimate).max()
                            else { continue }
                            let ratio = top / reference.estimate * 100
                            bestSoFar[result.exerciseID] = max(bestSoFar[result.exerciseID] ?? 0, ratio)
                        }
                        // A lift measured from before the window starts at its
                        // baseline even on a session it was not trained.
                        for id in references.keys where bestSoFar[id] == nil && (before[id]?.isEmpty == false) {
                            bestSoFar[id] = 100
                        }
                        guard !bestSoFar.isEmpty else { return nil }
                        return bestSoFar.values.reduce(0, +) / Decimal(bestSoFar.count)
                    }
                }(),
                lastTrained: latest.date
            )
        }
        .sorted { $0.lastTrained > $1.lastTrained }
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
