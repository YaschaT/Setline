import SwiftUI
import SetlineCore

/// A workout a friend sent as a link: what's in it, and one tap to keep a
/// copy among your own workouts. Opening the link never adds anything by
/// itself.
struct SharedWorkoutSheet: View {
    @Environment(AppState.self) private var app
    let received: CustomWorkoutLink.Received
    let onClose: () -> Void
    @State private var saved = false

    private var workout: CustomWorkout { received.workout }

    var body: some View {
        let sets = workout.items.reduce(0) { $0 + $1.sets }
        SLSheet(title: saved ? "Saved to your workouts" : "A workout for you",
                subtitle: "\(workout.name) · \(workout.items.count == 1 ? "1 exercise" : "\(workout.items.count) exercises") · \(sets) sets",
                onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s5) {
                VStack(spacing: 0) {
                    ForEach(Array(workout.items.enumerated()), id: \.offset) { index, item in
                        if index > 0 { SLHairline() }
                        HStack(spacing: SL.Space.s3) {
                            Text("\(index + 1)")
                                .slMeta(SL.Weight.semibold)
                                .slNumerals()
                                .foregroundStyle(SL.Ink.tertiary)
                                .frame(width: 18, alignment: .leading)
                            Text(ExerciseCatalog.exercise(item.exerciseID)?.name ?? item.exerciseID)
                                .slBody(SL.Weight.medium)
                                .foregroundStyle(SL.Ink.primary)
                                .lineLimit(1)
                            Spacer(minLength: SL.Space.s2)
                            Text("\(item.sets) × \(item.repLow == item.repHigh ? "\(item.repLow)" : "\(item.repLow)–\(item.repHigh)")")
                                .slMeta()
                                .slNumerals()
                                .foregroundStyle(SL.Ink.secondary)
                        }
                        .padding(.horizontal, SL.Space.s4)
                        .frame(minHeight: 52)
                    }
                }
                .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))

                if received.skipped > 0 {
                    Text(received.skipped == 1
                         ? "1 exercise isn't in Setline's list and was left out."
                         : "\(received.skipped) exercises aren't in Setline's list and were left out.")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                }

                if saved {
                    VStack(spacing: SL.Space.s3) {
                        HStack(spacing: SL.Space.s2) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(SL.Signal.action)
                            Text("Find it in Plan & workouts, or put it in your week.")
                                .slBody()
                                .foregroundStyle(SL.Ink.primary)
                            Spacer(minLength: 0)
                        }
                        Button("Done", action: onClose).buttonStyle(SLPrimaryButtonStyle())
                    }
                } else {
                    VStack(spacing: SL.Space.s2) {
                        Button("Save to my workouts") {
                            Task { await app.saveCustomWorkout(workout) }
                            saved = true
                        }
                        .buttonStyle(SLPrimaryButtonStyle())
                        Button("Not now", action: onClose).buttonStyle(SLOutlineButtonStyle())
                    }
                }
            }
            .padding(.top, SL.Space.s2)
        }
    }
}
