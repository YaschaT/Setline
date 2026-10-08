// Generated from app/page.tsx by Tools/generate.py — do not hand-edit.
// The curated V1 catalogue merges these with its own additions and metadata;
// see ExerciseCatalogV1.swift.
//
// The names, prescriptions, load notes and rest notes are the web app's own,
// carried over verbatim. Equipment, role, compound and unilateral are the
// hand-authored attributes Phase 1 needs: role drives the rest prescription
// (addendum 13R) and the progression rule (TRAINING_LOGIC §3.2), equipment
// drives the load increment (§3.3).

import Foundation

public enum GeneratedExerciseCatalog {

    public static let exercises: [String: Exercise] = [
        "bulgarian": Exercise(
            id: "bulgarian",
            name: "Bulgarian split squat",
            equipment: .dumbbell,
            isCompound: true,
            unilateral: true
        ),
        "cable-crunch": Exercise(
            id: "cable-crunch",
            name: "Cable crunch",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "cable-curl": Exercise(
            id: "cable-curl",
            name: "Cable curl",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "flat-bench": Exercise(
            id: "flat-bench",
            name: "Flat bench press",
            equipment: .barbell,
            isCompound: true,
            unilateral: false
        ),
        "hack-squat": Exercise(
            id: "hack-squat",
            name: "Hack squat",
            equipment: .machinePlate,
            isCompound: true,
            unilateral: false
        ),
        "hammer-curl": Exercise(
            id: "hammer-curl",
            name: "Hammer curl",
            equipment: .dumbbell,
            isCompound: false,
            unilateral: false
        ),
        "hanging-raise": Exercise(
            id: "hanging-raise",
            name: "Hanging knee/leg raise",
            equipment: .bodyweight,
            isCompound: false,
            unilateral: false
        ),
        "hip-thrust": Exercise(
            id: "hip-thrust",
            name: "Hip thrust",
            equipment: .barbell,
            isCompound: true,
            unilateral: false
        ),
        "incline-bench": Exercise(
            id: "incline-bench",
            name: "Incline bench press",
            equipment: .barbell,
            isCompound: true,
            unilateral: false
        ),
        "incline-machine": Exercise(
            id: "incline-machine",
            name: "Incline chest press",
            equipment: .machinePlate,
            isCompound: true,
            unilateral: false
        ),
        "kneeling-lat": Exercise(
            id: "kneeling-lat",
            name: "Single-knee lat pulldown",
            equipment: .cable,
            isCompound: false,
            unilateral: true
        ),
        "lat-pulldown": Exercise(
            id: "lat-pulldown",
            name: "Vertical lat pulldown",
            equipment: .machineSelectorised,
            isCompound: true,
            unilateral: false
        ),
        "leg-extension": Exercise(
            id: "leg-extension",
            name: "Leg extension",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "leg-press": Exercise(
            id: "leg-press",
            name: "Leg press",
            equipment: .machinePlate,
            isCompound: true,
            unilateral: false
        ),
        "legs-lateral": Exercise(
            id: "legs-lateral",
            name: "Cable lateral raise",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "lying-curl": Exercise(
            id: "lying-curl",
            name: "Lying leg curl",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "neutral-row": Exercise(
            id: "neutral-row",
            name: "Neutral chest-supported row",
            equipment: .machineSelectorised,
            isCompound: true,
            unilateral: false
        ),
        "overhead-triceps": Exercise(
            id: "overhead-triceps",
            name: "Overhead cable extension",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "pec-fly": Exercise(
            id: "pec-fly",
            name: "Pec fly machine",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "pressdown": Exercise(
            id: "pressdown",
            name: "Triceps pressdown",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "pull-up": Exercise(
            id: "pull-up",
            name: "Weighted pull-up",
            equipment: .bodyweight,
            isCompound: true,
            unilateral: false
        ),
        "push-lateral": Exercise(
            id: "push-lateral",
            name: "Cable lateral raise",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "push-shoulder": Exercise(
            id: "push-shoulder",
            name: "Machine shoulder press",
            equipment: .machineSelectorised,
            isCompound: true,
            unilateral: false
        ),
        "rdl": Exercise(
            id: "rdl",
            name: "Romanian deadlift",
            equipment: .barbell,
            isCompound: true,
            unilateral: false
        ),
        "rear-delt": Exercise(
            id: "rear-delt",
            name: "Rear-delt fly",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "reverse-pec": Exercise(
            id: "reverse-pec",
            name: "Reverse pec deck",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "science-lateral": Exercise(
            id: "science-lateral",
            name: "Cable lateral raise",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "science-preacher": Exercise(
            id: "science-preacher",
            name: "Preacher curl",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "seated-calf": Exercise(
            id: "seated-calf",
            name: "Seated calf raise",
            equipment: .machinePlate,
            isCompound: false,
            unilateral: false
        ),
        "seated-curl": Exercise(
            id: "seated-curl",
            name: "Seated leg curl",
            equipment: .machineSelectorised,
            isCompound: false,
            unilateral: false
        ),
        "standing-calf": Exercise(
            id: "standing-calf",
            name: "Standing calf raise",
            equipment: .machinePlate,
            isCompound: false,
            unilateral: false
        ),
        "strict-curl": Exercise(
            id: "strict-curl",
            name: "Strict dumbbell curl",
            equipment: .dumbbell,
            isCompound: false,
            unilateral: false
        ),
        "upper-fly": Exercise(
            id: "upper-fly",
            name: "Cable/machine fly",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "upper-lateral": Exercise(
            id: "upper-lateral",
            name: "Cable lateral raise",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "upper-paused-bench": Exercise(
            id: "upper-paused-bench",
            name: "Paused bench press",
            equipment: .barbell,
            isCompound: true,
            unilateral: false
        ),
        "upper-pressdown": Exercise(
            id: "upper-pressdown",
            name: "Triceps pressdown",
            equipment: .cable,
            isCompound: false,
            unilateral: false
        ),
        "upper-shoulder": Exercise(
            id: "upper-shoulder",
            name: "Machine shoulder press",
            equipment: .machineSelectorised,
            isCompound: true,
            unilateral: false
        ),
        "upper-wide-row": Exercise(
            id: "upper-wide-row",
            name: "Wide chest-supported row",
            equipment: .machineSelectorised,
            isCompound: true,
            unilateral: false
        ),
        "wide-row": Exercise(
            id: "wide-row",
            name: "Wide chest-supported row",
            equipment: .machineSelectorised,
            isCompound: true,
            unilateral: false
        ),
    ]

    public static let roles: [String: ExerciseRole] = [
        "bulgarian": .secondaryCompound,
        "cable-crunch": .isolation,
        "cable-curl": .isolation,
        "flat-bench": .primaryStrength,
        "hack-squat": .primaryStrength,
        "hammer-curl": .isolation,
        "hanging-raise": .isolation,
        "hip-thrust": .secondaryCompound,
        "incline-bench": .primaryStrength,
        "incline-machine": .secondaryCompound,
        "kneeling-lat": .isolation,
        "lat-pulldown": .secondaryCompound,
        "leg-extension": .isolation,
        "leg-press": .secondaryCompound,
        "legs-lateral": .isolation,
        "lying-curl": .isolation,
        "neutral-row": .secondaryCompound,
        "overhead-triceps": .isolation,
        "pec-fly": .isolation,
        "pressdown": .isolation,
        "pull-up": .primaryStrength,
        "push-lateral": .isolation,
        "push-shoulder": .secondaryCompound,
        "rdl": .primaryStrength,
        "rear-delt": .isolation,
        "reverse-pec": .isolation,
        "science-lateral": .isolation,
        "science-preacher": .accessory,
        "seated-calf": .isolation,
        "seated-curl": .isolation,
        "standing-calf": .isolation,
        "strict-curl": .accessory,
        "upper-fly": .isolation,
        "upper-lateral": .isolation,
        "upper-paused-bench": .primaryStrength,
        "upper-pressdown": .isolation,
        "upper-shoulder": .secondaryCompound,
        "upper-wide-row": .secondaryCompound,
        "wide-row": .secondaryCompound,
    ]

}
