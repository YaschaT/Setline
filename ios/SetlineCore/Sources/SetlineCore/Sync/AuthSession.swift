import Foundation

/// A signed-in account's tokens, as the Keychain holds them.
public struct AuthSession: Codable, Hashable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let userID: String
    public let email: String
    /// When the access token stops working. `nil` for sessions saved before
    /// expiry was recorded; those are refreshed before their first use.
    public let expiresAt: Date?

    public init(accessToken: String, refreshToken: String, userID: String, email: String, expiresAt: Date?) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.userID = userID
        self.email = email
        self.expiresAt = expiresAt
    }

    /// Expired, about to expire, or of unknown age.
    public func needsRefresh(at now: Date, leeway: TimeInterval) -> Bool {
        guard let expiresAt else { return true }
        return expiresAt.timeIntervalSince(now) <= leeway
    }

    // The keys match what the Keychain already holds, so a session saved by
    // an earlier build still signs the user in.
    private enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case userID
        case email
        case expiresAt = "expires_at"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try container.decode(String.self, forKey: .accessToken)
        refreshToken = try container.decode(String.self, forKey: .refreshToken)
        userID = try container.decode(String.self, forKey: .userID)
        email = try container.decode(String.self, forKey: .email)
        expiresAt = try container.decodeIfPresent(Double.self, forKey: .expiresAt).map(Date.init(timeIntervalSince1970:))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(accessToken, forKey: .accessToken)
        try container.encode(refreshToken, forKey: .refreshToken)
        try container.encode(userID, forKey: .userID)
        try container.encode(email, forKey: .email)
        try container.encodeIfPresent(expiresAt?.timeIntervalSince1970, forKey: .expiresAt)
    }
}

/// Why an authorised request could not be made.
public enum AuthFailure: Error, Equatable, Sendable {
    /// The server rejected the access token.
    case unauthorized
    /// The refresh token itself was rejected: only signing in again helps.
    case expired
    /// The auth server could not be reached. The session may be perfectly fine.
    case unreachable
}

public protocol TokenRefresher: Sendable {
    /// Exchanges the session's refresh token for a new session. Throws
    /// `AuthFailure.expired` when the refresh token is no longer valid, and
    /// `AuthFailure.unreachable` when the server could not be asked.
    func refreshSession(_ session: AuthSession) async throws -> AuthSession
}
