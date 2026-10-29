// Port of ios/SetlineCore/Tests/SetlineCoreTests/FoodSearchSessionTests.swift.
//
// The product search asks as the signed-in account, with a token that works.
//
// It used to send whatever token was stored, so an hour after the last sync
// every search came back "meld je opnieuw aan" while the account was fine.
// It now goes through the token coordinator first — and a search the server
// turns down never signs the account out of sync.
import { test } from "node:test";
import { FoodSearch, FoodSearch_Message, FoodSearchOutcome } from "../../src/core/Nutrition/FoodSearch";
import { AuthFailure, AuthSession, type TokenRefresher } from "../../src/core/Sync/AuthSession";
import { AuthSessionCoordinator } from "../../src/core/Sync/AuthSessionCoordinator";
import { addingTimeInterval } from "../../src/core/Support/calendar";
import { assertEqual, assertFalse, assertTrue } from "../helpers";

type Outcome = { ok: AuthSession } | { failure: AuthFailure };

class Refresher implements TokenRefresher {
  calls = 0;
  constructor(readonly outcome: Outcome) {}

  async refreshSession(_session: AuthSession): Promise<AuthSession> {
    this.calls += 1;
    if ("ok" in this.outcome) return this.outcome.ok;
    throw this.outcome.failure;
  }
}

/** What reached the wire: the path and the token of every request. */
class Wire {
  sent: { path: string; token: string }[] = [];
  record(path: string, token: string) {
    this.sent.push({ path, token });
  }
}

const now = new Date(1_789_000_000 * 1000);

function session(token: string, expiresIn: number): AuthSession {
  return AuthSession.make({
    accessToken: token, refreshToken: `refresh-${token}`, userID: "user-1", email: "a@setline.be",
    expiresAt: addingTimeInterval(now, expiresIn),
  });
}

function coordinator(start: AuthSession, refresher: Refresher): AuthSessionCoordinator {
  return new AuthSessionCoordinator({ session: start, refresher, leeway: 60, now: () => now, onRefresh: () => {} });
}

const skyr = `
{"results":[
  {"id":"generic-magere-skyr-0","name":"Magere skyr","brand":"Generiek","calories":63,"protein":11,
   "carbs":4,"fat":0.2,"source":"Generiek","sourceNote":"Gemiddelde schatting per 100 g"},
  {"id":"off-5400141000009","name":"Skyr naturel","brand":"Boni","calories":63,"protein":11,
   "carbs":3.8,"fat":0.2,"source":"Open Food Facts","sourceNote":"Belgisch product · per 100 g"}
],"query":"skyr","disclaimer":"x"}`;

test("testAnExpiredTokenIsRefreshedBeforeTheSearchIsSent", async () => {
  const refresher = new Refresher({ ok: session("fresh", 3_600) });
  const auth = coordinator(session("stale", -600), refresher);
  const wire = new Wire();

  const outcome = await FoodSearch.search("skyr", {
    auth,
    send: async (path, token) => {
      wire.record(path, token);
      return { status: 200, data: skyr };
    },
  });

  assertEqual(refresher.calls, 1);
  assertEqual(wire.sent.map((s) => s.token), ["fresh"], "the expired token never reaches the server");
  assertEqual(wire.sent.map((s) => s.path), ["/api/food-search?q=skyr"]);
  if (outcome.kind !== "found") throw new Error(`expected results, got ${JSON.stringify(outcome)}`);
  assertEqual(outcome.value.map((p) => p.name), ["Magere skyr", "Skyr naturel"], "in the server's order");
});

test("testAGoodTokenIsUsedAsIs", async () => {
  const refresher = new Refresher({ failure: AuthFailure.unreachable() });
  const auth = coordinator(session("good", 3_600), refresher);
  const wire = new Wire();

  await FoodSearch.search("  skyr ", {
    auth,
    send: async (path, token) => {
      wire.record(path, token);
      return { status: 200, data: skyr };
    },
  });

  assertEqual(refresher.calls, 0);
  assertEqual(wire.sent.map((s) => s.token), ["good"]);
  assertEqual(wire.sent.map((s) => s.path), ["/api/food-search?q=skyr"], "trimmed before it is sent");
});

/**
 * The endpoint answers 401 whenever it cannot confirm a token — its own
 * trouble reaching Supabase included. That must not end the session.
 */
test("testARefusedSearchDoesNotSignTheAccountOut", async () => {
  const refresher = new Refresher({ ok: session("fresh", 3_600) });
  const auth = coordinator(session("good", 3_600), refresher);
  const refused = `{"error":"UNAUTHENTICATED","message":"Log in om producten te zoeken."}`;

  const outcome = await FoodSearch.search("skyr", { auth, send: async () => ({ status: 401, data: refused }) });

  assertEqual(outcome, FoodSearchOutcome.failed(FoodSearch_Message.unreachable));
  assertFalse(auth.isExpired, "sync keeps working; only Supabase itself decides the session is over");
  const stillUsable = await auth.validSession();
  assertEqual(stillUsable.accessToken, "good");
});

test("testARejectedRefreshTokenAsksToSignInAgainAndSendsNothing", async () => {
  const refresher = new Refresher({ failure: AuthFailure.expired() });
  const auth = coordinator(session("stale", -600), refresher);
  const wire = new Wire();

  const outcome = await FoodSearch.search("skyr", {
    auth,
    send: async (path, token) => {
      wire.record(path, token);
      return { status: 200, data: "" };
    },
  });

  assertEqual(outcome, FoodSearchOutcome.failed(FoodSearch_Message.signIn));
  assertTrue(wire.sent.length === 0);
});

test("testNoConnectionSaysSoAndInventsNothing", async () => {
  const auth = coordinator(session("good", 3_600), new Refresher({ failure: AuthFailure.unreachable() }));
  const outcome = await FoodSearch.search("skyr", {
    auth,
    send: async () => {
      throw new Error("URLError.notConnectedToInternet");
    },
  });
  assertEqual(outcome, FoodSearchOutcome.failed(FoodSearch_Message.unreachable));
});

test("testAShortQueryIsNeverSent", async () => {
  const auth = coordinator(session("good", 3_600), new Refresher({ failure: AuthFailure.unreachable() }));
  const wire = new Wire();
  const outcome = await FoodSearch.search(" s ", {
    auth,
    send: async (path, token) => {
      wire.record(path, token);
      return { status: 200, data: "" };
    },
  });
  assertEqual(outcome, FoodSearchOutcome.failed(FoodSearch_Message.tooShort));
  assertTrue(wire.sent.length === 0);
});

// MARK: - What an answer means

test("testNothingFoundOffersToFillItInByHand", () => {
  const empty = `{"results":[],"query":"xyzzy","disclaimer":"x"}`;
  assertEqual(
    FoodSearch.outcome({ status: 200, data: empty, query: "xyzzy" }),
    FoodSearchOutcome.failed("Nothing found for xyzzy. Enter the values yourself."),
  );
});

test("testGenericOnlyAnswersSaySo", () => {
  const partial = `
  {"results":[{"id":"generic-banaan-0","name":"Banaan","brand":"Generiek","calories":89,
   "protein":1.1,"carbs":22.8,"fat":0.3,"source":"Generiek","sourceNote":"Gemiddelde schatting per 100 g"}],
   "partial":true,"query":"banaan","disclaimer":"x"}`;
  const outcome = FoodSearch.outcome({ status: 200, data: partial, query: "banaan" });
  if (outcome.kind !== "partial") throw new Error("expected a partial answer");
  assertEqual(outcome.value.map((p) => p.name), ["Banaan"]);
  assertEqual(outcome.note, FoodSearch_Message.partial);
});

/**
 * A server error carries its own technical words, often in English; the
 * screen says it plainly instead.
 */
test("testAServerErrorIsSaidPlainly", () => {
  const failure = `{"error":"SEARCH_FAILED","message":"The operation was aborted due to timeout"}`;
  assertEqual(FoodSearch.outcome({ status: 502, data: failure, query: "skyr" }), FoodSearchOutcome.failed(FoodSearch_Message.unreachable));
});

test("testAnUnreadableAnswerIsNotShownAsResults", () => {
  assertEqual(FoodSearch.outcome({ status: 200, data: "<html>", query: "skyr" }), FoodSearchOutcome.failed(FoodSearch_Message.unreachable));
});

/**
 * Picking a result logs what 100 g of it is worth, exactly as the
 * server gave it.
 */
test("testPickingAResultLogsItsOwnValues", () => {
  const outcome = FoodSearch.outcome({ status: 200, data: skyr, query: "skyr" });
  const boni = outcome.kind === "found" ? outcome.value[outcome.value.length - 1] : undefined;
  if (boni === undefined) throw new Error("expected results");
  const draft = FoodSearch.portion({ of: boni, grams: 100 });
  assertEqual(draft.name, "Skyr naturel");
  assertEqual(draft.calories, 63);
  assertEqual(draft.protein, 11);
  assertEqual(draft.carbs, 3.8);
  assertEqual(draft.fat, 0.2);
  assertEqual(draft.amount, 100);
  assertEqual(draft.unit, "g");
});
