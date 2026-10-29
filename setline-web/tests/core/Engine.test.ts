// Port of ios/SetlineCore/Tests/SetlineCoreTests/EngineTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertFalse, assertNil, assertNotEqual, assertNotNil, assertTrue } from "../helpers";
import { Fixtures } from "./Fixtures";
import { AlternativesCatalog } from "../../src/core/Catalog/AlternativesCatalog";
import { ExerciseCatalog } from "../../src/core/Catalog/ExerciseCatalogV1";
import { GuidanceCatalog } from "../../src/core/Catalog/GuidanceCatalog";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { ActiveSessionSnapshot } from "../../src/core/Domain/ActiveSession";
import { ExerciseResult, LoggedSet, PlannedExercise, SetPrescription, type TrainingSession } from "../../src/core/Domain/Model";
import { SetModifiers } from "../../src/core/Domain/Vocabulary";
import { Estimates } from "../../src/core/Engine/Estimates";
import { ExerciseHistory } from "../../src/core/Engine/ExerciseHistory";
import { NumberDisplay } from "../../src/core/Engine/NumberDisplay";
import { ProgressionEngine } from "../../src/core/Engine/ProgressionEngine";
import { RecordType, RecordsEngine } from "../../src/core/Engine/RecordsEngine";
import { RestPrescription, RestTimerState } from "../../src/core/Engine/RestPrescription";
import { Schedule } from "../../src/core/Engine/Schedule";
import { SetDelta, SetRowPresenter } from "../../src/core/Engine/SetRowPresentation";
import { addingTimeInterval, dateFrom, dateFromEpoch } from "../../src/core/Support/calendar";
import { closedRange } from "../../src/core/Support/range";

type Entry = { weight: number; reps: number; rir?: number };

describe("ProgressionEngineTests", () => {
  const planned = PlannedExercise.make({
    exerciseID: "flat-bench",
    role: "secondaryCompound",
    sets: [
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
    ],
  });

  const history = (sessions: TrainingSession[]) =>
    ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: sessions });

  const topSets = (weight: number, reps: number, rir: number | undefined = 1): Entry[] => [
    { weight, reps, rir }, { weight, reps, rir }, { weight, reps, rir },
  ];

  test("testNoProposalBeforeThreeReferenceSessions", () => {
    const sessions = [
      Fixtures.session({ id: "a", daysAgo: 3, exerciseID: "flat-bench", sets: topSets(100, 8) }),
      Fixtures.session({ id: "b", daysAgo: 6, exerciseID: "flat-bench", sets: topSets(100, 8) }),
    ];
    const proposal = ProgressionEngine.proposal({
      planned, exercise: ExerciseCatalog.exercise("flat-bench")!, history: history(sessions),
    });
    assertEqual(proposal.tone, "noReference");
    assertNil(proposal.weightKg);
    assertEqual(proposal.headline, "Building a reference · session 3 of 3");
  });

  test("testTwoQualifyingSessionsAtTheSameLoadReadyTheIncrease", () => {
    const sessions = [0, 1, 2].map((index) =>
      Fixtures.session({ id: `s${index}`, daysAgo: index * 3, exerciseID: "flat-bench", sets: topSets(100, 8) }),
    );
    const proposal = ProgressionEngine.proposal({
      planned, exercise: ExerciseCatalog.exercise("flat-bench")!, history: history(sessions),
    });
    assertEqual(proposal.tone, "ready");
    assertEqual(proposal.label, "TOP OF RANGE CONFIRMED");
    assertEqual(proposal.weightKg, 102.5, "Barbell steps 2,5 kg");
    assertEqual(proposal.targetReps, 6, "Reps reset to the bottom of the range");
  });

  test("testOneQualifyingSessionAsksForConfirmation", () => {
    const sessions = [
      Fixtures.session({ id: "a", daysAgo: 0, exerciseID: "flat-bench", sets: topSets(100, 8) }),
      Fixtures.session({ id: "b", daysAgo: 3, exerciseID: "flat-bench", sets: topSets(100, 7) }),
      Fixtures.session({ id: "c", daysAgo: 6, exerciseID: "flat-bench", sets: topSets(100, 7) }),
    ];
    const proposal = ProgressionEngine.proposal({
      planned, exercise: ExerciseCatalog.exercise("flat-bench")!, history: history(sessions),
    });
    assertEqual(proposal.tone, "close");
    assertEqual(proposal.headline, "1 more confirmation at 100 kg");
    assertEqual(proposal.weightKg, 100, "The proposal holds the load, it does not advance it");
  });

  test("testMissingTheRangeStaysNeutral", () => {
    const sessions = [0, 1, 2].map((index) =>
      Fixtures.session({ id: `s${index}`, daysAgo: index * 3, exerciseID: "flat-bench", sets: topSets(100, 6) }),
    );
    const proposal = ProgressionEngine.proposal({
      planned, exercise: ExerciseCatalog.exercise("flat-bench")!, history: history(sessions),
    });
    assertEqual(proposal.tone, "neutral");
    assertEqual(proposal.headline, "Keep building at 100 kg");
  });

  /**
   * §3.1: a session where every set hit the top of the range at RIR 4 is
   * not a signal to add load — the median RIR is outside the target.
   */
  test("testHighRIRDoesNotQualifyASession", () => {
    const sessions = [0, 1, 2].map((index) =>
      Fixtures.session({ id: `s${index}`, daysAgo: index * 3, exerciseID: "flat-bench", sets: topSets(100, 8, 4) }),
    );
    const proposal = ProgressionEngine.proposal({
      planned, exercise: ExerciseCatalog.exercise("flat-bench")!, history: history(sessions),
    });
    assertNotEqual(proposal.tone, "ready");
  });

  /** §3.2 LOAD_STEP: a low-rep primary lift advances on one confirmation. */
  test("testLowRepPrimaryStrengthNeedsOnlyOneConfirmation", () => {
    const lowRep = PlannedExercise.make({
      exerciseID: "flat-bench",
      role: "primaryStrength",
      sets: [SetPrescription.make({ repRange: closedRange(4, 6), targetRIR: closedRange(1, 3) })],
    });
    assertEqual(ProgressionEngine.requiredConfirmations({ for: lowRep }), 1);
    assertEqual(ProgressionEngine.requiredConfirmations({ for: planned }), 2);
  });

  test("testRestInheritsFromRole", () => {
    assertEqual(RestPrescription.forRole("primaryStrength").defaultSeconds, 180);
    assertEqual(RestPrescription.forRole("secondaryCompound").defaultSeconds, 120);
    assertEqual(RestPrescription.forRole("isolation").defaultSeconds, 90);
    assertEqual(RestPrescription.displayLabel(RestPrescription.forRole("primaryStrength")), "3:00");
  });

  test("testAdjustingTheTimerNeverResetsIt", () => {
    const start = new Date();
    let timer = RestTimerState.make({ targetSeconds: 120, startedAt: start });
    const thirtySecondsIn = addingTimeInterval(start, 30);
    assertEqual(RestTimerState.remaining(timer, { at: thirtySecondsIn }), 90);

    timer = RestTimerState.adjust(timer, { by: 15, floorRemainingAt: thirtySecondsIn });
    assertEqual(RestTimerState.remaining(timer, { at: thirtySecondsIn }), 105);
    assertEqual(timer.startedAt, start, "The clock kept running; only the target moved");
  });
});

describe("RecordsEngineTests", () => {
  const history = (sessions: TrainingSession[]) =>
    ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: sessions });

  const threeSessions = () => [0, 1, 2].map((index) =>
    Fixtures.session({ id: `s${index}`, daysAgo: (index + 1) * 3, exerciseID: "flat-bench", sets: [{ weight: 100, reps: 6, rir: 1 }] }),
  );

  test("testNoRecordBannerDuringTheBaselinePeriod", () => {
    const sessions = threeSessions().slice(0, 2);
    const record = RecordsEngine.record({ for: [LoggedSet.make({ index: 0, weightKg: 200, reps: 5 })], history: history(sessions) });
    assertEqual(record?.headline, "Building a reference · session 3 of 3");
    // Phase 2 replaced this copy: artboard 08 had promised progression
    // after one session, which the three-session gate then withheld.
    assertEqual(
      record?.detail,
      "After three comparable sessions, SETLINE can show reliable progression suggestions and records.",
    );
  });

  test("testLoadPROutranksEverythingElse", () => {
    const three = threeSessions();
    const record = RecordsEngine.record({ for: [LoggedSet.make({ index: 0, weightKg: 105, reps: 6 })], history: history(three) });
    assertEqual(record?.type, RecordType.load);
    assertEqual(record?.headline, "Heaviest ever · 105 kg × 6");
    // 17R: the previous best in full — unit, reps and the day it was
    // first done ("Vorige beste 122,5 kg × 3 op 31 aug").
    const first = new Date(Math.min(...history(three).appearances.map((ap) => ap.date.getTime())));
    assertEqual(record?.detail, `Previous best 100 kg × 6 on ${NumberDisplay.shortDate(NumberDisplay.english, first)}`);
  });

  test("testRepPRAtAKnownLoad", () => {
    const record = RecordsEngine.record({ for: [LoggedSet.make({ index: 0, weightKg: 100, reps: 8 })], history: history(threeSessions()) });
    assertEqual(record?.type, RecordType.rep);
    assertEqual(record?.headline, "+2 reps at 100 kg");
    assertEqual(record?.detail, "8 reps, last time 6");
  });

  /**
   * §15 change 5: the epsilon is 0.5 kg, not 0.05, so rounding noise
   * never manufactures a record.
   */
  test("testQuarterKiloIsNotARecord", () => {
    const record = RecordsEngine.record({ for: [LoggedSet.make({ index: 0, weightKg: 100.25, reps: 6 })], history: history(threeSessions()) });
    assertNotEqual(record?.type, RecordType.load);
  });

  /** §10.2 guard 2 and §13 rule 3. */
  test("testNoEstimatedOneRepMaxAboveTenReps", () => {
    assertNil(Estimates.e1RM({ weightKg: 100, reps: 11 }));
    assertNotNil(Estimates.e1RM({ weightKg: 100, reps: 10 }));
  });

  /**
   * Neither a load PR (105 kg still stands) nor a rep PR (no history at
   * 102,5 kg), but a higher estimate than anything before it.
   */
  test("testEstimatedStrengthAlwaysSaysItIsAnEstimate", () => {
    const sessions = [0, 1, 2].map((index) =>
      Fixtures.session({
        id: `s${index}`,
        daysAgo: (index + 1) * 3,
        exerciseID: "flat-bench",
        sets: [{ weight: 105, reps: 2, rir: 1 }, { weight: 100, reps: 6, rir: 1 }],
      }),
    );
    const record = RecordsEngine.record({ for: [LoggedSet.make({ index: 0, weightKg: 102.5, reps: 6 })], history: history(sessions) });
    assertEqual(record?.type, RecordType.estimatedStrength);
    assertTrue(record?.headline.includes("Estimated strength") === true);
    assertTrue(record?.detail.includes("Not measured") === true);
  });

  /** §9.2 and §1: a paused set is only ever compared to other paused sets. */
  test("testPausedSetsAreNotComparableToUnpausedOnes", () => {
    const paused = SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2 });
    assertFalse(SetModifiers.isComparable(paused, { to: SetModifiers.none }));
    assertTrue(SetModifiers.isComparable(paused, { to: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 2.4 }) }));
    assertFalse(SetModifiers.isComparable(paused, { to: SetModifiers.make({ pauseEnabled: true, pauseSeconds: 3 }) }));
  });

  test("testWarmupsNeverEnterVolumeOrRecords", () => {
    const warmup = LoggedSet.make({ index: 0, weightKg: 60, reps: 8, isWarmup: true });
    assertFalse(LoggedSet.countsTowardVolume(warmup));
    assertFalse(LoggedSet.countsTowardProgression(warmup));
    assertEqual(RecordsEngine.volumeLoad([warmup]), 0);
  });
});

describe("SetRowPresenterTests", () => {
  test("testEmptyRowShowsLastSessionAndWrittenRowShowsTheDelta", () => {
    const sessions = [0, 1, 2].map((index) =>
      Fixtures.session({
        id: `s${index}`, daysAgo: (index + 1) * 3, exerciseID: "flat-bench",
        sets: [{ weight: 47.5, reps: 8, rir: 1 }, { weight: 47.5, reps: 8, rir: 1 }],
      }),
    );
    const history = ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: sessions });
    const sets = [LoggedSet.make({ index: 0, weightKg: 50, reps: 8 }), LoggedSet.make({ index: 1 })];
    const rows = SetRowPresenter.rows({ sets, reference: ExerciseHistory.mostRecent(history), history, activeIndex: 1 });
    assertEqual(rows.length, 2);
    assertEqual(rows[0].status, "written");
    assertEqual(rows[0].repsLabel, "8");
    assertEqual(rows[1].status, "nextUp");
    assertEqual(rows[1].repsLabel, "—");
    assertEqual(rows[1].delta, SetDelta.reference("47.5 × 8"));
  });

  test("testAHeavierCompleteSetReadsPRAtTheMomentItHappens", () => {
    const sessions = [0, 1, 2].map((index) =>
      Fixtures.session({ id: `s${index}`, daysAgo: (index + 1) * 3, exerciseID: "flat-bench", sets: [{ weight: 47.5, reps: 8, rir: 1 }] }),
    );
    const history = ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: sessions });
    const rows = SetRowPresenter.rows({
      sets: [LoggedSet.make({ index: 0, weightKg: 50, reps: 8 })],
      reference: ExerciseHistory.mostRecent(history), history, activeIndex: undefined,
    });
    assertEqual(rows[0].delta, SetDelta.personalRecord);
  });

  test("testAdviceLineOnlyAppearsOnceTheLastSetIsWritten", () => {
    const sessions = [0, 1, 2].map((index) =>
      Fixtures.session({
        id: `s${index}`, daysAgo: (index + 1) * 3, exerciseID: "flat-bench",
        sets: [{ weight: 100, reps: 8, rir: 1 }, { weight: 100, reps: 8, rir: 1 }],
      }),
    );
    const history = ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: sessions });
    const planned = PlannedExercise.make({
      exerciseID: "flat-bench",
      role: "secondaryCompound",
      sets: [SetPrescription.make({ repRange: closedRange(6, 8) }), SetPrescription.make({ repRange: closedRange(6, 8) })],
    });
    const exercise = ExerciseCatalog.exercise("flat-bench")!;

    const partial = [LoggedSet.make({ index: 0, weightKg: 100, reps: 8 }), LoggedSet.make({ index: 1 })];
    assertNil(SetRowPresenter.adviceLine({ sets: partial, planned, exercise, history }));

    const complete = [LoggedSet.make({ index: 0, weightKg: 100, reps: 8 }), LoggedSet.make({ index: 1, weightKg: 100, reps: 8 })];
    assertEqual(SetRowPresenter.adviceLine({ sets: complete, planned, exercise, history }), "All reps done. Next time 102.5 kg.");
  });
});

describe("CatalogTests", () => {
  test("testEveryPlannedExerciseResolvesToACatalogEntryWithARole", () => {
    const plans = [PlanCatalog.personal, PlanCatalog.sciencePPLUL, PlanCatalog.scienceUpperLower, PlanCatalog.scienceFullBody];
    for (const plan of plans) {
      for (const day of plan) {
        assertFalse(day.exercises.length === 0, `${day.id} has no exercises`);
        for (const planned of day.exercises) {
          assertNotNil(ExerciseCatalog.exercise(planned.exerciseID), `${planned.exerciseID} is planned but not in the catalogue`);
          assertFalse(planned.sets.length === 0, `${planned.exerciseID} has no typed sets`);
          assertNotNil(planned.authoredNote, `${planned.exerciseID} lost its authored strings`);
        }
      }
    }
  });

  test("testPlanShapesMatchTheWebApp", () => {
    assertEqual(PlanCatalog.personal.length, 5);
    assertEqual(PlanCatalog.sciencePPLUL.length, 5);
    assertEqual(PlanCatalog.scienceUpperLower.length, 4);
    assertEqual(PlanCatalog.scienceFullBody.length, 3);
    assertEqual(PlanCatalog.personal.map((d) => d.id), ["push", "pull", "legs", "lower", "upper"]);
  });

  test("testAuthoredGuidanceAndAlternativesCameAcrossWhole", () => {
    assertEqual(Object.keys(GuidanceCatalog.byExercise).length, 39);
    assertEqual(Object.keys(AlternativesCatalog.byExercise).length, 39);
    assertEqual(Object.values(AlternativesCatalog.byExercise).reduce((n, list) => n + list.length, 0), 78);
    assertEqual(
      GuidanceCatalog.guide({ for: "flat-bench" }).warmup,
      "Bar×15 → 60×8 → 80×5 → 100×3 → 110×1. No set to failure.",
    );
  });

  /** The typed prescription must reproduce what the string meant. */
  test("testCompoundPrescriptionsBecomeTypedSets", () => {
    const bench = PlanCatalog.personal
      .find((d) => d.id === "push")
      ?.exercises.find((p) => p.exerciseID === "flat-bench");
    assertEqual(bench?.authoredNote?.prescription, "1×5–6 + 2×6–8");
    assertEqual(bench?.sets.length, 3);
    assertEqual(bench?.sets[0].repRange, closedRange(5, 6));
    assertEqual(bench?.sets[1].repRange, closedRange(6, 8));
    assertEqual(bench?.sets[2].repRange, closedRange(6, 8));
  });

  test("testPausedBenchKeepsItsPauseAsAModifier", () => {
    const paused = PlanCatalog.personal
      .find((d) => d.id === "upper")
      ?.exercises.find((p) => p.exerciseID === "upper-paused-bench");
    assertEqual(paused?.modifiers.pauseEnabled, true);
    assertEqual(paused?.modifiers.pauseSeconds, 2);
  });

  test("testDutchNumberFormatting", () => {
    const display = NumberDisplay.english;
    assertEqual(NumberDisplay.kg(display, 102.5), "102.5 kg");
    assertEqual(NumberDisplay.volumeKg(display, 6480), "6,480 kg");
    assertEqual(NumberDisplay.signedDelta(display, 2.5), "+2.5");
    assertEqual(NumberDisplay.signedDelta(display, 0), "=");
    assertEqual(NumberDisplay.setReference(display, { weightKg: 47.5, reps: 8 }), "47.5 × 8");
  });
});

describe("ScheduleTests", () => {
  // The Swift test pins a gregorian calendar to Europe/Brussels; the web
  // test run pins TZ=Europe/Brussels, and `yyyy-MM-dd` parses to local midnight.
  const date = (string: string): Date => {
    const [y, m, d] = string.split("-").map(Number);
    return dateFrom({ year: y, month: m, day: d });
  };

  test("testDefaultWeekMatchesTheWebApp", () => {
    // Monday 7 September 2026 is a push day in the default shape.
    assertEqual(Schedule.canonicalDay({ for: date("2026-09-07"), overrides: {} }), "push");
    assertEqual(Schedule.canonicalDay({ for: date("2026-09-08"), overrides: {} }), "pull");
    assertEqual(Schedule.canonicalDay({ for: date("2026-09-09"), overrides: {} }), "legs");
    assertEqual(Schedule.canonicalDay({ for: date("2026-09-10"), overrides: {} }), "rest");
    assertEqual(Schedule.canonicalDay({ for: date("2026-09-13"), overrides: {} }), "rest");
  });

  test("testAnOverrideWinsOverTheDefaultShape", () => {
    const overrides = { "2026-09-10": "upper" };
    assertEqual(Schedule.canonicalDay({ for: date("2026-09-10"), overrides }), "upper");
  });

  /**
   * Science plan day ids are prefixed, so the canonical id has to resolve
   * onto them rather than matching exactly.
   */
  test("testCanonicalDaysResolveOntoPrefixedSciencePlanIDs", () => {
    assertEqual(Schedule.day({ for: "push", in: PlanCatalog.personal })?.id, "push");
    assertEqual(Schedule.day({ for: "push", in: PlanCatalog.sciencePPLUL })?.id, "science-push");
    assertNil(Schedule.day({ for: "rest", in: PlanCatalog.personal }));
  });

  test("testWeekStartsOnMonday", () => {
    const week = Schedule.mondayFirstWeek({ containing: date("2026-09-10") });
    assertEqual(week.length, 7);
    assertEqual(Schedule.dateKey(week[0]), "2026-09-07");
    assertEqual(Schedule.dateKey(week[6]), "2026-09-13");
  });
});

describe("PausedSessionEndingTests", () => {
  function snapshot(logged: number) {
    const sets = [0, 1, 2].map((index) => LoggedSet.make({ index, weightKg: 100, reps: index < logged ? 6 : 0 }));
    return ActiveSessionSnapshot.make({
      dayID: "push",
      dayLabel: "Push",
      startedAt: dateFromEpoch(1_788_000_000),
      currentIndex: 0,
      results: [ExerciseResult.make({ exerciseID: "flat-bench", name: "Flat bench press", sets })],
    });
  }

  /** Ending from the home screen keeps what was written and nothing else. */
  test("testEndingKeepsOnlyWrittenSets", () => {
    const session = ActiveSessionSnapshot.finishedSession(snapshot(2));
    assertEqual(session.results[0]?.sets.length, 2);
    assertEqual(session.completion, 66);
    assertEqual(session.dayID, "push");
    assertEqual(session.kind, "workout");
  });

  /**
   * The session keeps the date it was started on, not the date it was
   * ended — a Friday workout finished on Saturday is still Friday's.
   */
  test("testTheSessionKeepsItsOriginalDate", () => {
    const started = dateFromEpoch(1_788_000_000);
    assertEqual(ActiveSessionSnapshot.finishedSession(snapshot(1)).date, started);
  });

  test("testAnUntouchedPausedSessionProducesNothingWorthKeeping", () => {
    const s = snapshot(0);
    assertFalse(ActiveSessionSnapshot.hasProgress(s));
    assertTrue(ActiveSessionSnapshot.finishedSession(s).results.every((r) => r.sets.length === 0));
  });
});
