import Foundation

/// The four tones of the progression proposal (design 29b).
///
/// One component, four tones. Only the label colour and border strength
/// change — the card keeps the same size, radius and place above set 1.
public enum ProposalTone: String, Sendable {
    case ready
    case close
    case neutral
    case noReference
}

/// A proposal, never an application.
///
/// "Geen van de vier past iets toe — het voorstel staat voorgevuld in de
/// setrij en is daar te wijzigen, en elke kaart heeft Sluiten."
public struct ProgressionProposal: Hashable, Sendable {
    public let tone: ProposalTone
    /// Absent only for `.noReference`.
    public let weightKg: Decimal?
    /// The first row's target, for places that show one number.
    public let targetReps: Int?
    /// One target per planned set, each from that set's own range. A
    /// `1×5–6 + 2×6–8` prescription must never hand set 1's target to sets 2
    /// and 3 — following the pre-fill would then log them below their range.
    public let setTargets: [Int]?
    /// Eyebrow label. The design shows one only on the READY tone.
    public let label: String?
    public let headline: String
    public let body: String

    public init(
        tone: ProposalTone,
        weightKg: Decimal?,
        targetReps: Int?,
        label: String?,
        headline: String,
        body: String,
        setTargets: [Int]? = nil
    ) {
        self.tone = tone
        self.weightKg = weightKg
        self.targetReps = targetReps
        self.setTargets = setTargets
        self.label = label
        self.headline = headline
        self.body = body
    }
}

public enum ProgressionEngine {

    /// Does this appearance qualify as a confirming session? (§3.1)
    ///
    /// Every working set reached the top of its range, at the same load, and
    /// — when RIR was logged — the median RIR is inside the target.
    public static func qualifies(
        _ appearance: ExerciseAppearance,
        planned: PlannedExercise
    ) -> Bool {
        let sets = appearance.sets.filter(\.countsTowardProgression)
        let targets = planned.repTargets
        guard !sets.isEmpty, sets.count >= targets.count else { return false }

        for (index, target) in targets.enumerated() {
            guard index < sets.count else { return false }
            let set = sets[index]
            if set.flags.contains(.failed) { return false }
            if set.reps < target { return false }
        }

        let loads = Set(sets.prefix(targets.count).map { $0.weightKg ?? 0 })
        guard loads.count == 1 else { return false }

        let logged = sets.prefix(targets.count).compactMap(\.rirReported)
        if !logged.isEmpty {
            let sorted = logged.sorted()
            let median = sorted[sorted.count / 2]
            let ceiling = planned.sets.map(\.targetRIR.upperBound).max() ?? 2
            if median > ceiling { return false }
        }
        return true
    }

    /// How many consecutive most-recent sessions qualify at the same load.
    static func confirmingStreak(
        history: ExerciseHistory,
        planned: PlannedExercise
    ) -> (streak: Int, load: Decimal?) {
        guard let latest = history.mostRecent,
              let load = latest.sets.first(where: \.countsTowardProgression)?.weightKg
        else { return (0, nil) }

        var streak = 0
        for appearance in history.appearances {
            let loads = Set(appearance.sets.filter(\.countsTowardProgression).map { $0.weightKg ?? 0 })
            guard loads == [load], qualifies(appearance, planned: planned) else { break }
            streak += 1
        }
        return (streak, load)
    }

    /// Sessions of confirmation needed before the load moves.
    ///
    /// Two by default (§3.1) — the part most apps get wrong, and the reason
    /// a single good day does not move the bar. One for a low-rep primary
    /// strength lift (§3.2 LOAD_STEP), where there is less rep headroom to
    /// absorb a fluke and the step is proportionally small.
    public static func requiredConfirmations(for planned: PlannedExercise) -> Int {
        let lowRep = (planned.sets.map(\.repRange.upperBound).max() ?? 99) <= 6
        return planned.role == .primaryStrength && lowRep ? 1 : 2
    }

    /// §3.2: the smaller of the equipment increment and 2.5% of the current
    /// load, rounded onto a real plate or pin step.
    public static func increment(for exercise: Exercise, currentLoad: Decimal, role: ExerciseRole) -> Decimal {
        let base = exercise.incrementKg
        guard role == .primaryStrength else { return base }
        let proportional = currentLoad * 0.025
        let chosen = min(base, proportional)
        let rounded = Estimates.round(chosen, toIncrement: base)
        return max(rounded, base)
    }

    /// The proposal shown above set 1 (design 29 / 29b).
    public static func proposal(
        planned: PlannedExercise,
        exercise: Exercise,
        history: ExerciseHistory,
        formatter: NumberDisplay = .dutch
    ) -> ProgressionProposal {
        guard history.hasReference else {
            return ProgressionProposal(
                tone: .noReference,
                weightKg: nil,
                targetReps: nil,
                label: nil,
                headline: "Referentie opbouwen · sessie \(history.referenceSessionNumber) van \(ExerciseHistory.sessionsBeforeReference)",
                body: "Na drie vergelijkbare sessies kan SETLINE betrouwbare progressievoorstellen en records tonen."
            )
        }

        let lows = planned.sets.map(\.repRange.lowerBound)
        let tops = planned.sets.map(\.repRange.upperBound)

        let (streak, load) = confirmingStreak(history: history, planned: planned)
        guard let load else {
            return ProgressionProposal(
                tone: .neutral,
                weightKg: nil,
                targetReps: lows.first,
                label: nil,
                headline: "Bouw verder",
                body: "Voorstel: geen. Nog geen reden om te verhogen of te verlagen.",
                setTargets: lows
            )
        }

        let needed = requiredConfirmations(for: planned)
        let lowTarget = lows.first ?? 6
        let topTarget = tops.first ?? lowTarget
        let rirCeiling = planned.sets.first?.targetRIR.upperBound ?? 2

        if streak >= needed {
            let step = increment(for: exercise, currentLoad: load, role: planned.role)
            let next = load + step
            return ProgressionProposal(
                tone: .ready,
                weightKg: next,
                targetReps: lowTarget,
                label: "BOVENGRENS BEVESTIGD",
                headline: "Klaar om te verhogen vanaf \(formatter.kg(load))",
                body: "Voorstel: \(formatter.kg(next)), mik op \(repsLabel(lows)). \(confirmationSentence(streak: streak, load: load, rirCeiling: rirCeiling, formatter: formatter))",
                setTargets: lows
            )
        }

        if streak == needed - 1 && streak > 0 {
            return ProgressionProposal(
                tone: .close,
                weightKg: load,
                targetReps: topTarget,
                label: nil,
                headline: "Nog 1 bevestiging op \(formatter.kg(load))",
                body: "Voorstel: \(formatter.kg(load)), mik op \(repsLabel(tops)). Haal je dat opnieuw, dan gaat het gewicht omhoog.",
                setTargets: tops
            )
        }

        return ProgressionProposal(
            tone: .neutral,
            weightKg: load,
            targetReps: topTarget,
            label: nil,
            headline: "Bouw verder op \(formatter.kg(load))",
            body: "Voorstel: \(formatter.kg(load)), mik op \(repsLabel(tops)). Nog geen reden om te verhogen of te verlagen.",
            setTargets: tops
        )
    }

    /// "6" when every set aims at the same number, "5 · 6 · 6" when they
    /// differ — a prescription that varies by set is read out as it varies.
    public static func repsLabel(_ targets: [Int]) -> String {
        guard let first = targets.first else { return "—" }
        return Set(targets).count == 1 ? "\(first)" : targets.map(String.init).joined(separator: " · ")
    }

    private static func confirmationSentence(
        streak: Int,
        load: Decimal,
        rirCeiling: Int,
        formatter: NumberDisplay
    ) -> String {
        let sessions = streak == 1 ? "Eén sessie" : "Twee sessies"
        return "\(sessions) op \(formatter.kg(load)) met RIR \(rirCeiling) of lager."
    }
}
