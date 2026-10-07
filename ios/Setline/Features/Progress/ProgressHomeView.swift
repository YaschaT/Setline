import SwiftUI
import SetlineCore

/// Redesign 1d · Progressie.
///
/// The tab opens on an overview: body weight with its trend, the best set per
/// exercise over the last eight weeks, and the tonnage of the last seven. All
/// of it is read from what the account logged.
///
/// Behind the overview sit the three subjects the app has always had, one at a
/// time with the whole screen to itself: strength per exercise, every
/// weigh-in, and every session. Each part of the overview leads to the one it
/// summarises.
struct ProgressHomeView: View {
    enum Segment: String, CaseIterable, Identifiable {
        case kracht = "Kracht"
        case lichaam = "Lichaam"
        case historiek = "Historiek"

        var id: String { rawValue }
    }

    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    /// The subject that is open. `nil` is the overview.
    @State private var segment: Segment?
    /// The exercise Kracht opens on, when a best-set row led there.
    @State private var openingExercise: String?
    @State private var weighing = false

    @State private var bodyProgress = BodyProgress.empty
    @State private var trend: [ProgressOverview.WeightPoint] = []
    @State private var best: [ProgressOverview.RecentBest] = []
    @State private var volume: [ProgressOverview.WeekVolume] = []

    /// "Laatste 8 weken".
    private static let bestWindowDays = 56

    var body: some View {
        Group {
            if let segment {
                detail(segment)
            } else {
                overview
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .task(id: app.revision) { reload() }
        .sheet(isPresented: $weighing) {
            WeighInSheet(
                date: Date(),
                existing: app.weighIn(),
                latest: bodyProgress.latest?.weightKg,
                onSave: { weight in
                    weighing = false
                    Task { await app.saveWeighIn(weight) }
                },
                onClose: { weighing = false }
            )
        }
        .slRespondsToTextSize()
    }

    private func reload() {
        bodyProgress = BodyProgress.make(metrics: app.metrics)
        trend = ProgressOverview.weightTrend(bodyProgress)
        let since = Calendar.current.date(byAdding: .day, value: -Self.bestWindowDays, to: Date()) ?? Date()
        best = ProgressOverview.bestSets(in: app.sessions, since: since)
        volume = ProgressOverview.weeklyVolume(in: app.sessions)
    }

    // MARK: - Overview

    private var overview: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                SLScreenTitle(title: "Progressie", subtitle: range) { weighPill }
                weightSection
                bestSection
                volumeSection
                Button { open(.historiek) } label: { chevroned("Alle sessies") }
                    .buttonStyle(SLOutlineButtonStyle())
                    .accessibilityHint("Opent je sessiehistoriek")
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)
            .padding(.bottom, SL.Space.s6)
        }
    }

    private func open(_ target: Segment, exercise: String? = nil) {
        openingExercise = exercise
        segment = target
    }

    private func chevroned(_ title: String) -> some View {
        HStack(spacing: 6) {
            Text(title)
            SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.secondary)
        }
    }

    /// "Juni – september": the months the weigh-ins span.
    private var range: String {
        guard let first = bodyProgress.points.first?.date, let last = bodyProgress.points.last?.date else {
            return "Nog geen wegingen"
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        // Weigh-ins are dated in UTC, as `BodyProgress` parses them.
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "MMMM"
        let (from, to) = (formatter.string(from: first), formatter.string(from: last))
        let text = from == to ? from : "\(from) – \(to)"
        return text.prefix(1).uppercased() + text.dropFirst()
    }

    // MARK: - Body weight

    /// 1d's card, which is also the way to every weigh-in: the whole card
    /// opens Lichaam, as a best-set row opens its exercise. A link of its own
    /// made the card a row taller than 1d draws it; the chevron beside the
    /// card's label is the one mark that says it leads on.
    @ViewBuilder
    private var weightSection: some View {
        if bodyProgress.entries.isEmpty {
            weightCard
        } else {
            Button { open(.lichaam) } label: { weightCard }
                .buttonStyle(CardPressStyle())
                .accessibilityHint("Opent al je wegingen")
        }
    }

    /// A weigh-in is a status, not a training win: the number stays in ink and
    /// its movement in the recovery mint. Lime is only the line of the
    /// average, which is what the design draws the eye to.
    private var weightCard: some View {
        let head = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s2))
            : AnyLayout(HStackLayout(alignment: .bottom, spacing: SL.Space.s3))
        return VStack(alignment: .leading, spacing: SL.Space.s4) {
            head {
                VStack(alignment: .leading, spacing: SL.Space.s1) {
                    HStack(spacing: SL.Space.s1) {
                        Text("Lichaamsgewicht")
                            .slMeta()
                        if !bodyProgress.entries.isEmpty {
                            SLGlyph(name: .chevronRight, size: 13)
                                .accessibilityHidden(true)
                        }
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        // At the font's own line. 1d's `34px/1` as an exact
                        // line seats the baseline on the box's bottom edge on
                        // iOS 26, and "kg" then hangs below it: 4pt taller.
                        Text(bodyProgress.latest.map { app.display.number($0.weightKg) } ?? "—")
                            .font(.sl(SL.TypeSize.display, SL.Weight.semibold))
                            .slNumerals()
                            .foregroundStyle(SL.Ink.primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Text("kg")
                            .slLead(SL.Weight.regular)
                            .foregroundStyle(SL.Ink.primary)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(bodyProgress.latest.map { "Lichaamsgewicht \(app.display.kg($0.weightKg))" } ?? "Nog geen weging")
                if !typeSize.isAccessibilitySize { Spacer(minLength: SL.Space.s2) }
                if let movement {
                    VStack(alignment: typeSize.isAccessibilitySize ? .leading : .trailing, spacing: 2) {
                        Text(movement.value)
                            .slLead()
                            .slNumerals()
                            .foregroundStyle(movement.moved ? SL.Signal.recovery : SL.Ink.primary)
                        Text(movement.label)
                            .slMeta()
                            .slNumerals()
                            .foregroundStyle(SL.Ink.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }
            }

            if trend.count > 1 {
                WeightTrendChart(points: trend)
            } else {
                Text(trend.isEmpty
                     ? "Weeg jezelf 's ochtends, nuchter. Vanaf de tweede weging staat je verloop hier."
                     : "Nog één weging en je verloop en het 14-daagse gemiddelde staan hier.")
                    .slBody()
                    .slLineHeight(1.45, size: SL.TypeSize.body)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.secondary)
            }
        }
        .padding(SL.Space.s4)
        .slBorderBox()
        .frame(maxWidth: .infinity, alignment: .leading)
        .slHeroCard()
    }

    /// The screen's one commit, in the place 1e gives its own: a lime pill
    /// beside the title. A day already weighed offers the correction rather
    /// than a second weigh-in.
    private var weighPill: some View {
        let weighed = app.weighIn() != nil
        return Button { weighing = true } label: {
            HStack(spacing: SL.Space.s2) {
                // The plus adds; a correction adds nothing.
                if !weighed { SLGlyph(name: .plus, size: 14) }
                Text(weighed ? "Weging wijzigen" : "Weeg jezelf").slBody(SL.Weight.semibold)
            }
            .foregroundStyle(SL.Signal.onAction)
            .lineLimit(1)
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: SL.Space.hitMin)
            .background(Capsule().fill(SL.Signal.action))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .slFocusRing(Capsule())
        .accessibilityHint(weighed
            ? "Opent je weging van vandaag om het gewicht bij te werken"
            : "Opent het veld om je gewicht van vandaag te bewaren")
    }

    /// How the 14-day average moved over the last fortnight; where the series
    /// is too short for that, how the weight itself moved over its own weeks.
    private var movement: (value: String, label: String, moved: Bool)? {
        if let last = trend.last,
           let earlier = trend.last(where: { $0.date <= last.date.addingTimeInterval(-14 * 86_400) }) {
            let change = Estimates.round(last.average - earlier.average, toIncrement: 0.1)
            return (signed(change), "14-daags gem.", change != 0)
        }
        if let change = bodyProgress.change {
            return (signed(change.value), change.weeks == 1 ? "in 1 week" : "in \(change.weeks) weken", change.value != 0)
        }
        return nil
    }

    /// "−0,4 kg", "+0,3 kg", "0 kg".
    private func signed(_ value: Decimal) -> String {
        value == 0 ? "0 kg" : "\(app.display.signedDelta(value)) kg"
    }

    // MARK: - Best sets

    private var bestSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(title: "Beste sets", meta: "laatste 8 weken")
            VStack(spacing: 0) {
                if best.isEmpty {
                    VStack(alignment: .leading, spacing: SL.Space.s1) {
                        Text("Nog geen sets met gewicht")
                            .slLead()
                            .foregroundStyle(SL.Ink.primary)
                        Text("Sla een training op; je beste set per oefening verschijnt hier.")
                            .slBody()
                            .slLineHeight(1.45, size: SL.TypeSize.body)
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(SL.Ink.secondary)
                    }
                    .padding(SL.Space.s4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ForEach(Array(best.enumerated()), id: \.element.id) { index, row in
                        bestRow(row)
                            .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                    }
                }
            }
            .slBorderBox()
            .slListCard()

            Button { open(.kracht) } label: { chevroned("Kracht per oefening") }
                .buttonStyle(SLOutlineButtonStyle())
                .padding(.top, SL.Space.s1)
        }
    }

    private func bestRow(_ row: ProgressOverview.RecentBest) -> some View {
        let delta = row.delta
        // The change, where an earlier set was performed the same way; "nieuw"
        // only where nothing came before. A lift trained before in another
        // way is neither, and the row then says nothing beside the set.
        let claim: (value: String, caption: String)? = delta.map { (signed($0), "geschat t.o.v. vorige beste") }
            ?? (row.hasEarlierBest ? nil : ("nieuw", "geen eerdere beste"))
        let ink: Color = {
            guard let delta else { return SL.Ink.secondary }
            return delta > 0 ? SL.Signal.action : delta < 0 ? SL.Signal.loss : SL.Ink.secondary
        }()
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s2))
            : AnyLayout(HStackLayout(alignment: .center, spacing: 14))
        return Button { open(.kracht, exercise: row.exerciseID) } label: {
            layout {
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.name)
                        .slLead()
                        .slLineHeight(1.3, size: SL.TypeSize.lead)
                        .foregroundStyle(SL.Ink.primary)
                    Text("\(app.display.kg(row.weightKg)) × \(row.reps) · \(app.display.shortDate(row.date))")
                        .slBody()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)

                // On screen only the claim itself: the change, or a "Nieuw"
                // tag. What it is measured against is said once, to VoiceOver,
                // rather than under every row.
                if delta != nil, let claim {
                    Text(claim.value)
                        .slLead()
                        .slNumerals()
                        .foregroundStyle(ink)
                        .lineLimit(1)
                        .fixedSize()
                } else if claim != nil {
                    Text("Nieuw")
                        .slMeta(SL.Weight.semibold)
                        .foregroundStyle(SL.Signal.action)
                        .padding(.horizontal, SL.Space.s2)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(SL.Signal.actionTint))
                        .fixedSize()
                }
            }
            .padding(.horizontal, SL.Space.s4)
            .padding(.vertical, SL.Space.s3)
            .frame(minHeight: 72)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(row.name), beste set \(app.display.kg(row.weightKg)) × \(row.reps) op \(app.display.shortDate(row.date))"
                + (claim.map { ", \($0.value), \($0.caption)" } ?? "")
        )
        .accessibilityHint("Opent de kracht van deze oefening")
    }

    // MARK: - Volume

    private var volumeSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(
                title: "Volume per week",
                meta: volume.first.map { first in "ton · w\(first.number)–w\(volume.last?.number ?? first.number)" }
            )
            VolumeBars(weeks: volume, spoken: volumeSpoken)
                .padding(SL.Space.s4)
                .slBorderBox()
                .slListCard()
        }
    }

    /// "week 35: 4,2 ton, week 36: 0 ton, …"
    private var volumeSpoken: String {
        volume.map { week in
            "week \(week.number): \(app.display.number(Estimates.round(week.volumeKg / 1000, toIncrement: 0.1))) ton"
        }
        .joined(separator: ", ")
    }

    // MARK: - One subject

    private func detail(_ current: Segment) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { segment = nil } label: {
                HStack(spacing: 2) {
                    SLGlyph(name: .chevronLeft, size: 18)
                    Text("Progressie").slBody()
                }
                .foregroundStyle(SL.Ink.secondary)
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, SL.Space.s4)
            .padding(.top, SL.Space.s2)
            .accessibilityLabel("Terug naar het overzicht van Progressie")

            segmentControl(current)
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s1)

            switch current {
            case .kracht:
                StrengthSegmentView(opening: openingExercise)
            case .historiek:
                HistoriekSegmentView()
            case .lichaam:
                LichaamSegmentView()
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Three across, until three across would mean "Histori…". At accessibility
    /// sizes they take a row each and keep their names.
    private func segmentControl(_ current: Segment) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 4))
            : AnyLayout(HStackLayout(spacing: 0))

        return layout {
            ForEach(Segment.allCases) { item in
                let isOn = current == item
                Button {
                    openingExercise = nil
                    segment = item
                } label: {
                    Text(item.rawValue)
                        .slBody(isOn ? SL.Weight.semibold : SL.Weight.regular)
                        .foregroundStyle(isOn ? SL.Signal.action : SL.Ink.secondary)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Space.hitMin)
                        .background(
                            RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous)
                                .fill(isOn ? SL.Signal.actionTint : Color.clear)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(SL.Space.s1)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
        )
    }
}

/// A card that is itself the way on: it dims while pressed, where a row
/// darkens, because its own surface stays on top.
private struct CardPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.7 : 1)
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous))
    }
}

// MARK: - Charts

/// Body weight as the redesign draws it: every weigh-in in grey, the trailing
/// average in lime with its latest point marked, two hairlines behind them,
/// the months underneath and a legend that names both lines.
///
/// Drawn rather than charted: two lines on a fixed 96pt plot, stretched to the
/// card's width, with no axis to read.
struct WeightTrendChart: View {
    let points: [ProgressOverview.WeightPoint]

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            GeometryReader { proxy in
                let plot = plot(in: proxy.size)
                ZStack {
                    Path { path in
                        for fraction in [0.37, 0.69] {
                            let y = proxy.size.height * fraction
                            path.move(to: CGPoint(x: 0, y: y))
                            path.addLine(to: CGPoint(x: proxy.size.width, y: y))
                        }
                    }
                    .stroke(SL.Surface.hairline, lineWidth: 1)

                    line(plot.daily)
                        .stroke(SL.Ink.primary.opacity(0.35), style: StrokeStyle(lineWidth: 2, lineJoin: .round))
                    line(plot.average)
                        .stroke(SL.Signal.action, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    if let end = plot.average.last {
                        Circle()
                            .fill(SL.Signal.action)
                            .frame(width: 8, height: 8)
                            .position(end)
                    }
                }
            }
            .frame(height: 96)
            .accessibilityElement()
            .accessibilityLabel("Verloop van je gewicht over \(points.count) wegingen, met het 14-daagse gemiddelde")

            if months.count > 1 {
                HStack(spacing: 0) {
                    ForEach(Array(months.enumerated()), id: \.offset) { index, month in
                        Text(month)
                            .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                            .foregroundStyle(SL.Ink.secondary)
                        if index < months.count - 1 { Spacer(minLength: SL.Space.s1) }
                    }
                }
                .accessibilityHidden(true)
            }

            SLFlow(spacing: SL.Space.s4, lineSpacing: SL.Space.s1) {
                legend("dagwaarde", color: SL.Ink.primary.opacity(0.35), height: 2)
                legend("14-daags gemiddelde", color: SL.Signal.action, height: 3)
            }
            .accessibilityHidden(true)
        }
    }

    private func legend(_ text: String, color: Color, height: CGFloat) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: height / 2, style: .continuous)
                .fill(color)
                .frame(width: 14, height: height)
            Text(text).slMeta().foregroundStyle(SL.Ink.meta)
        }
    }

    private func line(_ points: [CGPoint]) -> Path {
        Path { path in
            guard let first = points.first else { return }
            path.move(to: first)
            for point in points.dropFirst() { path.addLine(to: point) }
        }
    }

    /// Both series on one scale: time left to right, weight bottom to top.
    /// 1d draws the lines in a band from 28 % to 70 % of the plot's height —
    /// around the two hairlines, not past them — so a change of a kilo reads
    /// as a slope rather than a cliff.
    private func plot(in size: CGSize) -> (daily: [CGPoint], average: [CGPoint]) {
        guard let first = points.first?.date, let last = points.last?.date else { return ([], []) }
        let span = max(last.timeIntervalSince(first), 1)
        let values = points.flatMap { [double($0.weightKg), double($0.average)] }
        let low = values.min() ?? 0
        let range = max((values.max() ?? 1) - low, 0.1)
        let (top, bottom) = (size.height * 0.28, size.height * 0.70)

        func place(_ date: Date, _ value: Decimal) -> CGPoint {
            CGPoint(
                x: 2 + (size.width - 4) * date.timeIntervalSince(first) / span,
                y: top + (bottom - top) * (1 - (double(value) - low) / range)
            )
        }
        return (
            points.map { place($0.date, $0.weightKg) },
            points.map { place($0.date, $0.average) }
        )
    }

    private func double(_ value: Decimal) -> Double {
        (value as NSDecimalNumber).doubleValue
    }

    /// "jun", "jul", "aug", "sep" — each month the series touches.
    private var months: [String] {
        guard let first = points.first?.date, let last = points.last?.date else { return [] }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "MMM"

        var labels: [String] = []
        var cursor = calendar.date(from: calendar.dateComponents([.year, .month], from: first)) ?? first
        while cursor <= last, labels.count < 12 {
            labels.append(formatter.string(from: cursor).replacingOccurrences(of: ".", with: ""))
            guard let next = calendar.date(byAdding: .month, value: 1, to: cursor) else { break }
            cursor = next
        }
        return labels
    }
}

/// Tonnage per week as bars, this week in full lime.
struct VolumeBars: View {
    let weeks: [ProgressOverview.WeekVolume]
    let spoken: String

    var body: some View {
        let highest = max(weeks.map { double($0.volumeKg) }.max() ?? 0, 1)
        VStack(spacing: SL.Space.s2) {
            GeometryReader { proxy in
                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(weeks) { week in
                        UnevenRoundedRectangle(
                            topLeadingRadius: SL.Radius.sm,
                            topTrailingRadius: SL.Radius.sm,
                            style: .continuous
                        )
                        .fill(week.isCurrent ? SL.Signal.action : SL.Signal.action.opacity(0.28))
                        // A week without a workout keeps a sliver, so the row
                        // of weeks stays readable as a row.
                        .frame(height: max(2, proxy.size.height * double(week.volumeKg) / highest))
                        .frame(maxWidth: .infinity)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .bottom)
            }
            .frame(height: 88)
            .accessibilityElement()
            .accessibilityLabel(spoken)

            HStack(spacing: 0) {
                ForEach(Array(labelled.enumerated()), id: \.element.id) { index, week in
                    Text(week.isCurrent ? "w\(week.number) · deze week" : "w\(week.number)")
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .slNumerals()
                        .foregroundStyle(week.isCurrent ? SL.Signal.action : SL.Ink.secondary)
                        .lineLimit(1)
                    if index < labelled.count - 1 { Spacer(minLength: SL.Space.s1) }
                }
            }
            .accessibilityHidden(true)
        }
    }

    /// Every other week and the last, as the design labels them.
    private var labelled: [ProgressOverview.WeekVolume] {
        weeks.enumerated().filter { $0.offset % 2 == 0 || $0.offset == weeks.count - 1 }.map(\.element)
    }

    private func double(_ value: Decimal) -> Double {
        (value as NSDecimalNumber).doubleValue
    }
}
