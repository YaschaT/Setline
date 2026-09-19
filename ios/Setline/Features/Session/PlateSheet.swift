import SwiftUI
import SetlineCore

/// Artboard 14 · the plate calculator.
///
/// Reached from the weight field, and it answers one question: what goes on
/// each side. Where the asked-for weight is not something these plates can
/// make, it says the closest they can — being right is the entire point of the
/// screen.
struct PlateSheet: View {
    let exercise: String
    let setNumber: Int
    let reps: Int
    let target: Decimal
    let onChoose: (Decimal) -> Void
    let onClose: () -> Void

    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    /// 14's sheet hugs its content; the detent follows what was laid out.
    @State private var contentHeight: CGFloat = 430

    private let display = NumberDisplay.dutch

    private var rack: PlateInventory { app.plateInventory }

    private var solution: PlateMath.Solution {
        PlateMath.solve(target: target, bar: rack.barKg, plates: rack.plates)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule()
                .fill(SL.Surface.hairlineStrong)
                .frame(width: 36, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.bottom, SL.Space.s4)

            // 14 opens on the answer: which set it is stays on the session
            // behind the sheet. VoiceOver still hears it first.
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: "SCHIJVEN PER KANT")
                Spacer()
                Text("stang \(display.kg(rack.barKg))")
                    .slMeta().slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(exercise), set \(setNumber), \(display.kg(target)) × \(reps). Schijven per kant, stang \(display.kg(rack.barKg))")

            perSide.padding(.top, SL.Space.s2)
            stack.padding(.top, SL.Space.s4)
            nearby.padding(.top, SL.Space.s3)

            Text(footnote)
                .slMeta()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.top, SL.Space.s4)

            Button { onClose() } label: { Text("Sluiten") }
                .buttonStyle(SLOutlineButtonStyle(edge: SL.Surface.hairlineStrong))
                .padding(.top, SL.Space.s4)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s4)
        .padding(.bottom, SL.Space.sessionBlockBottom)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        .background(SL.Surface.raised)
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.height(contentHeight), .large])
        .presentationBackground(SL.Surface.raised)
        .presentationDragIndicator(.hidden)
        .slRespondsToTextSize()
    }

    private var perSide: some View {
        (Text(solution.perSide.isEmpty ? "Geen schijven" : solution.perSide.map(display.number).joined(separator: " · "))
            .font(.sl(SL.TypeSize.display, SL.Weight.semibold))
            .foregroundStyle(SL.Ink.primary)
         + Text(" = \(display.kg(solution.total)) totaal")
            .font(.sl(SL.TypeSize.lead, SL.Weight.medium))
            .foregroundStyle(SL.Ink.tertiary))
            .slNumerals()
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(
                solution.perSide.isEmpty
                    ? "Geen schijven, \(display.kg(solution.total)) totaal"
                    : "Per kant \(solution.perSide.map(display.kg).joined(separator: ", ")), \(display.kg(solution.total)) totaal"
            )
    }

    /// The loaded bar, drawn from the answer rather than decorating it.
    private var stack: some View {
        HStack(spacing: 4) {
            sleeve(width: 52)
            ForEach(Array(solution.perSide.reversed().enumerated()), id: \.offset) { _, plate in
                plateBar(plate)
            }
            sleeve(width: 26)
            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(SL.Ink.secondary).frame(width: 10, height: 30)
            sleeve(width: 26)
            ForEach(Array(solution.perSide.enumerated()), id: \.offset) { _, plate in
                plateBar(plate)
            }
            sleeve(width: 52)
        }
        .frame(maxWidth: .infinity)
        .padding(SL.Space.s4)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(SL.Surface.raised2)
        )
        .accessibilityHidden(true)
    }

    /// 14's pieces are bars with a radius of 3, not capsules.
    private func sleeve(width: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous).fill(SL.Ink.tertiary).frame(width: width, height: 6)
    }

    /// Heights through artboard 14's own example — 15 kg stands 88 tall, 2,5 kg
    /// 44 — full height from 15 kg up and never lower than 30.
    private func plateBar(_ plate: Decimal) -> some View {
        let kg = CGFloat(truncating: plate as NSDecimalNumber)
        let height = min(88, max(30, 44 + 44 * (kg - 2.5) / 12.5))
        return RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(SL.Signal.action)
            .frame(width: 14, height: height)
    }

    private var nearby: some View {
        HStack(spacing: 6) {
            ForEach(PlateMath.nearby(target: target, bar: rack.barKg, plates: rack.plates), id: \.self) { load in
                let selected = load == solution.total
                Button { onChoose(load) } label: {
                    Text(display.number(load))
                        .slBody(SL.Weight.semibold)
                        .slNumerals()
                        // 14 sets every load in white; the edge marks the one chosen.
                        .foregroundStyle(SL.Ink.primary)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Space.hitMin)
                        .background(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .fill(SL.Surface.raised2)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .strokeBorder(selected ? SL.Surface.selection : .clear, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(display.kg(load))
                .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
            }
        }
    }

    private var footnote: String {
        var parts: [String] = []
        if let unused = solution.unused { parts.append("\(display.kg(unused)) niet nodig") }
        parts.append(
            solution.isExact
                ? "haalbaar met jouw schijven"
                : "dichtste haalbare gewicht met jouw schijven"
        )
        return parts.joined(separator: " · ")
    }
}
