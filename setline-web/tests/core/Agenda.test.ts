// Port of ios/SetlineCore/Tests/SetlineCoreTests/AgendaTests.swift.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assertEqual, assertFalse, assertNil, assertNotNil, assertTrue } from "../helpers";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { ExerciseResult, LoggedSet, TrainingSession, type WorkoutDay } from "../../src/core/Domain/Model";
import { JSONValueFrom, LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import type { JSONObject } from "../../src/core/Legacy/JSONValue";
import { Agenda, AgendaDay } from "../../src/core/Engine/Agenda";
import { Deload, SessionPrescription } from "../../src/core/Engine/Fatigue";
import { WeekPlan } from "../../src/core/Engine/WeekPlan";
import { addDays, dateFrom } from "../../src/core/Support/calendar";

/** Browsing dates: what each one holds, and what reading it must never do. */
describe("AgendaTests", () => {
  // The Swift calendar is Europe/Brussels, Monday first; so is the test run.
  /** Monday 7 September 2026, the week every artboard draws. */
  const monday = dateFrom({ year: 2026, month: 9, day: 7, hour: 9 });

  const date = (day: number, hour = 9) => dateFrom({ year: 2026, month: 9, day, hour });

  const plan = (): WorkoutDay[] => PlanCatalog.personal;

  function session(day: number, dayID = "push", label = "Push A"): TrainingSession {
    return TrainingSession.make({
      id: `s-${day}`,
      date: date(day, 17),
      dayID,
      dayLabel: label,
      completion: 100,
      results: [
        ExerciseResult.make({
          exerciseID: "flat-bench",
          name: "Flat bench press",
          sets: [LoggedSet.make({ index: 0, weightKg: 100, reps: 6, rirReported: 1 })],
        }),
      ],
      plannedSetCount: 18,
      completedSetCount: 18,
    });
  }

  function week(
    on: Date,
    a: { overrides?: Record<string, string>; sessions?: TrainingSession[]; deload?: Deload; now?: Date } = {},
  ): AgendaDay[] {
    return Agenda.week({
      containing: on,
      plan: plan(),
      overrides: a.overrides ?? {},
      sessions: a.sessions ?? [],
      deload: a.deload,
      now: a.now ?? monday,
    });
  }

  function day(w: AgendaDay[], number: number): AgendaDay {
    const found = w.find((d) => d.dayNumber === number);
    assertNotNil(found);
    return found!;
  }

  // MARK: - 1 · Today

  test("testTodayIsThePlannedSessionUntilSomethingIsSaved", () => {
    const today = day(week(monday), 7);
    assertTrue(today.isToday);
    assertFalse(today.isPast);
    if (today.content.kind !== "planned") return assert.fail(JSON.stringify(today.content));
    const workout = today.content.value;
    assertEqual(workout.id, "push");
    assertEqual(WeekPlan.sets({ of: workout }), 19, "the full prescription");
    assertNil(AgendaDay.session(today));
  });

  test("testTodayBecomesItsSavedSessionOnceOneExists", () => {
    const today = day(week(monday, { sessions: [session(7)] }), 7);
    assertTrue(today.isToday);
    assertEqual(AgendaDay.session(today)?.id, "s-7");
    assertNil(AgendaDay.plannedDay(today), "a logged day is described by what was saved");
  });

  // MARK: - 2 · A future training day

  test("testAFutureTrainingDayPreviewsTheProgramme", () => {
    // Wednesday 9 September is `legs` in the default week.
    const wednesday = day(week(monday), 9);
    assertFalse(wednesday.isPast);
    if (wednesday.content.kind !== "planned") return assert.fail(JSON.stringify(wednesday.content));
    assertEqual(wednesday.content.value.id, "legs");
    assertNil(AgendaDay.session(wednesday));
  });

  // MARK: - 3 · A rest day

  test("testARestDayHoldsNothing", () => {
    // Thursday rests in the default week.
    const thursday = day(week(monday), 10);
    assertEqual(thursday.content, { kind: "rest" });
    assertTrue(AgendaDay.isRest(thursday));
    assertNil(AgendaDay.plannedDay(thursday));
    assertNil(AgendaDay.session(thursday));
    assertNil(AgendaDay.title(thursday));
  });

  // MARK: - 4 · A schedule override

  test("testAnOverrideDecidesWhatADateHolds", () => {
    // Push moved off Monday onto Thursday, which the plan rests on.
    const overrides = { "2026-09-07": "rest", "2026-09-10": "push" };
    const moved = week(monday, { overrides });

    assertEqual(day(moved, 7).content, { kind: "rest" }, "the date it left");
    const thursday = day(moved, 10);
    assertEqual(AgendaDay.plannedDay(thursday)?.id, "push");
    assertEqual(thursday.movedFrom, "Monday", "and it says where it came from");
    assertTrue(AgendaDay.isMoved(thursday));
  });

  // MARK: - 5 · A completed historical date

  test("testACompletedDateReadsItsSavedSession", () => {
    // Reading the previous week from Monday: Friday 4 September was logged.
    const previous = week(date(4), { sessions: [session(4, "legs", "Benen")] });
    const friday = day(previous, 4);
    assertTrue(friday.isPast);
    assertEqual(AgendaDay.session(friday)?.dayLabel, "Benen");
    assertEqual(AgendaDay.title(friday), "Benen", "the label the session was saved with");
    assertNil(AgendaDay.plannedDay(friday));
  });

  // MARK: - 6 · The programme changed since

  test("testAChangedProgrammeDoesNotRewriteALoggedDay", () => {
    const logged = session(4, "legs", "Benen");
    // The same date, read against a programme that no longer holds that day.
    const otherPlan = plan().filter((d) => d.id !== "lower" && d.id !== "legs");
    otherPlan[0] = { ...otherPlan[0], label: "Iets anders" };

    const w = Agenda.week({
      containing: date(4),
      plan: otherPlan,
      overrides: { "2026-09-04": "push" },
      sessions: [logged],
      now: monday,
    });
    const friday = day(w, 4);
    assertEqual(AgendaDay.session(friday)?.dayLabel, "Benen", "history keeps its own name");
    assertEqual(AgendaDay.session(friday)?.results[0]?.sets[0]?.weightKg, 100, "and its own sets");
    assertNil(AgendaDay.plannedDay(friday), "the current programme never describes a logged day");
  });

  test("testAPlannedDayThatWasNeverLoggedIsMissedRatherThanMoved", () => {
    // Friday 4 September, read on Monday 7: planned, past, nothing saved.
    const friday = day(week(date(4)), 4);
    if (friday.content.kind !== "missed") return assert.fail(JSON.stringify(friday.content));
    assertEqual(friday.content.value.id, "lower");
    assertTrue(friday.isPast);
  });

  // MARK: - 7 · A lighter week

  test("testALighterWeekPreviewsTheSetsTheSessionWillOpenWith", () => {
    const deload = Deload.make({ startedAt: monday });
    const lighter = day(week(monday, { deload }), 7);
    const workout = AgendaDay.plannedDay(lighter);
    assertNotNil(workout);

    assertEqual(WeekPlan.sets({ of: workout! }), SessionPrescription.setCount({ of: plan()[0], deload }));
    assertEqual(WeekPlan.sets({ of: workout! }), 11, "the lighter week, not the full 19");
    assertEqual(
      workout!.exercises.map((p) => p.exerciseID),
      plan()[0].exercises.map((p) => p.exerciseID),
      "sets are cut, exercises are not",
    );
  });

  test("testTheLighterWeekReachesOnlyTheDatesItCovers", () => {
    // A five-day deload from Monday 7 does not reach Monday 14.
    const deload = Deload.make({ startedAt: monday });
    const after = Agenda.week({ containing: date(14), plan: plan(), overrides: {}, sessions: [], deload, now: monday });
    const nextMonday = day(after, 14);
    const workout = AgendaDay.plannedDay(nextMonday);
    assertNotNil(workout);
    assertEqual(WeekPlan.sets({ of: workout! }), 19, "back to the full plan");
  });

  // MARK: - 8 · Week boundaries

  test("testAWeekIsSevenDatesMondayFirst", () => {
    const days = week(date(9));
    assertEqual(days.length, 7);
    assertEqual(days.map((d) => d.dayNumber), [7, 8, 9, 10, 11, 12, 13]);
    assertEqual(days[0]?.weekday, "Mo");
    assertEqual(days[days.length - 1]?.weekday, "Su");
    assertEqual(days.filter((d) => d.isToday).length, 1, "exactly one today");
  });

  test("testAWeekAcrossAMonthBoundaryKeepsItsSevenDates", () => {
    // 28 September – 4 October 2026.
    const days = week(date(30), { now: date(30) });
    assertEqual(days.length, 7);
    assertEqual(days.map((d) => d.dayNumber), [28, 29, 30, 1, 2, 3, 4]);
    assertEqual(WeekPlan.range(days.map((d) => d.date)), "28 Sep–4 Oct");
  });

  test("testASessionOnASundayBelongsToThatWeekNotTheNext", () => {
    const sunday = session(13, "rest", "Push B");
    const days = week(monday, { sessions: [sunday] });
    assertEqual(AgendaDay.session(day(days, 13))?.id, "s-13");
    const next = week(date(14), { sessions: [sunday], now: date(14) });
    assertTrue(next.every((d) => AgendaDay.session(d) === undefined), "and not to the week after it");
  });

  // MARK: - Reading never writes

  test("testBrowsingLeavesTheAccountExactlyAsItWas", () => {
    const overrides = { "2026-09-07": "rest", "2026-09-08": "push" };
    const sessions = [session(4), session(2, "pull", "Pull A")];
    const state = LegacyState.make({
      raw: {
        sessions: sessions.map((s) => JSONValueFrom.session(s)),
        scheduleOverrides: { ...overrides } as JSONObject,
        planMode: "personal",
        iosActiveSession: { dayId: "push" },
        nutritionEntries: [{ id: "n-1" }],
      },
    });
    const before = structuredClone(state.raw);

    // Read every week of a month, in both directions, with everything on.
    for (let offset = -2; offset <= 2; offset++) {
      const anchor = addDays(monday, offset * 7);
      Agenda.week({
        containing: anchor, plan: plan(), overrides, sessions,
        deload: Deload.make({ startedAt: monday }), now: monday,
      });
      Agenda.day({ on: anchor, plan: plan(), overrides, sessions, now: monday });
    }

    assertEqual(state.raw, before, "no schedule, session, programme or active session moved");
    assertEqual(LegacyAdapter.sessions({ from: state }).length, 2);
    assertEqual(LegacyAdapter.scheduleOverrides({ from: state }), overrides);
  });

  // MARK: - What a week says about itself

  test("testTheWeekSummaryNamesTodayOrCountsWhatWasLogged", () => {
    assertEqual(Agenda.summary({ of: week(monday), now: monday }), "today, Monday 7 Sep");

    const previous = week(date(4), { sessions: [session(2), session(4)] });
    assertEqual(Agenda.summary({ of: previous, now: monday }), "2 sessions logged");

    const next = week(date(14), { now: monday });
    assertEqual(Agenda.summary({ of: next, now: monday }), "no sessions logged");
  });

  // MARK: - Missed days, for the alert center

  const missed = (sessions: TrainingSession[], now: Date, dismissed: Set<string> = new Set()) =>
    Agenda.missed({ plan: plan(), overrides: {}, sessions, dismissed, now });

  test("testMissedDaysArePlannedPastDatesWithoutASessionNewestFirst", () => {
    const now = date(17, 12);
    const days = missed([session(7)], now);
    assertFalse(days.length === 0);
    assertTrue(days.every((d) => d.content.kind === "missed"));
    assertTrue(days.every((d) => d.date.getTime() >= date(7, 0).getTime() && d.date.getTime() < date(17, 0).getTime()));
    assertFalse(days.some((d) => d.dayNumber === 7), "logged");
    assertFalse(days.some((d) => d.dayNumber === 17), "today is not over");
    assertEqual(days.map((d) => d.date), [...days.map((d) => d.date)].sort((x, y) => y.getTime() - x.getTime()));
    // The same days the weeks themselves call missed.
    const expected = [...week(date(7), { sessions: [session(7)], now }), ...week(date(14), { sessions: [session(7)], now })]
      .filter((d) => d.content.kind === "missed" && d.date.getTime() < date(17, 0).getTime())
      .map((d) => d.key);
    assertEqual(new Set(days.map((d) => d.key)), new Set(expected));
  });

  test("testNothingIsMissedBeforeTheFirstWorkoutOrWithoutOne", () => {
    assertTrue(missed([], date(17, 12)).length === 0);
    const days = missed([session(14)], date(17, 12));
    assertTrue(days.every((d) => d.date.getTime() >= date(14, 0).getTime()));
  });

  test("testADismissedDayIsNoLongerAsked", () => {
    const now = date(17, 12);
    const all = missed([session(7)], now);
    const first = all[0];
    assertNotNil(first);
    const rest = missed([session(7)], now, new Set([first.key]));
    assertEqual(rest.length, all.length - 1);
    assertFalse(rest.some((d) => d.key === first.key));
  });
});
