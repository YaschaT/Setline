import SwiftUI
import SetlineCore

/// Artboard 07 · the prompt before the prompt.
///
/// It appears in the one place where the answer is obvious: the first set is
/// logged, the rest has started, and the phone is about to go in a pocket. The
/// OS is only asked after the reader says yes here, and it is asked once.
struct RestNotificationSheet: View {
    let restLabel: String
    let onAllow: () -> Void
    let onDecline: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule()
                .fill(SL.Surface.hairlineStrong)
                .frame(width: 36, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.bottom, SL.Space.s6)

            // Scrolls, so neither the headline nor a reader's larger text ever
            // has to be cut to fit the sheet.
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Rest timer in the background")
                        .slDisplay()
                        .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)

                    Text("Your rest lasts \(restLabel). With a notification you don't need to keep the app open, and you'll hear when it's time to go again.")
                        .slBody()
                        .slLineHeight(1.5, size: SL.TypeSize.body)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .slMeasure(32, fontSize: SL.TypeSize.body)
                        .padding(.top, SL.Space.s3)

                    chip.padding(.top, SL.Space.s5)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollBounceBehavior(.basedOnSize)

            Button { onAllow() } label: { Text("Allow notifications") }
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.top, SL.Space.s5)

            Button { onDecline() } label: {
                Text("Not now")
                    .slLead(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Metric.tertiaryHeight)
            }
            .buttonStyle(.plain)
            .padding(.top, SL.Space.s2)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s6)
        .padding(.bottom, SL.Space.s6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SL.Surface.raised)
        .presentationDetents([.height(460), .large])
        .presentationDragIndicator(.hidden)
        .presentationBackground(SL.Surface.raised)
        .slRespondsToTextSize()
    }

    private var chip: some View {
        HStack(spacing: SL.Space.s2) {
                Circle()
                    .fill(SL.Ink.tertiary)
                    .frame(width: 8, height: 8)
                Text("Only timers. No reminders, no tips.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .padding(.vertical, 14)
            .padding(.horizontal, SL.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .fill(SL.Surface.raised2)
            )
    }
}
