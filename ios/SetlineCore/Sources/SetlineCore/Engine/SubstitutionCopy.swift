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

    public static func fit(_ alternative: RankedAlternative) -> String {
        if let curated = alternative.curatedFit { return curated }
        if alternative.match == .broader { return "Andere opzet" }
        if alternative.match == .related { return "Andere beweging" }
        if alternative.score >= strongScore && alternative.muscleOverlap >= strongOverlap {
            return "Sterke match"
        }
        if alternative.muscleOverlap >= 0.65 { return "Goede match" }
        return "Deels vergelijkbaar"
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
            reasons.append("Traint dezelfde spier, maar als \(exercise.isCompound ? "samengestelde" : "andere") oefening")
        } else if alternative.match == .related {
            reasons.append("Andere beweging dan \(origin.name.lowercased()), zelfde spiergroep")
        } else if alternative.muscleOverlap >= strongOverlap {
            reasons.append("Traint dezelfde spieren in dezelfde beweging")
        } else {
            reasons.append("Zelfde beweging, iets andere nadruk")
        }

        var namedADifference = false
        for driver in alternative.drivers.prefix(2) {
            switch driver {
            case .easierToStabilise:
                reasons.append("minder stabiliteit nodig")
                namedADifference = true
            case .quickerToSetUp:
                reasons.append("sneller klaar te zetten")
                namedADifference = true
            case .differentEquipment:
                reasons.append("ander materiaal")
                namedADifference = true
            case .differentStation:
                reasons.append("ander toestel")
                namedADifference = true
            case .alreadyFamiliar:
                reasons.append("je deed deze al eerder")
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
            { $0.exercise.unilateral ? "per kant" : nil },
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
        case .lengthenedBias: return "zwaarst in de rek"
        case .shortenedBias: return "zwaarst in de samentrekking"
        case .flatCable: return "gelijkmatige weerstand"
        case .midRangeBias: return "zwaarst in het midden"
        }
    }

    private static func setupPhrase(_ cost: Int) -> String {
        switch cost {
        case ...1: return "meteen klaar"
        case 2: return "even klaarzetten"
        default: return "schijven laden"
        }
    }

    private static func equipmentPhrase(_ equipment: Equipment) -> String {
        switch equipment {
        case .barbell: return "met een barbell"
        case .dumbbell: return "met dumbbells"
        case .machinePlate: return "op een machine met schijven"
        case .machineSelectorised: return "op een machine met pin"
        case .cable: return "aan de kabel"
        case .smith: return "in de smith"
        case .bodyweight: return "met je lichaamsgewicht"
        case .band: return "met een band"
        }
    }

    /// The line that appears under every alternative, without exception. It
    /// is the promise the swap makes: the prescription survives, the load
    /// does not carry over (§12.3 — no conversion, in either direction).
    public static let carryOver = "Sets, reps en RIR blijven · gewicht reset"
}
