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

    public var isReached: Bool { reachedOn != nil }
    public var fraction: Double { min(1, max(0, current / max(target, 1))) }
}

public enum Milestones {
    static let sessionMarks = [1, 10, 25, 50, 100, 250, 500]
    static let streakMarks = [2, 4, 8, 12, 26, 52]
    static let heaviestMarks: [Double] = [40, 60, 80, 100, 120, 140, 160, 180, 200]
    /// Tonnes moved in total.
    static let volumeMarks: [Double] = [10, 50, 100, 250, 500, 1000]

    public static func make(sessions: [TrainingSession], bestStreak: Int, streakReachedOn: Date? = nil) -> [Milestone] {
        let workouts = sessions.filter { $0.kind == .workout }.sorted { $0.date < $1.date }
        var list: [Milestone] = []

        // Sessions: the date of the nth workout.
        for mark in sessionMarks {
            let reached = workouts.count >= mark ? workouts[mark - 1].date : nil
            list.append(.init(id: "sessions-\(mark)", kind: .sessions,
                              title: mark == 1 ? "First session" : "\(mark) sessions",
                              reachedOn: reached, current: Double(workouts.count), target: Double(mark)))
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
        for mark in heaviestMarks {
            list.append(.init(id: "heaviest-\(Int(mark))", kind: .heaviest,
                              title: "First \(Int(mark)) kg set",
                              reachedOn: heaviestOn[mark], current: heaviest, target: mark))
        }
        for mark in volumeMarks {
            list.append(.init(id: "volume-\(Int(mark))", kind: .volume,
                              title: "\(Int(mark)) tonnes lifted",
                              reachedOn: volumeOn[mark], current: tonnes, target: mark))
        }
        for mark in streakMarks {
            list.append(.init(id: "streak-\(mark)", kind: .streak,
                              title: "\(mark)-week streak",
                              reachedOn: bestStreak >= mark ? (streakReachedOn ?? workouts.last?.date) : nil,
                              current: Double(bestStreak), target: Double(mark)))
        }
        return list
    }

    /// Reached since `date` — what the finish screen can celebrate.
    public static func reached(in list: [Milestone], since date: Date) -> [Milestone] {
        list.filter { ($0.reachedOn ?? .distantPast) >= date }
    }
}
