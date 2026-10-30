import Foundation
import Observation
import SwiftData
import UIKit
import SetlineCore

enum SyncState: Equatable {
    case idle
    case syncing
    case synced(Date)
    case offline
    /// The account's refresh token was rejected, so only signing in again
    /// resumes sync. Everything on the device, pending changes included, stays.
    case sessionExpired
    case notConfigured
}

/// The app's one observable model.
///
/// Local first: the device's copy is authoritative for what the screen shows,
/// and every change lands there before the network is touched. "Loggen werkt
/// offline; syncen gebeurt zodra er verbinding is."
///
/// A change is recorded as a `StateChange` and synced by applying it to the
/// account's latest stored state — never by sending this device's copy, which
/// would overwrite whatever the web app wrote since.
@MainActor
@Observable
final class AppState {

    // MARK: Identity
    private(set) var session: AuthSession?
    private(set) var authError: String?
    private(set) var isWorking = false
    var isSignedIn: Bool { session != nil }
    /// From launch until the device knows who is signed in and has something
    /// of theirs to show — the copy on this phone, or the first one fetched
    /// when this phone has none. The loading screen stands in meanwhile.
    private(set) var isLoading = true
    /// The signed-in account's progress photos: on this device only, and
    /// apart from every other account's. `nil` while nobody is signed in.
    private(set) var photos: CheckInStore?
    /// The name and picture this account shows on this phone — the greeting
    /// and the avatar. Kept like the photos: here only, apart per account.
    private(set) var profileName: String?
    private(set) var profilePhoto: UIImage?
    private var profile: ProfileStore?

    // MARK: Data
    private(set) var state: LegacyState?
    private(set) var sync: SyncState = .idle
    /// Changes made on this device that the account does not have yet, oldest first.
    private(set) var pendingChanges: [StateChange] = []
    var hasPendingChanges: Bool { !pendingChanges.isEmpty }
    private(set) var lastSyncedAt: Date?

    // MARK: Derived
    private(set) var plan: [WorkoutDay] = PlanCatalog.personal
    private(set) var sessions: [TrainingSession] = []
    /// Moves every time the state is read again.
    ///
    /// A correction leaves the number of sessions exactly as it was, so views
    /// that reload on `sessions.count` would show yesterday's numbers. They
    /// watch this instead.
    private(set) var revision = 0
    private(set) var scheduleOverrides: [String: String] = [:]
    /// A workout that was started and paused. Not history: nothing in it
    /// counts until the session is finished.
    private(set) var activeSession: ActiveSessionSnapshot?
    /// Exercises whose warm-up ramp is hidden for good.
    private(set) var hiddenWarmups: Set<String> = []
    /// The exercises starred in Progressie's picker (40b).
    private(set) var favoriteExercises: Set<String> = []
    /// Notes that something was felt. They expire after 14 days (§14).
    private(set) var painFlags: [PainFlag] = []
    /// Replacements written into the program, as opposed to swapped for a day.
    private(set) var programReplacements: [ProgramReplacement] = []
    /// Exercises the user typed in themselves.
    private(set) var customExercises: [CustomExercise] = []
    /// Workouts the lifter put together, started like any plan day.
    private(set) var customWorkouts: [CustomWorkout] = []

    private(set) var nutritionEntries: [NutritionEntry] = []
    private(set) var targets: NutritionTargets?
    private(set) var plateInventory: PlateInventory = .default
    private(set) var experience: Experience?
    private(set) var deload: Deload?

    let display = NumberDisplay.english
    private let client: SupabaseClient
    private let foodSearch = FoodSearchService()
    private let mealScan = MealScanService()
    private var store: LocalStore?
    /// One sync at a time. A change made while one runs asks for another pass.
    private var isSyncing = false
    private var syncRequested = false
    /// Keeps the signed-in account's access token usable.
    private var auth: AuthSessionCoordinator?
    /// Which sign-in a refreshed token belongs to. A refresh that lands after
    /// signing out, or into another account, is ignored.
    private var authGeneration = UUID()

    private static let sessionKey = "supabase.session"

    init(client: SupabaseClient) {
        self.client = client
    }

    func attach(context: ModelContext) {
        store = LocalStore(context: context)
    }

    // MARK: - Launch

    func restore() async {
        #if DEBUG
        if DemoData.isEnabled {
            // `-SetlineSlowLoad` holds the loading screen for a few seconds.
            if ProcessInfo.processInfo.arguments.contains("-SetlineSlowLoad") {
                try? await Task.sleep(for: .seconds(4))
            }
            defer { isLoading = false }
            session = DemoData.session
            // A folder of its own, and never the photos the phone kept before
            // photos had owners: those can only be a real account's.
            openPhotos(for: .demo(DemoData.session.userID), mayAdopt: false)
            openProfile(for: .demo(DemoData.session.userID))
            // Read back what the device already holds, so a paused session
            // survives a relaunch exactly as it does for a real account.
            // `-SetlineResetDemo` starts from the fabricated data again.
            let stored = ProcessInfo.processInfo.arguments.contains("-SetlineResetDemo")
                ? nil
                : store?.load(for: DemoData.session.email)
            let demo = stored ?? DemoData.state()
            apply(demo)
            if stored == nil { store?.markSynced(demo, pending: [], at: Date(), for: DemoData.session.email) }
            lastSyncedAt = store?.lastSyncedAt(for: DemoData.session.email) ?? Date()
            sync = .synced(Date())
            return
        }
        #endif
        guard await client.isConfigured else {
            sync = .notConfigured
            isLoading = false
            return
        }
        if let data = Keychain.get(Self.sessionKey)?.data(using: .utf8),
           let saved = try? JSONDecoder().decode(AuthSession.self, from: data) {
            begin(saved)
            await loadState()
        }
        isLoading = false
    }

    // MARK: - Auth

    func signIn(email: String, password: String) async {
        await authenticate { try await self.client.signIn(email: email, password: password) }
    }

    /// True for exactly as long as it takes to walk a new account through
    /// onboarding. A returning sign-in never sets it, which is why signing in
    /// goes straight to the week you came for.
    private(set) var isNewAccount = false

    func signUp(email: String, password: String) async {
        await authenticate { try await self.client.signUp(email: email, password: password) }
        isNewAccount = authError == nil && session != nil
    }

    func finishOnboarding() {
        isNewAccount = false
    }

    func sendPasswordReset(email: String) async {
        guard !email.isEmpty else {
            authError = "Enter your email address first."
            return
        }
        do {
            try await client.sendPasswordReset(email: email)
            authError = "We sent a reset email to \(email)."
        } catch {
            authError = error.localizedDescription
        }
    }

    private func authenticate(_ work: @escaping () async throws -> AuthSession) async {
        isWorking = true
        authError = nil
        defer { isWorking = false }
        do {
            let result = try await work()
            if let auth, session?.email.lowercased() == result.email.lowercased() {
                // Signing in again after the session expired: the same
                // account keeps its device copy and its pending changes.
                session = result
                persist(result)
                await auth.replace(result)
            } else {
                // Another account's data never stays on screen for this one.
                clearData()
                begin(result)
                persist(result)
            }
            await loadState()
        } catch {
            authError = error.localizedDescription
        }
    }

    /// Leaves the account on this device. Its local copy and any pending
    /// changes stay stored under that account, and sync when it signs in again.
    func signOut() {
        isNewAccount = false
        #if DEBUG
        // The demo signed nothing in. The session in the keychain belongs to a
        // real account on this device, and leaving the demo must not end it.
        let keepsSavedSession = DemoData.isEnabled
        #else
        let keepsSavedSession = false
        #endif
        if !keepsSavedSession { Keychain.remove(Self.sessionKey) }
        session = nil
        // Closed, not deleted: they are there again when this account returns.
        photos = nil
        profile = nil
        profileName = nil
        profilePhoto = nil
        auth = nil
        authGeneration = UUID()
        clearData()
        sync = .idle
    }

    /// Starts using a session, with a token coordinator tied to this sign-in.
    private func begin(_ newSession: AuthSession) {
        let generation = UUID()
        authGeneration = generation
        session = newSession
        openPhotos(for: .account(newSession.userID), mayAdopt: mayAdoptUnownedPhotos(newSession))
        openProfile(for: .account(newSession.userID))
        auth = AuthSessionCoordinator(session: newSession, refresher: client) { [weak self] renewed in
            await self?.didRefresh(renewed, generation: generation)
        }
    }

    /// Opens an owner's photos, by user id. Photos the phone kept before they
    /// had owners move now, at sign-in, while the account that may have them
    /// is the one signed in.
    private func openPhotos(for owner: PhotoOwner, mayAdopt: Bool) {
        guard photos?.owner != owner else { return }
        let opened = CheckInStore(owner: owner, mayAdoptUnownedPhotos: mayAdopt)
        photos = opened
        Task { await opened.migrateUnownedPhotos() }
    }

    // MARK: - Social

    /// The signed-in account's id, for the social tables.
    var userID: String? { session?.userID }

    /// Runs a social request through this sign-in's token coordinator, so an
    /// expiring token is refreshed on the way like every sync request.
    func social<Value: Sendable>(_ request: @Sendable @escaping (SupabaseClient, AuthSession) async throws -> Value) async throws -> Value {
        guard let auth else { throw SupabaseClient.Failure.message("Sign in to see your friends.") }
        let client = self.client
        return try await auth.perform { session in try await request(client, session) }
    }

    // MARK: - Name and picture

    /// What the greeting calls you: the first word of the name you gave.
    var greetingName: String? { ProfileStore.firstName(of: profileName) }

    /// The letter on an avatar without a picture.
    var avatarInitial: String? { ProfileStore.initial(name: profileName, email: session?.email) }

    private func openProfile(for owner: PhotoOwner) {
        guard profile?.owner != owner else { return }
        let opened = ProfileStore(owner: owner)
        profile = opened
        profileName = opened.name()
        profilePhoto = opened.photo().flatMap { UIImage(data: $0) }
    }

    /// An empty name removes it; the greeting then says only "Hoi".
    func setProfileName(_ name: String) {
        guard let profile else { return }
        try? profile.setName(name)
        profileName = profile.name()
    }

    /// Keeps a square copy of the picture, small enough for an avatar.
    /// `false` when it could not be read or written.
    func setProfilePhoto(_ data: Data) async -> Bool {
        guard let profile else { return false }
        let square = await Task.detached(priority: .userInitiated) { ProfilePhoto.square(from: data) }.value
        // Signed out, or into another account, while the picture was read.
        guard let square, self.profile?.owner == profile.owner else { return false }
        do {
            try profile.setPhoto(square)
        } catch {
            return false
        }
        profilePhoto = UIImage(data: square)
        return true
    }

    func removeProfilePhoto() {
        guard let profile else { return }
        try? profile.removePhoto()
        profilePhoto = profile.photo().flatMap { UIImage(data: $0) }
    }

    /// Only while this is the one real account the device keeps data for;
    /// without the local store to ask, nobody can be shown to own them.
    private func mayAdoptUnownedPhotos(_ session: AuthSession) -> Bool {
        guard let store else { return false }
        return PhotoOwner.account(session.userID)
            .mayAdoptUnownedPhotos(email: session.email, accountsOnDevice: store.accountEmails())
    }

    /// Supabase retires a refresh token as soon as it is used, so the new one
    /// is stored before anything else can need it. Never after signing out:
    /// that would quietly sign the account back in on the next launch.
    private func didRefresh(_ renewed: AuthSession, generation: UUID) {
        guard generation == authGeneration, session != nil else { return }
        session = renewed
        persist(renewed)
    }

    private func persist(_ session: AuthSession) {
        guard let encoded = try? JSONEncoder().encode(session),
              let text = String(data: encoded, encoding: .utf8)
        else { return }
        Keychain.set(text, for: Self.sessionKey)
    }

    private func clearData() {
        state = nil
        plan = PlanCatalog.personal
        sessions = []
        scheduleOverrides = [:]
        nutritionEntries = []
        targets = nil
        plateInventory = .default
        experience = nil
        deload = nil
        activeSession = nil
        hiddenWarmups = []
        favoriteExercises = []
        painFlags = []
        programReplacements = []
        customExercises = []
        pendingChanges = []
        lastSyncedAt = nil
    }

    // MARK: - State

    /// The device's copy first, so the screen never waits on the network,
    /// then a sync with the account.
    func loadState() async {
        guard let session else {
            isLoading = false
            return
        }
        pendingChanges = store?.pendingChanges(for: session.email) ?? []
        lastSyncedAt = store?.lastSyncedAt(for: session.email)
        if let local = store?.load(for: session.email) {
            // The phone's own copy shows at once; the sync catches up behind it.
            apply(local)
            isLoading = false
        } else {
            // Nothing of this account on this phone yet: the loading screen
            // stays until the account's own state arrives, rather than a
            // plan that is not theirs.
            isLoading = true
        }
        await syncNow()
        // A brand-new account starts on the catalogue plan rather than an
        // empty screen.
        if state == nil { apply(LegacyState(raw: [:])) }
        isLoading = false
    }

    /// Brings this device and the account together.
    ///
    /// Reads the latest stored state, applies this device's pending changes
    /// to it, and writes only if nobody wrote in between. A failure of any
    /// kind — no connection, another writer winning every attempt, an expired
    /// session — keeps every pending change for the next sync. Nothing here
    /// ever signs the account out.
    func syncNow() async {
        guard session != nil else { return }
        #if DEBUG
        if DemoData.isEnabled {
            #if DEBUG
            // The three states a demo cannot reach on its own: no connection,
            // work still queued, and a sign-in that has run out.
            let arguments = ProcessInfo.processInfo.arguments
            if arguments.contains("-SetlineOffline") {
                sync = .offline
                return
            }
            if arguments.contains("-SetlineExpired") {
                sync = .sessionExpired
                return
            }
            if arguments.contains("-SetlinePending") {
                sync = .idle
                return
            }
            #endif
            // Demo data never leaves the device.
            pendingChanges = []
            let syncedAt = Date()
            if let state, let session { store?.markSynced(state, pending: [], at: syncedAt, for: session.email) }
            lastSyncedAt = syncedAt
            sync = .synced(syncedAt)
            return
        }
        #endif
        guard await client.isConfigured else {
            sync = .notConfigured
            return
        }
        guard !isSyncing else {
            syncRequested = true
            return
        }
        isSyncing = true
        defer { isSyncing = false }

        repeat {
            syncRequested = false
            // Read on every pass: signing in again while one ran replaces both.
            guard let session, let auth else { return }
            // An expired session is not asked again until the user signs in.
            if await auth.isExpired {
                sync = .sessionExpired
                continue
            }
            sync = .syncing
            do {
                let outcome = try await StateSync.run(
                    changes: pendingChanges,
                    recovering: store?.unrecordedWork(for: session.email),
                    store: SupabaseStateStore(client: client, auth: auth)
                )
                // Signed out, or into another account, while this ran.
                guard self.session?.userID == session.userID else { return }
                guard let outcome else {
                    // Another writer won every attempt. Nothing is lost.
                    sync = .offline
                    continue
                }

                pendingChanges.removeAll { outcome.settled.contains($0.id) }
                // What the account has, plus anything changed while this ran.
                let shown = StateMerge.apply(pendingChanges, to: outcome.state)
                apply(shown)
                let now = Date()
                lastSyncedAt = now
                store?.markSynced(shown, pending: pendingChanges, at: now, for: session.email)
                sync = .synced(now)
            } catch {
                guard self.session?.userID == session.userID else { return }
                sync = (error as? AuthFailure) == .expired ? .sessionExpired : .offline
            }
        } while syncRequested
    }

    /// Records changes: shown at once, kept on the device until the account
    /// has them, and synced straight away when there is a connection.
    private func commit(_ changes: [StateChange]) async {
        guard let session, let current = state, !changes.isEmpty else { return }
        let next = StateMerge.apply(changes, to: current)
        apply(next)
        pendingChanges.append(contentsOf: changes)
        store?.save(next, pending: pendingChanges, for: session.email)
        await syncNow()
    }

    private func apply(_ next: LegacyState?) {
        state = next
        revision &+= 1
        guard let next else { return }
        plan = LegacyAdapter.plan(from: next)
        sessions = LegacyAdapter.sessions(from: next).sorted { $0.date > $1.date }
        scheduleOverrides = LegacyAdapter.scheduleOverrides(from: next)
        activeSession = LegacyAdapter.activeSession(from: next)
        hiddenWarmups = LegacyAdapter.hiddenWarmups(from: next)
        favoriteExercises = LegacyAdapter.favoriteExercises(from: next)
        painFlags = LegacyAdapter.painFlags(from: next).active()
        programReplacements = LegacyAdapter.programReplacements(from: next)
        customExercises = LegacyAdapter.customExercises(from: next)
        customWorkouts = LegacyAdapter.customWorkouts(from: next)
        nutritionEntries = LegacyAdapter.nutritionEntries(from: next)
        targets = LegacyAdapter.targets(from: next)
        plateInventory = LegacyAdapter.plateInventory(from: next)
        experience = LegacyAdapter.experience(from: next)
        deload = LegacyAdapter.deload(from: next)
        plan = applyReplacements(to: plan)
    }

    /// Rewrites the plan wherever a permanent replacement reaches it.
    ///
    /// Done on read rather than by editing the stored plan, so the original
    /// prescription is never destroyed: undoing a replacement is deleting one
    /// row, not reconstructing what used to be there.
    private func applyReplacements(to days: [WorkoutDay]) -> [WorkoutDay] {
        guard !programReplacements.isEmpty else { return days }
        return days.map { day in
            var copy = day
            copy.exercises = day.exercises.map { planned in
                guard let replacement = programReplacements.last(where: {
                    $0.originExerciseID == planned.exerciseID && $0.applies(toDay: day.id)
                }) else { return planned }
                var swapped = planned
                swapped.exerciseID = replacement.substituteExerciseID
                return swapped
            }
            return copy
        }
    }

    /// Saves a paused workout, locally first.
    ///
    /// This is the whole of "leave and come back": the snapshot lands on the
    /// device immediately, and reaches the account when there is a network.
    /// Nothing about it is marked complete.
    func pauseSession(_ snapshot: ActiveSessionSnapshot) async {
        await commit([.activeSession(snapshot)])
    }

    /// "Altijd verbergen" on the ramp. The only warm-up state that persists.
    func hideWarmup(exerciseID: String) async {
        guard !hiddenWarmups.contains(exerciseID) else { return }
        await commit([StateChange(.hideWarmup(exerciseID: exerciseID))])
    }

    /// The star in Progressie's picker. One exercise at a time, so a star set
    /// on another device is never overwritten by this one's list.
    func setFavorite(exerciseID: String, isFavorite: Bool) async {
        guard favoriteExercises.contains(exerciseID) != isFavorite else { return }
        await commit([StateChange(.setFavoriteExercise(exerciseID: exerciseID, isFavorite: isFavorite))])
    }

    /// The open workout, written to this phone the moment it changes — every
    /// set logged, and whenever the app leaves the foreground — so iOS closing
    /// the app in the background never costs a set. Written to disk before
    /// this returns; the sync follows, with a little background time asked
    /// for so it can finish. One open workout is one row in the sync queue,
    /// however often it is kept.
    func keepOpenSession(_ snapshot: ActiveSessionSnapshot) {
        guard let session, let current = state else { return }
        let change = StateChange.activeSession(snapshot)
        let next = StateMerge.apply([change], to: current)
        apply(next)
        pendingChanges.removeAll { if case .setActiveSession = $0.kind { return true } else { return false } }
        pendingChanges.append(change)
        store?.save(next, pending: pendingChanges, for: session.email)
        let background = UIApplication.shared.beginBackgroundTask(withName: "setline.keepSession")
        Task {
            await syncNow()
            UIApplication.shared.endBackgroundTask(background)
        }
    }

    func clearActiveSession() async {
        guard activeSession != nil else { return }
        await commit([.activeSession(nil)])
    }

    /// The paused snapshot, whatever day it was started on.
    ///
    /// It is deliberately not scoped to today: a workout paused on Friday
    /// evening is still the workout you are in the middle of on Saturday
    /// morning, and quietly dropping it is the data loss this whole mechanism
    /// exists to prevent.
    var resumableSession: ActiveSessionSnapshot? { activeSession }

    /// The plan day a paused session belongs to, which need not be today's.
    func day(for snapshot: ActiveSessionSnapshot) -> WorkoutDay? {
        if let day = plan.first(where: { $0.id == snapshot.dayID }) { return day }
        // A workout of one's own resumes as itself, never as today's plan day;
        // one deleted meanwhile is rebuilt from what the snapshot carried.
        if CustomWorkout.isCustom(dayID: snapshot.dayID) {
            if let custom = customWorkouts.first(where: { $0.id == snapshot.dayID }) { return custom.workoutDay }
            let rebuilt = CustomWorkout(
                id: snapshot.dayID,
                name: snapshot.dayLabel,
                items: (snapshot.slots ?? []).map { CustomWorkout.Item(exerciseID: $0.active.exerciseID, sets: max(1, $0.setCount)) }
            )
            return rebuilt.workoutDay
        }
        return todayDay
    }

    func saveCustomWorkout(_ workout: CustomWorkout) async {
        await commit([StateChange(.upsertCustomWorkout(workout))])
    }

    /// Monday first, as the week sheet lists it; `Schedule.weekKey` counts from Sunday.
    static let weekdaysMondayFirst = [1, 2, 3, 4, 5, 6, 0]

    /// Your own week, Monday first (a day id or "rest" each), when you made one.
    var ownWeek: [String]? {
        let week = Schedule.weekOnly(scheduleOverrides)
        guard !week.isEmpty else { return nil }
        return Self.weekdaysMondayFirst.map { week[Schedule.weekKey($0)] ?? Schedule.defaultWeek[$0] ?? "rest" }
    }

    /// Writes your own week, Monday first, for the plan you're on — every
    /// weekday, so the week is wholly yours — or with `nil` hands the week
    /// back to the plan. Days you moved by date keep their change.
    func saveOwnWeek(_ days: [String]?) async {
        var changes = Self.weekdaysMondayFirst.enumerated().map { position, index in
            let key = "\(programKey):\(Schedule.weekKey(index))"
            if let days {
                return StateChange(.setScheduleDay(key: key, dayID: days.indices.contains(position) ? days[position] : "rest"))
            }
            return StateChange(.removeScheduleOverride(key: key))
        }
        // It holds from the day it was first made; an edit keeps that start.
        let fromKey = "\(programKey):\(Schedule.weekFromKey)"
        let from = scheduleOverrides[Schedule.weekFromKey] ?? Schedule.dateKey(Date())
        changes.append(days == nil
            ? StateChange(.removeScheduleOverride(key: fromKey))
            : StateChange(.setScheduleDay(key: fromKey, dayID: from)))
        await record(changes)
    }

    func removeCustomWorkout(id: String) async {
        await commit([StateChange(.removeCustomWorkout(id: id))])
    }

    /// Ends a paused session from the home screen, keeping what was logged.
    func endActiveSession() async {
        guard let snapshot = activeSession else { return }
        guard snapshot.hasProgress else {
            await clearActiveSession()
            return
        }
        let finished = snapshot.finishedSession(
            id: sessions.first {
                $0.dayID == snapshot.dayID
                    && Calendar.current.isDate($0.date, inSameDayAs: snapshot.startedAt)
                    && $0.kind == .workout
            }?.id
        )
        await save(session: finished)
    }

    /// "vandaag" / "van gisteren" / "van vrijdag" / "van 3 sep".
    func pausedWhenLabel(for snapshot: ActiveSessionSnapshot) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(snapshot.startedAt) { return "today" }
        if calendar.isDateInYesterday(snapshot.startedAt) { return "from yesterday" }
        let days = calendar.dateComponents([.day], from: snapshot.startedAt, to: Date()).day ?? 0
        if days < 7 {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US")
            formatter.dateFormat = "EEEE"
            return "from \(formatter.string(from: snapshot.startedAt))"
        }
        return "from \(display.shortDate(snapshot.startedAt))"
    }

    /// Writes a finished session, locally first.
    ///
    /// Finishing also clears the paused snapshot — the workout is history now,
    /// and leaving it behind would offer to resume something already saved.
    func save(session finished: TrainingSession) async {
        await commit([.upsert(finished), .activeSession(nil)])
    }

    /// Corrects sets in a session already saved.
    ///
    /// Only the named sets change. The session keeps its id, its exercises,
    /// their order and each set's origin; everything else in the account is
    /// untouched, offline included — the correction waits in the queue like
    /// any other change (`StateChange.correctSessionSets`).
    func correct(sessionID: String, _ corrections: [SetCorrection]) async {
        guard !corrections.isEmpty else { return }
        await commit([.correct(sessionID: sessionID, corrections)])
    }

    /// Takes sets out of one stored session. Only the named sets go; a session
    /// left with nothing in it goes too, because an empty workout would still
    /// read as a trained day.
    func removeSets(sessionID: String, _ removals: [SetRemoval]) async {
        guard !removals.isEmpty else { return }
        await commit([StateChange(.removeSessionSets(sessionID: sessionID, removals: removals))])
    }

    /// Sets done that day but not logged at the time, added to a saved
    /// workout after the sets each exercise already has. The whole session is
    /// written again, as finishing it does.
    func addSets(sessionID: String, _ additions: [SetAddition]) async {
        guard !additions.isEmpty, let session = sessions.first(where: { $0.id == sessionID }) else { return }
        await commit([.upsert(session.adding(additions))])
    }

    /// A saved workout written again as a whole — a new name, or an exercise
    /// that turned out to be another one.
    ///
    /// The merge keeps stored exercises an incoming copy doesn't mention (so
    /// a web-only result survives), so an exercise that was swapped out or
    /// left out goes first, set by set, in the same change.
    func replace(session: TrainingSession, removing removals: [SetRemoval] = []) async {
        var changes: [StateChange] = []
        if !removals.isEmpty { changes.append(StateChange(.removeSessionSets(sessionID: session.id, removals: removals))) }
        changes.append(.upsert(session))
        await commit(changes)
    }

    /// Takes one logged workout out of the account, everywhere: the web app
    /// reads the same tombstone and an older copy cannot bring it back.
    func removeSession(id: String) async {
        await commit([StateChange(.removeSession(id: id))])
    }

    /// Every logged workout out of the account, everywhere, with the paused
    /// one. Each goes as its own tombstone, so the web app and an older copy
    /// on another phone agree. The plan, food, weigh-ins and photos stay.
    func removeAllSessions() async {
        let changes = sessions.map { StateChange(.removeSession(id: $0.id)) }
            + (activeSession == nil ? [] : [.activeSession(nil)])
        await commit(changes)
    }

    // MARK: - Streak

    /// Weeks in a row with as many workouts as the plan asked for.
    var streak: TrainingStreak {
        TrainingStreak.make(sessions: sessions, plan: schedulePlan, overrides: scheduleOverrides)
    }

    /// The streak as it will stand once a workout on `date` is saved: what
    /// the finish screen promises before the save button is pressed.
    func streak(adding date: Date, day: WorkoutDay) -> TrainingStreak {
        let pending = TrainingSession(id: "pending", date: date, dayID: day.id, dayLabel: day.short, completion: 100, results: [])
        return TrainingStreak.make(sessions: sessions + [pending], plan: schedulePlan, overrides: scheduleOverrides)
    }

    // MARK: - Missed days

    /// Date keys answered with "niet getraind" in the alert center. Kept on
    /// this phone: it only quiets a question, it changes nothing in the account.
    private static let answeredMissedKey = "setline.alerts.answeredMissed"

    var answeredMissed: Set<String> {
        get {
            // Read so a view that asks is drawn again when an answer is given.
            _ = revision
            return Set(UserDefaults.standard.stringArray(forKey: Self.answeredMissedKey) ?? [])
        }
    }

    func answerMissed(_ key: String) {
        var keys = answeredMissed
        keys.insert(key)
        UserDefaults.standard.set(Array(keys), forKey: Self.answeredMissedKey)
        revision += 1
    }

    /// Planned days of the last two weeks that passed with nothing logged and
    /// were not answered yet, newest first.
    var missedDays: [AgendaDay] {
        Agenda.missed(
            plan: schedulePlan,
            overrides: scheduleOverrides,
            sessions: sessions,
            deload: activeDeload,
            dismissed: answeredMissed
        )
    }

    /// Records changes the user made outside a workout — a rearranged week,
    /// a meal, a target. Entry-wise, never a key at a time.
    func record(_ changes: [StateChange]) async {
        await commit(changes)
    }

    /// Logs one item of food, or rewrites one already logged. The rest of the
    /// account's food is not this entry's business.
    func log(food entry: NutritionEntry) async {
        await record([StateChange(.upsertNutritionEntry(entry.json))])
    }

    func removeFood(id: String) async {
        await record([StateChange(.removeNutritionEntry(id: id))])
    }

    /// The shared product search, as this account — with a token that is
    /// refreshed first when it has expired, through the same coordinator
    /// every sync uses.
    func searchFood(_ query: String) async -> FoodSearchOutcome {
        await foodSearch.search(query, auth: auth)
    }

    func nutrition(on date: Date = Date()) -> NutritionDay {
        NutritionDay.make(entries: nutritionEntries, on: date, targets: targets)
    }

    // MARK: - Food without typing

    /// Tally's meal scan on the Setline server, as this account. Demo mode
    /// has no account, so it never leaves the phone there.
    func scanMeal(_ request: FoodScanRequest) async -> MealScanService.Outcome {
        #if DEBUG
        // `-SetlineFakeMealScan '<answer json>'` stands in for the server.
        let arguments = ProcessInfo.processInfo.arguments
        if let flag = arguments.firstIndex(of: "-SetlineFakeMealScan"), arguments.indices.contains(flag + 1),
           let data = arguments[flag + 1].data(using: .utf8),
           let answer = try? JSONDecoder().decode(FoodScanAnswer.self, from: data) {
            try? await Task.sleep(for: .seconds(1))
            return .answer(answer)
        }
        #endif
        return await mealScan.scan(request, auth: auth)
    }

    func lookupBarcode(_ code: String) async -> FoodLookupService.BarcodeOutcome {
        await FoodLookupService().barcode(code)
    }


    // MARK: - Favorite foods

    /// Kept on this phone, per account: one tap to log again.
    private(set) var foodFavoritesRevision = 0

    private var favoritesKey: String { "setline.food.favorites.\(session?.email.lowercased() ?? "none")" }

    var foodFavorites: [FavoriteFood] {
        _ = foodFavoritesRevision
        guard let data = UserDefaults.standard.data(forKey: favoritesKey) else { return [] }
        return (try? JSONDecoder().decode([FavoriteFood].self, from: data)) ?? []
    }

    func isFavorite(_ entry: NutritionEntry) -> Bool {
        foodFavorites.contains { $0.matches(entry) }
    }

    func toggleFavorite(_ entry: NutritionEntry) {
        var list = foodFavorites
        if let index = list.firstIndex(where: { $0.matches(entry) }) {
            list.remove(at: index)
        } else {
            list.insert(FavoriteFood(entry), at: 0)
        }
        UserDefaults.standard.set(try? JSONEncoder().encode(list), forKey: favoritesKey)
        foodFavoritesRevision += 1
    }

    /// The days before today as eaten, newest first.
    func nutritionHistory(days: Int = 14, before date: Date = Date()) -> NutritionHistory {
        NutritionHistory.make(entries: nutritionEntries, targets: targets, days: days, before: date)
    }

    // MARK: - Weigh-ins

    /// Every weigh-in the account holds, newest last.
    var metrics: [BodyMetric] {
        state.map { LegacyAdapter.metrics(from: $0) } ?? []
    }

    /// What the scale said today, if it has been asked.
    func weighIn(on date: Date = Date()) -> BodyMetric? {
        WeighIn.stored(on: date, in: metrics)
    }

    /// Writes the day's weight: a new weigh-in, or the day's own written
    /// again. One day holds one weigh-in, so weighing twice corrects the
    /// number instead of adding a second row, and every other weigh-in — with
    /// the trend that follows from them — is left exactly as it was.
    func saveWeighIn(_ weightKg: Decimal, on date: Date = Date()) async {
        guard weightKg > 0 else { return }
        let entry = WeighIn.entry(weightKg: weightKg, on: date, in: metrics)
        await record([StateChange(.upsertMetric(WeighIn.json(entry)))])
    }

    // MARK: - Fatigue

    /// What the last week of logged sets says (TRAINING_LOGIC §11). Read fresh
    /// rather than stored: it is a view of the sessions, not a fact about them.
    var fatigue: Fatigue.Reading {
        Fatigue.read(sessions: sessions, display: display)
    }

    /// The lighter week now running, if one is.
    var activeDeload: Deload? {
        deload.flatMap { $0.isActive(on: Date()) ? $0 : nil }
    }

    /// Shown only when two signals agree, nothing is already running, and the
    /// last proposal was not waved away this week.
    var proposesDeload: Bool {
        guard activeDeload == nil, fatigue.proposes else { return false }
        guard let dismissed = UserDefaults.standard.object(forKey: Self.deloadDismissedKey) as? Date else { return true }
        return (Calendar.current.dateComponents([.day], from: dismissed, to: Date()).day ?? .max) >= Fatigue.windowDays
    }

    func applyDeload() async {
        let proposal = Deload(startedAt: Date())
        await record([StateChange(.setDeload(LegacyAdapter.json(proposal)))])
    }

    /// Waving it away is remembered on the device for a week; the reading that
    /// produced it is not changed by being ignored.
    func dismissDeload() {
        UserDefaults.standard.set(Date(), forKey: Self.deloadDismissedKey)
    }

    private static let deloadDismissedKey = "setline.deload.dismissed"

    /// Which program the account is running, which is what scopes a schedule
    /// override: a date under a plan you are not on is not your date.
    var programKey: String {
        guard let state else { return "personal" }
        let (mode, scienceID) = LegacyAdapter.planMode(from: state)
        return Schedule.programKey(mode: mode, sciencePlanID: scienceID)
    }

    // MARK: - Today

    var todayCanonicalDay: String {
        Schedule.canonicalDay(for: Date(), overrides: scheduleOverrides)
    }

    var todayDay: WorkoutDay? {
        Schedule.day(for: todayCanonicalDay, in: schedulePlan)
    }

    /// Every workout a day of the week can hold: the plan's days, then the
    /// lifter's own — so one can be put on a day in the Agenda like any plan
    /// day. Plan days come first, so they always win an id lookup.
    var schedulePlan: [WorkoutDay] { plan + customWorkouts.map(\.workoutDay) }

    var isRestDay: Bool { todayDay == nil }

    func history(for planned: PlannedExercise, before date: Date = Date()) -> ExerciseHistory {
        ExerciseHistory.build(
            exerciseID: planned.exerciseID,
            modifiers: planned.modifiers,
            from: sessions,
            before: date
        )
    }

    /// The lifts in a workout the engine says are ready to go up, with the
    /// weight it proposes — what Training can promise before a session
    /// starts. None during lighter days.
    func liftsReady(in day: WorkoutDay) -> [ReadyLift] {
        guard activeDeload == nil else { return [] }
        return day.exercises.compactMap { planned in
            let exercise = exercise(planned.exerciseID)
            let history = history(for: planned)
            let proposal = ProgressionEngine.proposal(planned: planned, exercise: exercise, history: history)
            guard proposal.tone == .ready, let weight = proposal.weightKg else { return nil }
            let last = history.mostRecent?.sets.first(where: \.countsTowardProgression)?.weightKg
            return ReadyLift(name: exercise.name, fromKg: last, toKg: weight)
        }
    }

    func exercise(_ id: String) -> Exercise {
        ExerciseCatalog.exercise(id)
            ?? customExercises.first { $0.id == id }?.exercise
            ?? Exercise(id: id, name: id, equipment: .machineSelectorised, isCompound: false)
    }

    // MARK: - Substitution

    /// Load tags the ranking should avoid right now, from every unexpired flag.
    var painfulLoadTags: Set<LoadTag> { painFlags.activeLoadTags() }

    /// Exercises the user has logged at least once. Familiarity is a nudge in
    /// the ranking, never a filter.
    var familiarExerciseIDs: Set<String> {
        Set(sessions.flatMap(\.results).filter { !$0.sets.filter(\.isLogged).isEmpty }.map(\.exerciseID))
    }

    /// Every unexpired flag narrows every swap, not only the one that
    /// recorded it — and "the machine is taken" applies alongside it. Neither
    /// context switches the other off.
    func swapContext(for exerciseID: String, occupied: Bool, excluding: Set<String>) -> SwapContext {
        SwapContext(
            currentExerciseID: exerciseID,
            role: ExerciseCatalog.role(exerciseID),
            isOccupied: occupied,
            painfulLoadTags: painfulLoadTags,
            familiarExerciseIDs: familiarExerciseIDs,
            excludedExerciseIDs: excluding
        )
    }

    func alternatives(for exerciseID: String, occupied: Bool, excluding: Set<String>) -> [RankedAlternative] {
        SubstitutionRanker.rank(swapContext(for: exerciseID, occupied: occupied, excluding: excluding))
    }

    /// Everything eligible, for `Andere opties bekijken`. Same engine, same
    /// filters — it simply does not stop at three.
    func browsableAlternatives(for exerciseID: String, occupied: Bool, excluding: Set<String>) -> [RankedAlternative] {
        SubstitutionRanker.browse(swapContext(for: exerciseID, occupied: occupied, excluding: excluding))
    }

    /// Whether an active region actually changed this list. The sheet may only
    /// say it took a region into account when this is true.
    func painChangesList(region: PainRegion, for exerciseID: String, occupied: Bool, excluding: Set<String>) -> Bool {
        let others = painFlags.active()
            .filter { $0.region != region }
            .reduce(into: Set<LoadTag>()) { $0.formUnion($1.region.loadTags) }
        return SubstitutionRanker.painChangesRecommendations(
            swapContext(for: exerciseID, occupied: occupied, excluding: excluding),
            tags: region.loadTags.subtracting(others)
        )
    }

    /// The same question, asked before the flag exists.
    func painWouldChangeList(region: PainRegion, for exerciseID: String, occupied: Bool, excluding: Set<String>) -> Bool {
        SubstitutionRanker.painChangesRecommendations(
            swapContext(for: exerciseID, occupied: occupied, excluding: excluding),
            tags: region.loadTags
        )
    }

    /// True when pain is the reason the list is empty.
    func painEmptiesList(for exerciseID: String, occupied: Bool, excluding: Set<String>) -> Bool {
        let context = swapContext(for: exerciseID, occupied: occupied, excluding: excluding)
        guard !context.painfulLoadTags.isEmpty, SubstitutionRanker.rank(context).isEmpty else { return false }
        var without = context
        without.painfulLoadTags = []
        return !SubstitutionRanker.rank(without).isEmpty
    }

    /// Regions currently narrowing the list, newest first.
    var activePainRegions: [PainRegion] {
        var seen: Set<PainRegion> = []
        return painFlags.active().sorted { $0.date > $1.date }.compactMap { flag in
            seen.insert(flag.region).inserted ? flag.region : nil
        }
    }

    func forgetPain(region: PainRegion) async {
        await commit(painFlags.filter { $0.region == region }.map { StateChange(.removePainFlag(id: $0.id)) })
    }

    func record(pain flag: PainFlag) async {
        await commit([StateChange(.addPainFlag(flag))])
    }

    func forget(pain flag: PainFlag) async {
        await commit([StateChange(.removePainFlag(id: flag.id))])
    }

    func replaceInProgram(_ replacement: ProgramReplacement) async {
        await commit([StateChange(.addProgramReplacement(replacement))])
    }

    /// Removes a program change. The old exercise was never edited away — the
    /// plan is rewritten on read — so undoing is deleting one row.
    func undoReplacement(_ replacement: ProgramReplacement) async {
        await commit([StateChange(.removeProgramReplacement(id: replacement.id))])
    }

    func addCustomExercise(_ exercise: CustomExercise) async {
        guard !customExercises.contains(where: { $0.id == exercise.id }) else { return }
        await commit([StateChange(.addCustomExercise(exercise))])
    }

    /// "18 sets · doel 6.240 kg · laatst 3 sep"
    func todayMetaLine() -> String? {
        guard let day = todayDay else { return nil }
        // The sets the session will open with, a lighter week included.
        let setCount = SessionPrescription.setCount(of: day, deload: activeDeload)
        var parts = ["\(setCount) sets"]

        let target = day.exercises.reduce(Decimal(0)) { total, planned in
            let history = self.history(for: planned)
            guard let last = history.mostRecent else { return total }
            return total + RecordsEngine.volumeLoad(last.sets)
        }
        if target > 0 { parts.append("target \(display.volumeKg(target))") }

        if let last = sessions.first(where: { $0.dayID == day.id && $0.kind == .workout }) {
            parts.append("laatst \(display.shortDate(last.date))")
        }
        return parts.joined(separator: " · ")
    }
}

/// A lift the engine proposes to raise: last time's working weight and the
/// one it suggests today.
struct ReadyLift: Identifiable {
    let name: String
    let fromKg: Decimal?
    let toKg: Decimal
    var id: String { name }
}
