// Port of ios/SetlineCore/Tests/SetlineCoreTests/FatigueTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertFalse, assertLessThan, assertNil, assertNotEqual, assertNotNil, assertTrue } from "../helpers";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { ExerciseResult, LoggedSet, PlannedExercise, TrainingSession } from "../../src/core/Domain/Model";
import { SessionSlot } from "../../src/core/Domain/SessionSlot";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { StateChange } from "../../src/core/Sync/StateChange";
import { StateMerge } from "../../src/core/Sync/StateMerge";
import { Deload, Fatigue, Fatigue_Reading, SessionPrescription } from "../../src/core/Engine/Fatigue";
import { SetDelta } from "../../src/core/Engine/SetRowPresentation";
import { WeekPlan } from "../../src/core/Engine/WeekPlan";
import { addDays } from "../../src/core/Support/calendar";
import { capitalized } from "../../src/core/Support/engine";

/**
 * TRAINING_LOGIC §11: fatigue is read from logged sets, two signals propose,
 * one never does, and nothing is ever applied by itself.
 */
describe("FatigueTests", () => {
  const now = LegacyAdapter.isoDate("2026-09-18T18:00:00.000Z")!;

  const set = (weight: number, reps: number, rir?: number) =>
    LoggedSet.make({ index: 0, weightKg: weight, reps, rirReported: rir });

  function session(
    id: string,
    a: { daysAgo: number; dayID?: string; results: ExerciseResult[]; planned?: number; completed?: number },
  ): TrainingSession {
    const dayID = a.dayID ?? "push";
    const s = TrainingSession.make({
      id,
      date: addDays(now, -a.daysAgo),
      dayID,
      dayLabel: capitalized(dayID),
      completion: 100,
      results: a.results,
    });
    return { ...s, plannedSetCount: a.planned, completedSetCount: a.completed };
  }

  const result = (id: string, name: string, sets: LoggedSet[]) => ExerciseResult.make({ exerciseID: id, name, sets });

  test("testOneSignalNeverProposesAnything", () => {
    // Reps fell on a single exercise: a bad day, not a pattern.
    const reading = Fatigue.read({
      sessions: [
        session("b", { daysAgo: 1, results: [result("flat-bench", "Bankdrukken", [set(100, 5)])] }),
        session("a", { daysAgo: 4, results: [result("flat-bench", "Bankdrukken", [set(100, 6)])] }),
      ],
      now,
    });
    assertFalse(Fatigue_Reading.proposes(reading));
  });

  test("testRepsFallingOnTwoExercisesIsOneSignal", () => {
    const reading = Fatigue.read({
      sessions: [
        session("b", { daysAgo: 1, results: [
          result("flat-bench", "Bankdrukken", [set(100, 5)]),
          result("pec-fly", "Pec-fly", [set(55, 11)]),
        ] }),
        session("a", { daysAgo: 4, results: [
          result("flat-bench", "Bankdrukken", [set(100, 6)]),
          result("pec-fly", "Pec-fly", [set(55, 12)]),
        ] }),
      ],
      now,
    });
    assertTrue(reading.signals.has("performanceRegression"));
    assertFalse(Fatigue_Reading.proposes(reading), "still only one signal");
  });

  test("testRepsFallingAndEffortDriftingTogetherPropose", () => {
    const reading = Fatigue.read({
      sessions: [
        session("b", { daysAgo: 1, results: [
          result("flat-bench", "Bankdrukken", [set(100, 5)]),
          result("pec-fly", "Pec-fly", [set(55, 11)]),
          result("pressdown", "Pressdown", [set(35, 12, 0)]),
        ] }),
        session("a", { daysAgo: 4, results: [
          result("flat-bench", "Bankdrukken", [set(100, 6)]),
          result("pec-fly", "Pec-fly", [set(55, 12)]),
          result("pressdown", "Pressdown", [set(35, 12, 2)]),
        ] }),
      ],
      now,
    });
    assertEqual(reading.signals, new Set(["performanceRegression", "effortDrift"]));
    assertTrue(Fatigue_Reading.proposes(reading));
    assertTrue(reading.evidence.some((e) => e.detail.includes("→")));
  });

  test("testFinishingLessThanFourFifthsTwiceIsItsOwnSignal", () => {
    const reading = Fatigue.read({
      sessions: [
        session("b", { daysAgo: 1, results: [], planned: 20, completed: 12 }),
        session("a", { daysAgo: 4, results: [], planned: 20, completed: 15 }),
      ],
      now,
    });
    assertTrue(reading.signals.has("completionDrop"));
  });

  test("testNothingOlderThanAWeekCounts", () => {
    const reading = Fatigue.read({
      sessions: [
        session("b", { daysAgo: 1, results: [result("flat-bench", "Bankdrukken", [set(100, 5, 0)])] }),
        session("a", { daysAgo: 20, results: [result("flat-bench", "Bankdrukken", [set(100, 6, 2)])] }),
      ],
      now,
    });
    assertEqual(reading, Fatigue_Reading.none);
  });

  test("testOneSessionSaysNothingAtAll", () => {
    assertEqual(Fatigue.read({ sessions: [session("a", { daysAgo: 1, results: [] })], now }), Fatigue_Reading.none);
  });

  // MARK: The prescription

  test("testTheLighterWeekCutsSetsAndNotExercises", () => {
    const deload = Deload.make({ startedAt: now });
    assertEqual(Deload.sets(deload, { from: 5 }), 3);
    assertEqual(Deload.sets(deload, { from: 4 }), 2);
    assertEqual(Deload.sets(deload, { from: 1 }), 1, "never to zero");
    assertEqual(Deload.detail(deload), "Same exercises, 40% fewer sets, RIR +2. Weight stays.");
    assertEqual(Deload.headline(deload), "Suggestion: 5 lighter days");
  });

  test("testTheLighterWeekEndsOnItsOwn", () => {
    const deload = Deload.make({ startedAt: now });
    assertTrue(Deload.isActive(deload, { on: now }));
    assertTrue(Deload.isActive(deload, { on: addDays(now, 4) }));
    assertFalse(Deload.isActive(deload, { on: addDays(now, 5) }));
    assertFalse(Deload.isActive(deload, { on: addDays(now, -1) }));
  });

  test("testItSurvivesBeingStored", () => {
    const deload = Deload.make({ startedAt: now });
    const state = StateMerge.apply(
      [StateChange.make({ kind: "setDeload", value: LegacyAdapter.json(deload) }, { createdAt: now })],
      { to: LegacyState.make({ raw: {} }), now },
    );
    const read = LegacyAdapter.deload({ from: state });
    assertNotNil(read);
    assertEqual(read!.days, 5);
    assertEqual(read!.rirIncrease, 2);

    const cleared = StateMerge.apply([StateChange.make({ kind: "setDeload", value: null }, { createdAt: now })], { to: state, now });
    assertNil(LegacyAdapter.deload({ from: cleared }));
  });
});

/** Addendum 12R and the review's PR treatment, as the row model states them. */
describe("SetRowReserveTests", () => {
  test("testAReportedReserveTakesTheComparisonColumn", () => {
    assertFalse(SetDelta.describesTheSet(SetDelta.reserve(1)), "it compares nothing, it reports");
    assertNotEqual(SetDelta.reserve(1), SetDelta.reserve(2));
  });
});

/**
 * The home card's set count and the session that opens must agree, in a
 * normal week and in a lighter one.
 */
describe("SessionPrescriptionTests", () => {
  const day = () => PlanCatalog.personal.find((d) => d.id === "push")!;

  /**
   * What a session holds when it opens: one slot per exercise, built from
   * the prescription, counted by the rows the program prescribed.
   */
  function openedSessionSetCount(deload: Deload | undefined): number {
    return day().exercises.reduce((total, element, offset) => {
      const slot = SessionSlot.make({
        position: offset,
        plan: SessionPrescription.planned(element, { deload }),
        exerciseName: element.exerciseID,
      });
      return total + SessionSlot.prescribedSetCount(slot);
    }, 0);
  }

  test("testANormalWeekCountsThePlanAsWritten", () => {
    const count = SessionPrescription.setCount({ of: day(), deload: undefined });
    assertEqual(count, WeekPlan.sets({ of: day() }));
    assertEqual(count, openedSessionSetCount(undefined));
  });

  test("testALighterWeekCountsTheSetsTheSessionOpensWith", () => {
    const deload = Deload.make({ startedAt: new Date() });
    const count = SessionPrescription.setCount({ of: day(), deload });
    assertEqual(count, openedSessionSetCount(deload));
    assertLessThan(count, WeekPlan.sets({ of: day() }), "The full plan is not what the session opens with");
    // Sets are cut, never exercises (§11.2).
    const lightened = day().exercises.map((p) => SessionPrescription.planned(p, { deload }));
    assertEqual(lightened.map((p) => p.exerciseID), day().exercises.map((p) => p.exerciseID));
    assertTrue(lightened.every((p) => PlannedExercise.targetSets(p) >= 1));
  });

  test("testASetAddedDuringTheSessionIsNotPartOfThePrescription", () => {
    const planned = SessionPrescription.planned(day().exercises[0], { deload: Deload.make({ startedAt: new Date() }) });
    let slot = SessionSlot.make({ position: 0, plan: planned, exerciseName: planned.exerciseID });
    [slot] = SessionSlot.addSet(slot);
    assertEqual(SessionSlot.prescribedSetCount(slot), PlannedExercise.targetSets(planned));
    assertEqual(SessionSlot.setCount(slot), PlannedExercise.targetSets(planned) + 1);
  });
});
