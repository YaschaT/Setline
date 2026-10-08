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

            Text("Lift heavier,\nevery week.")
                .font(.sl(SL.TypeSize.displayXL, SL.Weight.semibold))
                .tracking(SL.TypeSize.displayXL * -0.015)
                .slLineHeight(1.04, size: SL.TypeSize.displayXL)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)

            Text("Log your sets in two taps. Your last session is already there.")
                .slBody()
                .slLineHeight(1.5, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .slMeasure(26, fontSize: SL.TypeSize.body)
                .padding(.top, 14)

            // 01's bottom block: 28 above the pill, 12 between the pill and
            // the link, 98 below it in the frame.
            Button { onBegin() } label: { Text("Get started") }
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.top, 28)

            Button { onSignIn() } label: {
                Text("I already have an account")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Metric.tertiaryHeight)
            }
            .buttonStyle(.plain)
            .padding(.top, SL.Space.s3)
        }
        .padding(.horizontal, SL.Space.gutterEntry)
        .padding(.bottom, SL.Space.entryBlockBottom)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.ground.ignoresSafeArea())
        .slRespondsToTextSize()
    }
}
