import SwiftUI
import SetlineCore

/// Artboard 02a · the mechanic in three beats, right after an account is made.
///
/// No input, and the screen's one lime is the `+2,5 kg` — the thing the app
/// does for you, which is the whole reason to be here.
struct HowItWorksView: View {
    let onContinue: () -> Void

    private let beats: [(title: String, body: String, lime: String?)] = [
        ("Je plan staat klaar", "Oefeningen, sets en reps per dag. Geen leeg logboek.", nil),
        ("Loggen in twee taps", "Het gewicht van vorige keer staat al ingevuld. Tik af en rust.", nil),
        (
            "SETLINE rekent vooruit",
            "Alle reps gehaald, dan volgende sessie +2,5 kg. Niet gehaald, dan hetzelfde gewicht.",
            "+2,5 kg"
        ),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    SLEyebrow(text: "ZO WERKT HET")

                    Text("Elke week iets\nzwaarder tillen.")
                        .font(.sl(SL.TypeSize.displayL, SL.Weight.semibold))
                        .tracking(SL.TypeSize.displayL * -0.015)
                        .slLineHeight(1.06, size: SL.TypeSize.displayL)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, SL.Space.s4)

                    VStack(spacing: 0) {
                        ForEach(Array(beats.enumerated()), id: \.offset) { index, beat in
                            SLHairline()
                            beatRow(index: index, beat: beat)
                            if index == beats.count - 1 { SLHairline() }
                        }
                    }
                    .padding(.top, SL.Space.s8)

                    Text("Je hoeft niks te programmeren. Je hoeft alleen te komen.")
                        .slMeta()
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.top, SL.Space.s5)
                }
                .padding(.horizontal, SL.Space.gutterEntry)
                .padding(.top, SL.Space.s6)
                .padding(.bottom, SL.Space.s8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.ground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            Button { onContinue() } label: { Text("Verder") }
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.horizontal, SL.Space.gutterEntry)
                .padding(.bottom, SL.Space.s3)
                .frame(maxWidth: .infinity)
                .background(SL.Surface.ground)
        }
        .slRespondsToTextSize()
    }

    private func beatRow(index: Int, beat: (title: String, body: String, lime: String?)) -> some View {
        HStack(alignment: .top, spacing: SL.Space.s4) {
            Text(String(format: "%02d", index + 1))
                .font(.system(size: SL.TypeSize.meta, weight: SL.Weight.semibold, design: .monospaced))
                .foregroundStyle(SL.Ink.tertiary)

            VStack(alignment: .leading, spacing: 2) {
                Text(beat.title).slLead().foregroundStyle(SL.Ink.primary)
                Text(attributed(beat.body, liming: beat.lime))
                    .slBody()
                    .slLineHeight(1.45, size: SL.TypeSize.body)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func attributed(_ text: String, liming fragment: String?) -> AttributedString {
        var string = AttributedString(text)
        string.foregroundColor = SL.Ink.secondary
        if let fragment, let range = string.range(of: fragment) {
            string[range].foregroundColor = SL.Signal.action
            string[range].font = .sl(SL.TypeSize.body, SL.Weight.semibold)
        }
        return string
    }
}

/// Artboard 02b · what intake costs, and what each question changes.
struct IntakeIntroView: View {
    let onBegin: () -> Void
    let onSkip: () -> Void

    private let rows: [(String, String)] = [
        ("Dagen per week", "vorm van je week"),
        ("Hoe lang je tilt", "tempo progressie"),
        ("Planvorm", "indeling per dag"),
        ("Schijven in je gym", "kleinste sprong"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Vier vragen en je\nplan staat er.")
                        .slDisplay()
                        .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)

                    Text("We vragen alleen wat het scherm van vandaag verandert. Ongeveer 40 seconden.")
                        .slBody()
                        .slLineHeight(1.5, size: SL.TypeSize.body)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .slMeasure(32, fontSize: SL.TypeSize.body)
                        .padding(.top, 10)

                    VStack(spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                            if index > 0 { SLHairline() }
                            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s4) {
                                Text(row.0).slLead().foregroundStyle(SL.Ink.primary)
                                Spacer(minLength: SL.Space.s3)
                                Text(row.1).slMeta().foregroundStyle(SL.Ink.tertiary)
                            }
                            .padding(.vertical, 14)
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                            .fill(SL.Surface.raised)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                            .strokeBorder(SL.Surface.hairline, lineWidth: 1)
                    )
                    .padding(.top, 28)

                    Text("Alles blijft later te wijzigen in Account. Overslaan geeft je het standaardplan.")
                        .slMeta()
                        .slLineHeight(1.5, size: SL.TypeSize.meta)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.top, SL.Space.s5)
                }
                .padding(.horizontal, SL.Space.gutterEntry)
                .padding(.top, SL.Space.s6)
                .padding(.bottom, SL.Space.s8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.ground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: SL.Space.s2) {
                Button { onBegin() } label: { Text("Beginnen met vraag 1") }
                    .buttonStyle(SLPrimaryButtonStyle())
                Button { onSkip() } label: {
                    Text("Overslaan · standaardplan")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Metric.tertiaryHeight)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, SL.Space.gutterEntry)
            .padding(.bottom, SL.Space.s3)
            .frame(maxWidth: .infinity)
            .background(SL.Surface.ground)
        }
        .slRespondsToTextSize()
    }
}
