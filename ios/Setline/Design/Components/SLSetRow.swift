import SwiftUI
import UIKit
import SetlineCore

/// Column geometry, from addendum 16R. Every set grid uses these widths so
/// the columns line up between the header and the rows.
enum SLSetColumn {
    /// The artboard's widths, held fixed on purpose.
    ///
    /// Scaling them with the text size starves the flexible weight column —
    /// at accessibility sizes it collapsed to nothing. These four hold short
    /// content ("1", "8", "+2,5"), so the type inside them shrinks a little
    /// instead, and the weight, which is the number the screen exists for,
    /// keeps the remaining width.
    static let index: CGFloat = 32
    static let reps: CGFloat = 44
    static let delta: CGFloat = 76
    static let dot: CGFloat = 24
    static let rowInset: CGFloat = 14
    static let rowGap: CGFloat = 6
}

/// The set grid's container: radius 22, `raised`, hairline, 8pt of padding,
/// with the rows nested inside at radius 12 — the concentric rule.
///
/// A `nil` label drops the column header, as artboard 28 does before the
/// calibration set: there is nothing yet for the columns to compare.
struct SLSetGrid<Content: View>: View {
    let referenceLabel: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) {
            if let referenceLabel { header(referenceLabel) }
            content
        }
        .padding(8)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: 1)
        )
    }

    private func headerCell(_ text: String) -> some View {
        Text(text)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }

    private func header(_ referenceLabel: String) -> some View {
        HStack(spacing: 0) {
            headerCell("SET").frame(width: SLSetColumn.index, alignment: .leading)
            headerCell("GEWICHT").frame(maxWidth: .infinity, alignment: .leading)
            headerCell("REPS").frame(width: SLSetColumn.reps, alignment: .trailing)
            headerCell(referenceLabel.uppercased())
                .frame(width: SLSetColumn.delta + SLSetColumn.dot, alignment: .trailing)
        }
        // Capped: the labels sit in fixed columns, and a header spilling into
        // the next column is worse than one that stays a little smaller. The
        // values below scale without limit.
        .font(.slCapped(SL.TypeSize.micro, SL.Weight.medium, maxScale: 1.1))
        .foregroundStyle(SL.Ink.tertiary)
        .padding(.top, 6)
        .padding(.horizontal, SLSetColumn.rowInset)
        .padding(.bottom, 10)
        .accessibilityHidden(true)
    }
}

/// The set row: 56 high, the whole width a tap target.
///
/// Five slots — index, weight, reps, the "VS <date>" delta, and a status dot
/// whose colour carries the meaning. A warm-up row is a different shape
/// entirely: 48 high, dashed, and it gets no status dot.
struct SLSetRow: View {
    let row: SetRowPresentation
    let onTap: () -> Void

    var body: some View {
        // A warm-up row is a reference strip, not a control (30), so it is
        // drawn plainly: a disabled button would fade it below `text2`.
        if row.isWarmup {
            rowContent
                .accessibilityElement(children: .combine)
                .accessibilityLabel(accessibilityText)
        } else {
            Button(action: onTap) { rowContent }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(accessibilityText)
        }
    }

    private var rowContent: some View {
            HStack(spacing: 0) {
                Text(row.indexLabel)
                    .font(.sl(row.isWarmup ? SL.TypeSize.meta : SL.TypeSize.body, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.tertiary)
                    .frame(width: SLSetColumn.index, alignment: .leading)

                Text(row.weightLabel)
                    .font(weightFont)
                    .slNumerals()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(weightColor)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text(row.repsLabel)
                    .font(.sl(row.isWarmup ? SL.TypeSize.lead : SL.TypeSize.title, row.isWarmup ? SL.Weight.medium : SL.Weight.semibold))
                    .slNumerals()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(repsColor)
                    .frame(width: SLSetColumn.reps, alignment: .trailing)

                if !row.isWarmup {
                    deltaView
                        .frame(width: SLSetColumn.delta, alignment: .trailing)

                    HStack {
                        Spacer(minLength: 0)
                        if let tone = dotColor {
                            Circle().fill(tone).frame(width: 10, height: 10)
                        }
                    }
                    .frame(width: SLSetColumn.dot)
                }
            }
            .padding(.horizontal, SLSetColumn.rowInset)
            .frame(minHeight: row.isWarmup ? 48 : SL.Metric.setRowHeight)
            // A warm-up row is dashed in every state, so its border adds to it
            // (30: 50 tall). A work row is bordered only while it is up next;
            // that edge draws inside, so the row does not grow when its turn
            // comes.
            .padding(row.isWarmup ? SL.Metric.border : 0)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .fill(fill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                    .strokeBorder(
                        borderColor,
                        style: StrokeStyle(lineWidth: 1, dash: row.isWarmup ? [4, 4] : [])
                    )
            )
    }

    private var repsColor: Color {
        if row.isWarmup { return SL.Ink.secondary }
        // 16R and the live 11–13 keep a PR row's reps white: the lime is in
        // the `PR` marker and its dot, stated once. (Review 04 had proposed
        // lime reps; the main file did not take it.)
        if row.status == .written { return SL.Ink.primary }
        // 28: on the row up next, the target is the number to read.
        return row.repsIsTarget && row.status == .nextUp ? SL.Ink.primary : SL.Ink.tertiary
    }

    /// "volgt uit set 1" is a sentence, not a value, and 28 sets it as one.
    private var weightFont: Font {
        if row.isWarmup { return .sl(SL.TypeSize.lead, SL.Weight.medium) }
        if row.weightKind == .awaitingCalibration { return .sl(SL.TypeSize.body, SL.Weight.regular) }
        return .sl(SL.TypeSize.title, SL.Weight.semibold)
    }

    /// The component sheet: a pending row's weight waits in tertiary; the row
    /// up next and a written row carry it in full.
    private var weightColor: Color {
        if row.isWarmup { return SL.Ink.secondary }
        if row.weightKind != .value || row.status == .pending { return SL.Ink.tertiary }
        return SL.Ink.primary
    }

    /// Pending rows stay on the grid's own `raised` surface; only the row up
    /// next and the rows already written are lifted to raised2.
    private var fill: Color {
        if row.isWarmup { return .clear }
        return row.status == .pending ? SL.Surface.raised : SL.Surface.raised2
    }

    /// Only the row up next is outlined. 28b, 29 and 30 — the addenda that
    /// replace the live 11–13 — draw the rows still to come as bare raised
    /// surfaces, like the ones already written.
    private var borderColor: Color {
        if row.isWarmup { return SL.Surface.hairlineStrong }
        switch row.status {
        case .nextUp: return SL.Surface.selection
        case .pending, .written, .warmup: return .clear
        }
    }

    private var toneColor: Color? {
        switch row.delta {
        case .personalRecord: return SL.Signal.action
        case .failed: return SL.Signal.loss
        // 16R keeps one amber for both. They are told apart by their words and
        // by the partial count, never by colour.
        case .paused, .partial, .pausedAndPartial: return SL.Signal.attention
        default: return nil
        }
    }

    private var dotColor: Color? { toneColor }

    @ViewBuilder
    private var deltaView: some View {
        switch row.delta {
        case .reference(let text):
            Text(text).slMeta().slNumerals()
                .foregroundStyle(SL.Ink.tertiary)
                .lineLimit(1).minimumScaleFactor(0.7)
        case .difference(let text):
            Text(text)
                .slMeta(SL.Weight.semibold).slNumerals()
                .foregroundStyle(text.hasPrefix("−") ? SL.Ink.secondary : SL.Signal.action)
                .lineLimit(1).minimumScaleFactor(0.7)
        case .personalRecord:
            marker("PR")
        case .failed:
            marker("mislukt")
        case .paused(let reps):
            // "2 pauze-reps" where only some of them were: the count is part
            // of the set, so the column says which reps it describes.
            marker(reps.map { "\($0) pauze-reps" } ?? "met pauze")
        case .partial(let count):
            marker("partieel +\(count)")
        case .pausedAndPartial(let pausedReps, let count):
            // Two true things about one set. The column wraps rather than
            // dropping either, and stays at the 12pt floor.
            marker("\(pausedReps.map { "\($0) pauze-reps" } ?? "met pauze") · partieel +\(count)", lines: 2)
        case .calibration:
            Text("kalibratie")
                .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                .foregroundStyle(SL.Ink.tertiary)
                .lineLimit(1).minimumScaleFactor(0.7)
        case .baseline:
            Text("basis")
                .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                .foregroundStyle(SL.Ink.tertiary)
                .lineLimit(1).minimumScaleFactor(0.7)
        case .reserve(let rir):
            Text("RIR \(rir)")
                .slMeta().slNumerals()
                .foregroundStyle(SL.Ink.secondary)
                .lineLimit(1).minimumScaleFactor(0.7)
        case .added:
            // Quiet on purpose: the row is an ordinary working set, and says
            // where it came from only where nothing else needs the column.
            Text("extra")
                .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                .foregroundStyle(SL.Ink.tertiary)
                .lineLimit(1).minimumScaleFactor(0.7)
        case .none:
            EmptyView()
        }
    }

    private func marker(_ text: String, lines: Int = 1) -> some View {
        Text(text)
            .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
            .foregroundStyle(toneColor ?? SL.Ink.tertiary)
            .multilineTextAlignment(.trailing)
            .lineLimit(lines)
            .minimumScaleFactor(0.85)
    }

    /// "Set 2, 50 kilogram, 8 reps, plus 2,5 vergeleken met vorige sessie"
    private var accessibilityText: String {
        // An added set says so whatever its delta column shows.
        let name = row.isWarmup ? "Opwarmset" : (row.isAdded ? "Extra set" : "Set")
        var parts = ["\(name) \(row.indexLabel)", row.weightLabel]
        if row.status == .written || row.isWarmup { parts.append("\(row.repsLabel) reps") }
        switch row.delta {
        case .reference(let text): parts.append("vorige keer \(text)")
        case .difference(let text): parts.append("\(text) vergeleken met vorige sessie")
        case .personalRecord: parts.append("persoonlijk record")
        case .failed: parts.append("mislukte set")
        case .paused(let reps): parts.append(reps.map { "\($0) reps met pauze" } ?? "set met pauze")
        case .partial(let count): parts.append("\(count) partiële reps")
        case .pausedAndPartial(let pausedReps, let count):
            parts.append("\(pausedReps.map { "\($0) reps met pauze" } ?? "set met pauze"), \(count) partiële reps")
        case .calibration: parts.append("kalibratieset")
        case .baseline: parts.append("basis voor deze oefening")
        case .reserve(let rir): parts.append("RIR \(rir)")
        case .added: parts.append("alleen voor deze sessie")
        case .none: break
        }
        return parts.joined(separator: ", ")
    }
}
