import Foundation

/// One thing iOS changed in the shared state, recorded instead of a copy.
///
/// iOS never pushes its whole copy of the state: a copy is stale the moment
/// the web app writes. Each save becomes a `StateChange`, kept on the device
/// until the account has it, and `StateMerge` replays the pending changes onto
/// whatever is stored when the sync runs. Every change says exactly what it
/// touches, so nothing it does not mention can be lost by applying it.
public struct StateChange: Codable, Hashable, Identifiable, Sendable {

    public enum Kind: Hashable, Sendable {
        /// A finished or re-logged session, as iOS writes it.
        case upsertSession(JSONValue)
        /// The paused workout, or `.null` to clear it explicitly.
        case setActiveSession(JSONValue)
        case addPainFlag(PainFlag)
        case removePainFlag(id: String)
        case addProgramReplacement(ProgramReplacement)
        case removeProgramReplacement(id: String)
        case addCustomExercise(CustomExercise)
        case hideWarmup(exerciseID: String)
        /// One date of the schedule, scoped per program (`personal:2026-09-17`).
        case setScheduleDay(key: String, dayID: String)
        /// Explicitly back to the program's default week for that date.
        case removeScheduleOverride(key: String)
        /// One meal, by its own id.
        case upsertNutritionEntry(JSONValue)
        case removeNutritionEntry(id: String)
        /// One nutrition target, by field.
        case setTarget(field: String, value: Decimal)
        case setProgram(mode: String, sciencePlanID: String?)
    }

    /// Identifies the change itself, so a sync can clear exactly the changes
    /// it wrote and keep any made while it ran.
    public let id: UUID
    /// When the user made the change. A change older than a deletion or a
    /// reset of the same data loses to it.
    public let createdAt: Date
    public let kind: Kind

    public init(_ kind: Kind, createdAt: Date = Date(), id: UUID = UUID()) {
        self.id = id
        self.createdAt = createdAt
        self.kind = kind
    }

    public static func upsert(_ session: TrainingSession, createdAt: Date = Date()) -> StateChange {
        StateChange(.upsertSession(JSONValue(session: session)), createdAt: createdAt)
    }

    public static func activeSession(_ snapshot: ActiveSessionSnapshot?, createdAt: Date = Date()) -> StateChange {
        let value = snapshot.flatMap { LegacyAdapter.jsonValue($0) } ?? .null
        return StateChange(.setActiveSession(value), createdAt: createdAt)
    }

    // MARK: Coding
    //
    // The same shape the shared fixtures in `tests/fixtures/sync` use, so the
    // iOS tests read the web tests' scenarios directly.

    private enum CodingKeys: String, CodingKey {
        case id, createdAt, kind, session, snapshot, flag, replacement, exercise, exerciseID, targetID
        case scheduleKey, dayID, entry, field, value, mode, sciencePlanID
    }

    private enum KindName: String, Codable {
        case upsertSession, setActiveSession, addPainFlag, removePainFlag
        case addProgramReplacement, removeProgramReplacement, addCustomExercise, hideWarmup
        case setScheduleDay, removeScheduleOverride, upsertNutritionEntry, removeNutritionEntry, setTarget
        case setProgram
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        switch try container.decode(KindName.self, forKey: .kind) {
        case .upsertSession:
            kind = .upsertSession(try container.decode(JSONValue.self, forKey: .session))
        case .setActiveSession:
            kind = .setActiveSession(try container.decodeIfPresent(JSONValue.self, forKey: .snapshot) ?? .null)
        case .addPainFlag:
            kind = .addPainFlag(try container.decode(PainFlag.self, forKey: .flag))
        case .removePainFlag:
            kind = .removePainFlag(id: try container.decode(String.self, forKey: .targetID))
        case .addProgramReplacement:
            kind = .addProgramReplacement(try container.decode(ProgramReplacement.self, forKey: .replacement))
        case .removeProgramReplacement:
            kind = .removeProgramReplacement(id: try container.decode(String.self, forKey: .targetID))
        case .addCustomExercise:
            kind = .addCustomExercise(try container.decode(CustomExercise.self, forKey: .exercise))
        case .hideWarmup:
            kind = .hideWarmup(exerciseID: try container.decode(String.self, forKey: .exerciseID))
        case .setScheduleDay:
            kind = .setScheduleDay(
                key: try container.decode(String.self, forKey: .scheduleKey),
                dayID: try container.decode(String.self, forKey: .dayID)
            )
        case .removeScheduleOverride:
            kind = .removeScheduleOverride(key: try container.decode(String.self, forKey: .scheduleKey))
        case .upsertNutritionEntry:
            kind = .upsertNutritionEntry(try container.decode(JSONValue.self, forKey: .entry))
        case .removeNutritionEntry:
            kind = .removeNutritionEntry(id: try container.decode(String.self, forKey: .targetID))
        case .setTarget:
            kind = .setTarget(
                field: try container.decode(String.self, forKey: .field),
                value: try container.decode(Decimal.self, forKey: .value)
            )
        case .setProgram:
            kind = .setProgram(
                mode: try container.decode(String.self, forKey: .mode),
                sciencePlanID: try container.decodeIfPresent(String.self, forKey: .sciencePlanID)
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(createdAt, forKey: .createdAt)
        switch kind {
        case .upsertSession(let session):
            try container.encode(KindName.upsertSession, forKey: .kind)
            try container.encode(session, forKey: .session)
        case .setActiveSession(let snapshot):
            try container.encode(KindName.setActiveSession, forKey: .kind)
            try container.encode(snapshot, forKey: .snapshot)
        case .addPainFlag(let flag):
            try container.encode(KindName.addPainFlag, forKey: .kind)
            try container.encode(flag, forKey: .flag)
        case .removePainFlag(let flagID):
            try container.encode(KindName.removePainFlag, forKey: .kind)
            try container.encode(flagID, forKey: .targetID)
        case .addProgramReplacement(let replacement):
            try container.encode(KindName.addProgramReplacement, forKey: .kind)
            try container.encode(replacement, forKey: .replacement)
        case .removeProgramReplacement(let replacementID):
            try container.encode(KindName.removeProgramReplacement, forKey: .kind)
            try container.encode(replacementID, forKey: .targetID)
        case .addCustomExercise(let exercise):
            try container.encode(KindName.addCustomExercise, forKey: .kind)
            try container.encode(exercise, forKey: .exercise)
        case .hideWarmup(let exerciseID):
            try container.encode(KindName.hideWarmup, forKey: .kind)
            try container.encode(exerciseID, forKey: .exerciseID)
        case .setScheduleDay(let key, let dayID):
            try container.encode(KindName.setScheduleDay, forKey: .kind)
            try container.encode(key, forKey: .scheduleKey)
            try container.encode(dayID, forKey: .dayID)
        case .removeScheduleOverride(let key):
            try container.encode(KindName.removeScheduleOverride, forKey: .kind)
            try container.encode(key, forKey: .scheduleKey)
        case .upsertNutritionEntry(let entry):
            try container.encode(KindName.upsertNutritionEntry, forKey: .kind)
            try container.encode(entry, forKey: .entry)
        case .removeNutritionEntry(let entryID):
            try container.encode(KindName.removeNutritionEntry, forKey: .kind)
            try container.encode(entryID, forKey: .targetID)
        case .setTarget(let field, let value):
            try container.encode(KindName.setTarget, forKey: .kind)
            try container.encode(field, forKey: .field)
            try container.encode(value, forKey: .value)
        case .setProgram(let mode, let sciencePlanID):
            try container.encode(KindName.setProgram, forKey: .kind)
            try container.encode(mode, forKey: .mode)
            try container.encodeIfPresent(sciencePlanID, forKey: .sciencePlanID)
        }
    }

    /// How pending changes are stored on the device.
    public static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    public static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
