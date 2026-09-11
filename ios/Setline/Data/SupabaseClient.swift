import Foundation
import SetlineCore

/// Minimal GoTrue + PostgREST client over URLSession.
///
/// It speaks to exactly the endpoints the web app already uses, so both
/// clients share one account and one `public.user_state` row. Swapping in
/// `supabase-swift` later is a contained change: nothing outside this file
/// knows how the request is made.
actor SupabaseClient {

    struct Session: Codable, Sendable {
        let accessToken: String
        let refreshToken: String
        let userID: String
        let email: String

        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case refreshToken = "refresh_token"
            case userID
            case email
        }
    }

    enum Failure: LocalizedError, Equatable {
        case notConfigured
        case message(String)
        case network

        var errorDescription: String? {
            switch self {
            case .notConfigured:
                return "Accounts zijn nog niet aangesloten. Zet SUPABASE_URL en SUPABASE_ANON_KEY in Setline.xcconfig en start opnieuw."
            case .message(let text):
                return text
            case .network:
                return "We krijgen geen antwoord van de server. Check je verbinding en probeer het zo opnieuw."
            }
        }
    }

    private let config: SupabaseConfig?
    private let session: URLSession

    init(config: SupabaseConfig?, session: URLSession = .shared) {
        self.config = config
        self.session = session
    }

    var isConfigured: Bool { config != nil }

    // MARK: - Auth

    func signIn(email: String, password: String) async throws -> Session {
        try await authenticate(path: "/auth/v1/token?grant_type=password", body: ["email": email, "password": password])
    }

    func signUp(email: String, password: String) async throws -> Session {
        try await authenticate(path: "/auth/v1/signup", body: ["email": email, "password": password])
    }

    func sendPasswordReset(email: String) async throws {
        _ = try await request(path: "/auth/v1/recover", method: "POST", body: ["email": email], accessToken: nil)
    }

    private func authenticate(path: String, body: [String: String]) async throws -> Session {
        let data = try await request(path: path, method: "POST", body: body, accessToken: nil)
        guard
            let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let accessToken = object["access_token"] as? String,
            let refreshToken = object["refresh_token"] as? String,
            let user = object["user"] as? [String: Any],
            let id = user["id"] as? String
        else {
            // A sign-up on a project that requires e-mail confirmation
            // returns a user but no session. Say so rather than failing
            // opaquely.
            throw Failure.message("Je account is aangemaakt. Bevestig je e-mailadres en meld je daarna aan.")
        }
        return Session(
            accessToken: accessToken,
            refreshToken: refreshToken,
            userID: id,
            email: (user["email"] as? String) ?? body["email"] ?? ""
        )
    }

    // MARK: - State

    /// Reads `public.user_state`, the row the web app writes.
    func loadState(session token: Session) async throws -> LegacyState? {
        let path = "/rest/v1/user_state?select=state,updated_at&user_id=eq.\(token.userID)"
        let data = try await request(path: path, method: "GET", body: nil, accessToken: token.accessToken)
        guard
            let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
            let first = rows.first,
            let state = first["state"]
        else { return nil }
        let stateData = try JSONSerialization.data(withJSONObject: state)
        return try LegacyState(data: stateData)
    }

    func saveState(_ state: LegacyState, session token: Session) async throws {
        let payload: [String: Any] = [
            "user_id": token.userID,
            "state": try JSONSerialization.jsonObject(with: state.encoded()),
            "updated_at": ISO8601DateFormatter().string(from: Date()),
        ]
        var request = try makeRequest(path: "/rest/v1/user_state?on_conflict=user_id", method: "POST", accessToken: token.accessToken)
        request.setValue("resolution=merge-duplicates", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        _ = try await send(request)
    }

    // MARK: - Plumbing

    private func makeRequest(path: String, method: String, accessToken: String?) throws -> URLRequest {
        guard let config else { throw Failure.notConfigured }
        guard let url = URL(string: config.url.absoluteString + path) else { throw Failure.network }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken ?? config.anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return request
    }

    private func request(path: String, method: String, body: [String: String]?, accessToken: String?) async throws -> Data {
        var request = try makeRequest(path: path, method: method, accessToken: accessToken)
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        return try await send(request)
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Failure.network
        }
        guard let http = response as? HTTPURLResponse else { throw Failure.network }
        guard (200..<300).contains(http.statusCode) else {
            throw Failure.message(Self.readableMessage(from: data, status: http.statusCode))
        }
        return data
    }

    /// Supabase reports failures under several different keys. Anything we
    /// cannot read becomes a sentence that names what to do next, never a
    /// raw status code.
    static func readableMessage(from data: Data, status: Int) -> String {
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for key in ["error_description", "msg", "message", "error"] {
                if let text = object[key] as? String, !text.isEmpty {
                    if text.lowercased().contains("invalid login credentials") {
                        return "E-mailadres of wachtwoord klopt niet."
                    }
                    return text
                }
            }
        }
        if status == 401 || status == 403 { return "Je sessie is verlopen. Meld je opnieuw aan." }
        return "Er ging iets mis bij de server. Probeer het zo opnieuw."
    }
}
