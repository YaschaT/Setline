import { PlannedExercise, type WorkoutDay } from "../Domain/Model";
import { StateChange } from "../Sync/StateChange";
import { formatEnUS, weekday } from "../Support/calendar";
import { isSameMonth, weekOfYearComponent } from "../Support/engine";
import { deepEqual } from "../Support/swift";
import { RestPrescription } from "./RestPrescription";
import { Schedule } from "./Schedule";

/**
 * What a date holds.
 *
 * `rest` is a decision — the account marked this date as a rest day.
 * `open` is the absence of one: nothing is planned and nothing was said,
 * which is why it can still be marked.
 */
export type WeekPlan_Kind =
  | { kind: "training"; value: WorkoutDay }
  | { kind: "rest" }
  | { kind: "open" };

export interface WeekPlan_Day {
  readonly date: Date;
  readonly key: string;
  readonly weekday: string;
  readonly assignment?: string;
  readonly kind: WeekPlan_Kind;
  /** The weekday this session usually falls on, when it is not there. */
  readonly movedFrom?: string;
}
export const WeekPlan_Day = {
  id(self: WeekPlan_Day): string {
    return self.key;
  },

  workout(self: WeekPlan_Day): WorkoutDay | undefined {
    return self.kind.kind === "training" ? self.kind.value : undefined;
  },

  isTraining(self: WeekPlan_Day): boolean {
    return WeekPlan_Day.workout(self) !== undefined;
  },
};

function formatted(date: Date, format: string): string {
  return formatEnUS(date, format).replaceAll(".", "");
}
function dayNumber(date: Date): string {
  return formatted(date, "d");
}
function month(date: Date): string {
  return formatted(date, "MMM");
}

/**
 * The usual weekday for this session, named in full — and only when the
 * session has actually left it. A session still on its own weekday has
 * not moved, and a second copy of it elsewhere is a second copy, not a
 * move.
 */
function movedFrom(a: {
  canonical: string;
  on: string;
  dates: Date[];
  keys: string[];
  overrides: Record<string, string>;
}): string | undefined {
  const { canonical, dates, keys, overrides } = a;
  const home = dates.findIndex((d) => WeekPlan.defaultDay({ for: d, overrides }) === canonical);
  if (home === -1) return undefined;
  if (keys[home] === a.on) return undefined;
  const atHome = overrides[keys[home]] ?? WeekPlan.defaultDay({ for: dates[home], overrides });
  if (atHome === canonical) return undefined;
  return WeekPlan.fullWeekday(dates[home]);
}

/**
 * One week of the plan, as the week agenda shows it.
 *
 * The plan says which day of the week each session belongs on. An override
 * says otherwise for one date. This reads both and reports, per date, what is
 * planned, whether the account said so itself, and whether the session is
 * sitting somewhere other than its usual day.
 */
export const WeekPlan = {
  /** The seven dates of the week `date` falls in, Monday first. */
  week(a: { containing: Date; overrides: Record<string, string>; plan: WorkoutDay[] }): WeekPlan_Day[] {
    const { overrides, plan } = a;
    const dates = Schedule.mondayFirstWeek({ containing: a.containing });
    const keys = dates.map((d) => Schedule.dateKey(d));

    return dates.map((date, index) => {
      const key = keys[index];
      const assignment = overrides[key];
      const canonical = assignment ?? WeekPlan.defaultDay({ for: date, overrides });
      const workout = Schedule.day({ for: canonical, in: plan });

      let kind: WeekPlan_Kind;
      if (workout !== undefined) {
        kind = { kind: "training", value: workout };
      } else {
        kind = assignment === undefined ? { kind: "open" } : { kind: "rest" };
      }

      return {
        date,
        key,
        weekday: Schedule.weekdayLabel(date),
        assignment,
        kind,
        movedFrom: workout === undefined ? undefined : movedFrom({ canonical, on: key, dates, keys, overrides }),
      };
    });
  },

  /** What a weekday holds without a change of its own: your week, else the program's. */
  defaultDay(a: { for: Date; overrides?: Record<string, string> }): string {
    const own = a.overrides ? Schedule.ownWeekDay({ for: a.for, overrides: a.overrides }) : undefined;
    return own ?? Schedule.defaultWeek[weekday(a.for) - 1] ?? "rest";
  },

  // MARK: - What a session costs

  sets(a: { of: WorkoutDay }): number {
    return a.of.exercises.reduce((total, p) => total + PlannedExercise.targetSets(p), 0);
  },

  /**
   * Planned sets times the rest each one's role prescribes, plus about
   * 40 s under the bar. Presented as an estimate, never as a promise.
   */
  minutes(a: { of: WorkoutDay }): number {
    const seconds = a.of.exercises.reduce(
      (total, planned) => total + PlannedExercise.targetSets(planned) * (RestPrescription.forRole(planned.role).defaultSeconds + 40),
      0,
    );
    return Math.max(1, Math.trunc(seconds / 60));
  },

  // MARK: - Labels

  /** "14–20 sep", or "28 sep–4 okt" across a month boundary. */
  range(dates: Date[]): string {
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (first === undefined || last === undefined) return "";
    const sameMonth = isSameMonth(first, last);
    return sameMonth
      ? `${dayNumber(first)}–${dayNumber(last)} ${month(last)}`
      : `${dayNumber(first)} ${month(first)}–${dayNumber(last)} ${month(last)}`;
  },

  /**
   * Week 1 is the week of the first session logged; before that, week 1.
   *
   * Counted from the start of each week, so every date inside a week gives
   * the same number — the drawer's header and its rows cannot disagree
   * about which week you are looking at.
   */
  number(a: { firstSession: Date | undefined; on?: Date }): number {
    const firstSession = a.firstSession;
    const date = a.on ?? new Date();
    if (firstSession === undefined) return 1;
    const from = Schedule.mondayFirstWeek({ containing: firstSession })[0] ?? firstSession;
    const to = Schedule.mondayFirstWeek({ containing: date })[0] ?? date;
    const weeks = weekOfYearComponent(from, to);
    return Math.max(1, weeks + 1);
  },

  fullWeekday(date: Date): string {
    return formatted(date, "EEEE");
  },
};

/**
 * A week being rearranged, before it is saved.
 *
 * Every state this can reach is one the web app reads the same way, which is
 * the whole constraint: a date either names a day of the plan, names `rest`,
 * or says nothing at all and lets the plan decide. There is no fourth value
 * meaning "emptied", so moving a session gives the date it left the day the
 * other date was holding — the same trade the web app performs.
 *
 * Swift's `mutating` methods return the changed draft here.
 */
export interface WeekDraft {
  readonly dates: Date[];
  readonly keys: string[];
  readonly stored: Record<string, string>;
  readonly overrides: Record<string, string>;
  /** Your own week, which the dates fall back to; never edited here. */
  readonly week: Record<string, string>;
}
export const WeekDraft = {
  make(a: { dates: Date[]; overrides: Record<string, string> }): WeekDraft {
    const keys = a.dates.map((d) => Schedule.dateKey(d));
    const mine: Record<string, string> = {};
    for (const [key, value] of Object.entries(a.overrides)) {
      if (keys.includes(key)) mine[key] = value;
    }
    return { dates: a.dates, keys, stored: mine, overrides: { ...mine }, week: Schedule.weekOnly(a.overrides) };
  },

  assignments(self: WeekDraft): Record<string, string> {
    return self.overrides;
  },

  isChanged(self: WeekDraft): boolean {
    return !deepEqual(self.overrides, self.stored);
  },

  /** What the date holds once the plan has had its say. */
  canonical(self: WeekDraft, a: { on: string }): string {
    const named = self.overrides[a.on];
    if (named !== undefined) return named;
    const index = self.keys.indexOf(a.on);
    if (index === -1) return "rest";
    return WeekPlan.defaultDay({ for: self.dates[index], overrides: self.week });
  },

  /**
   * The two dates trade what they hold, so nothing is dropped on the way.
   *
   * Each end is then written down only where it differs from the plan. A
   * date left holding what the plan would have given it anyway keeps no
   * override at all — which is why a session dragged off a day the plan
   * rests on leaves that day empty rather than resting by decree, and why
   * dragging a session back to its own weekday tidies up after itself.
   */
  move(self: WeekDraft, a: { from: string; to: string }): WeekDraft {
    const source = a.from;
    const target = a.to;
    if (source === target || !self.keys.includes(source) || !self.keys.includes(target)) return self;
    const moving = WeekDraft.canonical(self, { on: source });
    const displaced = WeekDraft.canonical(self, { on: target });
    let next = WeekDraft.assign(self, moving, { to: target });
    next = WeekDraft.assign(next, displaced, { to: source });
    return next;
  },

  /**
   * Puts a day on a date, writing it down only where it differs from the
   * plan's own shape.
   */
  assign(self: WeekDraft, canonical: string, a: { to: string }): WeekDraft {
    const key = a.to;
    const index = self.keys.indexOf(key);
    if (index === -1) return self;
    const overrides = { ...self.overrides };
    if (canonical === WeekPlan.defaultDay({ for: self.dates[index], overrides: self.week })) {
      delete overrides[key];
    } else {
      overrides[key] = canonical;
    }
    return { ...self, overrides };
  },

  /**
   * "Markeer als rustdag" — a decision, recorded, even where the plan rests
   * anyway.
   */
  markRest(self: WeekDraft, key: string): WeekDraft {
    if (!self.keys.includes(key)) return self;
    return { ...self, overrides: { ...self.overrides, [key]: "rest" } };
  },

  /** Hands the date back to the plan. */
  clear(self: WeekDraft, key: string): WeekDraft {
    const overrides = { ...self.overrides };
    delete overrides[key];
    return { ...self, overrides };
  },

  week(self: WeekDraft, a: { plan: WorkoutDay[] }): WeekPlan_Day[] {
    const first = self.dates[0];
    if (first === undefined) return [];
    return WeekPlan.week({ containing: first, overrides: self.overrides, plan: a.plan });
  },

  /**
   * One change per date that actually moved, and nothing for the rest of
   * the account's schedule.
   */
  changes(self: WeekDraft, a: { programKey: string; now?: Date }): StateChange[] {
    const now = a.now ?? new Date();
    const out: StateChange[] = [];
    for (const key of self.keys) {
      const before = self.stored[key];
      const after = self.overrides[key];
      if (before === after) continue;
      if (after === undefined) {
        out.push(StateChange.make({ kind: "removeScheduleOverride", key: `${a.programKey}:${key}` }, { createdAt: now }));
        continue;
      }
      out.push(StateChange.make({ kind: "setScheduleDay", key: `${a.programKey}:${key}`, dayID: after }, { createdAt: now }));
    }
    return out;
  },
};
