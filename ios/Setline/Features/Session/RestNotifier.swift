import Foundation
@preconcurrency import UserNotifications

/// The end of rest, when the app is not on screen.
///
/// In the foreground the session gives a haptic at 00:00 and this stays
/// silent — iOS does not present a local notification over the app that
/// scheduled it. In the background it is the only thing that can say the rest
/// is over. There is one pending request at a time: logging the next set
/// replaces it; skipping, pausing and finishing remove it.
@MainActor
enum RestNotifier {
    private static let identifier = "setline.rest.finished"
    /// Bumped by every schedule and cancel, so a request whose permission
    /// check resolves late can never land after it was cancelled or replaced.
    private static var generation = 0

    static func schedule(at fireDate: Date) {
        generation += 1
        let mine = generation
        Task { @MainActor in
            let center = UNUserNotificationCenter.current()
            var status = await center.notificationSettings().authorizationStatus
            if status == .notDetermined {
                // Asked when the first rest starts, where the reason is obvious.
                _ = try? await center.requestAuthorization(options: [.alert, .sound])
                status = await center.notificationSettings().authorizationStatus
            }
            guard mine == generation else { return }
            guard status == .authorized || status == .provisional else { return }
            let interval = fireDate.timeIntervalSinceNow
            guard interval > 1 else { return }

            let content = UNMutableNotificationContent()
            content.title = "Rust voorbij"
            content.body = "Tijd voor je volgende set."
            content.sound = .default

            center.removePendingNotificationRequests(withIdentifiers: [identifier])
            try? await center.add(UNNotificationRequest(
                identifier: identifier,
                content: content,
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
            ))
        }
    }

    static func cancel() {
        generation += 1
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        center.removeDeliveredNotifications(withIdentifiers: [identifier])
    }
}
