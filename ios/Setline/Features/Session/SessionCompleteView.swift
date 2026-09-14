import SwiftUI
import SetlineCore

/// Artboard 17R. Four kinds of record, each stated once, as a fact.
///
/// No confetti, no badge, no streak.
struct SessionCompleteView: View {
    @Environment(AppState.self) private var app
    let runner: SessionRunner
    let previous: TrainingSession?
    /// Back to the session without saving — a mis-tap on `Sessie afronden`,
    /// or one set to fix, must not force a save.
    let onBack: () -> Void
    let onSave: () -> Void

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    SLEyebrow(text: "Afgerond · \(runner.completedSetCount)/\(runner.plannedSetCount) sets")

                    Text("\(runner.day.short) · \(app.display.minutes(runner.elapsedSeconds)) · \(app.display.shortDate(Date()))")
                        .slTitle()
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, SL.Space.s2)

                    volumeBlock

                    records.padding(.top, SL.Space.s5)

                    summaryRows.padding(.top, SL.Space.s6)
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s8)
                .padding(.bottom, SL.Space.s12)
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: SL.Space.s2) {
                Button(action: onBack) {
                    Text("Terug naar sessie")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Button(action: onSave) { Text("Sessie opslaan") }
                    .buttonStyle(SLPrimaryButtonStyle())
                Text("Notitie toevoegen")
                    .slBody()
                    .foregroundStyle(SL.Ink.tertiary)
                    .frame(height: SL.Metric.tertiaryHeight)
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s3)
            .padding(.bottom, SL.Space.s3)
            // Opaque, like the session's own bottom bar: records scroll
            // underneath it instead of showing through the actions.
            .background(SL.Surface.ground.ignoresSafeArea(edges: .bottom))
        }
    }

    private var volumeBlock: some View {
        let summary = runner.volumeSummary(previous: previous)
        return VStack(alignment: .leading, spacing: 0) {
            SLEyebrow(text: "Volume")
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                Text(app.display.volumeKg(summary.volume))
                    .slDisplay(SL.TypeSize.displayXL)
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                if let delta = summary.delta, delta > 0 {
                    Text(app.display.signedDelta(delta))
                        .slLead()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                }
            }
            .padding(.top, 6)

            if let previous {
                Text("Tegenover \(app.display.shortDate(previous.date))")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, SL.Space.s2)
            }
        }
        .padding(.top, SL.Space.s2)
        .padding(.bottom, SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { SLHairline() }
    }

    /// Plain blocks separated by hairlines — no cards. The highest-ranked
    /// record takes the screen's one lime; the rest stay tertiary.
    private var records: some View {
        let entries = runner.records()
        return VStack(alignment: .leading, spacing: SL.Space.s4) {
            ForEach(Array(entries.enumerated()), id: \.offset) { index, entry in
                VStack(alignment: .leading, spacing: 0) {
                    SLEyebrow(
                        text: entry.name,
                        color: index == 0 ? SL.Signal.action : SL.Ink.tertiary
                    )
                    Text(entry.record.headline)
                        .slTitle()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, 4)
                    Text(entry.record.detail)
                        .slMeta()
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.top, 2)
                }
                if index < entries.count - 1 { SLHairline() }
            }
        }
    }

    private var summaryRows: some View {
        VStack(spacing: 0) {
            // Every exercise that did work today, swapped-out ones included.
            ForEach(Array(runner.allResults.enumerated()), id: \.offset) { _, result in
                HStack(alignment: .firstTextBaseline) {
                    Text(result.name).slBody().foregroundStyle(SL.Ink.primary)
                    Spacer()
                    Text(summary(result.sets))
                        .slBody().slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .padding(.vertical, SL.Space.s3)
                SLHairline()
            }
        }
    }

    private func summary(_ sets: [LoggedSet]) -> String {
        guard let weight = sets.first?.weightKg else { return "" }
        let reps = sets.map { "\($0.reps)" }.joined(separator: " · ")
        return "\(app.display.kg(weight)) · \(reps)"
    }
}
