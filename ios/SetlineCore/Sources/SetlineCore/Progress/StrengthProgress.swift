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

    /// Movement over the window the screen can actually show. The weeks are
    /// counted, never assumed: a history of five weeks says "in 5 weken".
    public struct Change: Equatable, Sendable {
        public let value: Decimal
        public let weeks: Int

        public init(value: Decimal, weeks: Int) {
            self.value = value
            self.weeks = weeks
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
    public let points: [Point]
    /// Newest first, as the artboard lists them.
    public let rows: [SessionRow]
    public let sessionCount: Int

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

        for (index, appearance) in appearances.enumerated() {
            guard let top = appearance.topSet, let load = top.weightKg else { continue }
            if let estimate = bestEstimate(in: appearance.sets) {
                points.append(Point(date: appearance.date, estimate: estimate))
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
            points: points,
            rows: rows.reversed(),
            sessionCount: appearances.count
        )
    }

    /// The best estimate one session offers, over its comparable sets.
    static func bestEstimate(in sets: [LoggedSet]) -> Decimal? {
        sets.compactMap { Estimates.e1RM(weightKg: $0.weightKg ?? 0, reps: $0.reps) }.max()
    }

    /// Against the session closest to eight weeks back, or the oldest one when
    /// the history is younger than that.
    static func change(in points: [Point], calendar: Calendar) -> Change? {
        guard let latest = points.last, points.count > 1 else { return nil }
        let windowStart = calendar.date(byAdding: .weekOfYear, value: -changeWindowWeeks, to: latest.date) ?? latest.date
        let baseline = points.last(where: { $0.date <= windowStart }) ?? points.first!
        guard baseline.date < latest.date else { return nil }

        let days = calendar.dateComponents([.day], from: baseline.date, to: latest.date).day ?? 0
        return Change(value: latest.estimate - baseline.estimate, weeks: max(1, Int((Double(days) / 7).rounded())))
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
