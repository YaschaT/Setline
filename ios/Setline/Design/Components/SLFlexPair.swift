import SwiftUI

/// Tiles side by side the way the artboards' CSS `flex: 1` sets them: equal
/// shares, except that no tile goes narrower than its content. 11R's weight
/// tile widens to keep "102,5" at full size and the reps tile beside it gives
/// up the difference; with "50" in it (12) the two are equal.
///
/// When the content cannot fit at all, the tiles fall back to equal shares
/// and their own text scaling takes over.
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
        return widths.reduce(0, +) > available + 0.5 ? equal : widths
    }
}
