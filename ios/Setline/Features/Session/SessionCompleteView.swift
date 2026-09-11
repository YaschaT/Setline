import SwiftUI
import SetlineCore

/// Artboard 17R. Four kinds of record, each stated once, as a fact.
///
/// No confetti, no badge, no streak.
struct SessionCompleteView: View {
    @Environment(AppState.self) private var app
    let runner: SessionRunner
    let previous: TrainingSession?
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
                Button(action: onSave) { Text("Sessie opslaan") }
                    .buttonStyle(SLPrimaryButtonStyle())
                Text("Notitie toevoegen")
                    .slBody()
                    .foregroundStyle(SL.Ink.tertiary)
                    .frame(height: SL.Metric.tertiaryHeight)
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.bottom, SL.Space.s3)
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
            ForEach(runner.slots) { slot in
                let logged = slot.sets.filter(\.isLogged)
                if !logged.isEmpty {
                    HStack(alignment: .firstTextBaseline) {
                        Text(slot.exercise.name).slBody().foregroundStyle(SL.Ink.primary)
                        Spacer()
                        Text(summary(logged))
                            .slBody().slNumerals()
                            .foregroundStyle(SL.Ink.secondary)
                    }
                    .padding(.vertical, SL.Space.s3)
                    SLHairline()
                }
            }
        }
    }

    private func summary(_ sets: [LoggedSet]) -> String {
        guard let weight = sets.first?.weightKg else { return "" }
        let reps = sets.map { "\($0.reps)" }.joined(separator: " · ")
        return "\(app.display.kg(weight)) · \(reps)"
    }
}
