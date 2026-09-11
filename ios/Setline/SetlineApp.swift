import SwiftUI
import SwiftData

@main
struct SetlineApp: App {
    @State private var app = AppState(client: SupabaseClient(config: SupabaseConfig.fromBundle()))
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

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .modelContainer(container)
        }
    }
}
