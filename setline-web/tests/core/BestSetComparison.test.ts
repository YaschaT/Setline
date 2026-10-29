// Port of ios/SetlineCore/Tests/SetlineCoreTests/BestSetComparisonTests.swift
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ExerciseResult, LoggedSet, TrainingSession } from "../../src/core/Domain/Model";
import { SetExecution } from "../../src/core/Domain/SetExecution";
import { SetModifiers } from "../../src/core/Domain/Vocabulary";
import { JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { ProgressOverview, type ProgressOverview_RecentBest } from "../../src/core/Progress/ProgressOverview";
import { dateFrom } from "../../src/core/Support/calendar";
import { assertEqual, assertNil, assertTrue, assertFalse } from "../helpers";
import { Fixtures } from "./Fixtures";

function unwrap<T>(value: T | undefined | null, message?: string): T {
  if (value === undefined || value === null) throw new Error(message ?? "XCTUnwrap failed");
  return value;
}

/**
 * Best sets state a change only against an earlier set performed the same way.
 *
 * Measured against an earlier paused best, a touch-and-go bench read as kilos
 * of progress that were only the pause coming off. The strongest set is still
 * the one shown; its change waits for a fair comparison, and a lift trained
 * before in another way is not "nieuw" either.
 */
describe("BestSetComparisonTests", () => {
  // The calendar is Europe/Brussels: the TZ the tests run in.

  /** The window opens on 1 August; July is before it, September inside it. */
  const since = dateFrom({ year: 2026, month: 8, day: 1 });

  function day(d: number, a: { month: number }): Date {
    return dateFrom({ year: 2026, month: a.month, day: d, hour: 18 });
  }

  /**
   * `paused`: none is touch-and-go, all of the reps a paused set, fewer a
   * mixed set — written the way this app writes each of them.
   */
  function set(weight: number, reps: number, a: { paused?: number; seconds?: number } = {}): LoggedSet {
    const seconds = a.seconds ?? 2;
    const pausing = (a.paused ?? 0) > 0;
    return LoggedSet.make({
      index: 0,
      weightKg: weight,
      reps,
      modifiers: SetModifiers.make({ pauseEnabled: pausing, pauseSeconds: pausing ? seconds : undefined }),
      pausedReps: LoggedSet.pausedRepsWithin(a.paused, { reps }),
    });
  }

  function bench(date: Date, sets: LoggedSet[]): TrainingSession {
    const seconds = date.getTime() / 1000;
    return TrainingSession.make({
      id: `bench-${seconds}${Number.isInteger(seconds) ? ".0" : ""}`,
      date,
      dayID: "upper",
      dayLabel: "Upper",
      completion: 100,
      kind: "workout",
      results: [ExerciseResult.make({ exerciseID: "bench", name: "Bankdrukken", sets })],
    });
  }

  function best(sessions: TrainingSession[]): ProgressOverview_RecentBest {
    return unwrap(ProgressOverview.bestSets({ in: sessions, since })[0]);
  }

  // MARK: - Like with like

  test("testTouchAndGoIsComparedWithTouchAndGo", () => {
    // 100 × 5 estimates 112,5; 95 × 5 estimates 106,9.
    const row = best([bench(day(1, { month: 7 }), [set(95, 5)]), bench(day(10, { month: 9 }), [set(100, 5)])]);
    assertEqual(row.delta, 5.5);
    assertTrue(row.hasEarlierBest);

    // An earlier paused set, heavier still, is left out rather than winning
    // the comparison: against it this read 0.
    const alsoPaused = best([
      bench(day(1, { month: 7 }), [set(95, 5), set(100, 5, { paused: 5 })]),
      bench(day(10, { month: 9 }), [set(100, 5)]),
    ]);
    assertEqual(alsoPaused.delta, 5.5);
  });

  test("testPausedIsComparedWithPaused", () => {
    const row = best([
      bench(day(1, { month: 7 }), [set(85, 5, { paused: 5 })]),
      bench(day(10, { month: 9 }), [set(90, 5, { paused: 5 })]),
    ]);
    assertEqual(row.delta, 5.5);
  });

  test("testTouchAndGoIsNotComparedWithPaused", () => {
    // Against the paused 90 × 5 this read "+11,5 kg": the pause coming off.
    const row = best([
      bench(day(1, { month: 7 }), [set(90, 5, { paused: 5 })]),
      bench(day(10, { month: 9 }), [set(100, 5)]),
    ]);
    assertEqual(row.weightKg, 100, "the strongest set is still the one shown");
    assertNil(row.delta);
    assertTrue(row.hasEarlierBest, "trained before, only not this way: not new either");

    const reverse = best([
      bench(day(1, { month: 7 }), [set(100, 5)]),
      bench(day(10, { month: 9 }), [set(90, 5, { paused: 5 })]),
    ]);
    assertNil(reverse.delta);
  });

  test("testAPauseOfAnotherLengthIsAnotherExecution", () => {
    const row = best([
      bench(day(1, { month: 7 }), [set(90, 5, { paused: 5, seconds: 3 })]),
      bench(day(10, { month: 9 }), [set(92.5, 5, { paused: 5, seconds: 2 })]),
    ]);
    assertNil(row.delta, "§9.2: the same pause length, ±0.5 s");
  });

  test("testAMixedSetIsNotComparedWithAnyOtherExecution", () => {
    const earlier = bench(day(1, { month: 7 }), [set(115, 6), set(110, 6, { paused: 6 }), set(115, 6, { paused: 4 })]);
    const row = best([earlier, bench(day(10, { month: 9 }), [set(120, 6, { paused: 2 })])]);
    assertEqual(row.weightKg, 120, "shown as the set it was");
    assertNil(row.delta, "not against touch-and-go, a paused set, or four paused reps");
    assertTrue(row.hasEarlierBest);

    const sameMix = best([
      bench(day(1, { month: 7 }), [set(115, 6, { paused: 2 })]),
      bench(day(10, { month: 9 }), [set(120, 6, { paused: 2 })]),
    ]);
    assertEqual(sameMix.delta, 6, "two paused reps against two paused reps");
  });

  test("testSixRepsWithTwoPausedStaySixReps", () => {
    const mixed = set(120, 6, { paused: 2 });
    assertEqual(mixed.reps, 6);
    assertEqual(LoggedSet.execution(mixed), SetExecution.make({ kind: "mixed", pausedReps: 2, pauseSeconds: 2 }));

    const shown = best([bench(day(10, { month: 9 }), [mixed])]);
    assertEqual(shown.reps, 6, "the row says × 6, not × 8");

    // Read as eight reps, 110 × 6 would estimate 136,6 and outrank 115 × 6
    // at 133,5; as the six reps it was, it estimates 127,7.
    const ranked = best([bench(day(10, { month: 9 }), [set(110, 6, { paused: 2 }), set(115, 6)])]);
    assertEqual(ranked.weightKg, 115);
    assertEqual(ranked.reps, 6);
  });

  test("testAnExerciseNewInTheWindowIsStillNew", () => {
    const row = best([bench(day(10, { month: 9 }), [set(100, 5)])]);
    assertNil(row.delta);
    assertFalse(row.hasEarlierBest);
  });

  // MARK: - The same rule on both clients

  /**
   * `tests/fixtures/best-set-comparison.json` is read by the web app too
   * (`tests/set-reps.test.mjs`, `tests/setline-log.test.mjs`), through the
   * same stored rows, so the rule cannot change on one side only.
   */
  test("testTheSharedFixtureReadsIdenticallyHereAndOnTheWeb", (t) => {
    const root = Fixtures.repoRoot;
    if (root === undefined) return t.skip("Repository root not found");
    const fixture = JSON.parse(readFileSync(join(root, "tests/fixtures/best-set-comparison.json"), "utf8")) as JSONValue;

    const entries = unwrap(JSONValue.arrayValue(JSONValue.get(fixture, "sets")));
    const sets = entries.map((entry, index) =>
      unwrap(LegacyAdapter.loggedSet({ from: unwrap(JSONValue.get(entry, "row")), index })),
    );
    entries.forEach((entry, index) => {
      const expected = unwrap(JSONValue.get(entry, "expected"));
      const execution = LoggedSet.execution(sets[index]);
      assertEqual(sets[index].reps, JSONValue.intValue(JSONValue.get(expected, "reps")), `set ${index}`);
      assertEqual(execution.kind, JSONValue.stringValue(JSONValue.get(expected, "kind")), `set ${index}`);
      assertEqual(execution.pausedReps, JSONValue.intValue(JSONValue.get(expected, "pausedReps")), `set ${index}`);
      assertEqual(execution.pauseSeconds, JSONValue.doubleValue(JSONValue.get(expected, "pauseSeconds")), `set ${index}`);
    });
    for (const pair of unwrap(JSONValue.arrayValue(JSONValue.get(fixture, "comparable")))) {
      const indices = unwrap(JSONValue.arrayValue(JSONValue.get(pair, "sets"))).flatMap((v) => {
        const i = JSONValue.intValue(v);
        return i === undefined ? [] : [i];
      });
      assertEqual(
        SetExecution.isComparable(LoggedSet.execution(sets[indices[0]]), { to: LoggedSet.execution(sets[indices[1]]) }),
        JSONValue.boolValue(JSONValue.get(pair, "expected")),
        JSONValue.stringValue(JSONValue.get(pair, "why")) ?? "",
      );
    }

    for (const item of unwrap(JSONValue.arrayValue(JSONValue.get(fixture, "cases")))) {
      const name = JSONValue.stringValue(JSONValue.get(item, "name")) ?? "?";
      const sessions = unwrap(JSONValue.arrayValue(JSONValue.get(item, "sessions"))).map((value, index) => {
        const rows = unwrap(JSONValue.arrayValue(JSONValue.get(value, "sets")));
        return TrainingSession.make({
          id: `${name}-${index}`,
          date: unwrap(LegacyAdapter.isoDate(unwrap(JSONValue.stringValue(JSONValue.get(value, "date"))))),
          dayID: "upper",
          dayLabel: "Upper",
          completion: 100,
          kind: "workout",
          results: [
            ExerciseResult.make({
              exerciseID: "bench",
              name: "Bankdrukken",
              sets: rows.flatMap((row, rowIndex) => {
                const s = LegacyAdapter.loggedSet({ from: row, index: rowIndex });
                return s ? [s] : [];
              }),
            }),
          ],
        });
      });
      const row = unwrap(ProgressOverview.bestSets({ in: sessions, since })[0], name);
      const expected = unwrap(JSONValue.get(item, "expected"));
      assertEqual(row.weightKg, JSONValue.decimalValue(JSONValue.get(expected, "weight")), name);
      assertEqual(row.reps, JSONValue.intValue(JSONValue.get(expected, "reps")), name);
      assertEqual(row.delta, JSONValue.decimalValue(JSONValue.get(expected, "delta")), name);
      assertEqual(row.hasEarlierBest, JSONValue.boolValue(JSONValue.get(expected, "hasEarlierBest")), name);
    }
  });
});
