// Port of ios/SetlineCore/Tests/SetlineCoreTests/Phase3BTests.swift
import { describe, test } from "node:test";
import { ExerciseCatalog } from "../../src/core/Catalog/ExerciseCatalogV1";
import type { LoadTag } from "../../src/core/Domain/ExerciseAttributes";
import { Exercise, LoggedSet } from "../../src/core/Domain/Model";
import { PainFlag, PainRegion, PainTiming } from "../../src/core/Domain/PainFlag";
import { CustomExercise, ProgramReplacement, ReplacementScope } from "../../src/core/Domain/Substitution";
import type { ExerciseRole } from "../../src/core/Domain/Vocabulary";
import { ReorderPlan, ReorderPlanner } from "../../src/core/Engine/ReorderPlan";
import { SubstitutionCopy } from "../../src/core/Engine/SubstitutionCopy";
import {
  SubstitutionRanker,
  SwapContext,
  type RankedAlternative,
  type StructuralMatch,
  type SwapReason,
} from "../../src/core/Engine/SubstitutionRanking";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { addDays } from "../../src/core/Support/calendar";
import { assertEqual, assertFalse, assertNil, assertNotEqual, assertNotNil, assertTrue } from "../helpers";

const isDisjoint = <T>(a: Set<T>, b: readonly T[]) => b.every((x) => !a.has(x));

// MARK: - Reorder

describe("ReorderPlannerTests", () => {
  function item(id: string, role: ExerciseRole, started = false): { exercise: Exercise; role: ExerciseRole; hasStarted: boolean } {
    return { exercise: ExerciseCatalog.exercise(id)!, role, hasStarted: started };
  }

  const bench = ExerciseCatalog.exercise("flat-bench")!;

  test("testOffersTheNearestUnstartedLaterExercise", () => {
    const plan = ReorderPlanner.plan({
      current: bench,
      currentIndex: 0,
      later: [item("pec-fly", "isolation"), item("pressdown", "isolation")],
    });
    assertEqual(plan?.candidate.id, "pec-fly");
    assertEqual(plan?.candidateIndex, 1);
  });

  test("testSkipsExercisesAlreadyStarted", () => {
    const plan = ReorderPlanner.plan({
      current: bench,
      currentIndex: 0,
      later: [item("pec-fly", "isolation", true), item("pressdown", "isolation")],
    });
    assertEqual(plan?.candidate.id, "pressdown");
    assertEqual(plan?.candidateIndex, 2);
  });

  /** A heavy lift is not pulled out of the position it was programmed in. */
  test("testNeverPullsALaterPrimaryLiftForward", () => {
    const plan = ReorderPlanner.plan({
      current: bench,
      currentIndex: 0,
      later: [item("rdl", "primaryStrength"), item("pressdown", "isolation")],
    });
    assertEqual(plan?.candidate.id, "pressdown");
  });

  test("testNoPlanOnTheLastExercise", () => {
    assertNil(ReorderPlanner.plan({ current: bench, currentIndex: 3, later: [] }));
  });

  test("testNoPlanWhenEverythingLaterHasStarted", () => {
    const plan = ReorderPlanner.plan({
      current: bench,
      currentIndex: 0,
      later: [item("pec-fly", "isolation", true)],
    });
    assertNil(plan);
  });

  test("testHeadlineNamesBothExercises", () => {
    const plan = ReorderPlanner.plan({ current: bench, currentIndex: 0, later: [item("pec-fly", "isolation")] });
    assertEqual(plan ? ReorderPlan.headline(plan) : undefined, "Do pec fly machine now · come back to flat bench press later");
  });
});

// MARK: - Pain

describe("PainFlagTests", () => {
  const daysAgo = (days: number) => addDays(new Date(), -days);

  test("testAFlagExpiresAfterFourteenDays", () => {
    const fresh = PainFlag.make({ region: "shoulder", exerciseID: "flat-bench", date: daysAgo(3) });
    const old = PainFlag.make({ region: "shoulder", exerciseID: "flat-bench", date: daysAgo(15) });
    assertTrue(PainFlag.isActive(fresh));
    assertFalse(PainFlag.isActive(old));
    assertEqual(PainFlag.daysRemaining(fresh), 11);
    assertEqual(PainFlag.daysRemaining(old), 0);
  });

  test("testExpiredFlagsStopNarrowingTheRanking", () => {
    const old = [PainFlag.make({ region: "lowerBack", exerciseID: "rdl", date: daysAgo(20) })];
    assertTrue(PainFlag.activeLoadTags(old).size === 0);
    const fresh = [PainFlag.make({ region: "lowerBack", exerciseID: "rdl", date: daysAgo(1) })];
    assertEqual(PainFlag.activeLoadTags(fresh), new Set<LoadTag>(["axialSpinalLoad", "lumbarFlexion"]));
  });

  /** A region with no tag is still stored — it just does not filter. */
  test("testARegionWithoutTagsStillRecords", () => {
    const flags = [PainFlag.make({ region: "hip", exerciseID: "rdl" })];
    assertEqual(PainFlag.active(flags).length, 1);
    assertTrue(PainFlag.activeLoadTags(flags).size === 0);
  });

  test("testOnlyOneTimingEarnsTheFollowUpLine", () => {
    assertTrue(PainTiming.warrantsFollowUp("outsideTheGym"));
    assertFalse(PainTiming.warrantsFollowUp("duringSet"));
    assertFalse(PainTiming.warrantsFollowUp("afterTraining"));
  });

  /** The whole point of the flow: a shoulder flag changes what is offered. */
  test("testAShoulderFlagChangesTheRecommendations", () => {
    const plain = SubstitutionRanker.rank(
      SwapContext.make({ currentExerciseID: "flat-bench", role: "primaryStrength" }),
    ).map((r) => r.exercise.id);
    const painful = new Set<LoadTag>();
    for (const tags of [PainRegion.loadTags("shoulder")]) for (const tag of tags) painful.add(tag);
    const sore = SubstitutionRanker.rank(
      SwapContext.make({
        currentExerciseID: "flat-bench",
        role: "primaryStrength",
        reason: "discomfort",
        painfulLoadTags: painful,
      }),
    ).map((r) => r.exercise.id);
    assertNotEqual(plain, sore);
    assertFalse(sore.includes("db-bench"), "db-bench loads end-range shoulder");
  });
});

// MARK: - Custom exercises and program replacements

describe("CustomExerciseTests", () => {
  test("testIdentifiersAreNamespacedAndSlugged", () => {
    assertEqual(CustomExercise.make({ name: "Landmine press" }).id, "custom:landmine-press");
    assertEqual(CustomExercise.make({ name: "  Zercher  squat!! " }).id, "custom:zercher-squat");
    assertEqual(CustomExercise.make({ name: "***" }).id, "custom:oefening");
  });

  /**
   * A custom exercise must never land on a catalogue id and inherit a
   * history that is not its own.
   */
  test("testACustomIdCanNeverCollideWithTheCatalogue", () => {
    for (const id of Object.keys(ExerciseCatalog.all)) {
      assertFalse(CustomExercise.isCustom(id), `${id} looks custom`);
    }
    assertNil(ExerciseCatalog.exercise(CustomExercise.make({ name: "Flat bench press" }).id));
  });

  test("testACustomExerciseCarriesItsEquipmentIncrement", () => {
    const custom = CustomExercise.make({ name: "Landmine press", equipment: "barbell", isCompound: true });
    assertEqual(Exercise.incrementKg(CustomExercise.exercise(custom)), 2.5);
    assertTrue(CustomExercise.exercise(custom).isCompound);
  });

  test("testACustomExerciseHasNoRankingMetadata", () => {
    assertNil(CustomExercise.exercise(CustomExercise.make({ name: "Landmine press" })).attributes);
  });
});

describe("ProgramReplacementTests", () => {
  function replacement(scope: ReplacementScope): ProgramReplacement {
    return ProgramReplacement.make({
      originExerciseID: "flat-bench",
      substituteExerciseID: "db-bench",
      scope,
      dayID: "push-a",
    });
  }

  test("testThisDayReachesOnlyItsOwnDay", () => {
    assertTrue(ProgramReplacement.applies(replacement("thisDay"), { toDay: "push-a" }));
    assertFalse(ProgramReplacement.applies(replacement("thisDay"), { toDay: "push-b" }));
  });

  test("testWiderScopesReachEveryDay", () => {
    assertTrue(ProgramReplacement.applies(replacement("thisPlan"), { toDay: "push-b" }));
    assertTrue(ProgramReplacement.applies(replacement("always"), { toDay: "anything" }));
  });

  /**
   * `substitutedFrom` means "standing in for something else today". A
   * permanent replacement is not that, so the audit lives here instead —
   * origin, substitute, how far it reached, and when.
   */
  test("testTheReplacementItselfIsTheAuditRecord", () => {
    const made = new Date();
    const record = ProgramReplacement.make({
      originExerciseID: "flat-bench",
      substituteExerciseID: "db-bench",
      scope: "thisPlan",
      dayID: "push-a",
      date: made,
    });
    assertEqual(record.originExerciseID, "flat-bench");
    assertEqual(record.substituteExerciseID, "db-bench");
    assertEqual(record.dayID, "push-a");
    assertEqual(record.date, made);
  });

  /**
   * A record that has been through the state blob must still be findable.
   * Identity is the change, not the instant — the date does not survive
   * encoding intact, and matching on it made "undo" a silent no-op.
   */
  test("testARoundTrippedReplacementIsStillTheSameReplacement", () => {
    let state = LegacyState.make({ raw: {} });
    const record = ProgramReplacement.make({
      originExerciseID: "flat-bench",
      substituteExerciseID: "db-bench",
      scope: "thisDay",
      dayID: "push-a",
    });
    state = LegacyAdapter.applyProgramReplacements({ programReplacements: [record], to: state });
    const decoded = LegacyAdapter.programReplacements({ from: state })[0];
    assertEqual(decoded ? ProgramReplacement.id(decoded) : undefined, ProgramReplacement.id(record));
  });

  /**
   * Undoing a program change is deleting one row: the plan is rewritten on
   * read, so the original prescription was never destroyed.
   */
  test("testRemovingAReplacementLeavesNothingBehind", () => {
    let state = LegacyState.make({ raw: {} });
    const record = ProgramReplacement.make({
      originExerciseID: "flat-bench",
      substituteExerciseID: "db-bench",
      scope: "always",
      dayID: "push-a",
    });
    state = LegacyAdapter.applyProgramReplacements({ programReplacements: [record], to: state });
    assertEqual(LegacyAdapter.programReplacements({ from: state }).length, 1);

    const remaining = LegacyAdapter.programReplacements({ from: state }).filter(
      (r) => ProgramReplacement.id(r) !== ProgramReplacement.id(record),
    );
    state = LegacyAdapter.applyProgramReplacements({ programReplacements: remaining, to: state });
    assertTrue(LegacyAdapter.programReplacements({ from: state }).length === 0);
  });

  test("testEveryScopeHasDistinctCopy", () => {
    const labels = ReplacementScope.allCases.map(ReplacementScope.label);
    assertEqual(new Set(labels).size, labels.length);
    assertEqual(labels, ["This day only", "This plan", "Every time"]);
  });
});

// MARK: - Match language

describe("SubstitutionCopyTests", () => {
  function alternative(a: {
    score: number;
    overlap: number;
    match?: StructuralMatch;
    fit?: string;
    why?: string;
  }): RankedAlternative {
    return {
      exercise: ExerciseCatalog.exercise("db-bench")!,
      score: a.score,
      curatedFit: a.fit,
      curatedWhy: a.why,
      muscleOverlap: a.overlap,
      match: a.match ?? "exact",
      drivers: [],
    };
  }

  /** "Strong match" is a claim, so it has to clear both bars. */
  test("testStrongMatchNeedsScoreAndOverlap", () => {
    assertEqual(SubstitutionCopy.fit(alternative({ score: 0.9, overlap: 0.85 })), "Strong match");
    assertNotEqual(SubstitutionCopy.fit(alternative({ score: 0.9, overlap: 0.7 })), "Strong match");
    assertNotEqual(SubstitutionCopy.fit(alternative({ score: 0.6, overlap: 0.95 })), "Strong match");
  });

  test("testHonestLabelsStepDown", () => {
    assertEqual(SubstitutionCopy.fit(alternative({ score: 0.7, overlap: 0.7 })), "Good match");
    assertEqual(SubstitutionCopy.fit(alternative({ score: 0.5, overlap: 0.45 })), "Partly similar");
    assertEqual(SubstitutionCopy.fit(alternative({ score: 0.9, overlap: 0.9, match: "related" })), "Different movement");
    assertEqual(SubstitutionCopy.fit(alternative({ score: 0.9, overlap: 0.9, match: "broader" })), "Different setup");
  });

  test("testCuratedCopyAlwaysWins", () => {
    const curated = alternative({ score: 0.3, overlap: 0.2, fit: "Zelfde rol", why: "Handgeschreven." });
    assertEqual(SubstitutionCopy.fit(curated), "Zelfde rol");
    assertEqual(SubstitutionCopy.why(curated, { origin: ExerciseCatalog.exercise("flat-bench")! }), "Handgeschreven.");
  });

  /**
   * Three equally strong alternatives used to read identically, which told
   * the user nothing about how to choose between them.
   */
  test("testEquallyStrongAlternativesAreStillDistinguishable", () => {
    const origin = ExerciseCatalog.exercise("wide-row")!;
    const results = SubstitutionRanker.rank(SwapContext.make({ currentExerciseID: "wide-row", role: "secondaryCompound" }));
    const lines = results.map((r) => SubstitutionCopy.why(r, { origin, alongside: results }));
    assertEqual(lines.length, 3);
    assertEqual(new Set(lines).size, lines.length, `identical copy: ${lines}`);
  });

  /**
   * Every recommendation says something, and no line claims a difference
   * the app cannot actually see: where two alternatives are identical on
   * every attribute we record, both fall back to the plain line rather
   * than carrying the same distinguishing phrase.
   */
  test("testNoLineClaimsADifferenceThatIsNotThere", () => {
    const plain = "Trains the same muscles in the same movement.";
    for (const id of Object.keys(ExerciseCatalog.all)) {
      const origin = ExerciseCatalog.exercise(id);
      if (!origin) continue;
      const results = SubstitutionRanker.rank(SwapContext.make({ currentExerciseID: id, role: ExerciseCatalog.role(id) }));
      const lines = results.map((r) => SubstitutionCopy.why(r, { origin, alongside: results }));
      assertTrue(lines.every((l) => l.length > 0), `${id} produced an empty line`);
      const claiming = lines.filter((l) => l !== plain);
      assertEqual(
        new Set(claiming).size,
        claiming.length,
        `${id} gives two alternatives the same distinguishing phrase: ${lines}`,
      );
    }
  });

  /** No result anywhere may promise a converted weight. */
  test("testNoCopyPromisesAWeight", () => {
    assertEqual(SubstitutionCopy.carryOver, "Sets, reps and RIR stay · weight resets");
    const bench = ExerciseCatalog.exercise("flat-bench")!;
    for (const id of Object.keys(ExerciseCatalog.all)) {
      for (const result of SubstitutionRanker.rank(
        SwapContext.make({ currentExerciseID: id, role: ExerciseCatalog.role(id) }),
      )) {
        const line = SubstitutionCopy.why(result, { origin: bench });
        assertFalse(line.includes("kg"), `${id} → ${result.exercise.id}: ${line}`);
        assertFalse(SubstitutionCopy.fit(result).length === 0);
      }
    }
  });
});

// MARK: - Browse surface

describe("BrowseSurfaceTests", () => {
  function browse(id: string, a: { reason?: SwapReason; pain?: Set<LoadTag> } = {}): RankedAlternative[] {
    return SubstitutionRanker.browse(
      SwapContext.make({
        currentExerciseID: id,
        role: ExerciseCatalog.role(id),
        reason: a.reason ?? "preference",
        painfulLoadTags: a.pain ?? new Set<LoadTag>(),
      }),
    );
  }

  test("testBrowseIsASupersetOfTheRecommendations", () => {
    for (const id of Object.keys(ExerciseCatalog.all)) {
      const primary = new Set(
        SubstitutionRanker.rank(SwapContext.make({ currentExerciseID: id, role: ExerciseCatalog.role(id) })).map(
          (r) => r.exercise.id,
        ),
      );
      const all = new Set(browse(id).map((r) => r.exercise.id));
      assertTrue([...primary].every((x) => all.has(x)), `${id} browse lost a recommendation`);
    }
  });

  /**
   * The compounds the primary surface refuses are exactly what browse is
   * for — labelled as changing the training intent, not hidden among real
   * substitutes.
   */
  test("testBrowseSurfacesTheCompoundsThePrimaryListRefuses", () => {
    const options = browse("leg-extension");
    assertFalse(options.length === 0, "leg-extension has nothing to browse");
    assertTrue(options.some((o) => o.exercise.id === "hack-squat"));
    assertTrue(options.every((o) => o.match === "broader"));
  });

  test("testBrowseOrdersExactThenRelatedThenBroader", () => {
    for (const id of Object.keys(ExerciseCatalog.all)) {
      const tiers = browse(id).map((r) => r.match);
      const rank: Record<StructuralMatch, number> = { exact: 0, related: 1, broader: 2 };
      const ranks = tiers.map((t) => rank[t]);
      assertEqual(ranks, [...ranks].sort((a, b) => a - b), `${id} interleaves browse tiers`);
    }
  });

  /** Widening the list must never widen the safety filter. */
  test("testBrowseNeverRelaxesPain", () => {
    const sore = browse("rdl", { reason: "discomfort", pain: new Set<LoadTag>(["axialSpinalLoad", "lumbarFlexion"]) });
    for (const option of sore) {
      assertTrue(
        isDisjoint(option.exercise.attributes!.loadTags, ["axialSpinalLoad", "lumbarFlexion"]),
        `${option.exercise.id} leaked through browse`,
      );
    }
  });

  test("testBrowseNeverOffersTheExerciseItself", () => {
    for (const id of Object.keys(ExerciseCatalog.all)) {
      const canonical = SubstitutionRanker.canonical(id);
      for (const option of browse(id)) {
        assertNotEqual(SubstitutionRanker.canonical(option.exercise.id), canonical);
      }
    }
  });
});

// MARK: - Persistence

describe("Phase3PersistenceTests", () => {
  test("testPainFlagsSurviveARoundTrip", () => {
    let state = LegacyState.make({ raw: {} });
    const flags = [
      PainFlag.make({ region: "shoulder", timing: "duringSet", exerciseID: "flat-bench" }),
      PainFlag.make({ region: "knee", exerciseID: "hack-squat" }),
    ];
    state = LegacyAdapter.applyPainFlags({ painFlags: flags, to: state });
    const read = LegacyAdapter.painFlags({ from: state });
    assertEqual(read.length, 2);
    assertEqual(read[0]?.region, "shoulder");
    assertEqual(read[0]?.timing, "duringSet");
  });

  /** Expired flags leave the account rather than piling up in it. */
  test("testExpiredFlagsAreNotWritten", () => {
    let state = LegacyState.make({ raw: {} });
    const old = PainFlag.make({ region: "shoulder", exerciseID: "flat-bench", date: addDays(new Date(), -30) });
    state = LegacyAdapter.applyPainFlags({ painFlags: [old], to: state });
    assertTrue(LegacyAdapter.painFlags({ from: state }).length === 0);
  });

  test("testReplacementsAndCustomExercisesSurviveARoundTrip", () => {
    let state = LegacyState.make({ raw: {} });
    state = LegacyAdapter.applyProgramReplacements({
      programReplacements: [
        ProgramReplacement.make({
          originExerciseID: "flat-bench",
          substituteExerciseID: "db-bench",
          scope: "thisPlan",
          dayID: "push-a",
        }),
      ],
      to: state,
    });
    state = LegacyAdapter.applyCustomExercises({
      customExercises: [CustomExercise.make({ name: "Landmine press", equipment: "barbell", isCompound: true })],
      to: state,
    });

    assertEqual(LegacyAdapter.programReplacements({ from: state })[0]?.scope, "thisPlan");
    assertEqual(LegacyAdapter.customExercises({ from: state })[0]?.id, "custom:landmine-press");
  });

  /** The new keys ride alongside the web app's blob without disturbing it. */
  test("testTheWebAppsKeysAreUntouched", () => {
    let state = LegacyState.make({ raw: { sessions: [], nutrition: "keep me" } });
    state = LegacyAdapter.applyPainFlags({ painFlags: [PainFlag.make({ region: "knee", exerciseID: "hack-squat" })], to: state });
    state = LegacyAdapter.applyCustomExercises({ customExercises: [CustomExercise.make({ name: "Test" })], to: state });
    assertEqual(LegacyState.get(state, "nutrition"), "keep me");
    assertNotNil(LegacyState.get(state, "sessions"));
  });

  /**
   * A temporary swap marks its sets; a permanent replacement does not.
   * Either way the set is an ordinary set of the exercise it was logged
   * under, for volume, progression and records (§12.5).
   */
  test("testOnlyTemporarySwapsMarkTheirSets", () => {
    const swapped = LoggedSet.make({ index: 0, weightKg: 30, reps: 8, substitutedFrom: "flat-bench" });
    assertEqual(swapped.substitutedFrom, "flat-bench");
    assertTrue(LoggedSet.countsTowardVolume(swapped));
    assertTrue(LoggedSet.countsTowardProgression(swapped));

    const replaced = LoggedSet.make({ index: 0, weightKg: 30, reps: 8 });
    assertNil(replaced.substitutedFrom);
    assertTrue(LoggedSet.countsTowardVolume(replaced));
    assertTrue(LoggedSet.countsTowardProgression(replaced));
  });
});
