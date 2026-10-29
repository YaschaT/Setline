// Port of ios/SetlineCore/Tests/SetlineCoreTests/Phase3Tests.swift
// (CatalogueCompletenessTests and SubstitutionRankingTests).
import { describe, test } from "node:test";
import { AlternativesCatalog } from "../../src/core/Catalog/AlternativesCatalog";
import { GeneratedExerciseCatalog } from "../../src/core/Catalog/ExerciseCatalog";
import { ExerciseCatalog } from "../../src/core/Catalog/ExerciseCatalogV1";
import { ExerciseMetadata } from "../../src/core/Catalog/ExerciseMetadata";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { MovementPattern, type LoadTag, type Station } from "../../src/core/Domain/ExerciseAttributes";
import type { Exercise } from "../../src/core/Domain/Model";
import type { ExerciseRole } from "../../src/core/Domain/Vocabulary";
import {
  SubstitutionRanker,
  SwapContext,
  type RankedAlternative,
  type StructuralMatch,
  type SwapReason,
} from "../../src/core/Engine/SubstitutionRanking";
import {
  assertClose,
  assertEqual,
  assertFalse,
  assertGreaterThan,
  assertLessThanOrEqual,
  assertNil,
  assertNotEqual,
  assertNotNil,
  assertTrue,
} from "../helpers";

const keys = <V>(record: Record<string, V>) => Object.keys(record);
const between = (x: number, lo: number, hi: number) => lo <= x && x <= hi;

// MARK: - Catalogue completeness

describe("CatalogueCompletenessTests", () => {
  test("testCuratedCatalogueHasSixtyFiveExercises", () => {
    assertEqual(keys(ExerciseCatalog.all).length, 65);
    assertEqual(keys(GeneratedExerciseCatalog.exercises).length, 39);
    assertEqual(keys(ExerciseMetadata.additions).length, 26);
  });

  test("testAdditionsDoNotCollideWithPlannedExercises", () => {
    for (const id of keys(ExerciseMetadata.additions)) {
      assertNil(GeneratedExerciseCatalog.exercises[id], `${id} is both a plan exercise and a V1 addition`);
    }
  });

  /**
   * The rule the user set: attributes may be optional architecturally, but
   * anything the ranking can offer must be complete.
   */
  test("testEveryRecommendableExerciseHasCompleteMetadata", () => {
    for (const id of ExerciseCatalog.v1Recommendable) {
      const exercise = ExerciseCatalog.exercise(id);
      if (!exercise) throw new Error(`${id} is recommendable but not in the catalogue`);
      const attributes = exercise.attributes;
      if (!attributes) throw new Error(`${id} has no attributes`);
      assertFalse(attributes.primaryMuscles.length === 0, `${id} has no primary muscles`);
      assertFalse(attributes.jointActions.size === 0, `${id} has no joint actions`);
      assertFalse(attributes.heuristics.rationale.length === 0, `${id} carries heuristics with no stated reasoning`);
    }
  });

  test("testEveryCatalogueExerciseIsRecommendable", () => {
    // V1 authors metadata for the whole catalogue. If this ever fails, the
    // catalogue grew without its metadata — which is allowed, but then the
    // new exercise must be left out of `v1Recommendable` deliberately.
    assertEqual(new Set(keys(ExerciseCatalog.all)), ExerciseCatalog.v1Recommendable);
  });

  test("testPrimaryMuscleWeightsSumToOne", () => {
    for (const [id, exercise] of Object.entries(ExerciseCatalog.all)) {
      const attributes = exercise.attributes;
      if (!attributes) continue;
      const total = attributes.primaryMuscles.reduce((sum, m) => sum + m.weight, 0);
      assertClose(total, 1.0, 0.001, `${id} primary weights sum to ${total}`);
    }
  });

  test("testHeuristicsStayInRange", () => {
    for (const [id, exercise] of Object.entries(ExerciseCatalog.all)) {
      const h = exercise.attributes?.heuristics;
      if (!h) continue;
      assertTrue(between(h.stabilityDemand, 1, 5), `${id} stability ${h.stabilityDemand}`);
      assertTrue(between(h.fatigueCost, 1, 5), `${id} fatigue ${h.fatigueCost}`);
      assertTrue(between(h.setupCost, 1, 3), `${id} setup ${h.setupCost}`);
    }
  });

  /** The two values the user fixed by hand. */
  test("testUserFixedHeuristics", () => {
    const dips = ExerciseCatalog.exercise("dips")!.attributes!.heuristics;
    assertEqual([dips.stabilityDemand, dips.fatigueCost, dips.setupCost], [4, 3, 1]);
    const back = ExerciseCatalog.exercise("back-extension")!.attributes!.heuristics;
    assertEqual([back.stabilityDemand, back.fatigueCost, back.setupCost], [2, 2, 1]);
  });

  test("testEveryExerciseHasARole", () => {
    for (const id of keys(ExerciseCatalog.all)) {
      assertNotNil(ExerciseCatalog.roles[id], `${id} has no role`);
    }
  });

  test("testEveryPlannedExerciseResolves", () => {
    const plans = [PlanCatalog.personal, PlanCatalog.sciencePPLUL, PlanCatalog.scienceUpperLower, PlanCatalog.scienceFullBody];
    for (const days of plans) {
      for (const day of days) {
        for (const planned of day.exercises) {
          assertNotNil(
            ExerciseCatalog.exercise(planned.exerciseID),
            `${planned.exerciseID} is prescribed but not in the catalogue`,
          );
        }
      }
    }
  });

  test("testCanonicalIDsResolve", () => {
    for (const [alias, canonical] of Object.entries(ExerciseMetadata.canonicalID)) {
      assertNotNil(ExerciseCatalog.exercise(alias), `${alias} is unknown`);
      assertNotNil(ExerciseCatalog.exercise(canonical), `${canonical} is unknown`);
      assertNil(
        ExerciseMetadata.canonicalID[canonical],
        `${canonical} is itself an alias — canonical ids must be terminal`,
      );
    }
  });

  test("testCuratedNameMappingsResolve", () => {
    for (const [name, id] of Object.entries(ExerciseMetadata.curatedNameToID)) {
      assertNotNil(ExerciseCatalog.exercise(id), `${name} maps to unknown id ${id}`);
    }
  });

  /**
   * Not every curated alternative name has an exercise behind it, and that
   * is on purpose — several name variations the catalogue does not carry.
   * This test pins the number so the gap cannot widen unnoticed.
   */
  test("testCuratedCoverageIsKnown", () => {
    const names = new Set(Object.values(AlternativesCatalog.byExercise).flat().map((a) => a.name));
    const mapped = [...names].filter((name) => ExerciseMetadata.curatedNameToID[name] !== undefined);
    assertEqual(names.size, 59);
    assertEqual(mapped.length, 27);
  });
});

// MARK: - Ranking

describe("SubstitutionRankingTests", () => {
  function rank(
    id: string,
    a: { role?: ExerciseRole; reason?: SwapReason; pain?: Set<LoadTag>; familiar?: Set<string> } = {},
  ): RankedAlternative[] {
    return SubstitutionRanker.rank(
      SwapContext.make({
        currentExerciseID: id,
        role: a.role ?? ExerciseCatalog.role(id),
        reason: a.reason ?? "preference",
        painfulLoadTags: a.pain ?? new Set<LoadTag>(),
        familiarExerciseIDs: a.familiar ?? new Set<string>(),
      }),
    );
  }

  const ids = (results: RankedAlternative[]) => results.map((r) => r.exercise.id);
  const allIDs = () => keys(ExerciseCatalog.all);

  // MARK: Shape

  test("testNeverReturnsMoreThanThree", () => {
    for (const id of allIDs()) {
      assertLessThanOrEqual(rank(id).length, 3, `${id} returned too many`);
    }
  });

  /**
   * Up to three means up to three. A slot is never filled to reach a
   * count, so the only origins with nothing to offer are the ones the
   * catalogue genuinely cannot answer — and we name them, so the number
   * cannot grow unnoticed.
   */
  test("testOriginsWithNoPrimaryAlternative", () => {
    const empty = allIDs()
      .filter((id) => SubstitutionRanker.canonical(id) === id)
      .filter((id) => rank(id).length === 0);
    assertEqual(new Set(empty), new Set(["leg-extension"]));
  });

  test("testResultCountsAreHonest", () => {
    const counts = allIDs()
      .filter((id) => SubstitutionRanker.canonical(id) === id)
      .map((id) => rank(id).length);
    assertEqual(counts.filter((c) => c === 3).length, 38);
    assertEqual(counts.filter((c) => c === 2).length, 14);
    assertEqual(counts.filter((c) => c === 1).length, 5);
    assertEqual(counts.filter((c) => c === 0).length, 1);
  });

  test("testNeverRecommendsItself", () => {
    for (const id of allIDs()) {
      assertFalse(ids(rank(id)).includes(id), `${id} recommended itself`);
    }
  });

  /** The same physical exercise under a different id is not a substitution. */
  test("testNeverRecommendsTheSameExerciseUnderAnotherID", () => {
    for (const id of allIDs()) {
      const canonical = SubstitutionRanker.canonical(id);
      for (const result of rank(id)) {
        assertNotEqual(
          SubstitutionRanker.canonical(result.exercise.id),
          canonical,
          `${id} recommended ${result.exercise.id}, which is the same exercise`,
        );
      }
    }
  });

  test("testRankingIsDeterministic", () => {
    for (const id of allIDs()) {
      assertEqual(ids(rank(id)), ids(rank(id)), `${id} is not stable`);
    }
  });

  test("testNoTwoResultsShareAStation", () => {
    for (const id of allIDs()) {
      const stations = rank(id).flatMap((r) => (r.exercise.station === undefined ? [] : [r.exercise.station as Station]));
      assertEqual(new Set(stations).size, stations.length, `${id} offered one station twice`);
    }
  });

  /**
   * Exact matches come first as a block, each block ordered by score. A
   * broader alternative never outranks one that keeps the movement.
   */
  test("testResultsAreOrderedByTierThenScore", () => {
    for (const id of allIDs()) {
      const results = rank(id);
      const matches = results.map((r) => r.match);
      // `sorted { $0 == .exact && $1 == .related }`
      const sorted = [...matches].sort((x, y) =>
        x === "exact" && y === "related" ? -1 : y === "exact" && x === "related" ? 1 : 0,
      );
      assertEqual(matches, sorted, `${id} interleaves tiers`);
      for (const tier of ["exact", "related"] as StructuralMatch[]) {
        const scores = results.filter((r) => r.match === tier).map((r) => r.score);
        assertEqual(scores, [...scores].sort((x, y) => y - x), `${id} ${tier} is not ordered`);
      }
    }
  });

  // MARK: Structural eligibility

  /**
   * An isolation exercise is never answered with a compound: same muscle,
   * different training intent.
   */
  test("testIsolationOriginNeverReturnsACompound", () => {
    for (const [id, exercise] of Object.entries(ExerciseCatalog.all)) {
      const pattern = exercise.attributes?.movementPattern;
      if (!(pattern !== undefined && MovementPattern.isIsolation(pattern))) continue;
      for (const result of rank(id)) {
        const resultPattern = result.exercise.attributes?.movementPattern;
        assertEqual(
          resultPattern !== undefined ? MovementPattern.isIsolation(resultPattern) : undefined,
          true,
          `${id} offered the compound ${result.exercise.id}`,
        );
        assertFalse(result.exercise.isCompound, `${id} offered ${result.exercise.id}`);
      }
    }
  });

  /**
   * The catalogue holds no second knee-extension isolation, so the primary
   * surface is empty rather than filled with squat patterns.
   */
  test("testLegExtensionOffersNothingRatherThanSquats", () => {
    const results = ids(rank("leg-extension"));
    assertTrue(results.length === 0, `leg-extension offered ${results}`);
  });

  /** Knee flexion does not fall back to hip extension. */
  test("testSeatedCurlReturnsOnlyTheOtherLegCurl", () => {
    assertEqual(ids(rank("seated-curl")), ["lying-curl"]);
    assertEqual(ids(rank("lying-curl")), ["seated-curl"]);
  });

  /** Isolation elbow extension does not fall back to a press. */
  test("testPressdownNeverReturnsAPress", () => {
    const results = ids(rank("pressdown"));
    assertEqual(results, ["overhead-triceps", "skull-crusher"]);
    assertFalse(results.includes("dips"));
    assertFalse(results.includes("close-grip-bench"));
  });

  /**
   * The lat pulldown has four vertical pulls available; a horizontal row
   * must not take a slot from any of them.
   */
  test("testVerticalPullStaysVertical", () => {
    for (const result of rank("lat-pulldown")) {
      assertEqual(
        result.exercise.attributes?.movementPattern,
        "verticalPull",
        `lat-pulldown fell back to ${result.exercise.id}`,
      );
    }
    assertEqual(ids(rank("lat-pulldown")), ["neutral-pulldown", "pull-up", "kneeling-lat"]);
  });

  /**
   * A related match is only ever used to fill what the exact tier could
   * not — the lunge family has one other lunge, then reaches into squats.
   */
  test("testRelatedTierOnlyFillsWhatExactCannot", () => {
    const results = rank("bulgarian");
    assertEqual(results[0]?.exercise.id, "walking-lunge");
    assertEqual(results[0]?.match, "exact");
    assertTrue(results.slice(1).every((r) => r.match === "related"));
  });

  test("testARelatedMatchAlwaysStaysInTheFamily", () => {
    for (const id of allIDs()) {
      const origin = ExerciseCatalog.exercise(id)?.attributes;
      if (!origin) continue;
      for (const result of rank(id)) {
        if (result.match !== "related") continue;
        const pattern = result.exercise.attributes?.movementPattern;
        assertEqual(
          pattern !== undefined ? MovementPattern.family(pattern) : undefined,
          MovementPattern.family(origin.movementPattern),
          `${id} crossed a family to reach ${result.exercise.id}`,
        );
      }
    }
  });

  /**
   * The `Muscle` enum splits the chest, so without kinship an incline press
   * and a flat press read as unrelated exercises.
   */
  test("testRelatedMuscleGroupsCount", () => {
    assertTrue(ids(rank("incline-bench")).includes("chest-press-machine"));
    assertTrue(ids(rank("flat-bench")).includes("chest-press-machine"));
  });

  /**
   * Only canonical ids are ever offered: "Wide chest-supported row" exists
   * twice in the catalogue, and the user must not see which copy we picked.
   */
  test("testNeverOffersAnAliasID", () => {
    for (const id of allIDs()) {
      for (const result of rank(id)) {
        assertNil(ExerciseMetadata.canonicalID[result.exercise.id], `${id} offered the alias ${result.exercise.id}`);
      }
    }
  });

  /**
   * A weighted pull-up and an assisted pull-up are one answer, not two, so
   * a genuinely different option outranks the twin when one exists.
   */
  test("testANearTwinDoesNotTakeASlotFromADifferentAnswer", () => {
    // The assisted pull-up is the same answer as the weighted pull-up, so
    // with both eligible only one of them appears.
    const results = ids(rank("lat-pulldown"));
    assertTrue(results.includes("pull-up"));
    assertFalse(results.includes("assisted-pull-up"), `both pull-ups took a slot: ${results}`);
  });

  test("testThinCatalogueCornersReturnFewerRatherThanWorse", () => {
    // Three calf exercises exist. Two of them are the honest answer.
    assertEqual(ids(rank("standing-calf")), ["leg-press-calf", "seated-calf"]);
  });

  test("testUnknownExerciseReturnsNothing", () => {
    assertTrue(rank("not-an-exercise").length === 0);
  });

  // MARK: Occupied

  /**
   * The user's correction, as a test: an occupied station rules out that
   * station, not the whole equipment class.
   */
  test("testOccupiedExcludesTheSameStationOnly", () => {
    const results = rank("flat-bench", { reason: "occupied" });
    assertEqual(ids(results), ["chest-press-machine", "db-bench", "incline-machine"]);
    assertFalse(ids(results).includes("close-grip-bench"), "close-grip-bench is on the same rack and must be excluded");
    assertFalse(ids(results).length === 0);
  });

  test("testOccupiedDoesNotRemoveAnEntireEquipmentClass", () => {
    // The lat pulldown is selectorised. Another selectorised machine must
    // still be offerable — a busy pulldown says nothing about the rest.
    const results = rank("lat-pulldown", { reason: "occupied" });
    assertTrue(
      results.some((r) => r.exercise.equipment === "machineSelectorised"),
      `occupied wrongly removed every selectorised machine: ${ids(results)}`,
    );
    // The other pulldown shares the station, so it goes.
    assertFalse(ids(results).includes("neutral-pulldown"));
    assertEqual(ids(results), ["pull-up", "assisted-pull-up", "kneeling-lat"]);
  });

  /**
   * Pain can legitimately empty the primary surface: every squat pattern in
   * the catalogue bends the knee deeply, and a leg extension is a different
   * training intent rather than a squat substitute. The UI has to say so
   * instead of being handed a weak answer.
   */
  test("testPainCanLegitimatelyLeaveNothing", () => {
    assertTrue(ids(rank("hack-squat", { reason: "discomfort", pain: new Set<LoadTag>(["deepKneeFlexion"]) })).length === 0);
  });

  test("testPainNarrowsToWhatRemains", () => {
    assertEqual(
      ids(rank("rdl", { reason: "discomfort", pain: new Set<LoadTag>(["axialSpinalLoad", "lumbarFlexion"]) })),
      ["hip-thrust", "hip-thrust-machine"],
    );
  });

  test("testOccupiedPrefersDifferentEquipmentAllElseEqual", () => {
    const neutral = rank("hack-squat");
    const occupied = rank("hack-squat", { reason: "occupied" });
    const plateCountNeutral = neutral.filter((r) => r.exercise.equipment === "machinePlate").length;
    const plateCountOccupied = occupied.filter((r) => r.exercise.equipment === "machinePlate").length;
    assertLessThanOrEqual(plateCountOccupied, plateCountNeutral);
  });

  // MARK: Pain

  test("testPainExcludesTheFlaggedLoadTag", () => {
    const results = rank("rdl", { reason: "discomfort", pain: new Set<LoadTag>(["axialSpinalLoad", "lumbarFlexion"]) });
    for (const result of results) {
      const tags = result.exercise.attributes!.loadTags;
      assertFalse(tags.has("axialSpinalLoad"), `${result.exercise.id} still loads the spine`);
      assertFalse(tags.has("lumbarFlexion"), `${result.exercise.id} still flexes the lumbar spine`);
    }
  });

  test("testPainFilterIsNeverRelaxedToFillThreeSlots", () => {
    // Ask for something with a narrow pool and an aggressive pain filter.
    const flagged: LoadTag[] = ["overheadPosition", "endRangeShoulder", "axialSpinalLoad"];
    const results = rank("overhead-press", { reason: "discomfort", pain: new Set<LoadTag>(flagged) });
    for (const result of results) {
      const tags = result.exercise.attributes!.loadTags;
      assertTrue(flagged.every((t) => !tags.has(t)), `${result.exercise.id} leaked through the pain filter`);
    }
  });

  // MARK: Nudges

  test("testFamiliarityOnlyReordersWithinAGoodList", () => {
    const plain = rank("flat-bench");
    const familiar = rank("flat-bench", { familiar: new Set(["dips"]) });
    const allowed = new Set([...ids(plain), "dips"]);
    assertEqual(ids(familiar).every((id) => allowed.has(id)), true);
    const plainScore = plain.find((r) => r.exercise.id === "dips")?.score;
    const boosted = familiar.find((r) => r.exercise.id === "dips")?.score;
    if (plainScore !== undefined && boosted !== undefined) assertGreaterThan(boosted, plainScore);
  });

  // MARK: Curated copy

  test("testCuratedCopyIsAttachedWhereItExists", () => {
    const results = rank("flat-bench");
    const dumbbell = results.find((r) => r.exercise.id === "db-bench");
    assertNotNil(dumbbell?.curatedWhy);
    assertEqual(dumbbell?.curatedFit, "Same role");
  });

  test("testResultsWithoutCuratedCopyStillRank", () => {
    // Something whose curated names we deliberately did not map.
    const results = rank("hammer-curl");
    assertFalse(results.length === 0);
  });

  // MARK: Graceful degradation

  test("testMissingMetadataSimplyRemovesACandidate", () => {
    const catalog: Record<string, Exercise> = { ...ExerciseCatalog.all };
    catalog["db-bench"] = { ...catalog["db-bench"], attributes: undefined };
    const results = SubstitutionRanker.rank(
      SwapContext.make({ currentExerciseID: "flat-bench", role: "primaryStrength" }),
      { catalog },
    );
    assertFalse(ids(results).includes("db-bench"));
    assertFalse(results.length === 0, "one missing candidate must not empty the list");
  });

  test("testExerciseWithoutAttributesOffersNothing", () => {
    const catalog: Record<string, Exercise> = { ...ExerciseCatalog.all };
    catalog["flat-bench"] = { ...catalog["flat-bench"], attributes: undefined };
    const results = SubstitutionRanker.rank(
      SwapContext.make({ currentExerciseID: "flat-bench", role: "primaryStrength" }),
      { catalog },
    );
    assertTrue(results.length === 0);
  });

  // MARK: Sample outputs
  //
  // These pin the eight examples from the approved proposal. They are the
  // product review surface: if a change to the weights moves one of these,
  // that is a product decision, not a refactor.

  test("testSampleOutputs", () => {
    const expected: Record<string, string[]> = {
      "flat-bench": ["chest-press-machine", "db-bench", "close-grip-bench"],
      "incline-bench": ["incline-machine", "db-incline", "chest-press-machine"],
      "lat-pulldown": ["neutral-pulldown", "pull-up", "kneeling-lat"],
      "neutral-row": ["t-bar-row", "seated-cable-row", "wide-row"],
      "leg-press": ["smith-squat", "hack-squat", "goblet-squat"],
      rdl: ["db-rdl", "hip-thrust", "hip-thrust-machine"],
      "strict-curl": ["ez-curl", "incline-db-curl", "cable-curl"],
      // Only four triceps-isolation exercises exist, so this one is
      // honestly two options rather than a padded three.
      pressdown: ["overhead-triceps", "skull-crusher"],
    };
    for (const id of Object.keys(expected).sort()) {
      assertEqual(ids(rank(id)), expected[id], `top 3 for ${id} changed`);
    }
  });
});
