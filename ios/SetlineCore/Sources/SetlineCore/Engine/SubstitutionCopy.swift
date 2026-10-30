import Foundation

/// The words the swap sheet puts next to an alternative.
///
/// Two rules govern all of it. Curated copy wins wherever it exists — a line
/// someone wrote about this specific pair beats anything generated. And the
/// strongest label is gated: `Sterke match` is a claim, so it has to be
/// earned on both the score and the muscle overlap, not on the score alone.
public enum SubstitutionCopy {

    /// Score and overlap a result must both clear before the app will call it
    /// a strong match.
    static let strongScore = 0.75
    static let strongOverlap = 0.80

    /// How close a result is, as the meter beside it shows: 3 a strong match,
    /// 2 a good one, 1 everything that changes the movement or the setup.
    public static func strength(_ alternative: RankedAlternative) -> Int {
        if alternative.match == .broader || alternative.match == .related { return 1 }
        if alternative.score >= strongScore && alternative.muscleOverlap >= strongOverlap { return 3 }
        if alternative.muscleOverlap >= 0.65 { return 2 }
        return 1
    }

    /// "Dumbbells", for the line under a result's name.
    public static func equipmentLabel(_ equipment: Equipment) -> String {
        switch equipment {
        case .barbell: "Barbell"
        case .dumbbell: "Dumbbells"
        case .machinePlate: "Plate machine"
        case .machineSelectorised: "Machine"
        case .cable: "Cable"
        case .smith: "Smith machine"
        case .bodyweight: "Bodyweight"
        case .band: "Band"
        }
    }

    public static func fit(_ alternative: RankedAlternative) -> String {
        if let curated = alternative.curatedFit { return curated }
        if alternative.match == .broader { return "Different setup" }
        if alternative.match == .related { return "Different movement" }
        if alternative.score >= strongScore && alternative.muscleOverlap >= strongOverlap {
            return "Strong match"
        }
        if alternative.muscleOverlap >= 0.65 { return "Good match" }
        return "Partly similar"
    }

    /// One line of honest reasoning. Generated from what actually carried the
    /// result, so it can never claim more than the ranking found.
    public static func why(
        _ alternative: RankedAlternative,
        origin: Exercise,
        alongside others: [RankedAlternative] = []
    ) -> String {
        if let curated = alternative.curatedWhy { return curated }

        let exercise = alternative.exercise
        var reasons: [String] = []

        if alternative.match == .broader {
            reasons.append("Trains the same muscle, but as \(exercise.isCompound ? "a compound" : "a different") exercise")
        } else if alternative.match == .related {
            reasons.append("Different movement from \(origin.name.lowercased()), same muscle group")
        } else if alternative.muscleOverlap >= strongOverlap {
            reasons.append("Trains the same muscles in the same movement")
        } else {
            reasons.append("Same movement, slightly different emphasis")
        }

        var namedADifference = false
        for driver in alternative.drivers.prefix(2) {
            switch driver {
            case .easierToStabilise:
                reasons.append("needs less stability")
                namedADifference = true
            case .quickerToSetUp:
                reasons.append("quicker to set up")
                namedADifference = true
            case .differentEquipment:
                reasons.append("different equipment")
                namedADifference = true
            case .differentStation:
                reasons.append("different machine")
                namedADifference = true
            case .alreadyFamiliar:
                reasons.append("you've done this one before")
                namedADifference = true
            case .sameMuscles, .samePattern, .sameJointActions,
                 .sameResistanceProfile, .fitsRole:
                continue
            }
        }

        // Three equally strong alternatives otherwise read identically, which
        // tells the user nothing about how to choose between them. Say the
        // thing that actually tells them apart — and if the obvious one
        // (the apparatus) is shared, keep going until something isn't.
        if !namedADifference, let phrase = discriminator(alternative, alongside: others) {
            reasons.append(phrase)
        }
        return reasons.joined(separator: " · ") + "."
    }

    /// The first fact about this alternative that none of the others shares.
    ///
    /// Ordered by what a person in a gym actually decides on: what it is
    /// loaded with, where in the range it is hardest, whether it is one side
    /// at a time, and how much there is to set up.
    private static func discriminator(
        _ alternative: RankedAlternative, alongside others: [RankedAlternative]
    ) -> String? {
        let peers = others.filter { $0.exercise.id != alternative.exercise.id }
        let candidates: [(RankedAlternative) -> String?] = [
            { equipmentPhrase($0.exercise.equipment) },
            { $0.exercise.attributes.map { profilePhrase($0.resistanceProfile) } },
            { $0.exercise.unilateral ? "per side" : nil },
            { $0.exercise.attributes.map { setupPhrase($0.heuristics.setupCost) } },
        ]
        for candidate in candidates {
            guard let mine = candidate(alternative) else { continue }
            if peers.allSatisfy({ candidate($0) != mine }) { return mine }
        }
        // Nothing in the model actually tells these apart — a seated and a
        // standing calf raise differ by knee angle, which we do not record.
        // Saying nothing is right: the two names above the lines are the
        // difference, and an identical suffix on both would imply one that
        // the app cannot see.
        return nil
    }

    private static func profilePhrase(_ profile: ResistanceProfile) -> String {
        switch profile {
        case .lengthenedBias: return "hardest in the stretch"
        case .shortenedBias: return "hardest in the squeeze"
        case .flatCable: return "even resistance"
        case .midRangeBias: return "hardest mid-range"
        }
    }

    private static func setupPhrase(_ cost: Int) -> String {
        switch cost {
        case ...1: return "ready right away"
        case 2: return "quick setup"
        default: return "load plates"
        }
    }

    private static func equipmentPhrase(_ equipment: Equipment) -> String {
        switch equipment {
        case .barbell: return "with a barbell"
        case .dumbbell: return "with dumbbells"
        case .machinePlate: return "on a plate-loaded machine"
        case .machineSelectorised: return "on a pin-loaded machine"
        case .cable: return "on the cable"
        case .smith: return "in the Smith machine"
        case .bodyweight: return "with your bodyweight"
        case .band: return "with a band"
        }
    }

    /// The line that appears under every alternative, without exception. It
    /// is the promise the swap makes: the prescription survives, the load
    /// does not carry over (§12.3 — no conversion, in either direction).
    public static let carryOver = "Sets, reps and RIR stay · weight resets"
}
