import SwiftUI
import SetlineCore

/// Redesign 1a · "Voorbeeld · start nog niet".
///
/// What a date holds, read from the programme and the schedule: four numbers
/// about the session, then its exercises in order. Opening it writes nothing
/// and starts nothing — starting is the lime button, and only today has one.
///
/// A day that has gone by offers writing it down afterwards instead; a day
/// still to come offers nothing but a look. Every unlogged day can be given
/// another session from here ("Wijzig deze dag").
struct WorkoutPreviewView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    let day: AgendaDay
    let workout: WorkoutDay
    /// Today only: start the session.
    let onStart: (() -> Void)?
    /// A day that passed unlogged: write it down on its own date.
    let onLogPast: (() -> Void)?
    let onChangeDay: () -> Void
    let onClose: () -> Void

    var body: some View {
        SLSheet(title: title.slUnbroken, subtitle: subtitle, onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                stats
                exercises
                Text(footnote.slUnbroken)
                    .slMeta()
                    .slNumerals()
                    .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.secondary)
                actions
            }
        }
    }

    // MARK: - Head

    /// "Push A · bank & schouders"
    private var title: String {
        guard let first = workout.focus.first else { return workout.short }
        return "\(workout.short) · \(first.lowercased())\(workout.focus.dropFirst())"
    }

    private var subtitle: String {
        if day.isToday { return "Voorbeeld · start nog niet" }
        let date = "\(WeekPlan.fullWeekday(day.date)) \(app.display.shortDate(day.date))"
        if case .missed = day.content { return "Niet gelogd · \(date)" }
        return "Voorbeeld · \(date)"
    }

    // MARK: - Four numbers

    private var stats: some View {
        let volume = plannedVolume
        var items: [(value: String, label: String)] = [
            ("~\(WeekPlan.minutes(of: workout))", "min"),
            ("\(workout.exercises.count)", workout.exercises.count == 1 ? "oefening" : "oefeningen"),
            ("\(WeekPlan.sets(of: workout))", "sets"),
        ]
        // Tonnage needs weights to reckon with; a first session has none, and
        // the column is left out rather than filled with a guess.
        if volume > 0 {
            items.append((app.display.number(tonnes(volume)), "ton gepland"))
        }
        // Four across, until the text is too large for four: then two rows
        // of two, and every label whole.
        let columns = Array(
            repeating: GridItem(.flexible(), spacing: SL.Space.s2, alignment: .topLeading),
            count: typeSize.isAccessibilitySize ? 2 : items.count
        )
        return LazyVGrid(columns: columns, alignment: .leading, spacing: SL.Space.s3) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.value)
                        .slTitle()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                    Text(item.label)
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.vertical, SL.Space.s3)
        .overlay(alignment: .top) { SLHairline() }
        .overlay(alignment: .bottom) { SLHairline() }
    }

    /// The volume the day would come to at the weights it would open with.
    private var plannedVolume: Decimal {
        workout.exercises.reduce(Decimal(0)) { total, planned in
            guard let weight = target(for: planned).weight else { return total }
            let reps = planned.sets.reduce(0) { $0 + $1.repRange.upperBound }
            return total + weight * Decimal(reps)
        }
    }

    /// Kilos as tonnes, to one decimal: "7,4".
    private func tonnes(_ kilos: Decimal) -> Decimal {
        var value = kilos / 1000
        var rounded = Decimal()
        NSDecimalRound(&rounded, &value, 1, .plain)
        return rounded
    }

    // MARK: - The exercises

    private var exercises: some View {
        VStack(spacing: 0) {
            ForEach(Array(workout.exercises.enumerated()), id: \.offset) { index, planned in
                row(index: index, planned)
                    .overlay(alignment: .bottom) {
                        if index < workout.exercises.count - 1 { SLHairline() }
                    }
            }
        }
    }

    private func row(index: Int, _ planned: PlannedExercise) -> some View {
        SLAdaptiveRow(spacing: SL.Space.s3) {
            Text("\(index + 1)")
                .slMeta()
                .slNumerals()
                .foregroundStyle(SL.Ink.secondary)
                .frame(minWidth: 24, alignment: .leading)
        } main: {
            VStack(alignment: .leading, spacing: 2) {
                Text(app.exercise(planned.exerciseID).name)
                    .slLead(SL.Weight.regular)
                    .foregroundStyle(SL.Ink.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if typeSize.isAccessibilitySize {
                    prescriptionText(planned)
                }
            }
        } trailing: {
            if !typeSize.isAccessibilitySize {
                prescriptionText(planned)
            }
        }
        .padding(.vertical, SL.Space.s2)
        .frame(minHeight: 56)
        .accessibilityElement(children: .combine)
    }

    private func prescriptionText(_ planned: PlannedExercise) -> some View {
        Text(prescription(planned).slUnbroken)
            .slMeta()
            .slNumerals()
            .multilineTextAlignment(typeSize.isAccessibilitySize ? .leading : .trailing)
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(SL.Ink.secondary)
    }

    /// What the exercise would open with, read as the date would open it:
    /// history up to that date only, so a look at a past day never borrows
    /// numbers from after it.
    private func target(for planned: PlannedExercise) -> (weight: Decimal?, previous: Decimal?) {
        let history = app.history(for: planned, before: day.date)
        let previous = history.mostRecent?.sets.first?.weightKg
        let proposal = ProgressionEngine.proposal(
            planned: planned, exercise: app.exercise(planned.exerciseID), history: history
        )
        return (proposal.weightKg ?? previous, previous)
    }

    /// "4 × 8 · vorige 82,5 kg", or the weight the session would propose where
    /// that is no longer the previous one.
    private func prescription(_ planned: PlannedExercise) -> String {
        let reps = planned.sets.first?.repRange.upperBound ?? 0
        let line = "\(planned.targetSets) × \(reps)"
        let (weight, previous) = target(for: planned)
        if let weight, let previous, weight != previous {
            return "\(line) · doel \(app.display.kg(weight))"
        }
        if let previous {
            return "\(line) · vorige \(app.display.kg(previous))"
        }
        if let note = planned.authoredNote?.load, !note.isEmpty {
            return "\(line) · \(note)"
        }
        return line
    }

    private var lastSession: TrainingSession? {
        app.sessions
            .filter { $0.kind == .workout && $0.dayID == workout.id && $0.date < day.date }
            .max { $0.date < $1.date }
    }

    private var footnote: String {
        var lines: [String] = []
        if let movedFrom = day.movedFrom {
            lines.append("Verplaatst van \(movedFrom).")
        }
        if case .missed = day.content {
            lines.append("Geen sets opgeslagen. SETLINE haalt niets in en verschuift niets — je plan voor volgende week blijft staan.")
        } else if day.isToday {
            lines.append("Gewichten komen uit je vorige sessie. Alles is tijdens de sessie aanpasbaar.")
        } else if let reference = lastSession {
            lines.append("Verwachte gewichten, gerekend uit je sessie van \(app.display.shortDate(reference.date)). Starten kan op de dag zelf.")
        } else {
            lines.append("Starten kan op de dag zelf.")
        }
        return lines.joined(separator: " ")
    }

    // MARK: - What can be done from here

    private var actions: some View {
        VStack(spacing: SL.Space.s1) {
            if let onStart {
                Button(action: onStart) {
                    HStack(spacing: 10) {
                        SLGlyph(name: .play, size: 16)
                        Text("Start training")
                    }
                }
                .buttonStyle(SLPrimaryButtonStyle())
            }
            if let onLogPast {
                Button(action: onLogPast) { Text("Achteraf loggen") }
                    .buttonStyle(SLOutlineButtonStyle())
                    .accessibilityHint("Schrijft \(workout.short) op, op \(Agenda.when(day.date))")
                    .padding(.bottom, SL.Space.s1)
            }
            Button(action: onChangeDay) { Text("Wijzig deze dag") }
                .buttonStyle(SLOutlineButtonStyle())
                .padding(.top, onStart == nil ? 0 : SL.Space.s1)
                .accessibilityHint("Zet een andere sessie of rust op deze datum")
            Button(action: onClose) { Text("Terug naar overzicht") }
                .buttonStyle(SLQuietButtonStyle())
        }
    }
}
