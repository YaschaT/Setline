import Foundation

/// A product as a food database describes it: values per 100 g.
public struct FoodProduct: Identifiable, Equatable, Decodable, Sendable {
    public let id: String
    public let name: String
    public let brand: String
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    /// The line under the name: where the numbers came from, in the server's
    /// own words.
    public let note: String

    private enum CodingKeys: String, CodingKey {
        case id, name, brand, calories, protein, carbs, fat
        case note = "sourceNote"
    }

    public init(
        id: String, name: String, brand: String,
        calories: Double, protein: Double, carbs: Double, fat: Double,
        note: String
    ) {
        self.id = id
        self.name = name
        self.brand = brand
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.note = note
    }
}

/// What the app does with a search, which is deliberately almost nothing.
///
/// The table, the query to Open Food Facts, the filtering and the ordering all
/// live on the server (`lib/food-search.ts`), behind one endpoint both clients
/// call. This app sends a query and shows the answer in the order it arrives;
/// it has no opinion of its own to disagree with the web app's.
public enum FoodSearch {

    public static let shortestQuery = 2

    public static func path(for query: String) -> String {
        var components = URLComponents()
        components.path = "/api/food-search"
        components.queryItems = [URLQueryItem(name: "q", value: String(query.prefix(80)))]
        return components.string ?? "/api/food-search"
    }

    /// The products, in the order the server ranked them.
    public static func results(from data: Data) throws -> [FoodProduct] {
        try JSONDecoder().decode(Answer.self, from: data).results
    }

    /// Whether the server could only offer its generic estimates.
    public static func isPartial(_ data: Data) -> Bool {
        ((try? JSONDecoder().decode(Answer.self, from: data))?.partial) ?? false
    }

    public static func message(from data: Data) -> String? {
        (try? JSONDecoder().decode(Failure.self, from: data))?.message
    }

    private struct Answer: Decodable {
        let results: [FoodProduct]
        let partial: Bool?
    }

    private struct Failure: Decodable {
        let message: String
    }

    /// What a portion of it is worth. This is the entry form's arithmetic, the
    /// same rounding the web app's own form does, and not part of the search.
    public static func portion(of product: FoodProduct, grams: Double) -> NutritionDraft {
        let factor = max(0, grams) / 100
        func macro(_ value: Double) -> Double { (value * factor * 10).rounded() / 10 }
        return NutritionDraft(
            // The name is the food; how much of it is its own field. 42a draws
            // them apart ("Havermout · 100 g") and 42d changes the amount
            // afterwards, which needs the number kept as a number.
            name: product.name,
            calories: grams > 0 ? (product.calories * factor).rounded() : 0,
            protein: macro(product.protein),
            carbs: macro(product.carbs),
            fat: macro(product.fat),
            amount: grams > 0 ? grams : nil,
            unit: grams > 0 ? "g" : nil
        )
    }
}

/// What a chosen product puts in the form, before anyone edits it.
public struct NutritionDraft: Equatable, Sendable {
    public let name: String
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    /// How much of it these numbers are worth, kept so the amount can be
    /// changed later and the macros follow it.
    public let amount: Double?
    public let unit: String?

    public init(
        name: String,
        calories: Double,
        protein: Double,
        carbs: Double,
        fat: Double,
        amount: Double? = nil,
        unit: String? = nil
    ) {
        self.name = name
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.amount = amount
        self.unit = unit
    }
}
