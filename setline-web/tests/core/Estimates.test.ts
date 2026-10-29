// Port of ios/SetlineCore/Tests/SetlineCoreTests/EstimatesTests.swift.
//
// The table lives in `tests/fixtures/one-rep-max.json` and is read by the web
// app's own test as well, so a formula that changes on one side only fails on
// the other.
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertEqual, assertGreaterThan, assertLessThanOrEqual, assertNil, assertNotNil, assertFalse } from "../helpers";
import { Fixtures } from "./Fixtures";
import { Estimates } from "../../src/core/Engine/Estimates";
import { dec } from "../../src/core/Support/swift";

interface Fixture {
  tolerance: number;
  cases: { weightKg: number; reps: number; e1RM: number; roundedHalfKg: number }[];
  refused: { weightKg: number; reps: number }[];
}

function fixture(t: { skip: (msg: string) => void }): Fixture | undefined {
  const root = Fixtures.repoRoot;
  if (root === undefined) {
    t.skip("Repository root not found");
    return undefined;
  }
  return JSON.parse(readFileSync(join(root, "tests/fixtures/one-rep-max.json"), "utf8")) as Fixture;
}

describe("EstimatesTests", () => {
  test("testTheSharedTableIsWhatThisAppComputes", (t) => {
    const f = fixture(t);
    if (f === undefined) return;
    assertFalse(f.cases.length === 0);

    for (const entry of f.cases) {
      const estimate = Estimates.e1RM({ weightKg: entry.weightKg, reps: entry.reps });
      assertNotNil(estimate, `${entry.weightKg} × ${entry.reps} has an estimate`);
      const difference = Math.abs(dec(estimate! - entry.e1RM));
      assertLessThanOrEqual(
        difference, f.tolerance,
        `${entry.weightKg} kg × ${entry.reps}: computed ${estimate}, fixture says ${entry.e1RM}`,
      );
      assertEqual(
        Estimates.round(estimate!, { toIncrement: 0.5 }), entry.roundedHalfKg,
        `${entry.weightKg} kg × ${entry.reps} reads as ${entry.roundedHalfKg} on screen`,
      );
    }
  });

  test("testWhatTheSharedTableRefusesIsRefusedHereToo", (t) => {
    const f = fixture(t);
    if (f === undefined) return;
    for (const entry of f.refused) {
      assertNil(Estimates.e1RM({ weightKg: entry.weightKg, reps: entry.reps }), `${entry.weightKg} × ${entry.reps} is not an estimate`);
    }
  });

  // MARK: - The shape of the formula

  test("testASingleIsWorthExactlyWhatWasLifted", () => {
    // Epley's old answer here was 103,3 kg for a 100 kg single — an
    // estimate above a weight that was actually lifted for one.
    assertEqual(Estimates.e1RM({ weightKg: 100, reps: 1 }), 100);
  });

  test("testTenRepsIsWhereBrzyckiAndEpleyAgree", () => {
    const brzycki = Estimates.e1RM({ weightKg: 100, reps: 10 });
    assertNotNil(brzycki);
    const epley = dec(100 * (1 + 10 / 30));
    assertLessThanOrEqual(Math.abs(brzycki! - epley), 0.001);
  });

  test("testTheEstimateRisesWithBothWeightAndReps", () => {
    const lighter = Estimates.e1RM({ weightKg: 100, reps: 5 })!;
    const heavier = Estimates.e1RM({ weightKg: 105, reps: 5 })!;
    const longer = Estimates.e1RM({ weightKg: 100, reps: 6 })!;
    assertGreaterThan(heavier, lighter);
    assertGreaterThan(longer, lighter);
  });

  test("testAboveTenRepsTheAppSaysNothingRatherThanSomethingFlattering", () => {
    assertNotNil(Estimates.e1RM({ weightKg: 60, reps: 10 }));
    assertNil(Estimates.e1RM({ weightKg: 60, reps: 11 }));
    assertNil(Estimates.e1RM({ weightKg: 60, reps: 20 }));
  });
});
