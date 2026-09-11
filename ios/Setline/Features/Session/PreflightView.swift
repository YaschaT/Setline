import SwiftUI
import SetlineCore

/// Artboard 10. What today is, before anything is written.
struct PreflightView: View {
    @Environment(AppState.self) private var app
    let day: WorkoutDay
    let onBegin: () -> Void
    let onClose: () -> Void

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Button(action: onClose) {
                        Text("Sluiten").slBody(SL.Weight.medium)
                            .foregroundStyle(SL.Ink.secondary)
                            .slHitTarget()
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    // No editing exists yet, so the header does not offer it.
                    Text("\(day.exercises.count) oefeningen")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.tertiary)
                        .slHitTarget()
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s3)

                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(day.short)
                            .slDisplay()
                            .foregroundStyle(SL.Ink.primary)

                        Text(metaLine)
                            .slBody().slNumerals()
                            .foregroundStyle(SL.Ink.secondary)
                            .padding(.top, 6)
                            .padding(.bottom, SL.Space.s6)

                        exerciseCard

                        Text("Gewichten komen uit je vorige sessie. Alles is tijdens de sessie aanpasbaar.")
                            .slMeta()
                            .lineSpacing(SL.TypeSize.meta * (SL.LineHeight.body - 1))
                            .foregroundStyle(SL.Ink.tertiary)
                            .padding(.top, SL.Space.s4)
                    }
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.top, 28)
                    .padding(.bottom, SL.Space.s6)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button(action: onBegin) { Text("Beginnen") }
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s3)
                .padding(.bottom, SL.Space.s3)
                .background(SL.Surface.ground)
        }
    }

    private var metaLine: String {
        let sets = day.exercises.reduce(0) { $0 + $1.targetSets }
        var parts = ["\(sets) sets"]
        if let goal = app.todayMetaLine()?.components(separatedBy: " · ").first(where: { $0.hasPrefix("doel") }) {
            parts.append(goal)
        }
        parts.append("rust per oefening")
        return parts.joined(separator: " · ")
    }

    /// One container of radius 22 with 8pt of padding; rows at radius 12 with
    /// 14pt, and the divider inset to match.
    private var exerciseCard: some View {
        VStack(spacing: 0) {
            ForEach(Array(day.exercises.enumerated()), id: \.offset) { index, planned in
                row(planned)
                if index < day.exercises.count - 1 {
                    SLHairline().padding(.horizontal, 14)
                }
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: 1)
        )
    }

    private func row(_ planned: PlannedExercise) -> some View {
        let exercise = app.exercise(planned.exerciseID)
        let history = app.history(for: planned)
        let proposal = ProgressionEngine.proposal(planned: planned, exercise: exercise, history: history)
        let previous = history.mostRecent?.sets.first?.weightKg
        let target = proposal.weightKg ?? previous

        return HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 3) {
                Text(exercise.name).slLead().foregroundStyle(SL.Ink.primary)
                Text(prescriptionLine(planned, previous: previous))
                    .slMeta().slNumerals()
                    .foregroundStyle(SL.Ink.tertiary)
            }
            Spacer(minLength: SL.Space.s3)
            Text(target.map(app.display.kg) ?? "—")
                .font(.sl(SL.TypeSize.lead, SL.Weight.medium))
                .slNumerals()
                .foregroundStyle(SL.Ink.secondary)
        }
        .padding(14)
        .accessibilityElement(children: .combine)
    }

    private func prescriptionLine(_ planned: PlannedExercise, previous: Decimal?) -> String {
        let reps = planned.sets.first?.repRange.upperBound ?? 0
        var line = "\(planned.targetSets) × \(reps)"
        if let previous {
            line += " · vorige \(app.display.kg(previous))"
        } else if let note = planned.authoredNote?.load, !note.isEmpty {
            // No history yet: show what the plan was authored with rather
            // than an invented number.
            line += " · \(note)"
        }
        return line
    }
}
