import Charts
import SwiftUI
import SetlineCore

/// Artboard 20 · segment Kracht.
///
/// States one exercise's strength: what it is estimated at now, how it moved,
/// and the heaviest set of every session behind that. The chart carries the
/// screen's one lime meaning, so the list's records and deltas stay tonal —
/// exactly as the artboard draws them.
struct StrengthSegmentView: View {
    @Environment(AppState.self) private var app
    @State private var choices: [StrengthSelection.Choice] = []
    @State private var selected: String?
    @State private var progress: StrengthProgress?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if choices.isEmpty {
                    emptyState
                } else {
                    chips
                    if let progress {
                        estimateBlock(progress)
                        if progress.points.count > 1 { chart(progress) }
                        sessionList(progress)
                    }
                }
            }
            .padding(.horizontal, SL.Space.s5)
            .padding(.top, SL.Space.s5)
        }
        .task(id: app.sessions.count) { reload() }
        .onChange(of: selected) { _, _ in reloadProgress() }
    }

    // MARK: Exercise chips

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(choices) { choice in
                    let isSelected = choice.exerciseID == progress?.exerciseID
                    Button {
                        selected = choice.exerciseID
                    } label: {
                        Text(choice.name)
                            .slBody(isSelected ? SL.Weight.semibold : SL.Weight.regular)
                            .foregroundStyle(isSelected ? SL.Ink.primary : SL.Ink.tertiary)
                            .padding(.horizontal, SL.Space.s4)
                            .frame(height: 44)
                            .background(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .fill(isSelected ? SL.Surface.raised2 : .clear)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                            .strokeBorder(isSelected ? SL.Surface.hairlineStrong : .clear, lineWidth: 1)
                                    )
                            )
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
                }
            }
            .padding(.bottom, 2)
        }
        .scrollClipDisabled()
        .padding(.bottom, SL.Space.s6)
    }

    // MARK: Estimate

    private func estimateBlock(_ progress: StrengthProgress) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("GESCHATTE 1RM")
                .slMeta(SL.Weight.medium)
                .foregroundStyle(SL.Ink.tertiary)

            if let estimate = progress.estimate {
                SLValueRow {
                    // An estimate is stated in the steps a gym actually has,
                    // as the artboard does: Epley's 63,33 reads as 63,5.
                    Text(app.display.kg(Estimates.round(estimate, toIncrement: 0.5)))
                        .slDisplay()
                        .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    if let change = progress.change {
                        Text("\(app.display.signedDelta(Estimates.round(change.value, toIncrement: 0.5))) in \(change.weeks) weken")
                            .slLead()
                            .foregroundStyle(SL.Signal.action)
                    } else if !progress.hasReference {
                        Text("Referentie opbouwen · sessie \(progress.referenceSessionNumber) van \(ExerciseHistory.sessionsBeforeReference)")
                            .slMeta()
                            .foregroundStyle(SL.Ink.tertiary)
                    }
                }
                .padding(.top, SL.Space.s2)
                .accessibilityElement(children: .combine)
            } else {
                // §10.2: Epley loses accuracy as reps rise, so above ten reps
                // the app states no estimate rather than a flattering one.
                Text("Boven 10 reps rekent SETLINE geen schatting.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.top, SL.Space.s2)
            }
        }
        .padding(.bottom, SL.Space.s5)
    }

    // MARK: Chart

    private func chart(_ progress: StrengthProgress) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Chart(progress.points, id: \.date) { point in
                LineMark(
                    x: .value("Datum", point.date),
                    y: .value("Geschatte 1RM", (point.estimate as NSDecimalNumber).doubleValue)
                )
                .interpolationMethod(.linear)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                .foregroundStyle(SL.Signal.action)
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .chartYScale(domain: chartRange(progress.points))
            .frame(height: 150)
            // Artboard 20's two rules: through the middle and along the base.
            .background {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    SLHairline()
                    Spacer(minLength: 0)
                    SLHairline()
                }
            }
            .accessibilityLabel("Verloop van de geschatte 1RM over \(progress.points.count) sessies")

            let labels = chartLabels(progress.points)
            HStack(spacing: 0) {
                ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                    Text(label)
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.tertiary)
                    if index < labels.count - 1 { Spacer(minLength: SL.Space.s2) }
                }
            }
            .padding(.top, 10)
            .accessibilityHidden(true)
        }
        .padding(.bottom, SL.Space.s8)
    }

    /// A little room above and below, so the stroke never touches the edges.
    private func chartRange(_ points: [StrengthProgress.Point]) -> ClosedRange<Double> {
        let values = points.map { ($0.estimate as NSDecimalNumber).doubleValue }
        let low = values.min() ?? 0
        let high = values.max() ?? 1
        let padding = max((high - low) * 0.25, 1)
        return (low - padding)...(high + padding)
    }

    /// First, middle and last, as the artboard labels them.
    private func chartLabels(_ points: [StrengthProgress.Point]) -> [String] {
        guard let first = points.first, let last = points.last else { return [] }
        guard points.count > 2 else {
            return [app.display.shortDate(first.date), app.display.shortDate(last.date)]
        }
        let middle = points[points.count / 2]
        return [first, middle, last].map { app.display.shortDate($0.date) }
    }

    // MARK: Sessions

    private func sessionList(_ progress: StrengthProgress) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("ZWAARSTE SET PER SESSIE")
                .slMeta(SL.Weight.medium)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.bottom, SL.Space.s1)
                .accessibilityAddTraits(.isHeader)

            ForEach(Array(progress.rows.enumerated()), id: \.element.id) { index, row in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(app.display.shortDate(row.date)).slBody(SL.Weight.medium)
                        Text(sessionSubtitle(row))
                            .slMeta()
                            .foregroundStyle(SL.Ink.tertiary)
                    }
                    Spacer(minLength: SL.Space.s4)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(app.display.kg(row.weightKg)) × \(row.reps)").slLead()
                        marker(row.marker)
                    }
                }
                .padding(.vertical, 14)
                .overlay(alignment: .bottom) {
                    if index < progress.rows.count - 1 { SLHairline() }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.bottom, SL.Space.s6)
    }

    private func sessionSubtitle(_ row: StrengthProgress.SessionRow) -> String {
        let sets = row.setCount == 1 ? "1 set" : "\(row.setCount) sets"
        return row.dayLabel.isEmpty ? sets : "\(row.dayLabel) · \(sets)"
    }

    /// The trailing marker. Lime is already spent on the change above, so a
    /// record reads as weight, not colour (artboard 20).
    @ViewBuilder
    private func marker(_ marker: StrengthProgress.Marker) -> some View {
        switch marker {
        case .record:
            Text("PR").slMeta(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
        case .delta(let value):
            Text(app.display.signedDelta(value)).slMeta().foregroundStyle(SL.Ink.tertiary)
        case .same:
            Text("=").slMeta().foregroundStyle(SL.Ink.tertiary)
        case .building(let session, let total):
            Text("sessie \(session) van \(total)").slMeta().foregroundStyle(SL.Ink.tertiary)
        }
    }

    // MARK: Empty

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            if app.sessions.contains(where: { $0.kind == .workout }) {
                Text("Nog geen oefening met genoeg historiek").slLead()
                Text("Na drie vergelijkbare sessies rekent SETLINE hier je kracht uit.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
            } else {
                Text("Nog geen sessies").slLead()
                Text("Je eerste sessie zet de startgewichten.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
            }
        }
        .padding(.top, SL.Space.s2)
        .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Data

    private func reload() {
        choices = StrengthSelection.choices(sessions: app.sessions, plan: app.plan)
        if selected == nil || !choices.contains(where: { $0.exerciseID == selected }) {
            selected = choices.first?.exerciseID
        }
        reloadProgress()
    }

    private func reloadProgress() {
        guard let choice = choices.first(where: { $0.exerciseID == selected }) ?? choices.first else {
            progress = nil
            return
        }
        progress = StrengthProgress.make(
            exerciseID: choice.exerciseID,
            name: choice.name,
            modifiers: choice.modifiers,
            sessions: app.sessions
        )
    }
}
