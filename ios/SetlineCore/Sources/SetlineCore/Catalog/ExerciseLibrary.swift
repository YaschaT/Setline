import Foundation

/// The online exercise library: free-exercise-db's exercises (Unlicense), for
/// when the picker's own list runs out. Strength work only — no stretches,
/// cardio or plyometrics — and nothing the catalogue already holds.
public struct ExerciseLibrary: Sendable {
    public struct Entry: Decodable, Identifiable, Hashable, Sendable {
        /// The dataset's folder, which is also where its photos are.
        public let id: String
        public let name: String
        public let equipment: String?
        public let primaryMuscles: [String]
        public let mechanic: String?
        public let category: String
    }

    public let entries: [Entry]

    static let categories: Set<String> = ["strength", "powerlifting", "olympic weightlifting", "strongman"]

    public init(entries: [Entry]) {
        self.entries = entries.filter { Self.categories.contains($0.category) }
    }

    public init(data: Data) throws {
        self.init(entries: try JSONDecoder().decode([Entry].self, from: data))
    }

    /// Every word of the query in the name, shortest names first, so the
    /// plain version of a movement comes before its variations.
    public func search(_ query: String, excludingNames: Set<String> = [], limit: Int = 8) -> [Entry] {
        let words = query.lowercased()
            .split { !$0.isLetter && !$0.isNumber }
            .map(String.init)
        guard !words.isEmpty else { return [] }
        let excluded = Set(excludingNames.map { $0.lowercased() })
        return entries
            .filter { entry in
                let name = entry.name.lowercased()
                return !excluded.contains(name) && words.allSatisfy { name.contains($0) }
            }
            .sorted { ($0.name.count, $0.name) < ($1.name.count, $1.name) }
            .prefix(limit)
            .map { $0 }
    }
}

public extension ExerciseLibrary.Entry {
    /// Which of the picker's six groups its main muscle falls in.
    var muscleGroup: MuscleGroup? {
        switch primaryMuscles.first {
        case "chest": return .borst
        case "lats", "middle back", "lower back", "traps", "neck": return .rug
        case "shoulders": return .schouders
        case "biceps", "triceps", "forearms": return .armen
        case "quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors": return .benen
        case "abdominals": return .core
        default: return nil
        }
    }

    var equipmentKind: Equipment {
        switch equipment {
        case "barbell", "e-z curl bar": return .barbell
        case "dumbbell", "kettlebells": return .dumbbell
        case "cable", "bands": return .cable
        case "machine", "other": return .machineSelectorised
        default: return .bodyweight
        }
    }

    /// "Barbell", "Bodyweight", "E-z curl bar".
    var equipmentLabel: String {
        guard let equipment, equipment != "body only" else { return "Bodyweight" }
        return equipment.prefix(1).uppercased() + equipment.dropFirst()
    }

    /// What adding it writes: an exercise of your own that keeps its group,
    /// so the picker lists it, and its photos.
    func customExercise() -> CustomExercise {
        CustomExercise(
            name: name,
            equipment: equipmentKind,
            isCompound: mechanic == "compound",
            muscleGroup: muscleGroup,
            photoFolder: id
        )
    }
}
