// Port of ios/SetlineCore/Tests/SetlineCoreTests/SharedKeysMergeTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertNil, assertTrue } from "../helpers";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { Program, ProgramCatalog } from "../../src/core/Catalog/Program";
import { PlateInventory } from "../../src/core/Domain/Intake";
import { PlateMath } from "../../src/core/Engine/PlateMath";
import { Schedule } from "../../src/core/Engine/Schedule";
import { JSONValue, type JSONObject } from "../../src/core/Legacy/JSONValue";
import { LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import { StateChange } from "../../src/core/Sync/StateChange";
import { StateMerge } from "../../src/core/Sync/StateMerge";
import { addingTimeInterval } from "../../src/core/Support/calendar";

/**
 * The keys both clients may now write, each at the smallest safe grain: one
 * date, one meal, one target field. Nothing here may ever replace a key.
 */
describe("SharedKeysMergeTests", () => {
  const now = LegacyAdapter.isoDate("2026-09-17T18:00:00.000Z")!;

  const state = (raw: JSONObject): LegacyState => LegacyState.make({ raw });
  const get = (s: LegacyState, key: string) => LegacyState.get(s, key);

  // MARK: Schedule

  test("testOneDateIsWrittenAndTheRestOfTheMapIsLeftAlone", () => {
    const before = state({
      scheduleOverrides: { "personal:2026-09-14": "push", "personal:2026-09-15": "pull" },
    });
    const after = StateMerge.apply(
      [StateChange.make({ kind: "setScheduleDay", key: "personal:2026-09-15", dayID: "rest" }, { createdAt: now })],
      { to: before, now },
    );
    assertEqual(JSONValue.get(get(after, "scheduleOverrides"), "personal:2026-09-15"), "rest");
    assertEqual(JSONValue.get(get(after, "scheduleOverrides"), "personal:2026-09-14"), "push");
  });

  test("testClearingADateNobodyOverrodeChangesNothing", () => {
    const before = state({ scheduleOverrides: { "personal:2026-09-14": "push" } });
    const after = StateMerge.apply(
      [StateChange.make({ kind: "removeScheduleOverride", key: "personal:2026-09-20" }, { createdAt: now })],
      { to: before, now },
    );
    assertEqual(Object.keys(JSONValue.objectValue(get(after, "scheduleOverrides")) ?? {}).length, 1);
  });

  test("testClearingWorksWhenTheAccountHasNoOverridesAtAll", () => {
    const after = StateMerge.apply(
      [StateChange.make({ kind: "removeScheduleOverride", key: "personal:2026-09-20" }, { createdAt: now })],
      { to: state({ planMode: "personal" }), now },
    );
    assertNil(get(after, "scheduleOverrides"), "nothing is invented to delete from");
    assertEqual(get(after, "planMode"), "personal");
  });

  test("testTheKeyMatchesTheWebAppsProgramScope", () => {
    // The Swift test pins a UTC calendar; 10:00 UTC is the same date here.
    const date = LegacyAdapter.isoDate("2026-09-17T10:00:00.000Z")!;
    assertEqual(Schedule.overrideKey({ for: date, mode: "personal", sciencePlanID: "ppl-ul" }), "personal:2026-09-17");
    assertEqual(
      Schedule.overrideKey({ for: date, mode: "science", sciencePlanID: "upper-lower" }),
      "science-upper-lower:2026-09-17",
    );
  });

  // MARK: Meals

  test("testAMealKeepsFieldsIOSDoesNotModel", () => {
    const stored: JSONValue = {
      id: "m1",
      date: "2026-09-17",
      meal: "Lunch",
      name: "Kip",
      calories: 700,
      protein: 50,
      carbs: 70,
      fat: 12,
      source: "zoekopdracht",
    };
    const edit: JSONValue = {
      id: "m1",
      date: "2026-09-17",
      meal: "Lunch",
      name: "Kip en rijst",
      calories: 740,
      protein: 52,
      carbs: 80,
      fat: 14,
    };
    const after = StateMerge.apply([StateChange.make({ kind: "upsertNutritionEntry", value: edit }, { createdAt: now })], {
      to: state({ nutritionEntries: [stored] }),
      now,
    });
    const entry = JSONValue.objectValue((JSONValue.arrayValue(get(after, "nutritionEntries")) ?? [])[0]);
    assertTrue(entry !== undefined);
    assertEqual(entry!["name"], "Kip en rijst");
    assertEqual(entry!["source"], "zoekopdracht", "a field only the web writes survives an iOS edit");
  });

  test("testADeletedMealIsNotBroughtBackByAnOlderEdit", () => {
    const deletedAt = "2026-09-17T12:00:00.000Z";
    const before = state({
      nutritionEntries: [],
      [StateMerge.tombstonesKey]: { nutritionEntries: { m1: deletedAt } },
    });
    const stale = StateChange.make(
      { kind: "upsertNutritionEntry", value: { id: "m1", name: "Kip" } },
      { createdAt: LegacyAdapter.isoDate("2026-09-17T11:00:00.000Z")! },
    );
    assertTrue(
      (JSONValue.arrayValue(get(StateMerge.apply([stale], { to: before, now }), "nutritionEntries"))?.length ?? 1) === 0,
    );

    const logAgain = StateChange.make(
      { kind: "upsertNutritionEntry", value: { id: "m1", name: "Kip" } },
      { createdAt: LegacyAdapter.isoDate("2026-09-17T13:00:00.000Z")! },
    );
    const after = StateMerge.apply([logAgain], { to: before, now });
    assertEqual(
      JSONValue.arrayValue(get(after, "nutritionEntries"))?.length,
      1,
      "logging it again after the deletion is a new decision",
    );
    assertNil(JSONValue.get(JSONValue.get(get(after, StateMerge.tombstonesKey), "nutritionEntries"), "m1"));
  });

  test("testDeletingAMealLeavesARecordOfTheDeletion", () => {
    const entry: JSONValue = { id: "m1", name: "Kip" };
    const after = StateMerge.apply([StateChange.make({ kind: "removeNutritionEntry", id: "m1" }, { createdAt: now })], {
      to: state({ nutritionEntries: [entry] }),
      now,
    });
    assertTrue((JSONValue.arrayValue(get(after, "nutritionEntries"))?.length ?? 1) === 0);
    assertEqual(
      JSONValue.get(JSONValue.get(get(after, StateMerge.tombstonesKey), "nutritionEntries"), "m1"),
      LegacyAdapter.isoString(now),
    );
  });

  // MARK: Whole sessions

  test("testDeletingASessionLeavesATombstoneAnOlderCopyCannotUndo", () => {
    const stored: JSONValue = { id: "s1", date: "2026-09-14T17:00:00.000Z", dayId: "push" };
    const kept: JSONValue = { id: "s2", date: "2026-09-15T17:00:00.000Z", dayId: "pull" };
    const after = StateMerge.apply([StateChange.make({ kind: "removeSession", id: "s1" }, { createdAt: now })], {
      to: state({ sessions: [stored, kept] }),
      now,
    });
    assertEqual(
      (JSONValue.arrayValue(get(after, "sessions")) ?? []).map((value) => JSONValue.stringValue(JSONValue.get(value, "id"))),
      ["s2"],
    );
    assertEqual(JSONValue.get(JSONValue.get(get(after, StateMerge.tombstonesKey), "sessions"), "s1"), LegacyAdapter.isoString(now));

    const stale = StateChange.make({ kind: "upsertSession", value: stored }, { createdAt: addingTimeInterval(now, -60) });
    assertEqual(
      JSONValue.arrayValue(get(StateMerge.apply([stale], { to: after, now }), "sessions"))?.length,
      1,
      "an older copy stays deleted",
    );
    const again = StateChange.make({ kind: "upsertSession", value: stored }, { createdAt: addingTimeInterval(now, 60) });
    assertEqual(
      JSONValue.arrayValue(get(StateMerge.apply([again], { to: after, now }), "sessions"))?.length,
      2,
      "logged again afterwards wins",
    );
  });

  // MARK: Targets

  test("testOneTargetFieldMovesAndTheOthersStay", () => {
    const after = StateMerge.apply([StateChange.make({ kind: "setTarget", field: "protein", value: 170 }, { createdAt: now })], {
      to: state({ targets: { calories: 2250, protein: 165, carbs: 240, fat: 70 } }),
      now,
    });
    const targets = JSONValue.objectValue(get(after, "targets"));
    assertTrue(targets !== undefined);
    assertEqual(targets!["protein"], 170);
    assertEqual(targets!["calories"], 2250);
    assertEqual(Object.keys(targets!).length, 4);
  });

  // MARK: Reading back

  test("testOnlyTheActiveProgramsOverridesAreRead", () => {
    const raw: JSONObject = {
      planMode: "science",
      sciencePlanId: "upper-lower",
      scheduleOverrides: {
        "personal:2026-09-17": "push",
        "science-upper-lower:2026-09-17": "upper",
        "science-ppl-ul:2026-09-18": "legs",
      },
    };
    const overrides = LegacyAdapter.scheduleOverrides({ from: LegacyState.make({ raw }) });
    assertEqual(overrides, { "2026-09-17": "upper" }, "another plan's days are not this plan's days");
  });

  test("testAnOlderUnscopedOverrideStillCountsWhereTheWebAppCountsIt", () => {
    const overrides = LegacyAdapter.scheduleOverrides({
      from: LegacyState.make({ raw: { planMode: "personal", scheduleOverrides: { "2026-09-17": "push" } } }),
    });
    assertEqual(overrides, { "2026-09-17": "push" });

    const scoped = LegacyAdapter.scheduleOverrides({
      from: LegacyState.make({
        raw: { planMode: "science", sciencePlanId: "upper-lower", scheduleOverrides: { "2026-09-17": "push" } },
      }),
    });
    assertTrue(Object.keys(scoped).length === 0, "the web app ignores bare keys on the newer plans, so we do too");
  });

  test("testAScopedOverrideWinsOverTheOlderBareOne", () => {
    const overrides = LegacyAdapter.scheduleOverrides({
      from: LegacyState.make({
        raw: {
          planMode: "personal",
          scheduleOverrides: { "2026-09-17": "push", "personal:2026-09-17": "rest" },
        },
      }),
    });
    assertEqual(overrides, { "2026-09-17": "rest" });
  });

  // MARK: Programme

  const editedPlan = (): JSONValue => [
    {
      id: "push",
      label: "Maandag · Push",
      short: "Push",
      exercises: [{ id: "flat-bench", name: "Bankdrukken" }],
    },
  ];

  test("testChangingProgrammeMovesTwoFieldsAndLeavesThePlanAlone", () => {
    const before = state({
      planMode: "personal",
      sciencePlanId: "ppl-ul",
      plan: editedPlan(),
      sessions: [{ id: "w-1" }],
    });
    const after = StateMerge.apply(
      [StateChange.make({ kind: "setProgram", mode: "science", sciencePlanID: "upper-lower" }, { createdAt: now })],
      { to: before, now },
    );
    assertEqual(get(after, "planMode"), "science");
    assertEqual(get(after, "sciencePlanId"), "upper-lower");
    assertEqual(get(after, "plan"), editedPlan(), "a science programme is not stored in `plan`");
    assertEqual(JSONValue.arrayValue(get(after, "sessions"))?.length, 1);
  });

  test("testGoingBackToYourOwnPlanRemembersWhichScienceProgrammeItWas", () => {
    const after = StateMerge.apply(
      [StateChange.make({ kind: "setProgram", mode: "personal", sciencePlanID: undefined }, { createdAt: now })],
      { to: state({ planMode: "science", sciencePlanId: "full-body" }), now },
    );
    assertEqual(get(after, "planMode"), "personal");
    assertEqual(get(after, "sciencePlanId"), "full-body");
  });

  test("testTheEditedPlanIsOnlyReadOnYourOwnProgramme", () => {
    const personal = LegacyAdapter.plan({ from: state({ planMode: "personal", plan: editedPlan() }) });
    assertEqual(personal.map((day) => day.id), ["push"], "the account's own plan");

    const science = LegacyAdapter.plan({
      from: state({ planMode: "science", sciencePlanId: "upper-lower", plan: editedPlan() }),
    });
    assertEqual(science.map((day) => day.id), PlanCatalog.scienceUpperLower.map((day) => day.id), "the programme's own days");
  });

  test("testEveryProgrammeTheAccountCanBeOnIsNamed", () => {
    const programs = ProgramCatalog.all({ personalPlan: PlanCatalog.personal });
    assertEqual(programs.map((program) => program.name), ["Push / Pull / Legs", "PPL + Upper / Lower", "Upper / Lower", "Full body"]);
    assertEqual(
      programs.map((program) => Program.id(program)),
      ["personal", "science-ppl-ul", "science-upper-lower", "science-full-body"],
    );
  });

  test("testTheCurrentProgrammeIsTheOneTheAccountSays", () => {
    const science = LegacyState.make({ raw: { planMode: "science", sciencePlanId: "full-body" } });
    assertEqual(ProgramCatalog.current({ in: science, plan: PlanCatalog.personal }).name, "Full body");

    const personal = LegacyState.make({ raw: { planMode: "personal" } });
    assertEqual(ProgramCatalog.current({ in: personal, plan: PlanCatalog.personal }).mode, "personal");
  });

  // MARK: What intake answers

  test("testTheExperienceAnswerIsKeptOnItsOwnKey", () => {
    const after = StateMerge.apply([StateChange.make({ kind: "setExperience", value: "week" }, { createdAt: now })], {
      to: state({ planMode: "personal" }),
      now,
    });
    assertEqual(get(after, "experienceLevel"), "week");
    assertEqual(get(after, "planMode"), "personal");
    assertEqual(LegacyAdapter.experience({ from: LegacyState.make({ raw: after.raw }) }), "week");
  });

  test("testTheRackIsKeptAsTwoKeysAndReadBackHeaviestFirst", () => {
    const after = StateMerge.apply(
      [StateChange.make({ kind: "setEquipment", plates: [5, 20, 1.25], barKg: 15 }, { createdAt: now })],
      { to: state({}), now },
    );
    assertEqual(
      (JSONValue.arrayValue(get(after, "plates")) ?? []).flatMap((value) => {
        const decimal = JSONValue.decimalValue(value);
        return decimal === undefined ? [] : [decimal];
      }),
      [5, 20, 1.25],
    );
    assertEqual(get(after, "barWeightKg"), 15);

    const inventory = LegacyAdapter.plateInventory({ from: LegacyState.make({ raw: after.raw }) });
    assertEqual(inventory.plates, [20, 5, 1.25]);
    assertEqual(inventory.barKg, 15);
    assertEqual(PlateInventory.smallestJump(inventory), 2.5);
  });

  test("testAnAccountThatNeverAnsweredGetsTheSetTheDesignAssumes", () => {
    const inventory = LegacyAdapter.plateInventory({ from: LegacyState.make({ raw: {} }) });
    assertEqual(inventory, PlateInventory.default);
    assertNil(LegacyAdapter.experience({ from: LegacyState.make({ raw: {} }) }));
  });

  test("testTheRackDecidesWhatTheCalculatorCanMake", () => {
    const sparse = PlateInventory.make({ plates: [20, 10], barKg: 20 });
    const solution = PlateMath.solve({ target: 55, bar: sparse.barKg, plates: sparse.plates });
    assertEqual(solution.total, 60, "20 kg steps, so 55 is not on the menu");
    assertEqual(PlateInventory.smallestJump(sparse), 20);
  });

  // MARK: Storage

  test("testTheNewOperationsSurviveBeingStoredOnTheDevice", () => {
    const changes = [
      StateChange.make({ kind: "setScheduleDay", key: "personal:2026-09-18", dayID: "upper" }, { createdAt: now }),
      StateChange.make({ kind: "removeScheduleOverride", key: "personal:2026-09-19" }, { createdAt: now }),
      StateChange.make({ kind: "upsertNutritionEntry", value: { id: "m1" } }, { createdAt: now }),
      StateChange.make({ kind: "removeNutritionEntry", id: "m1" }, { createdAt: now }),
      StateChange.make({ kind: "removeSession", id: "s1" }, { createdAt: now }),
      StateChange.make({ kind: "setTarget", field: "calories", value: 2300 }, { createdAt: now }),
      StateChange.make({ kind: "setProgram", mode: "science", sciencePlanID: "upper-lower" }, { createdAt: now }),
      StateChange.make({ kind: "setProgram", mode: "personal", sciencePlanID: undefined }, { createdAt: now }),
      StateChange.make({ kind: "setExperience", value: "block" }, { createdAt: now }),
      StateChange.make({ kind: "setEquipment", plates: [20, 10], barKg: 15 }, { createdAt: now }),
    ];
    const data = StateChange.encodeList(changes);
    assertEqual(StateChange.decodeList(data), changes);
  });

  test("testNewlyLoggedFoodGoesAtTheEndWhereTheWebAppPutsIts", () => {
    const stored: JSONValue = { id: "m1", name: "Havermout" };
    const after = StateMerge.apply(
      [StateChange.make({ kind: "upsertNutritionEntry", value: { id: "m2", name: "Skyr" } }, { createdAt: now })],
      { to: LegacyState.make({ raw: { nutritionEntries: [stored] } }), now },
    );
    assertEqual(
      (JSONValue.arrayValue(get(after, "nutritionEntries")) ?? []).map((value) => JSONValue.stringValue(JSONValue.get(value, "id"))),
      ["m1", "m2"],
    );
  });
});
