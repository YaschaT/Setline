import SwiftUI

/// Tiles side by side the way the artboards' CSS `flex: 1` sets them: equal
/// shares, except that no tile goes narrower than its content. 11R's weight
/// tile widens to keep "102,5" at full size and the reps tile beside it gives
/// up the difference; with "50" in it (12) the two are equal.
///
/// When the contents together are wider than the row — "102,5" beside a rep
/// count on a 390pt phone — each tile keeps what it cannot give up, its
/// padding and buttons, and the rest of the row is shared in proportion to
/// what each value asks for. The wider value stays in the wider tile, and its
/// own text scaling covers the few points it lacks. Equal shares cut "102,5"
/// to "10…" there.
struct SLFlexPair: Layout {
    var spacing: CGFloat = SL.Space.s2

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let total = proposal.width else {
            let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
            return CGSize(
                width: sizes.reduce(0) { $0 + $1.width } + gaps(subviews),
                height: sizes.map(\.height).max() ?? 0
            )
        }
        let widths = columnWidths(total: total, subviews: subviews)
        let height = zip(subviews, widths)
            .map { $0.sizeThatFits(ProposedViewSize(width: $1, height: nil)).height }
            .max() ?? 0
        return CGSize(width: total, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        for (subview, width) in zip(subviews, columnWidths(total: bounds.width, subviews: subviews)) {
            subview.place(
                at: CGPoint(x: x, y: bounds.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: width, height: bounds.height)
            )
            x += width + spacing
        }
    }

    private func gaps(_ subviews: Subviews) -> CGFloat {
        spacing * CGFloat(max(0, subviews.count - 1))
    }

    private func columnWidths(total: CGFloat, subviews: Subviews) -> [CGFloat] {
        guard !subviews.isEmpty else { return [] }
        let available = max(0, total - gaps(subviews))
        let equal = Array(repeating: available / CGFloat(subviews.count), count: subviews.count)
        let content = subviews.map { $0.sizeThatFits(.unspecified).width }

        // A tile whose content needs more than its share keeps its content
        // width; the others divide what is left, until nobody needs more.
        var widths = equal
        var held = Set<Int>()
        while true {
            let open = subviews.indices.filter { !held.contains($0) }
            guard !open.isEmpty else { break }
            let left = available - held.reduce(0) { $0 + widths[$1] }
            let share = left / CGFloat(open.count)
            let growing = open.filter { content[$0] > share }
            if growing.isEmpty {
                for index in open { widths[index] = share }
                break
            }
            for index in growing {
                widths[index] = content[index]
                held.insert(index)
            }
        }
        guard widths.reduce(0, +) > available + 0.5 else { return widths }

        let floors = subviews.map { $0.sizeThatFits(ProposedViewSize(width: 0, height: nil)).width }
        let asks = zip(content, floors).map { max(0, $0 - $1) }
        let room = available - floors.reduce(0, +)
        let asked = asks.reduce(0, +)
        guard room > 0, asked > 0 else { return equal }
        return zip(floors, asks).map { $0 + $1 * min(1, room / asked) }
    }
}
