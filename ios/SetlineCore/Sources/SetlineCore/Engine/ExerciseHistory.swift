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

    /// One comparable series of an exercise: the sets that may be compared to
    /// each other, and how much of it the account has.
    ///
    /// An exercise can hold more than one. Bench pressed touch-and-go and
    /// bench pressed with a two-second pause are two series of the same
    /// exercise (§9.2), and a screen that shows one of them has to know which.
    public struct Series: Equatable, Sendable {
        public let modifiers: SetModifiers
        public let sessions: Int
        public let lastTrained: Date

        public init(modifiers: SetModifiers, sessions: Int, lastTrained: Date) {
            self.modifiers = modifiers
            self.sessions = sessions
            self.lastTrained = lastTrained
        }

        /// How a reader tells two series of one exercise apart.
        public var label: String {
            var parts: [String] = []
            if modifiers.pauseEnabled {
                let seconds = modifiers.pauseSeconds ?? 2
                let whole = seconds == seconds.rounded() ? String(Int(seconds)) : String(format: "%.1f", seconds)
                parts.append("paused · \(whole) s")
            } else {
                parts.append("no pause")
            }
            if modifiers.restrictedROM { parts.append("partial ROM") }
            return parts.joined(separator: " · ")
        }
    }

    /// Every series this account has for one exercise, the one it has most of
    /// first (ties to the one trained most recently).
    ///
    /// Sets that belong to no series — a mix of paused and unpaused reps, a
    /// technical breakdown, a warm-up — are in none of them, exactly as they
    /// are in no progression.
    public static func series(
        exerciseID: String,
        from sessions: [TrainingSession]
    ) -> [Series] {
        var found: [SetModifiers: (sessions: Int, last: Date)] = [:]

        for session in sessions where session.kind == .workout {
            guard let result = session.results.first(where: { $0.exerciseID == exerciseID }) else { continue }
            var seenHere: Set<SetModifiers> = []
            for set in result.sets where set.countsTowardProgression {
                // Pause length is compared with a tolerance, so a series is
                // keyed by the first shape that matched it rather than by an
                // exact 2.0 vs 2.0000001.
                let key = found.keys.first { $0.isComparable(to: set.modifiers) } ?? set.modifiers
                guard !seenHere.contains(key) else { continue }
                seenHere.insert(key)
                let held = found[key]
                found[key] = ((held?.sessions ?? 0) + 1, max(held?.last ?? session.date, session.date))
            }
        }

        return found
            .map { Series(modifiers: $0.key, sessions: $0.value.sessions, lastTrained: $0.value.last) }
            .sorted { left, right in
                if left.sessions != right.sessions { return left.sessions > right.sessions }
                if left.lastTrained != right.lastTrained { return left.lastTrained > right.lastTrained }
                return !left.modifiers.pauseEnabled && right.modifiers.pauseEnabled
            }
    }

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
