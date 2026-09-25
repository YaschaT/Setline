import Foundation

/// What this account has eaten before — the two lists the add sheet offers
/// (42c: "VAAK BIJ AVONDETEN", "RECENT").
///
/// Both are read from the account's own entries. Nothing is suggested that was
/// never logged here, no food is invented, and no portion is guessed: a row is
/// a previous entry, offered again exactly as it was written.
public enum FoodMemory {

    /// What is logged at this meal most often, the most recent version of each
    /// winning ties. Entries from `excluding` — usually today — are left out,
    /// so the sheet does not offer what is already on the plate.
    public static func often(
        at meal: Meal,
        in entries: [NutritionEntry],
        excluding dateKey: String? = nil,
        limit: Int = 3
    ) -> [NutritionEntry] {
        let candidates = entries.enumerated().filter { _, entry in
            entry.meal == meal.rawValue && entry.date != dateKey && !entry.name.isEmpty
        }
        var counts: [String: Int] = [:]
        var latest: [String: (offset: Int, entry: NutritionEntry)] = [:]
        for (offset, entry) in candidates {
            let key = entry.name.lowercased()
            counts[key, default: 0] += 1
            if let held = latest[key], held.offset > offset { continue }
            latest[key] = (offset, entry)
        }
        return latest.values
            .sorted { left, right in
                let leftCount = counts[left.entry.name.lowercased()] ?? 0
                let rightCount = counts[right.entry.name.lowercased()] ?? 0
                if leftCount != rightCount { return leftCount > rightCount }
                return left.offset > right.offset
            }
            .prefix(limit)
            .map(\.entry)
    }

    /// The last things logged, newest first and one row per food, whatever
    /// meal they were logged at.
    public static func recent(
        in entries: [NutritionEntry],
        excluding dateKey: String? = nil,
        limit: Int = 5
    ) -> [NutritionEntry] {
        var seen: Set<String> = []
        var rows: [NutritionEntry] = []
        for entry in entries.reversed() where entry.date != dateKey && !entry.name.isEmpty {
            let key = entry.name.lowercased()
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            rows.append(entry)
            if rows.count == limit { break }
        }
        return rows
    }

    /// The same food, logged again: a new entry on this date and meal, at the
    /// amount it was eaten at before. Its own time is now.
    public static func repeated(
        _ entry: NutritionEntry,
        on date: Date,
        meal: Meal,
        id: @autoclosure () -> String = "food-\(Int(Date().timeIntervalSince1970 * 1000))",
        calendar: Calendar = .current
    ) -> NutritionEntry {
        NutritionEntry(
            id: id(),
            date: Schedule.dateKey(date, calendar: calendar),
            meal: meal.rawValue,
            name: entry.name,
            calories: entry.calories,
            protein: entry.protein,
            carbs: entry.carbs,
            fat: entry.fat,
            amount: entry.amount,
            unit: entry.unit,
            loggedAt: date
        )
    }
}
