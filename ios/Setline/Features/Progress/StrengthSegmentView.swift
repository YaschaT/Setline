import Charts
import SwiftUI
import UIKit
import SetlineCore

/// Artboard 40a · Progressie, segment Kracht.
///
/// One exercise at a time, and the exercise's own name is the control: it says
/// what you are looking at and is where you change it (40b). Under it, three
/// layers of the same number — the estimate, what it moved since a date, and
/// the set it was computed from — so the headline can be read at a glance and
/// questioned without leaving the screen.
///
/// Comparability is settled before anything is drawn: `ExerciseHistory`
/// applies TRAINING_LOGIC §1, so every point on the chart and every row in the
/// list belongs to the same series.
struct StrengthSegmentView: View {
    @Environment(AppState.self) private var app

    /// The exercise on screen. Opens on the one a best-set row pointed at,
    /// where the overview led here from one.
    @State private var selected: String?
    @State private var progress: StrengthProgress?
    @State private var rows: [ExercisePicker.Row] = []
    /// The comparable series this exercise has. More than one means the same
    /// lift was trained two ways — paused and not — and the screen has to say
    /// which one its number is about.
    @State private var series: [ExerciseHistory.Series] = []
    @State private var picking = false
    @State private var explaining = false

    init(opening exerciseID: String? = nil) {
        _selected = State(initialValue: exerciseID)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if rows.isEmpty {
                    emptyState
                } else {
                    title
                    if let progress {
                        estimateBlock(progress)
                        if progress.points.count > 1 { chart(progress) }
                        if progress.rows.isEmpty { untrained } else { sessionList(progress) }
                    }
                }
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, 22)
        }
        .task(id: app.revision) { reload() }
        .onChange(of: selected) { _, _ in reloadProgress() }
        .sheet(isPresented: $picking) {
            ExercisePickerSheet(
                rows: rows,
                selected: selected,
                onPick: { row in
                    selected = row.exerciseID
                    picking = false
                },
                onStar: { row in
                    Task { await app.setFavorite(exerciseID: row.exerciseID, isFavorite: !row.isFavorite) }
                },
                onClose: { picking = false }
            )
        }
        .sheet(isPresented: $explaining) {
            if let progress {
                OneRepMaxSheet(progress: progress, onClose: { explaining = false })
            }
        }
    }

    // MARK: - The exercise is the title

    private var title: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SL.Space.s3) {
                Button { picking = true } label: {
                    HStack(spacing: 6) {
                        Text(progress?.name ?? "Oefening")
                            .font(.sl(28, SL.Weight.semibold))
                            .foregroundStyle(SL.Ink.primary)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                            .multilineTextAlignment(.leading)
                        Image(systemName: "chevron.down")
                            .font(.sl(20, SL.Weight.medium))
                            .foregroundStyle(SL.Ink.secondary)
                    }
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Oefening: \(progress?.name ?? "geen")")
                .accessibilityHint("Dubbeltik om een andere oefening te kiezen")
                .accessibilityAddTraits(.isHeader)

                Spacer(minLength: SL.Space.s2)

                if let current {
                    Button {
                        Task { await app.setFavorite(exerciseID: current.exerciseID, isFavorite: !current.isFavorite) }
                    } label: {
                        Image(systemName: current.isFavorite ? "star.fill" : "star")
                            .font(.sl(20, SL.Weight.regular))
                            .foregroundStyle(current.isFavorite ? SL.Ink.primary : SL.Ink.tertiary)
                            .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(current.isFavorite ? "Ster weghalen" : "Deze oefening een ster geven")
                }
            }

            if let standing {
                Text(standing)
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var current: ExercisePicker.Row? {
        rows.first { $0.exerciseID == selected }
    }

    /// "Borst · favoriet" — where this exercise sits, and whether it is one of
    /// yours. The star says the same thing; the words are what VoiceOver and a
    /// glance get.
    ///
    /// When the same lift was trained two ways, the series on screen is named
    /// here too: a number computed from paused sets must not read as one about
    /// the sets you pressed touch-and-go.
    private var standing: String? {
        guard let current else { return nil }
        var parts = [current.group.title]
        if current.isFavorite { parts.append("favoriet") }
        if series.count > 1, let shown = series.first { parts.append(shown.label) }
        return parts.joined(separator: " · ")
    }

    // MARK: - The estimate, in three layers

    private func estimateBlock(_ progress: StrengthProgress) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SL.Space.s1) {
                Text("GESCHAT 1RM")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                    .tracking(SL.TypeSize.micro * 0.06)
                    .foregroundStyle(SL.Ink.tertiary)
                if progress.estimate != nil {
                    Button { explaining = true } label: {
                        Image(systemName: "info.circle")
                            .font(.sl(17, SL.Weight.regular))
                            .foregroundStyle(SL.Ink.tertiary)
                            // Drawn where 40a's 32 box puts it, tappable at
                            // the size a finger needs: the row keeps its own
                            // height either way.
                            .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Wat is geschat 1RM?")
                }
            }
            .frame(height: 24)
            .padding(.top, 24)

            if let estimate = progress.estimate {
                // An estimate is stated in the steps a gym actually has, as the
                // artboard does: Epley's 63,33 reads as 63,5.
                Text(app.display.kg(Estimates.round(estimate, toIncrement: 0.5)))
                    .font(.slCapped(Self.heroSize, SL.Weight.semibold, maxScale: 1.4))
                    .slLineHeight(1, size: Self.heroSize, maxScale: 1.4)
                    .slNumerals()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .foregroundStyle(SL.Ink.primary)
                    // SwiftUI draws the glyphs of a line tightened below the
                    // font's own height lower in the box than a browser does.
                    .offset(y: -0.117 * Self.heroScaledSize)
                    .padding(.top, 6)

                if let change = progress.change, let shown = progress.shownChange() {
                    (
                        Text("\(app.display.signedDelta(shown)) kg")
                            .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                            // 40a draws a gain, and lime is what a gain reads
                            // as. A drop is stated in the sentence's own ink:
                            // it is a fact about the weeks, not a failure to
                            // colour, and lime on it would read as a win.
                            .foregroundColor(shown > 0 ? SL.Signal.action : SL.Ink.primary)
                        + Text(" sinds \(app.display.shortDate(change.since))")
                            .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                            .foregroundColor(SL.Ink.secondary)
                    )
                    .slNumerals()
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                    .accessibilityLabel("\(app.display.signedDelta(shown)) kilo sinds \(app.display.shortDate(change.since))")
                } else if !progress.hasReference {
                    Text("Referentie opbouwen · sessie \(progress.referenceSessionNumber) van \(ExerciseHistory.sessionsBeforeReference)")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.top, 10)
                }

                if let source = progress.source {
                    Text("Berekend uit je beste set: \(app.display.kg(source.weightKg)) × \(source.reps) op \(app.display.shortDate(source.date))")
                        .slMeta()
                        .slNumerals()
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.top, SL.Space.s1)
                }
            } else if progress.rows.isEmpty {
                Text("Nog niet gelogd")
                    .font(.slCapped(Self.heroSize, SL.Weight.semibold, maxScale: 1.4))
                    .slLineHeight(1, size: Self.heroSize, maxScale: 1.4)
                    .offset(y: -0.117 * Self.heroScaledSize)
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                    .foregroundStyle(SL.Ink.tertiary)
                    .padding(.top, 6)
            } else {
                // §10.2: Epley loses accuracy as reps rise, so above ten reps
                // the app states no estimate rather than a flattering one.
                Text("Boven 10 reps rekent SETLINE geen schatting.")
                    .slBody()
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.top, 10)
            }
        }
    }

    /// 40a states the estimate at 52: larger than any other number in the app,
    /// because it is the one the screen exists for.
    private static let heroSize: CGFloat = 52

    private static var heroScaledSize: CGFloat {
        min(UIFontMetrics(forTextStyle: .body).scaledValue(for: heroSize), heroSize * 1.4)
    }

    // MARK: - Chart

    private func chart(_ progress: StrengthProgress) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Chart(progress.points, id: \.date) { point in
                LineMark(
                    x: .value("Datum", point.date),
                    y: .value("Geschatte 1RM", (point.estimate as NSDecimalNumber).doubleValue)
                )
                .interpolationMethod(.linear)
                .lineStyle(StrokeStyle(lineWidth: 1.75, lineCap: .round, lineJoin: .round))
                // 40a draws the line in ink: the lime is spent on the change
                // above, and two lime things would both stop meaning anything.
                .foregroundStyle(SL.Ink.primary)
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .chartYScale(domain: chartRange(progress.points))
            .frame(height: 100)
            .background(alignment: .bottom) { SLHairline() }
            .accessibilityLabel("Verloop van de geschatte 1RM over \(progress.points.count) sessies")

            let labels = chartLabels(progress.points)
            HStack(spacing: 0) {
                ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                    Text(label)
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .slNumerals()
                        .foregroundStyle(SL.Ink.tertiary)
                    if index < labels.count - 1 { Spacer(minLength: SL.Space.s2) }
                }
            }
            .padding(.top, SL.Space.s2)
            .accessibilityHidden(true)
        }
        .padding(.top, 18)
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

    // MARK: - Sessions

    private func sessionList(_ progress: StrengthProgress) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("ZWAARSTE SET PER SESSIE")
                .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                .tracking(SL.TypeSize.micro * 0.06)
                .foregroundStyle(SL.Ink.tertiary)
                .accessibilityAddTraits(.isHeader)

            ForEach(progress.rows) { row in
                HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                    Text(sessionLabel(row))
                        .slBody()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: SL.Space.s2)
                    Text("\(app.display.kg(row.weightKg)) × \(row.reps)")
                        .slBody(SL.Weight.semibold)
                        .slNumerals()
                }
                .frame(minHeight: 46)
                .padding(.top, SL.Space.s2)
                .overlay(alignment: .top) { SLHairline().padding(.top, SL.Space.s2) }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.top, SL.Space.s5)
        .padding(.bottom, SL.Space.s6)
    }

    private func sessionLabel(_ row: StrengthProgress.SessionRow) -> String {
        let date = app.display.shortDate(row.date)
        return row.dayLabel.isEmpty ? date : "\(date) · \(row.dayLabel)"
    }

    /// An exercise the catalogue offers and this account has never done. It is
    /// pickable on purpose — that is how you find out what is there.
    private var untrained: some View {
        Text("Log deze oefening een keer en je ziet hier je zwaarste set per sessie.")
            .slBody()
            .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(SL.Ink.secondary)
            .padding(.top, SL.Space.s5)
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("Nog geen oefeningen").slLead()
            Text("Je eerste sessie zet de startgewichten.")
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
        }
        .padding(.top, SL.Space.s2)
        .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Data

    private func reload() {
        rows = ExercisePicker.rows(sessions: app.sessions, favorites: app.favoriteExercises)
        if selected == nil || !rows.contains(where: { $0.exerciseID == selected }) {
            selected = opening()
        }
        reloadProgress()
    }

    /// Where the screen opens: what you starred, then the lift your programme
    /// is actually built around, then whatever was trained last. A big lift
    /// says more about strength than the last accessory of the last session,
    /// which is why the plan's own primaries come before recency.
    private func opening() -> String? {
        if let starred = ExercisePicker.favorites(in: rows).first { return starred.exerciseID }

        let trained = Set(rows.filter(\.hasHistory).map(\.exerciseID))
        let primary = app.plan
            .flatMap(\.exercises)
            .first { $0.role == .primaryStrength && trained.contains($0.exerciseID) }
        if let primary { return primary.exerciseID }

        return ExercisePicker.recent(in: rows, limit: 1).first?.exerciseID ?? rows.first?.exerciseID
    }

    private func reloadProgress() {
        guard let row = rows.first(where: { $0.exerciseID == selected }) else {
            progress = nil
            series = []
            return
        }
        series = ExerciseHistory.series(exerciseID: row.exerciseID, from: app.sessions)
        // The series this account actually has, not the one its programme
        // happens to prescribe: bench pressed touch-and-go is most of this
        // history even in a week whose plan says to pause it, and reading the
        // plan's modifiers instead hid every one of those sessions.
        let modifiers = series.first?.modifiers
            ?? app.plan.flatMap(\.exercises).first { $0.exerciseID == row.exerciseID }?.modifiers
            ?? .none
        progress = StrengthProgress.make(
            exerciseID: row.exerciseID,
            name: row.name,
            modifiers: modifiers,
            sessions: app.sessions
        )
    }
}
