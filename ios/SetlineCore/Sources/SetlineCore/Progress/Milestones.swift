import Foundation

/// Things worth having done, kept for good: sessions logged, weeks in a row,
/// the heaviest set and the total weight moved. Each says when it was reached,
/// or how far there is still to go — real achievements, not points.
public struct Milestone: Identifiable, Equatable, Sendable {
    public enum Kind: String, Sendable { case sessions, streak, heaviest, volume }

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
}
