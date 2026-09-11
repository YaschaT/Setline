import Foundation

/// One past appearance of an exercise, reduced to what the engine compares.
public struct ExerciseAppearance: Hashable, Sendable {
    public let date: Date
    public let sets: [LoggedSet]

    public init(date: Date, sets: [LoggedSet]) {
        self.date = date
        self.sets = sets
    }

    public var topSet: LoggedSet? {
        sets.filter(\.countsTowardProgression).max { lhs, rhs in
            let l = Estimates.e1RM(weightKg: lhs.weightKg ?? 0, reps: lhs.reps) ?? (lhs.weightKg ?? 0)
            let r = Estimates.e1RM(weightKg: rhs.weightKg ?? 0, reps: rhs.reps) ?? (rhs.weightKg ?? 0)
            return l < r
        }
    }
}

/// The comparability rule from TRAINING_LOGIC §1, applied once, here.
///
/// "Two sets may be compared (for progression, PR or trend) only when
/// exerciseId, modifiers and unilateral all match. This one rule prevents
/// most of the wrong-number bugs in a training app."
public struct ExerciseHistory: Sendable {
    public let exerciseID: String
    public let modifiers: SetModifiers
    public let appearances: [ExerciseAppearance]

    public init(exerciseID: String, modifiers: SetModifiers, appearances: [ExerciseAppearance]) {
        self.exerciseID = exerciseID
        self.modifiers = modifiers
        self.appearances = appearances
    }

    /// Builds the comparable history for one exercise, newest first.
    ///
    /// Sets logged on a substitute belong to the substitute's own series and
    /// never enter the origin exercise's history (§12.5).
    public static func build(
        exerciseID: String,
        modifiers: SetModifiers,
        from sessions: [TrainingSession],
        before date: Date? = nil
    ) -> ExerciseHistory {
        let appearances: [ExerciseAppearance] = sessions
            .filter { $0.kind == .workout }
            .filter { session in date.map { cutoff in session.date < cutoff } ?? true }
            .compactMap { session in
                guard let result = session.results.first(where: { $0.exerciseID == exerciseID }) else { return nil }
                let comparable = result.sets.filter {
                    $0.countsTowardProgression && $0.modifiers.isComparable(to: modifiers)
                }
                guard !comparable.isEmpty else { return nil }
                return ExerciseAppearance(date: session.date, sets: comparable)
            }
            .sorted { $0.date > $1.date }

        return ExerciseHistory(exerciseID: exerciseID, modifiers: modifiers, appearances: appearances)
    }

    public var mostRecent: ExerciseAppearance? { appearances.first }

    /// Sets the reference gate. No proposal and no record until three
    /// comparable sessions exist (§10.2 guard 4; design 28b/29b "Referentie
    /// opbouwen · sessie N van 3").
    public static let sessionsBeforeReference = 3

    public var hasReference: Bool { appearances.count >= Self.sessionsBeforeReference }

    /// 1-based position in the reference build-up, for the copy
    /// "Referentie opbouwen · sessie 2 van 3".
    public var referenceSessionNumber: Int {
        min(appearances.count + 1, Self.sessionsBeforeReference)
    }
}
