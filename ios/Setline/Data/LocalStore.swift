import Foundation
import SwiftData
import SetlineCore

/// The device's copy of the training state, and the app's source of truth
/// while offline.
///
/// One row per account, holding what this device shows plus the changes it
/// still has to send.
///
/// The shared state stays the web app's JSON, so both clients read and write
/// the same `public.user_state` row. The device never sends that copy back:
/// a copy is stale the moment the web app writes. It sends `StateChange`s,
/// which the sync applies to whatever is stored at that moment.
@Model
final class StoredState {
    /// The account this data belongs to, so one account never inherits
    /// another's sessions — the rule `claimLocalState` enforces on the web.
    var ownerEmail: String
    /// What this device shows: the last stored state it knows, with its own
    /// pending changes applied on top.
    var blob: Data
    var updatedAt: Date
    /// Set while this device holds changes the account does not have yet.
    var hasPendingChanges: Bool
    /// Those changes, oldest first. `nil` in rows saved before changes were
    /// recorded one by one.
    var pendingChanges: Data?
    /// When a row from before recorded changes still held unsynced work. That
    /// work is recovered — additions only — on the next successful sync.
    var recoverySince: Date?
    var lastSyncedAt: Date?

    init(
        ownerEmail: String,
        blob: Data,
        updatedAt: Date = Date(),
        hasPendingChanges: Bool = false,
        pendingChanges: Data? = nil,
        recoverySince: Date? = nil,
        lastSyncedAt: Date? = nil
    ) {
        self.ownerEmail = ownerEmail
        self.blob = blob
        self.updatedAt = updatedAt
        self.hasPendingChanges = hasPendingChanges
        self.pendingChanges = pendingChanges
        self.recoverySince = recoverySince
        self.lastSyncedAt = lastSyncedAt
    }
}

@MainActor
struct LocalStore {
    let context: ModelContext

    private func row(for email: String) -> StoredState? {
        let lowered = email.lowercased()
        let descriptor = FetchDescriptor<StoredState>(
            predicate: #Predicate { $0.ownerEmail == lowered }
        )
        return try? context.fetch(descriptor).first
    }

    func load(for email: String) -> LegacyState? {
        row(for: email).flatMap { try? LegacyState(data: $0.blob) }
    }

    func pendingChanges(for email: String) -> [StateChange] {
        guard let data = row(for: email)?.pendingChanges else { return [] }
        return (try? StateChange.decoder.decode([StateChange].self, from: data)) ?? []
    }

    func lastSyncedAt(for email: String) -> Date? {
        row(for: email)?.lastSyncedAt
    }

    /// Unsynced work saved before changes were recorded, if this device has
    /// any. Marked once, so it survives further saves until a sync recovers it.
    func unrecordedWork(for email: String) -> (state: LegacyState, savedAt: Date)? {
        guard let row = row(for: email), let state = try? LegacyState(data: row.blob) else { return nil }
        if let since = row.recoverySince { return (state, since) }
        guard row.hasPendingChanges, row.pendingChanges == nil else { return nil }
        row.recoverySince = row.updatedAt
        try? context.save()
        return (state, row.updatedAt)
    }

    /// Saves what the device shows and the changes it still has to send.
    func save(_ state: LegacyState, pending: [StateChange], for email: String) {
        write(state, pending: pending, syncedAt: nil, for: email)
    }

    /// After a sync: the stored state as the account now has it, plus any
    /// changes made while the sync ran.
    func markSynced(_ state: LegacyState, pending: [StateChange], at date: Date, for email: String) {
        write(state, pending: pending, syncedAt: date, for: email)
    }

    private func write(_ state: LegacyState, pending: [StateChange], syncedAt: Date?, for email: String) {
        guard let data = try? state.encoded(), let changes = try? StateChange.encoder.encode(pending) else { return }
        if let row = row(for: email) {
            row.blob = data
            row.updatedAt = Date()
            row.hasPendingChanges = !pending.isEmpty
            row.pendingChanges = changes
            if let syncedAt {
                row.lastSyncedAt = syncedAt
                row.recoverySince = nil
            }
        } else {
            context.insert(StoredState(
                ownerEmail: email.lowercased(),
                blob: data,
                hasPendingChanges: !pending.isEmpty,
                pendingChanges: changes,
                lastSyncedAt: syncedAt
            ))
        }
        try? context.save()
    }
}
