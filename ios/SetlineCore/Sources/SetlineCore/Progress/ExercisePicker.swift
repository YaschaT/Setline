import Foundation

/// Artboards 40b–40d · choosing which exercise Progressie is showing.
///
/// One list, built three ways: what this account starred, what it trained
/// last, and the catalogue under six muscle groups. Every row says what the
/// exercise is and when it was last done, so a name nobody remembers is
/// recognised rather than recalled.
///
/// It offers the catalogue, not the history: an exercise with nothing logged
/// is still there, saying so. Nothing here ranks or substitutes — that is
/// `Substitution`'s work, and it reads the same attributes for a different
/// reason.
public enum ExercisePicker {

    public struct Row: Equatable, Sendable, Identifiable {
        public let exerciseID: String
        public let name: String
        public let group: MuscleGroup
        /// When it was last trained, if it ever was.
        public let lastTrained: Date?
        /// The heaviest set of that session, for 40d's second line.
        public let topSetKg: Decimal?
        public let topSetReps: Int?
        public let isFavorite: Bool

        public var id: String { exerciseID }
        public var hasHistory: Bool { lastTrained != nil }

        public init(
            exerciseID: String,
            name: String,
            group: MuscleGroup,
            lastTrained: Date?,
            topSetKg: Decimal?,
            topSetReps: Int?,
            isFavorite: Bool
        ) {
            self.exerciseID = exerciseID
            self.name = name
            self.group = group
            self.lastTrained = lastTrained
            self.topSetKg = topSetKg
            self.topSetReps = topSetReps
            self.isFavorite = isFavorite
        }
    }

    /// Every exercise the picker offers: the catalogue's own, in name order.
    /// An exercise without authored attributes has no group to file it under,
    /// and is left out rather than dropped into a wrong one.
    public static func offered(catalog: [String: Exercise] = ExerciseCatalog.all) -> [Exercise] {
        catalog.values
            .filter { $0.group != nil }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// The rows for every offered exercise, each carrying what the account did
    /// with it. Built once and filtered from, so one pass over the sessions
    /// serves the whole sheet.
    public static func rows(
        sessions: [TrainingSession],
        favorites: Set<String> = [],
        catalog: [String: Exercise] = ExerciseCatalog.all
    ) -> [Row] {
        var last: [String: (date: Date, weightKg: Decimal?, reps: Int?)] = [:]
        for session in sessions where session.kind == .workout {
            for result in session.results {
                if let held = last[result.exerciseID], held.date >= session.date { continue }
                let top = result.sets
                    .filter { !$0.isWarmup }
                    .max { ($0.weightKg ?? 0, $0.reps) < ($1.weightKg ?? 0, $1.reps) }
                guard let top else { continue }
                last[result.exerciseID] = (session.date, top.weightKg, top.reps)
            }
        }

        return offered(catalog: catalog).compactMap { exercise in
            guard let group = exercise.group else { return nil }
            let history = last[exercise.id]
            return Row(
                exerciseID: exercise.id,
                name: exercise.name,
                group: group,
                lastTrained: history?.date,
                topSetKg: history?.weightKg,
                topSetReps: history?.reps,
                isFavorite: favorites.contains(exercise.id)
            )
        }
    }

    /// 40b's top block: what this account starred, most recently trained
    /// first, then by name so the list never reshuffles on its own.
    public static func favorites(in rows: [Row]) -> [Row] {
        rows.filter(\.isFavorite).sorted(by: recencyThenName)
    }

    /// 40c: with nothing starred, the same place holds what was trained last,
    /// so the sheet never opens empty.
    public static func recent(in rows: [Row], limit: Int = 3) -> [Row] {
        rows.filter(\.hasHistory).sorted(by: recencyThenName).prefix(limit).map { $0 }
    }

    /// The six rows of 40b, each with how many exercises it holds.
    public static func groups(in rows: [Row]) -> [(group: MuscleGroup, count: Int)] {
        MuscleGroup.allCases.map { group in
            (group, rows.filter { $0.group == group }.count)
        }
    }

    /// One group's exercises (40d): what has been logged first, newest first,
    /// then the rest by name — so the ones you might be looking for are at the
    /// top, and the ones you have never done are still there.
    public static func rows(in group: MuscleGroup, of rows: [Row]) -> [Row] {
        let inside = rows.filter { $0.group == group }
        let logged = inside.filter(\.hasHistory).sorted(by: recencyThenName)
        let unlogged = inside.filter { !$0.hasHistory }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        return logged + unlogged
    }

    /// "7 oefeningen · 4 met historiek" — 40d's line under the group's name.
    public static func summary(of group: MuscleGroup, in rows: [Row]) -> String {
        let inside = rows.filter { $0.group == group }
        let noun = inside.count == 1 ? "exercise" : "exercises"
        let logged = inside.filter(\.hasHistory).count
        guard logged > 0 else { return "\(inside.count) \(noun) · nothing logged yet" }
        return "\(inside.count) \(noun) · \(logged) with history"
    }

    /// Typed search over the same rows. Matches anywhere in the name, because
    /// "bankdrukken" is as likely to be searched for as "dumbbell".
    public static func search(_ query: String, in rows: [Row]) -> [Row] {
        let asked = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !asked.isEmpty else { return [] }
        return rows
            .filter { $0.name.localizedCaseInsensitiveContains(asked) }
            .sorted { left, right in
                // A name that starts with what was typed comes first.
                let leftStarts = left.name.lowercased().hasPrefix(asked.lowercased())
                let rightStarts = right.name.lowercased().hasPrefix(asked.lowercased())
                if leftStarts != rightStarts { return leftStarts }
                return recencyThenName(left, right)
            }
    }

    private static func recencyThenName(_ left: Row, _ right: Row) -> Bool {
        switch (left.lastTrained, right.lastTrained) {
        case let (l?, r?) where l != r: return l > r
        case (.some, .none): return true
        case (.none, .some): return false
        default: return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
        }
    }
}
