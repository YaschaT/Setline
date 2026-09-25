import Foundation

/// Artboard 20 · Progressie, segment Kracht: one exercise's strength over time.
///
/// Comparability is settled before anything is drawn. `ExerciseHistory` applies
/// the one rule from TRAINING_LOGIC §1 — same exercise, same modifiers, no
/// warm-ups, no technical breakdowns, no work logged on a substitute — so every
/// point on the chart and every row in the list belongs to the same series.
public struct StrengthProgress: Equatable, Sendable {

    public struct Point: Equatable, Sendable {
        public let date: Date
        public let estimate: Decimal

        public init(date: Date, estimate: Decimal) {
            self.date = date
            self.estimate = estimate
        }
    }

    /// Movement over the window the screen can actually show. 40a names the
    /// date it is measured from — "+6,2 kg sinds 13 jul" — because a reader
    /// can place a date and cannot place "in 8 weken"; the weeks are still
    /// counted, never assumed, for anything that wants a span.
    public struct Change: Equatable, Sendable {
        public let value: Decimal
        public let weeks: Int
        /// The session the comparison starts at, and what was estimated there.
        public let since: Date
        public let baseline: Decimal

        public init(value: Decimal, weeks: Int, since: Date, baseline: Decimal) {
            self.value = value
            self.weeks = weeks
            self.since = since
            self.baseline = baseline
        }
    }

    /// The set the current estimate was computed from (40a's source line, and
    /// the first row of 40e). It is a set that was really performed: the
    /// estimate is derived from it and was never itself lifted.
    public struct SourceSet: Equatable, Sendable {
        public let date: Date
        public let weightKg: Decimal
        public let reps: Int

        public init(date: Date, weightKg: Decimal, reps: Int) {
            self.date = date
            self.weightKg = weightKg
            self.reps = reps
        }
    }

    /// What the trailing edge of a session row states.
    public enum Marker: Equatable, Sendable {
        /// Heaviest load this exercise has carried (§10.1, Load PR).
        case record
        /// Load against the session before it.
        case delta(Decimal)
        case same
        /// Inside the three-session reference period, where no record counts
        /// (§10.2 guard 4).
        case building(session: Int, of: Int)
    }

    public struct SessionRow: Equatable, Sendable, Identifiable {
        public let id: String
        public let date: Date
        public let dayLabel: String
        public let setCount: Int
        public let weightKg: Decimal
        public let reps: Int
        public let marker: Marker

        public init(id: String, date: Date, dayLabel: String, setCount: Int, weightKg: Decimal, reps: Int, marker: Marker) {
            self.id = id
            self.date = date
            self.dayLabel = dayLabel
            self.setCount = setCount
            self.weightKg = weightKg
            self.reps = reps
            self.marker = marker
        }
    }

    public let exerciseID: String
    public let name: String
    /// `nil` when the most recent work holds no set of ≤10 reps: above that the
    /// estimate is not honest enough to show (§10.2 guard 2).
    public let estimate: Decimal?
    public let change: Change?
    /// `nil` when there is no estimate to explain.
    public let source: SourceSet?
    public let points: [Point]
    /// Newest first, as the artboard lists them.
    public let rows: [SessionRow]
    public let sessionCount: Int

    /// The change as a screen may state it: the difference between the two
    /// numbers it actually shows, each rounded to the step a gym has.
    ///
    /// Rounding both ends and subtracting keeps 126,5 − 120,5 = 6 — the
    /// arithmetic a reader can do on the explanation sheet (40e) — where
    /// rounding the exact difference would print 6,5 beside two numbers that
    /// differ by 6. `change.value` stays exact for anything that computes.
    public func shownChange(toIncrement increment: Decimal = Decimal(string: "0.5") ?? 0.5) -> Decimal? {
        guard let change, let estimate else { return nil }
        return Estimates.round(estimate, toIncrement: increment)
            - Estimates.round(change.baseline, toIncrement: increment)
    }

    public var hasReference: Bool { sessionCount >= ExerciseHistory.sessionsBeforeReference }
    /// "Referentie opbouwen · sessie 2 van 3" while the series is too short.
    public var referenceSessionNumber: Int {
        min(sessionCount + 1, ExerciseHistory.sessionsBeforeReference)
    }

    /// Eight weeks is the window the design states; a shorter history reports
    /// the span it really has.
    public static let changeWindowWeeks = 8

    public static func make(
        exerciseID: String,
        name: String,
        modifiers: SetModifiers = .none,
        sessions: [TrainingSession],
        calendar: Calendar = .current
    ) -> StrengthProgress {
        let history = ExerciseHistory.build(exerciseID: exerciseID, modifiers: modifiers, from: sessions)
        // Oldest first: a record is only a record against what came before it.
        let appearances = history.appearances.reversed().map { $0 }
        let sessionsByDate = Dictionary(grouping: sessions) { $0.date }

        var points: [Point] = []
        var rows: [SessionRow] = []
        var heaviestSoFar: Decimal = 0
        var previousTopLoad: Decimal?

        var source: SourceSet?

        for (index, appearance) in appearances.enumerated() {
            guard let top = appearance.topSet, let load = top.weightKg else { continue }
            if let best = bestSet(in: appearance.sets), let estimate = best.estimate {
                points.append(Point(date: appearance.date, estimate: estimate))
                // The newest session with an estimate wins, because that is
                // the estimate the screen states.
                source = SourceSet(date: appearance.date, weightKg: best.weightKg, reps: best.reps)
            }

            let marker: Marker
            if index < ExerciseHistory.sessionsBeforeReference {
                marker = .building(session: index + 1, of: ExerciseHistory.sessionsBeforeReference)
            } else if load > heaviestSoFar + Estimates.epsilonKg {
                marker = .record
            } else if let previous = previousTopLoad {
                let difference = load - previous
                marker = abs(difference) <= Estimates.epsilonKg ? .same : .delta(difference)
            } else {
                marker = .same
            }

            let session = sessionsByDate[appearance.date]?.first { $0.kind == .workout }
            rows.append(SessionRow(
                id: (session?.id ?? LegacyAdapter.isoString(appearance.date)) + ":" + exerciseID,
                date: appearance.date,
                dayLabel: session?.dayLabel ?? "",
                setCount: appearance.sets.count,
                weightKg: load,
                reps: top.reps,
                marker: marker
            ))

            heaviestSoFar = max(heaviestSoFar, load)
            previousTopLoad = load
        }

        return StrengthProgress(
            exerciseID: exerciseID,
            name: name,
            estimate: points.last?.estimate,
            change: change(in: points, calendar: calendar),
            source: source,
            points: points,
            rows: rows.reversed(),
            sessionCount: appearances.count
        )
    }

    /// The best estimate one session offers, over its comparable sets.
    static func bestEstimate(in sets: [LoggedSet]) -> Decimal? {
        bestSet(in: sets)?.estimate
    }

    /// The set that estimate came from, so the screen can say which one it was.
    static func bestSet(in sets: [LoggedSet]) -> (weightKg: Decimal, reps: Int, estimate: Decimal?)? {
        sets
            .map { (weightKg: $0.weightKg ?? 0, reps: $0.reps, estimate: Estimates.e1RM(weightKg: $0.weightKg ?? 0, reps: $0.reps)) }
            .filter { $0.estimate != nil }
            .max { ($0.estimate ?? 0) < ($1.estimate ?? 0) }
    }

    /// Against the session nearest to eight weeks back — before or after it,
    /// whichever is closer, so a gap in training does not stretch the window
    /// the screen names.
    static func change(in points: [Point], calendar: Calendar) -> Change? {
        guard let latest = points.last, points.count > 1 else { return nil }
        let windowStart = calendar.date(byAdding: .weekOfYear, value: -changeWindowWeeks, to: latest.date) ?? latest.date
        let earlier = points.dropLast()
        guard let baseline = earlier.min(by: {
            abs($0.date.timeIntervalSince(windowStart)) < abs($1.date.timeIntervalSince(windowStart))
        }) else { return nil }
        guard baseline.date < latest.date else { return nil }

        let days = calendar.dateComponents([.day], from: baseline.date, to: latest.date).day ?? 0
        return Change(
            value: latest.estimate - baseline.estimate,
            weeks: max(1, Int((Double(days) / 7).rounded())),
            since: baseline.date,
            baseline: baseline.estimate
        )
    }
}

/// Which exercises the Kracht segment offers, and in which order.
public enum StrengthSelection {

    public struct Choice: Equatable, Sendable, Identifiable {
        public let exerciseID: String
        public let name: String
        public let modifiers: SetModifiers
        public var id: String { exerciseID }

        public init(exerciseID: String, name: String, modifiers: SetModifiers) {
            self.exerciseID = exerciseID
            self.name = name
            self.modifiers = modifiers
        }
    }

    /// Only exercises with enough comparable history to say anything, the
    /// current plan's primary lifts first, then the most recently trained.
    /// Ties break on name, so the row never reshuffles between launches.
    public static func choices(sessions: [TrainingSession], plan: [WorkoutDay]) -> [Choice] {
        let planned = plan.flatMap(\.exercises)
        var seen: Set<String> = []
        var candidates: [(choice: Choice, isPrimary: Bool, planIndex: Int, lastTrained: Date)] = []

        for session in sessions.filter({ $0.kind == .workout }) {
            for result in session.results where !seen.contains(result.exerciseID) {
                let plannedExercise = planned.first { $0.exerciseID == result.exerciseID }
                let modifiers = plannedExercise?.modifiers ?? .none
                let history = ExerciseHistory.build(
                    exerciseID: result.exerciseID,
                    modifiers: modifiers,
                    from: sessions
                )
                guard history.hasReference, let lastTrained = history.mostRecent?.date else { continue }
                seen.insert(result.exerciseID)

                let name = ExerciseCatalog.exercise(result.exerciseID)?.name ?? result.name
                candidates.append((
                    Choice(exerciseID: result.exerciseID, name: name, modifiers: modifiers),
                    plannedExercise?.role == .primaryStrength,
                    planned.firstIndex { $0.exerciseID == result.exerciseID } ?? Int.max,
                    lastTrained
                ))
            }
        }

        return candidates
            .sorted { lhs, rhs in
                if lhs.isPrimary != rhs.isPrimary { return lhs.isPrimary }
                if lhs.isPrimary, lhs.planIndex != rhs.planIndex { return lhs.planIndex < rhs.planIndex }
                if lhs.lastTrained != rhs.lastTrained { return lhs.lastTrained > rhs.lastTrained }
                return lhs.choice.name < rhs.choice.name
            }
            .map(\.choice)
    }
}
