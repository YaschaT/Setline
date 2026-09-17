import Foundation

/// "Exporteer alles" — the account's own data, in both formats the design
/// promises, built on the device so it works offline.
///
/// What never leaves with it: access tokens, refresh tokens and anything else
/// in the Keychain (they are not part of the state to begin with), and the
/// sync journal — deletion records and the reset marker describe how syncing
/// works, not what was trained.
public enum StateExport {

    /// Sync bookkeeping, excluded from the export.
    static let syncInternals: Set<String> = [StateMerge.tombstonesKey, StateMerge.resetKey]

    /// The whole stored state, minus sync bookkeeping, as pretty JSON.
    public static func json(from state: LegacyState) throws -> Data {
        var raw = state.raw
        for key in syncInternals { raw.removeValue(forKey: key) }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(JSONValue.object(raw))
    }

    /// One row per logged working set, with the context needed to read it back:
    /// which session, which exercise, and how the set was performed.
    ///
    /// Machine-readable on purpose: `,` separates fields and decimals use a
    /// point, so any spreadsheet or script can open it. Warm-ups are left out —
    /// they are never stored as training data.
    public static func csv(from sessions: [TrainingSession]) -> String {
        var rows = [
            "datum,dag,sessie_id,oefening,oefening_id,set,gewicht_kg,reps,rir,pauzereps,partiele_reps,type,vervangt,sessieduur_min,sets_gepland,sets_gelogd,voltooid_pct",
        ]
        for session in sessions.sorted(by: { $0.date < $1.date }) {
            let date = LegacyAdapter.isoString(session.date)
            let duration = session.durationSeconds.map { "\($0 / 60)" } ?? ""
            let planned = session.plannedSetCount.map(String.init) ?? ""
            let completed = session.completedSetCount.map(String.init) ?? ""
            for result in session.results {
                for set in result.sets where set.isLogged && !set.isWarmup {
                    let weight: String = set.weightKg.map { "\($0)" } ?? ""
                    let rir: String = set.rirReported.map(String.init) ?? ""
                    let paused: String = set.pausedReps.map(String.init) ?? ""
                    let partial: String = set.partialReps.map(String.init) ?? ""
                    let kind: String = set.origin == .sessionAdded ? "extra" : "voorgeschreven"
                    let substituted: String = set.substitutedFrom ?? ""

                    var fields: [String] = [date, session.dayLabel, session.id, result.name, result.exerciseID]
                    fields.append("\(set.index + 1)")
                    fields.append(contentsOf: [weight, "\(set.reps)", rir, paused, partial, kind, substituted])
                    fields.append(contentsOf: [duration, planned, completed, "\(session.completion)"])
                    rows.append(fields.map(escaped).joined(separator: ","))
                }
            }
        }
        return rows.joined(separator: "\n") + "\n"
    }

    /// Dated names, so two exports never overwrite each other in Files.
    public static func fileNames(now: Date = Date(), calendar: Calendar = .current) -> (json: String, csv: String) {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        let stamp = formatter.string(from: now)
        return ("setline-export-\(stamp).json", "setline-sets-\(stamp).csv")
    }

    private static func escaped(_ field: String) -> String {
        guard field.contains(",") || field.contains("\"") || field.contains("\n") else { return field }
        return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
}
