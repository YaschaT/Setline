import Foundation

/// One logged item of food, in the shape the web app stores it.
///
/// The fields are its fields: both apps write this list, so an entry written
/// here has to read back there without translation.
public struct NutritionEntry: Identifiable, Equatable, Sendable {
    public let id: String
    public let date: String
    public let meal: String
    public let name: String
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    /// How much of it, in `unit`. Written by this app so the amount can be
    /// changed afterwards and the macros follow it (42d); absent on entries
    /// the web app wrote, where the amount was never kept.
    public let amount: Double?
    public let unit: String?
    /// When it was logged, as it happened. Never derived from the meal it sits
    /// under: a late lunch is still a lunch, and the clock says what it says.
    public let loggedAt: Date?

    public init(
        id: String,
        date: String,
        meal: String,
        name: String,
        calories: Double,
        protein: Double,
        carbs: Double,
        fat: Double,
        amount: Double? = nil,
        unit: String? = nil,
        loggedAt: Date? = nil
    ) {
        self.id = id
        self.date = date
        self.meal = meal
        self.name = name
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.amount = amount
        self.unit = unit
        self.loggedAt = loggedAt
    }

    /// The same item at another amount: the macros scale with it, because
    /// they were what that amount weighed.
    public func scaled(to newAmount: Double) -> NutritionEntry {
        guard let amount, amount > 0, newAmount > 0 else { return self }
        let factor = newAmount / amount
        return NutritionEntry(
            id: id, date: date, meal: meal, name: name,
            calories: (calories * factor).rounded(),
            protein: (protein * factor * 10).rounded() / 10,
            carbs: (carbs * factor * 10).rounded() / 10,
            fat: (fat * factor * 10).rounded() / 10,
            amount: newAmount, unit: unit, loggedAt: loggedAt
        )
    }

    /// "100 g", "2 sneden" — what the row says beside the name.
    public var portion: String? {
        guard let amount, amount > 0, let unit, !unit.isEmpty else { return nil }
        let whole = amount.rounded() == amount
        let number = whole ? String(Int(amount)) : String(format: "%.1f", amount).replacingOccurrences(of: ".", with: ",")
        return "\(number) \(unit)"
    }

    /// Whether the amount is weighed or counted. Grams and millilitres take a
    /// useful step; slices and pieces come one at a time, because half a slice
    /// is not something this form can weigh.
    public var isWeighed: Bool {
        guard let unit = unit?.lowercased() else { return false }
        return unit == "g" || unit == "ml"
    }

    /// What one tap of the stepper changes — 42d names it in the label above
    /// the control ("HOEVEELHEID · PER 25 G"), so it is never a surprise.
    public var step: Double {
        guard let amount, amount > 0, isWeighed else { return 1 }
        switch amount {
        case 200...: return 25
        case 50...: return 10
        case 20...: return 5
        default: return 1
        }
    }

    /// The same entry under another heading (42d's meal segment).
    ///
    /// Its own time is kept. A lunch eaten at 15:30 and filed under Lunch was
    /// still eaten at 15:30; the heading says which meal it was, and the clock
    /// is not rewritten to agree with it.
    public func filed(under meal: Meal) -> NutritionEntry {
        NutritionEntry(
            id: id, date: date, meal: meal.rawValue, name: name,
            calories: calories, protein: protein, carbs: carbs, fat: fat,
            amount: amount, unit: unit, loggedAt: loggedAt
        )
    }

    public var json: JSONValue {
        var object: [String: JSONValue] = [
            "id": .string(id),
            "date": .string(date),
            "meal": .string(meal),
            "name": .string(name),
            "calories": .number(Decimal(calories)),
            "protein": .number(Decimal(protein)),
            "carbs": .number(Decimal(carbs)),
            "fat": .number(Decimal(fat)),
        ]
        // Three keys the web app does not model. It carries unknown keys on an
        // entry through untouched, so an amount written here survives its
        // edits, and an entry without them still reads everywhere.
        if let amount, amount > 0 { object["amount"] = .number(Decimal(amount)) }
        if let unit, !unit.isEmpty { object["unit"] = .string(unit) }
        if let loggedAt { object["loggedAt"] = .string(LegacyAdapter.isoString(loggedAt)) }
        return .object(object)
    }

    /// What the food is worth when the label only gives macros. The web app
    /// falls back to the same 4 · 4 · 9, so an item logged on either side of
    /// the account counts the same.
    public static func calories(protein: Double, carbs: Double, fat: Double) -> Double {
        ((protein * 4) + (carbs * 4) + (fat * 9)).rounded()
    }
}

public enum Meal: String, CaseIterable, Identifiable, Sendable {
    case ontbijt = "Ontbijt"
    case lunch = "Lunch"
    case preWorkout = "Pre-workout"
    case avondeten = "Avondeten"
    case snack = "Snack"

    public var id: String { rawValue }

    /// How a sentence names it: "Toevoegen aan avondeten".
    public var spoken: String { rawValue.lowercased() }

    /// What is most likely being logged at this hour — the meal picker opens
    /// there, and is one tap from anything else. The hours are the web app's
    /// own, so the same clock gives the same answer in both.
    public static func likely(at date: Date, calendar: Calendar = .current) -> Meal {
        switch calendar.component(.hour, from: date) {
        case ..<11: return .ontbijt
        case ..<16: return .lunch
        default: return .avondeten
        }
    }
}

/// One of the four headings a day is read in (42a), with what sits under it.
///
/// The headings are fixed and stay even when empty, so a day has a shape
/// before anything is logged. `Snacks` also carries what the web app files as
/// pre-workout, and anything it files under a name this app does not know:
/// a heading that hid an entry would be worse than one that gathers a few.
public struct MealSection: Identifiable, Equatable, Sendable {
    public let meal: Meal
    public let title: String
    public let entries: [NutritionEntry]
    public let calories: Double

    public var id: String { title }
    public var isEmpty: Bool { entries.isEmpty }

    /// Ontbijt, lunch, avondeten, snacks — four, always, in this order.
    public static let headings: [(Meal, String)] = [
        (.ontbijt, "Ontbijt"), (.lunch, "Lunch"), (.avondeten, "Avondeten"), (.snack, "Snacks"),
    ]

    /// What a heading is called: "Snacks" gathers more than one meal, so it is
    /// named in the plural everywhere it appears.
    public static func title(of meal: Meal) -> String {
        headings.first { $0.0 == meal }?.1 ?? meal.rawValue
    }

    public init(meal: Meal, title: String, entries: [NutritionEntry]) {
        self.meal = meal
        self.title = title
        self.entries = entries
        self.calories = entries.reduce(0) { $0 + $1.calories }
    }
}

/// A day's eating, against the day's targets.
public struct NutritionDay: Equatable, Sendable {
    public let dateKey: String
    public let entries: [NutritionEntry]
    public let targets: NutritionTargets?

    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double

    public init(dateKey: String, entries: [NutritionEntry], targets: NutritionTargets?) {
        self.dateKey = dateKey
        self.entries = entries
        self.targets = targets
        self.calories = entries.reduce(0) { $0 + $1.calories }
        self.protein = entries.reduce(0) { $0 + $1.protein }
        self.carbs = entries.reduce(0) { $0 + $1.carbs }
        self.fat = entries.reduce(0) { $0 + $1.fat }
    }

    public static func make(
        entries: [NutritionEntry],
        on date: Date,
        targets: NutritionTargets?,
        calendar: Calendar = .current
    ) -> NutritionDay {
        let key = Schedule.dateKey(date, calendar: calendar)
        return NutritionDay(dateKey: key, entries: entries.filter { $0.date == key }, targets: targets)
    }

    /// The day under its four headings, in the order they are eaten. Entries
    /// keep the order they were logged in; nothing is re-sorted by hour.
    public var sections: [MealSection] {
        MealSection.headings.map { meal, title in
            MealSection(meal: meal, title: title, entries: entries.filter { belongs($0, to: meal) })
        }
    }

    private func belongs(_ entry: NutritionEntry, to meal: Meal) -> Bool {
        let stored = Meal(rawValue: entry.meal)
        switch meal {
        case .snack: return stored == nil || stored == .snack || stored == .preWorkout
        default: return stored == meal
        }
    }

    /// A target of zero is not a target — the web app writes zeroes where the
    /// account has never set one.
    public var hasTarget: Bool { (targets?.calories ?? 0) > 0 }

    /// Never below zero: past the target there is nothing left to eat, and
    /// the line underneath already says by how much it was passed.
    public var remaining: Double {
        max(0, Double(targets?.calories ?? 0) - calories)
    }

    /// How full the ring is drawn, and it stops at full.
    public var consumed: Double {
        guard hasTarget, let target = targets?.calories, target > 0 else { return 0 }
        return min(1, max(0, calories / Double(target)))
    }

    public func fraction(of macro: Macro) -> Double {
        let target = target(for: macro)
        guard target > 0 else { return 0 }
        return min(1, max(0, total(of: macro) / target))
    }

    public func total(of macro: Macro) -> Double {
        switch macro {
        case .protein: return protein
        case .carbs: return carbs
        case .fat: return fat
        }
    }

    public func target(for macro: Macro) -> Double {
        guard let targets else { return 0 }
        switch macro {
        case .protein: return Double(targets.protein)
        case .carbs: return Double(targets.carbs)
        case .fat: return Double(targets.fat)
        }
    }

    public var macros: [Macro] { Macro.allCases }
}

public enum Macro: String, CaseIterable, Sendable {
    case protein
    case carbs
    case fat

    public var label: String {
        switch self {
        case .protein: return "Proteïne"
        case .carbs: return "Koolhydraten"
        case .fat: return "Vet"
        }
    }

    /// Protein is the one macro this design colours: it is the one the reader
    /// is steering. The other two are reported, not urged.
    public var isLed: Bool { self == .protein }
}

/// Days in a row on which protein stayed under its target — the one thing the
/// nutrition screen raises by itself (redesign 1c, "Aandacht").
///
/// It is read from what was logged and nothing else. Only whole days count:
/// today joins once it is over, because a day half eaten is always short. A
/// day with nothing logged ends the run rather than extending it — not logging
/// is not the same as not eating. And a single short day is not a pattern, so
/// nothing is said until there are two.
public struct ProteinShortfall: Equatable, Sendable {
    public let days: Int
    /// The mean number of grams those days fell short by, to the gram.
    public let averageGrams: Int

    public init(days: Int, averageGrams: Int) {
        self.days = days
        self.averageGrams = averageGrams
    }

    /// The longest run this looks back over.
    public static let window = 60

    public static func make(
        entries: [NutritionEntry],
        targets: NutritionTargets?,
        today: Date = Date(),
        calendar: Calendar = .current
    ) -> ProteinShortfall? {
        guard let target = targets.map({ Double($0.protein) }), target > 0 else { return nil }
        var byDate: [String: Double] = [:]
        for entry in entries { byDate[entry.date, default: 0] += entry.protein }

        var days = 0
        var shortfall = 0.0
        var cursor = calendar.date(byAdding: .day, value: -1, to: today)
        while let day = cursor, days < window {
            guard let eaten = byDate[Schedule.dateKey(day, calendar: calendar)], eaten < target else { break }
            shortfall += target - eaten
            days += 1
            cursor = calendar.date(byAdding: .day, value: -1, to: day)
        }
        guard days >= 2 else { return nil }
        return ProteinShortfall(days: days, averageGrams: Int((shortfall / Double(days)).rounded()))
    }
}
