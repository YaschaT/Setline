import Foundation

/// What to hang on the bar, and what the bar can actually hold.
///
/// Plates come in pairs, so every reachable load is the bar plus twice some
/// sum of plates. The calculator's whole job is to be right about that: it
/// says the closest weight your plates can make, not the weight you asked for.
public enum PlateMath {

    /// The plates the handoff specifies as the default set (artboard 06), in
    /// kilograms, heaviest first. A custom set has nowhere to be stored yet.
    public static let defaultPlates: [Decimal] = [20, 15, 10, 5, 2.5, 1.25]
    public static let defaultBar: Decimal = 20

    public struct Solution: Equatable, Sendable {
        /// Heaviest first, as they go on: `[15, 2.5]`.
        public let perSide: [Decimal]
        /// What that actually weighs, bar included.
        public let total: Decimal
        /// The smallest plate in the rack, when this load does not need it —
        /// the fiddly one you can leave alone.
        public let unused: Decimal?
        /// Whether the bar can make exactly what was asked for.
        public let isExact: Bool

        public init(perSide: [Decimal], total: Decimal, unused: Decimal?, isExact: Bool) {
            self.perSide = perSide
            self.total = total
            self.unused = unused
            self.isExact = isExact
        }
    }

    public static func solve(
        target: Decimal,
        bar: Decimal = defaultBar,
        plates: [Decimal] = defaultPlates
    ) -> Solution {
        let available = plates.filter { $0 > 0 }.sorted(by: >)
        guard let smallest = available.last, target > bar else {
            return Solution(perSide: [], total: max(bar, 0), unused: nil, isExact: target == bar)
        }

        // Only multiples of twice the smallest plate can be reached at all.
        let step = smallest * 2
        let over = target - bar
        let reachable = max(0, Estimates.round(over, toIncrement: step))

        var remaining = reachable / 2
        var perSide: [Decimal] = []
        for plate in available {
            while remaining >= plate {
                perSide.append(plate)
                remaining -= plate
            }
        }

        let total = bar + perSide.reduce(0, +) * 2
        return Solution(
            perSide: perSide,
            total: total,
            unused: perSide.contains(smallest) ? nil : smallest,
            isExact: total == target
        )
    }

    /// The loads around this one that the same plates can make — the row of
    /// nearby weights under the stack.
    public static func nearby(
        target: Decimal,
        bar: Decimal = defaultBar,
        plates: [Decimal] = defaultPlates,
        before: Int = 1,
        after: Int = 2
    ) -> [Decimal] {
        guard let smallest = plates.filter({ $0 > 0 }).min() else { return [] }
        let step = smallest * 2
        let centre = solve(target: target, bar: bar, plates: plates).total
        return (-before...after)
            .map { centre + step * Decimal($0) }
            .filter { $0 >= bar }
    }
}
