import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// The reps of a logged set, read the way both clients read them. The same
// fixture is checked on the iOS side in `PausedRepsTests.swift`, so a change
// to the rule that only lands here fails there.
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

const { completedReps, pausedReps, boundPausedReps, setSummary, setExecution, sameExecution } =
  await vite.ssrLoadModule("/lib/set-reps.ts");

const set = (reps, paused, extra = {}) => ({
  weight: "120",
  reps: String(reps),
  pausedReps: paused === null ? "" : String(paused),
  ...extra,
});

test("the reps of a set are the reps performed, paused ones included", () => {
  assert.equal(completedReps(set(6, null)), 6, "6 reps, none paused");
  assert.equal(completedReps(set(6, 2)), 6, "6 reps, 2 paused — not 8");
  assert.equal(completedReps(set(6, 6)), 6, "6 reps, all paused — not 12");
});

test("the paused count says how many of those reps carried the pause", () => {
  assert.equal(pausedReps(set(6, null)), 0);
  assert.equal(pausedReps(set(6, 2)), 2);
  assert.equal(pausedReps(set(6, 6)), 6);
  assert.equal(pausedReps(set(6, 9)), 6, "never more of them than were performed");
  assert.equal(pausedReps({ reps: "", pausedReps: "4" }), 0, "reps nobody recorded describe nothing");
});

test("volume counts the reps of a set once", () => {
  const sets = [set(6, null), set(6, 2), set(6, 6)];
  const volume = sets.reduce((total, row) => total + Number(row.weight) * completedReps(row), 0);
  assert.equal(volume, 2160, "three sets of six at 120 kg, however their reps were performed");
});

test("a paused count is brought back inside the reps as they are typed", () => {
  assert.deepEqual(boundPausedReps(set(6, 2)), set(6, 2), "a count within the reps is left alone");
  assert.equal(boundPausedReps(set(6, 9)).pausedReps, "6");
  assert.equal(boundPausedReps(set(3, 4)).pausedReps, "3", "lowering the reps brings the count with it");
  assert.equal(
    boundPausedReps({ weight: "120", reps: "", pausedReps: "2" }).pausedReps,
    "2",
    "typed before the reps, it waits for them",
  );
});

test("history reads a set as what was performed", () => {
  assert.equal(setSummary(set(6, null)), "6 reps");
  assert.equal(setSummary(set(6, 2, { pauseSeconds: "2" })), "6 reps · 2 paused · 2s");
  assert.equal(setSummary(set(6, 6)), "6 reps · 6 paused");
  assert.equal(setSummary(set(9, 1)), "9 reps · 1 paused", "the account's own second paused row");
});

test("the shared fixture reads identically here and on iOS", async () => {
  const fixture = JSON.parse(
    await readFile(path.join(root, "tests/fixtures/paused-reps.json"), "utf8"),
  );
  const sets = fixture.sets;
  const expected = fixture.expected;

  assert.deepEqual(sets.map((row) => completedReps(row)), expected.completedReps);
  assert.deepEqual(sets.map((row) => pausedReps(row)), expected.pausedReps);
  assert.equal(
    sets.reduce((total, row) => total + completedReps(row), 0),
    expected.totalReps,
  );
  assert.equal(
    sets.reduce((total, row) => total + Number(row.weight) * completedReps(row), 0),
    expected.volumeKg,
  );
  assert.equal(
    sets.filter((row) => Number(row.weight) > 0 && completedReps(row) > 0).length,
    expected.loggedSets,
    "each paused set is one set",
  );
});

// How a set was performed decides what it may be measured against. The same
// readings are checked on iOS in `BestSetComparisonTests.swift`.
const row = (reps, paused, extra = {}) => ({
  weight: "120",
  reps: String(reps),
  pausedReps: paused === null ? "" : String(paused),
  pauseSeconds: paused === null ? "" : "2",
  pauseEnabled: paused !== null,
  ...extra,
});

test("a set is touch-and-go, paused, or mixed — and six reps stay six", () => {
  assert.deepEqual(setExecution(row(6, null)), { kind: "touch-and-go", pausedReps: 0, pauseSeconds: null });
  const mixed = row(6, 2);
  assert.deepEqual(setExecution(mixed), { kind: "mixed", pausedReps: 2, pauseSeconds: 2 });
  assert.equal(completedReps(mixed), 6, "6 reps with 2 paused is six reps, not eight");
  assert.deepEqual(setExecution(row(6, 6)), { kind: "paused", pausedReps: 6, pauseSeconds: 2 });
  assert.deepEqual(
    setExecution(row(6, null, { pauseEnabled: true, pauseSeconds: "2" })),
    { kind: "paused", pausedReps: 6, pauseSeconds: 2 },
    "the pause flag without a count is the native app's paused set",
  );
  assert.equal(setExecution(row(5, 5, { pauseSeconds: "" })).pauseSeconds, 2, "a pause without a length is 2 s");
});

test("only sets performed the same way are measured against each other", () => {
  const same = (a, b) => sameExecution(setExecution(a), setExecution(b));
  assert.equal(same(row(5, null), row(8, null)), true, "touch-and-go against touch-and-go");
  assert.equal(same(row(5, 5), row(8, null, { pauseEnabled: true, pauseSeconds: "2" })), true, "paused against paused");
  assert.equal(same(row(5, null), row(5, 5)), false, "touch-and-go against paused");
  assert.equal(same(row(6, 2), row(6, null)), false, "a mixed set against touch-and-go");
  assert.equal(same(row(6, 2), row(6, 6)), false, "a mixed set against a paused one");
  assert.equal(same(row(6, 2), row(6, 4)), false, "a mixed set against a different mix");
  assert.equal(same(row(6, 2), row(8, 2)), true, "the same mix");
  assert.equal(same(row(5, 5), row(5, 5, { pauseSeconds: "3" })), false, "2 s against 3 s");
  assert.equal(same(row(5, 5), row(5, 5, { pauseSeconds: "2,5" })), true, "within half a second");
});

test("the shared best-set fixture reads identically here and on iOS", async () => {
  const fixture = JSON.parse(
    await readFile(path.join(root, "tests/fixtures/best-set-comparison.json"), "utf8"),
  );
  for (const [index, { row: stored, expected }] of fixture.sets.entries()) {
    const execution = setExecution(stored);
    assert.deepEqual(
      [completedReps(stored), execution.kind, execution.pausedReps, execution.pauseSeconds],
      [expected.reps, expected.kind, expected.pausedReps, expected.pauseSeconds],
      `set ${index}`,
    );
  }
  for (const { sets: [a, b], expected, why } of fixture.comparable) {
    const [left, right] = [fixture.sets[a].row, fixture.sets[b].row].map(setExecution);
    assert.equal(sameExecution(left, right), expected, why);
  }
});
