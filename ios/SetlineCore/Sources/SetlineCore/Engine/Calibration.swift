import Foundation

/// The first working set of an exercise Setline has never seen.
///
/// TRAINING_LOGIC §12.3: with no history the app proposes no weight at all.
/// It asks for one, and the rest of the exercise prefills from what the user
/// actually did. Nothing here can become a record or a proposal — the
/// three-session reference gate is still closed, and `hasReference` is what
/// every record and proposal checks.
public struct CalibrationPrompt: Hashable, Sendable {
    /// "No history", or the origin exercise once swapping exists (§12).
    public let contextLabel: String
    public let headline: String
    public let body: String
    public let targetReps: Int
    public let targetRIR: Int

    public init(contextLabel: String, headline: String, body: String, targetReps: Int, targetRIR: Int) {
        self.contextLabel = contextLabel
        self.headline = headline
        self.body = body
        self.targetReps = targetReps
        self.targetRIR = targetRIR
    }
}

public enum Calibration {

    /// A calibration set aims at 8 reps with 2 in reserve — the wording the
    /// artboard uses, and a rep count where RIR is estimated most accurately
    /// (§4: accuracy is better at ≤12 reps).
    public static let targetReps = 8
    public static let targetRIR = 2

    /// Calibration applies only when there is nothing to compare against at
    /// all. One or two sessions is not calibration — it is a reference being
    /// built, and the last session's weight is a perfectly good prefill.
    public static func isNeeded(history: ExerciseHistory) -> Bool {
        history.appearances.isEmpty
    }

    /// - Parameter origin: the exercise this one stands in for, lowercased,
    ///   when it was swapped in.
    public static func prompt(for exercise: Exercise, substitutedFrom origin: String? = nil) -> CalibrationPrompt {
        // The label joins the header's eyebrow ("Gewisseld van squat · geen
        // historiek"), so the card itself opens on the set, as artboard 28
        // draws it.
        let context = "No history"
        let body = origin.map {
            "SETLINE suggests no weight here: \(exercise.name.lowercased()) is a different exercise from \($0). Your sets, reps and RIR are kept."
        } ?? "SETLINE suggests no weight here: there's nothing to compare with yet. Your sets, reps and RIR are kept."
        return CalibrationPrompt(
            contextLabel: context,
            headline: "Pick a weight you can lift for \(targetReps) reps with \(targetRIR) in reserve.",
            body: body,
            targetReps: targetReps,
            targetRIR: targetRIR
        )
    }

    /// What the remaining sets are prefilled with once set 1 is in.
    ///
    /// §12.3's cheap extra: if the calibration set was clearly easy — RIR 3
    /// or more — the next set may start one increment higher. That is a
    /// step *within the same exercise*, which is legitimate; converting load
    /// between exercises never is.
    public static func prefill(
        after calibrationSet: LoggedSet,
        exercise: Exercise
    ) -> (weightKg: Decimal, steppedUp: Bool) {
        let logged = calibrationSet.weightKg ?? 0
        guard let rir = calibrationSet.rirReported, rir >= 3, logged > 0 else {
            return (logged, false)
        }
        return (logged + exercise.incrementKg, true)
    }

    /// "Gekalibreerd op 80 kg × 8 · RIR 2"
    public static func summary(
        for set: LoggedSet,
        formatter: NumberDisplay = .english
    ) -> String? {
        guard let weight = set.weightKg, set.reps > 0 else { return nil }
        var text = "\(formatter.kg(weight)) × \(set.reps)"
        if let rir = set.rirReported { text += " · RIR \(rir)" }
        return text
    }
}
