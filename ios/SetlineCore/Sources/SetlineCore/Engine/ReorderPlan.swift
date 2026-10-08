import Foundation

/// Doing a later exercise now, and coming back.
///
/// TRAINING_LOGIC §8, and the highest-value answer to an occupied machine:
/// it changes nothing. The exercise, its history and its progression state
/// all survive, where a substitution preserves none of them. That is why the
/// sheet offers it above the alternatives rather than beside them.
public struct ReorderPlan: Hashable, Sendable {
    /// Index in the session of the exercise to do now.
    public let candidateIndex: Int
    public let candidate: Exercise
    public let current: Exercise

    public init(candidateIndex: Int, candidate: Exercise, current: Exercise) {
        self.candidateIndex = candidateIndex
        self.candidate = candidate
        self.current = current
    }

    /// `Doe hack squat nu · Kom later terug voor bankdrukken`
    public var headline: String {
        "Do \(candidate.name.lowercased()) now · come back to \(current.name.lowercased()) later"
    }

    public var detail: String {
        "You keep \(current.name.lowercased()), including its history and progress."
    }
}

public enum ReorderPlanner {

    /// One exercise, or none.
    ///
    /// Candidates are later exercises that have not been started. A later
    /// primary lift is never pulled forward: moving a heavy lift out of the
    /// position it was programmed in is a bigger change than "the machine is
    /// busy" asks for, and it demotes whatever it jumps ahead of.
    public static func plan(
        current: Exercise,
        currentIndex: Int,
        currentIsComplete: Bool = false,
        later: [(exercise: Exercise, role: ExerciseRole, hasStarted: Bool)]
    ) -> ReorderPlan? {
        // "Kom later terug" only means something while there is something
        // left to come back for.
        guard !currentIsComplete else { return nil }
        for (offset, item) in later.enumerated() {
            guard !item.hasStarted else { continue }
            guard item.role != .primaryStrength else { continue }
            return ReorderPlan(
                candidateIndex: currentIndex + 1 + offset,
                candidate: item.exercise,
                current: current
            )
        }
        return nil
    }
}
