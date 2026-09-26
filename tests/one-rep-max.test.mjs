import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// The estimated 1RM, computed the way both clients compute it. The same
// fixture is checked on the iOS side in `EstimatesTests.swift`, so a formula
// that changes only here fails there.
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});
after(() => vite.close());

const { estimate1RM, MAX_REPS_FOR_ESTIMATE } = await vite.ssrLoadModule("/lib/one-rep-max.ts");
const fixture = JSON.parse(
  await readFile(path.join(root, "tests/fixtures/one-rep-max.json"), "utf8"),
);

test("the shared table is what this app computes", () => {
  assert.ok(fixture.cases.length > 0, "the fixture has cases");
  for (const entry of fixture.cases) {
    const estimate = estimate1RM(entry.weightKg, entry.reps);
    assert.notEqual(estimate, null, `${entry.weightKg} × ${entry.reps} has an estimate`);
    assert.ok(
      Math.abs(estimate - entry.e1RM) <= fixture.tolerance,
      `${entry.weightKg} kg × ${entry.reps}: computed ${estimate}, fixture says ${entry.e1RM}`,
    );
    assert.equal(
      Math.round(estimate * 2) / 2,
      entry.roundedHalfKg,
      `${entry.weightKg} kg × ${entry.reps} reads as ${entry.roundedHalfKg} on screen`,
    );
  }
});

test("what the shared table refuses is refused here too", () => {
  for (const entry of fixture.refused) {
    assert.equal(
      estimate1RM(entry.weightKg, entry.reps),
      null,
      `${entry.weightKg} × ${entry.reps} is not an estimate (${entry.why})`,
    );
  }
});

test("a single is worth exactly what was lifted", () => {
  // Epley's old answer here was 103,3 kg for a 100 kg single.
  assert.equal(estimate1RM(100, 1), 100);
});

test("ten reps is where Brzycki and Epley agree", () => {
  const brzycki = estimate1RM(100, 10);
  const epley = 100 * (1 + 10 / 30);
  assert.ok(Math.abs(brzycki - epley) <= 0.001, `${brzycki} vs ${epley}`);
});

test("above ten reps the app says nothing rather than something flattering", () => {
  assert.equal(MAX_REPS_FOR_ESTIMATE, 10);
  assert.notEqual(estimate1RM(60, 10), null);
  assert.equal(estimate1RM(60, 11), null);
  assert.equal(estimate1RM(60, 20), null);
});

test("junk in is nothing out, never NaN", () => {
  for (const [weight, reps] of [
    [Number.NaN, 5],
    [100, Number.NaN],
    [Number.POSITIVE_INFINITY, 5],
    [-100, 5],
    [100, -5],
  ]) {
    assert.equal(estimate1RM(weight, reps), null, `${weight} × ${reps}`);
  }
});
