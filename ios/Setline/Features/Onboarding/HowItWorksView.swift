import SwiftUI
import SetlineCore

/// Artboard 02a · the mechanic in three beats, right after an account is made.
///
/// No input, and the screen's one lime is the `+2,5 kg` — the thing the app
/// does for you, which is the whole reason to be here.
struct HowItWorksView: View {
    let onContinue: () -> Void

    private let beats: [(title: String, body: String, lime: String?)] = [
        ("Your plan is ready", "Exercises, sets and reps for every day. No empty log.", nil),
        ("Log in two taps", "Last time's weight is already filled in. Tap it off and rest.", nil),
        (
            "SETLINE plans ahead",
            "All reps done? Next session +2.5 kg. Not done? Same weight.",
            "+2.5 kg"
        ),
    ]

    var body: some View {
        // 02a: the kicker and headline at the top, the beats and footnote
        // down by the pill, and the room between them flexible.
        SLAnchoredScroll {
            VStack(alignment: .leading, spacing: 0) {
                Text("HOW IT WORKS")
                    .font(.sl(SL.TypeSize.meta, SL.Weight.medium))
                    .tracking(SL.TypeSize.meta * 0.14)
                    .foregroundStyle(SL.Ink.tertiary)
                    .accessibilityAddTraits(.isHeader)

                Text("Lift a little\nheavier every week.")
                    .font(.sl(SL.TypeSize.displayL, SL.Weight.semibold))
                    .tracking(SL.TypeSize.displayL * -0.015)
                    .slLineHeight(1.06, size: SL.TypeSize.displayL)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.primary)
                    .padding(.top, 14)

                Spacer(minLength: SL.Space.s8)

                VStack(spacing: 2) {
                    ForEach(Array(beats.enumerated()), id: \.offset) { index, beat in
                        VStack(spacing: 0) {
                            SLHairline()
                            beatRow(index: index, beat: beat)
                            if index == beats.count - 1 { SLHairline() }
                        }
                    }
                }

                Text("You don't have to program anything. You just have to show up.")
                    .slMeta()
                    .slLineHeight(1.5, size: SL.TypeSize.meta)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, SL.Space.s5)
            }
            .padding(.horizontal, SL.Space.gutterEntry)
            .padding(.top, SL.Space.s8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.ground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            Button { onContinue() } label: { Text("Continue") }
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.horizontal, SL.Space.gutterEntry)
                .padding(.top, SL.Space.s6)
                .padding(.bottom, SL.Space.entryBlockBottom)
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
                .padding(.top, 3)

            VStack(alignment: .leading, spacing: SL.Space.s1) {
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
    let onBack: () -> Void
    let onBegin: () -> Void
    let onSkip: () -> Void

    private let rows: [(String, String)] = [
        ("Days a week", "shape of your week"),
        ("How long you've lifted", "progress pace"),
        ("Plan shape", "split per day"),
        ("Plates in your gym", "smallest jump"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onBack) {
                Text("Back")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, SL.Space.gutterEntry)

            SLAnchoredScroll {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Four questions and\nyour plan is ready.")
                        .slDisplay()
                        .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)

                    Text("We only ask what changes today's screen. About 40 seconds.")
                        .slBody()
                        .slLineHeight(1.5, size: SL.TypeSize.body)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .slMeasure(32, fontSize: SL.TypeSize.body)
                        .padding(.top, SL.Space.s3)

                    Spacer(minLength: 28)

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
                    .slCard()

                    Text("You can change everything later in Account. Skipping gives you a standard four-day plan.")
                        .slMeta()
                        .slLineHeight(1.5, size: SL.TypeSize.meta)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.top, SL.Space.s5)
                }
                .padding(.horizontal, SL.Space.gutterEntry)
                // 02b: the title 36 below `Terug`'s text, which sits centred
                // in its 44pt row — 22 below the row.
                .padding(.top, 22)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.ground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: SL.Space.s2) {
                Button { onBegin() } label: { Text("Start with question 1") }
                    .buttonStyle(SLPrimaryButtonStyle())
                Button { onSkip() } label: {
                    Text("Skip · standard plan")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Metric.tertiaryHeight)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, SL.Space.gutterEntry)
            .padding(.top, SL.Space.s6)
            .padding(.bottom, SL.Space.entryBlockBottom)
            .frame(maxWidth: .infinity)
            .background(SL.Surface.ground)
        }
        .slRespondsToTextSize()
    }
}
