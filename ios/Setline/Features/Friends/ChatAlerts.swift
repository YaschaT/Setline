import BackgroundTasks
import Foundation
import UserNotifications

/// Chat alerts in the iPhone app. Instant push needs Apple's paid developer
/// program, so the app looks for new messages itself: going to the
/// background it asks iOS for a refresh, and iOS runs it when it sees fit,
/// often within the hour. Every new message from someone else in Friends, a
/// private chat or one of your rooms becomes a notification; Everyone never
/// does. The web app gets real push instead (ChatPush.ts).
enum ChatAlerts {
    static let taskID = "be.setline.app.chat"
    private static let enabledKey = "setline.chat.alerts"
    private static let seenKey = "setline.chat.alerts.seen"

    static var isEnabled: Bool { UserDefaults.standard.bool(forKey: enabledKey) }

    /// Asks once; on yes, starts from now so old messages stay quiet.
    @MainActor
    static func setEnabled(_ on: Bool) async -> Bool {
        guard on else {
            UserDefaults.standard.set(false, forKey: enabledKey)
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskID)
            return false
        }
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        UserDefaults.standard.set(granted, forKey: enabledKey)
        if granted {
            UserDefaults.standard.set(SocialStore.isoString(Date()), forKey: seenKey)
            schedule()
        }
        return granted
    }

    static func schedule() {
        guard isEnabled else { return }
        let request = BGAppRefreshTaskRequest(identifier: taskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// The background refresh: what arrived since the last look, as notifications.
    @MainActor
    static func check(app: AppState) async {
        schedule()
        guard isEnabled, app.userID != nil else { return }
        let since = UserDefaults.standard.string(forKey: seenKey) ?? SocialStore.isoString(Date())
        let store = SocialStore()
        store.attach(app)
        guard let (messages, rooms) = try? await store.chatSince(since), let newest = messages.last else { return }
        UserDefaults.standard.set(newest.created_at, forKey: seenKey)

        // Read in the app already, or a burst: one notification per conversation.
        let unread = messages.filter { $0.created_at > ChatReadMarker.value($0.room_id) }
        let byChat = Dictionary(grouping: unread) { $0.room_id ?? "" }
        let center = UNUserNotificationCenter.current()
        for (key, group) in byChat {
            guard let last = group.last else { continue }
            let sender = last.author?.display_name ?? "A friend"
            let room = rooms.first { $0.id == key }
            let content = UNMutableNotificationContent()
            content.title = room == nil ? "\(sender) · Friends" : room?.kind == .room ? "\(sender) in \(room?.name ?? "a room")" : sender
            let words = last.body.trimmingCharacters(in: .whitespacesAndNewlines)
            let text = words.isEmpty ? "Sent a photo" : String(words.prefix(140))
            content.body = group.count > 1 ? "\(text) · +\(group.count - 1) more" : text
            content.sound = .default
            content.threadIdentifier = "chat-\(key)"
            try? await center.add(UNNotificationRequest(identifier: "chat-\(last.id)", content: content, trigger: nil))
        }
    }
}
