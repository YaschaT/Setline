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

const { completedReps, pausedReps, boundPausedReps, setSummary } =
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
