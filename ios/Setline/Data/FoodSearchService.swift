import Foundation
import SetlineCore

/// Looks a product up in Open Food Facts, from the phone.
///
/// The web app asks its own server, which asks Open Food Facts; this app asks
/// Open Food Facts directly, because that route is behind a session cookie iOS
/// does not hold. The query, the filtering and the ordering are the server's
/// own (`FoodSearch`), so the two apps agree for as long as both are kept in
/// step.
actor FoodSearchService {

    enum Outcome: Equatable {
        /// Everything the search found.
        case found([FoodProduct])
        /// The database could not be reached, so only the generic table.
        case partial([FoodProduct], note: String)
        case failed(String)
    }

    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func search(_ query: String) async -> Outcome {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= FoodSearch.shortestQuery else {
            return .failed("Typ minstens twee tekens.")
        }

        let generic = FoodSearch.generic(matching: trimmed)

        guard let url = FoodSearch.endpoint(for: trimmed) else {
            return generic.isEmpty
                ? .failed("Dit product kon niet worden opgezocht.")
                : .partial(generic, note: Self.unreachable)
        }

        var request = URLRequest(url: url, timeoutInterval: 8)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Setline/1.0 (iOS; privé trainingslogboek)", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }
            let products = try FoodSearch.products(from: data)
            let results = FoodSearch.merged(generic: generic, products: products)
            return results.isEmpty
                ? .failed("Niets gevonden voor \(trimmed). Vul de waarden zelf in.")
                : .found(results)
        } catch {
            return generic.isEmpty
                ? .failed("\(Self.unreachable) Vul de waarden zelf in.")
                : .partial(generic, note: Self.unreachable)
        }
    }

    private static let unreachable = "Productdatabase niet bereikbaar."
}
