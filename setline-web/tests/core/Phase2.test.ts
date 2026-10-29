// Port of ios/SetlineCore/Tests/SetlineCoreTests/Phase2Tests.swift.
import { describe, test } from "node:test";
import {
  assertClose, assertEqual, assertFalse, assertLessThan, assertNil, assertTrue,
} from "../helpers";
import { Fixtures } from "./Fixtures";
import { ExerciseCatalog } from "../../src/core/Catalog/ExerciseCatalogV1";
import { Exercise, ExerciseResult, LoggedSet, PlannedExercise, SetPrescription, TrainingSession } from "../../src/core/Domain/Model";
import { SetFlags, SetModifiers } from "../../src/core/Domain/Vocabulary";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { Calibration } from "../../src/core/Engine/Calibration";
import { ExerciseAppearance, ExerciseHistory } from "../../src/core/Engine/ExerciseHistory";
import { ProgressionEngine } from "../../src/core/Engine/ProgressionEngine";
import { RecordType, RecordsEngine, ExerciseRecord } from "../../src/core/Engine/RecordsEngine";
import { SetDelta, SetGridMode, SetRowPresenter } from "../../src/core/Engine/SetRowPresentation";
import { WarmupPlanner, WarmupPlanner_Context } from "../../src/core/Engine/WarmupPlanner";
import { NumberInput } from "../../src/core/Engine/NumberDisplay";
import { closedRange } from "../../src/core/Support/range";
import { addDays } from "../../src/core/Support/calendar";
import { dec, rounded } from "../../src/core/Support/swift";

// MARK: - Calibration

describe("CalibrationTests", () => {
  const bench = () => ExerciseCatalog.exercise("flat-bench")!;

  function history(sessions: number): ExerciseHistory {
    const all = Array.from({ length: sessions }, (_x, index) =>
      Fixtures.session({ id: `s${index}`, daysAgo: (index + 1) * 3, exerciseID: "flat-bench", sets: [{ weight: 100, reps: 6, rir: 1 }] }),
    );
    return ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: all });
  }

  /**
   * Calibration is for "nothing to compare against", not "not enough to
   * compare against". One session is a reference being built, and last
   * week's weight is a perfectly good prefill.
   */
  test("testCalibrationOnlyAppliesWithNoHistoryAtAll", () => {
    assertTrue(Calibration.isNeeded({ history: history(0) }));
    assertFalse(Calibration.isNeeded({ history: history(1) }));
    assertFalse(Calibration.isNeeded({ history: history(3) }));
  });

  test("testThePromptNamesTheTargetAndProposesNoWeight", () => {
    const prompt = Calibration.prompt({ for: bench() });
    assertEqual(prompt.targetReps, 8);
    assertEqual(prompt.targetRIR, 2);
    assertTrue(prompt.headline.includes("8 reps"));
    assertTrue(prompt.headline.includes("2 in reserve"));
    assertFalse(prompt.headline.includes("kg"), "It must not suggest a weight");
    assertEqual(prompt.contextLabel, "No history");
  });

  test("testASwappedInExerciseSaysWhatItIsDifferentFrom", () => {
    const prompt = Calibration.prompt({ for: bench(), substitutedFrom: "squat" });
    assertTrue(prompt.body.includes("a different exercise from squat"), prompt.body);
    assertTrue(Calibration.prompt({ for: bench() }).body.includes("nothing to compare with yet"));
  });

  test("testRemainingSetsPrefillFromTheCalibrationSet", () => {
    const set = LoggedSet.make({ index: 0, weightKg: 80, reps: 8, rirReported: 2 });
    const prefill = Calibration.prefill({ after: set, exercise: bench() });
    assertEqual(prefill.weightKg, 80);
    assertFalse(prefill.steppedUp);
  });

  /**
   * §12.3's cheap extra: clearly easy means the next set may start one
   * increment higher — within the same exercise, which is legitimate.
   */
  test("testAnEasyCalibrationSetStepsTheNextSetUpByOneIncrement", () => {
    const easy = LoggedSet.make({ index: 0, weightKg: 80, reps: 8, rirReported: 3 });
    const prefill = Calibration.prefill({ after: easy, exercise: bench() });
    assertEqual(prefill.weightKg, 82.5, "One barbell increment, not a converted estimate");
    assertTrue(prefill.steppedUp);
  });

  test("testNoStepUpWithoutAnRIR", () => {
    const set = LoggedSet.make({ index: 0, weightKg: 80, reps: 8, rirReported: undefined });
    assertFalse(Calibration.prefill({ after: set, exercise: bench() }).steppedUp);
  });

  /**
   * The whole safety question: a calibration set is logged while the
   * three-session gate is shut, so it cannot become a record or a proposal.
   */
  test("testACalibrationSetCannotBecomeARecordOrAProposal", () => {
    const empty = history(0);
    const calibration = [LoggedSet.make({ index: 0, weightKg: 200, reps: 8, rirReported: 2 })];

    const record = RecordsEngine.record({ for: calibration, history: empty });
    assertEqual(record?.type, RecordType.sessionBest);
    assertTrue(record?.headline.startsWith("Building a reference") === true);
    assertEqual(record?.buildsReference, true);
    assertLessThan(record ? ExerciseRecord.rank(record) : 0, RecordType.sessionBest, "A reference being built ranks below every record");

    assertFalse(
      RecordsEngine.isLoadPR({ set: calibration[0], history: empty, earlierInSession: [] }),
      "A first-ever set is not a personal record",
    );

    const planned = PlannedExercise.make({
      exerciseID: "flat-bench", role: "secondaryCompound", sets: [SetPrescription.make({ repRange: closedRange(6, 8) })],
    });
    assertEqual(ProgressionEngine.proposal({ planned, exercise: bench(), history: empty }).tone, "noReference");
  });

  test("testTheGridSwitchesToCalibrationAndThenToItsBaseline", () => {
    const empty = history(0);
    const sets = [LoggedSet.make({ index: 0 }), LoggedSet.make({ index: 1 }), LoggedSet.make({ index: 2 })];

    const pending = SetRowPresenter.rows({
      sets, reference: undefined, history: empty, activeIndex: 0, mode: SetGridMode.calibrationPending,
    });
    assertEqual(pending[0].delta, SetDelta.calibration);
    assertEqual(pending[1].weightLabel, "follows from set 1");
    assertEqual(pending[1].weightKind, "awaitingCalibration");
    assertEqual(pending[0].weightKind, "missing");

    // Artboard 28: every open row shows what it aims at — set 1 the
    // calibration target, the rest their own prescription.
    const aimed = SetRowPresenter.rows({
      sets, reference: undefined, history: empty, activeIndex: 0,
      mode: SetGridMode.calibrationPending, targetReps: [6, 8, 8],
    });
    assertEqual(aimed.map((r) => r.repsLabel), ["8", "8", "8"]);
    assertTrue(aimed.every((r) => r.repsIsTarget));
    const unprescribed = SetRowPresenter.rows({
      sets, reference: undefined, history: empty, activeIndex: 0, mode: SetGridMode.calibrationPending,
    });
    assertEqual(unprescribed.map((r) => r.repsLabel), ["8", "·", "·"]);

    const baseline = LoggedSet.make({ index: 0, weightKg: 80, reps: 8 });
    const after = SetRowPresenter.rows({
      sets: [baseline, LoggedSet.make({ index: 1, weightKg: 80 }), LoggedSet.make({ index: 2, weightKg: 80 })],
      reference: undefined, history: empty, activeIndex: 1, mode: SetGridMode.calibrated({ baseline }),
    });
    assertEqual(after[0].delta, SetDelta.baseline);
    assertEqual(after[1].delta, SetDelta.reference("80 × 8"));
  });
});

// MARK: - Reference gate copy

describe("ReferenceGateCopyTests", () => {
  const gate = "After three comparable sessions, SETLINE can show reliable progression suggestions and records.";

  test("testTheProposalAndTheRecordSayTheSameThing", () => {
    const history = ExerciseHistory.make({ exerciseID: "flat-bench", modifiers: SetModifiers.none, appearances: [] });
    const planned = PlannedExercise.make({
      exerciseID: "flat-bench", role: "secondaryCompound", sets: [SetPrescription.make({ repRange: closedRange(6, 8) })],
    });

    const proposal = ProgressionEngine.proposal({ planned, exercise: ExerciseCatalog.exercise("flat-bench")!, history });
    assertEqual(proposal.body, gate);
    assertEqual(proposal.headline, "Building a reference · session 1 of 3");

    const record = RecordsEngine.record({ for: [LoggedSet.make({ index: 0, weightKg: 100, reps: 6 })], history });
    assertEqual(record?.detail, gate);
  });

  /** The counter has to keep up with the sessions behind it. */
  test("testTheCounterCountsUpAndStopsAtThree", () => {
    for (let sessions = 0; sessions <= 4; sessions++) {
      const appearances = Array.from({ length: sessions }, (_x, i) =>
        ExerciseAppearance.make({ date: new Date((1_788_000_000 - i * 86_400) * 1000), sets: [] }),
      );
      const history = ExerciseHistory.make({ exerciseID: "x", modifiers: SetModifiers.none, appearances });
      assertEqual(ExerciseHistory.referenceSessionNumber(history), Math.min(sessions + 1, 3));
      assertEqual(ExerciseHistory.hasReference(history), sessions >= 3);
    }
  });
});

// MARK: - Paused and partial

describe("PausedAndPartialTests", () => {
  const pausedPlan = PlannedExercise.make({
    exerciseID: "upper-paused-bench",
    role: "primaryStrength",
    sets: Array.from({ length: 3 }, () => SetPrescription.make({ repRange: closedRange(4, 6), targetRIR: closedRange(1, 2) })),
    modifiers: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 }),
  });

  function session(a: { id: string; daysAgo: number; exerciseID: string; modifiers: SetModifiers; reps: number }): TrainingSession {
    const date = addDays(new Date(), -a.daysAgo);
    const sets = Array.from({ length: 3 }, (_x, i) =>
      LoggedSet.make({ index: i, weightKg: 100, reps: a.reps, rirReported: 1, modifiers: a.modifiers }),
    );
    return TrainingSession.make({
      id: a.id, date, dayID: "upper", dayLabel: "Upper", completion: 100,
      results: [ExerciseResult.make({ exerciseID: a.exerciseID, name: a.exerciseID, sets })],
    });
  }

  /** A planned paused exercise is its own series and progresses inside it. */
  test("testAPlannedPausedExerciseProgressesWithinItsOwnSeries", () => {
    const pause = SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 });
    const sessions = [0, 1, 2].map((i) =>
      session({ id: `p${i}`, daysAgo: (i + 1) * 3, exerciseID: "upper-paused-bench", modifiers: pause, reps: 6 }),
    );
    const history = ExerciseHistory.build({ exerciseID: "upper-paused-bench", modifiers: pause, from: sessions });

    assertEqual(history.appearances.length, 3, "Paused sets are comparable to other paused sets");
    const proposal = ProgressionEngine.proposal({
      planned: pausedPlan,
      exercise: ExerciseCatalog.exercise("upper-paused-bench")!,
      history,
    });
    assertEqual(proposal.tone, "ready", "A planned paused lift must be able to progress");
  });

  /**
   * An ad-hoc pause on a normally-unpaused exercise puts that set outside
   * the series, so it never influences that exercise's progression.
   */
  test("testAnAdHocPauseDropsOutOfTheNormalSeries", () => {
    const normal = [0, 1].map((i) =>
      session({ id: `n${i}`, daysAgo: (i + 1) * 3, exerciseID: "flat-bench", modifiers: SetModifiers.none, reps: 8 }),
    );
    const adHoc = [session({
      id: "a", daysAgo: 9, exerciseID: "flat-bench",
      modifiers: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 }), reps: 8,
    })];

    const history = ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: [...normal, ...adHoc] });
    assertEqual(history.appearances.length, 2, "The paused session is not part of the unpaused series");
    assertFalse(ExerciseHistory.hasReference(history), "And it does not count toward the three");
  });

  test("testPauseLengthsMustMatchToBeComparable", () => {
    const two = SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 });
    assertTrue(SetModifiers.isComparable(two, { to: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2.4 }) }));
    assertFalse(SetModifiers.isComparable(two, { to: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 3 }) }));
    assertFalse(SetModifiers.isComparable(two, { to: SetModifiers.none }));
  });

  /**
   * The rule that outranks everything: a paused rep is never added onto
   * the rep count. A set performed paused throughout carries no count —
   * the modifier already says so — and stays a normal set inside its own
   * paused series.
   */
  test("testPausedSetsCarryNoSeparateRepCount", () => {
    const paused = LoggedSet.make({
      index: 0, weightKg: 100, reps: 6,
      modifiers: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 }),
    });
    assertEqual(paused.reps, 6);
    assertNil(paused.pausedReps, "Every rep paused is the modifier's job, not a count's");
    assertTrue(LoggedSet.countsTowardProgression(paused), "Within its own series it is a normal set");
    assertTrue(LoggedSet.countsTowardVolume(paused));

    const partly = LoggedSet.make({
      index: 1, weightKg: 100, reps: 6,
      modifiers: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 }),
      pausedReps: LoggedSet.pausedRepsWithin(2, { reps: 6 }),
    });
    assertEqual(partly.reps, 6, "Still six reps: the count is inside them");
    assertEqual(partly.pausedReps, 2);
    assertFalse(LoggedSet.countsTowardProgression(partly), "Comparable to neither series");
    assertTrue(LoggedSet.countsTowardVolume(partly));
  });

  /**
   * Partial reps are a count beside the reps, excluded from progression,
   * still part of volume (§5, and 16R).
   */
  test("testPartialRepsCountForVolumeButNotProgression", () => {
    const partial = LoggedSet.make({ index: 0, weightKg: 100, reps: 8, flags: SetFlags.partialReps, partialReps: 3 });
    assertEqual(partial.reps, 8, "The partials are not inside the rep count");
    assertFalse(LoggedSet.countsTowardProgression(partial));
    assertTrue(LoggedSet.countsTowardVolume(partial));
    assertEqual(RecordsEngine.volumeLoad([partial]), 800);
  });

  test("testTheRowTellsPausedAndPartialApartByWordAndCount", () => {
    const history = ExerciseHistory.make({ exerciseID: "flat-bench", modifiers: SetModifiers.none, appearances: [] });
    const rows = SetRowPresenter.rows({
      sets: [
        LoggedSet.make({ index: 0, weightKg: 100, reps: 6, modifiers: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 }) }),
        LoggedSet.make({ index: 1, weightKg: 100, reps: 8, flags: SetFlags.partialReps, partialReps: 3 }),
      ],
      reference: undefined, history, activeIndex: undefined,
    });
    assertEqual(rows[0].delta, SetDelta.paused({ reps: undefined }));
    assertEqual(rows[1].delta, SetDelta.partial({ count: 3 }), "The count travels with the state, so colour is never the only signal");
  });
});

// MARK: - Warm-up ladder

describe("WarmupPlannerTests", () => {
  const bench = () => ExerciseCatalog.exercise("flat-bench")!;
  const lateral = () => ExerciseCatalog.exercise("push-lateral")!;
  const machine = () => ExerciseCatalog.exercise("pec-fly")!;

  const context = (position: number, compound: boolean) =>
    WarmupPlanner_Context.make({ positionInSession: position, isCompound: compound });

  test("testAHeavyCompoundGetsThreeRampSets", () => {
    const ladder = WarmupPlanner.ladder({ topSetKg: 105, exercise: bench(), context: context(0, true) });
    assertEqual(ladder.length, 3);
    assertEqual(ladder.map((s) => s.reps), [8, 4, 2], "Ramp reps fall as the load rises");
    assertTrue(ladder[0].weightKg < ladder[1].weightKg);
    assertTrue(ladder[1].weightKg < ladder[2].weightKg);
    assertTrue(ladder.every((s) => s.weightKg < 105), "A ramp set is never the top set");
  });

  /** §7: trimmed from the top when the load is light. */
  test("testLighterLoadsGetAShorterRamp", () => {
    assertEqual(WarmupPlanner.ladder({ topSetKg: 60, exercise: bench(), context: context(0, true) }).length, 2);
    assertEqual(WarmupPlanner.ladder({ topSetKg: 35, exercise: bench(), context: context(0, true) }).length, 1);
    assertTrue(WarmupPlanner.ladder({ topSetKg: 15, exercise: bench(), context: context(0, true) }).length === 0);
  });

  /**
   * The Phase 2 proxy for "not first for this muscle group": isolation
   * work later in the session is already warm.
   */
  test("testIsolationLaterInTheSessionGetsNoRamp", () => {
    assertTrue(WarmupPlanner.ladder({ topSetKg: 40, exercise: lateral(), context: context(4, false) }).length === 0);
    assertFalse(
      WarmupPlanner.ladder({ topSetKg: 40, exercise: lateral(), context: context(0, false) }).length === 0,
      "First exercise of the session still gets one",
    );
  });

  test("testASupportedMachineAtModerateLoadGetsASingleRamp", () => {
    const ladder = WarmupPlanner.ladder({ topSetKg: 55, exercise: machine(), context: context(0, false) });
    assertEqual(ladder.length, 1);
    assertEqual(ladder[0].reps, 10);
  });

  test("testRampWeightsLandOnRealIncrements", () => {
    const ladder = WarmupPlanner.ladder({ topSetKg: 105, exercise: bench(), context: context(0, true) });
    for (const set of ladder) {
      const steps = dec(set.weightKg / Exercise.incrementKg(bench()));
      assertClose(steps, rounded(steps), 0.001, `${set.weightKg} kg is not a loadable weight`);
    }
  });

  /**
   * Warm-ups are display only: they never reach volume, progression or a
   * record, and the rows carry no status.
   */
  test("testWarmupRowsAreInertAndUnloggable", () => {
    const ladder = WarmupPlanner.ladder({ topSetKg: 105, exercise: bench(), context: context(0, true) });
    const rows = SetRowPresenter.warmupRows(ladder);
    assertEqual(rows.map((r) => r.indexLabel), ["W1", "W2", "W3"]);
    assertTrue(rows.every((r) => r.isWarmup && r.status === "warmup" && r.delta.kind === "none"));

    const asSets = ladder.map((w) => LoggedSet.make({ index: 0, weightKg: w.weightKg, reps: w.reps, isWarmup: true }));
    assertEqual(RecordsEngine.volumeLoad(asSets), 0);
    assertTrue(asSets.every((s) => !LoggedSet.countsTowardProgression(s) && !LoggedSet.countsTowardVolume(s)));
  });

  test("testHiddenWarmupsSurviveTheBlob", () => {
    let state = LegacyState.make({ raw: { sessions: [] } });
    state = LegacyAdapter.applyHiddenWarmups({ hiddenWarmups: new Set(["flat-bench", "pec-fly"]), to: state });
    const reread = LegacyState.fromData(LegacyState.encoded(state));
    assertEqual(LegacyAdapter.hiddenWarmups({ from: reread }), new Set(["flat-bench", "pec-fly"]));
  });
});

// MARK: - Interaction between the new set types and records

describe("SetTypeRecordInteractionTests", () => {
  function history(): ExerciseHistory {
    const sessions = [0, 1, 2].map((i) =>
      Fixtures.session({ id: `s${i}`, daysAgo: (i + 1) * 3, exerciseID: "flat-bench", sets: [{ weight: 100, reps: 6, rir: 1 }] }),
    );
    return ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: sessions });
  }

  /**
   * A partial set earlier in the session must not stop a clean set at the
   * same weight from being the record it is.
   */
  test("testAPartialSetDoesNotSuppressALaterCleanPR", () => {
    const partial = LoggedSet.make({ index: 0, weightKg: 105, reps: 5, flags: SetFlags.partialReps, partialReps: 3 });
    const clean = LoggedSet.make({ index: 1, weightKg: 105, reps: 6 });

    assertFalse(
      RecordsEngine.isLoadPR({ set: partial, history: history(), earlierInSession: [] }),
      "The partial set itself is never a record",
    );
    assertTrue(
      RecordsEngine.isLoadPR({ set: clean, history: history(), earlierInSession: [partial] }),
      "But it must not shadow the clean set behind it",
    );
  });

  test("testAFailedSetDoesNotSuppressALaterCleanPREither", () => {
    const failed = LoggedSet.make({ index: 0, weightKg: 105, reps: 2, flags: SetFlags.failed });
    const clean = LoggedSet.make({ index: 1, weightKg: 105, reps: 6 });
    assertTrue(RecordsEngine.isLoadPR({ set: clean, history: history(), earlierInSession: [failed] }));
  });

  /** A genuine earlier PR still takes the honour once, not twice. */
  test("testTheFirstCleanSetAtAWeightTakesTheRecord", () => {
    const first = LoggedSet.make({ index: 0, weightKg: 105, reps: 6 });
    const second = LoggedSet.make({ index: 1, weightKg: 105, reps: 6 });
    assertTrue(RecordsEngine.isLoadPR({ set: first, history: history(), earlierInSession: [] }));
    assertFalse(RecordsEngine.isLoadPR({ set: second, history: history(), earlierInSession: [first] }));
  });
});

// MARK: - Paused and partial together

describe("PausedAndPartialTogetherTests", () => {
  function history(): ExerciseHistory {
    const sessions = [0, 1, 2].map((i) =>
      Fixtures.session({ id: `s${i}`, daysAgo: (i + 1) * 3, exerciseID: "flat-bench", sets: [{ weight: 100, reps: 6, rir: 1 }] }),
    );
    return ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: sessions });
  }

  /** Both descriptions are true, so neither is allowed to hide the other. */
  test("testASetThatIsBothShowsBoth", () => {
    const rows = SetRowPresenter.rows({
      sets: [LoggedSet.make({
        index: 0, weightKg: 100, reps: 6,
        modifiers: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 }),
        flags: SetFlags.partialReps, partialReps: 3,
      })],
      reference: undefined, history: history(), activeIndex: undefined,
    });
    assertEqual(rows[0].delta, SetDelta.pausedAndPartial({ pausedReps: undefined, count: 3 }));
  });

  /**
   * Partials rule: a partial set stays out of progression and records even
   * when it was also paused, and still counts toward volume.
   */
  test("testAPausedPartialSetIsStillExcludedFromProgressionAndRecords", () => {
    const set = LoggedSet.make({
      index: 0, weightKg: 200, reps: 6,
      modifiers: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 }),
      flags: SetFlags.partialReps, partialReps: 2,
    });
    assertFalse(LoggedSet.countsTowardProgression(set));
    assertTrue(LoggedSet.countsTowardVolume(set));
    assertEqual(RecordsEngine.volumeLoad([set]), 1_200);
    assertFalse(RecordsEngine.isLoadPR({ set, history: history(), earlierInSession: [] }));
  });

  /** And it must not shadow a clean set behind it either. */
  test("testAPausedPartialSetDoesNotSuppressALaterCleanPR", () => {
    const both = LoggedSet.make({
      index: 0, weightKg: 105, reps: 5,
      modifiers: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 }),
      flags: SetFlags.partialReps, partialReps: 3,
    });
    const clean = LoggedSet.make({ index: 1, weightKg: 105, reps: 6 });
    assertTrue(RecordsEngine.isLoadPR({ set: clean, history: history(), earlierInSession: [both] }));
  });

  test("testPausedAloneAndPartialAloneStillReadSeparately", () => {
    const h = history();
    const paused = SetRowPresenter.rows({
      sets: [LoggedSet.make({ index: 0, weightKg: 100, reps: 6, modifiers: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 }) })],
      reference: undefined, history: h, activeIndex: undefined,
    });
    assertEqual(paused[0].delta, SetDelta.paused({ reps: undefined }));

    const partial = SetRowPresenter.rows({
      sets: [LoggedSet.make({ index: 0, weightKg: 100, reps: 6, flags: SetFlags.partialReps, partialReps: 2 })],
      reference: undefined, history: h, activeIndex: undefined,
    });
    assertEqual(partial[0].delta, SetDelta.partial({ count: 2 }));
  });
});

// MARK: - Keypad input

/**
 * The weight field is reachable from a hardware keyboard, where the numeric
 * keyboard type guarantees nothing. These are the rules the field applies.
 * (The Swift test re-implements the filter inline; it is the same rule as
 * `NumberInput.numericOnly`, which is used here.)
 */
describe("NumericInputTests", () => {
  const filter = (text: string) => NumberInput.numericOnly(text);

  test("testLettersAndSymbolsNeverReachTheField", () => {
    assertEqual(filter("§à"), "");
    assertEqual(filter("1o2"), "12");
    assertEqual(filter("60kg"), "60");
  });

  test("testOneSeparatorSurvivesAndTheRestDoNot", () => {
    assertEqual(filter("102.5"), "102,5");
    assertEqual(filter("102,5"), "102,5");
    assertEqual(filter("1.2.3"), "1,23");
  });

  test("testAFilteredValueStillParsesAsAWeight", () => {
    assertEqual(NumberInput.decimal(filter("102.5")), 102.5);
  });
});

// MARK: - A comparison never hides what the set was

describe("SetStateNeverHiddenTests", () => {
  const empty = ExerciseHistory.make({ exerciseID: "flat-bench", modifiers: SetModifiers.none, appearances: [] });

  /**
   * The calibration baseline is a comparison. `basis` must not overwrite a
   * marker that explains why the set is out of progression.
   */
  test("testTheBaselineLabelDoesNotHideAPausedPartialCalibrationSet", () => {
    const calibration = LoggedSet.make({
      index: 0, weightKg: 60, reps: 8,
      modifiers: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 }),
      flags: SetFlags.partialReps, partialReps: 1,
    });
    const rows = SetRowPresenter.rows({
      sets: [calibration, LoggedSet.make({ index: 1, weightKg: 60 })],
      reference: undefined, history: empty, activeIndex: 1,
      mode: SetGridMode.calibrated({ baseline: calibration }),
    });
    assertEqual(rows[0].delta, SetDelta.pausedAndPartial({ pausedReps: undefined, count: 1 }));
  });

  test("testACleanCalibrationSetStillReadsAsTheBaseline", () => {
    const calibration = LoggedSet.make({ index: 0, weightKg: 60, reps: 8 });
    const rows = SetRowPresenter.rows({
      sets: [calibration], reference: undefined, history: empty, activeIndex: undefined,
      mode: SetGridMode.calibrated({ baseline: calibration }),
    });
    assertEqual(rows[0].delta, SetDelta.baseline);
  });

  test("testALaterFailedSetKeepsItsMarkerInsteadOfADelta", () => {
    const baseline = LoggedSet.make({ index: 0, weightKg: 60, reps: 8 });
    const failed = LoggedSet.make({ index: 1, weightKg: 60, reps: 3, flags: SetFlags.failed });
    const rows = SetRowPresenter.rows({
      sets: [baseline, failed], reference: undefined, history: empty, activeIndex: undefined,
      mode: SetGridMode.calibrated({ baseline }),
    });
    assertEqual(rows[1].delta, SetDelta.failed);
  });
});
