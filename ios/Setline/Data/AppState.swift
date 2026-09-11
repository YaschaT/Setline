import Foundation
import Observation
import SwiftData
import SetlineCore

enum SyncState: Equatable {
    case idle
    case syncing
    case synced(Date)
    case offline
    case notConfigured
}

/// The app's one observable model.
///
/// Local first: the device's copy is authoritative and every write lands
/// there before the network is touched. "Loggen werkt offline; syncen
/// gebeurt zodra er verbinding is."
@MainActor
@Observable
final class AppState {

    // MARK: Identity
    private(set) var session: SupabaseClient.Session?
    private(set) var authError: String?
    private(set) var isWorking = false
    var isSignedIn: Bool { session != nil }

    // MARK: Data
    private(set) var state: LegacyState?
    private(set) var sync: SyncState = .idle

    // MARK: Derived
    private(set) var plan: [WorkoutDay] = PlanCatalog.personal
    private(set) var sessions: [TrainingSession] = []
    private(set) var scheduleOverrides: [String: String] = [:]
    /// A workout that was started and paused. Not history: nothing in it
    /// counts until the session is finished.
    private(set) var activeSession: ActiveSessionSnapshot?
    /// Exercises whose warm-up ramp is hidden for good.
    private(set) var hiddenWarmups: Set<String> = []

    let display = NumberDisplay.dutch
    private let client: SupabaseClient
    private var store: LocalStore?

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
            session = DemoData.session
            // Read back what the device already holds, so a paused session
            // survives a relaunch exactly as it does for a real account.
            // `-SetlineResetDemo` starts from the fabricated data again.
            let stored = ProcessInfo.processInfo.arguments.contains("-SetlineResetDemo")
                ? nil
                : store?.load(for: DemoData.session.email)
            apply(stored ?? DemoData.state())
            if stored == nil { store?.save(DemoData.state(), for: DemoData.session.email, pending: false) }
            sync = .synced(Date())
            return
        }
        #endif
        guard await client.isConfigured else {
            sync = .notConfigured
            return
        }
        if let data = Keychain.get(Self.sessionKey)?.data(using: .utf8),
           let saved = try? JSONDecoder().decode(SupabaseClient.Session.self, from: data) {
            session = saved
            await loadState()
        }
    }

    // MARK: - Auth

    func signIn(email: String, password: String) async {
        await authenticate { try await self.client.signIn(email: email, password: password) }
    }

    func signUp(email: String, password: String) async {
        await authenticate { try await self.client.signUp(email: email, password: password) }
    }

    func sendPasswordReset(email: String) async {
        guard !email.isEmpty else {
            authError = "Vul eerst je e-mailadres in."
            return
        }
        do {
            try await client.sendPasswordReset(email: email)
            authError = "We stuurden een herstelmail naar \(email)."
        } catch {
            authError = error.localizedDescription
        }
    }

    private func authenticate(_ work: @escaping () async throws -> SupabaseClient.Session) async {
        isWorking = true
        authError = nil
        defer { isWorking = false }
        do {
            let result = try await work()
            session = result
            if let encoded = try? JSONEncoder().encode(result),
               let text = String(data: encoded, encoding: .utf8) {
                Keychain.set(text, for: Self.sessionKey)
            }
            await loadState()
        } catch {
            authError = error.localizedDescription
        }
    }

    func signOut() {
        Keychain.remove(Self.sessionKey)
        session = nil
        state = nil
        sessions = []
        sync = .idle
    }

    // MARK: - State

    /// Device copy first, then the server, newest wins.
    ///
    /// A failed fetch is not "no data saved": it leaves whatever is on the
    /// device in place, which is the rule `loadCloudState` states on the web.
    func loadState() async {
        guard let session else { return }
        sync = .syncing

        var resolved = store?.load(for: session.email)

        do {
            if let remote = try await client.loadState(session: session) {
                let remoteStamp = remote["updatedAt"]?.stringValue
                let localStamp = resolved?["updatedAt"]?.stringValue
                if resolved == nil || (remoteStamp ?? "") >= (localStamp ?? "") {
                    resolved = remote
                    store?.save(remote, for: session.email, pending: false)
                }
            }
            sync = .synced(Date())
        } catch {
            sync = .offline
        }

        if resolved == nil {
            // A brand-new account starts on the catalogue plan rather than an
            // empty screen.
            resolved = LegacyState(raw: [:])
        }
        apply(resolved)
    }

    private func apply(_ next: LegacyState?) {
        state = next
        guard let next else { return }
        plan = LegacyAdapter.plan(from: next)
        sessions = LegacyAdapter.sessions(from: next).sorted { $0.date > $1.date }
        scheduleOverrides = LegacyAdapter.scheduleOverrides(from: next)
        activeSession = LegacyAdapter.activeSession(from: next)
        hiddenWarmups = LegacyAdapter.hiddenWarmups(from: next)
    }

    /// Saves a paused workout, locally first.
    ///
    /// This is the whole of "leave and come back": the snapshot lands on the
    /// device immediately, and reaches the account when there is a network.
    /// Nothing about it is marked complete.
    func pauseSession(_ snapshot: ActiveSessionSnapshot) async {
        guard var current = state, let session else { return }
        LegacyAdapter.apply(activeSession: snapshot, to: &current)
        apply(current)
        store?.save(current, for: session.email, pending: true)
        await push(current, for: session)
    }

    /// "Altijd verbergen" on the ramp. The only warm-up state that persists.
    func hideWarmup(exerciseID: String) async {
        guard var current = state, let session, !hiddenWarmups.contains(exerciseID) else { return }
        LegacyAdapter.apply(hiddenWarmups: hiddenWarmups.union([exerciseID]), to: &current)
        apply(current)
        store?.save(current, for: session.email, pending: true)
        await push(current, for: session)
    }

    func clearActiveSession() async {
        guard var current = state, let session, activeSession != nil else { return }
        LegacyAdapter.apply(activeSession: nil, to: &current)
        apply(current)
        store?.save(current, for: session.email, pending: true)
        await push(current, for: session)
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
        plan.first { $0.id == snapshot.dayID } ?? todayDay
    }

    /// Ends a paused session from the home screen, keeping what was logged.
    func endActiveSession() async {
        guard let snapshot = activeSession else { return }
        guard snapshot.hasProgress else {
            await clearActiveSession()
            return
        }
        var all = sessions
        let finished = snapshot.finishedSession(
            id: sessions.first {
                $0.dayID == snapshot.dayID
                    && Calendar.current.isDate($0.date, inSameDayAs: snapshot.startedAt)
                    && $0.kind == .workout
            }?.id
        )
        if let index = all.firstIndex(where: { $0.id == finished.id }) {
            all[index] = finished
        } else {
            all.insert(finished, at: 0)
        }
        await persist(sessions: all)
    }

    /// "vandaag" / "van gisteren" / "van vrijdag" / "van 3 sep".
    func pausedWhenLabel(for snapshot: ActiveSessionSnapshot) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(snapshot.startedAt) { return "vandaag" }
        if calendar.isDateInYesterday(snapshot.startedAt) { return "van gisteren" }
        let days = calendar.dateComponents([.day], from: snapshot.startedAt, to: Date()).day ?? 0
        if days < 7 {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "nl_BE")
            formatter.dateFormat = "EEEE"
            return "van \(formatter.string(from: snapshot.startedAt))"
        }
        return "van \(display.shortDate(snapshot.startedAt))"
    }

    /// Writes a finished session into the blob, locally first.
    ///
    /// Finishing also clears the paused snapshot — the workout is history now,
    /// and leaving it behind would offer to resume something already saved.
    func persist(sessions updated: [TrainingSession]) async {
        guard var current = state, let session else { return }
        LegacyAdapter.apply(sessions: updated, to: &current)
        LegacyAdapter.apply(activeSession: nil, to: &current)
        apply(current)
        store?.save(current, for: session.email, pending: true)
        await push(current, for: session)
    }

    private func push(_ state: LegacyState, for session: SupabaseClient.Session) async {
        #if DEBUG
        if DemoData.isEnabled {
            sync = .synced(Date())
            return
        }
        #endif

        sync = .syncing
        do {
            try await client.saveState(state, session: session)
            store?.markSynced(for: session.email)
            sync = .synced(Date())
        } catch {
            sync = .offline
        }
    }

    // MARK: - Today

    var todayCanonicalDay: String {
        Schedule.canonicalDay(for: Date(), overrides: scheduleOverrides)
    }

    var todayDay: WorkoutDay? {
        Schedule.day(for: todayCanonicalDay, in: plan)
    }

    var isRestDay: Bool { todayDay == nil }

    func history(for planned: PlannedExercise, before date: Date = Date()) -> ExerciseHistory {
        ExerciseHistory.build(
            exerciseID: planned.exerciseID,
            modifiers: planned.modifiers,
            from: sessions,
            before: date
        )
    }

    func exercise(_ id: String) -> Exercise {
        ExerciseCatalog.exercise(id)
            ?? Exercise(id: id, name: id, equipment: .machineSelectorised, isCompound: false)
    }

    /// "18 sets · doel 6.240 kg · laatst 3 sep"
    func todayMetaLine() -> String? {
        guard let day = todayDay else { return nil }
        let setCount = day.exercises.reduce(0) { $0 + $1.targetSets }
        var parts = ["\(setCount) sets"]

        let target = day.exercises.reduce(Decimal(0)) { total, planned in
            let history = self.history(for: planned)
            guard let last = history.mostRecent else { return total }
            return total + RecordsEngine.volumeLoad(last.sets)
        }
        if target > 0 { parts.append("doel \(display.volumeKg(target))") }

        if let last = sessions.first(where: { $0.dayID == day.id && $0.kind == .workout }) {
            parts.append("laatst \(display.shortDate(last.date))")
        }
        return parts.joined(separator: " · ")
    }
}
