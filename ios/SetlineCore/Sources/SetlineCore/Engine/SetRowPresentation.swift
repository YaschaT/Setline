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
    /// A set performed with a pause. The word carries the meaning; amber
    /// alone never does.
    case paused
    /// Partial reps at the end of a set, with their count, so "partieel" and
    /// "met pauze" are never told apart by colour alone.
    case partial(count: Int)
    /// Both at once. Neither state is allowed to hide the other.
    case pausedAndPartial(count: Int)
    /// The calibration set itself, before it is written.
    case calibration
    /// The calibration set once written: everything else compares to it.
    case baseline
    /// A set added during this session, where the column would otherwise
    /// be empty.
    case added
    /// "RIR 1" — the reserve the lifter reported, shown where a comparison
    /// would otherwise sit (addendum 12R). A record or a description of what
    /// the set was still outranks it.
    case reserve(Int)
    /// A warm-up row carries no delta and no status dot.
    case none

    /// Whether this says what the set *was*, rather than how it compares.
    /// Those descriptions outrank any comparison — losing one would hide the
    /// very thing that keeps the set out of progression.
    public var describesTheSet: Bool {
        switch self {
        case .failed, .paused, .partial, .pausedAndPartial: return true
        case .reference, .difference, .personalRecord, .calibration, .baseline, .added, .reserve, .none: return false
        }
    }
}

/// What the grid's trailing column is comparing against.
public enum SetGridMode: Hashable, Sendable {
    /// The usual case: compare each set with the same set last session.
    case history
    /// No history at all and set 1 not yet written (artboard 28).
    case calibrationPending
    /// Set 1 is in; the rest of the exercise compares to it (artboard 28b).
    case calibrated(baseline: LoggedSet)

    public var isCalibration: Bool {
        if case .history = self { return false }
        return true
    }
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
    /// A working set added during this session rather than prescribed.
    public let isAdded: Bool

    public init(
        index: Int,
        indexLabel: String,
        weightLabel: String,
        repsLabel: String,
        delta: SetDelta,
        status: SetRowStatus,
        isWarmup: Bool,
        isAdded: Bool = false
    ) {
        self.index = index
        self.indexLabel = indexLabel
        self.weightLabel = weightLabel
        self.repsLabel = repsLabel
        self.delta = delta
        self.status = status
        self.isWarmup = isWarmup
        self.isAdded = isAdded
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
    ///   - mode: what the trailing column compares against.
    public static func rows(
        sets: [LoggedSet],
        warmups: [LoggedSet] = [],
        reference: ExerciseAppearance?,
        history: ExerciseHistory,
        activeIndex: Int?,
        mode: SetGridMode = .history,
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
                let partialCount = (set.partialReps ?? 0) > 0 ? set.partialReps : nil
                if set.flags.contains(.failed) {
                    delta = .failed
                } else if set.modifiers.pauseEnabled, let partial = partialCount {
                    // Both descriptions are true, so both are shown.
                    delta = .pausedAndPartial(count: partial)
                } else if set.modifiers.pauseEnabled {
                    delta = .paused
                } else if let partial = partialCount {
                    delta = .partial(count: partial)
                } else if RecordsEngine.isLoadPR(
                    set: set,
                    history: history,
                    earlierInSession: Array(sets.prefix(offset))
                ) {
                    delta = .personalRecord
                } else if let reserve = set.rirReported {
                    delta = .reserve(reserve)
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

            var weightLabel = set.weightKg.map(formatter.kg) ?? "— kg"
            var resolvedDelta = delta

            switch mode {
            case .history:
                break
            case .calibrationPending:
                // Artboard 28: set 1 asks for a weight, the rest wait for it.
                if offset == 0 {
                    if !set.isLogged { resolvedDelta = .calibration }
                } else if !set.isLogged {
                    weightLabel = "volgt uit set 1"
                    resolvedDelta = .none
                }
            case .calibrated(let baseline):
                // Artboard 28b: everything compares to the calibration set —
                // but a comparison never replaces what the set actually was.
                // A paused, partial or failed set keeps saying so.
                if !delta.describesTheSet {
                    if offset == 0 {
                        resolvedDelta = .baseline
                    } else if let weight = baseline.weightKg {
                        resolvedDelta = set.isLogged
                            ? .difference(formatter.signedDelta((set.weightKg ?? 0) - weight))
                            : .reference(formatter.setReference(weightKg: weight, reps: baseline.reps))
                    }
                }
            }

            // A row added during this session says so, in the column's own
            // quiet type, wherever the column would otherwise be empty.
            if set.origin == .sessionAdded, resolvedDelta == .none {
                resolvedDelta = .added
            }

            rows.append(
                SetRowPresentation(
                    index: offset,
                    indexLabel: "\(offset + 1)",
                    weightLabel: weightLabel,
                    repsLabel: repsLabel,
                    delta: resolvedDelta,
                    status: status,
                    isWarmup: false,
                    isAdded: set.origin == .sessionAdded
                )
            )
        }

        return rows
    }

    /// The ramp's rows, for the section above the working-set grid.
    public static func warmupRows(
        _ warmups: [WarmupSet],
        formatter: NumberDisplay = .dutch
    ) -> [SetRowPresentation] {
        warmups.enumerated().map { offset, warmup in
            SetRowPresentation(
                index: offset,
                indexLabel: "W\(offset + 1)",
                weightLabel: formatter.kg(warmup.weightKg),
                repsLabel: "\(warmup.reps)",
                delta: .none,
                status: .warmup,
                isWarmup: true
            )
        }
    }

    /// The advice line under the set list, which appears only once the last
    /// set of the exercise is written (review, artboard 04 intervention).
    public static func adviceLine(
        sets: [LoggedSet],
        planned: PlannedExercise,
        exercise: Exercise,
        history: ExerciseHistory,
        proposedTargets: [Int]? = nil,
        formatter: NumberDisplay = .dutch
    ) -> String? {
        // Judged on the prescribed sets only. A set added during the session
        // neither holds the advice back until it is logged, nor changes it.
        let working = sets.filter { !$0.isWarmup && $0.origin == .prescribed }
        guard !working.isEmpty, working.allSatisfy(\.isLogged) else { return nil }
        guard history.hasReference else { return nil }

        let tops = planned.repTargets
        func slot(_ number: Int) -> LoggedSet? { working.first { $0.index == number } }
        let hitTop = tops.indices.allSatisfy { (slot($0)?.reps ?? 0) >= tops[$0] }
        guard let load = working.first?.weightKg else { return nil }

        if hitTop {
            let step = ProgressionEngine.increment(for: exercise, currentLoad: load, role: planned.role)
            return "Alle reps gehaald. Volgende keer \(formatter.kg(load + step))."
        }
        // Doing what SETLINE proposed is never a miss. After a load increase
        // the proposal aims at the bottom of each range, and reaching it is
        // exactly the plan: same weight next time, working toward the top.
        if let proposed = proposedTargets, proposed.count >= tops.count,
           tops.indices.allSatisfy({ (slot($0)?.reps ?? 0) >= proposed[$0] }) {
            return "Op doel. Volgende keer \(formatter.kg(load)), mik op \(ProgressionEngine.repsLabel(tops))."
        }
        return "Niet alle reps gehaald. Volgende keer hetzelfde gewicht."
    }
}
