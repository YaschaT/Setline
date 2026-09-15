import Foundation

/// Keeps an account's access token usable, so sync never silently stops when
/// it expires.
///
/// - A token about to expire is refreshed before it is used.
/// - A request the server still rejects is retried once, after one refresh.
/// - Only one refresh runs at a time. Supabase issues a new refresh token on
///   every refresh and retires the old one, so two refreshes racing each other
///   would sign the user out.
/// - The session counts as expired only when the refresh token itself is
///   rejected. An unreachable server is not an expired session: nothing is
///   cleared, and the next request simply tries again.
public actor AuthSessionCoordinator {
    public private(set) var session: AuthSession
    public private(set) var isExpired = false

    private let refresher: TokenRefresher
    private let leeway: TimeInterval
    private let now: @Sendable () -> Date
    private let onRefresh: @Sendable (AuthSession) async -> Void
    private var refreshing: Task<AuthSession, Error>?

    /// - Parameter onRefresh: called with every new session, so the rotated
    ///   refresh token is stored before anything else can need it.
    public init(
        session: AuthSession,
        refresher: TokenRefresher,
        leeway: TimeInterval = 60,
        now: @escaping @Sendable () -> Date = { Date() },
        onRefresh: @escaping @Sendable (AuthSession) async -> Void
    ) {
        self.session = session
        self.refresher = refresher
        self.leeway = leeway
        self.now = now
        self.onRefresh = onRefresh
    }

    /// After signing in again. A refresh still running for the old session
    /// neither replaces this one nor marks it expired.
    public func replace(_ session: AuthSession) {
        self.session = session
        isExpired = false
        refreshing = nil
    }

    /// A session whose access token is good for at least `leeway` seconds.
    public func validSession() async throws -> AuthSession {
        if isExpired { throw AuthFailure.expired }
        guard session.needsRefresh(at: now(), leeway: leeway) else { return session }
        return try await refresh(replacing: session)
    }

    /// Runs an authorised request. Throws `AuthFailure.expired` only when
    /// signing in again is the one remedy left.
    public func perform<Value: Sendable>(_ request: @Sendable (AuthSession) async throws -> Value) async throws -> Value {
        let first = try await validSession()
        do {
            return try await request(first)
        } catch AuthFailure.unauthorized {
            let renewed = try await refresh(replacing: first)
            do {
                return try await request(renewed)
            } catch AuthFailure.unauthorized {
                // A token refreshed this very moment was rejected too.
                isExpired = true
                throw AuthFailure.expired
            }
        }
    }

    private func refresh(replacing stale: AuthSession) async throws -> AuthSession {
        if isExpired { throw AuthFailure.expired }
        // Someone else refreshed since this token was handed out.
        if session.accessToken != stale.accessToken, !session.needsRefresh(at: now(), leeway: leeway) {
            return session
        }

        let task: Task<AuthSession, Error>
        if let refreshing {
            task = refreshing
        } else {
            let current = session
            let refresher = self.refresher
            task = Task { try await refresher.refreshSession(current) }
            refreshing = task
        }

        do {
            let renewed = try await task.value
            if refreshing == task {
                refreshing = nil
                session = renewed
                await onRefresh(renewed)
            }
            return renewed
        } catch AuthFailure.expired {
            if refreshing == task {
                refreshing = nil
                isExpired = true
            }
            throw AuthFailure.expired
        } catch {
            if refreshing == task { refreshing = nil }
            throw AuthFailure.unreachable
        }
    }
}
