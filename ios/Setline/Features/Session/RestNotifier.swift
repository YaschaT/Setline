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

    static func schedule(at fireDate: Date, startedAt: Date = Date()) {
        generation += 1
        let mine = generation
        // The countdown at the top of the screen says how long is left and
        // when it is over; a banner on top of it would say it twice. The
        // notification stays for phones with Live Activities switched off.
        RestActivity.show(startedAt: startedAt, endsAt: fireDate)
        if RestActivity.isAvailable {
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
            return
        }
        Task { @MainActor in
            let center = UNUserNotificationCenter.current()
            // Never asked from here. Permission is earned on the sheet that
            // explains what the notification is for (artboard 07); until that
            // has happened there is simply nothing to schedule.
            let status = await center.notificationSettings().authorizationStatus
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

    static func status() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// The OS prompt, asked for once the reader has been told what it is for.
    @discardableResult
    static func request() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
    }

    static func cancel() {
        generation += 1
        RestActivity.end()
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        center.removeDeliveredNotifications(withIdentifiers: [identifier])
    }
}
