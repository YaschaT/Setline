import Foundation

/// A workout that has been started and not finished.
///
/// Pausing must never cost a set. The snapshot carries every row as it
/// stands — written sets and pre-filled drafts alike — plus which exercise
/// the user was on, so reopening puts them back exactly where they were.
///
/// It rides in the shared state blob under a key the web app does not read,
/// so a paused session survives a relaunch and follows the account across
/// devices. It is explicitly *not* a `TrainingSession`: nothing here counts
/// toward history, volume, records or progression until the session is
/// finished.
public struct ActiveSessionSnapshot: Codable, Hashable, Sendable {
    public var dayID: String
    public var dayLabel: String
    public var startedAt: Date
    public var currentIndex: Int
    public var results: [ExerciseResult]
    /// Per-exercise overrides of the proposal's rep target.
    public var proposedReps: [String: Int]
    /// Active workout time banked so far, in seconds. Time spent paused is
    /// never in here.
    public var activeSeconds: Int

    public init(
        dayID: String,
        dayLabel: String,
        startedAt: Date,
        currentIndex: Int,
        results: [ExerciseResult],
        proposedReps: [String: Int] = [:],
        activeSeconds: Int = 0
    ) {
        self.dayID = dayID
        self.dayLabel = dayLabel
        self.startedAt = startedAt
        self.currentIndex = currentIndex
        self.results = results
        self.proposedReps = proposedReps
        self.activeSeconds = max(0, activeSeconds)
    }

    private enum CodingKeys: String, CodingKey {
        case dayID, dayLabel, startedAt, currentIndex, results, proposedReps, activeSeconds
    }

    /// Tolerates a snapshot written before duration was tracked.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        dayID = try container.decode(String.self, forKey: .dayID)
        dayLabel = try container.decode(String.self, forKey: .dayLabel)
        startedAt = try container.decode(Date.self, forKey: .startedAt)
        currentIndex = try container.decode(Int.self, forKey: .currentIndex)
        results = try container.decode([ExerciseResult].self, forKey: .results)
        proposedReps = try container.decodeIfPresent([String: Int].self, forKey: .proposedReps) ?? [:]
        activeSeconds = try container.decodeIfPresent(Int.self, forKey: .activeSeconds) ?? 0
    }

    /// Sets actually written, for the resume prompt on the home screen.
    public var loggedSetCount: Int {
        results.flatMap(\.sets).filter(\.isLogged).count
    }

    public var plannedSetCount: Int {
        results.flatMap(\.sets).count
    }

    public var hasProgress: Bool { loggedSetCount > 0 }

    /// Turns a paused workout into history, keeping only what was written.
    ///
    /// Used when the session is ended from the home screen rather than
    /// resumed. Unwritten sets simply are not there — they count as not
    /// trained, which carries no penalty anywhere in the engine.
    public func finishedSession(id: String? = nil) -> TrainingSession {
        let results = results.map { result in
            ExerciseResult(
                exerciseID: result.exerciseID,
                name: result.name,
                sets: result.sets.filter(\.isLogged)
            )
        }
        let completion = plannedSetCount == 0
            ? 0
            : Int(Double(loggedSetCount) / Double(plannedSetCount) * 100)
        return TrainingSession(
            id: id ?? "\(Int(startedAt.timeIntervalSince1970 * 1000))",
            date: startedAt,
            dayID: dayID,
            dayLabel: dayLabel,
            completion: completion,
            kind: .workout,
            results: results,
            durationSeconds: activeSeconds
        )
    }
}
