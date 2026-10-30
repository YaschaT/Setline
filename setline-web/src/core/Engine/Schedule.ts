import type { WorkoutDay } from "../Domain/Model";
import { addDays, dateFrom, formatEnUS, formatPOSIX, startOfMondayWeek, weekday } from "../Support/calendar";
import { swiftInt } from "../Support/engine";

/**
 * Which day of the plan falls on a given date.
 *
 * Mirrors the web app: a per-date override wins, otherwise the default
 * week shape. Keys are `yyyy-MM-dd` in the device's calendar, the same
 * string the web app writes.
 */
export const Schedule = {
  /**
   * Index is `Calendar.component(.weekday)` − 1, i.e. 0 = Sunday, matching
   * JavaScript's `Date#getDay()` so both clients agree.
   */
  defaultWeek: {
    0: "rest", 1: "push", 2: "pull", 3: "legs", 4: "rest", 5: "lower", 6: "upper",
  } as Record<number, string>,

  dateKey(date: Date): string {
    return formatPOSIX(date, "yyyy-MM-dd");
  },

  /** "2026-10-11" back to the start of that day. */
  date(a: { fromKey: string }): Date | undefined {
    // `split(separator:)` drops empty pieces; `compactMap(Int.init)` drops the rest.
    const parts = a.fromKey
      .split("-")
      .filter((p) => p !== "")
      .map(swiftInt)
      .filter((n): n is number => n !== undefined);
    if (parts.length !== 3) return undefined;
    return dateFrom({ year: parts[0], month: parts[1], day: parts[2] });
  },

  /** Alias of `date(fromKey:)` under its overload-style name. */
  dateFromKey(a: { fromKey: string }): Date | undefined {
    return Schedule.date(a);
  },

  /**
   * A week of your own, kept beside the dated changes: `week-1` is what
   * every Monday holds (0 = Sunday, as in `defaultWeek`). It is scoped per
   * program like every other change (`personal:week-1`), so it travels
   * between phones and the web the way a moved day already does.
   */
  weekKey(index: number): string {
    return `week-${index}`;
  },

  /**
   * The first date your own week holds for (`yyyy-MM-dd`): days before it
   * keep the week they had, so nothing already past turns into a missed
   * workout.
   */
  weekFromKey: "week-from",

  /** The weekday your own week puts on `date`, if it has one and it holds there. */
  ownWeekDay(a: { for: Date; overrides: Record<string, string> }): string | undefined {
    const from = a.overrides[Schedule.weekFromKey];
    if (from !== undefined && Schedule.dateKey(a.for) < from) return undefined;
    return a.overrides[Schedule.weekKey(weekday(a.for) - 1)];
  },

  /** The weekly plan's own entries only, without any dated change. */
  weekOnly(overrides: Record<string, string>): Record<string, string> {
    const week: Record<string, string> = {};
    for (const [key, value] of Object.entries(overrides)) if (key.startsWith("week-")) week[key] = value;
    return week;
  },

  /** A date's change first, then your own week, then the program's. */
  canonicalDay(a: { for: Date; overrides: Record<string, string> }): string {
    const override = a.overrides[Schedule.dateKey(a.for)];
    if (override !== undefined) return override;
    return Schedule.ownWeekDay(a) ?? Schedule.defaultWeek[weekday(a.for) - 1] ?? "rest";
  },

  /**
   * Resolves a canonical id onto the active plan, whose day ids are
   * prefixed in the science plans (`science-push`, `science-ul-upper-a`).
   */
  day(a: { for: string; in: WorkoutDay[] }): WorkoutDay | undefined {
    const canonical = a.for;
    const plan = a.in;
    if (canonical === "rest") return undefined;
    const exact = plan.find((d) => d.id === canonical);
    if (exact) return exact;
    return plan.find((d) => d.id.endsWith(`-${canonical}`)) ?? plan.find((d) => d.id.includes(canonical));
  },

  /** Alias of `day(for:in:)` under its overload-style name. */
  dayFor(a: { for: string; in: WorkoutDay[] }): WorkoutDay | undefined {
    return Schedule.day(a);
  },

  mondayFirstWeek(a: { containing: Date }): Date[] {
    const start = startOfMondayWeek(a.containing);
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) out.push(addDays(start, i));
    return out;
  },

  /**
   * Overrides are scoped per program, exactly as the web app scopes them:
   * `personal:2026-09-17`, or `science-ppl-ul:2026-09-17`.
   */
  programKey(a: { mode: string; sciencePlanID: string }): string {
    return a.mode === "personal" ? "personal" : `science-${a.sciencePlanID}`;
  },

  overrideKey(a: { for: Date; mode: string; sciencePlanID: string }): string {
    return `${Schedule.programKey({ mode: a.mode, sciencePlanID: a.sciencePlanID })}:${Schedule.dateKey(a.for)}`;
  },

  weekdayLabel(date: Date): string {
    return formatEnUS(date, "EEEEEE").replaceAll(".", "");
  },
};
