import Foundation

/// What is still only on this device, as artboard 24's "IN DE WACHTRIJ" list
/// shows it: one row per thing a person would recognise, not one per change.
///
/// A rearranged week is one row, however many dates it touched. Internal
/// bookkeeping — the paused-session snapshot, a hidden warm-up — is not
/// something anyone is waiting on, so it is not listed.
public enum SyncQueue {

    public struct Row: Equatable, Sendable {
        public let title: String
        public let detail: String

        public init(title: String, detail: String) {
            self.title = title
            self.detail = detail
        }
    }

    public static func rows(
        from changes: [StateChange],
        display: NumberDisplay = .english,
        calendar: Calendar = .current
    ) -> [Row] {
        var rows: [Row] = []
        var weekDates = 0
        var weekRow: Int?

        for change in changes {
            switch change.kind {
            case .upsertSession(let json):
                guard let session = LegacyAdapter.session(from: json) else { continue }
                let sets = session.results.flatMap(\.sets).filter(\.isLogged)
                let volume = RecordsEngine.volumeLoad(sets)
                let row = Row(
                    title: "\(session.dayLabel) · \(display.shortDate(session.date))",
                    detail: volume > 0
                        ? "\(sets.count) sets · \(display.volumeKg(volume))"
                        : "\(sets.count) sets"
                )
                // A session saved twice is still one session waiting.
                if let index = rows.firstIndex(where: { $0.title == row.title }) {
                    rows[index] = row
                } else {
                    rows.append(row)
                }

            case .correctSessionSets(_, let corrections):
                // A correction waits as its own row: the session it belongs to
                // is already in the account, and what is queued is the change
                // to it.
                let sets = corrections.count == 1 ? "1 set" : "\(corrections.count) sets"
                rows.append(Row(title: "Correction", detail: "\(sets) in an earlier session"))

            case .removeSession:
                rows.append(Row(title: "Session deleted", detail: "Log"))

            case .removeSessionSets(_, let removals):
                let sets = removals.count == 1 ? "1 set" : "\(removals.count) sets"
                rows.append(Row(title: "Correction", detail: "\(sets) removed from an earlier session"))

            case .setScheduleDay, .removeScheduleOverride:
                weekDates += 1
                let row = Row(
                    title: "Week plan",
                    detail: weekDates == 1 ? "1 day changed" : "\(weekDates) days changed"
                )
                if let index = weekRow { rows[index] = row } else { weekRow = rows.count; rows.append(row) }

            case .upsertNutritionEntry(let json):
                let name = json["name"]?.stringValue ?? "Maaltijd"
                let kcal = json["calories"]?.decimalValue.map { display.kcal($0) } ?? ""
                rows.append(Row(title: name, detail: kcal.isEmpty ? "Nutrition" : "Nutrition · \(kcal)"))

            case .removeNutritionEntry:
                rows.append(Row(title: "Meal deleted", detail: "Nutrition"))

            case .upsertMetric(let json):
                let weight = json["weight"]?.decimalValue.map { display.kg($0) } ?? ""
                rows.append(Row(title: "Weigh-in", detail: weight.isEmpty ? "Body" : "Body · \(weight)"))

            case .setTarget:
                if !rows.contains(where: { $0.title == "Daily targets" }) {
                    rows.append(Row(title: "Daily targets", detail: "Changed"))
                }

            case .setProgram:
                rows.append(Row(title: "Program", detail: "Changed"))

            case .setExperience, .setEquipment:
                if !rows.contains(where: { $0.title == "Intake" }) {
                    rows.append(Row(title: "Intake", detail: "Your answers"))
                }

            case .setDeload:
                rows.append(Row(title: "Lighter week", detail: "Suggestion applied"))

            case .addPainFlag, .removePainFlag:
                if !rows.contains(where: { $0.title == "Something hurts" }) {
                    rows.append(Row(title: "Something hurts", detail: "What you filled in"))
                }

            case .addProgramReplacement, .removeProgramReplacement, .addCustomExercise:
                if !rows.contains(where: { $0.title == "Exercises" }) {
                    rows.append(Row(title: "Exercises", detail: "Replaced or added"))
                }

            // A paused workout, a hidden ramp and a starred exercise are
            // preferences, not work waiting to be saved: they sync like
            // everything else, but the list is about what you did.
            case .setActiveSession, .hideWarmup, .setFavoriteExercise:
                continue
            }
        }
        return rows
    }
}
