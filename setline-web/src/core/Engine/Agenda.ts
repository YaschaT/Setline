import type { TrainingSession, WorkoutDay } from "../Domain/Model";
import { addDays, addWeeks, formatEnUS, isSameDay, startOfDay } from "../Support/calendar";
import { dayComponent, sortedWhere } from "../Support/engine";
import { Deload, SessionPrescription } from "./Fatigue";
import { Schedule } from "./Schedule";
import { WeekPlan, WeekPlan_Day } from "./WeekPlan";

/**
 * A date holds one of four things, and the case decides which source may
 * be read.
 *
 * The split is the point: a day that was logged is described by the saved
 * session and never by today's programme, because the programme may have
 * changed since (32c: "Dit is wat je deed, niet wat er nu gepland staat").
 * A day still to come is described by the programme, because there is
 * nothing else to describe it with.
 */
export type AgendaDay_Content =
  /** A session was saved on this date. The only truth for a past day. */
  | { kind: "session"; value: TrainingSession }
  /** Planned and still ahead — today included, until something is saved. */
  | { kind: "planned"; value: WorkoutDay }
  /** Planned, the day is over, nothing was saved. SETLINE moves nothing. */
  | { kind: "missed"; value: WorkoutDay }
  /** No session planned: a rest day, or a date the plan leaves open. */
  | { kind: "rest" };

/**
 * The mark a date carries in the week rail (39a) — one shape per state,
 * so a state never rests on colour alone.
 */
export type AgendaDay_Mark = "logged" | "planned" | "moved" | "missed" | "rest";
export const AgendaDay_Mark = {
  /** A filled dot: a session was saved. */
  logged: "logged" as AgendaDay_Mark,
  /** An open ring: planned, still to come. */
  planned: "planned" as AgendaDay_Mark,
  /**
   * A dashed ring: a date you set yourself — a session moved here from
   * its own weekday, or one put here beside it (41).
   */
  moved: "moved" as AgendaDay_Mark,
  /** An open ring on a day that passed with nothing saved. */
  missed: "missed" as AgendaDay_Mark,
  /** A small dot: nothing planned. */
  rest: "rest" as AgendaDay_Mark,
};

/**
 * What one date holds, for the screens that browse dates: the selectable
 * strip on Training (32a–32f) and the Agenda (34a–34e).
 *
 * This is a reading, never a writing. Nothing here creates a session, marks a
 * date or touches the schedule — browsing a week leaves the account exactly
 * as it was. `WeekPlan` stays the one calendar model; this adds what a date
 * means once the saved sessions and the lighter week are taken into account.
 */
export interface AgendaDay {
  readonly date: Date;
  /** `yyyy-MM-dd`, the key both clients agree on. */
  readonly key: string;
  /** "ma" */
  readonly weekday: string;
  readonly dayNumber: number;
  readonly isToday: boolean;
  readonly isPast: boolean;
  readonly content: AgendaDay_Content;
  /** The weekday this session usually falls on, when it is not there. */
  readonly movedFrom?: string;
  /**
   * Set by hand for this date rather than by the programme (41: "de
   * gestippelde ring als marker voor een gewijzigde dag").
   */
  readonly isOverridden: boolean;
}
export const AgendaDay = {
  id(self: AgendaDay): string {
    return self.key;
  },

  /** The saved session, and only where one exists. */
  session(self: AgendaDay): TrainingSession | undefined {
    return self.content.kind === "session" ? self.content.value : undefined;
  },

  /** The effective prescription, and only for a date that has none saved. */
  plannedDay(self: AgendaDay): WorkoutDay | undefined {
    switch (self.content.kind) {
      case "planned":
      case "missed":
        return self.content.value;
      case "session":
      case "rest":
        return undefined;
    }
  },

  isRest(self: AgendaDay): boolean {
    return self.content.kind === "rest";
  },
  isLogged(self: AgendaDay): boolean {
    return AgendaDay.session(self) !== undefined;
  },
  isMoved(self: AgendaDay): boolean {
    return self.movedFrom !== undefined;
  },

  mark(self: AgendaDay): AgendaDay_Mark {
    switch (self.content.kind) {
      case "session": return "logged";
      case "planned": return AgendaDay.isMoved(self) || self.isOverridden ? "moved" : "planned";
      case "missed": return "missed";
      case "rest": return "rest";
    }
  },

  /**
   * The name a row shows: the session's own label for a logged day, the
   * programme's for a planned one.
   */
  title(self: AgendaDay): string | undefined {
    switch (self.content.kind) {
      case "session": return self.content.value.dayLabel;
      case "planned":
      case "missed":
        return self.content.value.short;
      case "rest": return undefined;
    }
  },
};

/** One week in the pulled-out drawer: its dates and what it is called. */
export interface Agenda_Week {
  readonly days: AgendaDay[];
  readonly number: number;
  readonly isCurrent: boolean;
}
export const Agenda_Week = {
  id(self: Agenda_Week): string {
    return self.days[0]?.key ?? `${self.number}`;
  },

  /** "Week 6 · deze week", or the week with the Monday it starts on. */
  label(self: Agenda_Week): string {
    const first = self.days[0];
    if (first === undefined) return `Week ${self.number}`;
    return self.isCurrent ? `Week ${self.number} · this week` : `Week ${self.number} · ${Agenda.shortDate(first.date)}`;
  },
};

function resolve(
  day: WeekPlan_Day,
  a: { logged: Map<string, TrainingSession>; deload: Deload | undefined; isOverridden: boolean; now: Date },
): AgendaDay {
  const { logged, deload, isOverridden, now } = a;
  const isToday = isSameDay(day.date, now);
  const isPast = startOfDay(day.date).getTime() < startOfDay(now).getTime();

  let content: AgendaDay_Content;
  const session = logged.get(day.key);
  const workout = WeekPlan_Day.workout(day);
  if (session !== undefined) {
    content = { kind: "session", value: session };
  } else if (workout !== undefined) {
    // The lighter week reaches only the dates it covers, and reaches
    // them through the rule the session runner uses.
    const applies = deload !== undefined && Deload.covers(deload, day.date) ? deload : undefined;
    const effective = SessionPrescription.day(workout, { deload: applies });
    content = isPast ? { kind: "missed", value: effective } : { kind: "planned", value: effective };
  } else {
    content = { kind: "rest" };
  }

  return {
    date: day.date,
    key: day.key,
    weekday: day.weekday,
    dayNumber: day.date.getDate(),
    isToday,
    isPast,
    content,
    movedFrom: day.movedFrom,
    isOverridden,
  };
}

export const Agenda = {
  /**
   * The seven dates of the week `date` falls in, Monday first, with what
   * each one holds.
   *
   * - Parameters:
   *   - deload: the lighter week now running, if one is. It is applied per
   *     date rather than to the week, so a date outside its window keeps
   *     the full prescription — and the preview of a date always matches
   *     the session that date would open, because both go through
   *     `SessionPrescription`.
   */
  week(a: {
    containing: Date;
    plan: WorkoutDay[];
    overrides: Record<string, string>;
    sessions: TrainingSession[];
    deload?: Deload;
    now?: Date;
  }): AgendaDay[] {
    const now = a.now ?? new Date();
    const logged = Agenda.byDate(a.sessions);
    return WeekPlan.week({ containing: a.containing, overrides: a.overrides, plan: a.plan }).map((day) =>
      resolve(day, { logged, deload: a.deload, isOverridden: a.overrides[day.key] !== undefined, now }),
    );
  },

  /**
   * Planned days that passed with nothing saved, newest first: what the
   * alert center asks about.
   *
   * Only the last `days` days count, and never a date before the account's
   * first saved workout — a plan picked today has not been "missed" all
   * the weeks before it. `dismissed` holds the date keys already answered
   * with "niet getraind". Today is never missed: it is not over.
   */
  missed(a: {
    lookingBack?: number;
    plan: WorkoutDay[];
    overrides: Record<string, string>;
    sessions: TrainingSession[];
    deload?: Deload;
    dismissed?: Set<string>;
    now?: Date;
  }): AgendaDay[] {
    const days = a.lookingBack ?? 14;
    const dismissed = a.dismissed ?? new Set<string>();
    const now = a.now ?? new Date();
    const { plan, overrides, sessions, deload } = a;
    const today = startOfDay(now);
    let first: Date | undefined;
    for (const s of sessions) {
      if (s.kind !== "workout") continue;
      if (first === undefined || s.date.getTime() < first.getTime()) first = s.date;
    }
    if (first === undefined) return [];
    const window = addDays(today, -days);
    const firstDay = startOfDay(first);
    const from = window.getTime() >= firstDay.getTime() ? window : firstDay;
    if (!(from.getTime() < today.getTime())) return [];

    const seen = new Set<string>();
    const found: AgendaDay[] = [];
    let cursor = from;
    while (cursor.getTime() < today.getTime()) {
      for (const day of Agenda.week({ containing: cursor, plan, overrides, sessions, deload, now })) {
        if (seen.has(day.key)) continue;
        seen.add(day.key);
        if (!(day.date.getTime() >= from.getTime() && day.date.getTime() < today.getTime()
          && !dismissed.has(day.key) && day.content.kind === "missed")) continue;
        found.push(day);
      }
      cursor = addDays(cursor, 7);
    }
    // The last week may start after `cursor` stepped past `today`'s week.
    for (const day of Agenda.week({ containing: today, plan, overrides, sessions, deload, now })) {
      if (seen.has(day.key)) continue;
      if (!(day.date.getTime() >= from.getTime() && day.date.getTime() < today.getTime()
        && !dismissed.has(day.key) && day.content.kind === "missed")) continue;
      found.push(day);
    }
    return sortedWhere(found, (l, r) => l.date.getTime() > r.date.getTime());
  },

  /** One date, read the same way the week reads it. */
  day(a: {
    on: Date;
    plan: WorkoutDay[];
    overrides: Record<string, string>;
    sessions: TrainingSession[];
    deload?: Deload;
    now?: Date;
  }): AgendaDay | undefined {
    const key = Schedule.dateKey(a.on);
    return Agenda.week({
      containing: a.on, plan: a.plan, overrides: a.overrides, sessions: a.sessions, deload: a.deload, now: a.now,
    }).find((d) => d.key === key);
  },

  /**
   * Workouts by the date they were saved on. A date holding more than one
   * keeps the newest, which is the one a re-log produced.
   */
  byDate(sessions: TrainingSession[]): Map<string, TrainingSession> {
    const result = new Map<string, TrainingSession>();
    const sorted = sortedWhere(sessions.filter((s) => s.kind === "workout"), (l, r) => l.date.getTime() < r.date.getTime());
    for (const session of sorted) result.set(Schedule.dateKey(session.date), session);
    return result;
  },

  // MARK: - Several weeks at once (41d)

  /**
   * The weeks the drawer shows when it is pulled open: the week `date`
   * falls in, the one before it and the two after — read exactly as the
   * rail reads its own week.
   */
  weeks(a: {
    around: Date;
    back?: number;
    forward?: number;
    plan: WorkoutDay[];
    overrides: Record<string, string>;
    sessions: TrainingSession[];
    deload?: Deload;
    firstSession?: Date;
    now?: Date;
  }): Agenda_Week[] {
    const back = a.back ?? 1;
    const forward = a.forward ?? 2;
    const now = a.now ?? new Date();
    const out: Agenda_Week[] = [];
    for (let offset = -back; offset <= forward; offset++) {
      const anchor = addWeeks(a.around, offset);
      const days = Agenda.week({
        containing: anchor, plan: a.plan, overrides: a.overrides, sessions: a.sessions, deload: a.deload, now,
      });
      const first = days[0];
      if (first === undefined) continue;
      out.push({
        days,
        number: WeekPlan.number({ firstSession: a.firstSession, on: first.date }),
        isCurrent: days.some((d) => d.isToday),
      });
    }
    return out;
  },

  // MARK: - What comes next

  /**
   * The first session still to come after `date`: the next date holding a
   * planned session with nothing saved on it. Rest days, logged days and
   * days that passed unlogged are stepped over — from a rest day, this is
   * the answer to 39a's second question.
   *
   * It reads through `week(containing:)`, so it sees exactly what the rail
   * and the Agenda see: the schedule's overrides, the saved sessions, and
   * the lighter week on the dates it covers. The search runs through the
   * week `date` falls in and the `weeks` after it; past that, nothing is
   * planned. Nothing is written.
   */
  nextTraining(a: {
    after: Date;
    plan: WorkoutDay[];
    overrides: Record<string, string>;
    sessions: TrainingSession[];
    deload?: Deload;
    now?: Date;
    withinWeeks?: number;
  }): AgendaDay | undefined {
    const now = a.now ?? new Date();
    const weeks = a.withinWeeks ?? 4;
    const from = startOfDay(a.after);
    for (let offset = 0; offset <= Math.max(0, weeks); offset++) {
      const anchor = addWeeks(a.after, offset);
      const days = Agenda.week({
        containing: anchor, plan: a.plan, overrides: a.overrides, sessions: a.sessions, deload: a.deload, now,
      });
      const next = days.find((day) => {
        if (!(startOfDay(day.date).getTime() > from.getTime())) return false;
        return day.content.kind === "planned";
      });
      if (next !== undefined) return next;
    }
    return undefined;
  },

  /**
   * When a date falls, said from `now` the way 39a says it: "morgen",
   * "overmorgen", a weekday later this week, and the weekday with its date
   * once it lies beyond this week — where the rail no longer shows it.
   */
  when(date: Date, a: { from?: Date } = {}): string {
    const now = a.from ?? new Date();
    const days = dayComponent(startOfDay(now), startOfDay(date));
    switch (days) {
      case 0: return "today";
      case 1: return "tomorrow";
      case 2: return "the day after tomorrow";
      case -1: return "yesterday";
      case -2: return "two days ago";
      default: {
        const thisWeek = Schedule.mondayFirstWeek({ containing: now });
        if (thisWeek.some((d) => isSameDay(d, date))) {
          return WeekPlan.fullWeekday(date);
        }
        return `${WeekPlan.fullWeekday(date)} ${Agenda.shortDate(date)}`;
      }
    }
  },

  /**
   * 39a's supporting line: "Volgende training morgen", or that nothing is
   * planned at all.
   */
  restLine(a: { next: AgendaDay | undefined; now?: Date }): string {
    if (a.next === undefined) return "No training planned";
    return `Next training ${Agenda.when(a.next.date, { from: a.now ?? new Date() })}`;
  },

  /**
   * 39a's next-session row, right side: "vr 11 sep · ±55 min". The minutes
   * come from the effective prescription, so a lighter week says less.
   */
  sessionLine(day: AgendaDay): string | undefined {
    const workout = AgendaDay.plannedDay(day);
    if (workout === undefined) return undefined;
    return `${day.weekday} ${Agenda.shortDate(day.date)} · ±${WeekPlan.minutes({ of: workout })} min`;
  },

  // MARK: - What a week says about itself

  /**
   * "4 sessies gelogd", "no sessions logged", or where today is
   * (34a: "vandaag maandag 7 sep").
   */
  summary(a: { of: AgendaDay[]; now?: Date }): string {
    const week = a.of;
    const today = week.find((d) => d.isToday);
    if (today !== undefined) {
      return `today, ${WeekPlan.fullWeekday(today.date)} ${Agenda.shortDate(today.date)}`;
    }
    const count = week.filter((d) => AgendaDay.isLogged(d)).length;
    switch (count) {
      case 0: return "no sessions logged";
      case 1: return "1 session logged";
      default: return `${count} sessions logged`;
    }
  },

  /** "7 sep" */
  shortDate(date: Date): string {
    return formatEnUS(date, "d MMM").replaceAll(".", "");
  },
};
