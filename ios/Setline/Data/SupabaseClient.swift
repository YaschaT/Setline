import Foundation
import SetlineCore

/// Minimal GoTrue + PostgREST client over URLSession.
///
/// It speaks to exactly the endpoints the web app already uses, so both
/// clients share one account and one `public.user_state` row. Swapping in
/// `supabase-swift` later is a contained change: nothing outside this file
/// knows how the request is made.
actor SupabaseClient: TokenRefresher {

    typealias Session = AuthSession

    enum Failure: LocalizedError, Equatable {
        case notConfigured
        case message(String)
        case network
        /// Someone else wrote first.
        case conflict

        var errorDescription: String? {
            switch self {
            case .notConfigured:
                return "Accounts zijn nog niet aangesloten. Zet SUPABASE_URL en SUPABASE_ANON_KEY in Setline.xcconfig en start opnieuw."
            case .message(let text):
                return text
            case .network:
                return "We krijgen geen antwoord van de server. Check je verbinding en probeer het zo opnieuw."
            case .conflict:
                return "Er is intussen al iets anders opgeslagen. Probeer het zo opnieuw."
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
        _ = try await send(try jsonRequest(path: "/auth/v1/recover", method: "POST", body: ["email": email], accessToken: nil))
    }

    /// Exchanges the refresh token for a new session.
    ///
    /// Any refusal from the token endpoint means the refresh token is no
    /// longer valid, and only signing in again helps. No answer, or a server
    /// error, is not that: the session is kept and tried again later.
    func refreshSession(_ current: Session) async throws -> Session {
        let request: URLRequest
        do {
            request = try jsonRequest(
                path: "/auth/v1/token?grant_type=refresh_token",
                method: "POST",
                body: ["refresh_token": current.refreshToken],
                accessToken: nil
            )
        } catch {
            throw AuthFailure.unreachable
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw AuthFailure.unreachable
        }
        guard let http = response as? HTTPURLResponse else { throw AuthFailure.unreachable }
        switch http.statusCode {
        case 200..<300:
            guard let renewed = Self.parseSession(data, fallbackEmail: current.email) else { throw AuthFailure.unreachable }
            return renewed
        case 400, 401, 403:
            throw AuthFailure.expired
        default:
            throw AuthFailure.unreachable
        }
    }

    private func authenticate(path: String, body: [String: String]) async throws -> Session {
        let data = try await send(try jsonRequest(path: path, method: "POST", body: body, accessToken: nil))
        guard let session = Self.parseSession(data, fallbackEmail: body["email"] ?? "") else {
            // A sign-up on a project that requires e-mail confirmation
            // returns a user but no session. Say so rather than failing
            // opaquely.
            throw Failure.message("Je account is aangemaakt. Bevestig je e-mailadres en meld je daarna aan.")
        }
        return session
    }

    /// GoTrue's session payload. `expires_at` is seconds since 1970; older
    /// servers only send `expires_in`.
    static func parseSession(_ data: Data, fallbackEmail: String, now: Date = Date()) -> Session? {
        guard
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let accessToken = object["access_token"] as? String,
            let refreshToken = object["refresh_token"] as? String,
            let user = object["user"] as? [String: Any],
            let id = user["id"] as? String
        else { return nil }
        let expiresAt: Date?
        if let at = object["expires_at"] as? Double {
            expiresAt = Date(timeIntervalSince1970: at)
        } else if let seconds = object["expires_in"] as? Double {
            expiresAt = now.addingTimeInterval(seconds)
        } else {
            expiresAt = nil
        }
        return Session(
            accessToken: accessToken,
            refreshToken: refreshToken,
            userID: id,
            email: (user["email"] as? String) ?? fallbackEmail,
            expiresAt: expiresAt
        )
    }

    // MARK: - State
    //
    // The row is read and written as JSON text straight into `JSONValue`,
    // never through `JSONSerialization`: a round trip through `Double` could
    // turn a stored 82.4 into 82.40000000000001 in data iOS does not own.

    private struct StateRow: Decodable {
        let state: JSONValue
        let updated_at: String
    }

    private struct VersionRow: Decodable {
        let updated_at: String
    }

    private struct StateWrite: Encodable {
        let user_id: String?
        let state: JSONValue
        let updated_at: String
    }

    /// Reads `public.user_state` and the version it is at.
    func fetchState(session token: Session) async throws -> RemoteState? {
        let path = "/rest/v1/user_state?select=state,updated_at&user_id=eq.\(token.userID)"
        let data = try await send(try makeRequest(path: path, method: "GET", accessToken: token.accessToken), signedIn: true)
        guard let row = try JSONDecoder().decode([StateRow].self, from: data).first else { return nil }
        return RemoteState(state: LegacyState(raw: row.state.objectValue ?? [:]), version: row.updated_at)
    }

    /// Writes only while the row is still at `expectedVersion`. An empty
    /// response means another client wrote first.
    func updateState(_ state: LegacyState, expectedVersion: String, nextVersion: String, session token: Session) async throws -> WriteOutcome {
        let path = "/rest/v1/user_state?user_id=eq.\(token.userID)&updated_at=eq.\(Self.queryValue(expectedVersion))&select=updated_at"
        var request = try makeRequest(path: path, method: "PATCH", accessToken: token.accessToken)
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(StateWrite(user_id: nil, state: .object(state.raw), updated_at: nextVersion))
        let data = try await send(request, signedIn: true)
        guard let row = try JSONDecoder().decode([VersionRow].self, from: data).first else { return .conflict }
        return .written(version: row.updated_at)
    }

    /// Creates the row. A row that appeared in the meantime is a conflict.
    func insertState(_ state: LegacyState, nextVersion: String, session token: Session) async throws -> WriteOutcome {
        var request = try makeRequest(path: "/rest/v1/user_state?select=updated_at", method: "POST", accessToken: token.accessToken)
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(StateWrite(user_id: token.userID, state: .object(state.raw), updated_at: nextVersion))
        do {
            let data = try await send(request, signedIn: true)
            guard let row = try JSONDecoder().decode([VersionRow].self, from: data).first else { throw Failure.network }
            return .written(version: row.updated_at)
        } catch Failure.conflict {
            return .conflict
        }
    }

    /// A filter value safe inside a query string: versions carry `+` and `:`.
    static func queryValue(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
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

    private func jsonRequest(path: String, method: String, body: [String: String], accessToken: String?) throws -> URLRequest {
        var request = try makeRequest(path: path, method: method, accessToken: accessToken)
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }

    /// - Parameter signedIn: the request carries the account's access token,
    ///   so a 401 means that token is no longer accepted.
    private func send(_ request: URLRequest, signedIn: Bool = false) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Failure.network
        }
        guard let http = response as? HTTPURLResponse else { throw Failure.network }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 409 { throw Failure.conflict }
            // The coordinator refreshes the token and retries once.
            if http.statusCode == 401, signedIn { throw AuthFailure.unauthorized }
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

/// The account's stored state, as the sync loop sees it. Every request goes
/// through the coordinator, so an expiring token is refreshed on the way.
struct SupabaseStateStore: StateStore {
    let client: SupabaseClient
    let auth: AuthSessionCoordinator

    func fetch() async throws -> RemoteState? {
        let client = self.client
        return try await auth.perform { session in try await client.fetchState(session: session) }
    }

    func update(_ state: LegacyState, expectedVersion: String, nextVersion: String) async throws -> WriteOutcome {
        let client = self.client
        return try await auth.perform { session in
            try await client.updateState(state, expectedVersion: expectedVersion, nextVersion: nextVersion, session: session)
        }
    }

    func insert(_ state: LegacyState, nextVersion: String) async throws -> WriteOutcome {
        let client = self.client
        return try await auth.perform { session in
            try await client.insertState(state, nextVersion: nextVersion, session: session)
        }
    }
}
