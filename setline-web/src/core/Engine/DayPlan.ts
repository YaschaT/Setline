import type { TrainingSession, WorkoutDay } from "../Domain/Model";
import { StateChange } from "../Sync/StateChange";
import { capitalized } from "../Support/engine";
import { Agenda, AgendaDay } from "./Agenda";
import type { Deload } from "./Fatigue";
import { Schedule } from "./Schedule";
import { WeekPlan } from "./WeekPlan";

export type DayPlan_Option_Kind =
  /** A session from the active programme. */
  | { kind: "session"; id: string }
  /** No session on this date. */
  | { kind: "rest" }
  /** Whatever the programme itself says — the change is removed. */
  | { kind: "standard" };

/** One row of the sheet. */
export interface DayPlan_Option {
  readonly kind: DayPlan_Option_Kind;
  readonly title: string;
  /**
   * "ook ma 7" — the other dates this week already holding it —
   * "huidig", or what the programme's standard is for this date.
   */
  readonly hint?: string;
  /** What the date reads as right now. */
  readonly isCurrent: boolean;
}
export const DayPlan_Option = {
  make(a: { kind: DayPlan_Option_Kind; title: string; hint: string | undefined; isCurrent: boolean }): DayPlan_Option {
    return { kind: a.kind, title: a.title, hint: a.hint, isCurrent: a.isCurrent };
  },

  id(self: DayPlan_Option): string {
    switch (self.kind.kind) {
      case "session": return `session-${self.kind.id}`;
      case "rest": return "rest";
      case "standard": return "standard";
    }
  },
};

/**
 * "ook ma 7" — where else this week the same session already falls, so
 * putting it here twice is a choice rather than an accident. The session
 * the date already holds says "huidig" instead.
 */
function hint(workout: WorkoutDay, a: { on: string; in: AgendaDay[]; isCurrent: boolean }): string | undefined {
  const elsewhere = a.in
    .filter((d) => d.key !== a.on && AgendaDay.plannedDay(d)?.id === workout.id)
    .map((d) => `${d.weekday} ${d.dayNumber}`);
  const also = elsewhere.length === 0 ? undefined : `also ${elsewhere.join(" · ")}`;
  if (a.isCurrent) return also !== undefined ? `current · ${also}` : "current";
  return also;
}

/**
 * Artboards 41e–41g · what one date can be set to.
 *
 * "Wijzig deze dag" changes which session belongs to a date — never the
 * exercises inside that session, and never another date. A date holds one
 * assignment: choosing again replaces the one before it, and choosing the
 * programme's own standard removes the change altogether.
 *
 * A date that already holds a saved session is not assignable at all: the
 * date belongs to what was done on it (41g).
 */
export interface DayPlan {
  readonly date: Date;
  /** `yyyy-MM-dd`, the half of the override key that names the date. */
  readonly dateKey: string;
  /** "Donderdag 10 sep" */
  readonly title: string;
  /**
   * "Nu: rustdag · volgens je plan", "Nu: Pull A · door jou gezet", or what
   * a logged day holds: "Pull A · gelogd · 54 min".
   */
  readonly state: string;
  /** A date whose session was logged. Nothing here may be assigned (41g). */
  readonly isLocked: boolean;
  /** Set by hand rather than by the programme, which the rail draws dashed. */
  readonly isOverridden: boolean;
  readonly session?: TrainingSession;
  readonly options: DayPlan_Option[];
  /**
   * What the programme itself says about this date, named: a session or
   * "rustdag". The sheet offers it as the way back to standard.
   */
  readonly standardTitle: string;
  /** The programme's own day id for this date, or `rest`. */
  readonly standardID: string;
}
export const DayPlan = {
  // MARK: - Reading a date

  make(a: {
    for: Date;
    plan: WorkoutDay[];
    overrides: Record<string, string>;
    sessions: TrainingSession[];
    deload?: Deload;
    now?: Date;
  }): DayPlan {
    const date = a.for;
    const { plan, overrides, sessions, deload } = a;
    const now = a.now ?? new Date();
    const key = Schedule.dateKey(date);
    const week = Agenda.week({ containing: date, plan, overrides, sessions, deload, now });
    const day = week.find((d) => d.key === key);
    const isOverridden = overrides[key] !== undefined;

    // The programme's own reading of this date, with every change taken
    // off: the way back to standard has to name what it returns to.
    const standardID = Schedule.canonicalDay({ for: date, overrides: {} });
    const standard = Schedule.day({ for: standardID, in: plan });
    const standardTitle = standard?.short ?? "rest day";
    const standardDayID = standard?.id ?? "rest";

    const title = `${capitalized(WeekPlan.fullWeekday(date))} ${Agenda.shortDate(date)}`;

    const session = day !== undefined ? AgendaDay.session(day) : undefined;
    if (session !== undefined) {
      let state = `${session.dayLabel} · logged`;
      const seconds = session.durationSeconds;
      if (seconds !== undefined && seconds > 0) {
        state += ` · ${Math.max(1, Math.trunc(seconds / 60))} min`;
      }
      return {
        date, dateKey: key, title, state,
        isLocked: true, isOverridden, session,
        options: [], standardTitle, standardID: standardDayID,
      };
    }

    const currentID = Schedule.canonicalDay({ for: date, overrides });
    const current = Schedule.day({ for: currentID, in: plan });
    let state: string;
    if (isOverridden) {
      state = `Now: ${current?.short ?? "rest"} · set by you`;
    } else {
      state = `Now: ${current !== undefined ? `${current.short}` : "rest day"} · from your plan`;
    }

    const options: DayPlan_Option[] = plan.map((workout) =>
      DayPlan_Option.make({
        kind: { kind: "session", id: workout.id },
        title: workout.short,
        hint: hint(workout, { on: key, in: week, isCurrent: workout.id === current?.id }),
        isCurrent: workout.id === current?.id,
      }),
    );
    options.push(DayPlan_Option.make({
      kind: { kind: "rest" },
      title: "Rest",
      hint: current === undefined && !isOverridden ? undefined : (current === undefined ? "current" : undefined),
      isCurrent: current === undefined,
    }));
    // Offered only where there is a change to undo: without one, the date
    // already is the standard.
    if (isOverridden) {
      options.unshift(
        DayPlan_Option.make({ kind: { kind: "standard" }, title: "Back to standard", hint: standardTitle, isCurrent: false }),
      );
    } else {
      options.push(DayPlan_Option.make({
        kind: { kind: "standard" },
        title: "Your plan's standard",
        hint: standardTitle,
        isCurrent: true,
      }));
    }

    return {
      date, dateKey: key, title, state,
      isLocked: false, isOverridden, session: undefined,
      options, standardTitle, standardID: standardDayID,
    };
  },

  // MARK: - What the sheet says about a choice

  /**
   * The line under the options: what changing this date does, and what it
   * deliberately leaves alone.
   */
  note(self: DayPlan, a: { for: DayPlan_Option }): string {
    void self;
    const option = a.for;
    switch (option.kind.kind) {
      case "standard":
        return "A change replaces the previous one; nothing stacks. The dotted ring on the strip disappears once the day is back to standard.";
      case "rest":
        return "This only changes this date. Your plan itself stays as it is.";
      case "session": {
        const doubled = option.hint?.includes("also ") === true;
        const stays = option.hint !== undefined
          ? option.hint.replaceAll("current · ", "").replaceAll("also ", "")
          : "";
        if (doubled) {
          return `${option.title} will then be in this week twice; ${stays} stays. This only changes this date, not the exercises in ${option.title}.`;
        }
        return `This only changes this date, not the exercises in ${option.title}.`;
      }
    }
  },

  /** The button: what it will do, named, so nothing is confirmed blind. */
  confirmTitle(self: DayPlan, a: { for: DayPlan_Option }): string {
    const option = a.for;
    const when = `${Schedule.weekdayLabel(self.date)} ${self.date.getDate()}`;
    switch (option.kind.kind) {
      case "standard": return `Reset to ${self.standardTitle}`;
      case "rest": return `Make ${when} a rest day`;
      case "session": return `Put ${option.title} on ${when}`;
    }
  },

  /**
   * The one change this sheet writes: one date, by its own key. A date
   * going back to standard drops its override; anything else names what it
   * now holds. Nothing else in the schedule is touched.
   */
  change(self: DayPlan, a: { for: DayPlan_Option; programKey: string; now?: Date }): StateChange | undefined {
    const option = a.for;
    const now = a.now ?? new Date();
    if (self.isLocked || option.isCurrent) return undefined;
    const key = `${a.programKey}:${self.dateKey}`;
    switch (option.kind.kind) {
      case "standard":
        if (!self.isOverridden) return undefined;
        return StateChange.make({ kind: "removeScheduleOverride", key }, { createdAt: now });
      case "rest":
        // Choosing what the programme itself says takes the change off
        // rather than writing the same thing over it.
        if (self.isOverridden && self.standardID === "rest") {
          return StateChange.make({ kind: "removeScheduleOverride", key }, { createdAt: now });
        }
        return StateChange.make({ kind: "setScheduleDay", key, dayID: "rest" }, { createdAt: now });
      case "session": {
        const id = option.kind.id;
        if (self.isOverridden && id === self.standardID) {
          return StateChange.make({ kind: "removeScheduleOverride", key }, { createdAt: now });
        }
        return StateChange.make({ kind: "setScheduleDay", key, dayID: id }, { createdAt: now });
      }
    }
  },
};
