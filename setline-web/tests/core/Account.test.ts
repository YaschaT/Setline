// Port of ios/SetlineCore/Tests/SetlineCoreTests/AccountTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertFalse, assertNil, assertNotNil, assertTrue } from "../helpers";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { ExerciseResult, LoggedSet, TrainingSession } from "../../src/core/Domain/Model";
import { JSONValue, type JSONObject } from "../../src/core/Legacy/JSONValue";
import { JSONValueFrom, LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { StateMerge } from "../../src/core/Sync/StateMerge";
import { AccountSummary } from "../../src/core/Account/AccountSummary";
import { StateExport } from "../../src/core/Account/StateExport";
import { addingTimeInterval } from "../../src/core/Support/calendar";

/**
 * Artboard 23 states facts about the account, and "Exporteer alles" hands
 * those facts back. Both must come from stored data only.
 */
describe("AccountTests", () => {
  const now = LegacyAdapter.isoDate("2026-09-17T18:00:00.000Z")!;

  const bench = (sets: LoggedSet[]) => ExerciseResult.make({ exerciseID: "flat-bench", name: "Flat bench press", sets });

  function session(id: string, results: ExerciseResult[], counts: [number, number] | undefined = [3, 3]): TrainingSession {
    return TrainingSession.make({
      id, date: addingTimeInterval(now, -86_400), dayID: "push", dayLabel: "Push", completion: 100,
      results, durationSeconds: 3_000,
      plannedSetCount: counts?.[0], completedSetCount: counts?.[1],
    });
  }

  function state(extra: JSONObject, sessions: TrainingSession[]): LegacyState {
    const raw: JSONObject = {
      planMode: "personal",
      sessions: sessions.map((s) => JSONValueFrom.session(s)),
    };
    return LegacyState.make({ raw: { ...raw, ...extra } });
  }

  // MARK: What the screen may state

  test("testTheAccountStatesOnlyWhatIsStored", () => {
    const logged = session("s1", [bench([LoggedSet.make({ index: 0, weightKg: 100, reps: 6 })])]);
    const summary = AccountSummary.make({ state: state({}, [logged]), plan: PlanCatalog.personal, now });

    assertEqual(summary.planName, "Push / Pull / Legs");
    assertNil(summary.targets, "no stored targets, so the design's example numbers are not shown");
    assertEqual(summary.sessionCount, 1);
    assertEqual(summary.loggedExerciseCount, 1);
    assertEqual(summary.weighInCount, 0);
    assertEqual(summary.trainingDays, ["Mo", "Tu", "We", "Fr", "Sa"], "the week's shape, not a fixed list");
  });

  test("testStoredTargetsAndWeighInsAreStated", () => {
    const stored = state({
      targets: { calories: 2250, protein: 165, carbs: 240, fat: 70 },
      metrics: [{ id: "m1", date: "2026-09-06", weight: 82.4 }],
    }, [session("s1", [bench([LoggedSet.make({ index: 0, weightKg: 100, reps: 6 })])])]);

    const summary = AccountSummary.make({ state: stored, plan: PlanCatalog.personal, now });

    assertEqual(summary.targets?.calories, 2_250);
    assertEqual(summary.targets?.protein, 165);
    assertEqual(summary.weighInCount, 1);
  });

  test("testTrainingDaysFollowTheAccountsOwnSchedule", () => {
    const overrides: JSONObject = {
      "personal:2026-09-14": "push",
      "personal:2026-09-15": "rest",
      "personal:2026-09-16": "rest",
      "personal:2026-09-17": "rest",
      "personal:2026-09-18": "pull",
      "personal:2026-09-19": "rest",
      "personal:2026-09-20": "rest",
    };
    const stored = state({ scheduleOverrides: overrides }, []);

    const summary = AccountSummary.make({ state: stored, plan: PlanCatalog.personal, now });

    assertEqual(summary.trainingDays, ["Mo", "Fr"]);
  });

  test("testRestIsStatedPerRoleNotAsOneDefault", () => {
    const summary = AccountSummary.make({ state: state({}, []), plan: PlanCatalog.personal, now });
    assertEqual(summary.rest.map((r) => r.label), ["3:00", "2:00", "1:30"]);
    assertEqual(summary.rest.map((r) => r.roleLabel), ["main lift", "compound", "isolation"]);
  });

  // MARK: Export

  test("testTheJSONExportCarriesTrainingDataAndNoSyncBookkeeping", () => {
    const stored = state({
      [StateMerge.tombstonesKey]: { sessions: { gone: "2026-09-01T10:00:00.000Z" } },
      [StateMerge.resetKey]: { at: "2026-08-01T10:00:00.000Z" },
      [LegacyAdapter.painFlagsKey]: [],
    }, [session("s1", [bench([LoggedSet.make({ index: 0, weightKg: 100, reps: 6 })])])]);

    const data = StateExport.json({ from: stored });
    const decoded = JSONValue.objectValue(JSON.parse(data) as JSONValue) ?? {};

    assertNil(decoded[StateMerge.tombstonesKey], "deletion records describe syncing, not training");
    assertNil(decoded[StateMerge.resetKey]);
    assertEqual(JSONValue.arrayValue(decoded["sessions"])?.length, 1);
    assertNotNil(decoded[LegacyAdapter.painFlagsKey], "the user's own data stays");
    const text = data.toLowerCase();
    for (const secret of ["access_token", "refresh_token", "apikey", "password", "bearer"]) {
      assertFalse(text.includes(secret), `${secret} must never reach an export`);
    }
  });

  test("testTheCSVHasOneRowPerLoggedWorkingSet", () => {
    const sets = [
      LoggedSet.make({ index: 0, weightKg: 60, reps: 8, isWarmup: true }),
      LoggedSet.make({ index: 1, weightKg: 100, reps: 6, rirReported: 1 }),
      LoggedSet.make({ index: 2, weightKg: 100, reps: 0 }),
      LoggedSet.make({ index: 3, weightKg: 90, reps: 10, substitutedFrom: "incline-bench", origin: "sessionAdded" }),
    ];
    const csv = StateExport.csv({ from: [session("s1", [bench(sets)])] });
    // Swift `split(separator:)` drops empty pieces, so the trailing newline adds no line.
    const lines = csv.split("\n").filter((l) => l !== "");

    assertEqual(lines.length, 3, "header plus the two written working sets");
    assertTrue(lines[0].startsWith("date,day,session_id,exercise"));
    assertTrue(lines[1].includes("Flat bench press,flat-bench,2,100,6,1"), lines[1]);
    assertTrue(lines[1].includes("prescribed"));
    assertTrue(lines[2].includes("extra,incline-bench"), lines[2]);
    assertTrue(lines[2].endsWith(",50,3,3,100"), `session context travels with every row: ${lines[2]}`);
  });

  test("testExportFileNamesAreDated", () => {
    const names = StateExport.fileNames({ now });
    assertEqual(names.json, "setline-export-2026-09-17.json");
    assertEqual(names.csv, "setline-sets-2026-09-17.csv");
  });
});
