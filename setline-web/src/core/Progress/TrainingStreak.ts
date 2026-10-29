import type { TrainingSession, WorkoutDay } from "../Domain/Model";
import { Schedule } from "../Engine/Schedule";
import { WeekPlan, WeekPlan_Day } from "../Engine/WeekPlan";
import { addDays } from "../Support/calendar";

/**
 * Weeks in a row in which you trained as often as your plan asked.
 *
 * A weekly streak rather than Duolingo's daily one, because lifting has
 * rest days: a daily count would break on the days the plan tells you not
 * to train. A week counts once it holds as many logged workouts as the plan
 * has training days that week — on any days, so a session moved to Sunday
 * still counts. The week that is running never breaks the streak: until it
 * is over it can still be met, and once met it joins the count at once.
 *
 * A streak freeze: one missed week in any four is forgiven — the streak
 * neither grows nor breaks — so one sick week doesn't undo months of
 * training. Two misses within four weeks still break it.
 */
export interface TrainingStreak {
  /** Weeks met in a row, the running week included once it is met. */
  readonly weeks: number;
  /** Workouts logged this week, and how many the plan asks for. */
  readonly thisWeekDone: number;
  readonly thisWeekGoal: number;
  /** The longest streak this account has had, the current one included. */
  best: number;
  /** Whether a missed week would be forgiven right now. */
  freezeAvailable: boolean;
  /** Last week was missed and the freeze covered it. */
  freezeUsedLastWeek: boolean;
}

/**
 * How the running week stands against the streak, given how many days
 * are still open for a workout (today counts while nothing is logged).
 */
export type TrainingStreak_Risk =
  /** Met, no streak to lose, or room to spare. */
  | "none"
  /** Every day left needs a workout. */
  | "tight"
  /** The week can no longer be met; the freeze will forgive it. */
  | "freezeCovers"
  /** The week can no longer be met, and the streak ends with it. */
  | "breaks";

export const TrainingStreak_Risk = {
  none: "none" as TrainingStreak_Risk,
  tight: "tight" as TrainingStreak_Risk,
  freezeCovers: "freezeCovers" as TrainingStreak_Risk,
  breaks: "breaks" as TrainingStreak_Risk,
};

type InitArgs = {
  weeks: number;
  thisWeekDone: number;
  thisWeekGoal: number;
  best?: number;
  freezeAvailable?: boolean;
  freezeUsedLastWeek?: boolean;
};

type MakeArgs = {
  sessions: TrainingSession[];
  plan: WorkoutDay[];
  overrides: Record<string, string>;
  now?: Date;
};

function initStreak(a: InitArgs): TrainingStreak {
  return {
    weeks: a.weeks,
    thisWeekDone: a.thisWeekDone,
    thisWeekGoal: a.thisWeekGoal,
    best: Math.max(a.best ?? 0, a.weeks),
    freezeAvailable: a.freezeAvailable ?? true,
    freezeUsedLastWeek: a.freezeUsedLastWeek ?? false,
  };
}

function makeFromSessions(a: MakeArgs): TrainingStreak {
  const now = a.now ?? new Date();
  const workouts = a.sessions.filter((session) => session.kind === "workout");
  // Days trained, by the Monday of their week: two sessions on one day
  // are one training day.
  const trainedDays = new Map<string, Set<string>>();
  for (const session of workouts) {
    const monday = Schedule.mondayFirstWeek({ containing: session.date })[0];
    if (monday === undefined) continue;
    const key = Schedule.dateKey(monday);
    const days = trainedDays.get(key) ?? new Set<string>();
    days.add(Schedule.dateKey(session.date));
    trainedDays.set(key, days);
  }

  const week = (monday: Date): { done: number; goal: number } => {
    const goal = WeekPlan.week({ containing: monday, overrides: a.overrides, plan: a.plan }).filter((day) =>
      WeekPlan_Day.isTraining(day),
    ).length;
    const done = trainedDays.get(Schedule.dateKey(monday))?.size ?? 0;
    return { done, goal: Math.max(goal, 1) };
  };

  const thisMonday = Schedule.mondayFirstWeek({ containing: now })[0];
  if (thisMonday === undefined) {
    return initStreak({ weeks: 0, thisWeekDone: 0, thisWeekGoal: 1 });
  }
  const current = week(thisMonday);
  let first: Date | undefined;
  for (const session of workouts) if (first === undefined || session.date.getTime() < first.getTime()) first = session.date;
  const firstMonday = first === undefined ? undefined : Schedule.mondayFirstWeek({ containing: first })[0];
  if (firstMonday === undefined) {
    return initStreak({ weeks: 0, thisWeekDone: current.done, thisWeekGoal: current.goal });
  }

  // Every finished week since the first workout, oldest first.
  const met: boolean[] = [];
  let monday = firstMonday;
  while (monday.getTime() < thisMonday.getTime()) {
    const past = week(monday);
    met.push(past.done >= past.goal);
    monday = addDays(monday, 7);
  }
  const history = TrainingStreak.run(met);
  const weeks = history.streak + (current.done >= current.goal ? 1 : 0);
  return initStreak({
    weeks,
    thisWeekDone: current.done,
    thisWeekGoal: current.goal,
    best: Math.max(history.best, weeks),
    freezeAvailable: history.sinceFreeze >= TrainingStreak.freezeEvery,
    freezeUsedLastWeek: history.lastFrozen,
  });
}

export const TrainingStreak = {
  /**
   * `init(weeks:thisWeekDone:thisWeekGoal:best:freezeAvailable:freezeUsedLastWeek:)`,
   * and `static func make(sessions:plan:overrides:now:calendar:)` — the two
   * share Swift's spelling `make` here, told apart by their labels.
   */
  make: ((a: InitArgs | MakeArgs) => ("sessions" in a ? makeFromSessions(a) : initStreak(a))) as {
    (a: InitArgs): TrainingStreak;
    (a: MakeArgs): TrainingStreak;
  },

  thisWeekMet(self: TrainingStreak): boolean {
    return self.thisWeekDone >= self.thisWeekGoal;
  },

  /** Weeks a freeze needs between uses. */
  freezeEvery: 4,

  risk(self: TrainingStreak, a: { daysLeft: number }): TrainingStreak_Risk {
    if (!(self.weeks > 0) || TrainingStreak.thisWeekMet(self)) return "none";
    const left = self.thisWeekGoal - self.thisWeekDone;
    if (left > a.daysLeft) return self.freezeAvailable ? "freezeCovers" : "breaks";
    return left === a.daysLeft ? "tight" : "none";
  },

  /**
   * The streak over a run of finished weeks, oldest first: where it stands
   * after the last one, the best it reached, and how the freeze stands.
   */
  run(met: boolean[]): { streak: number; best: number; sinceFreeze: number; lastFrozen: boolean } {
    let streak = 0;
    let best = 0;
    let sinceFreeze = TrainingStreak.freezeEvery;
    let lastFrozen = false;
    for (const week of met) {
      lastFrozen = false;
      if (week) {
        streak += 1;
        sinceFreeze += 1;
      } else if (streak > 0 && sinceFreeze >= TrainingStreak.freezeEvery) {
        sinceFreeze = 0;
        lastFrozen = true;
      } else {
        streak = 0;
        sinceFreeze = TrainingStreak.freezeEvery;
      }
      best = Math.max(best, streak);
    }
    return { streak, best, sinceFreeze, lastFrozen };
  },
};
