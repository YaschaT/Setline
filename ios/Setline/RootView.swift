import SwiftData
import SwiftUI
import SetlineCore

struct RootView: View {
    @Environment(AppState.self) private var app
    @Environment(\.modelContext) private var modelContext
    @State private var tab: SLTab = .training
    @State private var preflightDay: WorkoutDay?
    @State private var running: RunningSession?
    /// Which way the reader came in from the cold open, and therefore which
    /// side of the one identity screen opens.
    @State private var entry: Entry?
    @State private var onboarded = false

    private enum Entry { case beginning, returning }

    /// `-SetlineOnboarding` walks the new-account flow without making one.
    private var showsOnboarding: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-SetlineOnboarding") && !onboarded
        #else
        false
        #endif
    }

    /// `-SetlineColdOpen` shows the way in without signing anybody out.
    private var showsColdOpen: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-SetlineColdOpen") && entry == nil
        #else
        false
        #endif
    }

    /// A session in progress, optionally resumed from a paused snapshot.
    struct RunningSession: Identifiable {
        let day: WorkoutDay
        let snapshot: ActiveSessionSnapshot?
        var id: String { day.id }
    }

    var body: some View {
        Group {
            if app.isSignedIn, app.isNewAccount || showsOnboarding {
                OnboardingFlow(onFinish: {
                    onboarded = true
                    app.finishOnboarding()
                })
            } else if app.isSignedIn, !showsColdOpen {
                signedIn
            } else if let entry {
                SignInView(registering: entry == .beginning)
            } else {
                ColdOpenView(
                    onBegin: { entry = .beginning },
                    onSignIn: { entry = .returning }
                )
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
                }
            }
            .padding(.bottom, SL.Metric.tabBarHeight + SL.Space.tabInset)
            // Scrolled content stops at the status bar: the clock always sits
            // on the ground, as every artboard draws it.
            .safeAreaInset(edge: .top, spacing: 0) {
                Color.clear.frame(height: 0).background(SL.Surface.ground)
            }

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
