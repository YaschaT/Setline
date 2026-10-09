import Foundation

/// Gold, silver and bronze for a lift: the day's best effort on an exercise
/// ranked against every comparable session before it. A workout that sets
/// no record can still be the second- or third-best day a lift has had, and
/// that is worth saying — the way a run that misses a best time still earns
/// a medal for the second-fastest.
///
/// The effort is the strongest working set by estimated one-rep max, or by
/// load where reps run past the estimate's range. Medals wait for the same
/// reference the records do: three comparable sessions before this one.
public struct LiftMedal: Hashable, Sendable, Identifiable {
    public enum Place: Int, Comparable, Sendable {
        case gold = 1, silver, bronze
        public static func < (lhs: Place, rhs: Place) -> Bool { lhs.rawValue < rhs.rawValue }

        public var title: String {
            switch self {
            case .gold: return "Best ever"
            case .silver: return "2nd best"
            case .bronze: return "3rd best"
            }
        }
    }

    public let place: Place
    public let exerciseID: String
    public let name: String
    /// The set the medal is for.
    public let weightKg: Decimal
    public let reps: Int
    /// Earlier sessions it was ranked against.
    public let sessionsCompared: Int

    public var id: String { exerciseID }

    public init(place: Place, exerciseID: String, name: String, weightKg: Decimal, reps: Int, sessionsCompared: Int) {
        self.place = place
        self.exerciseID = exerciseID
        self.name = name
        self.weightKg = weightKg
        self.reps = reps
        self.sessionsCompared = sessionsCompared
    }
}

public enum Medals {

    /// The effort a set stands for: its estimated one-rep max, or its load
    /// where the estimate does not reach.
    static func effort(_ set: LoggedSet) -> Decimal {
        let load = set.weightKg ?? 0
        return Estimates.e1RM(weightKg: load, reps: set.reps) ?? load
    }

    /// The strongest working set of one appearance.
    static func best(_ sets: [LoggedSet]) -> LoggedSet? {
        sets.filter { $0.countsTowardProgression && ($0.weightKg ?? 0) > 0 }
            .max { effort($0) < effort($1) }
    }

    /// The place one exercise's sets earn against its history, if any.
    ///
    /// Two ways a day can rank: its strongest set (the estimate), and its
    /// heaviest. The better of the two counts — so the heaviest weight ever
    /// moved is always gold, as the records screen says it is, even on a day
    /// whose estimate trails a lighter set done for more reps.
    public static func place(for sets: [LoggedSet], history: ExerciseHistory) -> (place: LiftMedal.Place, set: LoggedSet)? {
        guard history.hasReference, let strongest = best(sets) else { return nil }
        let earlier = history.appearances.map(\.sets)

        // Matching a day is not beating it: an equal effort ranks below the
        // day that did it first, so repeating a weight earns no gold.
        let byEffort = 1 + earlier.compactMap { best($0).map(effort) }
            .filter { $0 >= effort(strongest) - Estimates.epsilonKg }.count

        let heaviest = sets.filter { $0.countsTowardProgression && ($0.weightKg ?? 0) > 0 }
            .max { ($0.weightKg ?? 0) < ($1.weightKg ?? 0) }
        let byLoad = heaviest.map { top in
            1 + earlier.compactMap { day in day.filter(\.countsTowardProgression).compactMap(\.weightKg).max() }
                .filter { $0 >= (top.weightKg ?? 0) - Estimates.epsilonKg }.count
        } ?? Int.max

        let rank = min(byEffort, byLoad)
        guard let place = LiftMedal.Place(rawValue: rank) else { return nil }
        return (place, byLoad < byEffort ? heaviest ?? strongest : strongest)
    }

    /// Every medal one workout earns, gold first, judged against what came
    /// before that day — never against sessions logged since.
    public static func medals(for session: TrainingSession, in sessions: [TrainingSession]) -> [LiftMedal] {
        guard session.kind == .workout else { return [] }
        return session.results.compactMap { result -> LiftMedal? in
            let history = ExerciseHistory.build(
                exerciseID: result.exerciseID,
                modifiers: result.sets.first?.modifiers ?? .none,
                from: sessions.filter { $0.id != session.id },
                before: session.date
            )
            guard let earned = place(for: result.sets, history: history) else { return nil }
            return LiftMedal(
                place: earned.place,
                exerciseID: result.exerciseID,
                name: result.name,
                weightKg: earned.set.weightKg ?? 0,
                reps: earned.set.reps,
                sessionsCompared: history.appearances.count
            )
        }
        .sorted { $0.place < $1.place }
    }
}
