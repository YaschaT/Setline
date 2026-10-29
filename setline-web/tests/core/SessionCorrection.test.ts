// Port of ios/SetlineCore/Tests/SetlineCoreTests/SessionCorrectionTests.swift.
import { describe, test } from "node:test";
import { assertClose, assertEqual, assertFalse, assertNil, assertNotEqual, assertNotNil } from "../helpers";
import { Exercise, PlannedExercise, SetPrescription } from "../../src/core/Domain/Model";
import { SetModifiers } from "../../src/core/Domain/Vocabulary";
import { Estimates } from "../../src/core/Engine/Estimates";
import { ExerciseHistory } from "../../src/core/Engine/ExerciseHistory";
import { ProgressionEngine } from "../../src/core/Engine/ProgressionEngine";
import { RecordsEngine } from "../../src/core/Engine/RecordsEngine";
import { JSONValue, type JSONObject } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { StrengthProgress } from "../../src/core/Progress/StrengthProgress";
import { SetCorrection } from "../../src/core/Sync/SetCorrection";
import { StateChange } from "../../src/core/Sync/StateChange";
import { StateMerge } from "../../src/core/Sync/StateMerge";
import { SyncQueue } from "../../src/core/Sync/SyncQueue";
import { closedRange } from "../../src/core/Support/range";

/**
 * Correcting a set that was logged days ago.
 *
 * Two things have to hold at once: the stored state must change in exactly
 * one place, and everything the app computes from sessions — volume, records,
 * the estimate, the next proposal — must read the corrected number without
 * anything being patched by hand.
 */
describe("SessionCorrectionTests", () => {
  // MARK: - Building a stored account

  const storedSet = (a: { weight: string; reps: string; rir?: number; extra?: JSONObject }): JSONValue => {
    const object: JSONObject = {
      weight: a.weight,
      reps: a.reps,
      pausedReps: "",
      pauseSeconds: "",
      pauseEnabled: false,
    };
    if (a.rir !== undefined) object["rir"] = a.rir;
    for (const [key, value] of Object.entries(a.extra ?? {})) object[key] = value;
    return object;
  };

  /**
   * A stored account with two sessions, carrying keys iOS does not model at
   * session, result and set level.
   */
  const account = (): LegacyState => {
    const older: JSONValue = {
      id: "s-1",
      date: "2026-09-05T17:00:00.000Z",
      dayId: "push",
      dayLabel: "Push",
      completion: 100,
      results: [
        {
          exerciseId: "flat-bench",
          name: "Flat bench press",
          sets: [storedSet({ weight: "100", reps: "6", rir: 2 })],
        },
      ],
    };
    const newer: JSONValue = {
      id: "s-2",
      date: "2026-09-12T17:00:00.000Z",
      dayId: "push",
      dayLabel: "Push",
      completion: 100,
      webOnlySessionKey: "keep me",
      results: [
        {
          exerciseId: "flat-bench",
          name: "Flat bench press",
          webOnlyResultKey: "keep me",
          sets: [
            storedSet({ weight: "100", reps: "6", rir: 2 }),
            storedSet({ weight: "105", reps: "6", rir: 1, extra: { webOnlySetKey: 7 } }),
            storedSet({ weight: "100", reps: "5" }),
          ],
        },
        {
          exerciseId: "incline-bench",
          name: "Incline bench press",
          sets: [storedSet({ weight: "70", reps: "8", rir: 2 })],
        },
      ],
    };
    return LegacyState.make({
      raw: {
        sessions: [newer, older],
        metrics: [{ id: "m-1", date: "2026-09-12", weight: 82 }],
        nutritionEntries: [{ id: "n-1", name: "Kwark" }],
        planMode: "personal",
      },
    });
  };

  const correction = (
    a: { weight?: number; reps?: number; rir?: number | null; setIndex?: number; exerciseID?: string; occurrence?: number } = {},
  ): SetCorrection =>
    SetCorrection.make({
      exerciseID: a.exerciseID ?? "flat-bench",
      occurrence: a.occurrence ?? 0,
      setIndex: a.setIndex ?? 1,
      weightKg: a.weight ?? 102.5,
      reps: a.reps ?? 5,
      rirReported: a.rir === null ? undefined : (a.rir ?? 1),
    });

  const apply = (corrections: SetCorrection[], state: LegacyState, sessionID = "s-2"): LegacyState =>
    StateMerge.apply([StateChange.correct(corrections, { sessionID })], { to: state });

  const sessionsOf = (state: LegacyState) => JSONValue.arrayValue(state.raw["sessions"]) ?? [];
  const idOf = (value: JSONValue | undefined) => JSONValue.stringValue(JSONValue.get(value, "id"));

  const sets = (state: LegacyState, session: string, result = 0): JSONValue[] => {
    const match = sessionsOf(state).find((value) => idOf(value) === session);
    const results = JSONValue.arrayValue(JSONValue.get(match, "results"));
    return JSONValue.arrayValue(JSONValue.get(results?.[result], "sets")) ?? [];
  };

  // MARK: - Reach

  test("testACorrectionReachesOnlyTheSetItNames", () => {
    const before = account();
    const after = apply([correction()], before);

    const corrected = sets(after, "s-2")[1];
    assertEqual(JSONValue.stringValue(JSONValue.get(corrected, "weight")), "102.5");
    assertEqual(JSONValue.stringValue(JSONValue.get(corrected, "reps")), "5");
    assertEqual(JSONValue.intValue(JSONValue.get(corrected, "rir")), 1);
    assertEqual(JSONValue.intValue(JSONValue.get(corrected, "webOnlySetKey")), 7, "a key iOS does not model survives the correction");

    const untouched = sets(before, "s-2");
    assertEqual(sets(after, "s-2")[0], untouched[0], "the set before it");
    assertEqual(sets(after, "s-2")[2], untouched[2], "the set after it");
    assertEqual(sets(after, "s-2", 1), sets(before, "s-2", 1), "the other exercise in the same session");
  });

  test("testEverythingElseInTheAccountIsLeftAsStored", () => {
    const before = account();
    const after = apply([correction()], before);

    const session = sessionsOf(after).find((value) => idOf(value) === "s-2");
    assertEqual(JSONValue.stringValue(JSONValue.get(session, "webOnlySessionKey")), "keep me");
    const results = JSONValue.arrayValue(JSONValue.get(session, "results"));
    assertEqual(JSONValue.stringValue(JSONValue.get(results?.[0], "webOnlyResultKey")), "keep me");
    assertEqual(JSONValue.intValue(JSONValue.get(session, "completion")), 100, "the stored counts describe the same sets as before");

    const sessionsBefore = sessionsOf(before);
    const sessionsAfter = sessionsOf(after);
    assertEqual(sessionsAfter.length, sessionsBefore.length, "no session was added or dropped");
    assertEqual(
      sessionsAfter.find((value) => idOf(value) === "s-1"),
      sessionsBefore.find((value) => idOf(value) === "s-1"),
      "the other session",
    );
    assertEqual(after.raw["metrics"], before.raw["metrics"]);
    assertEqual(after.raw["nutritionEntries"], before.raw["nutritionEntries"]);
    assertEqual(after.raw["planMode"], before.raw["planMode"]);
    assertEqual(Object.keys(after.raw).sort(), Object.keys(before.raw).sort());
  });

  test("testTheSecondResultForTheSameExerciseIsAddressable", () => {
    const raw: JSONObject = { ...account().raw };
    const sessions = [...(JSONValue.arrayValue(raw["sessions"]) ?? [])];
    const newer = JSONValue.objectValue(sessions[0]);
    if (newer === undefined) throw new Error("fixture");
    const results = [...(JSONValue.arrayValue(newer["results"]) ?? [])];
    results.push({
      exerciseId: "flat-bench",
      name: "Flat bench press",
      sets: [storedSet({ weight: "90", reps: "10" })],
    });
    sessions[0] = { ...newer, results };
    raw["sessions"] = sessions;

    const after = apply(
      [correction({ weight: 92.5, reps: 10, rir: null, setIndex: 0, occurrence: 1 })],
      LegacyState.make({ raw }),
    );
    assertEqual(JSONValue.stringValue(JSONValue.get(sets(after, "s-2", 0)[0], "weight")), "100", "the first result");
    assertEqual(JSONValue.stringValue(JSONValue.get(sets(after, "s-2", 2)[0], "weight")), "92.5", "the second one");
  });

  test("testClearingRIRRemovesItRatherThanWritingZero", () => {
    const after = apply([correction({ rir: null })], account());
    const corrected = sets(after, "s-2")[1];
    assertNil(JSONValue.get(corrected, "rir"), "absent is how both clients read 'no RIR'");
    assertEqual(LegacyAdapter.sessions({ from: after })[0]?.results[0].sets[1].rirReported, undefined);
  });

  // MARK: - What a correction refuses to do

  test("testACorrectionNeverUnlogsASet", () => {
    const before = account();
    for (const attempt of [correction({ weight: 0 }), correction({ reps: 0 })]) {
      const after = apply([attempt], before);
      assertEqual(after.raw, before.raw, "a set may be corrected, never emptied");
    }
  });

  test("testACorrectionSkipsWhatIsNoLongerThere", () => {
    const before = account();
    const cases: [string, StateChange][] = [
      ["a session that is not stored", StateChange.correct([correction()], { sessionID: "s-404" })],
      ["an exercise the session does not hold", StateChange.correct([correction({ exerciseID: "squat" })], { sessionID: "s-2" })],
      ["a set index past the end", StateChange.correct([correction({ setIndex: 9 })], { sessionID: "s-2" })],
      ["an occurrence that does not exist", StateChange.correct([correction({ occurrence: 3 })], { sessionID: "s-2" })],
    ];
    for (const [label, change] of cases) {
      assertEqual(StateMerge.apply([change], { to: before }).raw, before.raw, label);
    }
  });

  test("testADeletedSessionIsNotBroughtBackByACorrection", () => {
    const raw: JSONObject = { ...account().raw };
    raw["sessions"] = (JSONValue.arrayValue(raw["sessions"]) ?? []).filter((value) => idOf(value) !== "s-2");
    raw[StateMerge.tombstonesKey] = { sessions: { "s-2": "2026-09-13T08:00:00.000Z" } };
    const before = LegacyState.make({ raw });

    const after = apply([correction()], before);
    assertEqual(after.raw, before.raw);
    assertFalse(
      sessionsOf(after).some((value) => idOf(value) === "s-2"),
      "a correction is not a reason to resurrect a deleted session",
    );
  });

  // MARK: - Derived values

  /**
   * The corrected number is the one every engine reads afterwards, because
   * nothing derived is stored: volume, the record, the estimate and the
   * next proposal are all computed from the sessions.
   */
  test("testDerivedValuesFollowACorrectedSet", () => {
    // Three comparable sessions give the engines their reference, and the
    // newest one holds a set typed as 105 that was really 102,5.
    const sessions: JSONValue[] = [];
    [26, 19, 12].forEach((day, index) => {
      sessions.push({
        id: `h-${index}`,
        date: `2026-08-${day}T17:00:00.000Z`,
        dayId: "push",
        dayLabel: "Push",
        completion: 100,
        results: [
          {
            exerciseId: "flat-bench",
            name: "Flat bench press",
            sets: [storedSet({ weight: "100", reps: "6", rir: 2 }), storedSet({ weight: "100", reps: "6", rir: 2 })],
          },
        ],
      });
    });
    sessions.unshift({
      id: "h-latest",
      date: "2026-09-12T17:00:00.000Z",
      dayId: "push",
      dayLabel: "Push",
      completion: 100,
      results: [
        {
          exerciseId: "flat-bench",
          name: "Flat bench press",
          sets: [storedSet({ weight: "105", reps: "6", rir: 1 }), storedSet({ weight: "100", reps: "6", rir: 1 })],
        },
      ],
    });
    const before = LegacyState.make({ raw: { sessions } });

    const read = (state: LegacyState) => {
      const all = LegacyAdapter.sessions({ from: state });
      const latest = all.find((session) => session.id === "h-latest");
      const progress = StrengthProgress.make({ exerciseID: "flat-bench", name: "Flat bench press", sessions: all });
      const planned = PlannedExercise.make({
        exerciseID: "flat-bench",
        role: "primaryStrength",
        sets: [SetPrescription.make({ repRange: closedRange(5, 6), targetRIR: closedRange(1, 2) })],
      });
      const history = ExerciseHistory.build({ exerciseID: "flat-bench", modifiers: SetModifiers.none, from: all });
      const proposal = ProgressionEngine.proposal({
        planned,
        exercise: Exercise.make({ id: "flat-bench", name: "Flat bench press", equipment: "barbell", isCompound: true }),
        history,
      });
      const loads = (history.appearances[0]?.sets ?? []).flatMap((set) => (set.weightKg === undefined ? [] : [set.weightKg]));
      return {
        volume: RecordsEngine.volumeLoad(latest?.results.flatMap((result) => result.sets) ?? []),
        estimate: progress.estimate,
        heaviest: loads.length === 0 ? undefined : Math.max(...loads),
        proposal: proposal.weightKg,
      };
    };

    const was = read(before);
    assertEqual(was.volume, 105 * 6 + 100 * 6, "the mistyped set is in the volume");
    assertEqual(was.heaviest, 105, "and is what history calls the heaviest set");

    const after = apply([correction({ weight: 102.5, reps: 6, rir: 1, setIndex: 0 })], before, "h-latest");
    const now = read(after);

    assertEqual(now.volume, 102.5 * 6 + 100 * 6, "volume recomputed from the corrected set");
    assertEqual(now.volume, was.volume - 15, "exactly the difference the correction makes");
    assertEqual(now.heaviest, 102.5, "history reads the corrected weight");
    assertNotEqual(now.estimate, was.estimate, "the estimated 1RM moved with it");
    assertNotNil(now.estimate);
    // The engine keeps the estimate exact; rounding onto half kilos is a
    // step the screen takes, not the history.
    const expected = Estimates.e1RM({ weightKg: 102.5, reps: 6 });
    assertNotNil(expected);
    assertEqual(now.estimate, expected, "and is what the estimate makes of the corrected set");
    assertNotNil(now.proposal, "the next session is proposed from the corrected history");
    assertNotEqual(now.proposal, was.proposal, "which is not what the mistyped set proposed");
  });

  // MARK: - Carrying the change

  test("testACorrectionRoundTripsThroughTheChangeLog", () => {
    const change = StateChange.correct([correction(), correction({ rir: null, setIndex: 2 })], { sessionID: "s-2" });
    const data = StateChange.encodeList([change]);
    const decoded = StateChange.decodeList(data)[0];

    assertEqual(decoded.id, change.id);
    assertEqual(decoded.kind, change.kind);
    // `createdAt` survives to the second: the change log encodes ISO 8601
    // without fractional seconds, as every other change does.
    assertClose(decoded.createdAt.getTime() / 1000, change.createdAt.getTime() / 1000, 1);
    if (decoded.kind.kind !== "correctSessionSets") throw new Error(`decoded as ${decoded.kind.kind}`);
    assertEqual(decoded.kind.sessionID, "s-2");
    assertEqual(decoded.kind.corrections.length, 2);
    assertEqual(decoded.kind.corrections[0].weightKg, 102.5);
    assertNil(decoded.kind.corrections[1].rirReported);

    // Applying the decoded change lands the same state as the original.
    assertEqual(StateMerge.apply([decoded], { to: account() }).raw, StateMerge.apply([change], { to: account() }).raw);
  });

  test("testAQueuedCorrectionSaysWhatIsWaiting", () => {
    const rows = SyncQueue.rows({
      from: [StateChange.correct([correction(), correction({ setIndex: 2 })], { sessionID: "s-2" })],
    });
    assertEqual(rows.length, 1);
    assertEqual(rows[0]?.title, "Correction");
    assertEqual(rows[0]?.detail, "2 sets in an earlier session");
  });
});
