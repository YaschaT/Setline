import SwiftUI
import SetlineCore

// The last things on Training: one line of progress, and the way into every
// workout. Both read what the account logged and nothing else.

// MARK: - Quick progress

/// One strength story, not the Progress tab: the lift that gained most in the
/// last eight weeks, its estimated max, what it moved, and its line — then at
/// most three numbers, each shown only when there is something to show.
/// "See all" is the Progress tab.
struct QuickProgressCard: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    let onSeeAll: () -> Void

    private struct Pick: Equatable {
        let name: String
        let progress: StrengthProgress
    }

    @State private var pick: Pick?
    @State private var stats: [(value: String, label: String)] = []

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(alignment: .firstTextBaseline) {
                SLOverline(text: "Quick progress")
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button(action: onSeeAll) {
                    HStack(spacing: 4) {
                        Text("See all").slMeta(SL.Weight.semibold)
                        SLGlyph(name: .chevronRight, size: 12)
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens Progress")
            }
            .padding(.leading, SL.Space.s1)

            Button(action: onSeeAll) { card }
                .buttonStyle(SLPressStyle(scale: 0.98))
        }
        .task(id: app.revision) { reload() }
    }

    @ViewBuilder
    private var card: some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            if let pick, let estimate = pick.progress.estimate {
                // Beside the numbers at normal sizes; under them once the text
                // is large, so nothing is cut to make room for the line.
                let large = typeSize.isAccessibilitySize
                let layout = large
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s3))
                    : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s4))
                layout {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(pick.name)
                            .slMeta(SL.Weight.medium)
                            .foregroundStyle(SL.Ink.secondary)
                            .lineLimit(large ? 3 : 1)
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text(app.display.number(Estimates.round(estimate, toIncrement: 0.5)))
                                .font(.sl(28, SL.Weight.semibold))
                                .foregroundStyle(SL.Ink.primary)
                            Text("kg est. 1RM")
                                .slMeta()
                                .foregroundStyle(SL.Ink.secondary)
                        }
                        .slNumerals()
                        .lineLimit(large ? 2 : 1)
                        .minimumScaleFactor(0.8)
                        if let change = pick.progress.change, let shown = pick.progress.shownChange(), shown != 0 {
                            // The pill holds the gain; the date sits beside it,
                            // and both shrink before they push the chart off.
                            HStack(spacing: 6) {
                                Text("\(app.display.signedDelta(shown)) kg\(percentText(pick.progress))")
                                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                                    .slNumerals()
                                    .foregroundStyle(shown > 0 ? SL.Signal.action : SL.Ink.secondary)
                                    .padding(.horizontal, SL.Space.s2)
                                    .padding(.vertical, 4)
                                    .background(Capsule().fill(shown > 0 ? SL.Signal.actionTint : SL.Surface.raised2))
                                Text("since \(app.display.shortDate(change.since))")
                                    .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                                    .foregroundStyle(SL.Ink.secondary)
                            }
                            .lineLimit(large ? 2 : 1)
                            .minimumScaleFactor(0.75)
                        }
                    }
                    if !large { Spacer(minLength: 0) }
                    if pick.progress.points.count > 1 {
                        StrengthArea(
                            values: pick.progress.points.map(\.estimate),
                            dates: pick.progress.points.map(\.date),
                            ink: SL.Signal.action
                        )
                        .frame(minWidth: 88, maxWidth: large ? .infinity : 128, minHeight: 64, maxHeight: 64)
                        .accessibilityHidden(true)
                    }
                }
            } else {
                HStack(spacing: SL.Space.s3) {
                    SLGlyph(name: .trendUp, size: 16, fixed: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(SL.Surface.raised2))
                    Text("Log a lift in two sessions and its trend shows here.")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
            }
            if !stats.isEmpty {
                SLHairline()
                HStack(alignment: .top, spacing: 0) {
                    ForEach(Array(stats.enumerated()), id: \.offset) { _, stat in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(stat.value)
                                .slBody(SL.Weight.semibold)
                                .slNumerals()
                                .foregroundStyle(SL.Ink.primary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            Text(stat.label)
                                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                                .foregroundStyle(SL.Ink.secondary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
        )
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }

    /// " (+4.8 %)", or nothing.
    private func percentText(_ progress: StrengthProgress) -> String {
        guard let percent = StrengthHeadline.percentChange(progress) else { return "" }
        return " · \(app.display.signedDelta(Estimates.round(percent, toIncrement: 1))) %"
    }

    private var spoken: String {
        var parts: [String] = []
        if let pick, let estimate = pick.progress.estimate {
            parts.append("\(pick.name), estimated max \(app.display.kg(Estimates.round(estimate, toIncrement: 0.5)))")
            if let change = pick.progress.change, let shown = pick.progress.shownChange(), shown != 0 {
                parts.append("\(app.display.signedDelta(shown)) kilos since \(app.display.shortDate(change.since))")
            }
        } else {
            parts.append("No strength trend yet")
        }
        parts += stats.map { "\($0.value) \($0.label)" }
        return parts.joined(separator: ", ")
    }

    private func reload() {
        let since = Calendar.current.date(byAdding: .day, value: -56, to: Date()) ?? Date()
        let days = ProgressOverview.progressByDay(in: app.sessions, since: since)
        // Every lift once, at its latest best.
        var latest: [String: ProgressOverview.DayProgress.Lift] = [:]
        for lift in days.flatMap(\.lifts) {
            if let kept = latest[lift.exerciseID], kept.date >= lift.date { continue }
            latest[lift.exerciseID] = lift
        }
        let lifts = Array(latest.values)
        // A main lift only, ranked by percent: an estimated max on a machine
        // fly is a number nobody lifts (`StrengthHeadline`).
        let rows = ExercisePicker.rows(sessions: app.sessions, favorites: app.favoriteExercises, custom: app.customExercises)
        pick = StrengthHeadline.pick(rows: rows, sessions: app.sessions, plan: app.plan)
            .map { Pick(name: $0.name, progress: $0) }

        // Training already counts workouts; these are the lift's own numbers.
        var next: [(value: String, label: String)] = []
        if let source = pick?.progress.source {
            next.append(("\(app.display.number(source.weightKg)) × \(source.reps)", "best set"))
        }
        if let week = ProgressOverview.weeklyVolume(in: app.sessions).last, week.volumeKg > 0 {
            next.append(("\(app.display.number(Estimates.round(week.volumeKg / 1000, toIncrement: 0.1))) t", "volume this week"))
        }
        let up = lifts.filter { ($0.deltaKg ?? 0) > 0 }.count
        if up > 0 { next.append(("\(up)", up == 1 ? "lift up · 8 wk" : "lifts up · 8 wk")) }
        stats = next
    }
}

// MARK: - Every workout

/// The log, reached from Training's All workouts row: the same list Progress
/// opens, in a sheet so Training stays where it was.
struct HistorySheet: View {
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SL.Space.s3) {
                Text("All workouts")
                    .slTitle()
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button(action: onClose) {
                    SLGlyph(name: .close, size: 16, fixed: true)
                        .foregroundStyle(SL.Ink.primary)
                        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                        .background(Circle().fill(SL.Surface.raised2))
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s4)
            .padding(.bottom, SL.Space.s2)
            HistoriekSegmentView()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SL.Surface.ground)
        .presentationDetents([.large])
        .presentationBackground(SL.Surface.ground)
    }
}
