import Foundation

/// A workout the lifter put together: a name and a list of exercises with how
/// many sets each. Kept in the account (`iosCustomWorkouts`), so it follows
/// the account to every phone; started like any plan day, and logged like one.
public struct CustomWorkout: Codable, Hashable, Identifiable, Sendable {
    public struct Item: Codable, Hashable, Sendable {
        public var exerciseID: String
        public var sets: Int
        public var repLow: Int
        public var repHigh: Int

        public init(exerciseID: String, sets: Int = 3, repLow: Int = 8, repHigh: Int = 12) {
            self.exerciseID = exerciseID
            self.sets = max(1, min(10, sets))
            self.repLow = max(1, repLow)
            self.repHigh = max(self.repLow, repHigh)
        }
    }

    public var id: String
    public var name: String
    public var items: [Item]
    public var createdAt: Date

    public init(id: String? = nil, name: String, items: [Item], createdAt: Date = Date()) {
        self.id = id ?? Self.newID()
        self.name = name
        self.items = items
        self.createdAt = createdAt
    }

    /// Namespaced so it can never be taken for a plan day's id.
    public static let idPrefix = "custom-"

    public static func newID() -> String {
        idPrefix + UUID().uuidString.prefix(8).lowercased()
    }

    public static func isCustom(dayID: String) -> Bool { dayID.hasPrefix(idPrefix) }

    /// The workout as the session screen reads a plan day. Roles come from
    /// the catalogue, so progression treats a squat as a squat wherever it
    /// was put.
    public var workoutDay: WorkoutDay {
        WorkoutDay(
            id: id,
            label: name,
            short: name,
            focus: "",
            exercises: items.map { item in
                PlannedExercise(
                    exerciseID: item.exerciseID,
                    role: ExerciseCatalog.roles[item.exerciseID] ?? .accessory,
                    sets: Array(repeating: SetPrescription(repRange: item.repLow...item.repHigh), count: item.sets)
                )
            }
        )
    }
}
