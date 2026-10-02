import SwiftUI
import SetlineCore

/// Redesign 1b · "Schijven per kant".
///
/// Reached from the input card, and it answers one question: what goes on
/// each side. One side of the bar is drawn from the answer, the same answer is
/// written out under it, and where the asked-for weight is not something these
/// plates can make, it says the closest they can — being right is the entire
/// point of the screen.
///
/// The plates are the account's own rack. The bar can be tried at another
/// weight here; that changes the reckoning on this sheet and nothing else.
struct PlateSheet: View {
    let exercise: String
    let setNumber: Int
    let reps: Int
    let target: Decimal
    let onChoose: (Decimal) -> Void
    let onClose: () -> Void

    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    /// The sheet hugs its content; the detent follows what was laid out.
    @State private var contentHeight: CGFloat = 400
    /// The bar the plates are reckoned against. Opens on the account's own.
    @State private var chosenBar: Decimal?

    private let display = NumberDisplay.dutch

    private var rack: PlateInventory { app.plateInventory }
    private var bar: Decimal { chosenBar ?? rack.barKg }

    private var solution: PlateMath.Solution {
        PlateMath.solve(target: target, bar: bar, plates: rack.plates)
    }

    /// The account's bar, and the other one a gym usually has.
    private var bars: [Decimal] {
        var options = [rack.barKg]
        for common in [Decimal(20), Decimal(15)] where !options.contains(common) && options.count < 2 {
            options.append(common)
        }
        return options
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Which set this is stays on the session behind the sheet.
            // VoiceOver still hears it first.
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                Text("Schijven per kant")
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: SL.Space.s2)
                Text("stang \(display.kg(bar)) · \(display.kg(target)) totaal")
                    .slMeta().slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .multilineTextAlignment(.trailing)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(exercise), set \(setNumber), \(display.kg(target)) × \(reps). Schijven per kant, stang \(display.kg(bar))")

            stack.padding(.top, SL.Space.s4)

            Text(perSide)
                .slBody().slNumerals()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s3)

            if !solution.isExact || target <= bar {
                Text(footnote)
                    .slMeta().slNumerals()
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.top, SL.Space.s1)
            }

            nearby.padding(.top, 14)

            barChoice.padding(.top, SL.Space.s2)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s4)
        .padding(.bottom, SL.Space.s2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        .background(SL.Surface.raised)
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.height(contentHeight), .large])
        .presentationBackground(SL.Surface.raised)
        .presentationCornerRadius(SL.Radius.xl)
        .presentationDragIndicator(.hidden)
        .slRespondsToTextSize()
    }

    // MARK: - One side of the bar

    /// Drawn from the answer rather than decorating it: the collar, the
    /// plates heaviest first, and the sleeve running out.
    private var stack: some View {
        HStack(alignment: .bottom, spacing: 6) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(SL.Surface.mute)
                .frame(width: 14, height: 24)
            ForEach(Array(solution.perSide.enumerated()), id: \.offset) { _, plate in
                plateBar(plate)
            }
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(SL.Surface.mute)
                .frame(height: 24)
                .frame(maxWidth: .infinity)
        }
        .frame(height: 96, alignment: .bottom)
        .accessibilityHidden(true)
    }

    private func plateBar(_ plate: Decimal) -> some View {
        let look = Self.look(for: plate)
        return RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous)
            .fill(look.color)
            .frame(width: look.width, height: look.height)
            .overlay(
                Text(display.number(plate))
                    .font(.slFixed(plate < 2.5 ? 12 : 13, SL.Weight.bold))
                    .slNumerals()
                    .foregroundStyle(SL.Signal.onAction)
                    .fixedSize()
                    .rotationEffect(.degrees(-90))
            )
    }

    /// A plate's size and colour follow its weight: the heavy ones lime and
    /// full height, the middle ones mint, the change plates grey and short.
    private static func look(for plate: Decimal) -> (width: CGFloat, height: CGFloat, color: Color) {
        switch plate {
        case 25...: return (28, 96, SL.Signal.action)
        case 20..<25: return (26, 96, SL.Signal.action)
        case 15..<20: return (24, 84, SL.Signal.recovery)
        case 10..<15: return (22, 70, SL.Signal.recovery)
        case 5..<10: return (20, 60, SL.Ink.meta)
        case 2.5..<5: return (18, 56, SL.Ink.secondary)
        default: return (18, 52, SL.Ink.secondary)
        }
    }

    /// "1 × 20 + 1 × 10 + 1 × 1,25 per kant"
    private var perSide: String {
        if target < bar { return "Lichter dan de stang van \(display.kg(bar))" }
        guard !solution.perSide.isEmpty else { return "Alleen de stang" }
        var counts: [(plate: Decimal, count: Int)] = []
        for plate in solution.perSide {
            if let last = counts.indices.last, counts[last].plate == plate {
                counts[last].count += 1
            } else {
                counts.append((plate, 1))
            }
        }
        return counts.map { "\($0.count) × \(display.number($0.plate))" }.joined(separator: " + ") + " per kant"
    }

    private var footnote: String {
        if target < bar { return "De stang alleen weegt al \(display.kg(bar))." }
        if solution.isExact { return "Haalbaar met jouw schijven." }
        return "\(display.kg(target)) past niet met jouw schijven; dit is \(display.kg(solution.total)), het dichtste dat wel kan."
    }

    // MARK: - Loads these plates can make

    /// The loads around this one that the same plates can make. Choosing one
    /// sets the weight of the set.
    private var nearby: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("Haalbare gewichten")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
            HStack(spacing: SL.Space.s2) {
                ForEach(PlateMath.nearby(target: target, bar: bar, plates: rack.plates), id: \.self) { load in
                    // The edge marks the load that is drawn above.
                    let selected = load == solution.total
                    Button { onChoose(load) } label: {
                        Text(display.number(load))
                            .slBody(SL.Weight.semibold)
                            .slNumerals()
                            .foregroundStyle(selected ? SL.Signal.action : SL.Ink.primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 48)
                            .slBorderBox()
                            .background(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .fill(selected ? SL.Signal.actionTint : Color.clear)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .strokeBorder(selected ? SL.Signal.action : SL.Surface.hairlineStrong, lineWidth: 1)
                            )
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                    .accessibilityLabel(display.kg(load))
                    .accessibilityHint(load == target ? "" : "Zet deze set op dit gewicht")
                    .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
    }

    // MARK: - The bar, and out

    private var barChoice: some View {
        HStack(spacing: SL.Space.s2) {
            ForEach(bars, id: \.self) { option in
                let selected = option == bar
                Button { chosenBar = option } label: {
                    Text("stang \(display.kg(option))")
                        .slBody(selected ? SL.Weight.semibold : SL.Weight.regular)
                        .slNumerals()
                        .foregroundStyle(selected ? SL.Signal.action : SL.Ink.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 48)
                        .slBorderBox()
                        .background(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .fill(selected ? SL.Signal.actionTint : Color.clear)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .strokeBorder(selected ? SL.Signal.action : SL.Surface.hairlineStrong, lineWidth: 1)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
            }

            Button(action: onClose) {
                Text("Sluiten")
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Ink.primary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .slBorderBox()
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .fill(SL.Surface.raised2)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
                    )
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
        }
    }
}
