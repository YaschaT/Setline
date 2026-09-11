import Foundation

/// The role a planned exercise plays in its session.
///
/// Role is load-bearing, not descriptive: addendum 13R derives the rest
/// prescription from it, and TRAINING_LOGIC §3.2 selects the progression rule
/// from it. Every planned exercise must carry one.
public enum ExerciseRole: String, Codable, Sendable, CaseIterable {
    case primaryStrength
    case secondaryCompound
    case accessory
    case isolation
}

/// Smallest real-world load step, per TRAINING_LOGIC §3.3.
///
/// Defaults only. The increment table is per user, per gym and editable —
/// "a wrong increment silently sabotages every progression decision".
public enum Equipment: String, Codable, Sendable, CaseIterable {
    case barbell
    case dumbbell
    case machinePlate
    case machineSelectorised
    case cable
    case smith
    case bodyweight
    case band

    /// Default increment in kilograms, before any per-gym override.
    public var defaultIncrementKg: Decimal {
        switch self {
        case .barbell, .smith: return 2.5
        case .dumbbell: return 2
        case .machinePlate: return 5
        case .machineSelectorised, .cable: return 5
        case .bodyweight: return 1.25
        case .band: return 0
        }
    }
}

/// Modifiers that change what a set *is*, and therefore what it may be
/// compared against. TRAINING_LOGIC §1: two sets are comparable only when
/// exerciseId, modifiers and unilateral all match.
public struct SetModifiers: Codable, Hashable, Sendable {
    public var pauseEnabled: Bool
    public var pauseSeconds: Double?
    public var restrictedROM: Bool

    public init(pauseEnabled: Bool = false, pauseSeconds: Double? = nil, restrictedROM: Bool = false) {
        self.pauseEnabled = pauseEnabled
        self.pauseSeconds = pauseSeconds
        self.restrictedROM = restrictedROM
    }

    public static let none = SetModifiers()

    /// §9.2: a paused set is only ever compared to other paused sets of the
    /// same exercise with the same pause length, ±0.5 s.
    public func isComparable(to other: SetModifiers) -> Bool {
        guard pauseEnabled == other.pauseEnabled, restrictedROM == other.restrictedROM else { return false }
        guard pauseEnabled else { return true }
        let a = pauseSeconds ?? 0
        let b = other.pauseSeconds ?? 0
        return abs(a - b) <= 0.5
    }
}

/// Flags a logged set can carry. Deliberately not an error state: a failed
/// set is a fact about the set, not a failure of the user.
public struct SetFlags: OptionSet, Codable, Hashable, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }

    public static let failed = SetFlags(rawValue: 1 << 0)
    public static let partialReps = SetFlags(rawValue: 1 << 1)
    public static let technicalBreakdown = SetFlags(rawValue: 1 << 2)
}

/// The five kinds of set the design distinguishes (addendum 16R).
///
/// Warm-up, PR, failed, paused and partial are five different things; the
/// last two share amber but are never the same row state.
public enum SetKind: String, Sendable {
    case warmup
    case working
}
