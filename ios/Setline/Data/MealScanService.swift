import Foundation
import SetlineCore

/// Asks the web app's meal scan (`/api/meal-scan`, `lib/meal-scan.ts`), as
/// this account: the photo and what was said go to the Setline server, which
/// asks a vision model and answers with foods, grams and at most one
/// question. Nil when there is no answer — the scan then reads the photo on
/// the phone instead.
struct MealScanService: Sendable {
    enum Outcome: Sendable {
        case answer(FoodScanAnswer)
        /// No account, no server, no connection, or the server said no.
        case unavailable(String)
    }

    private let session: URLSession
    private let config: WebAppConfig?

    init(session: URLSession = .shared, config: WebAppConfig? = WebAppConfig.fromBundle()) {
        self.session = session
        self.config = config
    }

    func scan(_ body: FoodScanRequest, auth: AuthSessionCoordinator?) async -> Outcome {
        guard let config, let auth else { return .unavailable("Sign in to scan with Tally.") }
        guard let url = URL(string: "/api/meal-scan", relativeTo: config.url) else { return .unavailable("No server.") }
        do {
            let token = try await auth.validSession().accessToken
            var request = URLRequest(url: url, timeoutInterval: 30)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.httpBody = try JSONEncoder().encode(body)
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else {
                let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
                return .unavailable(message ?? "Tally couldn't answer (\(status)).")
            }
            return .answer(try JSONDecoder().decode(FoodScanAnswer.self, from: data))
        } catch {
            return .unavailable("No connection.")
        }
    }
}
