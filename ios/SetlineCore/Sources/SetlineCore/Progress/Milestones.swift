import Foundation

/// Things worth having done, kept for good: sessions logged, weeks in a row,
/// the heaviest set and the total weight moved. Each says when it was reached,
/// or how far there is still to go — real achievements, not points.
public struct Milestone: Identifiable, Equatable, Sendable {
    public enum Kind: String, Sendable {
        case sessions, streak, heaviest, volume
        // Food habits
        case logging, protein, fullDay
        // Progress habits
        case onTrack, weighIns, photos

        /// Which collection a kind belongs to.
        public var family: Family {
            switch self {
            case .sessions, .streak, .heaviest, .volume: return .training
            case .logging, .protein, .fullDay: return .food
            case .onTrack, .weighIns, .photos: return .progress
            }
        }
    }

    public enum Family: String, CaseIterable, Sendable { case training, food, progress }

    public let id: String
    public let kind: Kind
    public let title: String
    /// When it was reached; `nil` while it is still ahead.
    public let reachedOn: Date?
    /// Where the account stands towards it, and the mark itself.
    public let current: Double
    public let target: Double
    /// What the badge itself says: "25", "8 wk", "100 kg", "10 t".
    public var badgeLabel: String = ""
    /// 0 bronze, 1 silver, 2 gold, 3 the top of its kind.
    public var tier: Int = 0
    /// One line on how it is earned.
    public var howTo: String = ""

    public var isReached: Bool { reachedOn != nil }
    public var fraction: Double { min(1, max(0, current / max(target, 1))) }
}

public enum Milestones {
    static let sessionMarks = [1, 10, 25, 50, 100, 250, 500]
    static let streakMarks = [2, 4, 8, 12, 26, 52]
    static let heaviestMarks: [Double] = [40, 60, 80, 100, 120, 140, 160, 180, 200]
    /// Tonnes moved in total.
    static let volumeMarks: [Double] = [10, 50, 100, 250, 500, 1000]

    /// Bronze for the first marks, silver, gold, and the last one of each kind
    /// its own top tier.
    static func tier(_ index: Int, of count: Int) -> Int {
        if index == count - 1 { return 3 }
        return min(2, index * 3 / max(count - 1, 1))
    }

    public static func make(sessions: [TrainingSession], bestStreak: Int, streakReachedOn: Date? = nil) -> [Milestone] {
        let workouts = sessions.filter { $0.kind == .workout }.sorted { $0.date < $1.date }
        var list: [Milestone] = []

        // Sessions: the date of the nth workout.
        for (index, mark) in sessionMarks.enumerated() {
            let reached = workouts.count >= mark ? workouts[mark - 1].date : nil
            list.append(.init(id: "sessions-\(mark)", kind: .sessions,
                              title: mark == 1 ? "First session" : "\(mark) sessions",
                              reachedOn: reached, current: Double(workouts.count), target: Double(mark),
                              badgeLabel: "\(mark)", tier: tier(index, of: sessionMarks.count),
                              howTo: mark == 1 ? "Log your first workout." : "Log \(mark) workouts."))
        }

        // Heaviest set and total volume, walked in order so each mark has a date.
        var heaviest: Double = 0
        var tonnes: Double = 0
        var heaviestOn: [Double: Date] = [:]
        var volumeOn: [Double: Date] = [:]
        for session in workouts {
            for result in session.results {
                for set in result.sets where set.countsTowardVolume {
                    let weight = NSDecimalNumber(decimal: set.weightKg ?? 0).doubleValue
                    heaviest = max(heaviest, weight)
                    for mark in heaviestMarks where heaviest >= mark && heaviestOn[mark] == nil {
                        heaviestOn[mark] = session.date
                    }
                }
            }
            tonnes += NSDecimalNumber(decimal: RecordsEngine.volumeLoad(session.results.flatMap(\.sets))).doubleValue / 1000
            for mark in volumeMarks where tonnes >= mark && volumeOn[mark] == nil {
                volumeOn[mark] = session.date
            }
        }
        for (index, mark) in heaviestMarks.enumerated() {
            list.append(.init(id: "heaviest-\(Int(mark))", kind: .heaviest,
                              title: "First \(Int(mark)) kg set",
                              reachedOn: heaviestOn[mark], current: heaviest, target: mark,
                              badgeLabel: "\(Int(mark)) kg", tier: tier(index, of: heaviestMarks.count),
                              howTo: "Lift \(Int(mark)) kg or more in any working set."))
        }
        for (index, mark) in volumeMarks.enumerated() {
            list.append(.init(id: "volume-\(Int(mark))", kind: .volume,
                              title: "\(Int(mark)) tonnes lifted",
                              reachedOn: volumeOn[mark], current: tonnes, target: mark,
                              badgeLabel: "\(Int(mark)) t", tier: tier(index, of: volumeMarks.count),
                              howTo: "Lift \(Int(mark)) tonnes in total: weight × reps, every working set."))
        }
        for (index, mark) in streakMarks.enumerated() {
            list.append(.init(id: "streak-\(mark)", kind: .streak,
                              title: "\(mark)-week streak",
                              reachedOn: bestStreak >= mark ? (streakReachedOn ?? workouts.last?.date) : nil,
                              current: Double(bestStreak), target: Double(mark),
                              badgeLabel: "\(mark) wk", tier: tier(index, of: streakMarks.count),
                              howTo: "Hit your weekly workout goal \(mark) weeks in a row."))
        }
        return list
    }

    /// Reached since `date` — what the finish screen can celebrate.
    public static func reached(in list: [Milestone], since date: Date) -> [Milestone] {
        list.filter { ($0.reachedOn ?? .distantPast) >= date }
    }

    // MARK: - Habits

    static let loggingMarks = [7, 30, 100, 365]
    static let proteinMarks = [5, 14, 30]
    static let fullDayMarks = [10, 50, 100]
    static let onTrackMarks = [2, 4, 8, 12]
    static let weighInMarks = [2, 4, 8]
    static let photoMarks = [3, 6, 12]

    /// Badges for the habits around training: logging food, hitting protein,
    /// staying in the goal's band, weighing in, check-in photos. They reward
    /// doing it, never a number on the scale.
    public static func habits(
        entries: [NutritionEntry],
        proteinTarget: Double?,
        weighInDates: [Date],
        photoDates: [Date],
        bestWeeksOnTrack: Int,
        calendar: Calendar = .current
    ) -> [Milestone] {
        var list: [Milestone] = []
        let days = Dictionary(grouping: entries, by: \.date)
        let dayKeys = days.keys.sorted()

        // Days logged: the date of the nth one.
        for (index, mark) in loggingMarks.enumerated() {
            list.append(.init(id: "logging-\(mark)", kind: .logging, title: "\(mark) days logged",
                              reachedOn: dayKeys.count >= mark ? Schedule.date(fromKey: dayKeys[mark - 1]) : nil,
                              current: Double(dayKeys.count), target: Double(mark),
                              badgeLabel: "\(mark) d", tier: tier(index, of: loggingMarks.count),
                              howTo: "Log what you eat on \(mark) different days."))
        }

        // Protein streak: days in a row at or over the target.
        var best = 0, run = 0
        var previous: Date?
        var bestOn: [Int: Date] = [:]
        if let target = proteinTarget, target > 0 {
            for key in dayKeys {
                guard let date = Schedule.date(fromKey: key) else { continue }
                let protein = days[key, default: []].reduce(0) { $0 + $1.protein }
                let follows = previous.map { calendar.dateComponents([.day], from: $0, to: date).day == 1 } ?? false
                run = protein >= target ? (follows ? run + 1 : 1) : 0
                previous = date
                if run > best {
                    best = run
                    for mark in proteinMarks where best >= mark && bestOn[mark] == nil { bestOn[mark] = date }
                }
            }
        }
        for (index, mark) in proteinMarks.enumerated() {
            list.append(.init(id: "protein-\(mark)", kind: .protein, title: "Protein \(mark) days running",
                              reachedOn: bestOn[mark], current: Double(best), target: Double(mark),
                              badgeLabel: "\(mark) d", tier: tier(index, of: proteinMarks.count),
                              howTo: "Hit your protein target \(mark) days in a row."))
        }

        // Full days: breakfast, lunch and dinner all logged.
        var full = 0
        var fullOn: [Int: Date] = [:]
        for key in dayKeys {
            let meals = Set(days[key, default: []].map(\.meal))
            guard meals.contains(Meal.ontbijt.rawValue), meals.contains(Meal.lunch.rawValue), meals.contains(Meal.avondeten.rawValue),
                  let date = Schedule.date(fromKey: key) else { continue }
            full += 1
            for mark in fullDayMarks where full >= mark && fullOn[mark] == nil { fullOn[mark] = date }
        }
        for (index, mark) in fullDayMarks.enumerated() {
            list.append(.init(id: "fullday-\(mark)", kind: .fullDay, title: "\(mark) full days",
                              reachedOn: fullOn[mark], current: Double(full), target: Double(mark),
                              badgeLabel: "\(mark)", tier: tier(index, of: fullDayMarks.count),
                              howTo: "Log breakfast, lunch and dinner on \(mark) days."))
        }

        // On track with the weight goal, weeks in a row.
        for (index, mark) in onTrackMarks.enumerated() {
            list.append(.init(id: "ontrack-\(mark)", kind: .onTrack, title: "\(mark) weeks on track",
                              reachedOn: bestWeeksOnTrack >= mark ? weighInDates.max() : nil,
                              current: Double(bestWeeksOnTrack), target: Double(mark),
                              badgeLabel: "\(mark) wk", tier: tier(index, of: onTrackMarks.count),
                              howTo: "Stay inside your weight goal's band \(mark) weeks in a row."))
        }

        // Weigh-in habit: weeks in a row with four weigh-ins or more.
        let weeks = Dictionary(grouping: weighInDates) { calendar.dateInterval(of: .weekOfYear, for: $0)?.start ?? $0 }
        var habitRun = 0, habitBest = 0
        var habitOn: [Int: Date] = [:]
        var lastWeek: Date?
        for week in weeks.keys.sorted() {
            let follows = lastWeek.map { calendar.dateComponents([.day], from: $0, to: week).day == 7 } ?? false
            habitRun = weeks[week, default: []].count >= 4 ? (follows ? habitRun + 1 : 1) : 0
            lastWeek = week
            if habitRun > habitBest {
                habitBest = habitRun
                for mark in weighInMarks where habitBest >= mark && habitOn[mark] == nil {
                    habitOn[mark] = weeks[week]?.max()
                }
            }
        }
        for (index, mark) in weighInMarks.enumerated() {
            list.append(.init(id: "weighins-\(mark)", kind: .weighIns, title: "\(mark) weeks weighing in",
                              reachedOn: habitOn[mark], current: Double(habitBest), target: Double(mark),
                              badgeLabel: "\(mark) wk", tier: tier(index, of: weighInMarks.count),
                              howTo: "Weigh in 4 times a week, \(mark) weeks in a row."))
        }

        // Check-in photos.
        let photos = photoDates.sorted()
        for (index, mark) in photoMarks.enumerated() {
            list.append(.init(id: "photos-\(mark)", kind: .photos, title: "\(mark) check-in photos",
                              reachedOn: photos.count >= mark ? photos[mark - 1] : nil,
                              current: Double(photos.count), target: Double(mark),
                              badgeLabel: "\(mark)", tier: tier(index, of: photoMarks.count),
                              howTo: "Take \(mark) check-in photos."))
        }
        return list
    }
}
