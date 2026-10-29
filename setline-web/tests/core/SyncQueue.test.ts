// Port of ios/SetlineCore/Tests/SetlineCoreTests/SyncQueueTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertTrue } from "../helpers";
import type { JSONValue } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { StateChange } from "../../src/core/Sync/StateChange";
import { SyncQueue, SyncQueue_Row } from "../../src/core/Sync/SyncQueue";

/**
 * Artboard 24's queue: what is still only on this phone, in rows a person
 * recognises.
 */
describe("SyncQueueTests", () => {
  const now = LegacyAdapter.isoDate("2026-09-18T18:00:00.000Z")!;

  const session = (id: string, a: { day: string; sets: number; load: string }): JSONValue => ({
    id,
    date: "2026-09-18T17:00:00.000Z",
    dayId: a.day.toLowerCase(),
    dayLabel: a.day,
    completion: 100,
    results: [
      {
        exerciseId: "flat-bench",
        name: "Bankdrukken",
        sets: Array.from({ length: a.sets }, () => ({
          weight: a.load,
          reps: "8",
          pausedReps: "",
          pauseSeconds: "",
          pauseEnabled: false,
        })),
      },
    ],
  });

  test("testASessionIsOneRowWithItsSetsAndVolume", () => {
    const rows = SyncQueue.rows({
      from: [StateChange.make({ kind: "upsertSession", value: session("s1", { day: "Push", sets: 3, load: "100" }) }, { createdAt: now })],
    });
    assertEqual(rows.length, 1);
    assertTrue(rows[0].title.startsWith("Push · "));
    assertEqual(rows[0].detail, "3 sets · 2,400 kg");
  });

  test("testASessionSavedTwiceIsStillOneThingWaiting", () => {
    const rows = SyncQueue.rows({
      from: [
        StateChange.make({ kind: "upsertSession", value: session("s1", { day: "Push", sets: 2, load: "100" }) }, { createdAt: now }),
        StateChange.make({ kind: "upsertSession", value: session("s1", { day: "Push", sets: 3, load: "100" }) }, { createdAt: now }),
      ],
    });
    assertEqual(rows.length, 1);
    assertEqual(rows[0].detail, "3 sets · 2,400 kg", "the latest save is what waits");
  });

  test("testARearrangedWeekIsOneRowHoweverManyDatesItTouched", () => {
    const rows = SyncQueue.rows({
      from: [
        StateChange.make({ kind: "setScheduleDay", key: "personal:2026-09-14", dayID: "rest" }, { createdAt: now }),
        StateChange.make({ kind: "setScheduleDay", key: "personal:2026-09-17", dayID: "push" }, { createdAt: now }),
        StateChange.make({ kind: "removeScheduleOverride", key: "personal:2026-09-20" }, { createdAt: now }),
      ],
    });
    assertEqual(rows, [SyncQueue_Row.make({ title: "Week plan", detail: "3 days changed" })]);
  });

  test("testBookkeepingNobodyWaitsOnIsNotListed", () => {
    const rows = SyncQueue.rows({
      from: [
        StateChange.make({ kind: "setActiveSession", value: null }, { createdAt: now }),
        StateChange.make({ kind: "hideWarmup", exerciseID: "flat-bench" }, { createdAt: now }),
      ],
    });
    assertTrue(rows.length === 0);
  });

  test("testAMealSaysWhatItIs", () => {
    const rows = SyncQueue.rows({
      from: [
        StateChange.make(
          { kind: "upsertNutritionEntry", value: { id: "m1", name: "Kip, rijst", calories: 740 } },
          { createdAt: now },
        ),
      ],
    });
    assertEqual(rows, [SyncQueue_Row.make({ title: "Kip, rijst", detail: "Nutrition · 740 kcal" })]);
  });

  test("testSeveralTargetEditsAreOneRow", () => {
    const rows = SyncQueue.rows({
      from: [
        StateChange.make({ kind: "setTarget", field: "protein", value: 170 }, { createdAt: now }),
        StateChange.make({ kind: "setTarget", field: "calories", value: 2400 }, { createdAt: now }),
      ],
    });
    assertEqual(rows.length, 1);
  });
});
