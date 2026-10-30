import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// The arithmetic behind the SETLINE logging screen: what a set starts at, the
// plates on the bar, the planned rest and the weekly numbers on Progressie.
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});
after(() => vite.close());

const {
  formatKg,
  formatThousands,
  parseRestSeconds,
  formatClock,
  platesPerSide,
  describePlates,
  defaultSetValues,
  summarizeSets,
  estimateSessionMinutes,
  isoWeek,
  weeklyVolume,
  bestSetsSince,
  trailingAverage,
} = await vite.ssrLoadModule("/lib/setline-log.ts");

const set = (weight, reps) => ({ weight: String(weight), reps: String(reps) });

test("kilograms and thousands read the Dutch way", () => {
  assert.equal(formatKg(82.5), "82,5");
  assert.equal(formatKg(85), "85");
  assert.equal(formatKg(1.25), "1,25");
  assert.equal(formatThousands(1540), "1 540");
  assert.equal(formatThousands(910), "910");
  assert.equal(formatThousands(-120), "−120");
});

test("planned rest comes from the plan's own words", () => {
  assert.equal(parseRestSeconds("4–5 min"), 240);
  assert.equal(parseRestSeconds("90 sec"), 90);
  assert.equal(parseRestSeconds("60–90 sec"), 60);
  assert.equal(parseRestSeconds("2-3 min"), 120);
  assert.equal(parseRestSeconds("1:30"), 90);
  assert.equal(parseRestSeconds("Strikt"), null);
  assert.equal(parseRestSeconds(undefined), null);
  assert.equal(formatClock(150), "2:30");
  assert.equal(formatClock(-4), "0:00");
});

test("plates per side match the design's example", () => {
  // 82,5 kg on a 20 kg bar: 31,25 a side.
  assert.deepEqual(platesPerSide(82.5, 20).plates, [20, 10, 1.25]);
  assert.equal(describePlates(82.5, 20), "1 × 20 + 1 × 10 + 1 × 1,25 per kant");
  assert.equal(describePlates(20, 20), "Alleen de stang");
  assert.equal(describePlates(15, 20), "Lichter dan de stang van 20 kg");
  assert.equal(describePlates(100, 15), "2 × 20 + 1 × 2,5 per kant");
  assert.match(describePlates(83, 20), /0,25 kg per kant past niet/);
});

test("a set starts at last session's numbers, so saving it is one tap", () => {
  const previous = [set(82.5, 8), set(82.5, 8), set(82.5, 8), set(82.5, 7)];
  assert.deepEqual(defaultSetValues({ current: [], previous, index: 0, targetReps: 8 }), {
    weight: 82.5,
    reps: 8,
    source: "previous",
  });
  // Same weight as last time: still last session's target.
  assert.equal(
    defaultSetValues({ current: [set(82.5, 8)], previous, index: 1, targetReps: 8 }).source,
    "previous",
  );
});

test("a correction carries over to the next set", () => {
  const previous = [set(82.5, 8), set(82.5, 8), set(82.5, 8), set(82.5, 7)];
  const next = defaultSetValues({ current: [set(82.5, 8), set(85, 8)], previous, index: 2, targetReps: 8 });
  assert.deepEqual(next, { weight: 85, reps: 8, source: "current" });
});

test("back-off sets follow last session instead of the heavier top set", () => {
  const previous = [set(120, 6), set(110, 8), set(110, 8)];
  const next = defaultSetValues({ current: [set(122.5, 6)], previous, index: 1, targetReps: 8 });
  assert.deepEqual(next, { weight: 110, reps: 8, source: "previous" });
});

test("without history only the plan's rep target is offered, never a weight", () => {
  assert.deepEqual(defaultSetValues({ current: [], previous: [], index: 0, targetReps: 10 }), {
    weight: null,
    reps: 10,
    source: "plan",
  });
  assert.deepEqual(defaultSetValues({ current: [], previous: [], index: 0, targetReps: null }), {
    weight: null,
    reps: null,
    source: "none",
  });
});

test("last session reads in one line", () => {
  assert.equal(summarizeSets([set(82.5, 8), set(82.5, 8), set(82.5, 8), set(82.5, 7)]), "82,5 kg × 8/8/8/7");
  assert.equal(summarizeSets([set(120, 6), set(110, 8)]), "120 × 6 · 110 × 8");
  assert.equal(summarizeSets([{ weight: "", reps: "" }]), "");
});

test("a session estimate adds work, rest and changeovers", () => {
  // 3 sets: 135 s work + 2 × 180 s rest + 60 s changeover = 555 s ≈ 9 min.
  assert.equal(estimateSessionMinutes([{ sets: 3, restSeconds: 180 }]), 9);
});

test("ISO weeks start on Monday", () => {
  assert.equal(isoWeek(new Date(2026, 8, 7)), 37); // Monday 7 September 2026
  assert.equal(isoWeek(new Date(2026, 8, 13)), 37); // Sunday 13 September 2026
  assert.equal(isoWeek(new Date(2026, 0, 1)), 1);
});

test("weekly volume sums weight × reps per week and ignores rest days", () => {
  const sessions = [
    { date: "2026-09-29T18:00:00.000Z", dayId: "push", dayLabel: "Push", results: [{ exerciseId: "a", name: "A", sets: [set(100, 5), set(100, 5)] }] },
    { date: "2026-09-22T18:00:00.000Z", dayId: "pull", dayLabel: "Pull", results: [{ exerciseId: "b", name: "B", sets: [set(50, 10)] }] },
    { date: "2026-09-29T08:00:00.000Z", dayId: "rest", dayLabel: "Rest day", sessionType: "recovery", results: [] },
  ];
  const weeks = weeklyVolume(sessions, "2026-09-30", 3);
  assert.deepEqual(weeks.map((week) => week.kg), [0, 500, 1000]);
  assert.equal(weeks[2].current, true);
});

test("best sets compare the window with what came before it", () => {
  const sessions = [
    { date: "2026-09-20T18:00:00.000Z", dayId: "push", dayLabel: "Push", results: [{ exerciseId: "bench", name: "Bench", sets: [set(92.5, 5)] }] },
    { date: "2026-06-01T18:00:00.000Z", dayId: "push", dayLabel: "Push", results: [{ exerciseId: "bench", name: "Bench", sets: [set(90, 5)] }] },
    { date: "2026-09-10T18:00:00.000Z", dayId: "legs", dayLabel: "Legs", results: [{ exerciseId: "squat", name: "Squat", sets: [set(140, 5)] }] },
  ];
  const rows = bestSetsSince(sessions, "2026-08-05");
  assert.deepEqual(rows.map((row) => [row.name, row.weight, row.reps, row.delta]), [
    ["Bench", 92.5, 5, 3],
    ["Squat", 140, 5, null],
  ]);
});

// The same cases run on iOS in `BestSetComparisonTests.swift`: a change is
// stated only against an earlier set performed the same way.
const comparison = JSON.parse(
  await readFile(path.join(root, "tests/fixtures/best-set-comparison.json"), "utf8"),
);
for (const { name, sessions, expected } of comparison.cases) {
  test(`best sets: ${name}`, () => {
    const rows = bestSetsSince(
      sessions.map(({ date, sets }) => ({
        date,
        dayId: "upper",
        dayLabel: "Upper",
        results: [{ exerciseId: "bench", name: "Bankdrukken", sets }],
      })),
      comparison.since,
    );
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.deepEqual(
      { weight: row.weight, reps: row.reps, delta: row.delta, hasEarlierBest: row.hasEarlierBest },
      expected,
    );
  });
}

test("the trailing average only looks back", () => {
  const averaged = trailingAverage([
    { date: "2026-09-01", value: 84 },
    { date: "2026-09-02", value: 86 },
    { date: "2026-09-20", value: 80 },
  ]);
  assert.deepEqual(averaged.map((point) => point.average), [84, 85, 80]);
});
