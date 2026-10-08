import Foundation
import SetlineCore

/// Asks the web app's product search, as this account.
///
/// One search serves both clients (`lib/food-search.ts`, behind
/// `/api/food-search`). The web app arrives there with its session cookie;
/// this app arrives with its Supabase access token, which the endpoint checks
/// with Supabase before answering. Nothing about the search is reimplemented
/// here, so the two cannot answer the same question differently. What a
/// search means — which token, which answer — is `FoodSearch.search`; this is
/// only the request on the wire.
struct FoodSearchService: Sendable {
    private let session: URLSession
    private let config: WebAppConfig?

    init(session: URLSession = .shared, config: WebAppConfig? = WebAppConfig.fromBundle()) {
        self.session = session
        self.config = config
    }

    /// `auth` is the signed-in account's token coordinator, the one sync
    /// uses; without one there is no account to search as.
    func search(_ query: String, auth: AuthSessionCoordinator?) async -> FoodSearchOutcome {
        guard let config else {
            return .failed("Search isn't set up on this phone. Enter the values yourself.")
        }
        guard let auth else { return .failed(FoodSearch.Message.signIn) }
        let session = self.session
        let base = config.url
        return await FoodSearch.search(query, auth: auth) { path, accessToken in
            guard let url = URL(string: path, relativeTo: base) else { throw URLError(.badURL) }
            var request = URLRequest(url: url, timeoutInterval: 12)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await session.data(for: request)
            return ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
        }
    }
}
