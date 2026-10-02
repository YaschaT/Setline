import SwiftUI

/// Chips that wrap, as the handoff draws them on artboard 06 — a row until the
/// line is full, then the next line. Nothing scrolls off the edge.
struct SLFlow: Layout {
    var spacing: CGFloat = SL.Space.s2
    /// Between the lines, where that differs from between the items — the
    /// day card's meta wraps at 4 under a 12 column gap.
    var lineSpacing: CGFloat? = nil

    private var rowGap: CGFloat { lineSpacing ?? spacing }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let rows = rows(of: subviews, within: width)
        let height = rows.reduce(0) { $0 + $1.height } + rowGap * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(of: subviews, within: bounds.width) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(
                    at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                    proposal: ProposedViewSize(size)
                )
                x += size.width + spacing
            }
            y += row.height + rowGap
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func rows(of subviews: Subviews, within width: CGFloat) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            if !row.indices.isEmpty, needed > width {
                rows.append(row)
                row = Row()
            }
            row.width = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
        }
        if !row.indices.isEmpty { rows.append(row) }
        return rows
    }
}

/// Controls side by side in stated proportions, the way the design's CSS
/// `flex` sets them: "−30s" and "+30s" at 1, "3:00 vast" at 1.4, and the skip
/// button at its own width. A weight of 0 keeps a control at its ideal size.
struct SLWeightedRow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let widths = columnWidths(total: proposal.width, subviews: subviews)
        let height = zip(subviews, widths)
            .map { $0.sizeThatFits(ProposedViewSize(width: $1, height: nil)).height }
            .max() ?? 0
        let width = proposal.width ?? (widths.reduce(0, +) + gaps(subviews))
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        for (subview, width) in zip(subviews, columnWidths(total: bounds.width, subviews: subviews)) {
            subview.place(
                at: CGPoint(x: x, y: bounds.midY),
                anchor: .leading,
                proposal: ProposedViewSize(width: width, height: bounds.height)
            )
            x += width + spacing
        }
    }

    private func gaps(_ subviews: Subviews) -> CGFloat {
        spacing * CGFloat(max(0, subviews.count - 1))
    }

    private func columnWidths(total: CGFloat?, subviews: Subviews) -> [CGFloat] {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }
        guard let total else { return ideal }
        let weights = subviews.map { $0[SLWeightKey.self] }
        let fixed = zip(ideal, weights).reduce(CGFloat(0)) { $0 + ($1.1 == 0 ? $1.0 : 0) }
        let shared = max(0, total - gaps(subviews) - fixed)
        let sum = weights.reduce(0, +)
        return zip(ideal, weights).map { width, weight in
            weight == 0 || sum == 0 ? width : shared * weight / sum
        }
    }
}

private struct SLWeightKey: LayoutValueKey {
    static let defaultValue: CGFloat = 1
}

extension View {
    /// This control's share of an `SLWeightedRow`; 0 keeps its own width.
    func slWeight(_ weight: CGFloat) -> some View {
        layoutValue(key: SLWeightKey.self, value: weight)
    }
}
