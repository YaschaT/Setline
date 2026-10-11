import SwiftData
import SwiftUI
import SetlineCore

struct RootView: View {
    @Environment(AppState.self) private var app
    @Environment(\.modelContext) private var modelContext
    @State private var tab: SLTab = .training
    /// The launch intro has played to its end.
    @State private var launchIntroDone = false
    /// The first load after launch is over; later loads (after a sign-in)
    /// get the ordinary loading screen.
    @State private var launchLoadDone = false
    @State private var running: RunningSession?
    /// Which way the reader came in from the cold open, and therefore which
    /// side of the one identity screen opens.
    @State private var entry: Entry?
    @State private var onboarded = false
    /// Account, opened from the avatar.
    @State private var showsAccount = false
    /// Friends, the feed and kudos, for whoever is signed in.
    @State private var social = SocialStore()
    /// Saved workouts go to friends unless switched off on the finish screen.
    /// A saved workout being turned into a post.
    @State private var composing: TrainingSession?
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(AppLock.preferenceKey) private var appLock = false
    /// Locked until Face ID says otherwise; set at launch and whenever the
    /// app goes to the background with the lock on.
    @State private var locked = AppLock.isOn
    /// Face ID itself takes the app out of the foreground; while it asks,
    /// coming back must not ask again.
    @State private var unlocking = false
    /// A food or progress badge just earned.
    @State private var habitBadge: Celebration?
    /// Habit badges already seen, so each is celebrated once.
    @AppStorage("setline.badges.habitsSeen") private var habitsSeen = ""
    /// An invite link opened: setline://add/<username>.
    @State private var invite: InviteLink?
    private struct InviteLink: Identifiable { let id: String }

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
    ///
    /// `loggingFor` is set when the workout is being written down afterwards
    /// for a date that has passed — the same screen, the same logging, with
    /// that date on the session instead of today.
    struct RunningSession: Identifiable {
        let day: WorkoutDay
        let snapshot: ActiveSessionSnapshot?
        var loggingFor: Date?
        var id: String {
            guard let loggingFor else { return day.id }
            return "\(day.id):\(Schedule.dateKey(loggingFor))"
        }
    }

    var body: some View {
        Group {
            if !launchIntroDone || (app.isLoading && !launchLoadDone) {
                // The cold launch: the intro plays once, whole, even when the
                // account is read in a fraction of a second.
                LoadingView(speed: 1.6, delay: .zero, onIntroFinished: { launchIntroDone = true })
                    .transition(.opacity)
            } else if app.isLoading {
                LoadingView()
                    .transition(.opacity)
            } else if app.isSignedIn, app.isNewAccount || showsOnboarding {
                OnboardingFlow(onFinish: {
                    onboarded = true
                    app.finishOnboarding()
                })
            } else if app.isSignedIn, !showsColdOpen {
                signedIn
            } else if let entry {
                SignInView(registering: entry == .beginning, onBack: { self.entry = nil })
            } else {
                ColdOpenView(
                    onBegin: { entry = .beginning },
                    onSignIn: { entry = .returning }
                )
            }
        }
        // Whatever loading led to fades in where the loading screen stood.
        .animation(.easeInOut(duration: 0.25), value: app.isLoading)
        .animation(.easeInOut(duration: 0.3), value: launchIntroDone)
        // Re-decided whenever the account changes: a logged workout takes
        // tonight's reminder away.
        .task(id: app.revision) {
            await StreakReminder.update(app: app)
            await NutritionReminders.update(app: app)
            celebrateHabits()
        }
        .slCelebration($habitBadge)
        .onChange(of: app.isLoading, initial: true) { _, loading in
            if !loading { launchLoadDone = true }
        }
        // Over everything, sheets included: locked, or out of the foreground
        // where the app switcher would show the screen.
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .background, appLock { locked = true }
            refreshShield()
            if phase == .active, appLock, locked, app.isSignedIn { unlock() }
        }
        .onChange(of: locked) { _, _ in refreshShield() }
        .onChange(of: app.isSignedIn) { _, signedIn in
            refreshShield()
            if signedIn, appLock, locked, scenePhase == .active { unlock() }
        }
        .onChange(of: appLock) { _, on in
            if !on { locked = false }
            refreshShield()
        }
        .preferredColorScheme(.dark)
        .tint(SL.Signal.action)
        .environment(social)
        .task {
            social.attach(app)
            // The local store has to be attached before the first read, or
            // restore falls back to a fresh state and a paused session looks
            // like it was never saved.
            app.attach(context: modelContext)
            await app.restore()
            #if DEBUG
            // `-SetlineTab voeding` opens on a tab, so each screen can be
            // checked without driving taps.
            let arguments = ProcessInfo.processInfo.arguments
            if let flag = arguments.firstIndex(of: "-SetlineTab"), arguments.indices.contains(flag + 1),
               let requested = SLTab(rawValue: arguments[flag + 1]) {
                tab = requested
            }
            if arguments.contains("-SetlineAccount") { showsAccount = true }
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
        GeometryReader { proxy in
        // The bar rests on the home band: at the bottom safe area, or 21 from
        // the edge on a phone without one — where every artboard draws it.
        let lift = max(0, SL.Space.homeBand - proxy.safeAreaInsets.bottom)
        ZStack(alignment: .bottom) {
            SL.Surface.ground.ignoresSafeArea()

            Group {
                switch tab {
                case .training:
                    TrainingHomeView(
                        // "Start training → logscherm": the session opens at
                        // once. Looking first is `Oefeningen bekijken`, which
                        // starts nothing.
                        onStart: { day in running = RunningSession(day: programmed(day), snapshot: nil) },
                        onResume: { day, snapshot in
                            running = RunningSession(day: day, snapshot: snapshot)
                        },
                        // A workout that was done but never written down opens
                        // the same session screen, with that date on it.
                        onLogPast: { day, date in
                            running = RunningSession(day: programmed(day), snapshot: nil, loggingFor: date)
                        },
                        onAccount: { showsAccount = true }
                    )
                case .voeding:
                    NutritionHomeView(onAccount: { showsAccount = true })
                case .progressie:
                    ProgressHomeView(onAccount: { showsAccount = true })
                case .friends:
                    FriendsView(onAccount: { showsAccount = true })
                case .fotos:
                    PhotosHomeView(onAccount: { showsAccount = true })
                }
            }
            // The bar, then the 4 the design leaves under it.
            .padding(.bottom, SL.Metric.tabBarHeight + 4 + lift)
            // Scrolled content stops at the status bar: the clock always sits
            // on the ground, as every artboard draws it.
            .safeAreaInset(edge: .top, spacing: 0) {
                Color.clear.frame(height: 0).background(SL.Surface.ground)
            }

            SLTabBar(selection: $tab, badges: [.friends: social.incoming.count])
                .padding(.bottom, lift)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        // Requests are known before Friends is opened, so its badge can say so.
        .task(id: app.userID) { await social.load() }
        // Back in the foreground, often back online: queued posts go out.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, !social.pending.isEmpty { Task { await social.load() } }
        }
        .sheet(isPresented: $showsAccount) {
            AccountView(onClose: { showsAccount = false })
                .background(SL.Surface.ground.ignoresSafeArea())
                .presentationDragIndicator(.visible)
        }
        // The session is a full-screen presentation over the tab shell, so
        // the tab bar is gone the moment it starts: mid-set there is one task.
        .fullScreenCover(item: $running) { session in
            SessionView(
                day: session.day,
                app: app,
                resuming: session.snapshot,
                loggingFor: session.loggingFor,
                onFinish: { finished, createPost in
                    running = nil
                    Task {
                        await app.save(session: finished)
                        // The composer opens once the session cover is gone.
                        if createPost {
                            try? await Task.sleep(for: .milliseconds(450))
                            composing = finished
                        }
                    }
                },
                onPause: { snapshot in
                    running = nil
                    Task { await app.pauseSession(snapshot) }
                },
                // Opened and left with nothing done: there is nothing to park.
                onClose: { running = nil }
            )
        }
        .onOpenURL { url in
            guard url.scheme == "setline", url.host() == "add",
                  let name = url.pathComponents.dropFirst().first, !name.isEmpty else { return }
            tab = .friends
            invite = InviteLink(id: name.lowercased())
        }
        .sheet(item: $invite) { link in
            InviteLandingSheet(username: link.id, onClose: { invite = nil })
                .environment(social)
        }
        .fullScreenCover(item: $composing) { session in
            PostComposerView(mode: .create(session), onClose: { composing = nil })
        }
    }

    /// A food or progress badge reached since the last look gets its moment;
    /// the first look only remembers, so nothing old is celebrated.
    private func celebrateHabits() {
        guard app.isSignedIn, !app.isLoading else { return }
        let reached = app.habitMilestones().filter(\.isReached)
        let ids = Set(reached.map(\.id))
        if habitsSeen.isEmpty {
            habitsSeen = ids.isEmpty ? "-" : ids.sorted().joined(separator: ",")
            return
        }
        let seen = Set(habitsSeen.split(separator: ",").map(String.init))
        if let new = reached.filter({ !seen.contains($0.id) }).max(by: { $0.tier < $1.tier }) {
            habitBadge = Celebration(symbol: "rosette", title: "Badge earned", detail: new.title, badge: new)
        }
        habitsSeen = seen.union(ids).sorted().joined(separator: ",")
    }

    private func refreshShield() {
        if appLock, app.isSignedIn, locked || scenePhase != .active {
            AppLockWindow.show(locked: locked, onUnlock: unlock)
        } else {
            AppLockWindow.hide()
        }
    }

    private func unlock() {
        guard !unlocking else { return }
        unlocking = true
        Task {
            if await AppLock.authenticate(reason: "Unlock Setline") { locked = false }
            // Let the foreground settle before another ask is allowed.
            try? await Task.sleep(for: .milliseconds(600))
            unlocking = false
        }
    }

    /// The day as the programme has it. A date read through the agenda
    /// already carries the lighter week; the session applies that itself, and
    /// handing it the lightened day would cut the sets twice.
    private func programmed(_ day: WorkoutDay) -> WorkoutDay {
        app.plan.first { $0.id == day.id } ?? day
    }

}
