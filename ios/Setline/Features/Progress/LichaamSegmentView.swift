import Charts
import SwiftUI
import SetlineCore

/// Artboard 20 · segment Lichaam.
///
/// Wording and colour come from the ≥1024 tile (27): `LICHAAMSGEWICHT`,
/// `82,4 kg`, `+0,3 / 4 weken` in the recovery mint. A weigh-in is a status,
/// not a training win, so lime stays out of the reading entirely — the one
/// exception is the action that writes today's, which is this screen's single
/// commit and takes the pill every other screen gives its own.
///
/// The action is reachable in every state the screen has, because the account
/// takes a weigh-in in every one of them: with a series behind it, with only
/// today's, and with none at all.
struct LichaamSegmentView: View {
    @Environment(AppState.self) private var app
    @State private var progress = BodyProgress.empty
    @State private var weighing = false
    /// The change column, which grows with the text so the weights stay in
    /// one column at every size — the first weigh-in has no change to fill it.
    @ScaledMetric(relativeTo: .body) private var changeWidth: CGFloat = 44

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let latest = progress.latest {
                    header(latest)
                    weighInButton
                        .padding(.bottom, progress.points.count > 1 ? SL.Space.s6 : SL.Space.s5)
                    if progress.points.count > 1 { chart }
                    entries
                } else {
                    emptyState
                    weighInButton.padding(.top, SL.Space.s5)
                }
            }
            .padding(.horizontal, SL.Space.s5)
            .padding(.top, SL.Space.s5)
        }
        .task(id: app.revision) { reload() }
        .sheet(isPresented: $weighing) {
            WeighInSheet(
                date: Date(),
                existing: today,
                latest: progress.latest?.weightKg,
                onSave: { weight in
                    weighing = false
                    Task { await app.saveWeighIn(weight) }
                },
                onClose: { weighing = false }
            )
        }
    }

    /// Today's weigh-in, which decides whether this writes a new one or
    /// corrects the one already standing.
    private var today: BodyMetric? { app.weighIn() }

    /// The one action on this screen. It never reads as a training win: the
    /// label says which of the two things it does, so a day already weighed
    /// offers a correction rather than a second row.
    private var weighInButton: some View {
        Button { weighing = true } label: {
            Text(today == nil ? "Weigh in" : "Edit today's weigh-in")
        }
        .buttonStyle(SLOutlineButtonStyle())
        .accessibilityHint(today == nil
            ? "Opens the field to save today's weight"
            : "Opens today's weigh-in to update the weight")
    }

    private func header(_ latest: BodyProgress.Entry) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("BODY WEIGHT")
                .slMeta(SL.Weight.medium)
                .foregroundStyle(SL.Ink.tertiary)
            SLValueRow {
                Text(app.display.kg(latest.weightKg))
                    .slDisplay()
                    .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if let change = progress.change {
                    Text("\(app.display.signedDelta(change.value)) / \(change.weeks) weeks")
                        .slLead()
                        .foregroundStyle(SL.Signal.recovery)
                }
            }
            .padding(.top, SL.Space.s2)
            .accessibilityElement(children: .combine)

            Text("Last weigh-in · \(app.display.shortDate(latest.date))")
                .slMeta()
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.top, SL.Space.s1)
        }
        .padding(.bottom, SL.Space.s5)
    }

    private var chart: some View {
        VStack(alignment: .leading, spacing: 0) {
            Chart(progress.points) { entry in
                LineMark(
                    x: .value("Date", entry.date),
                    y: .value("Weight", (entry.weightKg as NSDecimalNumber).doubleValue)
                )
                .interpolationMethod(.linear)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                .foregroundStyle(SL.Signal.recovery)
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .chartYScale(domain: range)
            .frame(height: 150)
            .background(alignment: .top) {
                VStack {
                    SLHairline()
                    Spacer()
                    SLHairline()
                }
            }
            .accessibilityLabel("Your weight over \(progress.points.count) weigh-ins")

            let labels = chartLabels
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

    private var entries: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("WEIGH-INS")
                .slMeta(SL.Weight.medium)
                .foregroundStyle(SL.Ink.tertiary)
                .padding(.bottom, SL.Space.s1)
                .accessibilityAddTraits(.isHeader)

            ForEach(Array(progress.entries.enumerated()), id: \.element.id) { index, entry in
                HStack(alignment: .firstTextBaseline) {
                    Text(app.display.shortDate(entry.date)).slBody(SL.Weight.medium)
                    Spacer(minLength: SL.Space.s4)
                    Text(app.display.kg(entry.weightKg)).slLead()
                    if let change = entry.change {
                        Text(app.display.signedDelta(change))
                            .slMeta()
                            .foregroundStyle(SL.Ink.tertiary)
                            .frame(minWidth: changeWidth, alignment: .trailing)
                    } else {
                        Text("").frame(minWidth: changeWidth)
                    }
                }
                .padding(.vertical, 14)
                .overlay(alignment: .bottom) {
                    if index < progress.entries.count - 1 { SLHairline() }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.bottom, SL.Space.s6)
    }

    private var range: ClosedRange<Double> {
        let values = progress.points.map { ($0.weightKg as NSDecimalNumber).doubleValue }
        let low = values.min() ?? 0
        let high = values.max() ?? 1
        let padding = max((high - low) * 0.25, 0.5)
        return (low - padding)...(high + padding)
    }

    /// First, middle and last. The chart runs on time, so the middle label is
    /// the date halfway between the two ends — the middle weigh-in can sit
    /// anywhere along the line, and naming it under the centre misplaces it.
    private var chartLabels: [String] {
        let points = progress.points
        guard let first = points.first?.date, let last = points.last?.date else { return [] }
        guard points.count > 2 else {
            return [app.display.shortDate(first), app.display.shortDate(last)]
        }
        let middle = first.addingTimeInterval(last.timeIntervalSince(first) / 2)
        return [first, middle, last].map { app.display.shortDate($0) }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("No weigh-ins yet").slLead()
            Text("Weigh yourself in the morning, before eating. From the second weigh-in, your trend shows here.")
                .slBody()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                .foregroundStyle(SL.Ink.secondary)
        }
        .padding(.top, SL.Space.s2)
        .fixedSize(horizontal: false, vertical: true)
    }

    private func reload() {
        guard let state = app.state else {
            progress = BodyProgress.empty
            return
        }
        progress = BodyProgress.make(metrics: LegacyAdapter.metrics(from: state))
    }
}
