// Port of ios/SetlineCore/Tests/SetlineCoreTests/PlateMathTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertFalse, assertNil, assertTrue } from "../helpers";
import { PlateMath } from "../../src/core/Engine/PlateMath";

describe("PlateMathTests", () => {
  test("testAnExactLoadIsGivenExactly", () => {
    const solution = PlateMath.solve({ target: 50 });
    assertEqual(solution.perSide, [15]);
    assertEqual(solution.total, 50);
    assertTrue(solution.isExact);
  });

  test("testHeaviestPlatesGoOnFirst", () => {
    assertEqual(PlateMath.solve({ target: 105 }).perSide, [20, 20, 2.5]);
    assertEqual(PlateMath.solve({ target: 55 }).perSide, [15, 2.5]);
  });

  test("testAWeightThePlatesCannotMakeBecomesTheClosestTheyCan", () => {
    const solution = PlateMath.solve({ target: 51 });
    assertEqual(solution.total, 50);
    assertFalse(solution.isExact);

    assertEqual(PlateMath.solve({ target: 52 }).total, 52.5, "the nearest, not the one below");
  });

  test("testTheBarAloneIsAnAnswer", () => {
    const solution = PlateMath.solve({ target: 20 });
    assertTrue(solution.perSide.length === 0);
    assertEqual(solution.total, 20);
    assertTrue(solution.isExact);
  });

  test("testNothingLighterThanTheBarIsOffered", () => {
    assertEqual(PlateMath.solve({ target: 10 }).total, 20);
    assertTrue(PlateMath.nearby({ target: 20 }).every((x) => x >= 20));
  });

  test("testTheFiddlyPlateIsNamedOnlyWhenYouCanLeaveItAlone", () => {
    assertEqual(PlateMath.solve({ target: 50 }).unused, 1.25, "15 a side, so the 1,25 stays in the rack");
    assertEqual(PlateMath.solve({ target: 100 }).unused, 1.25);
    assertNil(PlateMath.solve({ target: 52.5 }).unused, "16,25 a side needs it");
  });

  test("testWithoutTheSmallestPlatesTheStepsGetBigger", () => {
    const solution = PlateMath.solve({ target: 51, plates: [20, 15, 10, 5] });
    assertEqual(solution.total, 50, "5 kg plates move in tens");
    assertEqual(PlateMath.solve({ target: 56, plates: [20, 15, 10, 5] }).total, 60);
  });

  test("testTheNearbyRowIsWhatThePlatesCanMake", () => {
    assertEqual(PlateMath.nearby({ target: 50 }), [47.5, 50, 52.5, 55]);
  });

  test("testADifferentBarChangesEverything", () => {
    const solution = PlateMath.solve({ target: 60, bar: 15 });
    assertEqual(solution.total, 60);
    assertEqual(solution.perSide, [20, 2.5]);
  });
});
