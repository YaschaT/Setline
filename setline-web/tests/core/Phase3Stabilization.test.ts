// Port of ios/SetlineCore/Tests/SetlineCoreTests/Phase3StabilizationTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertFalse, assertNil, assertNotNil, assertTrue } from "../helpers";
import { Fixtures } from "./Fixtures";
import { ExerciseCatalog } from "../../src/core/Catalog/ExerciseCatalogV1";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { ActiveSessionSnapshot } from "../../src/core/Domain/ActiveSession";
import { ExerciseResult, LoggedSet, PlannedExercise, SetPrescription } from "../../src/core/Domain/Model";
import { PainRegion } from "../../src/core/Domain/PainFlag";
import { SessionSlot } from "../../src/core/Domain/SessionSlot";
import { CustomExercise, ProgramReplacement } from "../../src/core/Domain/Substitution";
import { SetModifiers } from "../../src/core/Domain/Vocabulary";
import type { JSONObject, JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { ExerciseHistory } from "../../src/core/Engine/ExerciseHistory";
import { ProgressionEngine } from "../../src/core/Engine/ProgressionEngine";
import { ReorderPlanner } from "../../src/core/Engine/ReorderPlan";
import { SetRowPresenter } from "../../src/core/Engine/SetRowPresentation";
import { SubstitutionRanker, SwapContext } from "../../src/core/Engine/SubstitutionRanking";
import { closedRange } from "../../src/core/Support/range";

/** `slot.active.sets[row].weightKg = …` / `.reps = …`, as a new slot (value semantics). */
function edit(slot: SessionSlot, row: number, patch: { weightKg?: number; reps?: number }): SessionSlot {
  const sets = [...slot.active.sets];
  sets[row] = { ...sets[row], ...patch };
  return { ...slot, active: { ...slot.active, sets } };
}

/** JSONEncoder/JSONDecoder with `.iso8601` dates: a round trip through bytes. */
const bytes = (value: JSONValue): JSONValue => JSON.parse(JSON.stringify(value)) as JSONValue;

// MARK: - P0-1 · Logged work is never discarded

describe("SessionSlotTests", () => {
  const bench = PlannedExercise.make({
    exerciseID: "flat-bench",
    role: "primaryStrength",
    sets: [
      SetPrescription.make({ repRange: closedRange(5, 6), targetRIR: closedRange(1, 2) }),
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
    ],
  });

  const freshSlot = () => SessionSlot.make({ position: 0, plan: bench, exerciseName: "Flat bench press", prefillWeight: 102.5 });

  const write = (slot: SessionSlot, row: number, weight: number, reps: number) => edit(slot, row, { weightKg: weight, reps });

  test("testSwapAfterSetOneKeepsSetOneOnTheOrigin", () => {
    let slot = freshSlot();
    slot = write(slot, 0, 102.5, 5);
    const setOne = slot.active.sets[0];

    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });

    assertEqual(slot.preserved.map((r) => r.exerciseID), ["flat-bench"]);
    assertEqual(slot.preserved[0]?.sets, [setOne]);
    assertEqual(slot.active.exerciseID, "db-bench");
    assertEqual(slot.active.sets.length, 2, "only the two open rows move");
    assertEqual(slot.active.prescription, bench.sets.slice(1, 3), "each row keeps its own prescription");
    assertTrue(slot.active.sets.every((s) => !LoggedSet.isLogged(s) && s.substitutedFrom === "flat-bench"));
    assertEqual(SessionSlot.loggedSetCount(slot), 1);
    assertEqual(SessionSlot.setCount(slot), 3);
    assertEqual(SessionSlot.results(slot).map((r) => r.exerciseID), ["flat-bench"]);
  });

  test("testSwapAfterMultipleSetsMovesOnlyTheRemainingSet", () => {
    let slot = freshSlot();
    slot = write(slot, 0, 102.5, 5);
    slot = write(slot, 1, 102.5, 6);

    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });

    assertEqual(slot.preserved[0]?.sets.length, 2);
    assertEqual(slot.active.sets.length, 1);
    assertEqual(slot.active.prescription, [bench.sets[2]]);
    assertEqual(SessionSlot.loggedSetCount(slot), 2);
    assertEqual(SessionSlot.setCount(slot), 3);
  });

  test("testUndoAfterSubstituteSetsWereLoggedKeepsBothSides", () => {
    let slot = freshSlot();
    slot = write(slot, 0, 102.5, 5);
    const beforeSwap = slot.active;
    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    slot = write(slot, 0, 36, 8);
    const substituteSet = slot.active.sets[0];

    let undone: boolean;
    [slot, undone] = SessionSlot.undo(slot);
    assertTrue(undone);

    assertEqual(slot.active, beforeSwap, "the origin comes back exactly as it was, open rows included");
    assertEqual(slot.preserved.map((r) => r.exerciseID), ["db-bench"]);
    assertEqual(slot.preserved[0]?.sets, [substituteSet]);
    assertEqual(SessionSlot.loggedSetCount(slot), 2, "nothing written on either side disappears");
    assertEqual(new Set(SessionSlot.results(slot).map((r) => r.exerciseID)), new Set(["flat-bench", "db-bench"]));
  });

  test("testUndoBeforeAnythingIsLoggedLeavesNoTrace", () => {
    let slot = freshSlot();
    const original = slot.active;
    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    [slot] = SessionSlot.undo(slot);
    assertEqual(slot.active, original);
    assertTrue(slot.preserved.length === 0);
    assertFalse(SessionSlot.canUndo(slot));
  });

  test("testChainedSwapsAndUndosNeverLoseWork", () => {
    let slot = freshSlot();
    slot = write(slot, 0, 102.5, 5);
    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    slot = write(slot, 0, 36, 8);
    slot = SessionSlot.swap(slot, { to: "chest-press-machine", name: "Converging chest press", temporary: true });
    slot = write(slot, 0, 70, 8);

    assertEqual(SessionSlot.loggedSetCount(slot), 3);
    assertEqual(slot.active.substitutedFromID, "flat-bench", "a stand-in always names the programmed exercise");

    [slot] = SessionSlot.undo(slot);
    assertEqual(slot.active.exerciseID, "db-bench");
    assertEqual(SessionSlot.loggedSetCount(slot), 3);

    [slot] = SessionSlot.undo(slot);
    assertEqual(slot.active.exerciseID, "flat-bench");
    assertEqual(SessionSlot.loggedSetCount(slot), 3);
    assertEqual(SessionSlot.results(slot).flatMap((r) => r.sets).length, 3);
    assertEqual(
      new Set(SessionSlot.results(slot).map((r) => r.exerciseID)),
      new Set(["flat-bench", "db-bench", "chest-press-machine"]),
    );
  });

  test("testPermanentReplacementMarksNothingAndKeepsTheOldWork", () => {
    let slot = freshSlot();
    slot = write(slot, 0, 102.5, 5);
    slot = SessionSlot.swap(slot, { to: "chest-press-machine", name: "Converging chest press", temporary: false });
    assertNil(slot.active.substitutedFromID);
    assertTrue(slot.active.sets.every((s) => s.substitutedFrom === undefined));
    assertEqual(slot.preserved[0]?.exerciseID, "flat-bench");
    assertTrue(SessionSlot.lastChangeWasPermanent(slot));
  });

  test("testSwappingACompleteExerciseMovesNoRows", () => {
    let slot = freshSlot();
    for (let row = 0; row < 3; row++) slot = write(slot, row, 102.5, 6);
    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    assertTrue(slot.active.sets.length === 0);
    assertEqual(SessionSlot.loggedSetCount(slot), 3);
  });

  test("testPrefillNeverTouchesAWrittenRow", () => {
    let slot = freshSlot();
    slot = write(slot, 0, 102.5, 5);
    slot = SessionSlot.prefillOpenSets(slot, { weightKg: 90 });
    assertEqual(slot.active.sets[0].weightKg, 102.5);
    assertEqual(slot.active.sets[1].weightKg, 90);
  });
});

// MARK: - P0-2 · Swaps survive pause and a cold relaunch

describe("SlotSnapshotTests", () => {
  function pausedSession(): ActiveSessionSnapshot {
    const push = PlanCatalog.personal.find((d) => d.id === "push")!;
    const slots = push.exercises.map((planned, index) =>
      SessionSlot.make({
        position: index, plan: planned,
        exerciseName: ExerciseCatalog.exercise(planned.exerciseID)!.name,
        prefillWeight: 50,
      }),
    );
    // Flat bench: one set, a temporary swap, one set on the substitute.
    slots[0] = edit(slots[0], 0, { reps: 5 });
    slots[0] = SessionSlot.swap(slots[0], { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    slots[0] = edit(slots[0], 0, { weightKg: 36 });
    slots[0] = edit(slots[0], 0, { reps: 8 });
    // Pec fly: swapped to a custom exercise.
    slots[2] = SessionSlot.swap(slots[2], {
      to: CustomExercise.identifier({ for: "Cable fly low" }), name: "Cable fly low", temporary: true,
    });

    return ActiveSessionSnapshot.make({
      dayID: "push", dayLabel: "Push", startedAt: new Date(), currentIndex: 2,
      results: slots.flatMap((s) => SessionSlot.results(s)), activeSeconds: 900, slots,
    });
  }

  test("testSubstituteAndCustomExerciseSurviveThePause", () => {
    let state = LegacyState.make({ raw: {} });
    state = LegacyAdapter.applyActiveSession({ activeSession: pausedSession(), to: state });
    const restored = LegacyAdapter.activeSession({ from: state });

    assertEqual(restored?.slots?.[0].active.exerciseID, "db-bench");
    assertEqual(restored?.slots?.[0].active.substitutedFromID, "flat-bench");
    assertEqual(restored?.slots?.[2].active.exerciseID, "custom:cable-fly-low");
    const first = restored?.slots?.[0];
    assertEqual(first !== undefined ? SessionSlot.canUndo(first) : undefined, true, "undo still works after resuming");
  });

  /** A cold relaunch is a decode from bytes. Nothing written may be lost in it. */
  test("testLoggedSubstituteSetsSurviveAColdRelaunch", () => {
    const cold = ActiveSessionSnapshot.decode(bytes(ActiveSessionSnapshot.encode(pausedSession())));

    assertEqual(ActiveSessionSnapshot.loggedSetCount(cold), 2);
    const bench = cold.slots?.[0];
    assertNotNil(bench);
    assertEqual(bench!.preserved[0]?.sets[0]?.reps, 5);
    assertEqual(bench!.active.sets[0]?.reps, 8);
    assertEqual(bench!.active.sets[0]?.substitutedFrom, "flat-bench");
  });

  test("testEndingAPausedSessionKeepsEverySideOfASwap", () => {
    const finished = ActiveSessionSnapshot.finishedSession(pausedSession());
    assertEqual(new Set(finished.results.map((r) => r.exerciseID)), new Set(["flat-bench", "db-bench"]));
    assertEqual(finished.results.flatMap((r) => r.sets).length, 2);
  });

  test("testSnapshotsWrittenBeforeSlotsStillDecode", () => {
    const legacy = ActiveSessionSnapshot.make({
      dayID: "push", dayLabel: "Push", startedAt: new Date(), currentIndex: 0,
      results: [ExerciseResult.make({
        exerciseID: "flat-bench", name: "Flat bench press",
        sets: [LoggedSet.make({ index: 0, weightKg: 100, reps: 6 })],
      })],
    });
    const data = JSON.stringify(ActiveSessionSnapshot.encode(legacy));
    assertFalse(data.includes("\"slots\""));
    const decoded = ActiveSessionSnapshot.decode(JSON.parse(data) as JSONValue);
    assertNil(decoded.slots);
    assertEqual(ActiveSessionSnapshot.loggedSetCount(decoded), 1);
  });
});

// MARK: - P0-4 · Each set gets its own target

describe("PerSetTargetTests", () => {
  const mixed = PlannedExercise.make({
    exerciseID: "flat-bench",
    role: "primaryStrength",
    sets: [
      SetPrescription.make({ repRange: closedRange(5, 6), targetRIR: closedRange(1, 2) }),
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
    ],
  });
  const bench = () => ExerciseCatalog.exercise("flat-bench")!;

  /** Three sessions at 100 kg, every set at the top of its own range. */
  function readyHistory(): ExerciseHistory {
    const sessions = [0, 1, 2].map((index) =>
      Fixtures.session({
        id: `s${index}`, daysAgo: (index + 1) * 3, exerciseID: "flat-bench",
        sets: [{ weight: 100, reps: 6, rir: 1 }, { weight: 100, reps: 8, rir: 1 }, { weight: 100, reps: 8, rir: 1 }],
      }),
    );
    return ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: sessions });
  }

  test("testReadyProposalTargetsEachSetsOwnRange", () => {
    const proposal = ProgressionEngine.proposal({ planned: mixed, exercise: bench(), history: readyHistory() });
    assertEqual(proposal.tone, "ready");
    assertEqual(proposal.setTargets, [5, 6, 6], "set 1's 5 must not leak into the 6–8 sets");
    assertTrue(proposal.body.includes("aim for 5 · 6 · 6"), proposal.body);
  });

  test("testUniformRangesStillReadAsOneNumber", () => {
    assertEqual(ProgressionEngine.repsLabel([6, 6, 6]), "6");
    assertEqual(ProgressionEngine.repsLabel([5, 6, 6]), "5 · 6 · 6");
  });

  /** The audit's finding, pinned: follow the pre-fill, never hear you missed. */
  test("testFollowingTheProposalIsNeverCalledAMiss", () => {
    const history = readyHistory();
    const proposal = ProgressionEngine.proposal({ planned: mixed, exercise: bench(), history });
    const targets = proposal.setTargets ?? [];
    assertEqual(targets.length, 3);
    const logged = targets.map((reps, index) => LoggedSet.make({ index, weightKg: proposal.weightKg, reps }));
    const advice = SetRowPresenter.adviceLine({
      sets: logged, planned: mixed, exercise: bench(), history, proposedTargets: targets,
    });
    assertEqual(advice, "On target. Next time 102.5 kg, aim for 6 · 8 · 8.");
  });

  test("testMissingAProposedTargetIsStillAMiss", () => {
    const logged = [5, 5, 5].map((reps, offset) => LoggedSet.make({ index: offset, weightKg: 102.5, reps }));
    assertEqual(
      SetRowPresenter.adviceLine({
        sets: logged, planned: mixed, exercise: bench(), history: readyHistory(), proposedTargets: [5, 6, 6],
      }),
      "Not all reps done. Same weight next time.",
    );
  });

  test("testTheTopOfEveryRangeStillEarnsTheIncrease", () => {
    const logged = [6, 8, 8].map((reps, offset) => LoggedSet.make({ index: offset, weightKg: 102.5, reps }));
    const advice = SetRowPresenter.adviceLine({
      sets: logged, planned: mixed, exercise: bench(), history: readyHistory(), proposedTargets: [5, 6, 6],
    });
    assertEqual(advice?.startsWith("All reps done."), true);
  });
});

// MARK: - P0-3 / P1 · Contexts that apply together, and only honest claims

describe("SwapContextTests", () => {
  const ids = (context: SwapContext) => SubstitutionRanker.rank(context).map((r) => r.exercise.id);

  test("testOccupiedAndPainApplyTogether", () => {
    const both = ids(SwapContext.make({
      currentExerciseID: "flat-bench", role: "primaryStrength",
      isOccupied: true, painfulLoadTags: PainRegion.loadTags("shoulder"),
    }));
    assertFalse(both.includes("close-grip-bench"), "same rack as the busy bench");
    assertFalse(both.includes("db-bench"), "loads the flagged shoulder");
    assertFalse(both.includes("dips"), "loads the flagged shoulder");
  });

  test("testAPainFlagNeverSwitchesOccupiedOff", () => {
    const context = SwapContext.make({
      currentExerciseID: "lat-pulldown", role: "secondaryCompound",
      isOccupied: true, painfulLoadTags: PainRegion.loadTags("knee"),
    });
    assertTrue(context.isOccupied);
    assertFalse(ids(context).includes("neutral-pulldown"), "the busy station is still excluded");
  });

  /** A flag that removes nothing from this list must not reshape it either. */
  test("testIrrelevantPainLeavesTheListUntouched", () => {
    const plain = ids(SwapContext.make({ currentExerciseID: "flat-bench", role: "primaryStrength" }));
    const knee = ids(SwapContext.make({
      currentExerciseID: "flat-bench", role: "primaryStrength", painfulLoadTags: PainRegion.loadTags("knee"),
    }));
    assertEqual(plain, knee);
  });

  test("testPainIsClaimedOnlyWhenItChangesTheList", () => {
    const fly = SwapContext.make({ currentExerciseID: "pec-fly", role: "isolation", painfulLoadTags: PainRegion.loadTags("shoulder") });
    assertTrue(SubstitutionRanker.painChangesRecommendations(fly, { tags: PainRegion.loadTags("shoulder") }));

    const bench = SwapContext.make({ currentExerciseID: "flat-bench", role: "primaryStrength", painfulLoadTags: PainRegion.loadTags("knee") });
    assertFalse(SubstitutionRanker.painChangesRecommendations(bench, { tags: PainRegion.loadTags("knee") }));
    assertFalse(
      SubstitutionRanker.painChangesRecommendations(bench, { tags: PainRegion.loadTags("hip") }),
      "a region without tags can never change a list",
    );
  });

  test("testOtherHasNoSentenceForm", () => {
    assertNil(PainRegion.sentenceName("other"), "'met je ergens anders' must be unwritable");
    assertEqual(PainRegion.sentenceName("shoulder"), "shoulder");
  });

  test("testExercisesAlreadyInTodaysSessionAreNeverSubstitutes", () => {
    const context = SwapContext.make({
      currentExerciseID: "flat-bench", role: "primaryStrength",
      excludedExerciseIDs: new Set(["incline-bench", "pec-fly"]),
    });
    assertFalse(ids(context).includes("incline-bench"));
  });

  test("testExclusionFollowsCanonicalIDs", () => {
    const context = SwapContext.make({
      currentExerciseID: "neutral-row", role: "secondaryCompound",
      excludedExerciseIDs: new Set(["upper-wide-row"]),
    });
    assertFalse(ids(context).includes("wide-row"), "an alias in the session excludes its canonical exercise");
  });

  test("testRecordedReasonReflectsBothContexts", () => {
    assertEqual(SwapContext.reason(SwapContext.make({
      currentExerciseID: "x", role: "accessory", isOccupied: true, painfulLoadTags: new Set(["gripLimited"]),
    })), "occupied");
    assertEqual(SwapContext.reason(SwapContext.make({
      currentExerciseID: "x", role: "accessory", painfulLoadTags: new Set(["gripLimited"]),
    })), "discomfort");
    assertEqual(SwapContext.reason(SwapContext.make({ currentExerciseID: "x", role: "accessory" })), "preference");
  });

  test("testNoReorderWhenTheCurrentExerciseIsComplete", () => {
    const bench = ExerciseCatalog.exercise("flat-bench")!;
    const fly = ExerciseCatalog.exercise("pec-fly")!;
    assertNil(ReorderPlanner.plan({
      current: bench, currentIndex: 0, currentIsComplete: true, later: [{ exercise: fly, role: "isolation", hasStarted: false }],
    }));
    assertNotNil(ReorderPlanner.plan({
      current: bench, currentIndex: 0, currentIsComplete: false, later: [{ exercise: fly, role: "isolation", hasStarted: false }],
    }));
  });
});

// MARK: - Program replacement undo, for the whole workout

describe("ReplacementUndoTests", () => {
  const bench = () => PlanCatalog.personal.find((d) => d.id === "push")!.exercises[0];
  const record = ProgramReplacement.make({
    originExerciseID: "flat-bench", substituteExerciseID: "chest-press-machine",
    scope: "thisPlan", dayID: "push",
  });

  const slot = () => SessionSlot.make({ position: 0, plan: bench(), exerciseName: "Flat bench press", prefillWeight: 100 });

  const replacementID = (s: SessionSlot) => {
    const r = SessionSlot.latestUndo(s)?.replacement;
    return r !== undefined ? ProgramReplacement.id(r) : undefined;
  };

  test("testAPermanentSwapCarriesItsProgramChange", () => {
    let s = slot();
    s = SessionSlot.swap(s, { to: "chest-press-machine", name: "Converging chest press", temporary: false, replacement: record });
    assertEqual(replacementID(s), ProgramReplacement.id(record));
    assertTrue(SessionSlot.lastChangeWasPermanent(s));
  });

  test("testATemporarySwapNeverCarriesOne", () => {
    let s = slot();
    s = SessionSlot.swap(s, { to: "db-bench", name: "Dumbbell bench press", temporary: true, replacement: record });
    assertNil(SessionSlot.latestUndo(s)?.replacement);
  });

  /**
   * The toast and the header line can both undo the same change. Whichever
   * fires second must do nothing — not reverse the change before it.
   */
  test("testAStaleUndoNeverReversesADifferentChange", () => {
    let s = slot();
    s = SessionSlot.swap(s, { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    s = SessionSlot.swap(s, { to: "chest-press-machine", name: "Converging chest press", temporary: false, replacement: record });
    const replacementChange = SessionSlot.latestUndo(s)!.id;

    let undone: boolean;
    [s, undone] = SessionSlot.undo(s, { ifLatestIs: replacementChange });
    assertTrue(undone, "header undo");
    [s, undone] = SessionSlot.undo(s, { ifLatestIs: replacementChange });
    assertFalse(undone, "late toast undo");
    assertEqual(s.active.exerciseID, "db-bench", "the earlier temporary swap is still in place");
  });

  /** "Until the workout ends" includes a pause and a cold launch. */
  test("testTheProgramChangeSurvivesAColdRelaunch", () => {
    let s = slot();
    s = SessionSlot.swap(s, { to: "chest-press-machine", name: "Converging chest press", temporary: false, replacement: record });
    let cold = SessionSlot.decode(bytes(SessionSlot.encode(s)));
    assertEqual(SessionSlot.latestUndo(cold)?.id, SessionSlot.latestUndo(s)?.id);
    assertEqual(replacementID(cold), ProgramReplacement.id(record));
    let undone: boolean;
    [cold, undone] = SessionSlot.undo(cold, { ifLatestIs: SessionSlot.latestUndo(s)?.id });
    assertTrue(undone);
    assertEqual(cold.active.exerciseID, "flat-bench");
  });

  /**
   * Undo points saved before they carried an id or a program change must
   * still decode — otherwise the whole paused session silently disappears.
   */
  test("testUndoPointsSavedBeforeThisChangeStillDecode", () => {
    let s = slot();
    s = SessionSlot.swap(s, { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    const json = bytes(SessionSlot.encode(s)) as JSONObject;
    const stack = json["undoStack"] as JSONObject[];
    assertNotNil(stack);
    json["undoStack"] = stack.map((point) => {
      const old: JSONObject = { ...point };
      delete old["id"];
      delete old["replacement"];
      return old;
    });
    let decoded = SessionSlot.decode(bytes(json));
    assertTrue(SessionSlot.canUndo(decoded));
    let undone: boolean;
    [decoded, undone] = SessionSlot.undo(decoded);
    assertTrue(undone);
    assertEqual(decoded.active.exerciseID, "flat-bench");
  });
});
