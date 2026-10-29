// Port of ios/SetlineCore/Tests/SetlineCoreTests/CrossClientSyncTests.swift.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { assertEqual, assertGreaterThanOrEqual, assertNil } from "../helpers";
import { Fixtures } from "./Fixtures";
import { JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { StateChange } from "../../src/core/Sync/StateChange";
import { StateMerge } from "../../src/core/Sync/StateMerge";

function unwrap<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new Error(`XCTUnwrap failed: ${message}`);
  return value;
}

/**
 * The iOS half of the cross-client sync contract.
 *
 * `tests/fixtures/sync` holds scenarios in which the web app and iOS take
 * turns writing the same state. This test runs the iOS steps; the web steps
 * run in `tests/cloud-state.test.mjs`. Each step starts from the state the
 * previous step produced, so both clients are held to one timeline.
 */
describe("CrossClientSyncTests", () => {
  const fixtureState = (name: string, afterStep: number): LegacyState => {
    const root = unwrap(Fixtures.repoRoot, "Repository root not found");
    const fixture = JSON.parse(readFileSync(join(root, `tests/fixtures/sync/${name}.json`), "utf8")) as JSONValue;
    const steps = unwrap(JSONValue.arrayValue(JSONValue.get(fixture, "steps")), "steps");
    return LegacyState.make({ raw: unwrap(JSONValue.objectValue(JSONValue.get(steps[afterStep - 1], "expected")), "expected") });
  };

  test("testEverySharedFixtureIOSSteps", (t) => {
    const root = Fixtures.repoRoot;
    if (root === undefined) {
      t.skip("Repository root not found");
      return;
    }
    const directory = join(root, "tests/fixtures/sync");
    const files = readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort();
    assertGreaterThanOrEqual(files.length, 10, "the shared fixtures are present");

    let iosSteps = 0;
    for (const file of files) {
      const fixture = JSON.parse(readFileSync(join(directory, file), "utf8")) as JSONValue;
      const name = JSONValue.stringValue(JSONValue.get(fixture, "name")) ?? file;
      let state: JSONValue | undefined;

      (JSONValue.arrayValue(JSONValue.get(fixture, "steps")) ?? []).forEach((step, index) => {
        const label = `${file} step ${index + 1}: ${name}`;
        const expected = unwrap(JSONValue.get(step, "expected"), label);
        try {
          if (JSONValue.stringValue(JSONValue.get(step, "client")) !== "ios") return;

          const input = unwrap(JSONValue.objectValue(JSONValue.get(step, "remote") ?? state), `${label} has no input state`);
          const nowText = JSONValue.stringValue(JSONValue.get(step, "now"));
          const now = unwrap(nowText === undefined ? undefined : LegacyAdapter.isoDate(nowText), label);
          const changes = (JSONValue.arrayValue(JSONValue.get(step, "ops")) ?? []).map((op) => StateChange.decode(op));

          const result = StateMerge.apply(changes, { to: LegacyState.make({ raw: input }), now });
          assertEqual(result.raw as JSONValue, expected, label);
          iosSteps += 1;
        } finally {
          state = expected;
        }
      });
    }
    assertGreaterThanOrEqual(iosSteps, 8, "the fixtures exercise iOS, not only the web");
  });

  /**
   * After the web finishes a day iOS logged, iOS still reads every exercise
   * it logged there — the swap, the program replacement and the custom
   * exercise — with its sets exactly as written.
   */
  test("testIOSReadsItsOwnExercisesBackAfterTheWebFinishesTheDayAgain", () => {
    const state = fixtureState("web-refinish-keeps-ios-exercises", 2);
    const session = unwrap(LegacyAdapter.sessions({ from: state })[0], "session");

    assertEqual(
      session.results.map((result) => result.exerciseID),
      ["flat-bench", "incline-bench", "pec-fly", "db-bench", "chest-press-machine", "custom:landmine-press"],
    );
    assertEqual(session.results[0].sets.map((set) => set.weightKg), [102.5, 102.5], "bench press took the web's typed sets");
    assertEqual(
      session.results[3].sets.map((set) => set.substitutedFrom),
      ["flat-bench", "flat-bench"],
      "the swap still says what it stood in for",
    );
    assertEqual(session.results[3].sets.map((set) => set.origin), ["prescribed", "sessionAdded"], "and which of its sets was extra");
    assertEqual(session.results[4].sets.map((set) => set.reps), [10, 9, 8], "the program replacement");
    assertEqual(session.results[5].sets.map((set) => set.substitutedFrom), ["pec-fly", "pec-fly"], "the custom exercise");
    assertEqual(session.durationSeconds, 3120);
    assertNil(session.plannedSetCount, "the counts described the old results, so history shows the percentage");
    assertEqual(session.completion, 33);
  });

  test("testAnExerciseRemovedOnTheWebStaysRemovedForIOS", () => {
    const state = fixtureState("web-edit-removal-is-not-resurrected", 3);
    const session = unwrap(LegacyAdapter.sessions({ from: state })[0], "session");
    assertEqual(session.results.map((result) => result.exerciseID), ["flat-bench", "incline-bench"]);
  });
});
