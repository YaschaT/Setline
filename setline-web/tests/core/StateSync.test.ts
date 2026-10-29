// Port of ios/SetlineCore/Tests/SetlineCoreTests/StateSyncTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertNil, assertTrue } from "../helpers";
import { ExerciseResult, LoggedSet, TrainingSession } from "../../src/core/Domain/Model";
import { CustomExercise } from "../../src/core/Domain/Substitution";
import { JSONValue, type JSONObject } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { StateChange } from "../../src/core/Sync/StateChange";
import { StateMerge } from "../../src/core/Sync/StateMerge";
import { RemoteState, StateSync, type StateStore, type WriteOutcome } from "../../src/core/Sync/StateSync";
import { addingTimeInterval } from "../../src/core/Support/calendar";

/**
 * The iOS sync loop against an in-memory row that behaves like the table:
 * conditional writes, conflicts, and another client writing mid-sync.
 */
class MemoryStore implements StateStore {
  row: RemoteState | undefined;
  updates = 0;
  inserts = 0;
  /** Rows another client writes just before each of our writes lands. */
  private interleaved: RemoteState[] = [];

  constructor(row: RemoteState | undefined) {
    this.row = row;
  }

  interleave(rows: RemoteState[]): void {
    this.interleaved = rows;
  }

  async fetch(): Promise<RemoteState | undefined> {
    return this.row;
  }

  async update(state: LegacyState, a: { expectedVersion: string; nextVersion: string }): Promise<WriteOutcome> {
    this.updates += 1;
    if (this.interleaved.length > 0) this.row = this.interleaved.shift();
    const current = this.row;
    if (current === undefined || current.version !== a.expectedVersion) return { kind: "conflict" };
    this.row = RemoteState.make({ state, version: a.nextVersion });
    return { kind: "written", version: a.nextVersion };
  }

  async insert(state: LegacyState, a: { nextVersion: string }): Promise<WriteOutcome> {
    this.inserts += 1;
    if (this.interleaved.length > 0) this.row = this.interleaved.shift();
    if (this.row !== undefined) return { kind: "conflict" };
    this.row = RemoteState.make({ state, version: a.nextVersion });
    return { kind: "written", version: a.nextVersion };
  }
}

describe("StateSyncTests", () => {
  const now = LegacyAdapter.isoDate("2026-09-14T20:00:00.000Z")!;
  const clock = () => now;

  const workout = (id: string): TrainingSession =>
    TrainingSession.make({
      id,
      date: addingTimeInterval(now, -3_600),
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
      durationSeconds: 1_800,
    });

  const meal = (id: string): JSONValue => ({
    id,
    date: "2026-09-14",
    meal: "Lunch",
    name: "Havermout",
    calories: 520,
    protein: 35,
    carbs: 70,
    fat: 12,
  });

  const ids = (state: LegacyState | undefined, key: string): string[] =>
    (JSONValue.arrayValue(state === undefined ? undefined : LegacyState.get(state, key)) ?? []).flatMap((value) => {
      const id = JSONValue.stringValue(JSONValue.get(value, "id"));
      return id === undefined ? [] : [id];
    });

  test("testAConflictRefetchesAndAppliesTheSameChangeToTheNewerState", async () => {
    const store = new MemoryStore(
      RemoteState.make({ state: LegacyState.make({ raw: { nutritionEntries: [meal("n-1")] } }), version: "2026-09-14T18:00:00.000Z" }),
    );
    // The web app saves a meal between our read and our write.
    store.interleave([
      RemoteState.make({
        state: LegacyState.make({ raw: { nutritionEntries: [meal("n-1"), meal("n-2")] } }),
        version: "2026-09-14T19:00:00.000Z",
      }),
    ]);

    const change = StateChange.upsert(workout("ios-1"), { createdAt: now });
    const outcome = await StateSync.run({ changes: [change], store, now: clock });

    const row = store.row;
    assertEqual(store.updates, 2, "the first write lost the race and was retried");
    assertEqual(ids(row?.state, "nutritionEntries"), ["n-1", "n-2"], "the web's newer meal survives");
    assertEqual(ids(row?.state, "sessions"), ["ios-1"]);
    assertEqual(outcome?.settled, new Set([change.id]));
    assertEqual(outcome?.version, row?.version);
  });

  test("testAnAccountWithoutStoredStateGetsItCreated", async () => {
    const store = new MemoryStore(undefined);
    const outcome = await StateSync.run({
      changes: [StateChange.upsert(workout("ios-1"), { createdAt: now })],
      store,
      now: clock,
    });
    assertEqual(store.inserts, 1);
    assertEqual(ids(outcome?.state, "sessions"), ["ios-1"]);
  });

  test("testNothingIsWrittenWhenTheStoredStateAlreadyHasTheChange", async () => {
    const change = StateChange.upsert(workout("ios-1"), { createdAt: now });
    const stored = StateMerge.apply([change], { to: LegacyState.make({ raw: {} }), now });
    const store = new MemoryStore(RemoteState.make({ state: stored, version: "2026-09-14T18:00:00.000Z" }));

    const outcome = await StateSync.run({ changes: [change], store, now: clock });

    assertEqual(store.updates + store.inserts, 0);
    assertEqual(outcome?.settled, new Set([change.id]), "settled all the same");
  });

  /**
   * A device with no copy of its own — a fresh install, or one whose local
   * copy was cleared — only reads the account on its first sync.
   */
  test("testADeviceWithNothingOfItsOwnOnlyReadsTheAccount", async () => {
    const stored = LegacyState.make({
      raw: {
        sessions: [LegacyAdapter.jsonValueSession(workout("web-1"))],
        nutritionEntries: [meal("n-1")],
      },
    });
    const store = new MemoryStore(RemoteState.make({ state: stored, version: "2026-09-14T18:00:00.000Z" }));

    const outcome = await StateSync.run({ changes: [], recovering: undefined, store, now: clock });

    assertEqual(store.updates + store.inserts, 0);
    assertEqual(outcome?.state.raw, stored.raw);
    assertEqual(outcome?.version, "2026-09-14T18:00:00.000Z");
    assertEqual(outcome?.settled, new Set<string>());
  });

  test("testLosingEveryRaceLeavesTheChangePendingAndWritesNothingOfOurs", async () => {
    const store = new MemoryStore(RemoteState.make({ state: LegacyState.make({ raw: {} }), version: "2026-09-14T18:00:00.000Z" }));
    store.interleave(
      [1, 2, 3].map((minute) =>
        RemoteState.make({ state: LegacyState.make({ raw: { other: minute } }), version: `2026-09-14T19:0${minute}:00.000Z` }),
      ),
    );

    const outcome = await StateSync.run({
      changes: [StateChange.upsert(workout("ios-1"), { createdAt: now })],
      store,
      now: clock,
    });

    assertNil(outcome);
    assertTrue(ids(store.row?.state, "sessions").length === 0);
  });

  test("testAChangeOutrankedByALaterDeletionSettlesWithoutWriting", async () => {
    const deleted = LegacyState.make({
      raw: { [StateMerge.tombstonesKey]: { sessions: { "s-old": "2026-09-14T10:00:00.000Z" } } },
    });
    const store = new MemoryStore(RemoteState.make({ state: deleted, version: "2026-09-14T10:00:00.000Z" }));
    const stale = StateChange.upsert(workout("s-old"), { createdAt: LegacyAdapter.isoDate("2026-09-14T09:00:00.000Z")! });

    const outcome = await StateSync.run({ changes: [stale], store, now: clock });

    assertEqual(store.updates + store.inserts, 0);
    assertEqual(outcome?.settled, new Set([stale.id]));
  });

  test("testRecoveringAnOldDeviceCopyOnlyAddsWhatIsMissing", async () => {
    const savedAt = LegacyAdapter.isoDate("2026-09-13T12:00:00.000Z")!;
    const local = LegacyState.make({
      raw: {
        sessions: [
          LegacyAdapter.jsonValueSession(workout("offline")),
          LegacyAdapter.jsonValueSession(workout("shared")),
          LegacyAdapter.jsonValueSession(workout("deleted")),
        ],
        [LegacyAdapter.activeSessionKey]: { dayID: "push" },
        [LegacyAdapter.customExercisesKey]: [LegacyAdapter.jsonValue(CustomExercise.make({ name: "Sled", createdAt: savedAt }))!],
      },
    });
    const sharedOnServer: JSONObject = { ...JSONValue.objectValue(LegacyAdapter.jsonValueSession(workout("shared")))! };
    sharedOnServer["completion"] = 80;
    const store = new MemoryStore(
      RemoteState.make({
        state: LegacyState.make({
          raw: {
            sessions: [sharedOnServer],
            [StateMerge.tombstonesKey]: { sessions: { deleted: "2026-09-12T08:00:00.000Z" } },
            [LegacyAdapter.activeSessionKey]: null,
            nutritionEntries: [meal("n-1")],
          },
        }),
        version: "2026-09-14T18:00:00.000Z",
      }),
    );

    await StateSync.run({ changes: [], recovering: { state: local, savedAt }, store, now: clock });

    const row = store.row;
    assertTrue(row !== undefined);
    assertEqual(ids(row!.state, "sessions"), ["offline", "shared"], "added the offline session; the deleted one stays deleted");
    const sessions = JSONValue.arrayValue(LegacyState.get(row!.state, "sessions")) ?? [];
    assertEqual(
      JSONValue.get(sessions[sessions.length - 1], "completion"),
      80,
      "the stored copy of a shared session is not overwritten",
    );
    assertEqual(LegacyState.get(row!.state, LegacyAdapter.activeSessionKey), null, "an explicit clear is not undone");
    assertEqual(LegacyAdapter.customExercises({ from: row!.state }).map((exercise) => exercise.id), ["custom:sled"]);
    assertEqual(ids(row!.state, "nutritionEntries"), ["n-1"]);
  });

  test("testVersionsMoveForwardEvenWhenThisClockIsBehind", () => {
    const behind = LegacyAdapter.isoDate("2026-09-14T17:00:00.000Z")!;
    assertEqual(StateSync.nextVersion({ after: "2026-09-14T18:00:00.500Z", now: behind }), "2026-09-14T18:00:00.501Z");
    assertEqual(StateSync.nextVersion({ after: undefined, now: behind }), "2026-09-14T17:00:00.000Z");
  });
});
