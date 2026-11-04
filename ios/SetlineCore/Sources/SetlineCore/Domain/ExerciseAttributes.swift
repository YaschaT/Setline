import Foundation

// MARK: - Relatively objective: what the exercise physically is

public enum Muscle: String, Codable, Sendable, CaseIterable {
    case chestUpper, chestMid, frontDelt, sideDelt, rearDelt, triceps, biceps, forearm
    case lat, upperBack, lowerBack, trap
    case glute, hamstring, quad, adductor, calf, abs, obliques
}

public extension Muscle {
    /// How much work done by one muscle counts as work done by another.
    ///
    /// Judgement, not anatomy: it exists because the enum splits the chest
    /// into upper and mid, so without it an incline press and a flat press
    /// look like unrelated exercises to the ranking. Symmetric, 0…1, and
    /// 1 with itself.
    static let kinship: [Set<Muscle>: Double] = [
        [.chestUpper, .chestMid]: 0.6,
        [.chestUpper, .frontDelt]: 0.4,
        [.frontDelt, .sideDelt]: 0.35,
        [.sideDelt, .rearDelt]: 0.3,
        [.rearDelt, .upperBack]: 0.45,
        [.lat, .upperBack]: 0.5,
        [.upperBack, .trap]: 0.6,
        [.biceps, .forearm]: 0.4,
        [.glute, .hamstring]: 0.45,
        [.glute, .quad]: 0.3,
        [.glute, .lowerBack]: 0.3,
        [.hamstring, .lowerBack]: 0.35,
        [.quad, .adductor]: 0.4,
        [.abs, .obliques]: 0.6,
    ]

    /// `kinship` flattened into a lookup, because the ranking asks this
    /// question tens of thousands of times.
    static let kinTable: [Muscle: [Muscle: Double]] = {
        var table: [Muscle: [Muscle: Double]] = [:]
        for muscle in Muscle.allCases { table[muscle] = [muscle: 1] }
        for (pair, weight) in kinship {
            let members = Array(pair)
            guard members.count == 2 else { continue }
            table[members[0]]?[members[1]] = weight
            table[members[1]]?[members[0]] = weight
        }
        return table
    }()

    /// Non-zero neighbours only, including self.
    var kin: [Muscle: Double] { Muscle.kinTable[self] ?? [self: 1] }
}

public struct MuscleContribution: Codable, Hashable, Sendable {
    public let muscle: Muscle
    /// 0…1. Primary contributions sum to roughly 1 per exercise.
    public let weight: Double

    public init(_ muscle: Muscle, _ weight: Double) {
        self.muscle = muscle
        self.weight = weight
    }
}

public enum JointAction: String, Codable, Sendable, CaseIterable {
    case shoulderHorizontalAdduction, shoulderHorizontalAbduction, shoulderFlexion
    case shoulderAbduction, shoulderExtension, scapularRetraction
    case elbowFlexion, elbowExtension
    case hipExtension, hipFlexion, kneeExtension, kneeFlexion
    case anklePlantarflexion, spinalFlexion
    case hipAbduction, hipAdduction, scapularElevation, spinalRotation
}

public enum MovementPattern: String, Codable, Sendable, CaseIterable {
    case horizontalPress, verticalPress, horizontalPull, verticalPull
    case squat, hinge, lunge
    case isolationFlexion, isolationExtension, isolationAbduction
}

public extension MovementPattern {
    /// Single-joint patterns. An isolation exercise's substitute has to be
    /// another isolation exercise: a compound that happens to train the same
    /// muscle is a different training intent, not a swap.
    var isIsolation: Bool {
        switch self {
        case .isolationFlexion, .isolationExtension, .isolationAbduction: return true
        case .horizontalPress, .verticalPress, .horizontalPull, .verticalPull,
             .squat, .hinge, .lunge: return false
        }
    }

    /// Patterns that are near neighbours. Crossing a family is not a
    /// substitution; crossing a pattern inside one is a broader alternative.
    var family: MovementFamily {
        switch self {
        case .horizontalPress, .verticalPress: return .press
        case .horizontalPull, .verticalPull: return .pull
        case .squat, .lunge: return .legPush
        case .hinge: return .legHinge
        case .isolationFlexion, .isolationExtension, .isolationAbduction: return .isolation
        }
    }
}

public enum MovementFamily: String, Sendable {
    case press, pull, legPush, legHinge, isolation
}

public enum ResistanceProfile: String, Codable, Sendable, CaseIterable {
    case lengthenedBias, midRangeBias, shortenedBias, flatCable
}

/// Positions and loads a discomfort flag can exclude (§14.2, §12.2).
public enum LoadTag: String, Codable, Sendable, CaseIterable {
    case axialSpinalLoad, overheadPosition, deepKneeFlexion, endRangeShoulder
    case wristExtension, gripLimited, elbowCompression, lumbarFlexion
}

/// A single physical apparatus, where two exercises genuinely contend for it.
///
/// Deliberately sparse. It exists so that "the bench is taken" can rule out
/// the paused bench on the same rack — not so that one busy selectorised
/// machine can rule out every selectorised machine in the gym. Cable
/// stations and free weights carry no station at all, because a gym has
/// several of each; they are handled by the equipment-overlap nudge in the
/// ranking instead.
public enum Station: String, Codable, Sendable, CaseIterable {
    case flatBenchRack, inclineBenchRack, smithRack, pullUpBar, dipStation
    case latPulldown, chestSupportedRow, tBarRow, assistedPullUp
    case chestPressMachine, inclineChestPress, shoulderPressMachine, pecDeck
    case lateralRaiseMachine, abCrunchMachine
    case hackSquat, legPress, seatedLegCurl, lyingLegCurl, legExtension
    case hipThrustMachine, standingCalf, seatedCalf
    case squatRack, hipAbductionMachine, hipAdductionMachine
}

// MARK: - Judgement: useful defaults, not measurements

/// Coaching heuristics.
///
/// None of these is a measured quantity. They exist to order a list, they are
/// never shown to the user as evidence, and no copy anywhere may describe
/// them as research. Each set carries the reasoning behind its numbers,
/// because a heuristic without a stated reason is indistinguishable from a
/// fact.
public struct ExerciseHeuristics: Codable, Hashable, Sendable {
    /// 1 = fully supported machine · 5 = free-standing or unilateral.
    public let stabilityDemand: Int
    /// Systemic cost, not local burn. 1 = seated isolation · 5 = heavy axial compound.
    public let fatigueCost: Int
    /// 1 = sit down and go · 2 = fetch dumbbells or adjust a bench · 3 = load plates, set a rack.
    public let setupCost: Int
    /// Why these three numbers.
    public let rationale: String

    public init(stabilityDemand: Int, fatigueCost: Int, setupCost: Int, rationale: String) {
        self.stabilityDemand = stabilityDemand
        self.fatigueCost = fatigueCost
        self.setupCost = setupCost
        self.rationale = rationale
    }
}

public struct ExerciseAttributes: Codable, Hashable, Sendable {
    public let primaryMuscles: [MuscleContribution]
    public let secondaryMuscles: [MuscleContribution]
    public let jointActions: Set<JointAction>
    public let movementPattern: MovementPattern
    public let resistanceProfile: ResistanceProfile
    public let lengthenedBiasedROM: Bool
    public let loadTags: Set<LoadTag>
    public let heuristics: ExerciseHeuristics

    public init(
        primaryMuscles: [MuscleContribution],
        secondaryMuscles: [MuscleContribution] = [],
        jointActions: Set<JointAction>,
        movementPattern: MovementPattern,
        resistanceProfile: ResistanceProfile,
        lengthenedBiasedROM: Bool = false,
        loadTags: Set<LoadTag> = [],
        heuristics: ExerciseHeuristics
    ) {
        self.primaryMuscles = primaryMuscles
        self.secondaryMuscles = secondaryMuscles
        self.jointActions = jointActions
        self.movementPattern = movementPattern
        self.resistanceProfile = resistanceProfile
        self.lengthenedBiasedROM = lengthenedBiasedROM
        self.loadTags = loadTags
        self.heuristics = heuristics
    }
}
