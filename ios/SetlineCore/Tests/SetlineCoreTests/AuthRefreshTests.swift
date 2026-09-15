import XCTest
@testable import SetlineCore

/// Sync must not silently stop when the access token expires.
final class AuthRefreshTests: XCTestCase {

    private actor Refresher: TokenRefresher {
        private(set) var calls = 0
        var outcome: Result<AuthSession, AuthFailure>
        let delay: UInt64

        init(outcome: Result<AuthSession, AuthFailure>, delay: UInt64 = 0) {
            self.outcome = outcome
            self.delay = delay
        }

        func setOutcome(_ outcome: Result<AuthSession, AuthFailure>) { self.outcome = outcome }

        func refreshSession(_ session: AuthSession) async throws -> AuthSession {
            calls += 1
            if delay > 0 { try await Task.sleep(nanoseconds: delay) }
            return try outcome.get()
        }
    }

    private actor Recorder {
        private(set) var saved: [AuthSession] = []
        private(set) var tokensSeen: [String] = []
        func save(_ session: AuthSession) { saved.append(session) }
        func saw(_ token: String) { tokensSeen.append(token) }
    }

    private let now = Date(timeIntervalSince1970: 1_789_000_000)

    private func session(_ token: String, expiresIn seconds: TimeInterval?) -> AuthSession {
        AuthSession(
            accessToken: token, refreshToken: "refresh-\(token)", userID: "user-1", email: "a@setline.be",
            expiresAt: seconds.map { now.addingTimeInterval($0) }
        )
    }

    private func coordinator(_ start: AuthSession, _ refresher: Refresher, _ recorder: Recorder) -> AuthSessionCoordinator {
        AuthSessionCoordinator(session: start, refresher: refresher, leeway: 60, now: { [now] in now }) { renewed in
            await recorder.save(renewed)
        }
    }

    func testAFreshTokenIsUsedAsIs() async throws {
        let refresher = Refresher(outcome: .failure(.unreachable))
        let auth = coordinator(session("old", expiresIn: 3_600), refresher, Recorder())
        let used = try await auth.validSession()
        let calls = await refresher.calls
        XCTAssertEqual(used.accessToken, "old")
        XCTAssertEqual(calls, 0)
    }

    func testATokenAboutToExpireIsRefreshedBeforeUseAndTheRotatedTokensStored() async throws {
        let renewed = session("new", expiresIn: 3_600)
        let refresher = Refresher(outcome: .success(renewed))
        let recorder = Recorder()
        let auth = coordinator(session("old", expiresIn: 30), refresher, recorder)

        let used = try await auth.validSession()

        let saved = await recorder.saved
        XCTAssertEqual(used, renewed)
        XCTAssertEqual(saved, [renewed], "the new refresh token is stored at once")
    }

    func testARejectedRequestRefreshesOnceAndRetries() async throws {
        let refresher = Refresher(outcome: .success(session("new", expiresIn: 3_600)))
        let recorder = Recorder()
        let auth = coordinator(session("old", expiresIn: 3_600), refresher, recorder)

        let value = try await auth.perform { current in
            await recorder.saw(current.accessToken)
            guard current.accessToken == "new" else { throw AuthFailure.unauthorized }
            return "stored state"
        }

        let calls = await refresher.calls
        let seen = await recorder.tokensSeen
        XCTAssertEqual(value, "stored state")
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(seen, ["old", "new"])
    }

    func testAFreshTokenRejectedAgainMeansSigningInAgainAndNoLoop() async throws {
        let refresher = Refresher(outcome: .success(session("new", expiresIn: 3_600)))
        let auth = coordinator(session("old", expiresIn: 3_600), refresher, Recorder())

        do {
            _ = try await auth.perform { _ -> String in throw AuthFailure.unauthorized }
            XCTFail("expected the session to be expired")
        } catch {
            XCTAssertEqual(error as? AuthFailure, .expired)
        }
        let calls = await refresher.calls
        let expired = await auth.isExpired
        XCTAssertEqual(calls, 1, "one refresh, one retry, then stop")
        XCTAssertTrue(expired)
    }

    func testConcurrentRequestsShareOneRefresh() async throws {
        let renewed = session("new", expiresIn: 3_600)
        let refresher = Refresher(outcome: .success(renewed), delay: 50_000_000)
        let recorder = Recorder()
        let auth = coordinator(session("old", expiresIn: 10), refresher, recorder)

        let tokens = try await withThrowingTaskGroup(of: String.self) { group in
            for _ in 0..<5 { group.addTask { try await auth.validSession().accessToken } }
            return try await group.reduce(into: [String]()) { $0.append($1) }
        }

        let calls = await refresher.calls
        let saved = await recorder.saved
        XCTAssertEqual(Set(tokens), ["new"])
        XCTAssertEqual(calls, 1, "a second refresh would spend the rotated refresh token")
        XCTAssertEqual(saved, [renewed])
    }

    func testARejectedRefreshTokenExpiresTheSessionAndStopsAsking() async throws {
        let refresher = Refresher(outcome: .failure(.expired))
        let recorder = Recorder()
        let auth = coordinator(session("old", expiresIn: 10), refresher, recorder)

        for _ in 0..<2 {
            do {
                _ = try await auth.validSession()
                XCTFail("expected the session to be expired")
            } catch {
                XCTAssertEqual(error as? AuthFailure, .expired)
            }
        }
        let calls = await refresher.calls
        let saved = await recorder.saved
        XCTAssertEqual(calls, 1, "the server is not asked again until the user signs in")
        XCTAssertTrue(saved.isEmpty)

        // Signing in again restores it.
        await auth.replace(session("signed-in", expiresIn: 3_600))
        let used = try await auth.validSession()
        XCTAssertEqual(used.accessToken, "signed-in")
    }

    func testAnUnreachableAuthServerIsNotAnExpiredSession() async throws {
        let refresher = Refresher(outcome: .failure(.unreachable))
        let auth = coordinator(session("old", expiresIn: 10), refresher, Recorder())

        do {
            _ = try await auth.validSession()
            XCTFail("expected an unreachable server")
        } catch {
            XCTAssertEqual(error as? AuthFailure, .unreachable)
        }
        let expired = await auth.isExpired
        XCTAssertFalse(expired)

        // Back online: the next request refreshes and goes through.
        await refresher.setOutcome(.success(session("new", expiresIn: 3_600)))
        let used = try await auth.validSession()
        let calls = await refresher.calls
        XCTAssertEqual(used.accessToken, "new")
        XCTAssertEqual(calls, 2)
    }

    func testSigningInAgainWhileAnOldRefreshRunsKeepsTheNewSession() async throws {
        let outcomes: [Result<AuthSession, AuthFailure>] = [.failure(.expired), .success(session("old-family", expiresIn: 3_600))]
        for outcome in outcomes {
            let refresher = Refresher(outcome: outcome, delay: 200_000_000)
            let recorder = Recorder()
            let auth = coordinator(session("old", expiresIn: 10), refresher, recorder)

            let stale = Task { try await auth.validSession() }
            while await refresher.calls == 0 { await Task.yield() }
            await auth.replace(session("signed-in", expiresIn: 3_600))
            _ = try? await stale.value

            let expired = await auth.isExpired
            let used = try await auth.validSession()
            let saved = await recorder.saved
            XCTAssertFalse(expired, "a late refusal for the old session must not expire the new one")
            XCTAssertEqual(used.accessToken, "signed-in")
            XCTAssertTrue(saved.isEmpty, "the old session's refresh is not stored over the new sign-in")
        }
    }

    func testASessionSavedBeforeExpiryWasRecordedStillSignsInAndRefreshesFirst() throws {
        let saved = #"{"access_token":"a","refresh_token":"r","userID":"u","email":"e@setline.be"}"#
        let decoded = try JSONDecoder().decode(AuthSession.self, from: Data(saved.utf8))
        XCTAssertNil(decoded.expiresAt)
        XCTAssertTrue(decoded.needsRefresh(at: now, leeway: 60))

        let current = session("t", expiresIn: 3_600)
        let roundTrip = try JSONDecoder().decode(AuthSession.self, from: JSONEncoder().encode(current))
        XCTAssertEqual(roundTrip, current)
    }
}
