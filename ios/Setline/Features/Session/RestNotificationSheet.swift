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
                    Text("Rusttimer op de achtergrond")
                        .slDisplay()
                        .lineSpacing(SL.TypeSize.display * (SL.LineHeight.display - 1))
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)

                    Text("Je rust duurt \(restLabel). Met een melding hoef je de app niet open te houden en hoor je wanneer je weer moet.")
                        .slBody()
                        .lineSpacing(SL.TypeSize.body * 0.5)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.top, SL.Space.s3)

                    chip.padding(.top, SL.Space.s5)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollBounceBehavior(.basedOnSize)

            Button { onAllow() } label: { Text("Meldingen toestaan") }
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.top, SL.Space.s5)

            Button { onDecline() } label: {
                Text("Niet nu")
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
                Text("Alleen timers. Geen herinneringen, geen tips.")
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
