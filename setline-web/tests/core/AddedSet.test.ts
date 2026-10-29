// Port of ios/SetlineCore/Tests/SetlineCoreTests/AddedSetTests.swift
//
// An added set is real work: history, volume and records count it like any
// working set. It is never one of the prescribed slots, and adding it never
// changes the program.
import { describe, test } from "node:test";
import { ExerciseCatalog } from "../../src/core/Catalog/ExerciseCatalogV1";
import { ActiveSessionSnapshot } from "../../src/core/Domain/ActiveSession";
import {
  ExerciseResult,
  LoggedSet,
  PlannedExercise,
  SetPrescription,
  TrainingSession,
} from "../../src/core/Domain/Model";
import { SessionSlot } from "../../src/core/Domain/SessionSlot";
import { SetModifiers, type SetOrigin } from "../../src/core/Domain/Vocabulary";
import { ExerciseAppearance, ExerciseHistory } from "../../src/core/Engine/ExerciseHistory";
import { ProgressionEngine } from "../../src/core/Engine/ProgressionEngine";
import { RecordType, RecordsEngine } from "../../src/core/Engine/RecordsEngine";
import { SetDelta, SetRowPresenter } from "../../src/core/Engine/SetRowPresentation";
import { JSONValue, type JSONObject } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { addDays } from "../../src/core/Support/calendar";
import { closedRange } from "../../src/core/Support/range";
import {
  assertEqual,
  assertFalse,
  assertNil,
  assertNotEqual,
  assertNotNil,
  assertTrue,
} from "../helpers";
import { applySessions } from "./Fixtures";

function unwrap<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("XCTUnwrap failed");
  return value;
}

describe("AddedSetTests", () => {
  const bench = PlannedExercise.make({
    exerciseID: "flat-bench",
    role: "primaryStrength",
    sets: [
      SetPrescription.make({ repRange: closedRange(5, 6), targetRIR: closedRange(1, 2) }),
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
    ],
  });
  const fly = PlannedExercise.make({
    exerciseID: "pec-fly",
    role: "isolation",
    sets: Array.from({ length: 3 }, () =>
      SetPrescription.make({ repRange: closedRange(10, 12), targetRIR: closedRange(1, 2) }),
    ),
  });
  const benchExercise = ExerciseCatalog.exercise("flat-bench")!;

  function freshSlot(): SessionSlot {
    return SessionSlot.make({ position: 0, plan: bench, exerciseName: "Flat bench press", prefillWeight: 100 });
  }

  /** `write(&slot, row:weight:reps:rir:)` — returns the written slot. */
  function write(slot: SessionSlot, a: { row: number; weight?: number; reps: number; rir?: number }): SessionSlot {
    const sets = [...slot.active.sets];
    sets[a.row] = { ...sets[a.row], weightKg: a.weight ?? 100, reps: a.reps, rirReported: a.rir };
    return { ...slot, active: { ...slot.active, sets } };
  }

  /** `slot.addSet()` with its result discarded. */
  const added = (slot: SessionSlot, a: { fallbackWeightKg?: number } = {}) => SessionSlot.addSet(slot, a)[0];

  function logged(index: number, weight: number, reps: number, a: { origin?: SetOrigin } = {}): LoggedSet {
    return LoggedSet.make({ index, weightKg: weight, reps, origin: a.origin ?? "prescribed" });
  }

  /** The same bench appearance, three sessions running. */
  function sessions(sets: LoggedSet[]): TrainingSession[] {
    return [0, 1, 2].map((index) =>
      TrainingSession.make({
        id: `s${index}`,
        date: addDays(new Date(), -(index + 1) * 3),
        dayID: "push",
        dayLabel: "Push",
        completion: 100,
        results: [ExerciseResult.make({ exerciseID: "flat-bench", name: "Flat bench press", sets })],
      }),
    );
  }

  /** Three sessions is enough for a reference, so proposals and records apply. */
  function history(sets: LoggedSet[]): ExerciseHistory {
    return ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: sessions(sets) });
  }

  /**
   * Bench press with its prescription done, one extra set logged and a
   * second extra set still open.
   */
  function pausedSnapshot(): { snapshot: ActiveSessionSnapshot; slot: SessionSlot } {
    let slot = freshSlot();
    for (const row of [0, 1, 2]) slot = write(slot, { row, reps: 8 });
    slot = added(slot);
    slot = write(slot, { row: 3, weight: 90, reps: 10, rir: 2 });
    slot = added(slot);
    const snapshot = ActiveSessionSnapshot.make({
      dayID: "push",
      dayLabel: "Push",
      startedAt: new Date(),
      currentIndex: 0,
      results: SessionSlot.results(slot),
      activeSeconds: 900,
      slots: [slot],
    });
    return { snapshot, slot };
  }

  // MARK: Adding

  test("testThreePrescribedSetsTakeAFourth", () => {
    let slot = freshSlot();
    const [next, addedRow] = SessionSlot.addSet(slot);
    slot = next;

    assertEqual(slot.active.sets.length, 4);
    assertEqual(slot.active.sets[slot.active.sets.length - 1], addedRow);
    assertEqual(addedRow.index, 3);
    assertEqual(addedRow.origin, "sessionAdded");
    assertFalse(addedRow.isWarmup, "an added set is a working set");
    assertFalse(LoggedSet.isLogged(addedRow), "adding a set never logs it");
    assertEqual(slot.active.prescription.length, 3, "no prescription is invented for it");
    assertEqual(SessionSlot.setCount(slot), 4, "the session total grows with it");
    assertEqual(SessionSlot.prescribedSetCount(slot), 3);
  });

  test("testSetsFourAndFive", () => {
    let slot = freshSlot();
    const [afterFour, four] = SessionSlot.addSet(slot);
    const [afterFive, five] = SessionSlot.addSet(afterFour);
    slot = afterFive;

    assertEqual([four.index, five.index], [3, 4]);
    assertNotEqual(four.id, five.id);
    assertEqual(slot.active.sets.map((s) => s.index), [0, 1, 2, 3, 4]);
    assertEqual(
      slot.active.sets.map((s) => s.origin),
      ["prescribed", "prescribed", "prescribed", "sessionAdded", "sessionAdded"],
    );
    assertEqual(SessionSlot.prescribedRows(slot).length, 3);
    assertEqual(SessionSlot.setCount(slot), 5);
  });

  test("testAnAddedSetStartsFromTheMostRecentWrittenSet", () => {
    let slot = freshSlot();
    slot = write(slot, { row: 0, weight: 100, reps: 6 });
    slot = write(slot, { row: 1, weight: 97.5, reps: 8 });

    const [next, row] = SessionSlot.addSet(slot);
    assertEqual(row.weightKg, 97.5, "the weight actually lifted last, not the pre-fill");
    assertEqual(SessionSlot.mostRecentWrittenSet(next)?.reps, 8, "and the sheet repeats its reps");
  });

  test("testBeforeAnythingIsWrittenItTakesTheLastRowsPrefill", () => {
    const slot = freshSlot();
    assertEqual(SessionSlot.addSet(slot, { fallbackWeightKg: 60 })[1].weightKg, 100);
  });

  test("testOnASubstituteWithNoRowsItNeverCarriesTheOriginsWeight", () => {
    let slot = freshSlot();
    for (const row of [0, 1, 2]) slot = write(slot, { row, reps: 8 });
    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    assertTrue(slot.active.sets.length === 0);

    const [, addedRow] = SessionSlot.addSet(slot, { fallbackWeightKg: 32 });
    assertEqual(addedRow.weightKg, 32, "§12.3: never the barbell's 100 kg");
    assertEqual(addedRow.substitutedFrom, "flat-bench");
  });

  // MARK: Logging

  test("testALoggedAddedSetIsOrdinaryWork", () => {
    let slot = freshSlot();
    for (const row of [0, 1, 2]) slot = write(slot, { row, reps: 8 });
    slot = added(slot);
    slot = write(slot, { row: 3, weight: 90, reps: 10, rir: 2 });

    assertFalse(SessionSlot.hasOpenSets(slot));
    assertEqual(SessionSlot.loggedSetCount(slot), 4);
    assertEqual(SessionSlot.loggedPrescribedSetCount(slot), 3);
    const written = SessionSlot.results(slot).flatMap((r) => r.sets);
    assertEqual(
      written.map((s) => s.origin),
      ["prescribed", "prescribed", "prescribed", "sessionAdded"],
      "it goes into history",
    );
    assertEqual(RecordsEngine.volumeLoad(written), 3300, "and into volume");
  });

  test("testAnAddedSetCanSetARealRecord", () => {
    const reference = history([logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8)]);
    let slot = freshSlot();
    for (const row of [0, 1, 2]) slot = write(slot, { row, reps: 8 });
    slot = added(slot);
    slot = write(slot, { row: 3, weight: 105, reps: 3 });

    assertTrue(
      RecordsEngine.isLoadPR({
        set: slot.active.sets[3],
        history: reference,
        earlierInSession: slot.active.sets.slice(0, 3),
      }),
    );
    assertEqual(
      RecordsEngine.record({ for: SessionSlot.results(slot).flatMap((r) => r.sets), history: reference })?.type,
      RecordType.load,
    );
  });

  test("testRIRIsAskedOnTheLastPrescribedSetAndOnEveryAddedSet", () => {
    let slot = freshSlot();
    assertEqual([0, 1, 2].map((at) => SessionSlot.asksForRIR(slot, { at })), [false, false, true]);

    slot = added(slot);
    slot = added(slot);
    assertEqual(
      [0, 1, 2, 3, 4].map((at) => SessionSlot.asksForRIR(slot, { at })),
      [false, false, true, true, true],
      "adding a set never takes the question away from set 3",
    );
  });

  test("testAnAddedRowSaysExtraWhereTheColumnWouldBeEmpty", () => {
    let slot = freshSlot();
    slot = added(slot);
    const rows = SetRowPresenter.rows({
      sets: slot.active.sets,
      reference: undefined,
      history: ExerciseHistory.make({ exerciseID: "flat-bench", modifiers: SetModifiers.none, appearances: [] }),
      activeIndex: 0,
    });

    assertEqual(rows.map((r) => r.isAdded), [false, false, false, true]);
    assertEqual(rows.map((r) => r.indexLabel), ["1", "2", "3", "4"]);
    assertEqual(rows[2].delta, SetDelta.none);
    assertEqual(rows[3].delta, SetDelta.added);
    assertFalse(rows[3].isWarmup);
  });

  // MARK: Removing

  test("testAnUnloggedAddedSetIsRemovedOutright", () => {
    let slot = freshSlot();
    slot = added(slot);
    const [afterFive, five] = SessionSlot.addSet(slot);
    slot = afterFive;

    const [next, removedValue] = SessionSlot.removeAddedSet(slot, { at: 3 });
    slot = next;
    const removed = unwrap(removedValue);
    assertFalse(LoggedSet.isLogged(removed.set));
    assertEqual(slot.active.sets.length, 4);
    assertEqual(slot.active.sets[3].id, five.id, "set 5 moves up");
    assertEqual(slot.active.sets.map((s) => s.index), [0, 1, 2, 3], "and the numbers follow the rows");
    assertEqual(SessionSlot.setCount(slot), 4);
  });

  test("testAPrescribedSetIsNeverRemoved", () => {
    let slot = freshSlot();
    slot = added(slot);

    let removed;
    [slot, removed] = SessionSlot.removeAddedSet(slot, { at: 2 });
    assertNil(removed);
    [slot, removed] = SessionSlot.removeAddedSet(slot, { at: 7 });
    assertNil(removed);
    assertEqual(slot.active.sets.length, 4);
  });

  test("testALoggedAddedSetComesBackExactlyOnUndo", () => {
    let slot = freshSlot();
    for (const row of [0, 1, 2]) slot = write(slot, { row, reps: 8 });
    slot = added(slot);
    slot = added(slot);
    slot = write(slot, { row: 3, weight: 90, reps: 10, rir: 1 });
    const before = slot.active;

    const [next, removedValue] = SessionSlot.removeAddedSet(slot, { at: 3 });
    slot = next;
    const removed = unwrap(removedValue);
    assertEqual(removed.set.reps, 10);
    assertEqual(SessionSlot.loggedSetCount(slot), 3);

    slot = SessionSlot.restore(slot, removed);
    assertEqual(slot.active, before, "logged numbers, position and set numbers all come back");
    slot = SessionSlot.restore(slot, removed);
    assertEqual(slot.active, before, "a second undo never duplicates it");
  });

  test("testARemovedSetNeverComesBackOnAnotherExercise", () => {
    let slot = freshSlot();
    slot = added(slot);
    slot = write(slot, { row: 3, weight: 90, reps: 10 });
    const [next, removedValue] = SessionSlot.removeAddedSet(slot, { at: 3 });
    slot = next;
    const removed = unwrap(removedValue);

    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    slot = SessionSlot.restore(slot, removed);
    assertFalse(slot.active.sets.some((s) => s.id === removed.set.id));
  });

  // MARK: Pause, resume and a cold relaunch

  test("testAddedSetsSurviveAPauseAndResume", () => {
    const { snapshot, slot } = pausedSnapshot();
    let state = LegacyState.make({ raw: {} });
    state = LegacyAdapter.applyActiveSession({ activeSession: snapshot, to: state });

    const resumed = unwrap(LegacyAdapter.activeSession({ from: state })?.slots?.[0]);
    assertEqual(resumed, slot);
    assertEqual(
      resumed.active.sets.map((s) => s.origin),
      ["prescribed", "prescribed", "prescribed", "sessionAdded", "sessionAdded"],
    );
    assertEqual(resumed.active.sets[3].reps, 10, "the logged extra set");
    assertFalse(LoggedSet.isLogged(resumed.active.sets[4]), "and the open one, still open");
  });

  /**
   * The device's store and the account both hold bytes. Nothing added may
   * be lost in them.
   */
  test("testAddedSetsSurviveAColdRelaunch", () => {
    const { snapshot, slot } = pausedSnapshot();
    let state = LegacyState.make({ raw: {} });
    state = LegacyAdapter.applyActiveSession({ activeSession: snapshot, to: state });

    const cold = unwrap(LegacyAdapter.activeSession({ from: LegacyState.fromData(LegacyState.encoded(state)) }));
    assertEqual(cold.slots?.[0], slot);
    assertEqual(ActiveSessionSnapshot.loggedSetCount(cold), 4);
    assertEqual(ActiveSessionSnapshot.plannedSetCount(cold), 5, "the resume card counts the added rows");
  });

  test("testSetsSavedBeforeOriginExistedReadAsPrescribed", () => {
    let slot = freshSlot();
    slot = write(slot, { row: 0, reps: 6 });
    const json = unwrap(JSONValue.objectValue(JSON.parse(JSON.stringify(SessionSlot.encode(slot))) as JSONValue));
    const active = unwrap(JSONValue.objectValue(json["active"]));
    const rows = unwrap(JSONValue.arrayValue(active["sets"])).map((row) => unwrap(JSONValue.objectValue(row)));
    assertTrue(rows.every((row) => row["origin"] !== undefined));
    const oldRows = rows.map((row): JSONObject => {
      const old = { ...row };
      delete old["origin"];
      return old;
    });
    const oldJSON: JSONObject = { ...json, active: { ...active, sets: oldRows } };

    const decoded = SessionSlot.decode(JSON.parse(JSON.stringify(oldJSON)) as JSONValue);
    assertEqual(decoded.active.sets.map((s) => s.origin), ["prescribed", "prescribed", "prescribed"]);
    assertEqual(decoded.active.sets[0].reps, 6);
  });

  // MARK: Substitution and undo

  test("testATemporarySwapKeepsLoggedAddedSetsAndMovesOpenOnes", () => {
    let slot = freshSlot();
    slot = write(slot, { row: 0, reps: 6 });
    slot = write(slot, { row: 1, reps: 8 });
    slot = added(slot);
    slot = write(slot, { row: 3, weight: 90, reps: 10 });
    slot = added(slot);

    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });

    assertEqual(slot.preserved.map((r) => r.exerciseID), ["flat-bench"]);
    assertEqual(
      slot.preserved[0]?.sets.map((s) => s.origin),
      ["prescribed", "prescribed", "sessionAdded"],
      "logged work stays with bench press, the extra set included",
    );
    assertEqual(
      slot.active.sets.map((s) => s.origin),
      ["prescribed", "sessionAdded"],
      "open rows move, and the extra one is still extra",
    );
    assertEqual(slot.active.sets.map((s) => s.index), [0, 1]);
    assertEqual(slot.active.prescription, [bench.sets[2]], "only the prescribed row brings a prescription");
    assertTrue(slot.active.sets.every((s) => !LoggedSet.isLogged(s) && s.substitutedFrom === "flat-bench"));
    assertEqual(SessionSlot.setCount(slot), 5, "nothing lost, nothing invented");
    assertEqual(SessionSlot.prescribedSetCount(slot), 3);
    assertEqual(SessionSlot.loggedSetCount(slot), 3);
  });

  test("testAPermanentReplacementCarriesOpenAddedRowsUnmarked", () => {
    let slot = freshSlot();
    slot = added(slot);
    slot = SessionSlot.swap(slot, { to: "chest-press-machine", name: "Converging chest press", temporary: false });

    assertEqual(slot.active.sets.map((s) => s.origin), ["prescribed", "prescribed", "prescribed", "sessionAdded"]);
    assertTrue(slot.active.sets.every((s) => s.substitutedFrom === undefined));
  });

  test("testUndoingTheSwapBringsBackTheAddedRowsAndKeepsTheSubstitutesWork", () => {
    let slot = freshSlot();
    slot = write(slot, { row: 0, reps: 6 });
    slot = added(slot);
    slot = write(slot, { row: 3, weight: 90, reps: 10 });
    slot = added(slot);
    const beforeSwap = slot.active;

    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    assertEqual(slot.active.sets.map((s) => s.origin), ["prescribed", "prescribed", "sessionAdded"]);
    slot = write(slot, { row: 0, weight: 36, reps: 8 });
    slot = write(slot, { row: 2, weight: 36, reps: 10 });

    let undone;
    [slot, undone] = SessionSlot.undo(slot);
    assertTrue(undone);
    assertEqual(slot.active, beforeSwap, "bench press comes back with its added rows, logged and open");
    assertEqual(slot.preserved.map((r) => r.exerciseID), ["db-bench"]);
    assertEqual(slot.preserved[0]?.sets.map((s) => s.origin), ["prescribed", "sessionAdded"]);
    assertEqual(SessionSlot.loggedSetCount(slot), 4, "nothing written on either side disappears");
  });

  // MARK: Completion

  test("testCompletionIsMeasuredAgainstThePrescription", () => {
    let benchSlot = freshSlot();
    for (const row of [0, 1, 2]) benchSlot = write(benchSlot, { row, reps: 8 });
    benchSlot = added(benchSlot);
    benchSlot = write(benchSlot, { row: 3, weight: 90, reps: 10 });

    let flySlot = SessionSlot.make({ position: 1, plan: fly, exerciseName: "Pec fly", prefillWeight: 40 });
    flySlot = write(flySlot, { row: 0, weight: 40, reps: 12 });
    flySlot = write(flySlot, { row: 1, weight: 40, reps: 12 });
    flySlot = added(flySlot);

    assertEqual(SessionSlot.completion({ of: [benchSlot, flySlot] }), 83, "5 of 6 prescribed sets");
    const snapshot = ActiveSessionSnapshot.make({
      dayID: "push",
      dayLabel: "Push",
      startedAt: new Date(),
      currentIndex: 1,
      results: [...SessionSlot.results(benchSlot), ...SessionSlot.results(flySlot)],
      slots: [benchSlot, flySlot],
    });
    assertEqual(ActiveSessionSnapshot.loggedSetCount(snapshot), 6);
    assertEqual(ActiveSessionSnapshot.plannedSetCount(snapshot), 8, "the counter reads 6/8: every row counts there");
    assertEqual(ActiveSessionSnapshot.finishedSession(snapshot).completion, 83);

    flySlot = write(flySlot, { row: 3, weight: 40, reps: 12 });
    assertEqual(
      SessionSlot.completion({ of: [benchSlot, flySlot] }),
      83,
      "an extra set cannot finish an unfinished prescription",
    );

    flySlot = write(flySlot, { row: 2, weight: 40, reps: 12 });
    flySlot = added(flySlot);
    assertEqual(
      SessionSlot.completion({ of: [benchSlot, flySlot] }),
      100,
      "and an extra set left open is not a missed set",
    );
  });

  test("testFinishingKeepsEveryAddedSetThatWasLogged", () => {
    const finished = ActiveSessionSnapshot.finishedSession(pausedSnapshot().snapshot);
    assertEqual(
      finished.results.flatMap((r) => r.sets).map((s) => s.origin),
      ["prescribed", "prescribed", "prescribed", "sessionAdded"],
    );
    assertEqual(finished.completion, 100);
  });

  // MARK: The program

  test("testAddingSetsNeverChangesThePrescription", () => {
    let slot = freshSlot();
    slot = added(slot);
    slot = added(slot);

    assertEqual(slot.plan, bench);
    assertEqual(SessionSlot.activePlanned(slot), bench, "what every engine reads as the prescription is unchanged");
    assertEqual(SessionSlot.openPrescription(slot), bench.sets, "and only prescribed rows carry one");
  });

  test("testSavingASessionWithAddedSetsLeavesThePlanUntouched", () => {
    const plan: JSONValue = [
      {
        id: "push",
        exercises: [
          {
            id: "flat-bench",
            prescription: "1×5–6 + 2×6–8",
          },
        ],
      },
    ];
    let state = LegacyState.make({ raw: { plan } });
    const before = LegacyAdapter.plan({ from: state });

    state = applySessions([ActiveSessionSnapshot.finishedSession(pausedSnapshot().snapshot)], state);
    const reloaded = LegacyState.fromData(LegacyState.encoded(state));

    assertEqual(LegacyState.get(reloaded, "plan"), plan);
    assertEqual(LegacyAdapter.plan({ from: reloaded }), before);
  });

  test("testTheNextSessionIsStillBuiltFromThreeSets", () => {
    const withExtras = history([
      logged(0, 100, 6),
      logged(1, 100, 8),
      logged(2, 100, 8),
      logged(3, 90, 10, { origin: "sessionAdded" }),
    ]);
    const proposal = ProgressionEngine.proposal({ planned: bench, exercise: benchExercise, history: withExtras });

    assertEqual(proposal.setTargets?.length, 3);
    assertEqual(
      SessionSlot.make({ position: 0, plan: bench, exerciseName: "Flat bench press" }).active.sets.length,
      3,
    );
  });

  // MARK: Progression

  test("testAnExtraSetNeverFillsASkippedPrescribedSlot", () => {
    const appearance = ExerciseAppearance.make({
      date: new Date(),
      sets: [logged(0, 100, 6), logged(1, 100, 8), logged(3, 100, 8, { origin: "sessionAdded" })],
    });

    assertEqual(
      ProgressionEngine.prescribedSlots(appearance, { planned: bench }).map((s) => s?.index),
      [0, 1, undefined],
    );
    assertFalse(ProgressionEngine.qualifies(appearance, { planned: bench }));
  });

  /**
   * iOS saves only written sets, so a skipped set 3 leaves no row and the
   * extra set comes back numbered as set 3. Its origin is what keeps it
   * out of the empty slot.
   */
  test("testAfterASaveAndReloadAnExtraSetStillCannotEarnTheIncrease", () => {
    let state = LegacyState.make({ raw: {} });
    state = applySessions(
      sessions([logged(0, 100, 6), logged(1, 100, 8), logged(3, 100, 8, { origin: "sessionAdded" })]),
      state,
    );
    const read = LegacyAdapter.sessions({ from: LegacyState.fromData(LegacyState.encoded(state)) });
    const reloaded = ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: read });

    const mostRecent = ExerciseHistory.mostRecent(reloaded);
    assertEqual(mostRecent?.sets.map((s) => s.index), [0, 1, 2], "the number the extra set comes back with");
    assertEqual(mostRecent?.sets[mostRecent.sets.length - 1]?.origin, "sessionAdded");
    const proposal = ProgressionEngine.proposal({ planned: bench, exercise: benchExercise, history: reloaded });
    assertNotEqual(proposal.tone, "ready");
    assertEqual(proposal.weightKg, 100, "no increase earned by an extra set");
  });

  test("testALighterExtraSetNeitherBlocksNorFakesAnEarnedIncrease", () => {
    const earned = history([
      logged(0, 100, 6),
      logged(1, 100, 8),
      logged(2, 100, 8),
      logged(3, 80, 12, { origin: "sessionAdded" }),
    ]);
    const proposal = ProgressionEngine.proposal({ planned: bench, exercise: benchExercise, history: earned });

    assertEqual(proposal.tone, "ready", "the prescription was met; the back-off set is extra");
    assertEqual(proposal.weightKg, 102.5);
    assertEqual(proposal.setTargets, [5, 6, 6]);
  });

  test("testAnUnmarkedWebExtraRowPastThePrescriptionStaysOut", () => {
    const web = history([logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8), logged(3, 80, 12)]);
    assertEqual(ProgressionEngine.proposal({ planned: bench, exercise: benchExercise, history: web }).tone, "ready");
  });

  test("testTheAdviceLineIsJudgedOnThePrescribedSetsOnly", () => {
    const reference = history([logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8)]);
    const advice = (sets: LoggedSet[]) =>
      SetRowPresenter.adviceLine({ sets, planned: bench, exercise: benchExercise, history: reference });

    assertEqual(
      advice([logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8), logged(3, 100, 4, { origin: "sessionAdded" })]),
      "All reps done. Next time 102.5 kg.",
      "a short extra set does not take away what the prescription earned",
    );
    assertEqual(
      advice([logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 5), logged(3, 100, 8, { origin: "sessionAdded" })]),
      "Not all reps done. Same weight next time.",
      "and a strong one does not make up for a missed set",
    );
    assertNotNil(
      advice([
        logged(0, 100, 6),
        logged(1, 100, 8),
        logged(2, 100, 8),
        LoggedSet.make({ index: 3, weightKg: 100, origin: "sessionAdded" }),
      ]),
      "an open extra row does not hold the advice back",
    );
    assertNil(
      advice([
        logged(0, 100, 6),
        logged(1, 100, 8),
        LoggedSet.make({ index: 2, weightKg: 100 }),
        logged(3, 100, 8, { origin: "sessionAdded" }),
      ]),
      "while set 3 is open there is nothing to judge yet",
    );
  });

  // MARK: The web blob

  test("testOnlyAddedSetsCarryAnOriginInTheWebBlob", () => {
    const session = TrainingSession.make({
      id: "1",
      date: new Date(),
      dayID: "push",
      dayLabel: "Push",
      completion: 100,
      results: [
        ExerciseResult.make({
          exerciseID: "flat-bench",
          name: "Flat bench press",
          sets: [logged(0, 100, 6), logged(1, 90, 10, { origin: "sessionAdded" })],
        }),
      ],
    });
    const results = JSONValue.arrayValue(JSONValue.get(LegacyAdapter.jsonValueSession(session), "results"));
    const rows = JSONValue.arrayValue(JSONValue.get(results?.[0], "sets"));
    assertNil(JSONValue.get(rows?.[0], "origin"), "a prescribed set keeps the web app's exact shape");
    assertEqual(JSONValue.get(rows?.[1], "origin"), "sessionAdded");

    let state = LegacyState.make({ raw: {} });
    state = applySessions([session], state);
    const read = LegacyAdapter.sessions({ from: LegacyState.fromData(LegacyState.encoded(state)) });
    assertEqual(read[0]?.results[0]?.sets.map((s) => s.origin), ["prescribed", "sessionAdded"]);
  });

  // MARK: - Removing a planned set for today

  test("testAnOpenPrescribedSetCanBeDroppedForTodayAndPutBack", () => {
    let slot = freshSlot();
    slot = write(slot, { row: 0, reps: 6 });
    const [next, removedValue] = SessionSlot.removeSet(slot, { at: 2 });
    slot = next;
    const removed = unwrap(removedValue);
    assertEqual(slot.active.sets.length, 2);
    assertEqual(slot.active.prescription.length, 2);
    assertEqual(SessionSlot.prescribedSetCount(slot), 2);
    assertEqual(removed.prescription?.repRange, closedRange(6, 8));

    slot = SessionSlot.restore(slot, removed);
    assertEqual(slot.active.sets.length, 3);
    assertEqual(slot.active.prescription, bench.sets);
    assertEqual(slot.active.sets.map((s) => s.index), [0, 1, 2]);
  });

  test("testLoggedPrescribedSetsAndTheLastRowStay", () => {
    let slot = freshSlot();
    slot = write(slot, { row: 0, reps: 6 });
    let removed;
    [slot, removed] = SessionSlot.removeSet(slot, { at: 0 });
    assertNil(removed);
    [slot, removed] = SessionSlot.removeSet(slot, { at: 2 });
    assertNotNil(removed);
    [slot, removed] = SessionSlot.removeSet(slot, { at: 1 });
    assertNotNil(removed);
    [slot, removed] = SessionSlot.removeSet(slot, { at: 0 });
    assertNil(removed);
    assertFalse(SessionSlot.hasOpenSets(slot));
  });
});
