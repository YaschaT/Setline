import Foundation
import UserNotifications

/// A nudge when a workout is left open or paused and not picked up again:
/// "Your Push workout is still open". One at a time, replaced whenever the
/// workout is left again and gone the moment it is resumed or finished.
///
/// Uses the notification permission the app already has (rest timer, meal
/// reminders), or asks for it the first time a workout is paused by hand.
/// The wait is an Account setting.
enum WorkoutReminder {
    static let minutesKey = "setline.reminders.openWorkoutMinutes"
    static let choices = [0, 10, 20, 30, 60]
    private static let id = "setline.workout.open"

    /// Minutes to wait; 0 is off. 20 until changed.
    static var minutes: Int {
        UserDefaults.standard.object(forKey: minutesKey) as? Int ?? 20
    }

    static func label(_ minutes: Int) -> String {
        minutes == 0 ? "Off" : minutes == 60 ? "After 1 hour" : "After \(minutes) min"
    }

    /// The workout was left — the app went to the background mid-workout, or
    /// it was paused by hand.
    static func schedule(dayLabel: String, paused: Bool) {
        let wait = minutes
        cancel()
        guard wait > 0 else { return }
        Task {
            let center = UNUserNotificationCenter.current()
            var status = await center.notificationSettings().authorizationStatus
            // Asked once, at the moment it is obviously useful: the workout was
            // just paused by hand, in the app. Never from the background.
            if status == .notDetermined, paused {
                let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
                status = granted ? .authorized : .denied
            }
            guard status == .authorized || status == .provisional else { return }
            let content = UNMutableNotificationContent()
            content.title = paused ? "\(dayLabel) is paused" : "\(dayLabel) is still open"
            content.body = paused
                ? "Pick it up where you left off, or finish it so your sets count."
                : "Continue your workout, or finish it so your sets count."
            content.sound = .default
            content.threadIdentifier = "setline.workout"
            try? await center.add(UNNotificationRequest(
                identifier: id,
                content: content,
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(wait * 60), repeats: false)
            ))
        }
    }

    /// Back in the workout, or it was finished or ended.
    static func cancel() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [id])
    }
}
