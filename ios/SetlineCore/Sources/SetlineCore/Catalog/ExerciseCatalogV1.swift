import Foundation

/// The curated V1 exercise catalogue.
///
/// Two sources, one table. `GeneratedExerciseCatalog` holds the 39 exercises
/// the shipped plans actually prescribe, transcribed from the web app.
/// `ExerciseMetadata.additions` holds the 54 adds — exercises no plan
/// prescribes: substitution targets, and the staples a lifter looks for in
/// the picker (back squat, deadlift, Nordic curl, hip abductor…). Both are
/// enriched here with the station and attribute metadata the ranking needs.
///
/// The split matters: regenerating the plans must never silently drop curated
/// metadata, and adding a substitution target must never require touching a
/// generated file.
public enum ExerciseCatalog {

    public static let all: [String: Exercise] = {
        var result: [String: Exercise] = [:]
        for (id, base) in GeneratedExerciseCatalog.exercises { result[id] = enrich(base) }
        for (id, base) in ExerciseMetadata.additions { result[id] = enrich(base) }
        return result
    }()

    public static let roles: [String: ExerciseRole] = GeneratedExerciseCatalog.roles
        .merging(ExerciseMetadata.additionRoles) { generated, _ in generated }

    /// Every exercise the ranking may put in front of a user. Anything outside
    /// this set can still be logged and progressed — it just isn't offered as
    /// an alternative, because we have not authored the metadata to rank it.
    public static let v1Recommendable: Set<String> = ExerciseMetadata.v1Recommendable

    public static func exercise(_ id: String) -> Exercise? { all[id] }

    public static func role(_ id: String) -> ExerciseRole { roles[id] ?? .accessory }

    public static var recommendable: [Exercise] {
        v1Recommendable.compactMap { all[$0] }
    }

    private static func enrich(_ exercise: Exercise) -> Exercise {
        var copy = exercise
        copy.station = ExerciseMetadata.stations[exercise.id]
        copy.attributes = ExerciseMetadata.attributes[exercise.id]
        return copy
    }
}
