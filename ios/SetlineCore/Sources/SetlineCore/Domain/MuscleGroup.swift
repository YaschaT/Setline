import Foundation

/// The six groups a reader picks an exercise from (40b).
///
/// The engine thinks in nineteen muscles, because progression and
/// substitution need that resolution. A person looking for an exercise does
/// not: they think "borst" or "benen". This is the one place those nineteen
/// are folded into six, for choosing and for naming — nothing ranks, balances
/// or substitutes by it.
public enum MuscleGroup: String, CaseIterable, Identifiable, Sendable {
    case borst, rug, schouders, armen, benen, core

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .borst: return "Borst"
        case .rug: return "Rug"
        case .schouders: return "Schouders"
        case .armen: return "Armen"
        case .benen: return "Benen"
        case .core: return "Core"
        }
    }

    /// Which of the six a muscle belongs to. Every muscle belongs to exactly
    /// one, so no exercise can fall out of the picker.
    public static func of(_ muscle: Muscle) -> MuscleGroup {
        switch muscle {
        case .chestUpper, .chestMid: return .borst
        case .lat, .upperBack, .lowerBack, .trap: return .rug
        case .frontDelt, .sideDelt, .rearDelt: return .schouders
        case .triceps, .biceps, .forearm: return .armen
        case .glute, .hamstring, .quad, .adductor, .calf: return .benen
        case .abs, .obliques: return .core
        }
    }
}

public extension Exercise {
    /// The group this exercise is filed under: the group of the muscle it
    /// loads most. An exercise the catalogue has not authored attributes for
    /// has no group, and the picker does not offer it.
    var group: MuscleGroup? {
        guard let heaviest = attributes?.primaryMuscles.max(by: { $0.weight < $1.weight }) else { return nil }
        return MuscleGroup.of(heaviest.muscle)
    }
}
