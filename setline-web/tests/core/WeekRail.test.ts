// Port of ios/SetlineCore/Tests/SetlineCoreTests/WeekRailTests.swift.
import { describe, test } from "node:test";
import { assertEqual, assertLessThan, assertNil, assertNotNil } from "../helpers";
import { PlanCatalog } from "../../src/core/Catalog/PlanCatalog";
import { ExerciseResult, LoggedSet, TrainingSession, type WorkoutDay } from "../../src/core/Domain/Model";
import { JSONValueFrom, LegacyAdapter } from "../../src/core/Legacy/LegacyAdapter";
import { LegacyState } from "../../src/core/Legacy/LegacyState";
import type { JSONObject } from "../../src/core/Legacy/JSONValue";
import { Agenda, AgendaDay } from "../../src/core/Engine/Agenda";
import { Deload, SessionPrescription } from "../../src/core/Engine/Fatigue";
import { WeekPlan } from "../../src/core/Engine/WeekPlan";
import { dateFrom } from "../../src/core/Support/calendar";

/**
 * 39a: the marks the week rail draws, and the rest day's one question — what
 * comes next, and when.
 */
describe("WeekRailTests", () => {
  /**
   * September 2026. The personal plan trains Monday (push), Tuesday
   * (pull), Wednesday (legs), Friday (lower) and Saturday (upper), and
   * rests on Thursday and Sunday.
   */
  const date = (day: number, month = 9, hour = 9) => dateFrom({ year: 2026, month, day, hour });

  const plan = (): WorkoutDay[] => PlanCatalog.personal;

  const workout = (id: string): WorkoutDay => plan().find((d) => d.id === id)!;

  function session(day: number, dayID: string, label: string): TrainingSession {
    return TrainingSession.make({
      id: `s-${day}`,
      date: date(day, 9, 17),
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
    });
  }

  function next(
    after: number,
    a: { now?: Date; overrides?: Record<string, string>; sessions?: TrainingSession[]; deload?: Deload; plan?: WorkoutDay[] } = {},
  ): AgendaDay | undefined {
    return Agenda.nextTraining({
      after: date(after),
      plan: a.plan ?? plan(),
      overrides: a.overrides ?? {},
      sessions: a.sessions ?? [],
      deload: a.deload,
      now: a.now ?? date(after),
    });
  }

  function unwrap<T>(value: T | undefined): T {
    assertNotNil(value);
    return value!;
  }

  // MARK: - The marks

  /** 39a's own week: two done, today here, two to go. */
  test("testTheRailDrawsTheArtboardsWeekFromRealData", () => {
    const week = Agenda.week({
      containing: date(10),
      plan: plan(),
      overrides: { "2026-09-08": "rest" },
      sessions: [session(7, "push", "Push"), session(9, "legs", "Legs")],
      now: date(10),
    });
    assertEqual(week.map((d) => AgendaDay.mark(d)), ["logged", "rest", "logged", "rest", "planned", "planned", "rest"]);
    assertEqual(week.filter((d) => d.isToday).map((d) => d.dayNumber), [10]);
  });

  test("testAMovedSessionAndAMissedOneEachKeepTheirOwnMark", () => {
    // Tuesday and Wednesday passed without a session; Saturday's Upper
    // moved to Sunday.
    const week = Agenda.week({
      containing: date(10),
      plan: plan(),
      overrides: { "2026-09-12": "rest", "2026-09-13": "upper" },
      sessions: [session(7, "push", "Push")],
      now: date(10),
    });
    assertEqual(week.map((d) => AgendaDay.mark(d)), ["logged", "missed", "missed", "rest", "planned", "rest", "moved"]);
  });

  // MARK: - 1 · Today is a rest day

  test("testARestDayLooksAheadToTomorrowsSession", () => {
    // Thursday 10 rests; Friday holds Lower.
    const n = unwrap(next(10));
    assertEqual(n.dayNumber, 11);
    assertEqual(AgendaDay.plannedDay(n)?.id, "lower");
    assertEqual(Agenda.restLine({ next: n, now: date(10) }), "Next training tomorrow");
    assertEqual(Agenda.sessionLine(n), `Fr 11 Sep · ±${WeekPlan.minutes({ of: workout("lower") })} min`);
  });

  // MARK: - Later this week, next week, nothing at all

  test("testTheWordForWhenFollowsTheCalendar", () => {
    const monday = date(7);
    assertEqual(Agenda.when(date(7, 9, 20), { from: monday }), "today");
    assertEqual(Agenda.when(date(8), { from: monday }), "tomorrow");
    assertEqual(Agenda.when(date(9), { from: monday }), "the day after tomorrow");
    assertEqual(Agenda.when(date(11), { from: monday }), "Friday", "later this week");
    assertEqual(Agenda.when(date(13), { from: monday }), "Sunday");
    assertEqual(Agenda.when(date(15), { from: monday }), "Tuesday 15 Sep", "past this week");
    assertEqual(Agenda.when(date(5, 10), { from: monday }), "Monday 5 Oct");
  });

  test("testASessionLaterThisWeekIsNamedByItsWeekday", () => {
    // Tuesday to Thursday set to rest: from Monday, the next session is
    // Friday's, four days out and still this week.
    const overrides = { "2026-09-08": "rest", "2026-09-09": "rest", "2026-09-10": "rest" };
    const n = unwrap(next(7, { overrides }));
    assertEqual(n.dayNumber, 11);
    assertEqual(Agenda.restLine({ next: n, now: date(7) }), "Next training Friday");
  });

  test("testASessionBeyondThisWeekCarriesItsDate", () => {
    // Friday 11: Saturday is set to rest, so the next session is Monday 14.
    const n = unwrap(next(11, { overrides: { "2026-09-12": "rest" } }));
    assertEqual(n.dayNumber, 14);
    assertEqual(AgendaDay.plannedDay(n)?.id, "push");
    assertEqual(Agenda.restLine({ next: n, now: date(11) }), "Next training Monday 14 Sep");
  });

  test("testNothingPlannedSaysSoInsteadOfInventingASession", () => {
    assertNil(next(10, { plan: [] }));
    assertEqual(Agenda.restLine({ next: undefined, now: date(10) }), "No training planned");
  });

  // MARK: - Week boundary

  test("testSundaysNextSessionIsMondayOfTheNextWeek", () => {
    const n = unwrap(next(13));
    assertEqual(n.dayNumber, 14);
    assertEqual(Agenda.restLine({ next: n, now: date(13) }), "Next training tomorrow");
    assertEqual(Agenda.sessionLine(n), `Mo 14 Sep · ±${WeekPlan.minutes({ of: workout("push") })} min`);
  });

  test("testTheSearchCrossesAMonthBoundary", () => {
    // Wednesday 30 September → Thursday 1 October rests → Friday 2 October.
    const n = unwrap(next(30));
    assertEqual(n.date.getMonth() + 1, 10);
    assertEqual(n.dayNumber, 2);
    assertEqual(Agenda.sessionLine(n)?.startsWith("Fr 2 Oct"), true);
  });

  // MARK: - Schedule overrides

  test("testAMovedSessionIsNextWhereItWasMovedTo", () => {
    // Friday's Lower moved onto Sunday; Saturday set to rest.
    const overrides = { "2026-09-11": "rest", "2026-09-12": "rest", "2026-09-13": "lower" };
    const n = unwrap(next(10, { overrides }));
    assertEqual(n.dayNumber, 13);
    assertEqual(AgendaDay.plannedDay(n)?.id, "lower");
    assertEqual(AgendaDay.mark(n), "moved");
    assertEqual(n.movedFrom, "Friday");
    assertEqual(Agenda.restLine({ next: n, now: date(10) }), "Next training Sunday");
  });

  // MARK: - A lighter week

  test("testALighterWeekShortensTheNextSessionThroughTheSharedRule", () => {
    const deload = Deload.make({ startedAt: date(7) });
    const n = unwrap(next(10, { deload }));
    const effective = SessionPrescription.day(workout("lower"), { deload });

    assertEqual(
      WeekPlan.sets({ of: unwrap(AgendaDay.plannedDay(n)) }),
      SessionPrescription.setCount({ of: workout("lower"), deload }),
    );
    assertLessThan(WeekPlan.minutes({ of: effective }), WeekPlan.minutes({ of: workout("lower") }));
    assertEqual(Agenda.sessionLine(n), `Fr 11 Sep · ±${WeekPlan.minutes({ of: effective })} min`);
  });

  test("testTheLighterWeekDoesNotReachASessionPastItsWindow", () => {
    // A deload from Monday 7 ends before Monday 14.
    const deload = Deload.make({ startedAt: date(7) });
    const n = unwrap(next(13, { deload }));
    assertEqual(Agenda.sessionLine(n), `Mo 14 Sep · ±${WeekPlan.minutes({ of: workout("push") })} min`);
  });

  // MARK: - What "next" steps over

  test("testSavedAndPassedDaysAreNeverTheNextSession", () => {
    // Monday evening, Monday logged: from Sunday, the next is Tuesday.
    const logged = unwrap(next(6, { now: date(7, 9, 20), sessions: [session(7, "push", "Push")] }));
    assertEqual(logged.dayNumber, 8);

    // From a rest day last week, the days that passed unlogged are
    // stepped over: the next session still to come is today's.
    const fromLastWeek = unwrap(next(3, { now: date(7) }));
    assertEqual(fromLastWeek.dayNumber, 7);
    assertEqual(Agenda.when(fromLastWeek.date, { from: date(7) }), "today");
  });

  // MARK: - Reading never writes

  test("testLookingAheadLeavesTheAccountExactlyAsItWas", () => {
    const overrides = { "2026-09-11": "rest", "2026-09-13": "lower" };
    const sessions = [session(7, "push", "Push")];
    const state = LegacyState.make({
      raw: {
        sessions: sessions.map((s) => JSONValueFrom.session(s)),
        scheduleOverrides: { ...overrides } as JSONObject,
        planMode: "personal",
        iosActiveSession: { dayId: "pull" },
      },
    });
    const before = structuredClone(state.raw);

    for (let day = 1; day <= 30; day++) {
      const found = Agenda.nextTraining({
        after: date(day), plan: plan(), overrides, sessions,
        deload: Deload.make({ startedAt: date(7) }), now: date(10),
      });
      Agenda.restLine({ next: found, now: date(10) });
      if (found !== undefined) Agenda.sessionLine(found);
    }

    assertEqual(state.raw, before, "no schedule, session, programme or active session moved");
    assertEqual(LegacyAdapter.scheduleOverrides({ from: state }), overrides);
  });
});
