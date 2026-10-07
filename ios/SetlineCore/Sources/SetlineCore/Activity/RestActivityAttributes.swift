#if canImport(ActivityKit) && os(iOS)
import ActivityKit
import Foundation

/// The rest countdown as a Live Activity: the Dynamic Island and the Lock
/// Screen show how long the rest still runs, so the phone never has to be
/// unlocked to know. Shared by the app, which starts and ends it, and the
/// widget extension, which draws it.
public struct RestActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable, Sendable {
        /// When the rest began and when it ends. The system counts down
        /// between them on its own; the app only writes again when the rest
        /// is lengthened, shortened or restarted.
        public var startedAt: Date
        public var endsAt: Date

        public init(startedAt: Date, endsAt: Date) {
            self.startedAt = startedAt
            self.endsAt = endsAt
        }
    }

    /// The exercise just finished — "Flat bench press".
    public var exercise: String
    /// What comes after the rest — "Set 3 of 4".
    public var next: String

    public init(exercise: String, next: String) {
        self.exercise = exercise
        self.next = next
    }
}
#endif
