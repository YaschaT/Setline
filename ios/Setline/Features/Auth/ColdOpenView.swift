import SwiftUI
import SetlineCore

/// Artboard 01 · the cold open.
///
/// One promise, bottom-anchored, and two ways past it. Nothing loads, nothing
/// animates, and there is no image: the handoff ships no bitmaps, so the ground
/// stays flat rather than filling with something invented.
struct ColdOpenView: View {
    let onBegin: () -> Void
    let onSignIn: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("SETLINE")
                .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                .tracking(SL.TypeSize.micro * 0.18)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.top, 19)
                .accessibilityAddTraits(.isHeader)

            Spacer(minLength: SL.Space.s10)

            Text("Til zwaarder,\nelke week.")
                .font(.sl(SL.TypeSize.displayXL, SL.Weight.semibold))
                .tracking(SL.TypeSize.displayXL * -0.015)
                .lineSpacing(SL.TypeSize.displayXL * 0.04)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)

            Text("Log je sets in twee taps. Je vorige sessie staat er al.")
                .slBody()
                .lineSpacing(SL.TypeSize.body * 0.5)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .frame(maxWidth: 320, alignment: .leading)
                .padding(.top, SL.Space.s4)

            Button { onBegin() } label: { Text("Beginnen") }
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.top, SL.Space.s8)

            Button { onSignIn() } label: {
                Text("Ik heb al een account")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Metric.tertiaryHeight)
            }
            .buttonStyle(.plain)
            .padding(.top, SL.Space.s2)
        }
        .padding(.horizontal, SL.Space.gutterEntry)
        .padding(.bottom, SL.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.ground.ignoresSafeArea())
        .slRespondsToTextSize()
    }
}
