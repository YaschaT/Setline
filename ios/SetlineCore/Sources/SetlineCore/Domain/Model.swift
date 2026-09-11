import Foundation

// MARK: - Catalogue

/// An exercise as a thing that exists, independent of any plan.
///
/// Phase 1 carries only the attributes the vertical slice needs. The full
/// attribute set from TRAINING_LOGIC §1 — muscle contribution vectors,
/// jointActions, resistanceProfile, fatigueCost, loadTags — arrives with the
/// substitution ranking in Phase 3, which is the only thing that consumes it.
public struct Exercise: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    /// Dutch display name. The design writes exercise names in Dutch
    /// ("Bankdrukken"); the web app mixes Dutch and English.
    public var name: String
    public var equipment: Equipment
    public var isCompound: Bool
    public var unilateral: Bool
    /// Per-gym override of `equipment.defaultIncrementKg`, when set.
    public var incrementKgOverride: Decimal?

    public init(
        id: String,
        name: String,
        equipment: Equipment,
        isCompound: Bool,
        unilateral: Bool = false,
        incrementKgOverride: Decimal? = nil
    ) {
        self.id = id
        self.name = name
        self.equipment = equipment
        self.isCompound = isCompound
        self.unilateral = unilateral
        self.incrementKgOverride = incrementKgOverride
    }

    public var incrementKg: Decimal { incrementKgOverride ?? equipment.defaultIncrementKg }
}

/// One set's prescription. A `"1×5–6 + 2×6–8"` string becomes three of these,
/// which is the whole point of TRAINING_LOGIC §15 change 1: text is a
/// rendering of the model, never the model.
public struct SetPrescription: Codable, Hashable, Sendable {
    public var repRange: ClosedRange<Int>
    public var targetRIR: ClosedRange<Int>

    public init(repRange: ClosedRange<Int>, targetRIR: ClosedRange<Int> = 1...2) {
        self.repRange = repRange
        self.targetRIR = targetRIR
    }
}

public struct PlannedExercise: Codable, Hashable, Identifiable, Sendable {
    public var exerciseID: String
    public var role: ExerciseRole
    public var sets: [SetPrescription]
    public var modifiers: SetModifiers
    /// The curated Dutch string this prescription was authored as
    /// (`"120 kg → 105–110 kg"`, `"Topset + back-offs · RIR 1–2"`).
    ///
    /// Kept verbatim and shown as a note. Typing the prescription must not
    /// cost the coaching nuance the strings carry; nothing else in the app
    /// parses this field.
    public var authoredNote: LegacyPrescriptionNote?

    public var id: String { exerciseID }

    public init(
        exerciseID: String,
        role: ExerciseRole,
        sets: [SetPrescription],
        modifiers: SetModifiers = .none,
        authoredNote: LegacyPrescriptionNote? = nil
    ) {
        self.exerciseID = exerciseID
        self.role = role
        self.sets = sets
        self.modifiers = modifiers
        self.authoredNote = authoredNote
    }

    public var targetSets: Int { sets.count }
    /// The rep target used for double progression: the top of each set's range.
    public var repTargets: [Int] { sets.map(\.repRange.upperBound) }
}

/// The three free-text fields the web app authored per exercise, preserved
/// exactly as written so nothing editorial is lost in the port.
public struct LegacyPrescriptionNote: Codable, Hashable, Sendable {
    public var prescription: String
    public var load: String
    public var rest: String

    public init(prescription: String, load: String, rest: String) {
        self.prescription = prescription
        self.load = load
        self.rest = rest
    }
}

public struct WorkoutDay: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public var label: String
    public var short: String
    public var focus: String
    public var exercises: [PlannedExercise]

    public init(id: String, label: String, short: String, focus: String, exercises: [PlannedExercise]) {
        self.id = id
        self.label = label
        self.short = short
        self.focus = focus
        self.exercises = exercises
    }
}

// MARK: - Logged data

public struct LoggedSet: Codable, Hashable, Identifiable, Sendable {
    public var id: UUID
    public var index: Int
    public var weightKg: Decimal?
    /// Total reps performed. Paused reps are NOT added in.
    ///
    /// TRAINING_LOGIC §15 change 2: the web app's `completedReps()` returned
    /// `reps + pausedReps`, which fed one number into progression, PR
    /// detection and the strength trend. Addendum 16R states the same rule
    /// from the design side: "pauze-reps worden nooit bij het repsaantal
    /// opgeteld".
    public var reps: Int
    public var rirReported: Int?
    public var isWarmup: Bool
    public var modifiers: SetModifiers
    public var flags: SetFlags
    /// Origin exercise id when this set was logged on a substitute (§12.5).
    public var substitutedFrom: String?
    /// Count of partial reps at the end of the set. Shown in history,
    /// excluded from progression and PR maths (§5).
    public var partialReps: Int?
    /// Paused reps performed inside this set, carried over from the web app.
    ///
    /// The web app allowed one set to hold both normal and paused reps and
    /// then summed them. They are kept apart here and never added to `reps`.
    public var pausedReps: Int?

    public init(
        id: UUID = UUID(),
        index: Int,
        weightKg: Decimal? = nil,
        reps: Int = 0,
        rirReported: Int? = nil,
        isWarmup: Bool = false,
        modifiers: SetModifiers = .none,
        flags: SetFlags = [],
        substitutedFrom: String? = nil,
        partialReps: Int? = nil,
        pausedReps: Int? = nil
    ) {
        self.id = id
        self.index = index
        self.weightKg = weightKg
        self.reps = reps
        self.rirReported = rirReported
        self.isWarmup = isWarmup
        self.modifiers = modifiers
        self.flags = flags
        self.substitutedFrom = substitutedFrom
        self.partialReps = partialReps
        self.pausedReps = pausedReps
    }

    /// A set with weight and reps is a complete set. RIR is the optional
    /// third tap (addendum 11R) and never gates anything.
    public var isLogged: Bool { (weightKg ?? 0) > 0 && reps > 0 }

    /// Whether this set contributes to volume load.
    ///
    /// Warm-ups never do (§7). Everything else does, including paused and
    /// partial sets — addendum 16R: "Telt mee in je volume, niet in je
    /// progressie."
    public var countsTowardVolume: Bool {
        isLogged && !isWarmup
    }

    /// Whether this set may drive progression, a proposal or a record.
    ///
    /// Excluded: warm-ups, technical breakdowns, sets carrying partial reps
    /// (§5), and sets that mix paused and unpaused reps — a mixed set is not
    /// comparable to either series, so counting it would be exactly the
    /// wrong-number bug the comparability rule exists to prevent.
    public var countsTowardProgression: Bool {
        guard isLogged, !isWarmup, !flags.contains(.technicalBreakdown) else { return false }
        if (partialReps ?? 0) > 0 { return false }
        if (pausedReps ?? 0) > 0 && reps > 0 { return false }
        return true
    }
}

public struct ExerciseResult: Codable, Hashable, Identifiable, Sendable {
    public var exerciseID: String
    /// Name as it was at the time of logging, so renaming an exercise never
    /// rewrites history.
    public var name: String
    public var sets: [LoggedSet]
    public var note: String

    public var id: String { exerciseID }

    public init(exerciseID: String, name: String, sets: [LoggedSet], note: String = "") {
        self.exerciseID = exerciseID
        self.name = name
        self.sets = sets
        self.note = note
    }

    public var workingSets: [LoggedSet] { sets.filter { !$0.isWarmup } }
}

public enum SessionKind: String, Codable, Sendable {
    case workout
    case recovery
}

public struct TrainingSession: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var date: Date
    public var dayID: String
    public var dayLabel: String
    /// Percentage of planned sets tracked, as the web app computed it.
    public var completion: Int
    public var kind: SessionKind
    public var results: [ExerciseResult]
    /// Wall-clock duration, shown on artboard 17R ("Push A · 53 min · 7 sep").
    /// Absent for every session imported from the web app, which never
    /// recorded one.
    public var durationSeconds: Int?
    public var note: String?

    public init(
        id: String,
        date: Date,
        dayID: String,
        dayLabel: String,
        completion: Int,
        kind: SessionKind = .workout,
        results: [ExerciseResult],
        durationSeconds: Int? = nil,
        note: String? = nil
    ) {
        self.id = id
        self.date = date
        self.dayID = dayID
        self.dayLabel = dayLabel
        self.completion = completion
        self.kind = kind
        self.results = results
        self.durationSeconds = durationSeconds
        self.note = note
    }
}

public struct BodyMetric: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var date: String
    public var weight: Double
    public var waist: Double?

    public init(id: String, date: String, weight: Double, waist: Double? = nil) {
        self.id = id
        self.date = date
        self.weight = weight
        self.waist = waist
    }
}

public struct NutritionTargets: Codable, Hashable, Sendable {
    public var calories: Int
    public var protein: Int
    public var carbs: Int
    public var fat: Int

    public init(calories: Int, protein: Int, carbs: Int, fat: Int) {
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
    }
}
