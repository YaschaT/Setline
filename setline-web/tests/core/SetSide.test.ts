// Port of ios/SetlineCore/Tests/SetlineCoreTests/SetSideTests.swift
// (SetSideTests, SetIntensityTests and SideRepsTests).
import { describe, test } from "node:test";
import { DropStep, LoggedSet, SetSide, SideReps } from "../../src/core/Domain/Model";
import { SetFlags } from "../../src/core/Domain/Vocabulary";
import { RecordsEngine } from "../../src/core/Engine/RecordsEngine";
import { JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { ProgressOverview } from "../../src/core/Progress/ProgressOverview";
import { SetCorrection } from "../../src/core/Sync/SetCorrection";
import { assertEqual, assertNil, assertTrue } from "../helpers";

function unwrap<T>(value: T | undefined): T {
  if (value === undefined || value === null) throw new Error("XCTUnwrap failed");
  return value;
}

/** `JSONEncoder().encode` then `JSONDecoder().decode`: through the bytes. */
function roundTripThroughBytes(set: LoggedSet): LoggedSet {
  return LoggedSet.decode(JSON.parse(JSON.stringify(LoggedSet.encode(set))) as JSONValue);
}

/** The side of a one-sided set travels with the set, and never doubles it. */
describe("SetSideTests", () => {
  function set(side: SetSide | undefined): LoggedSet {
    return LoggedSet.make({ index: 0, weightKg: 30, reps: 10, origin: "prescribed", side });
  }

  test("testTheSideSurvivesTheSharedWireFormat", () => {
    for (const side of SetSide.allCases) {
      const written = LegacyAdapter.jsonValueSet(set(side));
      assertEqual(JSONValue.stringValue(JSONValue.get(written, "side")), side);
      const readBack = unwrap(LegacyAdapter.loggedSet({ from: written, index: 0 }));
      assertEqual(readBack.side, side);
    }
  });

  test("testNoSideWritesNoKey", () => {
    const written = LegacyAdapter.jsonValueSet(set(undefined));
    assertNil(JSONValue.get(written, "side"));
  });

  test("testTheSideSurvivesTheSessionSnapshot", () => {
    assertEqual(roundTripThroughBytes(set("L")).side, "L");
  });

  test("testBothSidesCountOnceInVolume", () => {
    assertEqual(RecordsEngine.volumeLoad([set("both")]), 300);
    assertEqual(RecordsEngine.volumeLoad([set("L"), set("R")]), 600);
  });

  test("testACorrectionKeepsTheSide", () => {
    const stored = JSONValue.objectValue(LegacyAdapter.jsonValueSet(set("R"))) ?? {};
    const corrected = SetCorrection.applied(SetCorrection.make({ exerciseID: "x", setIndex: 0, weightKg: 32.5, reps: 8 }), {
      to: stored,
    });
    assertEqual(JSONValue.stringValue(corrected["side"]), "R");
  });
});

/** To failure, failed and drop sets travel with the set. */
describe("SetIntensityTests", () => {
  test("testAFailedSetStaysFailedAfterSaving", () => {
    const set = LoggedSet.make({ index: 0, weightKg: 100, reps: 4, flags: SetFlags.failed });
    const written = LegacyAdapter.jsonValueSet(set);
    assertEqual(JSONValue.boolValue(JSONValue.get(written, "failed")), true);
    assertTrue(SetFlags.contains(unwrap(LegacyAdapter.loggedSet({ from: written, index: 0 })).flags, SetFlags.failed));
    assertNil(JSONValue.get(LegacyAdapter.jsonValueSet(LoggedSet.make({ index: 0, weightKg: 100, reps: 4 })), "failed"));
  });

  test("testToFailureIsReserveZeroAndSurvives", () => {
    const written = LegacyAdapter.jsonValueSet(LoggedSet.make({ index: 0, weightKg: 100, reps: 8, rirReported: 0 }));
    assertEqual(unwrap(LegacyAdapter.loggedSet({ from: written, index: 0 })).rirReported, 0);
  });

  test("testDropsRoundTripAndAddVolumeOnly", () => {
    const set = LoggedSet.make({
      index: 0,
      weightKg: 100,
      reps: 8,
      drops: [DropStep.make({ weightKg: 80, reps: 6 }), DropStep.make({ weightKg: 60, reps: 6 })],
    });
    const readBack = unwrap(LegacyAdapter.loggedSet({ from: LegacyAdapter.jsonValueSet(set), index: 0 }));
    assertEqual(readBack.drops, set.drops);
    assertEqual(readBack.reps, 8, "the set's own reps never take the drops in");
    assertEqual(RecordsEngine.volumeLoad([readBack]), 800 + 480 + 360);
    assertEqual(roundTripThroughBytes(set).drops.length, 2);
  });

  test("testDropsNeverMoveTheEstimate", () => {
    const plain = LoggedSet.make({ index: 0, weightKg: 100, reps: 5 });
    const dropped = { ...plain, drops: [DropStep.make({ weightKg: 70, reps: 12 })] };
    assertEqual(ProgressOverview.bestOf({ of: [plain] })?.weightKg, ProgressOverview.bestOf({ of: [dropped] })?.weightKg);
    assertEqual(LoggedSet.countsTowardProgression(dropped), LoggedSet.countsTowardProgression(plain));
  });
});

/** Reps per side within one two-sided set. */
describe("SideRepsTests", () => {
  function set(left: number, right: number): LoggedSet {
    const sides = SideReps.make({ left, right });
    return LoggedSet.make({ index: 0, weightKg: 20, reps: SideReps.weaker(sides), side: "both", sideReps: sides });
  }

  test("testTheSidesRoundTripAndTheSetCountsAsTheWeakerSide", () => {
    const readBack = unwrap(LegacyAdapter.loggedSet({ from: LegacyAdapter.jsonValueSet(set(8, 7)), index: 0 }));
    assertEqual(readBack.sideReps, SideReps.make({ left: 8, right: 7 }));
    assertEqual(readBack.reps, 7);
    assertEqual(readBack.sideReps ? SideReps.label(readBack.sideReps) : undefined, "L 8 · R 7");
  });

  test("testVolumeTakesTheAverageSoEqualSidesCountOnce", () => {
    assertEqual(RecordsEngine.volumeLoad([set(8, 6)]), 140);
    assertEqual(
      RecordsEngine.volumeLoad([set(8, 8)]),
      RecordsEngine.volumeLoad([LoggedSet.make({ index: 0, weightKg: 20, reps: 8, side: "both" })]),
    );
  });

  test("testACorrectionThatChangesTheRepsDropsTheSides", () => {
    const stored = JSONValue.objectValue(LegacyAdapter.jsonValueSet(set(8, 7))) ?? {};
    const kept = SetCorrection.applied(SetCorrection.make({ exerciseID: "x", setIndex: 0, weightKg: 22, reps: 7 }), {
      to: stored,
    });
    assertEqual(JSONValue.stringValue(kept["repsLeft"]), "8", "same reps: the sides stay");
    const changed = SetCorrection.applied(SetCorrection.make({ exerciseID: "x", setIndex: 0, weightKg: 20, reps: 10 }), {
      to: stored,
    });
    assertNil(changed["repsLeft"]);
    assertNil(changed["repsRight"]);
  });
});
