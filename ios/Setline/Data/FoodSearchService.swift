import Foundation
import SetlineCore

/// Asks the web app's product search, as this account.
///
/// One search serves both clients (`lib/food-search.ts`, behind
/// `/api/food-search`). The web app arrives there with its session cookie;
/// this app arrives with its Supabase access token, which the endpoint checks
/// with Supabase before answering. Nothing about the search is reimplemented
/// here, so the two cannot answer the same question differently.
actor FoodSearchService {

    enum Outcome: Equatable {
        case found([FoodProduct])
        /// Answered, but only from the generic table — Open Food Facts was out
        /// of reach at the far end.
        case partial([FoodProduct], note: String)
        case failed(String)
    }

    private let session: URLSession
    private let config: WebAppConfig?

    init(session: URLSession = .shared, config: WebAppConfig? = WebAppConfig.fromBundle()) {
        self.session = session
        self.config = config
    }

    func search(_ query: String, accessToken: String?) async -> Outcome {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= FoodSearch.shortestQuery else {
            return .failed("Typ minstens twee tekens.")
        }
        guard let config else {
            return .failed("Zoeken is niet ingesteld op dit toestel. Vul de waarden zelf in.")
        }
        guard let accessToken else {
            return .failed("Meld je opnieuw aan om producten te zoeken.")
        }
        guard let url = URL(string: FoodSearch.path(for: trimmed), relativeTo: config.url) else {
            return .failed(Self.unreachable)
        }

        var request = URLRequest(url: url, timeoutInterval: 12)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0

            if status == 401 {
                return .failed("Meld je opnieuw aan om producten te zoeken.")
            }
            guard (200..<300).contains(status) else {
                return .failed(FoodSearch.message(from: data) ?? Self.unreachable)
            }

            let results = try FoodSearch.results(from: data)
            guard !results.isEmpty else {
                return .failed("Niets gevonden voor \(trimmed). Vul de waarden zelf in.")
            }
            return FoodSearch.isPartial(data)
                ? .partial(results, note: "Productdatabase tijdelijk niet bereikbaar; generieke schattingen getoond.")
                : .found(results)
        } catch {
            return .failed("\(Self.unreachable) Vul de waarden zelf in.")
        }
    }

    private static let unreachable = "Zoeken lukte niet."
}
