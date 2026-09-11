import Foundation

/// Rest is not one number. Addendum 13R: it inherits from the exercise's role.
///
/// This replaces both the web app's free-text `rest` strings ("4–5 min",
/// "90 sec") and the flat 2:00 that `SL.Metric.restDefault` implies — 2:00 is
/// the *compound* default, which is why the pre-flight header shows it as the
/// session's headline rest.
///
/// The ranges are the design's; they sit inside the goal-profile ranges in
/// TRAINING_LOGIC §6, which floors isolation rest at 90 s (Singer 2024).
public struct RestPrescription: Codable, Hashable, Sendable {
    public var defaultSeconds: Int
    public var range: ClosedRange<Int>

    public init(defaultSeconds: Int, range: ClosedRange<Int>) {
        self.defaultSeconds = defaultSeconds
        self.range = range
    }

    public static func forRole(_ role: ExerciseRole) -> RestPrescription {
        switch role {
        case .primaryStrength:
            return RestPrescription(defaultSeconds: 180, range: 180...300)
        case .secondaryCompound:
            return RestPrescription(defaultSeconds: 120, range: 120...180)
        case .accessory, .isolation:
            return RestPrescription(defaultSeconds: 90, range: 90...120)
        }
    }

    /// The label the design uses on the pre-flight header and in Account.
    public var displayLabel: String {
        let minutes = defaultSeconds / 60
        let seconds = defaultSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

/// The floating rest timer's clock.
///
/// ±15 s adjusts *this* rest and never resets the running count (13R), and
/// the fire date is absolute so the count survives suspension — README,
/// "Native iOS behaviours" item 4.
public struct RestTimerState: Equatable, Sendable {
    public var targetSeconds: Int
    public var startedAt: Date
    public var adjustmentSeconds: Int
    public var isRunning: Bool

    public init(targetSeconds: Int, startedAt: Date, adjustmentSeconds: Int = 0, isRunning: Bool = true) {
        self.targetSeconds = targetSeconds
        self.startedAt = startedAt
        self.adjustmentSeconds = adjustmentSeconds
        self.isRunning = isRunning
    }

    public var fireDate: Date {
        startedAt.addingTimeInterval(Double(targetSeconds + adjustmentSeconds))
    }

    public func remaining(at now: Date) -> Int {
        max(0, Int(fireDate.timeIntervalSince(now).rounded(.up)))
    }

    /// Adjust without resetting: only the target moves, `startedAt` is untouched.
    public mutating func adjust(by seconds: Int, floorRemainingAt now: Date = Date()) {
        let proposed = adjustmentSeconds + seconds
        let candidate = RestTimerState(
            targetSeconds: targetSeconds,
            startedAt: startedAt,
            adjustmentSeconds: proposed,
            isRunning: isRunning
        )
        // Never let an adjustment push the clock into the past.
        adjustmentSeconds = candidate.remaining(at: now) > 0 || seconds > 0 ? proposed : adjustmentSeconds
    }

    public static func clockLabel(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
