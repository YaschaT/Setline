// Port of ios/SetlineCore/Tests/SetlineCoreTests/FoodSearchContractTests.swift.
//
// One search, ranked once, on the server.
//
// `tests/fixtures/food-search/skyr.json` records what `/api/food-search`
// answers for a query; `tests/food-search.test.mjs` proves the endpoint
// produces exactly that, through either door. This is the other end: what
// this app makes of the same bytes, which must be the same products in the
// same order, because it has no ranking of its own to apply.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { FoodSearch } from "../../src/core/Nutrition/FoodSearch";
import { charCount } from "../../src/core/Support/nutrition";
import { assertEqual, assertFalse, assertNil, assertTrue } from "../helpers";
import { Fixtures } from "./Fixtures";

/** The fixture, or undefined after skipping the test (XCTSkip). */
function fixture(t: TestContext): { expected: string; query: string } | undefined {
  const root = Fixtures.repoRoot;
  if (root === undefined) {
    t.skip("Repository root not found");
    return undefined;
  }
  const object = JSON.parse(readFileSync(join(root, "tests/fixtures/food-search/skyr.json"), "utf8")) as Record<string, unknown>;
  const expected = object["expected"];
  const query = object["query"];
  if (expected === undefined || typeof query !== "string") {
    t.skip("Fixture is not in the expected shape");
    return undefined;
  }
  return { expected: JSON.stringify(expected), query };
}

test("testTheServersRankingIsWhatTheAppShows", (t) => {
  const f = fixture(t);
  if (!f) return;
  const products = FoodSearch.results({ from: f.expected });

  assertEqual(products.map((p) => p.name), ["Magere skyr", "Skyr naturel", "Skyr nature"]);
  assertEqual(products.map((p) => p.brand), ["Generiek", "Boni", "Yoplait"]);
  assertEqual(products[0]?.id, "generic-magere-skyr-0");
});

test("testEveryValueArrivesAsTheServerSentIt", (t) => {
  const f = fixture(t);
  if (!f) return;
  const belgian = FoodSearch.results({ from: f.expected }).find((p) => p.id === "off-5400141000009");
  if (belgian === undefined) throw new Error("XCTUnwrap failed");

  assertEqual(belgian.calories, 63);
  assertEqual(belgian.protein, 11);
  assertEqual(belgian.carbs, 3.8);
  assertEqual(belgian.fat, 0.2);
  assertEqual(belgian.note, "Belgisch product · per 100 g", "the server's own words, not ours");
});

test("testTheQueryGoesToTheSharedEndpoint", (t) => {
  const f = fixture(t);
  if (!f) return;
  assertEqual(FoodSearch.path({ for: f.query }), "/api/food-search?q=skyr");
});

test("testAQueryIsTrimmedToWhatTheServerAccepts", () => {
  const long = "a".repeat(200);
  assertEqual(charCount(FoodSearch.path({ for: long })), "/api/food-search?q=".length + 80);
});

test("testGenericOnlyAnswersAreMarkedAsPartial", (t) => {
  const partial = `
  {"results":[{"id":"generic-banaan-0","name":"Banaan","brand":"Generiek","calories":89,
   "protein":1.1,"carbs":22.8,"fat":0.3,"source":"Generiek","sourceNote":"Gemiddelde schatting per 100 g"}],
   "partial":true,"query":"banaan","disclaimer":"x"}`;
  assertTrue(FoodSearch.isPartial(partial));
  assertEqual(FoodSearch.results({ from: partial }).length, 1);

  const f = fixture(t);
  if (!f) return;
  assertFalse(FoodSearch.isPartial(f.expected));
});

test("testTheServersOwnRefusalIsWhatTheReaderIsTold", () => {
  const refusal = `{"error":"QUERY_TOO_SHORT","message":"Typ minstens twee tekens."}`;
  assertEqual(FoodSearch.message({ from: refusal }), "Typ minstens twee tekens.");
});

// MARK: Portions, which are this app's own arithmetic

test("testAPortionIsScaledFromTheHundredGramValues", (t) => {
  const f = fixture(t);
  if (!f) return;
  const skyr = FoodSearch.results({ from: f.expected })[0];
  if (skyr === undefined) throw new Error("XCTUnwrap failed");
  const draft = FoodSearch.portion({ of: skyr, grams: 250 });

  // The name is the food and the amount is its own field: 42a writes
  // them apart, and 42d needs the number back to change it.
  assertEqual(draft.name, "Magere skyr");
  assertEqual(draft.amount, 250);
  assertEqual(draft.unit, "g");
  assertEqual(draft.calories, 158);
  assertEqual(draft.protein, 27.5);
  assertEqual(draft.carbs, 9.5);
  assertEqual(draft.fat, 0.5);
});

test("testNoPortionIsNoNumbers", (t) => {
  const f = fixture(t);
  if (!f) return;
  const skyr = FoodSearch.results({ from: f.expected })[0];
  if (skyr === undefined) throw new Error("XCTUnwrap failed");
  const draft = FoodSearch.portion({ of: skyr, grams: 0 });

  assertEqual(draft.name, "Magere skyr");
  assertEqual(draft.calories, 0);
  assertNil(draft.amount);
  assertNil(draft.unit);
});
