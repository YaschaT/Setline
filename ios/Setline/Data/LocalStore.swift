import Foundation
import SwiftData
import SetlineCore

/// The device's copy of the training state, and the app's source of truth
/// while offline.
///
/// One row holding the blob, deliberately.
///
/// Phase 1 keeps the web app's JSON as the wire format so both clients read
/// and write the same `public.user_state` row. Shredding it into SwiftData
/// entities now would mean reconstructing it on every write, which is
/// exactly how a "lossless" adapter stops being lossless. The typed entities
/// arrive with the schema migration in a later phase; the typed *model* is
/// already what the app reasons in, derived through `LegacyAdapter`.
@Model
final class StoredState {
    /// The account this data belongs to, so one account never inherits
    /// another's sessions — the rule `claimLocalState` enforces on the web.
    var ownerEmail: String
    var blob: Data
    var updatedAt: Date
    /// Set when the device wrote changes the server has not accepted yet.
    var hasPendingChanges: Bool

    init(ownerEmail: String, blob: Data, updatedAt: Date = Date(), hasPendingChanges: Bool = false) {
        self.ownerEmail = ownerEmail
        self.blob = blob
        self.updatedAt = updatedAt
        self.hasPendingChanges = hasPendingChanges
    }
}

@MainActor
struct LocalStore {
    let context: ModelContext

    func load(for email: String) -> LegacyState? {
        let lowered = email.lowercased()
        let descriptor = FetchDescriptor<StoredState>(
            predicate: #Predicate { $0.ownerEmail == lowered }
        )
        guard let row = try? context.fetch(descriptor).first else { return nil }
        return try? LegacyState(data: row.blob)
    }

    func save(_ state: LegacyState, for email: String, pending: Bool) {
        let lowered = email.lowercased()
        guard let data = try? state.encoded() else { return }
        let descriptor = FetchDescriptor<StoredState>(
            predicate: #Predicate { $0.ownerEmail == lowered }
        )
        if let row = try? context.fetch(descriptor).first {
            row.blob = data
            row.updatedAt = Date()
            row.hasPendingChanges = pending
        } else {
            context.insert(StoredState(ownerEmail: lowered, blob: data, hasPendingChanges: pending))
        }
        try? context.save()
    }

    func markSynced(for email: String) {
        let lowered = email.lowercased()
        let descriptor = FetchDescriptor<StoredState>(
            predicate: #Predicate { $0.ownerEmail == lowered }
        )
        if let row = try? context.fetch(descriptor).first {
            row.hasPendingChanges = false
            try? context.save()
        }
    }
}
