import SwiftUI
import SetlineCore

/// Meldingen: the planned workouts of the last two weeks that passed with
/// nothing logged, opened from the bell on Training.
///
/// Each asks one question with two answers. `Log alsnog` writes the workout
/// down for that date on the ordinary session screen; `Niet getraind` closes
/// the question on this phone and changes nothing in the account — SETLINE
/// never moves or marks a day by itself.
struct AlertCenterSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    let onLogPast: (WorkoutDay, Date) -> Void
    let onClose: () -> Void

    var body: some View {
        let missed = app.missedDays
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Alerts")
                        .slTitle()
                        .foregroundStyle(SL.Ink.primary)
                        .accessibilityAddTraits(.isHeader)
                    Text(missed.isEmpty
                         ? "Everything is logged"
                         : missed.count == 1 ? "1 workout not logged" : "\(missed.count) workouts not logged")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                }
                Spacer()
                Button("Done", action: onClose)
                    .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)
            .padding(.bottom, SL.Space.s4)

            if missed.isEmpty {
                VStack(spacing: SL.Space.s3) {
                    SLGlyph(name: .check, size: 22, fixed: true)
                        .foregroundStyle(SL.Ink.tertiary)
                        .frame(width: 48, height: 48)
                        .overlay(Circle().strokeBorder(SL.Ink.tertiary, lineWidth: 1.7))
                        .accessibilityHidden(true)
                    Text("Every planned workout of the last two weeks is in your log.")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(SL.Space.s6)
                .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ScrollView {
                    // One list, one row per day: the answer is a tap, so the
                    // page stays a glance even with a week of them.
                    VStack(spacing: 0) {
                        ForEach(Array(missed.enumerated()), id: \.element.id) { index, day in
                            if let workout = day.plannedDay {
                                row(day, workout)
                                    .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                            }
                        }
                    }
                    .slBorderBox()
                    .slListCard()
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.bottom, SL.Space.s6)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SL.Surface.ground.ignoresSafeArea())
        .slRespondsToTextSize()
    }

    private func row(_ day: AgendaDay, _ workout: WorkoutDay) -> some View {
        let when = "\(WeekPlan.fullWeekday(day.date).prefix(2).lowercased()) \(app.display.shortDate(day.date))"
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s3))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s3))
        return layout {
            HStack(spacing: SL.Space.s3) {
                SLWorkoutSymbol(dayName: workout.short, size: 17)
                    .foregroundStyle(SL.Ink.primary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(SL.Surface.raised2))
                VStack(alignment: .leading, spacing: 2) {
                    Text(workout.short)
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                    Text(when)
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(workout.short), \(WeekPlan.fullWeekday(day.date)) \(app.display.shortDate(day.date)), not logged")

            HStack(spacing: SL.Space.s2) {
                Button { app.answerMissed(day.key) } label: {
                    Text("Didn't train")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.s2)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
                .accessibilityHint("Closes this alert. Nothing changes in your account.")

                Button { onLogPast(workout, day.date) } label: {
                    Text("Log it now")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .foregroundStyle(SL.Signal.onAction)
                        .padding(.horizontal, SL.Space.s3)
                        .frame(minHeight: 32)
                        .background(Capsule().fill(SL.Signal.action))
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Logs \(workout.short) for \(Agenda.when(day.date))")
            }
            .fixedSize()
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s2)
    }
}
