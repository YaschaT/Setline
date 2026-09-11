import Foundation

/// How long a workout has actually been worked at.
///
/// Active time, not wall-clock time. Rest, walking to the next machine and
/// the app sitting in the background all count — they are part of training.
/// Only an explicit `Pauzeer` stops the clock, and the gap until the user
/// comes back is never added, whether that is five minutes or overnight.
///
/// The session's `startedAt` stays what it always was: the calendar moment
/// the workout began, used for its date. Duration is this, separately.
public struct WorkoutClock: Hashable, Sendable {

    /// Time banked from earlier active stretches.
    public private(set) var accumulatedSeconds: Int
    /// When the current stretch began. `nil` while paused.
    public private(set) var segmentStartedAt: Date?

    public init(accumulatedSeconds: Int = 0, segmentStartedAt: Date?) {
        self.accumulatedSeconds = max(0, accumulatedSeconds)
        self.segmentStartedAt = segmentStartedAt
    }

    public var isRunning: Bool { segmentStartedAt != nil }

    /// Banked time plus the stretch in progress.
    public func activeSeconds(at now: Date) -> Int {
        guard let segmentStartedAt else { return accumulatedSeconds }
        let current = max(0, Int(now.timeIntervalSince(segmentStartedAt)))
        return accumulatedSeconds + current
    }

    /// Banks the current stretch and stops counting.
    public mutating func pause(at now: Date) {
        guard segmentStartedAt != nil else { return }
        accumulatedSeconds = activeSeconds(at: now)
        segmentStartedAt = nil
    }

    /// Starts a new stretch. The time since the pause is not counted.
    public mutating func resume(at now: Date) {
        guard segmentStartedAt == nil else { return }
        segmentStartedAt = now
    }
}
