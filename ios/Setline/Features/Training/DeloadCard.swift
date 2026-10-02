import SwiftUI
import SetlineCore

/// Redesign 1a · "Herstel" — the one place the app asks something.
///
/// The design fills this card from sleep, readiness and HRV. SETLINE reads
/// none of those: its recovery proposal comes from the sets that were logged
/// (TRAINING_LOGIC §11), and appears only when two of its signals agree inside
/// one week. So the card keeps the design's shape — what is proposed, the
/// evidence under a hairline, take it or leave it — and states the evidence
/// this account actually has.
///
/// It changes nothing by itself. `Overnemen` starts the lighter days,
/// `Negeren` leaves the plan as it is, and afterwards the card says which.
struct DeloadCard: View {
    enum Status: Equatable {
        /// Proposed and unanswered.
        case open
        /// The lighter days are running.
        case applied
        /// Waved away; the plan stays as it was.
        case ignored
    }

    let reading: Fatigue.Reading
    let proposal: Deload
    let status: Status
    let onApply: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                Text("Voorstel voor de komende \(proposal.days) dagen")
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: SL.Space.s2)
                statusChip
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("\(proposal.days) dagen lichter")
                    .slTitle()
                    .slNumerals()
                    .slLineHeight(1.3, size: SL.TypeSize.title)
                    .foregroundStyle(SL.Ink.primary)
                Text(proposal.detail.slUnbroken)
                    .slLead(SL.Weight.regular)
                    .slNumerals()
                    .slLineHeight(1.3, size: SL.TypeSize.lead)
                    .foregroundStyle(SL.Ink.primary)
            }
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)

            if !reading.evidence.isEmpty {
                evidence
            }

            switch status {
            case .open:
                actions
                Text(Deload.footnote)
                    .slMeta()
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.secondary)
            case .applied:
                outcome("Overgenomen: \(proposal.days) dagen lichter, tot en met \(lastDay).")
            case .ignored:
                outcome("Genegeerd. Je plan blijft zoals gepland.")
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(SL.Surface.raised)
        )
    }

    // MARK: - Pieces

    private var statusChip: some View {
        let applied = status == .applied
        return Text(statusLabel)
            .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
            .foregroundStyle(applied ? SL.Signal.recovery : SL.Ink.secondary)
            .padding(.horizontal, 10)
            .frame(minHeight: 24)
            .slBorderBox()
            .overlay(
                Capsule().strokeBorder(
                    // The chip's own grey sits between the two hairlines.
                    applied ? SL.Signal.recovery.opacity(0.5) : Color(hex: 0x2A3330),
                    lineWidth: 1
                )
            )
            .fixedSize()
    }

    private var statusLabel: String {
        switch status {
        case .open: return "Niet toegepast"
        case .applied: return "✓ Toegepast"
        case .ignored: return "Genegeerd"
        }
    }

    /// What the signals say, in the reading's own words, and the sets that
    /// said it.
    private var evidence: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text(lead)
                .slBody()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
            ForEach(Array(reading.evidence.enumerated()), id: \.offset) { _, line in
                HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                    Text(line.exerciseName)
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                    Spacer(minLength: SL.Space.s2)
                    Text(line.detail.slUnbroken)
                        .slBody(SL.Weight.semibold)
                        .slNumerals()
                        .multilineTextAlignment(.trailing)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(line.exerciseName == "RIR" ? SL.Signal.attention : SL.Ink.primary)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.top, SL.Space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { SLHairline() }
    }

    private var lead: String {
        if reading.signals.contains(.performanceRegression) {
            return "Je reps zakken op hetzelfde gewicht."
        }
        if reading.signals.contains(.effortDrift) {
            return "Zelfde werk kost je meer."
        }
        return "Je maakt je sessies niet meer af."
    }

    private var actions: some View {
        HStack(alignment: .top, spacing: SL.Space.s2) {
            Button(action: onApply) {
                Text("Overnemen")
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Signal.recovery)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Space.hitMin)
                    .slBorderBox()
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .fill(SL.Signal.recovery.opacity(0.1))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .strokeBorder(SL.Signal.recovery.opacity(0.5), lineWidth: 1)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
            }
            .buttonStyle(.plain)
            .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
            .accessibilityHint("Maakt de komende \(proposal.days) dagen lichter")

            Button(action: onDismiss) {
                Text("Negeren")
                    .slBody()
                    .foregroundStyle(SL.Ink.primary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Space.hitMin)
                    .slBorderBox()
                    .overlay(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
            }
            .buttonStyle(.plain)
            .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
            .accessibilityHint("Laat je plan zoals het is")
        }
    }

    private func outcome(_ text: String) -> some View {
        Text(text)
            .slBody()
            .slNumerals()
            .slLineHeight(1.4, size: SL.TypeSize.body)
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(SL.Ink.primary)
    }

    /// "zo 4 okt" — the last day the lighter prescription covers.
    private var lastDay: String {
        let calendar = Calendar.current
        let last = calendar.date(byAdding: .day, value: max(0, proposal.days - 1), to: proposal.startedAt) ?? proposal.startedAt
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.dateFormat = "EEEEEE d MMM"
        return formatter.string(from: last).replacingOccurrences(of: ".", with: "")
    }
}
