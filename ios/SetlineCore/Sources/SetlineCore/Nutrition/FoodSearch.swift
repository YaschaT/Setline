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

/// What one search comes to on screen. When there is nothing to show, the
/// reason is said in plain words and the screen offers to fill the values in
/// by hand; no result is ever made up on this side.
public enum FoodSearchOutcome: Equatable, Sendable {
    case found([FoodProduct])
    /// Answered, but only from the generic table — Open Food Facts was out
    /// of reach at the far end.
    case partial([FoodProduct], note: String)
    case failed(String)
}

/// What the app does with a search, which is deliberately almost nothing.
///
/// The table, the query to Open Food Facts, the filtering and the ordering all
/// live on the server (`lib/food-search.ts`), behind one endpoint both clients
/// call. This app sends a query and shows the answer in the order it arrives;
/// it has no opinion of its own to disagree with the web app's.
public enum FoodSearch {

    public static let shortestQuery = 2

    /// The screen's words when a search has nothing to show.
    public enum Message {
        public static let tooShort = "Type at least two characters."
        public static let unreachable = "Search didn't work. Enter the values yourself."
        public static let signIn = "Sign in again to search for products."
        public static let partial = "Product database temporarily unavailable; showing generic estimates."

        public static func nothingFound(_ query: String) -> String {
            "Nothing found for \(query). Enter the values yourself."
        }
    }

    /// Asks the shared search as this account, with a token that is good for it.
    ///
    /// The token comes from `auth`, the coordinator every sync request goes
    /// through, so one that has expired — or is about to — is refreshed
    /// before the search is sent. Handing the search the stored token as it
    /// was meant that an hour after the last sync every search failed with
    /// "meld je opnieuw aan", while the account was signed in and syncing.
    ///
    /// A search the server still turns down does not mark the session
    /// expired. The endpoint answers 401 whenever it cannot confirm the token
    /// with Supabase — its own trouble reaching Supabase included — so only
    /// sync, which asks Supabase directly, decides that signing in is due.
    public static func search(
        _ query: String,
        auth: AuthSessionCoordinator,
        send: @Sendable (_ path: String, _ accessToken: String) async throws -> (status: Int, data: Data)
    ) async -> FoodSearchOutcome {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= shortestQuery else { return .failed(Message.tooShort) }

        let session: AuthSession
        do {
            session = try await auth.validSession()
        } catch AuthFailure.expired {
            return .failed(Message.signIn)
        } catch {
            return .failed(Message.unreachable)
        }

        do {
            let (status, data) = try await send(path(for: trimmed), session.accessToken)
            return outcome(status: status, data: data, query: trimmed)
        } catch {
            return .failed(Message.unreachable)
        }
    }

    /// What an answer means for the screen: the products, in the order the
    /// server ranked them, or why there are none.
    public static func outcome(status: Int, data: Data, query: String) -> FoodSearchOutcome {
        guard (200..<300).contains(status) else {
            // A refused token is the session's business, and a server error
            // carries the server's own technical words; neither is something
            // to read out here. A plain request error keeps its message.
            if status == 401 || status >= 500 { return .failed(Message.unreachable) }
            return .failed(message(from: data) ?? Message.unreachable)
        }
        guard let products = try? results(from: data) else { return .failed(Message.unreachable) }
        guard !products.isEmpty else { return .failed(Message.nothingFound(query)) }
        return isPartial(data) ? .partial(products, note: Message.partial) : .found(products)
    }

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
