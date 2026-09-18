import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// One search, two doors. These cover the shared implementation and prove the
// Vercel door — the one iOS uses — puts nothing of its own on top of it.
// SetlineCore decodes the same fixture in FoodSearchContractTests.swift.

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

const search = await vite.ssrLoadModule("/lib/food-search.ts");

// The Vercel door, which is the one iOS knocks on.

process.env.AUTH_SECRET ??= "test-secret-at-least-thirty-two-characters";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-key";

const endpoint = await vite.ssrLoadModule("/api/food-search.ts");
const authCore = await vite.ssrLoadModule("/lib/auth-core.ts");

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/food-search/skyr.json", import.meta.url), "utf8"),
);

function upstream(payload, { ok = true } = {}) {
  return async () => ({ ok, status: ok ? 200 : 503, json: async () => payload });
}

test("the shared search ranks a query the way the fixture records it", async () => {
  const outcome = await search.searchFood(fixture.query, upstream(fixture.upstream));
  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, fixture.expected);
});

test("a product with no name, no energy or an impossible energy is not offered", async () => {
  const outcome = await search.searchFood("skyr", upstream(fixture.upstream));
  assert.ok(outcome.body.results.every((product) => product.name && product.calories > 0 && product.calories <= 1200));
});

test("Belgian products come before the rest", async () => {
  const outcome = await search.searchFood("skyr", upstream(fixture.upstream));
  const fromOpenFoodFacts = outcome.body.results.filter((product) => product.source === "Open Food Facts");
  assert.deepEqual(fromOpenFoodFacts.map((product) => product.name), ["Skyr naturel", "Skyr nature"]);
});

test("the same product is never listed twice", async () => {
  const outcome = await search.searchFood("skyr", upstream({
    products: [
      { code: "a", product_name: "Magere skyr", brands: "Generiek", nutriments: { "energy-kcal_100g": 63 } },
    ],
  }));
  assert.equal(outcome.body.results.filter((product) => search.normalized(product.name) === "magere skyr").length, 1);
});

test("at most fifteen results", async () => {
  const outcome = await search.searchFood("skyr", upstream({
    products: Array.from({ length: 40 }, (_, index) => ({
      code: `p${index}`,
      product_name: `Skyr ${index}`,
      nutriments: { "energy-kcal_100g": 100 },
    })),
  }));
  assert.equal(outcome.body.results.length, search.MAX_RESULTS);
});

test("one letter is not a search", async () => {
  const outcome = await search.searchFood("s", upstream(fixture.upstream));
  assert.equal(outcome.status, 400);
  assert.equal(outcome.body.error, "QUERY_TOO_SHORT");
});

test("when the database cannot be reached the generic foods still answer", async () => {
  const outcome = await search.searchFood("skyr", async () => {
    throw new Error("offline");
  });
  assert.equal(outcome.status, 200);
  assert.equal(outcome.body.partial, true);
  assert.deepEqual(outcome.body.results.map((product) => product.name), ["Magere skyr"]);
});

test("a query nothing generic matches, with the database down, is an honest failure", async () => {
  const outcome = await search.searchFood("zzzz", async () => {
    throw new Error("offline");
  });
  assert.equal(outcome.status, 502);
  assert.equal(outcome.body.error, "FOOD_SEARCH_ERROR");
});

test("the endpoint asks the search index that still answers", async () => {
  const endpoint = search.endpointFor("skyr");
  assert.equal(endpoint.origin, "https://search.openfoodfacts.org");
  assert.equal(endpoint.searchParams.get("q"), "skyr");
  assert.equal(endpoint.searchParams.get("lang"), "nl");
  assert.equal(endpoint.searchParams.get("page_size"), String(search.MAX_RESULTS));
});

test("a brand arrives as a list on the index and as text on the older APIs", async () => {
  const asList = await search.searchFood("skyr", upstream({
    hits: [{ code: "1", product_name: "Skyr", brands: ["Boni", "Colruyt"], nutriments: { "energy-kcal_100g": 63 } }],
  }));
  const asText = await search.searchFood("skyr", upstream({
    products: [{ code: "1", product_name: "Skyr", brands: "Boni, Colruyt", nutriments: { "energy-kcal_100g": 63 } }],
  }));
  const brand = (outcome) => outcome.body.results.find((product) => product.id === "off-1").brand;
  assert.equal(brand(asList), "Boni");
  assert.equal(brand(asText), "Boni", "the older shape still reads");
});

test("a product with no brand at all is still offered", async () => {
  const outcome = await search.searchFood("skyr", upstream({
    hits: [{ code: "1", product_name: "Skyr", nutriments: { "energy-kcal_100g": 63 } }],
  }));
  assert.equal(outcome.body.results.find((product) => product.id === "off-1").brand, "Merk onbekend");
});


/** Answers as Supabase for the token check and as Open Food Facts for the search. */
function world({ validToken = null } = {}) {
  return async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      const sent = (init?.headers?.Authorization ?? "").replace("Bearer ", "");
      return sent && sent === validToken
        ? { ok: true, status: 200, json: async () => ({ email: "Yascha@Setline.be" }) }
        : { ok: false, status: 401, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => fixture.upstream };
  };
}

async function ask(headers, options) {
  const original = globalThis.fetch;
  globalThis.fetch = world(options);
  try {
    const response = await endpoint.default(
      new Request(`https://youfit-app.vercel.app/api/food-search?q=${fixture.query}`, { headers }),
    );
    return { status: response.status, body: await response.json() };
  } finally {
    globalThis.fetch = original;
  }
}

test("nobody gets a search without saying who they are", async () => {
  const answer = await ask({});
  assert.equal(answer.status, 401);
  assert.equal(answer.body.error, "UNAUTHENTICATED");
});

test("iOS is let in by its Supabase token, and gets the fixture's ranking unchanged", async () => {
  const answer = await ask({ authorization: "Bearer real-token" }, { validToken: "real-token" });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, fixture.expected);
});

test("a token Supabase does not recognise is not a way in", async () => {
  const answer = await ask({ authorization: "Bearer stolen" }, { validToken: "real-token" });
  assert.equal(answer.status, 401);
});

test("the web app keeps the cookie it already has, and gets the same answer", async () => {
  const token = await authCore.createSessionToken("yascha@setline.be", process.env.AUTH_SECRET);
  const answer = await ask({ cookie: `${authCore.SESSION_COOKIE_NAME}=${token}` });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, fixture.expected, "same backend, same ranking, whichever door");
});
