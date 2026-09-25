import SwiftUI
import SetlineCore

/// Artboard 40e · what "geschat 1RM" means.
///
/// Three numbers and a sentence: the set it was computed from, what that comes
/// to now, and what it came to at the date the delta counts from. The point of
/// the sheet is the last line — the change is between two estimates, not
/// between two lifts — so nobody reads the headline as a weight they once had
/// on the bar.
///
/// It explains; it never proposes. Nothing here can be tapped except the way
/// out.
struct OneRepMaxSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    let progress: StrengthProgress
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            grip

            Text("Geschat 1RM")
                .font(.sl(28, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)

            Text("Wat je naar schatting één keer zou kunnen tillen. Je hoeft het nooit te proberen: SETLINE rekent het uit je zwaarste set van elke sessie.")
                .slBody()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, SL.Space.s2)

            VStack(spacing: 0) {
                ForEach(lines, id: \.label) { line in
                    row(line.label, line.value)
                }
            }
            .padding(.top, 18)
            .overlay(alignment: .top) { SLHairline().padding(.top, 18) }

            if let note {
                Text(note)
                    .slMeta()
                    .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, 14)
            }

            Spacer(minLength: SL.Space.s2)

            Button(action: onClose) {
                Text("Begrepen")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, 10)
        .padding(.bottom, 34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(SL.Surface.raised)
        // 40e opens 388 from the top of the frame: it says what it has to say
        // and leaves the screen it explains in view.
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.fraction(0.56)])
        .presentationDragIndicator(.hidden)
        .presentationBackground(SL.Surface.raised)
        .slRespondsToTextSize()
    }

    private var grip: some View {
        Capsule()
            .fill(SL.Surface.hairlineStrong)
            .frame(width: 36, height: 5)
            .frame(maxWidth: .infinity)
            .padding(.bottom, 18)
            .accessibilityHidden(true)
    }

    /// Only the lines this exercise actually has. A history without a second
    /// point has no "geschat op", and the sheet simply stops there.
    private var lines: [(label: String, value: String)] {
        var lines: [(String, String)] = []
        if let source = progress.source {
            lines.append((
                "Beste set · \(app.display.shortDate(source.date))",
                "\(app.display.kg(source.weightKg)) × \(source.reps)"
            ))
        }
        if let estimate = progress.estimate {
            lines.append(("Geschat 1RM nu", app.display.kg(Estimates.round(estimate, toIncrement: 0.5))))
        }
        if let change = progress.change {
            lines.append((
                "Geschat op \(app.display.shortDate(change.since))",
                app.display.kg(Estimates.round(change.baseline, toIncrement: 0.5))
            ))
        }
        return lines
    }

    private var note: String? {
        guard progress.change != nil, let shown = progress.shownChange() else {
            return "Zodra je deze oefening opnieuw logt, staat hier ook waar je vandaan komt."
        }
        let delta = app.display.signedDelta(shown)
        return "\(delta) kg is dus het verschil tussen twee schattingen, niet tussen twee keer tillen. Meer reps op hetzelfde gewicht telt ook mee."
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
            Text(label)
                .slBody()
                .slNumerals()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: SL.Space.s2)
            Text(value)
                .slBody(SL.Weight.semibold)
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
        }
        .frame(minHeight: SL.Space.hitMin)
        .overlay(alignment: .bottom) { SLHairline() }
        .accessibilityElement(children: .combine)
    }
}
