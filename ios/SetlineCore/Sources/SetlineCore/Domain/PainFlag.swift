import Foundation

/// Where something is felt. Regions, not diagnoses.
///
/// The list is short on purpose: it exists to reach the `LoadTag`s the
/// ranking can act on, not to build a symptom vocabulary.
public enum PainRegion: String, Codable, Sendable, CaseIterable {
    case shoulder, elbow, upperBack, lowerBack, hip, knee, wrist, other

    public var label: String {
        switch self {
        case .shoulder: return "Schouder"
        case .elbow: return "Elleboog"
        case .upperBack: return "Bovenrug"
        case .lowerBack: return "Onderrug"
        case .hip: return "Heup"
        case .knee: return "Knie"
        case .wrist: return "Handgewricht"
        case .other: return "Elders"
        }
    }

    /// The region as it reads inside a sentence ("met je schouder"). `nil`
    /// for `other`: it has no honest sentence form, and it never narrows a
    /// list, so there is never anything to claim about it.
    public var sentenceName: String? {
        switch self {
        case .shoulder: return "schouder"
        case .elbow: return "elleboog"
        case .upperBack: return "bovenrug"
        case .wrist: return "pols"
        case .lowerBack: return "onderrug"
        case .hip: return "heup"
        case .knee: return "knie"
        case .other: return nil
        }
    }

    /// The positions and loads this region makes worth avoiding. Empty for
    /// regions the attribute model has no tag for — the flag is still stored,
    /// it simply does not narrow the list.
    public var loadTags: Set<LoadTag> {
        switch self {
        case .shoulder: return [.endRangeShoulder, .overheadPosition]
        case .elbow: return [.elbowCompression]
        case .wrist: return [.wristExtension]
        case .lowerBack: return [.axialSpinalLoad, .lumbarFlexion]
        case .knee: return [.deepKneeFlexion]
        // No attribute tag speaks for these yet: the flag is still stored, it
        // simply does not narrow the list.
        case .upperBack, .hip, .other: return []
        }
    }
}

/// The second and last question. Optional, like the first.
public enum PainTiming: String, Codable, Sendable, CaseIterable {
    case duringSet, afterTraining, outsideTheGym

    public var label: String {
        switch self {
        case .duringSet: return "Tijdens de beweging"
        case .afterTraining: return "Na de training"
        case .outsideTheGym: return "De hele tijd"
        }
    }

    /// The one checked signal that earns the follow-up line. Nothing else in
    /// the flow escalates, and even this names no condition.
    public var warrantsFollowUp: Bool { self == .outsideTheGym }
}

/// A note that something was felt, on one exercise, on one day.
///
/// Not a health record. It stores a region, a date and an exercise, it is
/// individually deletable, and it expires — §14: a flag is re-confirmed, not
/// accumulated.
public struct PainFlag: Codable, Hashable, Identifiable, Sendable {
    public var region: PainRegion
    public var timing: PainTiming?
    public var exerciseID: String
    public var date: Date

    public var id: String { "\(exerciseID)|\(region.rawValue)|\(LegacyAdapter.isoString(date))" }

    public init(region: PainRegion, timing: PainTiming? = nil, exerciseID: String, date: Date = Date()) {
        self.region = region
        self.timing = timing
        self.exerciseID = exerciseID
        self.date = date
    }

    public static let lifetimeDays = 14

    public func isActive(on day: Date = Date()) -> Bool {
        guard let expiry = Calendar.current.date(byAdding: .day, value: Self.lifetimeDays, to: date) else { return false }
        return day < expiry
    }

    public func daysRemaining(on day: Date = Date()) -> Int {
        let elapsed = Calendar.current.dateComponents([.day], from: date, to: day).day ?? 0
        return max(0, Self.lifetimeDays - elapsed)
    }
}

public extension Collection where Element == PainFlag {
    func active(on day: Date = Date()) -> [PainFlag] {
        filter { $0.isActive(on: day) }
    }

    /// Everything the ranking should avoid right now. Flags on any exercise
    /// count: a shoulder is a shoulder whichever lift found it.
    func activeLoadTags(on day: Date = Date()) -> Set<LoadTag> {
        active(on: day).reduce(into: Set<LoadTag>()) { $0.formUnion($1.region.loadTags) }
    }

    func active(forExercise id: String, on day: Date = Date()) -> [PainFlag] {
        active(on: day).filter { $0.exerciseID == id }
    }
}
