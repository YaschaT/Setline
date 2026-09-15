import Foundation

/// Where the shared state is stored, as the sync loop sees it.
public protocol StateStore: Sendable {
    /// The stored state and its version, or `nil` when the account has none yet.
    func fetch() async throws -> RemoteState?
    /// Writes only if the stored version is still `expectedVersion`.
    func update(_ state: LegacyState, expectedVersion: String, nextVersion: String) async throws -> WriteOutcome
    /// Creates the stored state. One that appeared in the meantime is a conflict.
    func insert(_ state: LegacyState, nextVersion: String) async throws -> WriteOutcome
}

public struct RemoteState: Sendable {
    public let state: LegacyState
    /// The row's `updated_at`, exactly as the server returned it.
    public let version: String

    public init(state: LegacyState, version: String) {
        self.state = state
        self.version = version
    }
}

public enum WriteOutcome: Sendable, Equatable {
    case written(version: String)
    case conflict
}

/// The sync loop both clients share: fetch the latest stored state, apply
/// only this client's changes to it, write it back only if nobody wrote in
/// between, and otherwise fetch again and apply the same changes to that.
public enum StateSync {

    public struct Outcome: Sendable {
        /// The state as stored once the changes are in.
        public let state: LegacyState
        public let version: String?
        /// Changes the stored state now reflects: written, or settled because
        /// a later deletion or reset outranked them.
        public let settled: Set<UUID>
    }

    public static let maxAttempts = 3

    /// Returns `nil` when every attempt lost a race to another writer; the
    /// changes then stay pending for the next sync. Network and authorisation
    /// failures are thrown, and also leave the changes pending.
    ///
    /// - Parameter local: a device copy saved before changes were recorded one
    ///   by one, whose offline work has to be recovered. See `recoveryChanges`.
    public static func run(
        changes: [StateChange],
        recovering local: (state: LegacyState, savedAt: Date)? = nil,
        store: StateStore,
        now: @Sendable () -> Date = { Date() }
    ) async throws -> Outcome? {
        let settled = Set(changes.map(\.id))
        for _ in 0..<maxAttempts {
            let remote = try await store.fetch()
            let stored = remote?.state ?? LegacyState(raw: [:])
            let recovered = local.map { recoveryChanges(from: $0.state, against: stored, savedAt: $0.savedAt) } ?? []
            let pending = recovered + changes
            let merged = StateMerge.apply(pending, to: stored, now: now())

            if merged.raw == stored.raw {
                // Nothing to write: already stored, or outranked by a deletion.
                return Outcome(state: stored, version: remote?.version, settled: settled)
            }

            let version = nextVersion(after: remote?.version, now: now())
            let outcome: WriteOutcome
            if let remote {
                outcome = try await store.update(merged, expectedVersion: remote.version, nextVersion: version)
            } else {
                outcome = try await store.insert(merged, nextVersion: version)
            }
            if case .written(let written) = outcome {
                return Outcome(state: merged, version: written, settled: settled)
            }
        }
        return nil
    }

    /// Strictly after the version being replaced, whatever this device's clock
    /// says, so versions only ever move forward.
    public static func nextVersion(after version: String?, now: Date) -> String {
        let floor = version.flatMap(LegacyAdapter.isoDate).map { $0.addingTimeInterval(0.001) } ?? .distantPast
        return LegacyAdapter.isoString(max(now, floor))
    }

    /// Offline work in a device copy saved before changes were recorded.
    ///
    /// Such a copy only says "something here was not synced", not what. So it
    /// may add what the stored state lacks, and nothing else: it never deletes,
    /// never overwrites, never brings back a session whose deletion left a
    /// tombstone, and — by dating every recovered change to when the copy was
    /// saved — never undoes a reset made after it.
    ///
    /// A session deleted before tombstones existed left no trace. It cannot be
    /// told apart from one that was never synced, and this would add it back.
    public static func recoveryChanges(from local: LegacyState, against stored: LegacyState, savedAt: Date) -> [StateChange] {
        var changes: [StateChange] = []

        let storedSessions = Set((stored["sessions"]?.arrayValue ?? []).compactMap { $0["id"]?.stringValue })
        let deletedSessions = Set((stored[StateMerge.tombstonesKey]?["sessions"]?.objectValue ?? [:]).keys)
        // Reversed, because each recovered session is inserted first.
        for session in (local["sessions"]?.arrayValue ?? []).reversed() {
            guard let id = session["id"]?.stringValue,
                  !storedSessions.contains(id),
                  !deletedSessions.contains(id)
            else { continue }
            changes.append(StateChange(.upsertSession(session), createdAt: savedAt))
        }

        // Absent means "never stored here"; an explicit null means someone
        // cleared it, which an old copy must not undo.
        if let snapshot = local[LegacyAdapter.activeSessionKey], snapshot != .null,
           stored[LegacyAdapter.activeSessionKey] == nil {
            changes.append(StateChange(.setActiveSession(snapshot), createdAt: savedAt))
        }

        let storedFlags = Set(LegacyAdapter.painFlags(from: stored).map(\.id))
        for flag in LegacyAdapter.painFlags(from: local) where !storedFlags.contains(flag.id) {
            changes.append(StateChange(.addPainFlag(flag), createdAt: savedAt))
        }

        let storedReplacements = Set(LegacyAdapter.programReplacements(from: stored).map(\.id))
        for replacement in LegacyAdapter.programReplacements(from: local) where !storedReplacements.contains(replacement.id) {
            changes.append(StateChange(.addProgramReplacement(replacement), createdAt: savedAt))
        }

        let storedExercises = Set(LegacyAdapter.customExercises(from: stored).map(\.id))
        for exercise in LegacyAdapter.customExercises(from: local) where !storedExercises.contains(exercise.id) {
            changes.append(StateChange(.addCustomExercise(exercise), createdAt: savedAt))
        }

        let storedHidden = LegacyAdapter.hiddenWarmups(from: stored)
        for exerciseID in LegacyAdapter.hiddenWarmups(from: local).subtracting(storedHidden).sorted() {
            changes.append(StateChange(.hideWarmup(exerciseID: exerciseID), createdAt: savedAt))
        }

        return changes
    }
}
