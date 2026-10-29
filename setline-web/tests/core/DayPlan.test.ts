// Port of ios/SetlineCore/Tests/SetlineCoreTests/DayPlanTests.swift.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assertEqual, assertFalse, assertNil, assertNotNil, assertTrue } from "../helpers";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { ExerciseResult, LoggedSet, TrainingSession, type WorkoutDay } from "../../src/core/Domain/Model";
import { JSONValueFrom } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import type { JSONObject } from "../../src/core/Legacy/JSONValue";
import { Agenda, AgendaDay, Agenda_Week } from "../../src/core/Engine/Agenda";
import { DayPlan, DayPlan_Option } from "../../src/core/Engine/DayPlan";
import { WeekPlan } from "../../src/core/Engine/WeekPlan";
import { dateFrom } from "../../src/core/Support/calendar";

/**
 * Artboards 41d–41g: the four weeks the drawer shows, and what one date can
 * be set to.
 */
describe("DayPlanTests", () => {
  /**
   * September 2026: Monday push, Tuesday pull, Wednesday legs, Thursday
   * rest, Friday lower, Saturday upper, Sunday rest.
   */
  const date = (day: number, month = 9, hour = 9) => dateFrom({ year: 2026, month, day, hour });

  const plan = (): WorkoutDay[] => PlanCatalog.personal;

  function session(day: number, dayID = "push", label = "Push", minutes: number | undefined = 54): TrainingSession {
    return TrainingSession.make({
      id: `s-${day}`,
      date: date(day, 9, 17),
      dayID,
      dayLabel: label,
      completion: 100,
      results: [ExerciseResult.make({
        exerciseID: "flat-bench", name: "Flat bench press",
        sets: [LoggedSet.make({ index: 0, weightKg: 100, reps: 6 })],
      })],
      durationSeconds: minutes !== undefined ? minutes * 60 : undefined,
    });
  }

  function make(day: number, a: { overrides?: Record<string, string>; sessions?: TrainingSession[]; now?: number } = {}): DayPlan {
    return DayPlan.make({
      for: date(day), plan: plan(), overrides: a.overrides ?? {}, sessions: a.sessions ?? [],
      now: date(a.now ?? 10),
    });
  }

  function option(p: DayPlan, id: string): DayPlan_Option {
    const found = p.options.find((o) => DayPlan_Option.id(o) === id);
    assertNotNil(found);
    return found!;
  }

  // MARK: - 41e · a date the programme decides

  test("testAFutureDateOffersThePlansSessionsRestAndTheStandard", () => {
    // Thursday 10 September rests in the programme.
    const sheet = make(10);
    assertFalse(sheet.isLocked);
    assertFalse(sheet.isOverridden);
    assertEqual(sheet.title, "Thursday 10 Sep");
    assertEqual(sheet.state, "Now: rest day · from your plan");
    assertEqual(sheet.standardTitle, "rest day");

    assertEqual(
      sheet.options.map((o) => DayPlan_Option.id(o)),
      [...plan().map((d) => `session-${d.id}`), "rest", "standard"],
      "the programme's own sessions, then rest, then the way back",
    );
    assertTrue(option(sheet, "rest").isCurrent, "a rest day already reads as rest");
  });

  test("testASessionAlreadyElsewhereThisWeekSaysSo", () => {
    const sheet = make(10);
    const lower = option(sheet, "session-lower");
    assertEqual(lower.hint, "also Fr 11", "Lower already falls on Friday");
    assertEqual(
      DayPlan.note(sheet, { for: lower }),
      "Lower will then be in this week twice; Fr 11 stays. This only changes this date, not the exercises in Lower.",
    );
    assertEqual(DayPlan.confirmTitle(sheet, { for: lower }), "Put Lower on Th 10");
  });

  test("testAssigningADateWritesThatDateAndNothingElse", () => {
    const sheet = make(10);
    const change = DayPlan.change(sheet, { for: option(sheet, "session-lower"), programKey: "personal" });
    assertNotNil(change);
    if (change!.kind.kind !== "setScheduleDay") return assert.fail(JSON.stringify(change!.kind));
    assertEqual(change!.kind.key, "personal:2026-09-10", "one date, by its own key");
    assertEqual(change!.kind.dayID, "lower");
  });

  test("testRestIsAssignedLikeAnySession", () => {
    // Friday 11 holds Lower; setting it to rest is a change like any other.
    const sheet = make(11);
    const change = DayPlan.change(sheet, { for: option(sheet, "rest"), programKey: "personal" });
    assertNotNil(change);
    if (change!.kind.kind !== "setScheduleDay") return assert.fail(JSON.stringify(change!.kind));
    assertEqual(change!.kind.key, "personal:2026-09-11");
    assertEqual(change!.kind.dayID, "rest");
  });

  test("testPickingTheProgrammesOwnSessionTakesTheChangeOffInstead", () => {
    // Friday's standard is Lower; with Pull set by hand, choosing Lower
    // again is the same as going back to standard.
    const sheet = make(11, { overrides: { "2026-09-11": "pull" } });
    const change = DayPlan.change(sheet, { for: option(sheet, "session-lower"), programKey: "personal" });
    assertNotNil(change);
    if (change!.kind.kind !== "removeScheduleOverride") return assert.fail(JSON.stringify(change!.kind));
    assertEqual(change!.kind.key, "personal:2026-09-11", "no override that only repeats the plan");
  });

  test("testChoosingWhatTheDateAlreadyHoldsWritesNothing", () => {
    const sheet = make(11);
    assertNil(
      DayPlan.change(sheet, { for: option(sheet, "session-lower"), programKey: "personal" }),
      "Friday already holds Lower by the programme's own reading",
    );
    assertNil(DayPlan.change(sheet, { for: option(sheet, "standard"), programKey: "personal" }));
  });

  // MARK: - 41f · a date you set yourself

  test("testAChangedDateOffersTheWayBackFirst", () => {
    const sheet = make(11, { overrides: { "2026-09-11": "pull" } });
    assertTrue(sheet.isOverridden);
    assertEqual(sheet.state, "Now: Pull · set by you");
    assertEqual(sheet.options[0]?.kind, { kind: "standard" });
    assertEqual(sheet.options[0]?.title, "Back to standard");
    assertEqual(sheet.options[0]?.hint, "Lower", "what it goes back to");
    assertNotNil(sheet.options[0]);
    assertEqual(DayPlan.confirmTitle(sheet, { for: sheet.options[0] }), "Reset to Lower");
  });

  test("testGoingBackToStandardRemovesTheChangeItself", () => {
    const sheet = make(11, { overrides: { "2026-09-11": "pull" } });
    const change = DayPlan.change(sheet, { for: option(sheet, "standard"), programKey: "personal" });
    assertNotNil(change);
    if (change!.kind.kind !== "removeScheduleOverride") return assert.fail(JSON.stringify(change!.kind));
    assertEqual(change!.kind.key, "personal:2026-09-11");
  });

  test("testAChangeReplacesTheOneBeforeItRatherThanStacking", () => {
    const sheet = make(11, { overrides: { "2026-09-11": "pull" } });
    const change = DayPlan.change(sheet, { for: option(sheet, "session-upper"), programKey: "personal" });
    assertNotNil(change);
    if (change!.kind.kind !== "setScheduleDay") return assert.fail(JSON.stringify(change!.kind));
    assertEqual(change!.kind.key, "personal:2026-09-11", "the same key, written again");
    assertEqual(change!.kind.dayID, "upper");
  });

  // MARK: - 41g · a date that was trained

  test("testALoggedDateIsLockedAndPointsAtItsSession", () => {
    const sheet = make(9, { sessions: [session(9, "legs", "Legs")], now: 10 });
    assertTrue(sheet.isLocked);
    assertEqual(sheet.state, "Legs · logged · 54 min");
    assertEqual(sheet.session?.id, "s-9");
    assertTrue(sheet.options.length === 0, "nothing to assign");
  });

  test("testNothingCanBeWrittenForALoggedDate", () => {
    const sheet = make(9, { sessions: [session(9, "legs", "Legs")], now: 10 });
    const anywhere = DayPlan_Option.make({ kind: { kind: "rest" }, title: "Rust", hint: undefined, isCurrent: false });
    assertNil(DayPlan.change(sheet, { for: anywhere, programKey: "personal" }), "a logged day is not assignable");
  });

  // MARK: - Reading a date changes nothing

  test("testOpeningTheSheetLeavesTheAccountAsItWas", () => {
    const overrides = { "2026-09-11": "pull" };
    const sessions = [session(9, "legs", "Legs")];
    const state = LegacyState.make({
      raw: {
        sessions: sessions.map((s) => JSONValueFrom.session(s)),
        scheduleOverrides: { ...overrides } as JSONObject,
        planMode: "personal",
      },
    });
    const before = structuredClone(state.raw);

    for (let day = 7; day <= 13; day++) {
      const sheet = make(day, { overrides, sessions });
      for (const o of sheet.options) {
        DayPlan.note(sheet, { for: o });
        DayPlan.confirmTitle(sheet, { for: o });
        DayPlan.change(sheet, { for: o, programKey: "personal" });
      }
    }

    assertEqual(state.raw, before, "building a change never applies one");
  });

  // MARK: - 41d · the four weeks the drawer shows

  test("testTheDrawerShowsTheWeekBeforeAndTheTwoAfter", () => {
    const weeks = Agenda.weeks({
      around: date(10), plan: plan(), overrides: {}, sessions: [session(7)],
      firstSession: date(31, 8), now: date(10),
    });
    assertEqual(weeks.length, 4);
    assertEqual(weeks.map((w) => w.days[0]?.dayNumber), [31, 7, 14, 21]);
    assertEqual(weeks.filter((w) => w.isCurrent).length, 1);
    assertEqual(Agenda_Week.label(weeks[1]), "Week 2 · this week");
    assertEqual(Agenda_Week.label(weeks[0]), "Week 1 · 31 Aug");
    assertEqual(Agenda_Week.label(weeks[3]), "Week 4 · 21 Sep");
  });

  test("testAWeekIsNumberedTheSameFromEveryDayInsideIt", () => {
    // The drawer's header reads the selected date, its rows read Monday:
    // both must name the same week.
    const first = date(4);
    for (let day = 7; day <= 13; day++) {
      assertEqual(
        WeekPlan.number({ firstSession: first, on: date(day) }),
        WeekPlan.number({ firstSession: first, on: date(7) }),
        `day ${day}`,
      );
    }
  });

  test("testTheDrawerReadsTheSameDatesTheRailDoes", () => {
    const overrides = { "2026-09-10": "push" };
    const sessions = [session(7)];
    const weeks = Agenda.weeks({ around: date(10), plan: plan(), overrides, sessions, now: date(10) });
    const rail = Agenda.week({ containing: date(10), plan: plan(), overrides, sessions, now: date(10) });
    assertEqual(weeks[1].days, rail, "one reading of a date, wherever it is drawn");
    const ten = rail.find((d) => d.dayNumber === 10);
    assertEqual(ten !== undefined ? AgendaDay.mark(ten) : undefined, "moved");
  });
});
