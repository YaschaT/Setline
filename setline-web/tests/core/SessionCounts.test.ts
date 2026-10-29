// Port of ios/SetlineCore/Tests/SetlineCoreTests/SessionCountsTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertNil, assertTrue } from "../helpers";
import { ActiveSessionSnapshot } from "../../src/core/Domain/ActiveSession";
import { ExerciseResult, LoggedSet, PlannedExercise, SetPrescription, TrainingSession } from "../../src/core/Domain/Model";
import { SessionSlot } from "../../src/core/Domain/SessionSlot";
import { JSONValue, type JSONObject } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { StateChange } from "../../src/core/Sync/StateChange";
import { StateMerge } from "../../src/core/Sync/StateMerge";
import { dateFromEpoch } from "../../src/core/Support/calendar";
import { closedRange } from "../../src/core/Support/range";

// MARK: - Stored set counts
//
// History shows "completed of planned" for a session saved with exact counts,
// and the stored completion percentage for every other session. Planned is the
// prescribed working sets; completed is how many of those were logged. Sets
// added during the session are in neither number.

describe("SessionCountsTests", () => {
  const benchPlan = PlannedExercise.make({
    exerciseID: "flat-bench",
    role: "primaryStrength",
    sets: [
      SetPrescription.make({ repRange: closedRange(5, 6), targetRIR: closedRange(1, 2) }),
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
      SetPrescription.make({ repRange: closedRange(6, 8), targetRIR: closedRange(1, 2) }),
    ],
  });
  const flyPlan = PlannedExercise.make({
    exerciseID: "pec-fly",
    role: "isolation",
    sets: Array.from({ length: 3 }, () => SetPrescription.make({ repRange: closedRange(10, 12), targetRIR: closedRange(1, 2) })),
  });

  const benchSlot = (): SessionSlot =>
    SessionSlot.make({ position: 0, plan: benchPlan, exerciseName: "Flat bench press", prefillWeight: 100 });

  /** `slot.active.sets[row].weightKg = weight; …reps = reps` on a copy. */
  const write = (slot: SessionSlot, a: { row: number; weight?: number; reps: number }): SessionSlot => {
    const sets = [...slot.active.sets];
    sets[a.row] = { ...sets[a.row], weightKg: a.weight ?? 100, reps: a.reps };
    return { ...slot, active: { ...slot.active, sets } };
  };

  const addSet = (slot: SessionSlot): SessionSlot => SessionSlot.addSet(slot)[0];

  const finished = (slots: SessionSlot[], id?: string): TrainingSession =>
    ActiveSessionSnapshot.finishedSession(
      ActiveSessionSnapshot.make({
        dayID: "push",
        dayLabel: "Push",
        startedAt: dateFromEpoch(1_789_000_000),
        currentIndex: 0,
        results: slots.flatMap((slot) => SessionSlot.results(slot)),
        activeSeconds: 1_800,
        slots,
      }),
      { id },
    );

  const storedSession = (extra: JSONObject): TrainingSession | undefined => {
    const object: JSONObject = {
      id: "s1",
      date: "2026-09-01T08:00:00.000Z",
      dayId: "push",
      dayLabel: "Push",
      completion: 50,
      results: [],
    };
    Object.assign(object, extra);
    return LegacyAdapter.session({ from: object });
  };

  // MARK: Counting

  test("testAddedSetsAreInNeitherNumber", () => {
    let bench = benchSlot();
    for (let row = 0; row < 3; row++) bench = write(bench, { row, reps: 8 });
    bench = addSet(bench);
    bench = write(bench, { row: 3, weight: 90, reps: 10 });
    bench = addSet(bench);

    let fly = SessionSlot.make({ position: 1, plan: flyPlan, exerciseName: "Pec fly", prefillWeight: 40 });
    fly = write(fly, { row: 0, weight: 40, reps: 12 });
    fly = addSet(fly);
    fly = write(fly, { row: 3, weight: 40, reps: 12 });

    const session = finished([bench, fly]);

    assertEqual(session.plannedSetCount, 6, "3 + 3 prescribed; the three added rows are not planned sets");
    assertEqual(session.completedSetCount, 4, "3 + 1 logged prescribed; the logged added sets are not among them");
    assertEqual(session.completion, 66, "the percentage says the same thing");
    assertEqual(
      session.results.flatMap((result) => result.sets).length,
      6,
      "while history keeps every logged set, added ones included",
    );
  });

  test("testALoggedAddedSetNeverCompletesAMissedPrescribedSet", () => {
    let bench = benchSlot();
    bench = write(bench, { row: 0, reps: 6 });
    bench = write(bench, { row: 1, reps: 8 });
    bench = addSet(bench);
    bench = write(bench, { row: 3, reps: 8 });

    const session = finished([bench]);

    assertEqual(session.completedSetCount, 2);
    assertEqual(session.plannedSetCount, 3);
  });

  test("testASwapKeepsCountingAgainstTheSamePrescription", () => {
    let slot = benchSlot();
    slot = write(slot, { row: 0, reps: 6 });
    slot = SessionSlot.swap(slot, { to: "db-bench", name: "Dumbbell bench press", temporary: true });
    slot = write(slot, { row: 0, weight: 36, reps: 8 });

    const session = finished([slot]);

    assertEqual(session.plannedSetCount, 3, "a swap moves the open sets; it adds and removes none");
    assertEqual(session.completedSetCount, 2, "one on bench press, one on the substitute");
  });

  test("testASnapshotSavedBeforeSlotsStoresNoExactCount", () => {
    const old = ActiveSessionSnapshot.make({
      dayID: "pull",
      dayLabel: "Pull",
      startedAt: new Date(),
      currentIndex: 0,
      results: [
        ExerciseResult.make({
          exerciseID: "lat-pulldown",
          name: "Lat pulldown",
          sets: [LoggedSet.make({ index: 0, weightKg: 60, reps: 8 }), LoggedSet.make({ index: 1, weightKg: 60, reps: 0 })],
        }),
      ],
    });

    const session = ActiveSessionSnapshot.finishedSession(old);

    assertNil(session.plannedSetCount, "its rows need not cover every exercise of the day");
    assertNil(session.completedSetCount);
    assertEqual(session.completion, 50, "so history shows the percentage it always had");
  });

  // MARK: Storing and reading

  test("testCountsTravelWithTheSessionThroughTheAccount", () => {
    let slot = benchSlot();
    slot = write(slot, { row: 0, reps: 6 });
    slot = write(slot, { row: 1, reps: 8 });
    const session = finished([slot], "ios-1");

    const stored = StateMerge.apply([StateChange.upsert(session)], { to: LegacyState.make({ raw: {} }) });
    const row = JSONValue.objectValue((JSONValue.arrayValue(LegacyState.get(stored, "sessions")) ?? [])[0]);
    assertTrue(row !== undefined);
    assertEqual(row!["iosPlannedSetCount"], 3);
    assertEqual(row!["iosCompletedSetCount"], 2);

    const read = LegacyAdapter.sessions({ from: LegacyState.fromData(LegacyState.encoded(stored)) })[0];
    assertTrue(read !== undefined);
    assertEqual(read!.plannedSetCount, 3);
    assertEqual(read!.completedSetCount, 2);
    assertEqual(read!.completion, 66);
  });

  test("testASessionWithoutCountsFallsBackToItsPercentage", () => {
    const web = storedSession({ completion: 75 });
    assertTrue(web !== undefined);

    assertNil(web!.plannedSetCount);
    assertNil(web!.completedSetCount);
    assertEqual(web!.completion, 75);
    assertNil(
      JSONValue.objectValue(LegacyAdapter.jsonValueSession(web!))?.["iosPlannedSetCount"],
      "and writing it back invents none",
    );
  });

  test("testCountsThatDoNotHoldTogetherAreIgnored", () => {
    const broken: JSONObject[] = [
      { iosPlannedSetCount: 6 },
      { iosCompletedSetCount: 4 },
      { iosPlannedSetCount: 4, iosCompletedSetCount: 6 },
      { iosPlannedSetCount: 0, iosCompletedSetCount: 0 },
      { iosPlannedSetCount: 6, iosCompletedSetCount: -1 },
      { iosPlannedSetCount: "zes", iosCompletedSetCount: 4 },
    ];
    for (const fields of broken) {
      const session = storedSession(fields);
      assertNil(session?.plannedSetCount, JSON.stringify(fields));
      assertNil(session?.completedSetCount, JSON.stringify(fields));
      assertEqual(session?.completion, 50, "the session itself still reads");
    }

    const whole = storedSession({ iosPlannedSetCount: 6, iosCompletedSetCount: 6 });
    assertEqual(whole?.plannedSetCount, 6);
    assertEqual(whole?.completedSetCount, 6);
  });

  /**
   * The merge drops these fields when a session's results change under
   * them. That only works if they are exactly the fields written here.
   */
  test("testTheWrittenCountsAreTheFieldsTheMergeTreatsAsDerived", () => {
    const session = TrainingSession.make({
      id: "s1",
      date: new Date(),
      dayID: "push",
      dayLabel: "Push",
      completion: 50,
      results: [],
      plannedSetCount: 6,
      completedSetCount: 3,
    });
    const written = Object.keys(JSONValue.objectValue(LegacyAdapter.jsonValueSession(session)) ?? {}).filter((key) =>
      key.startsWith("ios"),
    );

    assertEqual(new Set(written), new Set(StateMerge.derivedSessionFields));
  });
});
