import Foundation

/// Which lift a screen leads with when it states one strength number.
///
/// An estimated one-rep max says something about a squat, a bench or a row;
/// on a cable fly or a machine stack it is a number nobody lifts, and its
/// kilos run far ahead of a barbell's. So a headline is only ever a main lift
/// — what the plan calls primary or secondary compound, or a compound free
/// weight — and lifts are ranked by percent gained, which a heavy machine
/// cannot win just by being heavy.
public enum StrengthHeadline {

    /// A lift whose estimated max means something.
    public static func isMainLift(
        _ exerciseID: String,
        plan: [WorkoutDay],
        catalog: [String: Exercise] = ExerciseCatalog.all
    ) -> Bool {
        if let role = plan.flatMap(\.exercises).first(where: { $0.exerciseID == exerciseID })?.role {
            return role == .primaryStrength || role == .secondaryCompound
        }
        guard let exercise = catalog[exerciseID] else { return false }
        return exercise.isCompound && [.barbell, .dumbbell, .smith].contains(exercise.equipment)
    }

    /// The change the screen shows, as a percent of where it started.
    public static func percentChange(_ progress: StrengthProgress) -> Decimal? {
        guard let change = progress.change, let shown = progress.shownChange(), change.baseline > 0 else { return nil }
        return shown / change.baseline * 100
    }

    /// The comparable series the account has for one exercise.
    public static func progress(
        exerciseID: String,
        name: String,
        sessions: [TrainingSession],
        plan: [WorkoutDay]
    ) -> StrengthProgress {
        let modifiers = ExerciseHistory.series(exerciseID: exerciseID, from: sessions).first?.modifiers
            ?? plan.flatMap(\.exercises).first { $0.exerciseID == exerciseID }?.modifiers
            ?? .none
        return StrengthProgress.make(exerciseID: exerciseID, name: name, modifiers: modifiers, sessions: sessions)
    }

    /// The main lift that gained most, by percent; with none gaining, the
    /// main lift trained last. Only lifts with a line to draw (two or more
    /// estimates) qualify. `nil` while there is none.
    public static func pick(
        rows: [ExercisePicker.Row],
        sessions: [TrainingSession],
        plan: [WorkoutDay],
        catalog: [String: Exercise] = ExerciseCatalog.all
    ) -> StrengthProgress? {
        let drawn = rows
            .filter { $0.hasHistory && isMainLift($0.exerciseID, plan: plan, catalog: catalog) }
            .map { progress(exerciseID: $0.exerciseID, name: $0.name, sessions: sessions, plan: plan) }
            .filter { $0.estimate != nil && $0.points.count > 1 }
        if let best = drawn
            .filter({ (percentChange($0) ?? 0) > 0 })
            .max(by: { (percentChange($0) ?? 0, $0.name) < (percentChange($1) ?? 0, $1.name) }) {
            return best
        }
        return drawn.max { ($0.points.last?.date ?? .distantPast) < ($1.points.last?.date ?? .distantPast) }
    }
}
