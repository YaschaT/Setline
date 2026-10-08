import Foundation

/// How long the account has been lifting, which sets how fast progression is
/// proposed (artboard 04).
public enum Experience: String, CaseIterable, Sendable {
    case session
    case week
    case block

    public var title: String {
        switch self {
        case .session: return "Less than a year"
        case .week: return "1 to 4 years"
        case .block: return "More than 4 years"
        }
    }

    public var detail: String {
        switch self {
        case .session: return "Progress per session"
        case .week: return "Progress per week"
        case .block: return "Progress per block, RPE input on"
        }
    }

    /// The consequence line: what this answer produces, said before it is made.
    public var consequence: String {
        switch self {
        case .session: return "Progress per session: all reps done means heavier next session."
        case .week: return "Progress per week: all reps done means heavier next week."
        case .block: return "Progress per block: you stay at a weight and RPE decides when it goes up."
        }
    }
}

/// What is on the rack, which is what the plate calculator can make
/// (artboard 06). Kilograms, per plate, heaviest first.
public struct PlateInventory: Equatable, Sendable {
    public let plates: [Decimal]
    public let barKg: Decimal

    public init(plates: [Decimal], barKg: Decimal) {
        self.plates = plates.filter { $0 > 0 }.sorted(by: >)
        self.barKg = barKg
    }

    public static let `default` = PlateInventory(plates: PlateMath.defaultPlates, barKg: PlateMath.defaultBar)

    /// Every plate the intake offers, whether or not this gym has it.
    public static let offered: [Decimal] = [20, 15, 10, 5, 2.5, 1.25, 0.5]

    /// The smallest change the bar can make: a pair of the smallest plate.
    public var smallestJump: Decimal? {
        plates.last.map { $0 * 2 }
    }
}
