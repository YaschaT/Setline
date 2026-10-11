import Foundation

// MARK: - Barcode

/// A product read from its barcode in Open Food Facts: the values per 100 g,
/// and the serving the packaging gives, when it gives one.
public struct BarcodeProduct: Equatable, Sendable {
    public let barcode: String
    public let product: FoodProduct
    /// "30 g" on a box of cereal: the amount a portion starts at.
    public let servingGrams: Double?

    /// Reads Open Food Facts' v2 product answer. Nil when the product is not
    /// there, or has no energy value to log — a name alone is not a portion.
    public static func parse(_ data: Data, barcode: String) -> BarcodeProduct? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (root["status"] as? Int) == 1 || (root["status"] as? String) == "success",
              let product = root["product"] as? [String: Any],
              let nutriments = product["nutriments"] as? [String: Any]
        else { return nil }

        func number(_ key: String) -> Double? {
            if let value = nutriments[key] as? Double { return value }
            if let value = nutriments[key] as? Int { return Double(value) }
            if let value = nutriments[key] as? String { return Double(value.replacingOccurrences(of: ",", with: ".")) }
            return nil
        }
        let kcal = number("energy-kcal_100g") ?? number("energy_100g").map { $0 / 4.184 }
        guard let kcal else { return nil }

        let name = [product["product_name_en"], product["product_name"], product["generic_name"]]
            .compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? "Product \(barcode)"
        let brand = ((product["brands"] as? String) ?? "")
            .split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
        let image = (product["image_front_small_url"] as? String) ?? (product["image_url"] as? String)
        let serving: Double? = {
            if let value = product["serving_quantity"] as? Double, value > 0 { return value }
            if let text = product["serving_quantity"] as? String, let value = Double(text), value > 0 { return value }
            return nil
        }()

        return BarcodeProduct(
            barcode: barcode,
            product: FoodProduct(
                id: "off-\(barcode)", name: name, brand: brand,
                calories: kcal.rounded(),
                protein: number("proteins_100g") ?? 0,
                carbs: number("carbohydrates_100g") ?? 0,
                fat: number("fat_100g") ?? 0,
                note: "Open Food Facts · barcode \(barcode)",
                imageURL: image.flatMap(URL.init(string:))
            ),
            servingGrams: serving
        )
    }

    public static func lookupURL(_ barcode: String) -> URL? {
        let digits = barcode.filter(\.isNumber)
        guard !digits.isEmpty else { return nil }
        return URL(string: "https://world.openfoodfacts.org/api/v2/product/\(digits).json?fields=product_name,product_name_en,generic_name,brands,nutriments,image_front_small_url,image_url,serving_quantity")
    }
}

// MARK: - Photo scan

/// One food the photo scan sees on the plate, with its estimated amount and
/// what that amount holds. The person checks the grams before it is logged.
public struct ScannedFood: Identifiable, Equatable, Sendable, Decodable {
    public enum Confidence: String, Decodable, Sendable { case high, medium, low }

    public let id: UUID
    public let name: String
    public let grams: Double
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let confidence: Confidence

    private enum CodingKeys: String, CodingKey { case name, grams, calories, protein, carbs, fat, confidence }

    public init(name: String, grams: Double, calories: Double, protein: Double, carbs: Double, fat: Double, confidence: Confidence = .medium) {
        id = UUID()
        self.name = name
        self.grams = grams
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.confidence = confidence
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            name: try container.decode(String.self, forKey: .name),
            grams: max(1, try container.decode(Double.self, forKey: .grams)),
            calories: max(0, try container.decode(Double.self, forKey: .calories)),
            protein: max(0, try container.decodeIfPresent(Double.self, forKey: .protein) ?? 0),
            carbs: max(0, try container.decodeIfPresent(Double.self, forKey: .carbs) ?? 0),
            fat: max(0, try container.decodeIfPresent(Double.self, forKey: .fat) ?? 0),
            confidence: (try? container.decode(Confidence.self, forKey: .confidence)) ?? .medium
        )
    }

    /// The same food at another amount; the values follow the grams.
    public func scaled(to newGrams: Double) -> ScannedFood {
        let factor = grams > 0 ? newGrams / grams : 1
        return ScannedFood(
            name: name, grams: newGrams,
            calories: (calories * factor).rounded(),
            protein: (protein * factor * 10).rounded() / 10,
            carbs: (carbs * factor * 10).rounded() / 10,
            fat: (fat * factor * 10).rounded() / 10,
            confidence: confidence
        )
    }

    public func entry(id: String, on date: Date, meal: Meal, calendar: Calendar = .current) -> NutritionEntry {
        NutritionEntry(
            id: id, date: Schedule.dateKey(date, calendar: calendar), meal: meal.rawValue, name: name,
            calories: calories, protein: protein, carbs: carbs, fat: fat,
            amount: grams.rounded(), unit: "g", loggedAt: Date()
        )
    }
}

/// The scan's answer: what it saw, or why it could not.
public struct FoodScanAnswer: Decodable, Sendable {
    public let items: [ScannedFood]
}

// MARK: - Favorites

/// A food kept to log again in one tap, exactly as it was written.
public struct FavoriteFood: Codable, Equatable, Identifiable, Sendable {
    public let name: String
    public let amount: Double?
    public let unit: String?
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double

    public var id: String { "\(name.lowercased())|\(amount ?? 0)|\(unit ?? "")" }

    public init(_ entry: NutritionEntry) {
        name = entry.name
        amount = entry.amount
        unit = entry.unit
        calories = entry.calories
        protein = entry.protein
        carbs = entry.carbs
        fat = entry.fat
    }

    public func matches(_ entry: NutritionEntry) -> Bool { id == FavoriteFood(entry).id }

    public func entry(id: String, on date: Date, meal: Meal, calendar: Calendar = .current) -> NutritionEntry {
        NutritionEntry(
            id: id, date: Schedule.dateKey(date, calendar: calendar), meal: meal.rawValue, name: name,
            calories: calories, protein: protein, carbs: carbs, fat: fat,
            amount: amount, unit: unit, loggedAt: Date()
        )
    }

    /// "150 g" — or nothing, for an entry the web wrote without an amount.
    public var portion: String? {
        guard let amount, amount > 0 else { return nil }
        let number = amount == amount.rounded() ? String(Int(amount)) : String(amount)
        return "\(number) \(unit ?? "g")"
    }
}
