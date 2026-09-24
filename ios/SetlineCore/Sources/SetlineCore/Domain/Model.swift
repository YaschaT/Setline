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
    /// The apparatus this exercise needs, where two exercises genuinely
    /// contend for one. `nil` for anything a gym has several of.
    public var station: Station?
    /// Ranking metadata. Optional so the catalogue can grow incrementally —
    /// but every exercise offered as a V1 recommendation has it, and a test
    /// enforces that.
    public var attributes: ExerciseAttributes?

    public init(
        id: String,
        name: String,
        equipment: Equipment,
        isCompound: Bool,
        unilateral: Bool = false,
        incrementKgOverride: Decimal? = nil,
        station: Station? = nil,
        attributes: ExerciseAttributes? = nil
    ) {
        self.id = id
        self.name = name
        self.equipment = equipment
        self.isCompound = isCompound
        self.unilateral = unilateral
        self.incrementKgOverride = incrementKgOverride
        self.station = station
        self.attributes = attributes
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

    /// The same exercise with fewer sets, for a lighter week. Keeps the first
    /// `count` prescriptions, so the heaviest work is what survives.
    public func lightened(setsTo count: Int) -> PlannedExercise {
        guard count > 0, count < sets.count else { return self }
        var copy = self
        copy.sets = Array(sets.prefix(count))
        return copy
    }
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
    /// How many of this set's reps were performed paused.
    ///
    /// A count *inside* `reps`, never beside it: "120 kg × 6, de laatste 2
    /// gepauzeerd" is one set of six reps, two of which carry the pause. It
    /// therefore never adds reps, never adds volume and never adds a set.
    ///
    /// Only a part of the set is ever recorded here. Where every rep was
    /// paused the set simply *is* a paused set, which `modifiers.pauseEnabled`
    /// already says, and `pausedRepsWithin(_:reps:)` drops the count — the
    /// shape the model has always had, so planned paused work keeps its own
    /// series.
    ///
    /// The web app stores the same key but adds it onto `reps`
    /// (`completedReps()`); this port never sums (TRAINING_LOGIC §15 change 2).
    public var pausedReps: Int?
    /// Prescribed by the program, or added during this session. An added set
    /// counts toward volume, history and records like any working set, but
    /// never fills a prescribed slot when progression is judged.
    public var origin: SetOrigin

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
        pausedReps: Int? = nil,
        origin: SetOrigin = .prescribed
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
        self.origin = origin
    }

    private enum CodingKeys: String, CodingKey {
        case id, index, weightKg, reps, rirReported, isWarmup, modifiers, flags
        case substitutedFrom, partialReps, pausedReps, origin
    }

    /// Tolerates sets saved before `origin` existed — every one of those was a
    /// prescribed set. A paused session whose sets failed to decode would not
    /// fail loudly; it would simply not be there to resume.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        index = try container.decode(Int.self, forKey: .index)
        weightKg = try container.decodeIfPresent(Decimal.self, forKey: .weightKg)
        reps = try container.decode(Int.self, forKey: .reps)
        rirReported = try container.decodeIfPresent(Int.self, forKey: .rirReported)
        isWarmup = try container.decode(Bool.self, forKey: .isWarmup)
        modifiers = try container.decode(SetModifiers.self, forKey: .modifiers)
        flags = try container.decode(SetFlags.self, forKey: .flags)
        substitutedFrom = try container.decodeIfPresent(String.self, forKey: .substitutedFrom)
        partialReps = try container.decodeIfPresent(Int.self, forKey: .partialReps)
        pausedReps = try container.decodeIfPresent(Int.self, forKey: .pausedReps)
        origin = try container.decodeIfPresent(SetOrigin.self, forKey: .origin) ?? .prescribed
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

    /// A paused-rep count that means something inside the set holding it: at
    /// least one rep, never more than were performed, and never all of them —
    /// a set where every rep was paused is a paused set, not a partly paused
    /// one, and says so through `modifiers.pauseEnabled`.
    public static func pausedRepsWithin(_ count: Int?, reps: Int) -> Int? {
        guard let count, count > 0, reps > 0 else { return nil }
        let bounded = min(count, reps)
        return bounded == reps ? nil : bounded
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
    /// History shows it for sessions that carry no exact counts.
    public var completion: Int
    public var kind: SessionKind
    public var results: [ExerciseResult]
    /// Wall-clock duration, shown on artboard 17R ("Push A · 53 min · 7 sep").
    /// Absent for every session imported from the web app, which never
    /// recorded one.
    public var durationSeconds: Int?
    public var note: String?
    /// Prescribed working sets, counted when iOS saved the session. Sets added
    /// during the session are not in it. `nil` for every session without an
    /// exact count — the web app's, and older ones — which show `completion`.
    public var plannedSetCount: Int?
    /// How many of those prescribed sets were logged. A logged added set never
    /// raises it, and it is never more than `plannedSetCount`.
    public var completedSetCount: Int?

    public init(
        id: String,
        date: Date,
        dayID: String,
        dayLabel: String,
        completion: Int,
        kind: SessionKind = .workout,
        results: [ExerciseResult],
        durationSeconds: Int? = nil,
        note: String? = nil,
        plannedSetCount: Int? = nil,
        completedSetCount: Int? = nil
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
        self.plannedSetCount = plannedSetCount
        self.completedSetCount = completedSetCount
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
