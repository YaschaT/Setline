import Foundation

/// A product as a food database describes it: values per 100 g.
public struct FoodProduct: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let brand: String
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let note: String

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

/// Looking a product up, the way the web app's own route looks it up.
///
/// The route itself is behind the web app's session cookie, which this app
/// does not hold, so the query goes straight to Open Food Facts from here. The
/// table, the query, the filtering and the ordering are all deliberately the
/// server's own, so the same search gives the same answer on both apps for as
/// long as nobody changes one without the other.
public enum FoodSearch {

    public static let shortestQuery = 2

    /// The server's generic table: averages per 100 g, for foods that have no
    /// barcode and no brand.
    public static let generic: [(product: FoodProduct, aliases: [String])] = [
        (make("Banaan", 89, 1.1, 22.8, 0.3), ["banana", "fruit"]),
        (make("Havermout", 379, 13.2, 67.7, 6.5), ["oats", "oatmeal"]),
        (make("Witte rijst, gekookt", 130, 2.7, 28.2, 0.3), ["rijst", "rice"]),
        (make("Aardappelen, gekookt", 87, 1.9, 20.1, 0.1), ["aardappel", "potato"]),
        (make("Kipfilet, bereid", 165, 31, 0, 3.6), ["kip", "chicken"]),
        (make("Zalm, bereid", 206, 22, 0, 12), ["salmon", "vis"]),
        (make("Volkorenbrood", 247, 13, 41, 3.4), ["brood", "bread"]),
        (make("Ei, heel", 143, 12.6, 0.7, 9.5), ["eieren", "egg"]),
        (make("Magere skyr", 63, 11, 3.8, 0.2), ["kwark", "yoghurt"]),
        (make("Halfvolle melk", 47, 3.5, 4.8, 1.5), ["milk"]),
        (make("Olijfolie", 884, 0, 0, 100), ["olie", "olive oil"]),
        (make("Rice crispies", 382, 6.3, 87, 1), ["rice krispies", "ontbijtgranen", "cereal"]),
    ]

    private static func make(
        _ name: String, _ calories: Double, _ protein: Double, _ carbs: Double, _ fat: Double
    ) -> FoodProduct {
        FoodProduct(
            id: "generic-\(slug(name))",
            name: name,
            brand: "Generiek",
            calories: calories,
            protein: protein,
            carbs: carbs,
            fat: fat,
            note: "Gemiddelde schatting per 100 g"
        )
    }

    public static func generic(matching query: String) -> [FoodProduct] {
        let needle = normalized(query)
        guard needle.count >= shortestQuery else { return [] }
        return generic
            .filter { normalized(([$0.product.name] + $0.aliases).joined(separator: " ")).contains(needle) }
            .prefix(5)
            .map(\.product)
    }

    public static func endpoint(for query: String) -> URL? {
        var components = URLComponents(string: "https://world.openfoodfacts.org/cgi/search.pl")
        components?.queryItems = [
            URLQueryItem(name: "search_terms", value: String(query.prefix(80))),
            URLQueryItem(name: "search_simple", value: "1"),
            URLQueryItem(name: "action", value: "process"),
            URLQueryItem(name: "json", value: "1"),
            URLQueryItem(name: "page_size", value: "15"),
            URLQueryItem(name: "lc", value: "nl"),
            URLQueryItem(name: "cc", value: "be"),
            URLQueryItem(
                name: "fields",
                value: "code,product_name,product_name_nl,brands,nutriments,countries_tags"
            ),
        ]
        return components?.url
    }

    /// Products worth showing, Belgian ones first. A product with no name, no
    /// energy, or an implausible energy is not worth showing at all.
    public static func products(from data: Data) throws -> [FoodProduct] {
        let payload = try JSONDecoder().decode(OpenFoodFactsPayload.self, from: data)
        return (payload.products ?? [])
            .compactMap { product -> (product: FoodProduct, belgian: Bool)? in
                let name = (product.product_name_nl ?? product.product_name ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let nutriments = product.nutriments
                let calories = value(nutriments?.energyKcal100g ?? nutriments?.energyKcal)
                guard !name.isEmpty, calories > 0, calories <= 1_200 else { return nil }
                let belgian = (product.countries_tags ?? []).contains { $0.range(of: "belg", options: .caseInsensitive) != nil }
                return (
                    FoodProduct(
                        id: "off-\(product.code ?? slug(name))",
                        name: name,
                        brand: (product.brands?.split(separator: ",").first.map(String.init) ?? "Merk onbekend")
                            .trimmingCharacters(in: .whitespaces),
                        calories: calories,
                        protein: value(nutriments?.proteins100g),
                        carbs: value(nutriments?.carbohydrates100g),
                        fat: value(nutriments?.fat100g),
                        note: belgian ? "Belgisch product · per 100 g" : "Waarden per 100 g"
                    ),
                    belgian
                )
            }
            .sorted { $0.belgian && !$1.belgian }
            .map(\.product)
    }

    /// Generic foods first, then products, with duplicates of the same name and
    /// brand dropped.
    public static func merged(generic: [FoodProduct], products: [FoodProduct]) -> [FoodProduct] {
        var seen: Set<String> = []
        return (generic + products).filter { product in
            let key = normalized("\(product.name)-\(product.brand)")
            return seen.insert(key).inserted
        }
        .prefix(15)
        .map { $0 }
    }

    /// What a portion of it is worth, rounded the way the web app rounds it.
    public static func portion(of product: FoodProduct, grams: Double) -> NutritionDraft {
        let factor = max(0, grams) / 100
        func macro(_ value: Double) -> Double { (value * factor * 10).rounded() / 10 }
        return NutritionDraft(
            name: grams > 0 ? "\(NumberDisplay.dutch.number(Decimal(grams))) g \(product.name)" : product.name,
            calories: grams > 0 ? (product.calories * factor).rounded() : 0,
            protein: macro(product.protein),
            carbs: macro(product.carbs),
            fat: macro(product.fat)
        )
    }

    // MARK: - Reading the payload

    private struct OpenFoodFactsPayload: Decodable {
        let products: [Product]?

        struct Product: Decodable {
            let code: String?
            let product_name: String?
            let product_name_nl: String?
            let brands: String?
            let countries_tags: [String]?
            let nutriments: Nutriments?
        }

        struct Nutriments: Decodable {
            let energyKcal100g: JSONValue?
            let energyKcal: JSONValue?
            let proteins100g: JSONValue?
            let carbohydrates100g: JSONValue?
            let fat100g: JSONValue?

            enum CodingKeys: String, CodingKey {
                case energyKcal100g = "energy-kcal_100g"
                case energyKcal = "energy-kcal"
                case proteins100g = "proteins_100g"
                case carbohydrates100g = "carbohydrates_100g"
                case fat100g = "fat_100g"
            }
        }
    }

    /// Open Food Facts is community-kept: a number can arrive as a number or as
    /// a string, and anything else is worth nothing.
    private static func value(_ json: JSONValue?) -> Double {
        switch json {
        case .number(let decimal): return max(0, (decimal as NSDecimalNumber).doubleValue)
        case .string(let text): return max(0, Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0)
        default: return 0
        }
    }

    private static func normalized(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
    }

    private static func slug(_ value: String) -> String {
        String(normalized(value).map { $0.isLetter || $0.isNumber ? $0 : "-" })
    }
}

/// What a chosen product puts in the form, before anyone edits it.
public struct NutritionDraft: Equatable, Sendable {
    public let name: String
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double

    public init(name: String, calories: Double, protein: Double, carbs: Double, fat: Double) {
        self.name = name
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
    }
}
