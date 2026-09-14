import Foundation

/// One exercise standing in for another, for one session only.
///
/// TRAINING_LOGIC §12.5: the sets belong to the substitute's series for
/// progression, trend and records — never the origin's. The origin's
/// progression state freezes for that occurrence: not advanced, not reset,
/// and no penalty for the session it sat out.
public struct Substitution: Codable, Hashable, Sendable {
    public var originExerciseID: String
    public var substituteExerciseID: String
    public var reason: SwapReason
    public var date: Date

    public init(originExerciseID: String, substituteExerciseID: String, reason: SwapReason, date: Date = Date()) {
        self.originExerciseID = originExerciseID
        self.substituteExerciseID = substituteExerciseID
        self.reason = reason
        self.date = date
    }
}

/// How far a permanent replacement reaches (artboard 15Rb).
///
/// `always` rewrites every future occurrence across every plan, which is why
/// it is the one scope that needs the clearest confirmation in the app.
public enum ReplacementScope: String, Codable, Sendable, CaseIterable {
    case thisDay
    case thisPlan
    case always

    public var label: String {
        switch self {
        case .thisDay: return "Alleen deze dag"
        case .thisPlan: return "Dit schema"
        case .always: return "Alle keren"
        }
    }

    public var detail: String {
        switch self {
        case .thisDay: return "Alleen op deze trainingsdag."
        case .thisPlan: return "Overal in dit schema."
        case .always: return "Ook in schema's waar je later naar wisselt."
        }
    }
}

/// A replacement written into the program, as opposed to a swap for today.
///
/// This is also the audit record: what was replaced, by what, how far the
/// change reached and when. Nothing about a permanent replacement is carried
/// on the logged sets — `substitutedFrom` means "standing in for something
/// else today", which a program change is not.
public struct ProgramReplacement: Codable, Hashable, Identifiable, Sendable {
    public var originExerciseID: String
    public var substituteExerciseID: String
    public var scope: ReplacementScope
    /// The day the replacement was made on, which `thisDay` is scoped to.
    public var dayID: String
    public var date: Date

    public init(
        originExerciseID: String,
        substituteExerciseID: String,
        scope: ReplacementScope,
        dayID: String,
        date: Date = Date()
    ) {
        self.originExerciseID = originExerciseID
        self.substituteExerciseID = substituteExerciseID
        self.scope = scope
        self.dayID = dayID
        self.date = date
    }

    /// Identity is the change itself, not the instant it was made.
    ///
    /// Dates lose sub-second precision on the way through the state blob, so
    /// a decoded record never compares equal to the one held in memory —
    /// which silently turned "undo" into a no-op that left the program
    /// changed while the screen said otherwise.
    public var id: String {
        [originExerciseID, substituteExerciseID, scope.rawValue, dayID].joined(separator: "|")
    }

    public func applies(toDay day: String) -> Bool {
        switch scope {
        case .thisDay: return day == dayID
        case .thisPlan, .always: return true
        }
    }
}

/// An exercise the user typed in themselves.
///
/// Deliberately thin: a name, and optionally what it is loaded with. No
/// ranking metadata — a custom exercise is never a recommendation source, it
/// is somewhere to put honest work the catalogue has no name for. It goes
/// straight to calibration, because by definition it has no history.
public struct CustomExercise: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var equipment: Equipment
    public var isCompound: Bool
    public var createdAt: Date

    public init(
        id: String? = nil,
        name: String,
        equipment: Equipment = .machineSelectorised,
        isCompound: Bool = false,
        createdAt: Date = Date()
    ) {
        self.id = id ?? Self.identifier(for: name)
        self.name = name
        self.equipment = equipment
        self.isCompound = isCompound
        self.createdAt = createdAt
    }

    /// Namespaced so a custom exercise can never collide with a catalogue id
    /// and quietly inherit its history.
    public static func identifier(for name: String) -> String {
        let slug = name.lowercased()
            .map { $0.isLetter || $0.isNumber ? $0 : "-" }
            .reduce(into: "") { result, character in
                if character == "-", result.hasSuffix("-") { return }
                result.append(character)
            }
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return "custom:\(slug.isEmpty ? "oefening" : slug)"
    }

    public var exercise: Exercise {
        Exercise(id: id, name: name, equipment: equipment, isCompound: isCompound)
    }

    public static func isCustom(_ id: String) -> Bool { id.hasPrefix("custom:") }
}
