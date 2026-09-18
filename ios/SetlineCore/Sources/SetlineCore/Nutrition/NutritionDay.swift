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

    public init(
        id: String,
        date: String,
        meal: String,
        name: String,
        calories: Double,
        protein: Double,
        carbs: Double,
        fat: Double
    ) {
        self.id = id
        self.date = date
        self.meal = meal
        self.name = name
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
    }

    public var json: JSONValue {
        .object([
            "id": .string(id),
            "date": .string(date),
            "meal": .string(meal),
            "name": .string(name),
            "calories": .number(Decimal(calories)),
            "protein": .number(Decimal(protein)),
            "carbs": .number(Decimal(carbs)),
            "fat": .number(Decimal(fat)),
        ])
    }

    /// What the food is worth when the label only gives macros. The web app
    /// falls back to the same 4 · 4 · 9, so an item logged on either side of
    /// the account counts the same.
    public static func calories(protein: Double, carbs: Double, fat: Double) -> Double {
        ((protein * 4) + (carbs * 4) + (fat * 9)).rounded()
    }
}

public enum Meal: String, CaseIterable, Sendable {
    case ontbijt = "Ontbijt"
    case lunch = "Lunch"
    case preWorkout = "Pre-workout"
    case avondeten = "Avondeten"
    case snack = "Snack"

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
