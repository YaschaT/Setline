import SwiftUI
import SetlineCore

/// Artboard 18R · the deload proposal.
///
/// Never on the calendar: it appears only when two of the fatigue signals in
/// TRAINING_LOGIC §11 agree inside one week, and it shows the reading that
/// produced it. Mint rather than lime, because it is a suggestion and the
/// session below it is still the one commit action on the screen.
struct DeloadCard: View {
    let reading: Fatigue.Reading
    let proposal: Deload
    let onApply: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("HERSTEL · VOORSTEL")
                    .font(.sl(SL.TypeSize.meta, SL.Weight.medium))
                    .foregroundStyle(SL.Signal.recovery)
                Spacer(minLength: SL.Space.s3)
                Button { onDismiss() } label: {
                    Text("Sluiten")
                        .slBody()
                        .foregroundStyle(SL.Ink.tertiary)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            }

            Text(lead)
                .slDisplay()
                .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, 10)

            evidence.padding(.top, SL.Space.s4)

            Text(proposal.headline)
                .slLead()
                .slLineHeight(1.4, size: SL.TypeSize.lead)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s4)

            Text(proposal.detail)
                .slBody()
                .slLineHeight(1.5, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 6)

            actions.padding(.top, SL.Space.s4)

            Text(Deload.footnote)
                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.top, SL.Space.s3)
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .fill(SL.Surface.raised2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Signal.recovery.opacity(0.4), lineWidth: 1)
        )
    }

    /// What the signals say, in the reading's own words.
    private var lead: String {
        if reading.signals.contains(.performanceRegression) {
            return "Je reps zakken op hetzelfde gewicht."
        }
        if reading.signals.contains(.effortDrift) {
            return "Zelfde werk kost je meer."
        }
        return "Je maakt je sessies niet meer af."
    }

    private var evidence: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(reading.evidence.enumerated()), id: \.offset) { _, line in
                HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                    Text(line.exerciseName)
                        .slMeta()
                        .foregroundStyle(SL.Ink.tertiary)
                    Spacer(minLength: SL.Space.s3)
                    Text(line.detail)
                        .slMeta().slNumerals()
                        .multilineTextAlignment(.trailing)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(line.exerciseName == "RIR" ? SL.Signal.attention : SL.Ink.primary)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .fill(SL.Surface.raised)
        )
    }

    private var actions: some View {
        HStack(spacing: SL.Space.s2) {
            Button { onApply() } label: {
                Text("Toepassen")
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Signal.onAction)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                            .fill(SL.Signal.recovery)
                    )
            }
            .buttonStyle(.plain)

            Button { onDismiss() } label: {
                Text("Niet nu")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                            .fill(SL.Surface.raised)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                            .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
    }
}
