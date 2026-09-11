import Foundation

/// What the trailing "VS <date>" column says for one set row.
///
/// The review's intervention on artboard 04 added this column inside the
/// existing 56pt row: an empty row shows what you did last time, a written
/// row shows the difference, and a row that is heavier *and* complete reads
/// PR at the moment it happens.
public enum SetDelta: Hashable, Sendable {
    /// "47,5 × 8" — the reference set, shown before anything is entered.
    case reference(String)
    /// "+2,5" / "=" / "−1"
    case difference(String)
    case personalRecord
    case failed
    case paused
    case partial
    /// A warm-up row carries no delta and no status dot.
    case none
}

public enum SetRowStatus: String, Sendable {
    case warmup
    case nextUp
    case pending
    case written
}

public struct SetRowPresentation: Hashable, Sendable {
    public let index: Int
    /// "1"…"n" for working sets, "W1"…"Wn" for the warm-up ladder.
    public let indexLabel: String
    public let weightLabel: String
    /// "8", or "—" for the next row up, or "·" while pending.
    public let repsLabel: String
    public let delta: SetDelta
    public let status: SetRowStatus
    public let isWarmup: Bool

    public init(
        index: Int,
        indexLabel: String,
        weightLabel: String,
        repsLabel: String,
        delta: SetDelta,
        status: SetRowStatus,
        isWarmup: Bool
    ) {
        self.index = index
        self.indexLabel = indexLabel
        self.weightLabel = weightLabel
        self.repsLabel = repsLabel
        self.delta = delta
        self.status = status
        self.isWarmup = isWarmup
    }
}

public enum SetRowPresenter {

    /// Builds every row of one exercise's grid.
    ///
    /// - Parameters:
    ///   - sets: the working sets as they currently stand, logged or not.
    ///   - warmups: the ramp, if it is showing (design 30).
    ///   - reference: the comparable session the delta column names.
    ///   - activeIndex: the row that is next up.
    public static func rows(
        sets: [LoggedSet],
        warmups: [LoggedSet] = [],
        reference: ExerciseAppearance?,
        history: ExerciseHistory,
        activeIndex: Int?,
        formatter: NumberDisplay = .dutch
    ) -> [SetRowPresentation] {
        var rows: [SetRowPresentation] = []

        for (offset, warmup) in warmups.enumerated() {
            rows.append(
                SetRowPresentation(
                    index: offset,
                    indexLabel: "W\(offset + 1)",
                    weightLabel: warmup.weightKg.map(formatter.kg) ?? "—",
                    repsLabel: warmup.reps > 0 ? "\(warmup.reps)" : "—",
                    delta: .none,
                    status: .warmup,
                    isWarmup: true
                )
            )
        }

        for (offset, set) in sets.enumerated() {
            let referenceSet = reference?.sets.first { $0.index == set.index }
                ?? reference.flatMap { $0.sets.indices.contains(offset) ? $0.sets[offset] : nil }

            let referenceLabel = referenceSet.flatMap { prior -> String? in
                guard let weight = prior.weightKg else { return nil }
                return formatter.setReference(weightKg: weight, reps: prior.reps)
            }

            let status: SetRowStatus
            if set.isLogged {
                status = .written
            } else if activeIndex == offset {
                status = .nextUp
            } else {
                status = .pending
            }

            let delta: SetDelta
            if set.isLogged {
                if set.flags.contains(.failed) {
                    delta = .failed
                } else if set.modifiers.pauseEnabled {
                    delta = .paused
                } else if (set.partialReps ?? 0) > 0 {
                    delta = .partial
                } else if RecordsEngine.isLoadPR(
                    set: set,
                    history: history,
                    earlierInSession: Array(sets.prefix(offset))
                ) {
                    delta = .personalRecord
                } else if let prior = referenceSet, let priorWeight = prior.weightKg, let weight = set.weightKg {
                    delta = .difference(formatter.signedDelta(weight - priorWeight))
                } else {
                    delta = .none
                }
            } else if let referenceLabel {
                delta = .reference(referenceLabel)
            } else {
                delta = .none
            }

            let repsLabel: String
            switch status {
            case .written: repsLabel = "\(set.reps)"
            case .nextUp: repsLabel = "—"
            case .pending: repsLabel = "·"
            case .warmup: repsLabel = "—"
            }

            rows.append(
                SetRowPresentation(
                    index: offset,
                    indexLabel: "\(offset + 1)",
                    weightLabel: set.weightKg.map(formatter.kg) ?? "— kg",
                    repsLabel: repsLabel,
                    delta: delta,
                    status: status,
                    isWarmup: false
                )
            )
        }

        return rows
    }

    /// The advice line under the set list, which appears only once the last
    /// set of the exercise is written (review, artboard 04 intervention).
    public static func adviceLine(
        sets: [LoggedSet],
        planned: PlannedExercise,
        exercise: Exercise,
        history: ExerciseHistory,
        formatter: NumberDisplay = .dutch
    ) -> String? {
        let working = sets.filter { !$0.isWarmup }
        guard !working.isEmpty, working.allSatisfy(\.isLogged) else { return nil }
        guard history.hasReference else { return nil }

        let targets = planned.repTargets
        let hitAll = zip(working, targets).allSatisfy { $0.0.reps >= $0.1 }
        guard let load = working.first?.weightKg else { return nil }

        if hitAll {
            let step = ProgressionEngine.increment(for: exercise, currentLoad: load, role: planned.role)
            return "Alle reps gehaald. Volgende keer \(formatter.kg(load + step))."
        }
        return "Niet alle reps gehaald. Volgende keer hetzelfde gewicht."
    }
}
