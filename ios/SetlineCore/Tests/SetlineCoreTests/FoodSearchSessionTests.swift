import XCTest
@testable import SetlineCore

/// The product search asks as the signed-in account, with a token that works.
///
/// It used to send whatever token was stored, so an hour after the last sync
/// every search came back "meld je opnieuw aan" while the account was fine.
/// It now goes through the token coordinator first — and a search the server
/// turns down never signs the account out of sync.
final class FoodSearchSessionTests: XCTestCase {

    private actor Refresher: TokenRefresher {
        private(set) var calls = 0
        let outcome: Result<AuthSession, AuthFailure>

        init(_ outcome: Result<AuthSession, AuthFailure>) { self.outcome = outcome }

        func refreshSession(_ session: AuthSession) async throws -> AuthSession {
            calls += 1
            return try outcome.get()
        }
    }

    /// What reached the wire: the path and the token of every request.
    private actor Wire {
        private(set) var sent: [(path: String, token: String)] = []
        func record(_ path: String, _ token: String) { sent.append((path, token)) }
    }

    private let now = Date(timeIntervalSince1970: 1_789_000_000)

    private func session(_ token: String, expiresIn seconds: TimeInterval) -> AuthSession {
        AuthSession(
            accessToken: token, refreshToken: "refresh-\(token)", userID: "user-1", email: "a@setline.be",
            expiresAt: now.addingTimeInterval(seconds)
        )
    }

    private func coordinator(_ start: AuthSession, _ refresher: Refresher) -> AuthSessionCoordinator {
        AuthSessionCoordinator(session: start, refresher: refresher, leeway: 60, now: { [now] in now }) { _ in }
    }

    private let skyr = Data("""
    {"results":[
      {"id":"generic-magere-skyr-0","name":"Magere skyr","brand":"Generiek","calories":63,"protein":11,
       "carbs":4,"fat":0.2,"source":"Generiek","sourceNote":"Gemiddelde schatting per 100 g"},
      {"id":"off-5400141000009","name":"Skyr naturel","brand":"Boni","calories":63,"protein":11,
       "carbs":3.8,"fat":0.2,"source":"Open Food Facts","sourceNote":"Belgisch product · per 100 g"}
    ],"query":"skyr","disclaimer":"x"}
    """.utf8)

    func testAnExpiredTokenIsRefreshedBeforeTheSearchIsSent() async {
        let refresher = Refresher(.success(session("fresh", expiresIn: 3_600)))
        let auth = coordinator(session("stale", expiresIn: -600), refresher)
        let wire = Wire()
        let skyr = self.skyr

        let outcome = await FoodSearch.search("skyr", auth: auth) { path, token in
            await wire.record(path, token)
            return (200, skyr)
        }

        let sent = await wire.sent
        let calls = await refresher.calls
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(sent.map(\.token), ["fresh"], "the expired token never reaches the server")
        XCTAssertEqual(sent.map(\.path), ["/api/food-search?q=skyr"])
        guard case .found(let products) = outcome else { return XCTFail("expected results, got \(outcome)") }
        XCTAssertEqual(products.map(\.name), ["Magere skyr", "Skyr naturel"], "in the server's order")
    }

    func testAGoodTokenIsUsedAsIs() async {
        let refresher = Refresher(.failure(.unreachable))
        let auth = coordinator(session("good", expiresIn: 3_600), refresher)
        let wire = Wire()
        let skyr = self.skyr

        _ = await FoodSearch.search("  skyr ", auth: auth) { path, token in
            await wire.record(path, token)
            return (200, skyr)
        }

        let sent = await wire.sent
        let calls = await refresher.calls
        XCTAssertEqual(calls, 0)
        XCTAssertEqual(sent.map(\.token), ["good"])
        XCTAssertEqual(sent.map(\.path), ["/api/food-search?q=skyr"], "trimmed before it is sent")
    }

    /// The endpoint answers 401 whenever it cannot confirm a token — its own
    /// trouble reaching Supabase included. That must not end the session.
    func testARefusedSearchDoesNotSignTheAccountOut() async throws {
        let refresher = Refresher(.success(session("fresh", expiresIn: 3_600)))
        let auth = coordinator(session("good", expiresIn: 3_600), refresher)
        let refused = Data(#"{"error":"UNAUTHENTICATED","message":"Log in om producten te zoeken."}"#.utf8)

        let outcome = await FoodSearch.search("skyr", auth: auth) { _, _ in (401, refused) }

        let expired = await auth.isExpired
        XCTAssertEqual(outcome, .failed(FoodSearch.Message.unreachable))
        XCTAssertFalse(expired, "sync keeps working; only Supabase itself decides the session is over")
        let stillUsable = try await auth.validSession()
        XCTAssertEqual(stillUsable.accessToken, "good")
    }

    func testARejectedRefreshTokenAsksToSignInAgainAndSendsNothing() async {
        let refresher = Refresher(.failure(.expired))
        let auth = coordinator(session("stale", expiresIn: -600), refresher)
        let wire = Wire()

        let outcome = await FoodSearch.search("skyr", auth: auth) { path, token in
            await wire.record(path, token)
            return (200, Data())
        }

        let sent = await wire.sent
        XCTAssertEqual(outcome, .failed(FoodSearch.Message.signIn))
        XCTAssertTrue(sent.isEmpty)
    }

    func testNoConnectionSaysSoAndInventsNothing() async {
        let auth = coordinator(session("good", expiresIn: 3_600), Refresher(.failure(.unreachable)))
        let outcome = await FoodSearch.search("skyr", auth: auth) { _, _ in throw URLError(.notConnectedToInternet) }
        XCTAssertEqual(outcome, .failed(FoodSearch.Message.unreachable))
    }

    func testAShortQueryIsNeverSent() async {
        let auth = coordinator(session("good", expiresIn: 3_600), Refresher(.failure(.unreachable)))
        let wire = Wire()
        let outcome = await FoodSearch.search(" s ", auth: auth) { path, token in
            await wire.record(path, token)
            return (200, Data())
        }
        let sent = await wire.sent
        XCTAssertEqual(outcome, .failed(FoodSearch.Message.tooShort))
        XCTAssertTrue(sent.isEmpty)
    }

    // MARK: - What an answer means

    func testNothingFoundOffersToFillItInByHand() {
        let empty = Data(#"{"results":[],"query":"xyzzy","disclaimer":"x"}"#.utf8)
        XCTAssertEqual(
            FoodSearch.outcome(status: 200, data: empty, query: "xyzzy"),
            .failed("Nothing found for xyzzy. Enter the values yourself.")
        )
    }

    func testGenericOnlyAnswersSaySo() throws {
        let partial = Data("""
        {"results":[{"id":"generic-banaan-0","name":"Banaan","brand":"Generiek","calories":89,
         "protein":1.1,"carbs":22.8,"fat":0.3,"source":"Generiek","sourceNote":"Gemiddelde schatting per 100 g"}],
         "partial":true,"query":"banaan","disclaimer":"x"}
        """.utf8)
        guard case .partial(let products, let note) = FoodSearch.outcome(status: 200, data: partial, query: "banaan") else {
            return XCTFail("expected a partial answer")
        }
        XCTAssertEqual(products.map(\.name), ["Banaan"])
        XCTAssertEqual(note, FoodSearch.Message.partial)
    }

    /// A server error carries its own technical words, often in English; the
    /// screen says it plainly instead.
    func testAServerErrorIsSaidPlainly() {
        let failure = Data(#"{"error":"SEARCH_FAILED","message":"The operation was aborted due to timeout"}"#.utf8)
        XCTAssertEqual(
            FoodSearch.outcome(status: 502, data: failure, query: "skyr"),
            .failed(FoodSearch.Message.unreachable)
        )
    }

    func testAnUnreadableAnswerIsNotShownAsResults() {
        XCTAssertEqual(
            FoodSearch.outcome(status: 200, data: Data("<html>".utf8), query: "skyr"),
            .failed(FoodSearch.Message.unreachable)
        )
    }

    /// Picking a result logs what 100 g of it is worth, exactly as the
    /// server gave it.
    func testPickingAResultLogsItsOwnValues() throws {
        guard case .found(let products) = FoodSearch.outcome(status: 200, data: skyr, query: "skyr"),
              let boni = products.last
        else { return XCTFail("expected results") }
        let draft = FoodSearch.portion(of: boni, grams: 100)
        XCTAssertEqual(draft.name, "Skyr naturel")
        XCTAssertEqual(draft.calories, 63)
        XCTAssertEqual(draft.protein, 11)
        XCTAssertEqual(draft.carbs, 3.8)
        XCTAssertEqual(draft.fat, 0.2)
        XCTAssertEqual(draft.amount, 100)
        XCTAssertEqual(draft.unit, "g")
    }
}
