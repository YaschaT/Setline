// Generated from Tools/attributes.py by Tools/gen_v1.py — do not hand-edit.
//
// The curated V1 metadata for exercise substitution (TRAINING_LOGIC §1, §14).
// Objective fields describe what the exercise physically is. The heuristic
// triples are product judgement: they order a list, they are never shown to
// the user, and no copy may present them as measurement.

import Foundation

enum V1Heuristics {
    static let barbellAxial = ExerciseHeuristics(
        stabilityDemand: 4, fatigueCost: 5, setupCost: 3,
        rationale: "Free bar loaded through the spine: most to go wrong, highest systemic cost, plates to load."
    )
    static let barbellPress = ExerciseHeuristics(
        stabilityDemand: 4, fatigueCost: 4, setupCost: 3,
        rationale: "Free bar over a joint that needs a spotter; heavy, and the rack has to be set."
    )
    static let barbellArm = ExerciseHeuristics(
        stabilityDemand: 3, fatigueCost: 2, setupCost: 2,
        rationale: "Free bar but a single joint and a modest load; collect the bar and go."
    )
    static let bodyweightPull = ExerciseHeuristics(
        stabilityDemand: 4, fatigueCost: 4, setupCost: 2,
        rationale: "Whole bodyweight on a bar, grip-limited; a belt is the only setup."
    )
    static let dips = ExerciseHeuristics(
        stabilityDemand: 4, fatigueCost: 3, setupCost: 1,
        rationale: "Bodyweight in a demanding shoulder position, but the station needs nothing set up."
    )
    static let backExtension = ExerciseHeuristics(
        stabilityDemand: 2, fatigueCost: 2, setupCost: 1,
        rationale: "Hips fixed in a pad, light load; the position matters more than the weight."
    )
    static let dumbbellCompound = ExerciseHeuristics(
        stabilityDemand: 3, fatigueCost: 3, setupCost: 2,
        rationale: "Freer than a machine at a lighter absolute load; fetching dumbbells is the setup."
    )
    static let dumbbellUnilateral = ExerciseHeuristics(
        stabilityDemand: 4, fatigueCost: 3, setupCost: 2,
        rationale: "One side at a time — balance demand is the point of the variation."
    )
    static let dumbbellArm = ExerciseHeuristics(
        stabilityDemand: 3, fatigueCost: 2, setupCost: 2,
        rationale: "Free dumbbells through one joint; light systemic cost."
    )
    static let smithOrPlate = ExerciseHeuristics(
        stabilityDemand: 2, fatigueCost: 4, setupCost: 2,
        rationale: "Fixed bar path removes most balance demand; still heavy, still plates."
    )
    static let plateLoaded = ExerciseHeuristics(
        stabilityDemand: 2, fatigueCost: 3, setupCost: 2,
        rationale: "Supported through the movement, but loaded by hand."
    )
    static let selectorisedCompound = ExerciseHeuristics(
        stabilityDemand: 1, fatigueCost: 3, setupCost: 1,
        rationale: "Supported throughout and pin-loaded: sit down and go."
    )
    static let selectorisedIsolation = ExerciseHeuristics(
        stabilityDemand: 1, fatigueCost: 1, setupCost: 1,
        rationale: "Single joint, fully supported, minimal systemic cost."
    )
    static let cableStanding = ExerciseHeuristics(
        stabilityDemand: 2, fatigueCost: 2, setupCost: 1,
        rationale: "Standing adds a little demand; setup is a pin and a handle."
    )
    static let cableIsolation = ExerciseHeuristics(
        stabilityDemand: 2, fatigueCost: 1, setupCost: 1,
        rationale: "One joint on constant tension; nothing to set up."
    )
    static let seatedIsolation = ExerciseHeuristics(
        stabilityDemand: 1, fatigueCost: 1, setupCost: 1,
        rationale: "Seated, single joint, supported — the lowest cost in the catalogue."
    )
    static let hangingCore = ExerciseHeuristics(
        stabilityDemand: 4, fatigueCost: 2, setupCost: 1,
        rationale: "Hanging from a bar is grip- and position-demanding even though the load is bodyweight."
    )
    static let bodyweightPress = ExerciseHeuristics(
        stabilityDemand: 3, fatigueCost: 2, setupCost: 1,
        rationale: "Bodyweight on the floor: the body is the bench, and there is nothing to set up."
    )
    static let nordic = ExerciseHeuristics(
        stabilityDemand: 3, fatigueCost: 4, setupCost: 2,
        rationale: "The hamstrings lower the whole body alone: hard, sore the first weeks, and the feet need an anchor."
    )
    static let floorCore = ExerciseHeuristics(
        stabilityDemand: 3, fatigueCost: 2, setupCost: 1,
        rationale: "Bodyweight on a mat or bench; control matters more than load, and there's nothing to set up."
    )
}

enum ExerciseMetadata {

    /// Every exercise the V1 ranking may recommend. A test asserts that each
    /// of these resolves to an `Exercise` carrying complete attributes.
    static let v1Recommendable: Set<String> = [
        "ab-wheel",
        "assisted-pull-up",
        "back-extension",
        "back-squat",
        "barbell-row",
        "bayesian-curl",
        "bulgarian",
        "cable-crunch",
        "cable-curl",
        "cable-rear-delt-fly",
        "cable-woodchop",
        "chest-press-machine",
        "close-grip-bench",
        "cs-db-row",
        "db-bench",
        "db-fly",
        "db-incline",
        "db-lateral",
        "db-overhead-triceps",
        "db-rdl",
        "db-row",
        "db-shoulder-press",
        "db-shrug",
        "deadlift",
        "decline-crunch",
        "dips",
        "ez-curl",
        "face-pull",
        "flat-bench",
        "goblet-squat",
        "hack-squat",
        "hammer-curl",
        "hanging-raise",
        "hip-abduction",
        "hip-adduction",
        "hip-thrust",
        "hip-thrust-machine",
        "incline-bench",
        "incline-db-curl",
        "incline-machine",
        "kneeling-lat",
        "lat-pulldown",
        "leg-extension",
        "leg-press",
        "leg-press-calf",
        "legs-lateral",
        "low-cable-fly",
        "lying-curl",
        "machine-crunch",
        "machine-dip",
        "machine-lateral",
        "neutral-pull-up",
        "neutral-pulldown",
        "neutral-row",
        "nordic-curl",
        "overhead-press",
        "overhead-triceps",
        "pec-fly",
        "pressdown",
        "pull-up",
        "push-lateral",
        "push-shoulder",
        "push-up",
        "rdl",
        "rear-delt",
        "reverse-crunch",
        "reverse-lunge",
        "reverse-pec",
        "rope-hammer-curl",
        "science-lateral",
        "science-preacher",
        "seated-cable-row",
        "seated-calf",
        "seated-curl",
        "single-arm-pressdown",
        "single-arm-pulldown",
        "skull-crusher",
        "smith-incline",
        "smith-shoulder-press",
        "smith-squat",
        "spider-curl",
        "standing-calf",
        "straight-arm-pulldown",
        "strict-curl",
        "t-bar-row",
        "upper-fly",
        "upper-lateral",
        "upper-paused-bench",
        "upper-pressdown",
        "upper-shoulder",
        "upper-wide-row",
        "walking-lunge",
        "wide-row",
    ]

    static let stations: [String: Station] = [
        "assisted-pull-up": .assistedPullUp,
        "back-squat": .squatRack,
        "chest-press-machine": .chestPressMachine,
        "close-grip-bench": .flatBenchRack,
        "dips": .dipStation,
        "flat-bench": .flatBenchRack,
        "hack-squat": .hackSquat,
        "hanging-raise": .pullUpBar,
        "hip-abduction": .hipAbductionMachine,
        "hip-adduction": .hipAdductionMachine,
        "hip-thrust-machine": .hipThrustMachine,
        "incline-bench": .inclineBenchRack,
        "incline-machine": .inclineChestPress,
        "lat-pulldown": .latPulldown,
        "leg-extension": .legExtension,
        "leg-press": .legPress,
        "leg-press-calf": .legPress,
        "lying-curl": .lyingLegCurl,
        "machine-crunch": .abCrunchMachine,
        "machine-lateral": .lateralRaiseMachine,
        "neutral-pull-up": .pullUpBar,
        "neutral-pulldown": .latPulldown,
        "neutral-row": .chestSupportedRow,
        "pec-fly": .pecDeck,
        "pull-up": .pullUpBar,
        "push-shoulder": .shoulderPressMachine,
        "rear-delt": .pecDeck,
        "reverse-pec": .pecDeck,
        "seated-calf": .seatedCalf,
        "seated-curl": .seatedLegCurl,
        "smith-incline": .smithRack,
        "smith-shoulder-press": .smithRack,
        "smith-squat": .smithRack,
        "standing-calf": .standingCalf,
        "t-bar-row": .tBarRow,
        "upper-paused-bench": .flatBenchRack,
        "upper-shoulder": .shoulderPressMachine,
        "upper-wide-row": .chestSupportedRow,
        "wide-row": .chestSupportedRow,
    ]

    static let attributes: [String: ExerciseAttributes] = [
        "ab-wheel": ExerciseAttributes(
            primaryMuscles: [.init(.abs, 0.8), .init(.obliques, 0.2)],
            jointActions: [.spinalFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.lumbarFlexion],
            heuristics: V1Heuristics.floorCore
        ),
        "assisted-pull-up": ExerciseAttributes(
            primaryMuscles: [.init(.lat, 0.6), .init(.upperBack, 0.2), .init(.biceps, 0.2)],
            jointActions: [.shoulderExtension, .elbowFlexion, .scapularRetraction],
            movementPattern: .verticalPull,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.gripLimited],
            heuristics: V1Heuristics.selectorisedCompound
        ),
        "back-extension": ExerciseAttributes(
            primaryMuscles: [.init(.lowerBack, 0.4), .init(.glute, 0.35), .init(.hamstring, 0.25)],
            jointActions: [.hipExtension],
            movementPattern: .hinge,
            resistanceProfile: .midRangeBias,
            loadTags: [.lumbarFlexion],
            heuristics: V1Heuristics.backExtension
        ),
        "back-squat": ExerciseAttributes(
            primaryMuscles: [.init(.quad, 0.55), .init(.glute, 0.3), .init(.adductor, 0.15)],
            jointActions: [.kneeExtension, .hipExtension],
            movementPattern: .squat,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.deepKneeFlexion, .axialSpinalLoad],
            heuristics: V1Heuristics.barbellAxial
        ),
        "barbell-row": ExerciseAttributes(
            primaryMuscles: [.init(.upperBack, 0.45), .init(.lat, 0.3), .init(.biceps, 0.15), .init(.rearDelt, 0.1)],
            jointActions: [.scapularRetraction, .shoulderExtension, .elbowFlexion],
            movementPattern: .horizontalPull,
            resistanceProfile: .midRangeBias,
            loadTags: [.lumbarFlexion, .gripLimited],
            heuristics: V1Heuristics.barbellAxial
        ),
        "bayesian-curl": ExerciseAttributes(
            primaryMuscles: [.init(.biceps, 0.9), .init(.forearm, 0.1)],
            jointActions: [.elbowFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            heuristics: V1Heuristics.cableStanding
        ),
        "bulgarian": ExerciseAttributes(
            primaryMuscles: [.init(.quad, 0.5), .init(.glute, 0.35), .init(.adductor, 0.15)],
            jointActions: [.kneeExtension, .hipExtension],
            movementPattern: .lunge,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.deepKneeFlexion],
            heuristics: V1Heuristics.dumbbellUnilateral
        ),
        "cable-crunch": ExerciseAttributes(
            primaryMuscles: [.init(.abs, 0.85), .init(.obliques, 0.15)],
            jointActions: [.spinalFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .midRangeBias,
            loadTags: [.lumbarFlexion],
            heuristics: V1Heuristics.cableIsolation
        ),
        "cable-curl": ExerciseAttributes(
            primaryMuscles: [.init(.biceps, 0.85), .init(.forearm, 0.15)],
            jointActions: [.elbowFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .flatCable,
            loadTags: [.elbowCompression],
            heuristics: V1Heuristics.cableIsolation
        ),
        "cable-rear-delt-fly": ExerciseAttributes(
            primaryMuscles: [.init(.rearDelt, 0.85), .init(.upperBack, 0.15)],
            jointActions: [.shoulderHorizontalAbduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .flatCable,
            lengthenedBiasedROM: true,
            heuristics: V1Heuristics.cableIsolation
        ),
        "cable-woodchop": ExerciseAttributes(
            primaryMuscles: [.init(.obliques, 0.7), .init(.abs, 0.3)],
            jointActions: [.spinalRotation],
            movementPattern: .isolationFlexion,
            resistanceProfile: .flatCable,
            heuristics: V1Heuristics.cableStanding
        ),
        "chest-press-machine": ExerciseAttributes(
            primaryMuscles: [.init(.chestMid, 0.6), .init(.triceps, 0.22), .init(.frontDelt, 0.18)],
            jointActions: [.shoulderHorizontalAdduction, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedCompound
        ),
        "close-grip-bench": ExerciseAttributes(
            primaryMuscles: [.init(.triceps, 0.55), .init(.chestMid, 0.3), .init(.frontDelt, 0.15)],
            jointActions: [.elbowExtension, .shoulderHorizontalAdduction],
            movementPattern: .horizontalPress,
            resistanceProfile: .midRangeBias,
            loadTags: [.elbowCompression, .wristExtension],
            heuristics: V1Heuristics.barbellPress
        ),
        "cs-db-row": ExerciseAttributes(
            primaryMuscles: [.init(.upperBack, 0.45), .init(.lat, 0.3), .init(.biceps, 0.15), .init(.rearDelt, 0.1)],
            jointActions: [.scapularRetraction, .shoulderExtension, .elbowFlexion],
            movementPattern: .horizontalPull,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            heuristics: V1Heuristics.dumbbellCompound
        ),
        "db-bench": ExerciseAttributes(
            primaryMuscles: [.init(.chestMid, 0.6), .init(.triceps, 0.22), .init(.frontDelt, 0.18)],
            jointActions: [.shoulderHorizontalAdduction, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.dumbbellCompound
        ),
        "db-fly": ExerciseAttributes(
            primaryMuscles: [.init(.chestMid, 0.85), .init(.frontDelt, 0.15)],
            jointActions: [.shoulderHorizontalAdduction],
            movementPattern: .isolationFlexion,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.dumbbellArm
        ),
        "db-incline": ExerciseAttributes(
            primaryMuscles: [.init(.chestUpper, 0.55), .init(.frontDelt, 0.25), .init(.triceps, 0.2)],
            jointActions: [.shoulderHorizontalAdduction, .shoulderFlexion, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.dumbbellCompound
        ),
        "db-lateral": ExerciseAttributes(
            primaryMuscles: [.init(.sideDelt, 0.9), .init(.rearDelt, 0.1)],
            jointActions: [.shoulderAbduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.dumbbellArm
        ),
        "db-overhead-triceps": ExerciseAttributes(
            primaryMuscles: [.init(.triceps, 1)],
            jointActions: [.elbowExtension],
            movementPattern: .isolationExtension,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.overheadPosition, .elbowCompression],
            heuristics: V1Heuristics.dumbbellArm
        ),
        "db-rdl": ExerciseAttributes(
            primaryMuscles: [.init(.hamstring, 0.55), .init(.glute, 0.3), .init(.lowerBack, 0.15)],
            jointActions: [.hipExtension],
            movementPattern: .hinge,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.lumbarFlexion, .gripLimited],
            heuristics: V1Heuristics.dumbbellCompound
        ),
        "db-row": ExerciseAttributes(
            primaryMuscles: [.init(.lat, 0.4), .init(.upperBack, 0.35), .init(.biceps, 0.15), .init(.rearDelt, 0.1)],
            jointActions: [.scapularRetraction, .shoulderExtension, .elbowFlexion],
            movementPattern: .horizontalPull,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            heuristics: V1Heuristics.dumbbellUnilateral
        ),
        "db-shoulder-press": ExerciseAttributes(
            primaryMuscles: [.init(.frontDelt, 0.55), .init(.triceps, 0.22), .init(.sideDelt, 0.23)],
            jointActions: [.shoulderFlexion, .shoulderAbduction, .elbowExtension],
            movementPattern: .verticalPress,
            resistanceProfile: .midRangeBias,
            loadTags: [.overheadPosition],
            heuristics: V1Heuristics.dumbbellCompound
        ),
        "db-shrug": ExerciseAttributes(
            primaryMuscles: [.init(.trap, 1)],
            jointActions: [.scapularElevation],
            movementPattern: .isolationExtension,
            resistanceProfile: .shortenedBias,
            loadTags: [.gripLimited],
            heuristics: V1Heuristics.dumbbellArm
        ),
        "deadlift": ExerciseAttributes(
            primaryMuscles: [.init(.glute, 0.35), .init(.hamstring, 0.3), .init(.lowerBack, 0.2), .init(.quad, 0.15)],
            jointActions: [.hipExtension, .kneeExtension],
            movementPattern: .hinge,
            resistanceProfile: .midRangeBias,
            loadTags: [.axialSpinalLoad, .lumbarFlexion, .gripLimited],
            heuristics: V1Heuristics.barbellAxial
        ),
        "decline-crunch": ExerciseAttributes(
            primaryMuscles: [.init(.abs, 0.85), .init(.obliques, 0.15)],
            jointActions: [.spinalFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .midRangeBias,
            loadTags: [.lumbarFlexion],
            heuristics: V1Heuristics.floorCore
        ),
        "dips": ExerciseAttributes(
            primaryMuscles: [.init(.chestMid, 0.45), .init(.triceps, 0.4), .init(.frontDelt, 0.15)],
            jointActions: [.shoulderHorizontalAdduction, .shoulderExtension, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.dips
        ),
        "ez-curl": ExerciseAttributes(
            primaryMuscles: [.init(.biceps, 0.85), .init(.forearm, 0.15)],
            jointActions: [.elbowFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .midRangeBias,
            loadTags: [.wristExtension, .elbowCompression],
            heuristics: V1Heuristics.barbellArm
        ),
        "face-pull": ExerciseAttributes(
            primaryMuscles: [.init(.rearDelt, 0.7), .init(.upperBack, 0.3)],
            jointActions: [.shoulderHorizontalAbduction, .scapularRetraction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .flatCable,
            heuristics: V1Heuristics.cableStanding
        ),
        "flat-bench": ExerciseAttributes(
            primaryMuscles: [.init(.chestMid, 0.6), .init(.triceps, 0.25), .init(.frontDelt, 0.15)],
            jointActions: [.shoulderHorizontalAdduction, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .midRangeBias,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.barbellPress
        ),
        "goblet-squat": ExerciseAttributes(
            primaryMuscles: [.init(.quad, 0.6), .init(.glute, 0.28), .init(.adductor, 0.12)],
            jointActions: [.kneeExtension, .hipExtension],
            movementPattern: .squat,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.deepKneeFlexion],
            heuristics: V1Heuristics.dumbbellCompound
        ),
        "hack-squat": ExerciseAttributes(
            primaryMuscles: [.init(.quad, 0.7), .init(.glute, 0.2), .init(.adductor, 0.1)],
            jointActions: [.kneeExtension, .hipExtension],
            movementPattern: .squat,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.deepKneeFlexion, .axialSpinalLoad],
            heuristics: V1Heuristics.smithOrPlate
        ),
        "hammer-curl": ExerciseAttributes(
            primaryMuscles: [.init(.biceps, 0.6), .init(.forearm, 0.4)],
            jointActions: [.elbowFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.dumbbellArm
        ),
        "hanging-raise": ExerciseAttributes(
            primaryMuscles: [.init(.abs, 0.7), .init(.obliques, 0.2), .init(.quad, 0.1)],
            jointActions: [.hipFlexion, .spinalFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.gripLimited],
            heuristics: V1Heuristics.hangingCore
        ),
        "hip-abduction": ExerciseAttributes(
            primaryMuscles: [.init(.glute, 1)],
            jointActions: [.hipAbduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "hip-adduction": ExerciseAttributes(
            primaryMuscles: [.init(.adductor, 1)],
            jointActions: [.hipAdduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "hip-thrust": ExerciseAttributes(
            primaryMuscles: [.init(.glute, 0.75), .init(.hamstring, 0.25)],
            jointActions: [.hipExtension],
            movementPattern: .hinge,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.plateLoaded
        ),
        "hip-thrust-machine": ExerciseAttributes(
            primaryMuscles: [.init(.glute, 0.75), .init(.hamstring, 0.25)],
            jointActions: [.hipExtension],
            movementPattern: .hinge,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.plateLoaded
        ),
        "incline-bench": ExerciseAttributes(
            primaryMuscles: [.init(.chestUpper, 0.55), .init(.frontDelt, 0.25), .init(.triceps, 0.2)],
            jointActions: [.shoulderHorizontalAdduction, .shoulderFlexion, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .midRangeBias,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.barbellPress
        ),
        "incline-db-curl": ExerciseAttributes(
            primaryMuscles: [.init(.biceps, 0.9), .init(.forearm, 0.1)],
            jointActions: [.elbowFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.elbowCompression],
            heuristics: V1Heuristics.dumbbellArm
        ),
        "incline-machine": ExerciseAttributes(
            primaryMuscles: [.init(.chestUpper, 0.55), .init(.frontDelt, 0.25), .init(.triceps, 0.2)],
            jointActions: [.shoulderHorizontalAdduction, .shoulderFlexion, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedCompound
        ),
        "kneeling-lat": ExerciseAttributes(
            primaryMuscles: [.init(.lat, 0.7), .init(.upperBack, 0.15), .init(.biceps, 0.15)],
            jointActions: [.shoulderExtension, .elbowFlexion],
            movementPattern: .verticalPull,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            heuristics: V1Heuristics.cableStanding
        ),
        "lat-pulldown": ExerciseAttributes(
            primaryMuscles: [.init(.lat, 0.6), .init(.upperBack, 0.2), .init(.biceps, 0.2)],
            jointActions: [.shoulderExtension, .elbowFlexion, .scapularRetraction],
            movementPattern: .verticalPull,
            resistanceProfile: .midRangeBias,
            loadTags: [.gripLimited],
            heuristics: V1Heuristics.selectorisedCompound
        ),
        "leg-extension": ExerciseAttributes(
            primaryMuscles: [.init(.quad, 1)],
            jointActions: [.kneeExtension],
            movementPattern: .isolationExtension,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "leg-press": ExerciseAttributes(
            primaryMuscles: [.init(.quad, 0.6), .init(.glute, 0.25), .init(.adductor, 0.15)],
            jointActions: [.kneeExtension, .hipExtension],
            movementPattern: .squat,
            resistanceProfile: .midRangeBias,
            loadTags: [.deepKneeFlexion],
            heuristics: V1Heuristics.plateLoaded
        ),
        "leg-press-calf": ExerciseAttributes(
            primaryMuscles: [.init(.calf, 1)],
            jointActions: [.anklePlantarflexion],
            movementPattern: .isolationExtension,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            heuristics: V1Heuristics.plateLoaded
        ),
        "legs-lateral": ExerciseAttributes(
            primaryMuscles: [.init(.sideDelt, 0.9), .init(.rearDelt, 0.1)],
            jointActions: [.shoulderAbduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .flatCable,
            heuristics: V1Heuristics.cableIsolation
        ),
        "low-cable-fly": ExerciseAttributes(
            primaryMuscles: [.init(.chestUpper, 0.8), .init(.frontDelt, 0.2)],
            jointActions: [.shoulderHorizontalAdduction, .shoulderFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .flatCable,
            lengthenedBiasedROM: true,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.cableIsolation
        ),
        "lying-curl": ExerciseAttributes(
            primaryMuscles: [.init(.hamstring, 1)],
            jointActions: [.kneeFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "machine-crunch": ExerciseAttributes(
            primaryMuscles: [.init(.abs, 0.85), .init(.obliques, 0.15)],
            jointActions: [.spinalFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "machine-dip": ExerciseAttributes(
            primaryMuscles: [.init(.chestMid, 0.45), .init(.triceps, 0.4), .init(.frontDelt, 0.15)],
            jointActions: [.shoulderExtension, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedCompound
        ),
        "machine-lateral": ExerciseAttributes(
            primaryMuscles: [.init(.sideDelt, 0.9), .init(.rearDelt, 0.1)],
            jointActions: [.shoulderAbduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "neutral-pull-up": ExerciseAttributes(
            primaryMuscles: [.init(.lat, 0.62), .init(.upperBack, 0.18), .init(.biceps, 0.2)],
            jointActions: [.shoulderExtension, .elbowFlexion, .scapularRetraction],
            movementPattern: .verticalPull,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.gripLimited],
            heuristics: V1Heuristics.bodyweightPull
        ),
        "neutral-pulldown": ExerciseAttributes(
            primaryMuscles: [.init(.lat, 0.62), .init(.upperBack, 0.18), .init(.biceps, 0.2)],
            jointActions: [.shoulderExtension, .elbowFlexion, .scapularRetraction],
            movementPattern: .verticalPull,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedCompound
        ),
        "neutral-row": ExerciseAttributes(
            primaryMuscles: [.init(.upperBack, 0.45), .init(.lat, 0.3), .init(.biceps, 0.15), .init(.rearDelt, 0.1)],
            jointActions: [.scapularRetraction, .shoulderExtension, .elbowFlexion],
            movementPattern: .horizontalPull,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedCompound
        ),
        "nordic-curl": ExerciseAttributes(
            primaryMuscles: [.init(.hamstring, 1)],
            jointActions: [.kneeFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            heuristics: V1Heuristics.nordic
        ),
        "overhead-press": ExerciseAttributes(
            primaryMuscles: [.init(.frontDelt, 0.55), .init(.triceps, 0.25), .init(.sideDelt, 0.2)],
            jointActions: [.shoulderFlexion, .shoulderAbduction, .elbowExtension],
            movementPattern: .verticalPress,
            resistanceProfile: .midRangeBias,
            loadTags: [.overheadPosition, .axialSpinalLoad],
            heuristics: V1Heuristics.barbellAxial
        ),
        "overhead-triceps": ExerciseAttributes(
            primaryMuscles: [.init(.triceps, 1)],
            jointActions: [.elbowExtension],
            movementPattern: .isolationExtension,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.overheadPosition, .elbowCompression],
            heuristics: V1Heuristics.cableIsolation
        ),
        "pec-fly": ExerciseAttributes(
            primaryMuscles: [.init(.chestMid, 0.85), .init(.frontDelt, 0.15)],
            jointActions: [.shoulderHorizontalAdduction],
            movementPattern: .isolationFlexion,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "pressdown": ExerciseAttributes(
            primaryMuscles: [.init(.triceps, 1)],
            jointActions: [.elbowExtension],
            movementPattern: .isolationExtension,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.cableIsolation
        ),
        "pull-up": ExerciseAttributes(
            primaryMuscles: [.init(.lat, 0.6), .init(.upperBack, 0.2), .init(.biceps, 0.2)],
            jointActions: [.shoulderExtension, .elbowFlexion, .scapularRetraction],
            movementPattern: .verticalPull,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.gripLimited],
            heuristics: V1Heuristics.bodyweightPull
        ),
        "push-lateral": ExerciseAttributes(
            primaryMuscles: [.init(.sideDelt, 0.9), .init(.rearDelt, 0.1)],
            jointActions: [.shoulderAbduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .flatCable,
            heuristics: V1Heuristics.cableIsolation
        ),
        "push-shoulder": ExerciseAttributes(
            primaryMuscles: [.init(.frontDelt, 0.55), .init(.triceps, 0.25), .init(.sideDelt, 0.2)],
            jointActions: [.shoulderFlexion, .shoulderAbduction, .elbowExtension],
            movementPattern: .verticalPress,
            resistanceProfile: .midRangeBias,
            loadTags: [.overheadPosition],
            heuristics: V1Heuristics.selectorisedCompound
        ),
        "push-up": ExerciseAttributes(
            primaryMuscles: [.init(.chestMid, 0.55), .init(.triceps, 0.25), .init(.frontDelt, 0.2)],
            jointActions: [.shoulderHorizontalAdduction, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.bodyweightPress
        ),
        "rdl": ExerciseAttributes(
            primaryMuscles: [.init(.hamstring, 0.55), .init(.glute, 0.3), .init(.lowerBack, 0.15)],
            jointActions: [.hipExtension],
            movementPattern: .hinge,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.axialSpinalLoad, .lumbarFlexion, .gripLimited],
            heuristics: V1Heuristics.barbellAxial
        ),
        "rear-delt": ExerciseAttributes(
            primaryMuscles: [.init(.rearDelt, 0.85), .init(.upperBack, 0.15)],
            jointActions: [.shoulderHorizontalAbduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "reverse-crunch": ExerciseAttributes(
            primaryMuscles: [.init(.abs, 0.8), .init(.obliques, 0.2)],
            jointActions: [.hipFlexion, .spinalFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.floorCore
        ),
        "reverse-lunge": ExerciseAttributes(
            primaryMuscles: [.init(.quad, 0.45), .init(.glute, 0.4), .init(.adductor, 0.15)],
            jointActions: [.kneeExtension, .hipExtension],
            movementPattern: .lunge,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.deepKneeFlexion],
            heuristics: V1Heuristics.dumbbellUnilateral
        ),
        "reverse-pec": ExerciseAttributes(
            primaryMuscles: [.init(.rearDelt, 0.85), .init(.upperBack, 0.15)],
            jointActions: [.shoulderHorizontalAbduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "rope-hammer-curl": ExerciseAttributes(
            primaryMuscles: [.init(.biceps, 0.55), .init(.forearm, 0.45)],
            jointActions: [.elbowFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .flatCable,
            heuristics: V1Heuristics.cableIsolation
        ),
        "science-lateral": ExerciseAttributes(
            primaryMuscles: [.init(.sideDelt, 0.9), .init(.rearDelt, 0.1)],
            jointActions: [.shoulderAbduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .flatCable,
            heuristics: V1Heuristics.cableIsolation
        ),
        "science-preacher": ExerciseAttributes(
            primaryMuscles: [.init(.biceps, 0.9), .init(.forearm, 0.1)],
            jointActions: [.elbowFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.elbowCompression],
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "seated-cable-row": ExerciseAttributes(
            primaryMuscles: [.init(.upperBack, 0.45), .init(.lat, 0.3), .init(.biceps, 0.15), .init(.rearDelt, 0.1)],
            jointActions: [.scapularRetraction, .shoulderExtension, .elbowFlexion],
            movementPattern: .horizontalPull,
            resistanceProfile: .flatCable,
            heuristics: V1Heuristics.cableStanding
        ),
        "seated-calf": ExerciseAttributes(
            primaryMuscles: [.init(.calf, 1)],
            jointActions: [.anklePlantarflexion],
            movementPattern: .isolationExtension,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            heuristics: V1Heuristics.seatedIsolation
        ),
        "seated-curl": ExerciseAttributes(
            primaryMuscles: [.init(.hamstring, 1)],
            jointActions: [.kneeFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "single-arm-pressdown": ExerciseAttributes(
            primaryMuscles: [.init(.triceps, 1)],
            jointActions: [.elbowExtension],
            movementPattern: .isolationExtension,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.cableIsolation
        ),
        "single-arm-pulldown": ExerciseAttributes(
            primaryMuscles: [.init(.lat, 0.7), .init(.upperBack, 0.15), .init(.biceps, 0.15)],
            jointActions: [.shoulderExtension, .elbowFlexion],
            movementPattern: .verticalPull,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            heuristics: V1Heuristics.cableStanding
        ),
        "skull-crusher": ExerciseAttributes(
            primaryMuscles: [.init(.triceps, 1)],
            jointActions: [.elbowExtension],
            movementPattern: .isolationExtension,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.elbowCompression],
            heuristics: V1Heuristics.barbellArm
        ),
        "smith-incline": ExerciseAttributes(
            primaryMuscles: [.init(.chestUpper, 0.55), .init(.frontDelt, 0.25), .init(.triceps, 0.2)],
            jointActions: [.shoulderHorizontalAdduction, .shoulderFlexion, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .midRangeBias,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.smithOrPlate
        ),
        "smith-shoulder-press": ExerciseAttributes(
            primaryMuscles: [.init(.frontDelt, 0.55), .init(.triceps, 0.25), .init(.sideDelt, 0.2)],
            jointActions: [.shoulderFlexion, .shoulderAbduction, .elbowExtension],
            movementPattern: .verticalPress,
            resistanceProfile: .midRangeBias,
            loadTags: [.overheadPosition],
            heuristics: V1Heuristics.smithOrPlate
        ),
        "smith-squat": ExerciseAttributes(
            primaryMuscles: [.init(.quad, 0.65), .init(.glute, 0.25), .init(.adductor, 0.1)],
            jointActions: [.kneeExtension, .hipExtension],
            movementPattern: .squat,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.deepKneeFlexion, .axialSpinalLoad],
            heuristics: V1Heuristics.smithOrPlate
        ),
        "spider-curl": ExerciseAttributes(
            primaryMuscles: [.init(.biceps, 0.9), .init(.forearm, 0.1)],
            jointActions: [.elbowFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.dumbbellArm
        ),
        "standing-calf": ExerciseAttributes(
            primaryMuscles: [.init(.calf, 1)],
            jointActions: [.anklePlantarflexion],
            movementPattern: .isolationExtension,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            loadTags: [.axialSpinalLoad],
            heuristics: V1Heuristics.selectorisedIsolation
        ),
        "straight-arm-pulldown": ExerciseAttributes(
            primaryMuscles: [.init(.lat, 0.85), .init(.upperBack, 0.15)],
            jointActions: [.shoulderExtension],
            movementPattern: .isolationExtension,
            resistanceProfile: .lengthenedBias,
            lengthenedBiasedROM: true,
            heuristics: V1Heuristics.cableStanding
        ),
        "strict-curl": ExerciseAttributes(
            primaryMuscles: [.init(.biceps, 0.85), .init(.forearm, 0.15)],
            jointActions: [.elbowFlexion],
            movementPattern: .isolationFlexion,
            resistanceProfile: .midRangeBias,
            loadTags: [.elbowCompression],
            heuristics: V1Heuristics.dumbbellArm
        ),
        "t-bar-row": ExerciseAttributes(
            primaryMuscles: [.init(.upperBack, 0.45), .init(.lat, 0.3), .init(.biceps, 0.15), .init(.rearDelt, 0.1)],
            jointActions: [.scapularRetraction, .shoulderExtension, .elbowFlexion],
            movementPattern: .horizontalPull,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.plateLoaded
        ),
        "upper-fly": ExerciseAttributes(
            primaryMuscles: [.init(.chestMid, 0.85), .init(.frontDelt, 0.15)],
            jointActions: [.shoulderHorizontalAdduction],
            movementPattern: .isolationFlexion,
            resistanceProfile: .flatCable,
            lengthenedBiasedROM: true,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.cableIsolation
        ),
        "upper-lateral": ExerciseAttributes(
            primaryMuscles: [.init(.sideDelt, 0.9), .init(.rearDelt, 0.1)],
            jointActions: [.shoulderAbduction],
            movementPattern: .isolationAbduction,
            resistanceProfile: .flatCable,
            heuristics: V1Heuristics.cableIsolation
        ),
        "upper-paused-bench": ExerciseAttributes(
            primaryMuscles: [.init(.chestMid, 0.6), .init(.triceps, 0.25), .init(.frontDelt, 0.15)],
            jointActions: [.shoulderHorizontalAdduction, .elbowExtension],
            movementPattern: .horizontalPress,
            resistanceProfile: .midRangeBias,
            loadTags: [.endRangeShoulder],
            heuristics: V1Heuristics.barbellPress
        ),
        "upper-pressdown": ExerciseAttributes(
            primaryMuscles: [.init(.triceps, 1)],
            jointActions: [.elbowExtension],
            movementPattern: .isolationExtension,
            resistanceProfile: .shortenedBias,
            heuristics: V1Heuristics.cableIsolation
        ),
        "upper-shoulder": ExerciseAttributes(
            primaryMuscles: [.init(.frontDelt, 0.55), .init(.triceps, 0.25), .init(.sideDelt, 0.2)],
            jointActions: [.shoulderFlexion, .shoulderAbduction, .elbowExtension],
            movementPattern: .verticalPress,
            resistanceProfile: .midRangeBias,
            loadTags: [.overheadPosition],
            heuristics: V1Heuristics.selectorisedCompound
        ),
        "upper-wide-row": ExerciseAttributes(
            primaryMuscles: [.init(.upperBack, 0.5), .init(.rearDelt, 0.2), .init(.lat, 0.2), .init(.biceps, 0.1)],
            jointActions: [.scapularRetraction, .shoulderHorizontalAbduction, .elbowFlexion],
            movementPattern: .horizontalPull,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedCompound
        ),
        "walking-lunge": ExerciseAttributes(
            primaryMuscles: [.init(.quad, 0.45), .init(.glute, 0.4), .init(.adductor, 0.15)],
            jointActions: [.kneeExtension, .hipExtension],
            movementPattern: .lunge,
            resistanceProfile: .midRangeBias,
            loadTags: [.deepKneeFlexion],
            heuristics: V1Heuristics.dumbbellUnilateral
        ),
        "wide-row": ExerciseAttributes(
            primaryMuscles: [.init(.upperBack, 0.5), .init(.rearDelt, 0.2), .init(.lat, 0.2), .init(.biceps, 0.1)],
            jointActions: [.scapularRetraction, .shoulderHorizontalAbduction, .elbowFlexion],
            movementPattern: .horizontalPull,
            resistanceProfile: .midRangeBias,
            heuristics: V1Heuristics.selectorisedCompound
        ),
    ]

    /// The 54 exercises V1 adds beyond the shipped plans: substitution
    /// targets and the staples a lifter looks for. No plan prescribes them.
    static let additions: [String: Exercise] = [
        "ab-wheel": Exercise(
            id: "ab-wheel",
            name: "Ab wheel rollout",
            equipment: .bodyweight,
            isCompound: false,
            unilateral: false
        ),
        "assisted-pull-up": Exercise(
            id: "assisted-pull-up",
            name: "Assisted pull-up",
            equipment: .machineSelectorised,
            isCompound: true,
            unilateral: false
        ),
        "back-extension": Exercise(
            id: "back-extension",
            name: "45° back extension",
            equipment: .bodyweight,
            isCompound: false,
            unilateral: false
        ),
        "back-squat": Exercise(
            id: "back-squat",
            name: "Barbell back squat",
            equipment: .barbell,
            isCompound: true,
            unilateral: false
        ),
        "barbell-row": Exercise(
            id: "barbell-row",
            name: "Barbell row",
            equipment: .barbell,
            isCompound: true,
            unilateral: false
        ),
        "bayesian-curl": Exercise(
            id: "bayesian-curl",
            name: "Bayesian cable curl",
            equipment: .cable,
            isCompound: false,
            unilateral: true
        ),
        "cable-rear-delt-fly": Exercise(
            id: "cable-rear-delt-fly",
            name: "Cable rear-delt fly",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "cable-woodchop": Exercise(
            id: "cable-woodchop",
            name: "Cable woodchop",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "chest-press-machine": Exercise(
            id: "chest-press-machine",
            name: "Converging chest press",
            equipment: .machineSelectorised,
            isCompound: true,
            unilateral: false
        ),
        "close-grip-bench": Exercise(
            id: "close-grip-bench",
            name: "Close-grip bench press",
            equipment: .barbell,
            isCompound: true,
            unilateral: false
        ),
        "cs-db-row": Exercise(
            id: "cs-db-row",
            name: "Chest-supported dumbbell row",
            equipment: .dumbbell,
            isCompound: true,
            unilateral: false
        ),
        "db-bench": Exercise(
            id: "db-bench",
            name: "Dumbbell bench press",
            equipment: .dumbbell,
            isCompound: true,
            unilateral: false
        ),
        "db-fly": Exercise(
            id: "db-fly",
            name: "Dumbbell fly",
            equipment: .dumbbell,
            isCompound: false,
            unilateral: false
        ),
        "db-incline": Exercise(
            id: "db-incline",
            name: "Incline dumbbell press",
            equipment: .dumbbell,
            isCompound: true,
            unilateral: false
        ),
        "db-lateral": Exercise(
            id: "db-lateral",
            name: "Dumbbell lateral raise",
            equipment: .dumbbell,
            isCompound: false,
            unilateral: false
        ),
        "db-overhead-triceps": Exercise(
            id: "db-overhead-triceps",
            name: "Overhead dumbbell extension",
            equipment: .dumbbell,
            isCompound: false,
            unilateral: false
        ),
        "db-rdl": Exercise(
            id: "db-rdl",
            name: "Dumbbell Romanian deadlift",
            equipment: .dumbbell,
            isCompound: true,
            unilateral: false
        ),
        "db-row": Exercise(
            id: "db-row",
            name: "Dumbbell row",
            equipment: .dumbbell,
            isCompound: true,
            unilateral: true
        ),
        "db-shoulder-press": Exercise(
            id: "db-shoulder-press",
            name: "Dumbbell shoulder press",
            equipment: .dumbbell,
            isCompound: true,
            unilateral: false
        ),
        "db-shrug": Exercise(
            id: "db-shrug",
            name: "Dumbbell shrug",
            equipment: .dumbbell,
            isCompound: false,
            unilateral: false
        ),
        "deadlift": Exercise(
            id: "deadlift",
            name: "Deadlift",
            equipment: .barbell,
            isCompound: true,
            unilateral: false
        ),
        "decline-crunch": Exercise(
            id: "decline-crunch",
            name: "Weighted decline crunch",
            equipment: .bodyweight,
            isCompound: false,
            unilateral: false
        ),
        "dips": Exercise(
            id: "dips",
            name: "Dips",
            equipment: .bodyweight,
            isCompound: true,
            unilateral: false
        ),
        "ez-curl": Exercise(
            id: "ez-curl",
            name: "EZ-bar curl",
            equipment: .barbell,
            isCompound: false,
            unilateral: false
        ),
        "face-pull": Exercise(
            id: "face-pull",
            name: "Face pull",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "goblet-squat": Exercise(
            id: "goblet-squat",
            name: "Goblet squat",
            equipment: .dumbbell,
            isCompound: true,
            unilateral: false
        ),
        "hip-abduction": Exercise(
            id: "hip-abduction",
            name: "Hip abduction machine",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "hip-adduction": Exercise(
            id: "hip-adduction",
            name: "Hip adduction machine",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "hip-thrust-machine": Exercise(
            id: "hip-thrust-machine",
            name: "Hip thrust machine",
            equipment: .machinePlate,
            isCompound: true,
            unilateral: false
        ),
        "incline-db-curl": Exercise(
            id: "incline-db-curl",
            name: "Incline dumbbell curl",
            equipment: .dumbbell,
            isCompound: false,
            unilateral: false
        ),
        "leg-press-calf": Exercise(
            id: "leg-press-calf",
            name: "Calf raise on leg press",
            equipment: .machinePlate,
            isCompound: false,
            unilateral: false
        ),
        "low-cable-fly": Exercise(
            id: "low-cable-fly",
            name: "Low-to-high cable fly",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "machine-crunch": Exercise(
            id: "machine-crunch",
            name: "Ab crunch machine",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "machine-dip": Exercise(
            id: "machine-dip",
            name: "Machine dip",
            equipment: .machineSelectorised,
            isCompound: true,
            unilateral: false
        ),
        "machine-lateral": Exercise(
            id: "machine-lateral",
            name: "Lateral raise machine",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "neutral-pull-up": Exercise(
            id: "neutral-pull-up",
            name: "Neutral-grip pull-up",
            equipment: .bodyweight,
            isCompound: true,
            unilateral: false
        ),
        "neutral-pulldown": Exercise(
            id: "neutral-pulldown",
            name: "Neutral-grip lat pulldown",
            equipment: .machineSelectorised,
            isCompound: true,
            unilateral: false
        ),
        "nordic-curl": Exercise(
            id: "nordic-curl",
            name: "Nordic hamstring curl",
            equipment: .bodyweight,
            isCompound: false,
            unilateral: false
        ),
        "overhead-press": Exercise(
            id: "overhead-press",
            name: "Barbell overhead press",
            equipment: .barbell,
            isCompound: true,
            unilateral: false
        ),
        "push-up": Exercise(
            id: "push-up",
            name: "Push-up",
            equipment: .bodyweight,
            isCompound: true,
            unilateral: false
        ),
        "reverse-crunch": Exercise(
            id: "reverse-crunch",
            name: "Reverse crunch",
            equipment: .bodyweight,
            isCompound: false,
            unilateral: false
        ),
        "reverse-lunge": Exercise(
            id: "reverse-lunge",
            name: "Reverse lunge",
            equipment: .dumbbell,
            isCompound: true,
            unilateral: true
        ),
        "rope-hammer-curl": Exercise(
            id: "rope-hammer-curl",
            name: "Rope hammer curl",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "seated-cable-row": Exercise(
            id: "seated-cable-row",
            name: "Seated cable row",
            equipment: .cable,
            isCompound: true,
            unilateral: false
        ),
        "single-arm-pressdown": Exercise(
            id: "single-arm-pressdown",
            name: "Single-arm cable pressdown",
            equipment: .cable,
            isCompound: false,
            unilateral: true
        ),
        "single-arm-pulldown": Exercise(
            id: "single-arm-pulldown",
            name: "Single-arm cable pulldown",
            equipment: .cable,
            isCompound: true,
            unilateral: true
        ),
        "skull-crusher": Exercise(
            id: "skull-crusher",
            name: "EZ-bar skull crusher",
            equipment: .barbell,
            isCompound: false,
            unilateral: false
        ),
        "smith-incline": Exercise(
            id: "smith-incline",
            name: "Smith incline press",
            equipment: .smith,
            isCompound: true,
            unilateral: false
        ),
        "smith-shoulder-press": Exercise(
            id: "smith-shoulder-press",
            name: "Smith shoulder press",
            equipment: .smith,
            isCompound: true,
            unilateral: false
        ),
        "smith-squat": Exercise(
            id: "smith-squat",
            name: "Smith machine squat",
            equipment: .smith,
            isCompound: true,
            unilateral: false
        ),
        "spider-curl": Exercise(
            id: "spider-curl",
            name: "Spider curl",
            equipment: .dumbbell,
            isCompound: false,
            unilateral: false
        ),
        "straight-arm-pulldown": Exercise(
            id: "straight-arm-pulldown",
            name: "Straight-arm pulldown",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "t-bar-row": Exercise(
            id: "t-bar-row",
            name: "Chest-supported T-bar row",
            equipment: .machinePlate,
            isCompound: true,
            unilateral: false
        ),
        "walking-lunge": Exercise(
            id: "walking-lunge",
            name: "Walking lunge",
            equipment: .dumbbell,
            isCompound: true,
            unilateral: true
        ),
    ]

    /// Ids that name the same physical exercise. The web app keys some
    /// exercises per training day; ranking must never offer one as an
    /// alternative to another.
    static let canonicalID: [String: String] = [
        "legs-lateral": "push-lateral",
        "science-lateral": "push-lateral",
        "upper-lateral": "push-lateral",
        "upper-paused-bench": "flat-bench",
        "upper-pressdown": "pressdown",
        "upper-shoulder": "push-shoulder",
        "upper-wide-row": "wide-row",
    ]

    /// Curated alternative name -> exercise id, so a ranked result can carry
    /// its hand-written `why` line. Conservative by design: a name is mapped
    /// only when it denotes exactly this entry. An unmapped name costs the
    /// result its curated copy, nothing else.
    static let curatedNameToID: [String: String] = [
        "45° hip extension": "back-extension",
        "Assisted pull-up": "assisted-pull-up",
        "Bayesian cable curl": "bayesian-curl",
        "Cable fly": "upper-fly",
        "Cable rear-delt fly": "cable-rear-delt-fly",
        "Chest-supported dumbbell row": "cs-db-row",
        "Converging chest press": "chest-press-machine",
        "Dumbbell Romanian deadlift": "db-rdl",
        "Dumbbell bench press": "db-bench",
        "Dumbbell fly": "db-fly",
        "Dumbbell lateral raise": "db-lateral",
        "EZ-bar skull crusher": "skull-crusher",
        "Flat bench press": "flat-bench",
        "Hack squat": "hack-squat",
        "Heel-elevated Smith squat": "smith-squat",
        "Incline chest press machine": "incline-machine",
        "Incline dumbbell curl": "incline-db-curl",
        "Incline dumbbell press": "db-incline",
        "Leg press": "leg-press",
        "Leg-press calf raise": "leg-press-calf",
        "Lying leg curl": "lying-curl",
        "Machine crunch": "machine-crunch",
        "Machine dip": "machine-dip",
        "Machine lateral raise": "machine-lateral",
        "Machine preacher curl": "science-preacher",
        "Neutral cable row": "seated-cable-row",
        "Neutral-grip lat pulldown": "neutral-pulldown",
        "Neutral-grip pull-up": "neutral-pull-up",
        "Neutral-grip pulldown": "neutral-pulldown",
        "Nordic hamstring curl": "nordic-curl",
        "Overhead dumbbell extension": "db-overhead-triceps",
        "Pec-deck": "pec-fly",
        "Reverse crunch": "reverse-crunch",
        "Reverse lunge": "reverse-lunge",
        "Reverse pec deck": "reverse-pec",
        "Rope hammer curl": "rope-hammer-curl",
        "Seated dumbbell press": "db-shoulder-press",
        "Seated leg curl": "seated-curl",
        "Single-arm cable pressdown": "single-arm-pressdown",
        "Single-arm cable pulldown": "single-arm-pulldown",
        "Smith shoulder press": "smith-shoulder-press",
        "Spider curl": "spider-curl",
        "Weighted decline crunch": "decline-crunch",
    ]

    static let additionRoles: [String: ExerciseRole] = [
        "ab-wheel": .isolation,
        "assisted-pull-up": .secondaryCompound,
        "back-extension": .accessory,
        "back-squat": .primaryStrength,
        "barbell-row": .secondaryCompound,
        "bayesian-curl": .isolation,
        "cable-rear-delt-fly": .isolation,
        "cable-woodchop": .isolation,
        "chest-press-machine": .secondaryCompound,
        "close-grip-bench": .secondaryCompound,
        "cs-db-row": .secondaryCompound,
        "db-bench": .secondaryCompound,
        "db-fly": .isolation,
        "db-incline": .secondaryCompound,
        "db-lateral": .isolation,
        "db-overhead-triceps": .isolation,
        "db-rdl": .primaryStrength,
        "db-row": .secondaryCompound,
        "db-shoulder-press": .secondaryCompound,
        "db-shrug": .isolation,
        "deadlift": .primaryStrength,
        "decline-crunch": .isolation,
        "dips": .secondaryCompound,
        "ez-curl": .accessory,
        "face-pull": .isolation,
        "goblet-squat": .secondaryCompound,
        "hip-abduction": .isolation,
        "hip-adduction": .isolation,
        "hip-thrust-machine": .secondaryCompound,
        "incline-db-curl": .isolation,
        "leg-press-calf": .isolation,
        "low-cable-fly": .isolation,
        "machine-crunch": .isolation,
        "machine-dip": .secondaryCompound,
        "machine-lateral": .isolation,
        "neutral-pull-up": .secondaryCompound,
        "neutral-pulldown": .secondaryCompound,
        "nordic-curl": .accessory,
        "overhead-press": .primaryStrength,
        "push-up": .secondaryCompound,
        "reverse-crunch": .isolation,
        "reverse-lunge": .secondaryCompound,
        "rope-hammer-curl": .isolation,
        "seated-cable-row": .secondaryCompound,
        "single-arm-pressdown": .isolation,
        "single-arm-pulldown": .secondaryCompound,
        "skull-crusher": .accessory,
        "smith-incline": .secondaryCompound,
        "smith-shoulder-press": .secondaryCompound,
        "smith-squat": .primaryStrength,
        "spider-curl": .isolation,
        "straight-arm-pulldown": .isolation,
        "t-bar-row": .secondaryCompound,
        "walking-lunge": .secondaryCompound,
    ]
}
