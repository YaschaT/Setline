import SwiftUI
import SwiftData
import UserNotifications

/// Shows Setline's own reminders while Setline is open too — iOS keeps them
/// silent in the foreground unless the app says otherwise.
final class NotificationPresenter: NSObject, UNUserNotificationCenterDelegate, Sendable {
    static let shared = NotificationPresenter()

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}

@main
struct SetlineApp: App {
    @State private var app = AppState(client: SupabaseClient(config: SupabaseConfig.fromBundle()))
    @Environment(\.scenePhase) private var scenePhase
    private let container: ModelContainer = {
        do {
            return try ModelContainer(for: StoredState.self)
        } catch {
            // An unreadable store must not lock someone out of a workout:
            // fall back to memory so logging still works this session.
            return try! ModelContainer(
                for: StoredState.self,
                configurations: ModelConfiguration(isStoredInMemoryOnly: true)
            )
        }
    }()

    init() {
        UNUserNotificationCenter.current().delegate = NotificationPresenter.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .modelContainer(container)
        }
        .onChange(of: scenePhase) { _, phase in
            // Coming back to the app retries anything still waiting to sync,
            // so a change made offline never simply waits for the next one.
            if phase == .active { Task { await app.syncNow() } }
        }
    }
}
