import ActivityKit
import Foundation
import SetlineCore

/// The rest countdown as a Live Activity, at the top of the iPhone: the
/// Dynamic Island while the phone is in use, the Lock Screen while it is not.
///
/// One activity at a time, started when a rest starts, rewritten when the
/// rest is lengthened, shortened or restarted, and ended when it is skipped,
/// the next set is logged, or the session leaves the screen. Where Live
/// Activities are switched off, the end-of-rest notification still says when
/// the rest is over (`RestNotifier`).
@MainActor
enum RestActivity {
    /// What the activity names: the exercise just done and what comes next.
    /// Set by the session before the rest starts.
    static var exercise = ""
    static var next = ""

    static var isAvailable: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    static func show(startedAt: Date, endsAt: Date) {
        guard isAvailable, endsAt > Date() else { return end() }
        let state = RestActivityAttributes.ContentState(startedAt: startedAt, endsAt: endsAt)
        let content = ActivityContent(state: state, staleDate: endsAt)
        let attributes = RestActivityAttributes(exercise: exercise, next: next)
        Task {
            // Looked up inside the task: an activity is not Sendable.
            let running = Activity<RestActivityAttributes>.activities
            if let current = running.first, current.attributes.exercise == attributes.exercise,
               current.attributes.next == attributes.next {
                await current.update(content)
                return
            }
            // A different set to rest for: a fresh activity, so its names are right.
            for activity in running { await activity.end(nil, dismissalPolicy: .immediate) }
            _ = try? Activity.request(attributes: attributes, content: content, pushType: nil)
        }
    }

    static func end() {
        Task {
            for activity in Activity<RestActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
