import Foundation
import SetlineCore
@preconcurrency import UserNotifications

/// The one reminder the app sends on its own: at 19:00 on a planned training
/// day that has nothing logged yet, saying what is still on and what the
/// streak stands at. Logging the workout, or the day not being a training
/// day, takes it away. It never asks for permission itself — the rest timer's
/// sheet does — so without it nothing is scheduled.
@MainActor
enum StreakReminder {
    private static let identifier = "setline.streak.reminder"
    static let hour = 19

    static func update(app: AppState, now: Date = Date(), calendar: Calendar = .current) async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        guard app.isSignedIn else { return }
        let status = await center.notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional else { return }

        let week = Agenda.week(containing: now, plan: app.schedulePlan, overrides: app.scheduleOverrides,
                               sessions: app.sessions, deload: app.activeDeload)
        guard let today = week.first(where: \.isToday),
              case .planned(let workout) = today.content,
              let fire = calendar.date(bySettingHour: hour, minute: 0, second: 0, of: now),
              fire > now
        else { return }

        let streak = app.streak
        let content = UNMutableNotificationContent()
        content.title = "\(workout.short) is still on today"
        content.body = streak.weeks > 0
            ? "Train today to keep your \(streak.weeks)-week streak going."
            : "\(streak.thisWeekDone) of \(streak.thisWeekGoal) this week. A good day to start a streak."
        content.sound = .default
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
        try? await center.add(UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
        ))
    }
}
