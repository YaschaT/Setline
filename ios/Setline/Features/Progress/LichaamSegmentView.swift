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
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                if let latest = progress.latest {
                    header(latest)
                    if !progress.entries.isEmpty { entries }
                } else {
                    VStack(alignment: .leading, spacing: SL.Space.s5) {
                        emptyState
                        weighInButton
                    }
                    .padding(SL.Space.s5)
                    .slBorderBox()
                    .slListCard(radius: SL.Radius.xl)
                }
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s3)
            .padding(.bottom, SL.Space.s8)
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

    /// The weight as a hero card: the number, how it moved as a mint pill,
    /// the line, and the one action.
    private func header(_ latest: BodyProgress.Entry) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            VStack(alignment: .leading, spacing: SL.Space.s1) {
                HStack(alignment: .firstTextBaseline, spacing: SL.Space.s1) {
                    Text(app.display.number(latest.weightKg))
                        .font(.slCapped(48, SL.Weight.semibold, maxScale: 1.4))
                        .slNumerals()
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .foregroundStyle(SL.Ink.primary)
                    Text("kg").slLead().foregroundStyle(SL.Ink.secondary)
                    Spacer(minLength: SL.Space.s2)
                    if let change = progress.change {
                        Text("\(app.display.signedDelta(change.value)) kg · \(change.weeks) wk")
                            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                            .slNumerals()
                            .foregroundStyle(SL.Signal.recovery)
                            .padding(.horizontal, SL.Space.s3)
                            .padding(.vertical, 5)
                            .background(Capsule().fill(SL.Signal.recoveryTint))
                            .fixedSize()
                    }
                }
                Text("Last weigh-in · \(app.display.shortDate(latest.date))")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .accessibilityElement(children: .combine)

            if progress.points.count > 1 { chart }
            weighInButton
        }
        .padding(SL.Space.s5)
        .slBorderBox()
        .slListCard(radius: SL.Radius.xl)
    }

    private var chart: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Chart(progress.points) { entry in
                AreaMark(
                    x: .value("Date", entry.date),
                    yStart: .value("Floor", range.lowerBound),
                    yEnd: .value("Weight", (entry.weightKg as NSDecimalNumber).doubleValue)
                )
                .foregroundStyle(SL.Signal.recovery.opacity(0.08))
                LineMark(
                    x: .value("Date", entry.date),
                    y: .value("Weight", (entry.weightKg as NSDecimalNumber).doubleValue)
                )
                .interpolationMethod(.monotone)
                .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                .foregroundStyle(SL.Signal.recovery)
                if entry.id == progress.points.last?.id {
                    PointMark(
                        x: .value("Date", entry.date),
                        y: .value("Weight", (entry.weightKg as NSDecimalNumber).doubleValue)
                    )
                    .symbolSize(70)
                    .foregroundStyle(SL.Signal.recovery)
                }
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .chartYScale(domain: range)
            .frame(height: 140)
            .accessibilityLabel("Your weight over \(progress.points.count) weigh-ins")

            let labels = chartLabels
            HStack(spacing: 0) {
                ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                    Text(label)
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.secondary)
                    if index < labels.count - 1 { Spacer(minLength: SL.Space.s2) }
                }
            }
            .accessibilityHidden(true)
        }
    }

    /// Every weigh-in, newest first, in one card; each change as a quiet pill.
    private var entries: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("Weigh-ins")
                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.primary)
                .padding(.horizontal, SL.Space.s1)
                .padding(.top, SL.Space.s3)
                .padding(.bottom, SL.Space.s1)
                .accessibilityAddTraits(.isHeader)

            VStack(spacing: 0) {
                ForEach(Array(progress.entries.enumerated()), id: \.element.id) { index, entry in
                    HStack(alignment: .center, spacing: SL.Space.s3) {
                        Text(app.display.shortDate(entry.date))
                            .slBody()
                            .foregroundStyle(SL.Ink.secondary)
                        Spacer(minLength: SL.Space.s4)
                        Text(app.display.kg(entry.weightKg))
                            .slBody(SL.Weight.semibold)
                            .slNumerals()
                            .foregroundStyle(SL.Ink.primary)
                        Group {
                            if let change = entry.change {
                                Text(change == 0 ? "±0" : app.display.signedDelta(change))
                                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                                    .slNumerals()
                                    .foregroundStyle(change == 0 ? SL.Ink.secondary : SL.Signal.recovery)
                                    .padding(.horizontal, SL.Space.s2)
                                    .padding(.vertical, 3)
                                    .background(Capsule().fill(change == 0 ? SL.Surface.raised2 : SL.Signal.recoveryTint))
                            } else {
                                Text("Start")
                                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                                    .foregroundStyle(SL.Ink.secondary)
                                    .padding(.horizontal, SL.Space.s2)
                                    .padding(.vertical, 3)
                                    .background(Capsule().fill(SL.Surface.raised2))
                            }
                        }
                        .frame(minWidth: changeWidth + 12, alignment: .trailing)
                    }
                    .padding(.horizontal, SL.Space.s4)
                    .frame(minHeight: 52)
                    .overlay(alignment: .top) { if index > 0 { SLHairline().padding(.leading, SL.Space.s4) } }
                    .accessibilityElement(children: .combine)
                }
            }
            .slBorderBox()
            .slListCard()
        }
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
