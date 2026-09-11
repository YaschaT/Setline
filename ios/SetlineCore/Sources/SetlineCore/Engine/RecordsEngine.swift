import Foundation

/// The four record types, ranked (TRAINING_LOGIC §10.1, design 17R).
public enum RecordType: Int, Comparable, Sendable {
    case sessionBest = 0
    case estimatedStrength = 1
    case rep = 2
    case load = 3

    public static func < (lhs: RecordType, rhs: RecordType) -> Bool { lhs.rawValue < rhs.rawValue }
}

public struct ExerciseRecord: Hashable, Sendable {
    public let type: RecordType
    public let headline: String
    public let detail: String

    public init(type: RecordType, headline: String, detail: String) {
        self.type = type
        self.headline = headline
        self.detail = detail
    }
}

public enum RecordsEngine {

    /// One record per exercise per session, highest-ranked type only.
    ///
    /// Guards, all required (§10.2): comparability, a 3-session baseline
    /// before any banner, an explicit 0.5 kg epsilon, no e1RM above 10 reps,
    /// and never a record on a warm-up or a technical-breakdown set.
    public static func record(
        for sets: [LoggedSet],
        history: ExerciseHistory,
        formatter: NumberDisplay = .dutch
    ) -> ExerciseRecord? {
        let current = sets.filter(\.countsTowardProgression)
        guard !current.isEmpty else { return nil }

        guard history.hasReference else {
            return ExerciseRecord(
                type: .sessionBest,
                headline: "Referentie opbouwen · sessie \(history.referenceSessionNumber) van \(ExerciseHistory.sessionsBeforeReference)",
                detail: "Nog geen record mogelijk voor deze oefening"
            )
        }

        let epsilon = Estimates.epsilonKg
        let priorSets = history.appearances.flatMap(\.sets)

        // --- Load PR: heaviest load moved for at least one clean rep.
        if let heaviestNow = current.compactMap(\.weightKg).max() {
            let heaviestBefore = priorSets.compactMap(\.weightKg).max() ?? 0
            if heaviestNow > heaviestBefore + epsilon,
               let set = current.first(where: { ($0.weightKg ?? 0) == heaviestNow }) {
                let previousBest = bestSet(at: heaviestBefore, in: priorSets)
                return ExerciseRecord(
                    type: .load,
                    headline: "Zwaarste ooit · \(formatter.kg(heaviestNow)) × \(set.reps)",
                    detail: previousBest.map { prior in
                        "Vorige beste \(formatter.setReference(weightKg: prior.weightKg ?? 0, reps: prior.reps))"
                    } ?? "Eerste keer op dit gewicht"
                )
            }
        }

        // --- Rep PR: most reps at a load already used before.
        if let repPR = repRecord(current: current, prior: priorSets, epsilon: epsilon, formatter: formatter) {
            return repPR
        }

        // --- Estimated strength PR. Always carries the word "geschat", and
        // names its source, so nobody believes the app watched them lift it.
        if let bestNow = current.compactMap({ set in
            Estimates.e1RM(weightKg: set.weightKg ?? 0, reps: set.reps).map { (value: $0, set: set) }
        }).max(by: { $0.value < $1.value }) {
            let bestBefore = priorSets.compactMap { Estimates.e1RM(weightKg: $0.weightKg ?? 0, reps: $0.reps) }.max() ?? 0
            if bestNow.value > bestBefore + epsilon {
                return ExerciseRecord(
                    type: .estimatedStrength,
                    headline: "Geschatte kracht · \(formatter.kg(Estimates.round(bestNow.value, toIncrement: 0.5)))",
                    detail: "Geschat uit \(bestNow.set.reps) reps op \(formatter.kg(bestNow.set.weightKg ?? 0)). Niet gemeten."
                )
            }
        }

        // --- Session best: better than last time, not an all-time record.
        if let previous = history.mostRecent {
            let now = volumeLoad(current)
            let before = volumeLoad(previous.sets)
            if now > before {
                return ExerciseRecord(
                    type: .sessionBest,
                    headline: "Sterker dan vorige sessie",
                    detail: "Meer totaal volume bij gelijke RIR"
                )
            }
        }

        return nil
    }

    private static func repRecord(
        current: [LoggedSet],
        prior: [LoggedSet],
        epsilon: Decimal,
        formatter: NumberDisplay
    ) -> ExerciseRecord? {
        var best: (load: Decimal, reps: Int, previous: Int)?
        for set in current {
            guard let load = set.weightKg else { continue }
            let matching = prior.filter { abs(($0.weightKg ?? 0) - load) <= epsilon }
            guard let priorBest = matching.map(\.reps).max(), set.reps > priorBest else { continue }
            if best == nil || set.reps - priorBest > best!.reps - best!.previous {
                best = (load, set.reps, priorBest)
            }
        }
        guard let best else { return nil }
        return ExerciseRecord(
            type: .rep,
            headline: "\(formatter.signedReps(best.reps - best.previous)) op \(formatter.kg(best.load))",
            detail: "\(best.reps) reps, vorige keer \(best.previous)"
        )
    }

    private static func bestSet(at load: Decimal, in sets: [LoggedSet]) -> LoggedSet? {
        sets.filter { abs(($0.weightKg ?? 0) - load) <= Estimates.epsilonKg }
            .max { $0.reps < $1.reps }
    }

    /// Σ load × reps over the working sets.
    ///
    /// Volume is the wider net: paused and partial sets count here even
    /// though they stay out of progression (addendum 16R). Warm-ups never do.
    public static func volumeLoad(_ sets: [LoggedSet]) -> Decimal {
        sets.filter(\.countsTowardVolume)
            .reduce(Decimal(0)) { $0 + ($1.weightKg ?? 0) * Decimal($1.reps) }
    }

    /// Whether this specific set, at the moment it is written, is a load PR.
    ///
    /// The review's intervention on artboard 04: "PR op het moment zelf" —
    /// the row reads PR as it happens, not a session later in the summary.
    public static func isLoadPR(
        set: LoggedSet,
        history: ExerciseHistory,
        earlierInSession: [LoggedSet]
    ) -> Bool {
        guard history.hasReference, set.countsTowardProgression, let load = set.weightKg else { return false }
        let priorBest = history.appearances.flatMap(\.sets).compactMap(\.weightKg).max() ?? 0
        let sessionBest = earlierInSession.compactMap(\.weightKg).max() ?? 0
        return load > max(priorBest, sessionBest) + Estimates.epsilonKg
    }
}
