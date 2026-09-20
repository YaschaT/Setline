import SwiftUI
import SetlineCore

/// Artboard 33 · workout preview.
///
/// What a date holds, read from the programme and the schedule. It is 10's
/// card without 10's promise: there is no start button here, because a
/// session begins on the day itself, from Training. Opening this screen
/// writes nothing.
struct WorkoutPreviewView: View {
    @Environment(AppState.self) private var app

    let day: AgendaDay
    let workout: WorkoutDay
    let onClose: () -> Void
    let onPlanWeek: () -> Void
    /// Present only where the reader came from Training; the Agenda hides it
    /// rather than offering a way back to itself.
    let onOpenAgenda: (() -> Void)?

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                header

                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        SLEyebrow(text: eyebrow)

                        Text(workout.short)
                            .slDisplay()
                            .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                            .foregroundStyle(SL.Ink.primary)
                            .padding(.top, 6)

                        Text(meta)
                            .slBody().slNumerals()
                            .foregroundStyle(SL.Ink.secondary)
                            .padding(.top, 6)

                        if let movedFrom = day.movedFrom {
                            Text("Verplaatst van \(movedFrom).")
                                .slBody()
                                .foregroundStyle(SL.Ink.secondary)
                                .padding(.top, 6)
                        }

                        exerciseCard.padding(.top, SL.Space.s6)

                        Text(footnote)
                            .slMeta()
                            .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(SL.Ink.tertiary)
                            .padding(.top, SL.Space.s5)
                    }
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.top, 28)
                    .padding(.bottom, SL.Space.s8)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if let onOpenAgenda {
                Button(action: onOpenAgenda) {
                    Text("Naar agenda")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Metric.primaryPillHeight)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.bottom, SL.Space.sessionBlockBottom)
                .background(SL.Surface.ground)
            }
        }
        .slRespondsToTextSize()
    }

    private var header: some View {
        HStack {
            Button(action: onClose) {
                Text("Sluiten").slBody(SL.Weight.medium).foregroundStyle(SL.Ink.secondary).slHitTarget()
            }
            .buttonStyle(.plain)
            Spacer()
            Button(action: onPlanWeek) {
                Text("Wijzig planning").slBody(SL.Weight.medium).foregroundStyle(SL.Ink.tertiary).slHitTarget()
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
    }

    private var eyebrow: String {
        let date = "\(WeekPlan.fullWeekday(day.date)) \(app.display.shortDate(day.date))"
        if case .missed = day.content { return date }
        return "\(date) · gepland"
    }

    /// The same three numbers 10 states, from the same rules.
    private var meta: String {
        var parts = ["\(WeekPlan.sets(of: workout)) sets", "±\(WeekPlan.minutes(of: workout)) min"]
        parts.append("rust \(restLabel)")
        return parts.joined(separator: " · ")
    }

    private var restLabel: String {
        let seconds = workout.exercises.map { RestPrescription.forRole($0.role).defaultSeconds }
        func clock(_ value: Int) -> String { "\(value / 60):" + String(format: "%02d", value % 60) }
        guard let low = seconds.min(), let high = seconds.max() else { return clock(120) }
        return low == high ? clock(low) : "\(clock(low))–\(clock(high))"
    }

    /// 33 says why there is no start button, and 32f says what a passed day
    /// does not become.
    private var footnote: String {
        if case .missed = day.content {
            return "Geen sets opgeslagen. SETLINE haalt niets in en verschuift niets — je plan voor volgende week blijft staan."
        }
        guard let reference = lastSession else {
            return "Verwachte gewichten. Er staat hier geen startknop: een sessie begin je op de dag zelf vanaf Training."
        }
        return "Verwachte gewichten, gerekend uit je sessie van \(app.display.shortDate(reference.date)). Er staat hier geen startknop: een sessie begin je op de dag zelf vanaf Training."
    }

    private var lastSession: TrainingSession? {
        app.sessions
            .filter { $0.kind == .workout && $0.dayID == workout.id && $0.date < day.date }
            .max { $0.date < $1.date }
    }

    /// 10's card, without its trailing lime: nothing here is a target yet.
    private var exerciseCard: some View {
        VStack(spacing: 0) {
            ForEach(Array(workout.exercises.enumerated()), id: \.offset) { index, planned in
                row(planned)
                if index < workout.exercises.count - 1 {
                    SLHairline().padding(.horizontal, 14)
                }
            }
        }
        .padding(8)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: 1)
        )
    }

    private func row(_ planned: PlannedExercise) -> some View {
        let exercise = app.exercise(planned.exerciseID)
        // Read as the date would open it: history up to that date only, so a
        // preview of a past day never borrows numbers from after it.
        let history = app.history(for: planned, before: day.date)
        let previous = history.mostRecent?.sets.first?.weightKg
        let proposal = ProgressionEngine.proposal(planned: planned, exercise: exercise, history: history)
        let target = proposal.weightKg ?? previous

        return HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 3) {
                Text(exercise.name).slLead().foregroundStyle(SL.Ink.primary)
                Text(prescription(planned, previous: previous))
                    .slMeta().slNumerals()
                    .foregroundStyle(SL.Ink.tertiary)
            }
            Spacer(minLength: SL.Space.s3)
            Text(target.map(app.display.kg) ?? "—")
                .slLead()
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
        }
        .padding(14)
        .accessibilityElement(children: .combine)
    }

    private func prescription(_ planned: PlannedExercise, previous: Decimal?) -> String {
        let reps = planned.sets.first?.repRange.upperBound ?? 0
        var line = "\(planned.targetSets) × \(reps)"
        if let previous {
            line += " · vorige \(app.display.kg(previous))"
        } else if let note = planned.authoredNote?.load, !note.isEmpty {
            line += " · \(note)"
        }
        return line
    }
}
