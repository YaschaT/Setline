// Port of ios/SetlineCore/Tests/SetlineCoreTests/AuthRefreshTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertFalse, assertNil, assertTrue } from "../helpers";
import { AuthFailure, AuthSession, type TokenRefresher } from "../../src/core/Sync/AuthSession";
import { AuthSessionCoordinator } from "../../src/core/Sync/AuthSessionCoordinator";
import { addingTimeInterval, dateFromEpoch } from "../../src/core/Support/calendar";

/** Swift `Result<AuthSession, AuthFailure>`. */
type Outcome = { success: AuthSession } | { failure: AuthFailure["kind"] };

const sleep = (nanoseconds: number) => new Promise((resolve) => setTimeout(resolve, nanoseconds / 1_000_000));

class Refresher implements TokenRefresher {
  calls = 0;

  constructor(
    public outcome: Outcome,
    private readonly delay = 0,
  ) {}

  setOutcome(outcome: Outcome): void {
    this.outcome = outcome;
  }

  async refreshSession(_session: AuthSession): Promise<AuthSession> {
    this.calls += 1;
    if (this.delay > 0) await sleep(this.delay);
    const outcome = this.outcome;
    if ("failure" in outcome) throw new AuthFailure(outcome.failure);
    return outcome.success;
  }
}

class Recorder {
  saved: AuthSession[] = [];
  tokensSeen: string[] = [];
  save(session: AuthSession): void {
    this.saved.push(session);
  }
  saw(token: string): void {
    this.tokensSeen.push(token);
  }
}

/** `XCTAssertEqual(error as? AuthFailure, kind)`. */
function assertFailure(error: unknown, kind: AuthFailure["kind"]): void {
  assertTrue(error instanceof AuthFailure, `expected AuthFailure, got ${String(error)}`);
  assertEqual((error as AuthFailure).kind, kind);
}

/** Sync must not silently stop when the access token expires. */
describe("AuthRefreshTests", () => {
  const now = dateFromEpoch(1_789_000_000);

  const session = (token: string, expiresIn: number | undefined): AuthSession =>
    AuthSession.make({
      accessToken: token,
      refreshToken: `refresh-${token}`,
      userID: "user-1",
      email: "a@setline.be",
      expiresAt: expiresIn === undefined ? undefined : addingTimeInterval(now, expiresIn),
    });

  const coordinator = (start: AuthSession, refresher: Refresher, recorder: Recorder) =>
    new AuthSessionCoordinator({
      session: start,
      refresher,
      leeway: 60,
      now: () => now,
      onRefresh: async (renewed) => recorder.save(renewed),
    });

  test("testAFreshTokenIsUsedAsIs", async () => {
    const refresher = new Refresher({ failure: "unreachable" });
    const auth = coordinator(session("old", 3_600), refresher, new Recorder());
    const used = await auth.validSession();
    assertEqual(used.accessToken, "old");
    assertEqual(refresher.calls, 0);
  });

  test("testATokenAboutToExpireIsRefreshedBeforeUseAndTheRotatedTokensStored", async () => {
    const renewed = session("new", 3_600);
    const refresher = new Refresher({ success: renewed });
    const recorder = new Recorder();
    const auth = coordinator(session("old", 30), refresher, recorder);

    const used = await auth.validSession();

    assertEqual(used, renewed);
    assertEqual(recorder.saved, [renewed], "the new refresh token is stored at once");
  });

  test("testARejectedRequestRefreshesOnceAndRetries", async () => {
    const refresher = new Refresher({ success: session("new", 3_600) });
    const recorder = new Recorder();
    const auth = coordinator(session("old", 3_600), refresher, recorder);

    const value = await auth.perform(async (current) => {
      recorder.saw(current.accessToken);
      if (current.accessToken !== "new") throw new AuthFailure("unauthorized");
      return "stored state";
    });

    assertEqual(value, "stored state");
    assertEqual(refresher.calls, 1);
    assertEqual(recorder.tokensSeen, ["old", "new"]);
  });

  test("testAFreshTokenRejectedAgainMeansSigningInAgainAndNoLoop", async () => {
    const refresher = new Refresher({ success: session("new", 3_600) });
    const auth = coordinator(session("old", 3_600), refresher, new Recorder());

    try {
      await auth.perform(async (): Promise<string> => {
        throw new AuthFailure("unauthorized");
      });
      assertTrue(false, "expected the session to be expired");
    } catch (error) {
      assertFailure(error, "expired");
    }
    assertEqual(refresher.calls, 1, "one refresh, one retry, then stop");
    assertTrue(auth.isExpired);
  });

  test("testConcurrentRequestsShareOneRefresh", async () => {
    const renewed = session("new", 3_600);
    const refresher = new Refresher({ success: renewed }, 50_000_000);
    const recorder = new Recorder();
    const auth = coordinator(session("old", 10), refresher, recorder);

    const tokens = await Promise.all(
      Array.from({ length: 5 }, async () => (await auth.validSession()).accessToken),
    );

    assertEqual(new Set(tokens), new Set(["new"]));
    assertEqual(refresher.calls, 1, "a second refresh would spend the rotated refresh token");
    assertEqual(recorder.saved, [renewed]);
  });

  test("testARejectedRefreshTokenExpiresTheSessionAndStopsAsking", async () => {
    const refresher = new Refresher({ failure: "expired" });
    const recorder = new Recorder();
    const auth = coordinator(session("old", 10), refresher, recorder);

    for (let i = 0; i < 2; i++) {
      try {
        await auth.validSession();
        assertTrue(false, "expected the session to be expired");
      } catch (error) {
        assertFailure(error, "expired");
      }
    }
    assertEqual(refresher.calls, 1, "the server is not asked again until the user signs in");
    assertTrue(recorder.saved.length === 0);

    // Signing in again restores it.
    await auth.replace(session("signed-in", 3_600));
    const used = await auth.validSession();
    assertEqual(used.accessToken, "signed-in");
  });

  test("testAnUnreachableAuthServerIsNotAnExpiredSession", async () => {
    const refresher = new Refresher({ failure: "unreachable" });
    const auth = coordinator(session("old", 10), refresher, new Recorder());

    try {
      await auth.validSession();
      assertTrue(false, "expected an unreachable server");
    } catch (error) {
      assertFailure(error, "unreachable");
    }
    assertFalse(auth.isExpired);

    // Back online: the next request refreshes and goes through.
    refresher.setOutcome({ success: session("new", 3_600) });
    const used = await auth.validSession();
    assertEqual(used.accessToken, "new");
    assertEqual(refresher.calls, 2);
  });

  test("testSigningInAgainWhileAnOldRefreshRunsKeepsTheNewSession", async () => {
    const outcomes: Outcome[] = [{ failure: "expired" }, { success: session("old-family", 3_600) }];
    for (const outcome of outcomes) {
      const refresher = new Refresher(outcome, 200_000_000);
      const recorder = new Recorder();
      const auth = coordinator(session("old", 10), refresher, recorder);

      const stale = auth.validSession();
      stale.catch(() => undefined);
      while (refresher.calls === 0) await new Promise((resolve) => setImmediate(resolve));
      await auth.replace(session("signed-in", 3_600));
      try {
        await stale;
      } catch {
        // `try?`
      }

      const expired = auth.isExpired;
      const used = await auth.validSession();
      assertFalse(expired, "a late refusal for the old session must not expire the new one");
      assertEqual(used.accessToken, "signed-in");
      assertTrue(recorder.saved.length === 0, "the old session's refresh is not stored over the new sign-in");
    }
  });

  test("testASessionSavedBeforeExpiryWasRecordedStillSignsInAndRefreshesFirst", () => {
    const saved = `{"access_token":"a","refresh_token":"r","userID":"u","email":"e@setline.be"}`;
    const decoded = AuthSession.decode(JSON.parse(saved));
    assertNil(decoded.expiresAt);
    assertTrue(AuthSession.needsRefresh(decoded, { at: now, leeway: 60 }));

    const current = session("t", 3_600);
    const roundTrip = AuthSession.decode(JSON.parse(JSON.stringify(AuthSession.encode(current))));
    assertEqual(roundTrip, current);
  });
});
