// Port of ios/SetlineCore/Tests/SetlineCoreTests/SyncMergeTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertNotNil, assertNil, assertTrue } from "../helpers";
import { Fixtures } from "./Fixtures";
import { ActiveSessionSnapshot } from "../../src/core/Domain/ActiveSession";
import { ExerciseResult, LoggedSet, TrainingSession } from "../../src/core/Domain/Model";
import { PainFlag } from "../../src/core/Domain/PainFlag";
import { CustomExercise, ProgramReplacement } from "../../src/core/Domain/Substitution";
import { JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { StateChange } from "../../src/core/Sync/StateChange";
import { StateMerge } from "../../src/core/Sync/StateMerge";
import { addingTimeInterval, dateFromEpoch } from "../../src/core/Support/calendar";
import { deepEqual } from "../../src/core/Support/swift";

/**
 * How iOS changes are applied to the stored state: only what they mention,
 * by identity, and never by rewriting what iOS did not touch.
 */
describe("SyncMergeTests", () => {
  const date = dateFromEpoch(1_789_000_000);

  /** The regression this whole design exists for, against the real export. */
  test("testSavingOneWorkoutLeavesEveryStoredSessionByteIdentical", (t) => {
    const data = Fixtures.backupData;
    if (data === undefined) {
      t.skip("PRIVATE-DATA/yascha-training-backup.json not present");
      return;
    }
    const original = LegacyState.fromExportOrState({ data });
    const workout = TrainingSession.make({
      id: "ios-new",
      date,
      dayID: "push",
      dayLabel: "Push",
      completion: 100,
      results: [
        ExerciseResult.make({
          exerciseID: "flat-bench",
          name: "Flat bench press",
          sets: [LoggedSet.make({ index: 0, weightKg: 100, reps: 6 })],
        }),
      ],
      durationSeconds: 1800,
    });

    const merged = StateMerge.apply([StateChange.upsert(workout)], { to: original });

    const before = JSONValue.arrayValue(LegacyState.get(original, "sessions")) ?? [];
    const after = JSONValue.arrayValue(LegacyState.get(merged, "sessions")) ?? [];
    assertEqual(after.length, before.length + 1);
    assertEqual(after.slice(1), before, "every stored session, the recovery day included, is untouched");
    for (const [key, value] of Object.entries(original.raw)) {
      if (key === "sessions") continue;
      assertEqual(LegacyState.get(merged, key), value, `${key} changed`);
    }
  });

  test("testPainFlagsAreChangedByIdentityAndExpiredOnesDropped", () => {
    const now = LegacyAdapter.isoDate("2026-09-14T12:00:00.000Z");
    assertNotNil(now);
    const expired = PainFlag.make({ region: "knee", exerciseID: "squat", date: addingTimeInterval(now!, -20 * 86_400) });
    const current = PainFlag.make({ region: "shoulder", exerciseID: "flat-bench", date: addingTimeInterval(now!, -86_400) });
    const expiredJSON = LegacyAdapter.jsonValue(expired);
    assertNotNil(expiredJSON);
    let state = LegacyState.make({ raw: { [LegacyAdapter.painFlagsKey]: [expiredJSON!] } });

    state = StateMerge.apply([StateChange.make({ kind: "addPainFlag", value: current }, { createdAt: now })], { to: state, now });
    assertEqual(LegacyAdapter.painFlags({ from: state }).map((flag) => PainFlag.id(flag)), [PainFlag.id(current)]);

    state = StateMerge.apply([StateChange.make({ kind: "removePainFlag", id: PainFlag.id(current) }, { createdAt: now })], {
      to: state,
      now,
    });
    assertTrue(LegacyAdapter.painFlags({ from: state }).length === 0);
  });

  test("testUndoingAProgramReplacementRemovesExactlyThatRecord", () => {
    const bench = ProgramReplacement.make({
      originExerciseID: "flat-bench",
      substituteExerciseID: "chest-press-machine",
      scope: "thisPlan",
      dayID: "push",
      date,
    });
    const squat = ProgramReplacement.make({
      originExerciseID: "squat",
      substituteExerciseID: "hack-squat",
      scope: "always",
      dayID: "legs",
      date,
    });
    const state = StateMerge.apply(
      [
        StateChange.make({ kind: "addProgramReplacement", value: bench }, { createdAt: date }),
        StateChange.make({ kind: "addProgramReplacement", value: squat }, { createdAt: date }),
        StateChange.make({ kind: "removeProgramReplacement", id: ProgramReplacement.id(bench) }, { createdAt: date }),
      ],
      { to: LegacyState.make({ raw: {} }), now: date },
    );
    assertEqual(
      LegacyAdapter.programReplacements({ from: state }).map((replacement) => ProgramReplacement.id(replacement)),
      [ProgramReplacement.id(squat)],
    );
  });

  test("testEntriesThisBuildCannotReadAreKept", () => {
    const foreign: JSONValue = { futureShape: true };
    const sled = CustomExercise.make({ name: "Sled", createdAt: date });
    const state = StateMerge.apply(
      [
        StateChange.make({ kind: "addCustomExercise", value: sled }, { createdAt: date }),
        StateChange.make({ kind: "addCustomExercise", value: sled }, { createdAt: date }),
      ],
      { to: LegacyState.make({ raw: { [LegacyAdapter.customExercisesKey]: [foreign] } }), now: date },
    );

    const stored = JSONValue.arrayValue(LegacyState.get(state, LegacyAdapter.customExercisesKey)) ?? [];
    assertEqual(stored.length, 2, "added once, the unreadable entry kept");
    assertTrue(stored.some((entry) => deepEqual(entry, foreign)));
  });

  test("testHiddenWarmupsAreASortedUnion", () => {
    const state = StateMerge.apply(
      [
        StateChange.make({ kind: "hideWarmup", exerciseID: "flat-bench" }, { createdAt: date }),
        StateChange.make({ kind: "hideWarmup", exerciseID: "pec-fly" }, { createdAt: date }),
      ],
      { to: LegacyState.make({ raw: { [LegacyAdapter.hiddenWarmupsKey]: ["pec-fly"] } }), now: date },
    );
    assertEqual(LegacyState.get(state, LegacyAdapter.hiddenWarmupsKey), ["flat-bench", "pec-fly"]);
  });

  test("testClearingThePausedWorkoutWritesAnExplicitNull", () => {
    const snapshot = ActiveSessionSnapshot.make({ dayID: "push", dayLabel: "Push", startedAt: date, currentIndex: 0, results: [] });
    let state = StateMerge.apply([StateChange.activeSession(snapshot, { createdAt: date })], {
      to: LegacyState.make({ raw: {} }),
      now: date,
    });
    assertNotNil(LegacyAdapter.activeSession({ from: state }));

    state = StateMerge.apply([StateChange.activeSession(undefined, { createdAt: date })], { to: state, now: date });
    assertEqual(LegacyState.get(state, LegacyAdapter.activeSessionKey), null, "cleared on purpose, not merely absent");
    assertNil(LegacyAdapter.activeSession({ from: state }));
  });

  /** Pending changes wait on the device, possibly across a cold launch. */
  test("testEveryKindOfChangeSurvivesStorage", () => {
    const changes: StateChange[] = [
      StateChange.upsert(
        TrainingSession.make({ id: "s", date, dayID: "push", dayLabel: "Push", completion: 100, results: [] }),
        { createdAt: date },
      ),
      StateChange.activeSession(undefined, { createdAt: date }),
      StateChange.make({ kind: "addPainFlag", value: PainFlag.make({ region: "knee", exerciseID: "squat", date }) }, { createdAt: date }),
      StateChange.make({ kind: "removePainFlag", id: "squat|knee|2026-09-09T22:13:20.000Z" }, { createdAt: date }),
      StateChange.make(
        {
          kind: "addProgramReplacement",
          value: ProgramReplacement.make({ originExerciseID: "a", substituteExerciseID: "b", scope: "thisDay", dayID: "push", date }),
        },
        { createdAt: date },
      ),
      StateChange.make({ kind: "removeProgramReplacement", id: "a|b|thisDay|push" }, { createdAt: date }),
      StateChange.make({ kind: "addCustomExercise", value: CustomExercise.make({ name: "Sled", createdAt: date }) }, { createdAt: date }),
      StateChange.make({ kind: "hideWarmup", exerciseID: "pec-fly" }, { createdAt: date }),
    ];
    const stored = StateChange.encodeList(changes);
    assertEqual(StateChange.decodeList(stored), changes);
  });
});
