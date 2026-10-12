import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// The meal scan's server half: what Gemini is asked, and what is kept of its
// answer. SetlineCore decodes the same answer shape in MealScanServiceTests.

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

const scan = await vite.ssrLoadModule("/lib/meal-scan.ts");

function gemini(answer, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }),
    };
  };
  return { fetchImpl, calls };
}

const stoofvlees = {
  say: "Stoofvlees with fries and mayo, a Belgian classic!",
  items: [
    { name: "Stoofvlees", grams: 250, calories: 420, protein: 38, carbs: 12, fat: 22, confidence: "high" },
    { name: "Fries", grams: 180, calories: 560, protein: 6, carbs: 70, fat: 28, confidence: "medium" },
    { name: "", grams: 10, calories: 1, protein: 0, carbs: 0, fat: 0, confidence: "high" },
  ],
  question: { text: "Was there mayonnaise with the fries?", options: ["Yes, a spoon", "Yes, a lot", "No"] },
};

test("the photo goes first, the conversation after, and the key stays in a header", async () => {
  const { fetchImpl, calls } = gemini(stoofvlees);
  await scan.scanMeal(
    { image: "aGVsbG8=", text: "lunch", turns: [{ role: "assistant", text: "Mayo?" }, { role: "user", text: "No" }] },
    { kind: "google", apiKey: "secret-key", model: "gemini-flash-latest" },
    fetchImpl,
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /models\/gemini-flash-latest:generateContent$/);
  assert.doesNotMatch(calls[0].url, /secret-key/);
  assert.equal(calls[0].init.headers["x-goog-api-key"], "secret-key");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.contents[0].parts[0].inline_data.data, "aGVsbG8=");
  assert.match(body.contents[0].parts[1].text, /Tally: Mayo\?\nUser: No\nUser: lunch/);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
});

test("nameless rows are dropped and the question is kept", async () => {
  const { fetchImpl } = gemini(stoofvlees);
  const outcome = await scan.scanMeal({ image: "aGVsbG8=" }, { kind: "google", apiKey: "k", model: "m" }, fetchImpl);
  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body.items.map((item) => item.name), ["Stoofvlees", "Fries"]);
  assert.equal(outcome.body.question.options.length, 3);
});

test("a question with one option is no question", () => {
  const answer = scan.parseAnswer({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ say: "x", items: [], question: { text: "Oil?", options: ["Yes"] } }) }] } }],
  });
  assert.equal(answer.question, null);
});

test("without a key it says so instead of guessing", async () => {
  const outcome = await scan.scanMeal({ text: "pizza" }, null);
  assert.equal(outcome.status, 503);
  assert.equal(outcome.body.error, "SCAN_NOT_CONFIGURED");
});

test("the free tier running out reads as busy", async () => {
  const { fetchImpl } = gemini({}, 429);
  const outcome = await scan.scanMeal({ text: "pizza" }, { kind: "google", apiKey: "k", model: "m" }, fetchImpl);
  assert.equal(outcome.status, 429);
});

test("a request needs a photo or words", () => {
  assert.equal(scan.validRequest({}), null);
  assert.equal(scan.validRequest({ text: " " }), null);
  assert.ok(scan.validRequest({ text: "2 eggs" }));
  assert.equal(scan.validRequest({ image: "data:image/jpeg;base64,aGVsbG8=" }).image, "aGVsbG8=");
});

test("without a Google key the gateway is used with the project's own token", async () => {
  const provider = scan.providerFor({}, "oidc-token");
  assert.equal(provider.kind, "gateway");
  assert.equal(provider.model, "google/gemini-3.8-flash");
  assert.equal(scan.providerFor({ GEMINI_API_KEY: "g" }, "oidc-token").kind, "google");
  assert.equal(scan.providerFor({}, null), null);

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(stoofvlees) } }] }) };
  };
  const outcome = await scan.scanMeal({ image: "aGVsbG8=", text: "dinner" }, provider, fetchImpl);
  assert.equal(outcome.status, 200);
  assert.equal(outcome.body.items.length, 2);
  assert.equal(calls[0].url, "https://ai-gateway.vercel.sh/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer oidc-token");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.messages[1].content[0].image_url.url, "data:image/jpeg;base64,aGVsbG8=");
  assert.deepEqual(body.response_format.json_schema.schema.properties.question.type, ["object", "null"]);
});
