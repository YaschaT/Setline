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
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                if rows.isEmpty {
                    emptyState
                } else {
                    title
                    if let progress {
                        heroCard(progress)
                        if progress.rows.isEmpty {
                            untrained
                        } else {
                            stats(progress)
                            sessionList(progress)
                        }
                    }
                }
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s3)
            .padding(.bottom, SL.Space.s8)
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

    /// The lift as a card: its muscle, its name (which is where you change
    /// it), and the star.
    private var title: some View {
        HStack(spacing: SL.Space.s3) {
            Button { picking = true } label: {
                HStack(spacing: SL.Space.s3) {
                    SLGlyph(name: .muscle(current?.group), size: 24, fixed: true)
                        .foregroundStyle(SL.Signal.action)
                        .frame(width: 48, height: 48)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SL.Signal.actionTint))
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(progress?.name ?? "Exercise")
                                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                                .foregroundStyle(SL.Ink.primary)
                                .lineLimit(2)
                                .minimumScaleFactor(0.8)
                                .multilineTextAlignment(.leading)
                            SLGlyph(name: .chevronDown, size: 14)
                                .foregroundStyle(SL.Ink.secondary)
                        }
                        if let standing {
                            Text(standing)
                                .slMeta()
                                .foregroundStyle(SL.Ink.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Exercise: \(progress?.name ?? "none")")
            .accessibilityHint("Double-tap to pick another exercise")
            .accessibilityAddTraits(.isHeader)

            if let current {
                Button {
                    Task { await app.setFavorite(exerciseID: current.exerciseID, isFavorite: !current.isFavorite) }
                } label: {
                    Image(systemName: current.isFavorite ? "star.fill" : "star")
                        .font(.sl(20, SL.Weight.regular))
                        .foregroundStyle(current.isFavorite ? Color(hex: 0xFFD166) : SL.Ink.tertiary)
                        .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(current.isFavorite ? "Remove star" : "Star this exercise")
            }
        }
        .padding(SL.Space.s4)
        .slBorderBox()
        .slListCard(radius: SL.Radius.xl)
    }

    private var current: ExercisePicker.Row? {
        rows.first { $0.exerciseID == selected }
    }

    /// "Chest · favourite" — where this exercise sits, and whether it is one
    /// of yours. When the same lift was trained two ways, the series on
    /// screen is named here too: a number computed from paused sets must not
    /// read as one about the sets you pressed touch-and-go.
    private var standing: String? {
        guard let current else { return nil }
        var parts = [current.group.title]
        if current.isFavorite { parts.append("favourite") }
        if series.count > 1, let shown = series.first { parts.append(shown.label) }
        return parts.joined(separator: " · ")
    }

    // MARK: - The estimate

    /// The number the screen exists for, what it moved, and its line.
    private func heroCard(_ progress: StrengthProgress) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            HStack(spacing: SL.Space.s1) {
                Text("ESTIMATED 1RM")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                    .tracking(1.2)
                    .foregroundStyle(SL.Ink.secondary)
                if progress.estimate != nil {
                    Button { explaining = true } label: {
                        Image(systemName: "info.circle")
                            .font(.sl(15, SL.Weight.regular))
                            .foregroundStyle(SL.Ink.tertiary)
                            .frame(width: 32, height: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("What is estimated 1RM?")
                }
                Spacer(minLength: 0)
            }
            .frame(height: 24)

            if let estimate = progress.estimate {
                // Stated in the steps a gym actually has: 124.14 reads as 124.
                Text(app.display.kg(Estimates.round(estimate, toIncrement: 0.5)))
                    .font(.slCapped(48, SL.Weight.semibold, maxScale: 1.4))
                    .slNumerals()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .foregroundStyle(SL.Ink.primary)

                if let change = progress.change, let shown = progress.shownChange() {
                    // A gain reads in lime; a drop in the sentence's own ink —
                    // a fact about the weeks, not a failure to colour.
                    Text("\(app.display.signedDelta(shown)) kg since \(app.display.shortDate(change.since))")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .slNumerals()
                        .foregroundStyle(shown > 0 ? SL.Signal.action : SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.s3)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(shown > 0 ? SL.Signal.actionTint : SL.Surface.raised2))
                        .accessibilityLabel("\(app.display.signedDelta(shown)) kilos since \(app.display.shortDate(change.since))")
                } else if !progress.hasReference {
                    referenceMeter(progress)
                }

                if progress.points.count > 1 { chart(progress) }

                if let source = progress.source {
                    Text("From your best set: \(app.display.kg(source.weightKg)) × \(source.reps) on \(app.display.shortDate(source.date))")
                        .slMeta()
                        .slNumerals()
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                }
            } else if progress.rows.isEmpty {
                Text("Not logged yet")
                    .font(.sl(SL.TypeSize.display, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.tertiary)
            } else {
                // §10.2: an estimate loses accuracy as reps rise, so above ten
                // reps the app states none rather than a flattering one.
                Text("Above 10 reps, SETLINE makes no estimate.")
                    .slBody()
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.secondary)
            }
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .slListCard(radius: SL.Radius.xl)
    }

    /// The reference period as a meter that fills: three sessions before a
    /// record can count.
    private func referenceMeter(_ progress: StrengthProgress) -> some View {
        let total = ExerciseHistory.sessionsBeforeReference
        let done = min(progress.referenceSessionNumber, total)
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(spacing: 4) {
                ForEach(0..<total, id: \.self) { index in
                    Capsule()
                        .fill(index < done ? SL.Signal.action : SL.Surface.raised2)
                        .frame(height: 6)
                }
            }
            Text("Building a reference · session \(progress.referenceSessionNumber) of \(total)")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func chart(_ progress: StrengthProgress) -> some View {
        VStack(spacing: SL.Space.s2) {
            StrengthArea(values: progress.points.map(\.estimate), ink: SL.Signal.action)
                .frame(height: 110)
            let labels = chartLabels(progress.points)
            HStack(spacing: 0) {
                ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                    Text(label)
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                    if index < labels.count - 1 { Spacer(minLength: SL.Space.s2) }
                }
            }
        }
        .padding(.vertical, SL.Space.s1)
        .accessibilityElement()
        .accessibilityLabel("Estimated 1RM over \(progress.points.count) sessions")
    }

    /// First, middle and last. The chart runs on sessions, so the middle
    /// label is the date halfway between the two ends.
    private func chartLabels(_ points: [StrengthProgress.Point]) -> [String] {
        guard let first = points.first?.date, let last = points.last?.date else { return [] }
        guard points.count > 2 else {
            return [app.display.shortDate(first), app.display.shortDate(last)]
        }
        let middle = first.addingTimeInterval(last.timeIntervalSince(first) / 2)
        return [first, middle, last].map { app.display.shortDate($0) }
    }

    // MARK: - Stats

    /// Three tiles, as Apple Fitness sums an activity: the heaviest set, how
    /// often, and how many records.
    private func stats(_ progress: StrengthProgress) -> some View {
        let heaviest = progress.rows.max { $0.weightKg < $1.weightKg }
        let records = progress.rows.filter { $0.marker == .record }.count
        return HStack(spacing: SL.Space.s3) {
            statTile("Heaviest", heaviest.map { app.display.number($0.weightKg) } ?? "—", unit: "kg")
            statTile("Sessions", "\(progress.sessionCount)", unit: nil)
            statTile("Records", "\(records)", unit: nil, medal: records > 0)
        }
    }

    private func statTile(_ label: String, _ value: String, unit: String?, medal: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(spacing: 4) {
                Text(label)
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                Spacer(minLength: 0)
                if medal { SLMedal(place: .gold, size: 18) }
            }
            .frame(height: 20)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.sl(24, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                if let unit {
                    Text(unit).slMeta().foregroundStyle(SL.Ink.secondary)
                }
            }
            .slNumerals()
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .slListCard()
        .accessibilityElement(children: .combine)
    }

    // MARK: - Sessions

    private func sessionList(_ progress: StrengthProgress) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("Sessions")
                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.primary)
                .padding(.horizontal, SL.Space.s1)
                .padding(.top, SL.Space.s3)
                .padding(.bottom, SL.Space.s1)
                .accessibilityAddTraits(.isHeader)
            ForEach(progress.rows) { row in
                sessionCard(row)
            }
        }
    }

    private func sessionCard(_ row: StrengthProgress.SessionRow) -> some View {
        let calendar = Calendar.current
        let isRecord = row.marker == .record
        return HStack(spacing: SL.Space.s3) {
            VStack(spacing: 0) {
                Text("\(calendar.component(.day, from: row.date))")
                    .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                Text(Self.month.string(from: row.date).uppercased())
                    .font(.sl(10, SL.Weight.semibold))
                    .tracking(0.6)
                    .foregroundStyle(SL.Ink.secondary)
            }
            .frame(width: 44, height: 44)
            .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))

            VStack(alignment: .leading, spacing: 2) {
                Text("\(app.display.kg(row.weightKg)) × \(row.reps)")
                    .slBody(SL.Weight.semibold)
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                Text(row.dayLabel.isEmpty ? "\(row.setCount) sets" : "\(row.dayLabel) · \(row.setCount) sets")
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
            }
            Spacer(minLength: SL.Space.s2)
            marker(row.marker)
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s3)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(isRecord ? Color(hex: 0xFFD166).opacity(0.45) : SL.Surface.hairline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    /// What a session did: a record earns the gold medal, a gain its lime
    /// kilos, a repeat an equals sign.
    @ViewBuilder
    private func marker(_ marker: StrengthProgress.Marker) -> some View {
        switch marker {
        case .record:
            HStack(spacing: 6) {
                Text("PR")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                    .tracking(0.8)
                    .foregroundStyle(Color(hex: 0xFFD166))
                SLMedal(place: .gold, size: 28, shines: true)
            }
            .accessibilityLabel("Personal record")
        case .delta(let value):
            Text("\(app.display.signedDelta(value)) kg")
                .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(value > 0 ? SL.Signal.action : SL.Ink.secondary)
                .padding(.horizontal, SL.Space.s2)
                .padding(.vertical, 4)
                .background(Capsule().fill(value > 0 ? SL.Signal.actionTint : SL.Surface.raised2))
        case .same:
            Text("=")
                .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: 28, height: 24)
                .background(Capsule().fill(SL.Surface.raised2))
                .accessibilityLabel("Same as before")
        case .building(let session, let total):
            Text("Ref \(session)/\(total)")
                .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(SL.Ink.secondary)
                .padding(.horizontal, SL.Space.s2)
                .padding(.vertical, 4)
                .background(Capsule().fill(SL.Surface.raised2))
                .accessibilityLabel("Reference session \(session) of \(total)")
        }
    }

    private static let month: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "MMM"
        return formatter
    }()

    /// An exercise the catalogue offers and this account has never done. It is
    /// pickable on purpose — that is how you find out what is there.
    private var untrained: some View {
        Text("Log this exercise once and its sessions show up here as cards.")
            .slBody()
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(SL.Ink.secondary)
            .padding(SL.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slBorderBox()
            .slListCard()
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("No exercises yet").slLead()
            Text("Your first session sets the starting weights.")
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .slListCard(radius: SL.Radius.xl)
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
    ///
    /// With nothing trained yet, it is still the programme's first lift — not
    /// whichever exercise the catalogue happens to list first.
    private func opening() -> String? {
        if let starred = ExercisePicker.favorites(in: rows).first { return starred.exerciseID }

        let primaries = app.plan.flatMap(\.exercises).filter { $0.role == .primaryStrength }
        let trained = Set(rows.filter(\.hasHistory).map(\.exerciseID))
        if let primary = primaries.first(where: { trained.contains($0.exerciseID) }) { return primary.exerciseID }

        if let recent = ExercisePicker.recent(in: rows, limit: 1).first { return recent.exerciseID }
        let listed = Set(rows.map(\.exerciseID))
        return primaries.first { listed.contains($0.exerciseID) }?.exerciseID ?? rows.first?.exerciseID
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
