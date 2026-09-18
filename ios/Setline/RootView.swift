import SwiftData
import SwiftUI
import SetlineCore

struct RootView: View {
    @Environment(AppState.self) private var app
    @Environment(\.modelContext) private var modelContext
    @State private var tab: SLTab = .training
    @State private var preflightDay: WorkoutDay?
    @State private var running: RunningSession?

    /// A session in progress, optionally resumed from a paused snapshot.
    struct RunningSession: Identifiable {
        let day: WorkoutDay
        let snapshot: ActiveSessionSnapshot?
        var id: String { day.id }
    }

    var body: some View {
        Group {
            if app.isSignedIn {
                signedIn
            } else {
                SignInView()
            }
        }
        .preferredColorScheme(.dark)
        .tint(SL.Signal.action)
        .task {
            // The local store has to be attached before the first read, or
            // restore falls back to a fresh state and a paused session looks
            // like it was never saved.
            app.attach(context: modelContext)
            await app.restore()
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-SetlineOpenSession") {
                if let paused = app.resumableSession, let day = app.day(for: paused) {
                    running = RunningSession(day: day, snapshot: paused)
                } else if let day = app.todayDay {
                    running = RunningSession(day: day, snapshot: nil)
                }
            }
            #endif
        }
    }

    private var signedIn: some View {
        ZStack(alignment: .bottom) {
            SL.Surface.ground.ignoresSafeArea()

            Group {
                switch tab {
                case .training:
                    TrainingHomeView(
                        onStart: { day in preflightDay = day },
                        onResume: { day, snapshot in
                            running = RunningSession(day: day, snapshot: snapshot)
                        }
                    )
                case .voeding:
                    NutritionHomeView()
                case .progressie:
                    ProgressHomeView()
                case .fotos:
                    PhotosHomeView()
                case .account:
                    AccountView()
                default:
                    PlaceholderView(tab: tab)
                }
            }
            .padding(.bottom, SL.Metric.tabBarHeight + SL.Space.tabInset)

            SLTabBar(selection: $tab)
                .padding(.bottom, SL.Space.tabInset)
        }
        // The session is a full-screen presentation over the tab shell, so
        // the tab bar is gone the moment it starts: mid-set there is one task.
        .fullScreenCover(item: $preflightDay) { day in
            PreflightView(
                day: day,
                onBegin: {
                    preflightDay = nil
                    // Let the sheet finish dismissing before the next opens.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        running = RunningSession(day: day, snapshot: nil)
                    }
                },
                onClose: { preflightDay = nil }
            )
        }
        .fullScreenCover(item: $running) { session in
            SessionView(
                day: session.day,
                app: app,
                resuming: session.snapshot,
                onFinish: { finished in
                    running = nil
                    Task { await save(finished) }
                },
                onPause: { snapshot in
                    running = nil
                    Task { await app.pauseSession(snapshot) }
                }
            )
        }
    }

    /// One workout per date: re-opening a day already logged reuses that
    /// session's id, so saving updates it in place. A second session would
    /// double-count every set in the history, the trend and the record checks.
    private func save(_ session: TrainingSession) async {
        await app.save(session: session)
    }
}

extension WorkoutDay: @retroactive Identifiable {}
