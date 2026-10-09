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
        case kracht = "Strength"
        case lichaam = "Body"
        case historiek = "Log"

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
                SLScreenTitle(title: "Progress", subtitle: "Last 8 weeks") { logbookPill }
                daySection
                volumeSection
                weightSection
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)
            .padding(.bottom, SL.Space.s6)
        }
    }

    /// Every logged workout, one tap from the top of the tab: neutral, since
    /// it reads rather than commits.
    private var logbookPill: some View {
        Button { open(.historiek) } label: {
            HStack(spacing: SL.Space.s2) {
                Image(systemName: "list.bullet").font(.system(size: 13, weight: .semibold))
                Text("Log").slBody(SL.Weight.semibold)
            }
            .foregroundStyle(SL.Ink.primary)
            .lineLimit(1)
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: SL.Space.hitMin)
            .background(Capsule().fill(SL.Surface.raised))
            .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .slFocusRing(Capsule())
        .accessibilityHint("Opens all your logged sessions")
    }

    private func open(_ target: Segment, exercise: String? = nil) {
        openingExercise = exercise
        segment = target
    }


    // MARK: - Body weight

    /// Body weight, kept small: a status beside the training it follows,
    /// not the screen's subject. The number and its movement on one line —
    /// tapping them opens every weigh-in — and the chart behind a toggle.
    private var weightSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s1) {
            Button { open(.lichaam) } label: { weightHead }
                .buttonStyle(.plain)
                .disabled(bodyProgress.entries.isEmpty)
                .accessibilityHint(bodyProgress.entries.isEmpty ? "" : "Opens all your weigh-ins and the trend")

            // What the number did, in words, beside the one action.
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                Text(movementLine)
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(movement?.moved == true ? SL.Signal.recovery : SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
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

    /// "+1.1 kg in 14 days", or how to start.
    private var movementLine: String {
        if let movement { return "\(movement.value) \(movement.label)" }
        return bodyProgress.entries.isEmpty
            ? "Weigh yourself in the morning, before eating."
            : "One more weigh-in and your trend starts."
    }

    /// A weigh-in is a status, not a training win: the number stays in ink and
    /// its movement in the recovery mint.
    private var weightHead: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s1))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s3))
        return layout {
            HStack(spacing: SL.Space.s1) {
                Text("Body weight").slBody()
                if !bodyProgress.entries.isEmpty {
                    SLGlyph(name: .chevronRight, size: 13).foregroundStyle(SL.Ink.tertiary)
                }
            }
            .foregroundStyle(SL.Ink.primary)
            if !typeSize.isAccessibilitySize { Spacer(minLength: SL.Space.s2) }
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                Text(bodyProgress.latest.map { app.display.kg($0.weightKg) } ?? "—")
                    .slLead(SL.Weight.semibold)
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            (bodyProgress.latest.map { "Body weight \(app.display.kg($0.weightKg))" } ?? "No weigh-in yet")
                + (movement.map { ", \($0.value) \($0.label)" } ?? "")
        )
    }

    // MARK: - Per training day

    /// Where the training itself moved: one row per kind of day, with the
    /// mean change of its lifts, the lift that gained most, and its strength
    /// per session as a small line.
    private var daySection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(title: "Strength", meta: "per training day")
            VStack(spacing: 0) {
                if days.isEmpty {
                    VStack(alignment: .leading, spacing: SL.Space.s1) {
                        Text("No weighted sets yet")
                            .slLead()
                            .foregroundStyle(SL.Ink.primary)
                        Text("Save a workout; your progress per day shows up here.")
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
                                        .overlay(alignment: .top) { SLHairline().padding(.leading, SL.Space.s4) }
                                }
                                .transition(.opacity)
                            }
                        }
                        .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                    }
                }
                // Every exercise, as the card's quiet last row.
                Button { open(.kracht) } label: {
                    HStack {
                        Text("All exercises").slBody()
                        Spacer()
                        SLGlyph(name: .chevronRight, size: 13).foregroundStyle(SL.Ink.tertiary)
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.horizontal, SL.Space.s4)
                    .frame(minHeight: 52)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SLRowButtonStyle())
                .overlay(alignment: .top) { SLHairline() }
                .accessibilityHint("Opens strength per exercise")
            }
            .slBorderBox()
            .slListCard()
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
                    Text("New")
                        .slMeta(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.s2)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(SL.Surface.raised2))
                        .fixedSize()
                }
                SLGlyph(name: .chevronRight, size: 13).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.leading, SL.Space.s6)
            .padding(.trailing, SL.Space.s4)
            .padding(.vertical, SL.Space.s3)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(lift.name), best set \(app.display.kg(lift.weightKg)) × \(lift.reps) on \(app.display.shortDate(lift.date))"
                + (gain.map { ", \($0) estimated" } ?? (lift.isNew ? ", new" : ""))
        )
        .accessibilityHint("Opens the strength of this exercise")
    }

    private func dayRow(_ day: ProgressOverview.DayProgress) -> some View {
        let change = day.changePercent
        let ink: Color = {
            guard let change else { return SL.Ink.secondary }
            return change > 0 ? SL.Signal.action : change < 0 ? SL.Signal.loss : SL.Ink.secondary
        }()
        let changeText = change.map { $0 == 0 ? "Steady" : "\(app.display.signedDelta($0)) %" }
        let sessions = day.sessions == 1 ? "1 session" : "\(day.sessions) sessions"
        let isOpen = openDays.contains(day.dayID)
        return Button {
            withAnimation(reduceMotion ? nil : .easeInOut(duration: SL.Motion.base)) {
                if isOpen { openDays.remove(day.dayID) } else { openDays.insert(day.dayID) }
            }
        } label: {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(day.label)
                        .slLead()
                        .foregroundStyle(SL.Ink.primary)
                    Text(sessions)
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                // The line is the day's best so far, so it climbs to the
                // number above it and never contradicts it. Neutral: the
                // number carries the colour.
                Group {
                    if let changeText {
                        // A gain or loss is the row's news; "Steady" is not.
                        Text(changeText)
                            .font(.sl(change == 0 ? SL.TypeSize.body : SL.TypeSize.title, change == 0 ? SL.Weight.medium : SL.Weight.semibold))
                            .slNumerals()
                            .foregroundStyle(ink)
                    } else {
                        Text("Too early")
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
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
                + (changeText.map { ", strength \($0) estimated" } ?? ", not enough to compare yet")
                + (day.leader.map { ", most progress \($0.name) plus \(app.display.number($0.deltaKg)) kilos" } ?? "")
        )
        .accessibilityHint(isOpen ? "Hides the exercises" : "Shows this day's exercises")
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
                Text(weighed ? "Edit weigh-in" : "Weigh in")
            }
            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
            .foregroundStyle(SL.Signal.action)
            .lineLimit(1)
            .slHitTarget()
        }
        .buttonStyle(.plain)
        .accessibilityHint(weighed
            ? "Opens today's weigh-in to update the weight"
            : "Opens the field to save today's weight")
    }

    /// How the 14-day average moved over the last fortnight; where the series
    /// is too short for that, how the weight itself moved over its own weeks.
    private var movement: (value: String, label: String, moved: Bool)? {
        if let last = trend.last,
           let earlier = trend.last(where: { $0.date <= last.date.addingTimeInterval(-14 * 86_400) }) {
            let change = Estimates.round(last.average - earlier.average, toIncrement: 0.1)
            return (signed(change), "in 14 days", change != 0)
        }
        if let change = bodyProgress.change {
            return (signed(change.value), change.weeks == 1 ? "in 1 week" : "in \(change.weeks) weeks", change.value != 0)
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
                title: "Volume",
                meta: "per week"
            )
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                volumeHeadline
                VolumeBars(weeks: volume, spoken: volumeSpoken)
            }
                .padding(SL.Space.s4)
                .slBorderBox()
                .slListCard()
        }
    }

    /// The chart's numbers, said once above it: this week so far, and the
    /// last full week to hold it against. Bars without a value say only
    /// "more" or "less".
    @ViewBuilder
    private var volumeHeadline: some View {
        if let current = volume.last {
            let previous = volume.dropLast().last
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s5) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(tonnes(current.volumeKg))
                        .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                    Text("this week").slMeta().foregroundStyle(SL.Ink.secondary)
                }
                if let previous {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(tonnes(previous.volumeKg))
                            .font(.sl(SL.TypeSize.title, SL.Weight.regular))
                            .slNumerals()
                            .foregroundStyle(SL.Ink.secondary)
                        Text("last week").slMeta().foregroundStyle(SL.Ink.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
        }
    }

    /// "9.4 t"
    private func tonnes(_ kg: Decimal) -> String {
        "\(app.display.number(Estimates.round(kg / 1000, toIncrement: 0.1))) t"
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
                    Text("Progress").slBody()
                }
                .foregroundStyle(SL.Ink.secondary)
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, SL.Space.s4)
            .padding(.top, SL.Space.s2)
            .accessibilityLabel("Back to the Progress overview")

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
                    Text(week.isCurrent ? "w\(week.number) · this week" : "w\(week.number)")
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
