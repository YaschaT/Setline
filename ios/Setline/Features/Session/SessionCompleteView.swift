import SwiftUI
import SetlineCore

/// Artboard 17R. Four kinds of record, each stated once, as a fact.
///
/// No confetti, no badge, no streak. 17R replaced base 17's comparison line,
/// per-exercise list and note link with the records themselves; the one
/// addition is `Terug`, in the handoff's own back-link style, so a mis-tap on
/// `Sessie afronden` never forces a save.
struct SessionCompleteView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
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
                    Button(action: onBack) {
                        Text("Terug")
                            .slBody(SL.Weight.medium)
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Terug naar sessie")

                    SLEyebrow(text: "Afgerond · \(runner.completedSetCount)/\(runner.plannedSetCount) sets")
                        .padding(.top, SL.Space.s5)

                    // The date is the session's own, and a workout written
                    // down afterwards claims no duration: the minutes it took
                    // to type are not the minutes it took to train.
                    Text(runner.isLoggedAfterwards
                         ? "\(runner.day.short) · \(app.display.shortDate(runner.startedAt))"
                         : "\(runner.day.short) · \(app.display.minutes(runner.elapsedSeconds)) · \(app.display.shortDate(runner.startedAt))")
                        .slTitle()
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, SL.Space.s2)

                    volumeBlock

                    records.padding(.top, SL.Space.s5)
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s3)
                .padding(.bottom, SL.Space.s12)
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button(action: onSave) { Text("Sessie opslaan") }
                .buttonStyle(SLPrimaryButtonStyle())
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
            // A number never breaks across lines: at accessibility sizes the
            // change moves under it instead of squeezing it.
            volumeLayout {
                Text(app.display.volumeKg(summary.volume))
                    .slDisplay(SL.TypeSize.displayXL)
                    .slNumerals()
                    // 17R: 44 on a 1.04 line.
                    .slLineHeight(1.04, size: SL.TypeSize.displayXL)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .foregroundStyle(SL.Ink.primary)
                if let delta = summary.delta, delta > 0 {
                    Text(app.display.signedDelta(delta))
                        .slLead()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                }
            }
            .padding(.top, 6)
        }
        .padding(.top, SL.Space.s2)
        .padding(.bottom, SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { SLHairline() }
    }

    private var volumeLayout: AnyLayout {
        typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s3))
    }

    /// Plain blocks separated by hairlines — no cards. The highest-ranked
    /// record takes the screen's one lime; the rest stay tertiary, and a
    /// reference still being built never takes it.
    private var records: some View {
        let entries = runner.records()
        return VStack(alignment: .leading, spacing: SL.Space.s4) {
            ForEach(Array(entries.enumerated()), id: \.offset) { index, entry in
                VStack(alignment: .leading, spacing: 0) {
                    SLEyebrow(
                        text: entry.name,
                        color: index == 0 && !entry.record.buildsReference ? SL.Signal.action : SL.Ink.tertiary
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
}
