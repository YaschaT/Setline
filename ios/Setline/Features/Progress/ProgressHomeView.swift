import SwiftUI
import SetlineCore

/// Redesign 1d · Progressie.
///
/// The tab opens on an overview, training first: how each kind of training
/// day (Push, Pull, Legs, Upper, Lower) moved over the last eight weeks — each
/// opening onto its lifts' best sets — the tonnage of the last seven weeks, and last, body
/// weight as one compact card whose chart opens on request. All of it is read
/// from what the account logged.
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The subject that is open. `nil` is the overview.
    @State private var segment: Segment?
    /// The exercise Kracht opens on, when a best-set row led there.
    @State private var openingExercise: String?
    @State private var weighing = false
    @State private var explainingDays = false
    /// Whether the weight card shows its chart; remembered across launches.
    @AppStorage("setline.progress.weightChart") private var showsWeightChart = false

    @State private var bodyProgress = BodyProgress.empty
    @State private var trend: [ProgressOverview.WeightPoint] = []
    /// The training days opened to show their lifts.
    @State private var openDays: Set<String> = []
    @State private var volume: [ProgressOverview.WeekVolume] = []
    @State private var days: [ProgressOverview.DayProgress] = []

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
        days = ProgressOverview.progressByDay(in: app.sessions, since: since)
        volume = ProgressOverview.weeklyVolume(in: app.sessions)
    }

    // MARK: - Overview

    private var overview: some View {
        ScrollView {
            // 24 between sections, 8 from a section's head to its card: the
            // gap says what belongs together.
            VStack(alignment: .leading, spacing: SL.Space.s6) {
                SLScreenTitle(title: "Progressie", subtitle: "Laatste 8 weken")
                daySection
                volumeSection
                weightSection
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

    // MARK: - Body weight

    /// Body weight, kept small: a status beside the training it follows,
    /// not the screen's subject. The number and its movement on one line —
    /// tapping them opens every weigh-in — and the chart behind a toggle.
    private var weightSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            Button { open(.lichaam) } label: { weightHead }
                .buttonStyle(.plain)
                .disabled(bodyProgress.entries.isEmpty)
                .accessibilityHint(bodyProgress.entries.isEmpty ? "" : "Opent al je wegingen")

            if trend.count > 1, showsWeightChart {
                WeightTrendChart(points: trend)
                    .transition(.opacity)
            } else if trend.count <= 1 {
                Text(trend.isEmpty
                     ? "Weeg jezelf 's ochtends, nuchter."
                     : "Nog één weging en je verloop staat hier.")
                    .slMeta()
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.secondary)
            }

            // The card's two actions: the chart, and weighing in. Weighing
            // lives here, beside the number it changes, so the screen's head
            // belongs to training.
            HStack(spacing: SL.Space.s3) {
                if trend.count > 1 {
                    Button {
                        withAnimation(.easeInOut(duration: SL.Motion.base)) { showsWeightChart.toggle() }
                    } label: {
                        HStack(spacing: SL.Space.s1) {
                            Text(showsWeightChart ? "Verberg verloop" : "Toon verloop")
                            SLGlyph(name: .chevronDown, size: 13)
                                .rotationEffect(.degrees(showsWeightChart ? 180 : 0))
                        }
                        .font(.sl(SL.TypeSize.meta, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.secondary)
                        .slHitTarget()
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 0)
                weighButton
            }
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.top, SL.Space.s4)
        .padding(.bottom, SL.Space.s1)
        .slBorderBox()
        .frame(maxWidth: .infinity, alignment: .leading)
        .slListCard()
    }

    /// A weigh-in is a status, not a training win: the number stays in ink and
    /// its movement in the recovery mint.
    private var weightHead: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s1))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s3))
        return layout {
            HStack(spacing: SL.Space.s1) {
                Text("Lichaamsgewicht").slBody()
                if !bodyProgress.entries.isEmpty {
                    SLGlyph(name: .chevronRight, size: 13).foregroundStyle(SL.Ink.tertiary)
                }
            }
            .foregroundStyle(SL.Ink.primary)
            if !typeSize.isAccessibilitySize { Spacer(minLength: SL.Space.s2) }
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                if let movement {
                    Text(movement.value)
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(movement.moved ? SL.Signal.recovery : SL.Ink.secondary)
                }
                Text(bodyProgress.latest.map { app.display.kg($0.weightKg) } ?? "—")
                    .slLead(SL.Weight.semibold)
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            (bodyProgress.latest.map { "Lichaamsgewicht \(app.display.kg($0.weightKg))" } ?? "Nog geen weging")
                + (movement.map { ", \($0.value) \($0.label)" } ?? "")
        )
    }

    // MARK: - Per training day

    /// Where the training itself moved: one row per kind of day, with the
    /// mean change of its lifts, the lift that gained most, and its strength
    /// per session as a small line.
    private var daySection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(spacing: SL.Space.s1) {
                Text("Per trainingsdag")
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                Button { explainingDays = true } label: {
                    Image(systemName: "info.circle")
                        .font(.system(size: 15))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, -12)
                .accessibilityLabel("Hoe wordt dit gemeten?")
                Spacer(minLength: SL.Space.s2)
                // Said once for every row: what the percentages are.
                Text("geschatte kracht")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .padding(.horizontal, SL.Space.s1)
            .alert("Kracht per trainingsdag", isPresented: $explainingDays) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Per oefening je beste set van de laatste 8 weken, als geschatte max, tegenover je beste daarvoor, of je eerste sessie als de oefening nieuw is. Het percentage is het gemiddelde over de oefeningen van die dag; de lijn is je beste tot dan toe per sessie.")
            }
            VStack(spacing: 0) {
                if days.isEmpty {
                    VStack(alignment: .leading, spacing: SL.Space.s1) {
                        Text("Nog geen sets met gewicht")
                            .slLead()
                            .foregroundStyle(SL.Ink.primary)
                        Text("Sla een training op; je vooruitgang per dag verschijnt hier.")
                            .slBody()
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(SL.Ink.secondary)
                    }
                    .padding(SL.Space.s4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                        VStack(spacing: 0) {
                            dayRow(day)
                            if openDays.contains(day.dayID) {
                                ForEach(day.lifts) { lift in
                                    liftRow(lift)
                                        .overlay(alignment: .top) { SLHairline().padding(.leading, 68) }
                                }
                                .transition(.opacity)
                            }
                        }
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

    /// One lift of an opened day: its best set in the window and what it
    /// gained, or that it is new. Opens Kracht on that lift.
    private func liftRow(_ lift: ProgressOverview.DayProgress.Lift) -> some View {
        let gain: String? = lift.deltaKg.map { $0 == 0 ? "0 kg" : "\(app.display.signedDelta($0)) kg" }
        let ink: Color = {
            guard let delta = lift.deltaKg else { return SL.Ink.secondary }
            return delta > 0 ? SL.Signal.action : delta < 0 ? SL.Signal.loss : SL.Ink.secondary
        }()
        return Button { open(.kracht, exercise: lift.exerciseID) } label: {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(lift.name)
                        .slBody()
                        .foregroundStyle(SL.Ink.primary)
                    Text("\(app.display.kg(lift.weightKg)) × \(lift.reps) · \(app.display.shortDate(lift.date))")
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let gain {
                    Text(gain)
                        .slBody(SL.Weight.semibold)
                        .slNumerals()
                        .foregroundStyle(ink)
                        .fixedSize()
                } else if lift.isNew {
                    Text("Nieuw")
                        .slMeta(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.s2)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(SL.Surface.raised2))
                        .fixedSize()
                }
                SLGlyph(name: .chevronRight, size: 13).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.leading, 68)
            .padding(.trailing, SL.Space.s4)
            .padding(.vertical, SL.Space.s3)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(lift.name), beste set \(app.display.kg(lift.weightKg)) × \(lift.reps) op \(app.display.shortDate(lift.date))"
                + (gain.map { ", \($0) geschat" } ?? (lift.isNew ? ", nieuw" : ""))
        )
        .accessibilityHint("Opent de kracht van deze oefening")
    }

    private func dayRow(_ day: ProgressOverview.DayProgress) -> some View {
        let change = day.changePercent
        let ink: Color = {
            guard let change else { return SL.Ink.secondary }
            return change > 0 ? SL.Signal.action : change < 0 ? SL.Signal.loss : SL.Ink.secondary
        }()
        let changeText = change.map { $0 == 0 ? "0 %" : "\(app.display.signedDelta($0)) %" }
        let sessions = day.sessions == 1 ? "1 sessie" : "\(day.sessions) sessies"
        let detail = [sessions, day.leader.map { "\($0.name) +\(app.display.number($0.deltaKg)) kg" }]
            .compactMap { $0 }
            .joined(separator: " · ")
        let isOpen = openDays.contains(day.dayID)
        return Button {
            withAnimation(reduceMotion ? nil : .easeInOut(duration: SL.Motion.base)) {
                if isOpen { openDays.remove(day.dayID) } else { openDays.insert(day.dayID) }
            }
        } label: {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                SLGlyph(name: .category(for: day.label), size: 20)
                    .foregroundStyle(SL.Ink.primary)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(SL.Surface.raised2))
                VStack(alignment: .leading, spacing: 2) {
                    Text(day.label)
                        .slLead()
                        .foregroundStyle(SL.Ink.primary)
                    Text(detail)
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                // The line is the day's best so far, so it climbs to the
                // number above it and never contradicts it. Neutral: the
                // number carries the colour.
                VStack(alignment: .trailing, spacing: SL.Space.s1) {
                    if let changeText {
                        Text(changeText)
                            .slLead(SL.Weight.semibold)
                            .slNumerals()
                            .foregroundStyle(ink)
                    } else {
                        Text("Te vroeg")
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                    }
                    if day.strength.count > 1 {
                        Sparkline(values: day.strength)
                            .stroke(SL.Ink.tertiary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                            .frame(width: 48, height: 14)
                    }
                }
                .fixedSize()
                SLGlyph(name: .chevronDown, size: 13)
                    .foregroundStyle(SL.Ink.tertiary)
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
            }
            .padding(.horizontal, SL.Space.s4)
            .padding(.vertical, SL.Space.s3)
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(day.label), \(sessions)"
                + (changeText.map { ", kracht \($0) geschat" } ?? ", nog te weinig om te vergelijken")
                + (day.leader.map { ", meeste vooruitgang \($0.name) plus \(app.display.number($0.deltaKg)) kilo" } ?? "")
        )
        .accessibilityHint(isOpen ? "Verbergt de oefeningen" : "Toont de oefeningen van deze dag")
        .accessibilityAddTraits(isOpen ? .isSelected : [])
    }

    /// Weighing in, from the weight card: lime text rather than a filled
    /// pill, since training owns the screen. A day already weighed offers the
    /// correction rather than a second weigh-in.
    private var weighButton: some View {
        let weighed = app.weighIn() != nil
        return Button { weighing = true } label: {
            HStack(spacing: SL.Space.s1) {
                // The plus adds; a correction adds nothing.
                if !weighed { SLGlyph(name: .plus, size: 13) }
                Text(weighed ? "Weging wijzigen" : "Weeg jezelf")
            }
            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
            .foregroundStyle(SL.Signal.action)
            .lineLimit(1)
            .slHitTarget()
        }
        .buttonStyle(.plain)
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

// MARK: - Charts

/// A series as a small line across its frame, lowest at the bottom: the shape
/// of the numbers, not the numbers.
private struct Sparkline: Shape {
    let values: [Decimal]

    func path(in rect: CGRect) -> Path {
        let numbers = values.map { NSDecimalNumber(decimal: $0).doubleValue }
        guard numbers.count > 1, let low = numbers.min(), let high = numbers.max() else { return Path() }
        let span = high - low
        return Path { path in
            for (index, value) in numbers.enumerated() {
                let x = rect.minX + rect.width * Double(index) / Double(numbers.count - 1)
                let y = rect.maxY - (span > 0 ? (value - low) / span : 0.5) * rect.height
                if index == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
            }
        }
    }
}

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
