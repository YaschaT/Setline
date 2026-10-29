import { type ExerciseResult, LoggedSet, type TrainingSession } from "../Domain/Model";
import { SetExecution } from "../Domain/SetExecution";
import { SetFlags } from "../Domain/Vocabulary";
import { Estimates } from "../Engine/Estimates";
import { RecordsEngine } from "../Engine/RecordsEngine";
import { Schedule } from "../Engine/Schedule";
import { addDays, addingTimeInterval, daysBetween } from "../Support/calendar";
import { distantPast, isoWeekOfYear } from "../Support/progress";
import { dec, maxBy, rounded, sum } from "../Support/swift";
import { BodyProgress } from "./BodyProgress";

// What the redesign's overview screens state about the sets an account wrote
// down: the best set of a session (Agenda · "Vorige week"), the best sets of
// the last weeks and the tonnage per week (Progressie), and the trailing
// average under the weight chart.
//
// Every number is read from stored sessions and weigh-ins. Nothing is
// estimated beyond the one estimate the app already makes — the one-rep
// maximum that lets a heavy triple be weighed against a lighter set of eight
// — and the screens say so where they use it.
//
// The web app computes the same things in `lib/setline-log.ts`; the two are
// kept to the same rules.

// MARK: - The best set

/** One set, named by the exercise it belongs to. */
export interface ProgressOverview_BestSet {
  readonly exerciseID: string;
  readonly name: string;
  readonly weightKg: number;
  readonly reps: number;
  /** `nil` above ten reps, where no estimate is made. */
  readonly estimate?: number;
}

export const ProgressOverview_BestSet = {
  make(a: { exerciseID: string; name: string; weightKg: number; reps: number; estimate: number | undefined }): ProgressOverview_BestSet {
    return { exerciseID: a.exerciseID, name: a.name, weightKg: a.weightKg, reps: a.reps, estimate: a.estimate };
  },
};

// MARK: - Best sets of the last weeks

/**
 * An exercise's best set inside a window, and how it compares with the
 * best set before the window opened.
 */
export interface ProgressOverview_RecentBest {
  readonly exerciseID: string;
  readonly name: string;
  readonly weightKg: number;
  readonly reps: number;
  readonly date: Date;
  /**
   * Estimated maximum now minus the best one before the window, to the
   * half kilo — measured only against earlier sets performed the same
   * way (`SetExecution.isComparable`). `nil` when there is no such set.
   */
  readonly delta?: number;
  /**
   * Whether the exercise has an estimated set before the window at all,
   * performed any way. Without a delta it tells a new exercise from one
   * whose earlier sets were performed differently: only the first is new.
   */
  readonly hasEarlierBest: boolean;
}

export const ProgressOverview_RecentBest = {
  make(a: {
    exerciseID: string;
    name: string;
    weightKg: number;
    reps: number;
    date: Date;
    delta: number | undefined;
    hasEarlierBest: boolean;
  }): ProgressOverview_RecentBest {
    return {
      exerciseID: a.exerciseID,
      name: a.name,
      weightKg: a.weightKg,
      reps: a.reps,
      date: a.date,
      delta: a.delta,
      hasEarlierBest: a.hasEarlierBest,
    };
  },
  id(self: ProgressOverview_RecentBest): string {
    return self.exerciseID;
  },
};

// MARK: - Progress per training day

export interface ProgressOverview_DayProgress_Leader {
  readonly exerciseID: string;
  readonly name: string;
  readonly deltaKg: number;
}

export const ProgressOverview_DayProgress_Leader = {
  make(a: { exerciseID: string; name: string; deltaKg: number }): ProgressOverview_DayProgress_Leader {
    return { exerciseID: a.exerciseID, name: a.name, deltaKg: a.deltaKg };
  },
};

/** One lift's best set inside the window. */
export interface ProgressOverview_DayProgress_Lift {
  readonly exerciseID: string;
  readonly name: string;
  readonly weightKg: number;
  readonly reps: number;
  readonly date: Date;
  /**
   * Estimated maximum gained since the lift's baseline, to the
   * half kilo; `nil` when there is nothing comparable to measure from.
   */
  readonly deltaKg?: number;
  /** No set of this lift before the window and one session in it. */
  readonly isNew: boolean;
}

export const ProgressOverview_DayProgress_Lift = {
  make(a: {
    exerciseID: string;
    name: string;
    weightKg: number;
    reps: number;
    date: Date;
    deltaKg: number | undefined;
    isNew: boolean;
  }): ProgressOverview_DayProgress_Lift {
    return {
      exerciseID: a.exerciseID,
      name: a.name,
      weightKg: a.weightKg,
      reps: a.reps,
      date: a.date,
      deltaKg: a.deltaKg,
      isNew: a.isNew,
    };
  },
  id(self: ProgressOverview_DayProgress_Lift): string {
    return self.exerciseID;
  },
};

/**
 * How one kind of training day — Push, Pull, Legs, Upper, Lower — has
 * moved inside a window.
 */
export interface ProgressOverview_DayProgress {
  readonly dayID: string;
  /** The name the latest of these sessions carried. */
  readonly label: string;
  /** Sessions of this day inside the window. */
  readonly sessions: number;
  /**
   * The mean change of the day's lifts, in percent of estimated
   * maximum, to a tenth. `nil` while no lift has two comparable points.
   */
  readonly changePercent?: number;
  /** The lift that gained the most, in kilos of estimated maximum. */
  readonly leader?: ProgressOverview_DayProgress_Leader;
  /**
   * Every lift of the day with its best set in the window, in the
   * order the day trains them.
   */
  readonly lifts: ProgressOverview_DayProgress_Lift[];
  /**
   * The day's best so far after each session, against the lifts'
   * baselines, oldest first: 100 is where the day started, 107 is
   * seven percent stronger. Each lift counts at its best up to that
   * session, so the line never dips on a lighter day and ends exactly
   * at `changePercent` + 100. Sessions before any measured lift are
   * left out.
   */
  readonly strength: number[];
  /**
   * The session date of each `strength` value, so the line can be
   * drawn on time rather than evenly per session.
   */
  readonly strengthDates: Date[];
  readonly lastTrained: Date;
}

export const ProgressOverview_DayProgress = {
  make(a: {
    dayID: string;
    label: string;
    sessions: number;
    changePercent: number | undefined;
    leader: ProgressOverview_DayProgress_Leader | undefined;
    lifts?: ProgressOverview_DayProgress_Lift[];
    strength: number[];
    strengthDates?: Date[];
    lastTrained: Date;
  }): ProgressOverview_DayProgress {
    return {
      dayID: a.dayID,
      label: a.label,
      sessions: a.sessions,
      changePercent: a.changePercent,
      leader: a.leader,
      lifts: a.lifts ?? [],
      strength: a.strength,
      strengthDates: a.strengthDates ?? [],
      lastTrained: a.lastTrained,
    };
  },
  id(self: ProgressOverview_DayProgress): string {
    return self.dayID;
  },
};

// MARK: - Tonnage per week

export interface ProgressOverview_WeekVolume {
  /** The Monday the week starts on. */
  readonly start: Date;
  /** ISO 8601 week number — "w36". */
  readonly number: number;
  readonly volumeKg: number;
  readonly isCurrent: boolean;
}

export const ProgressOverview_WeekVolume = {
  make(a: { start: Date; number: number; volumeKg: number; isCurrent: boolean }): ProgressOverview_WeekVolume {
    return { start: a.start, number: a.number, volumeKg: a.volumeKg, isCurrent: a.isCurrent };
  },
  id(self: ProgressOverview_WeekVolume): Date {
    return self.start;
  },
};

// MARK: - Weight, smoothed

export interface ProgressOverview_WeightPoint {
  readonly date: Date;
  readonly weightKg: number;
  /** The mean of the weigh-ins in the window ending on this day. */
  readonly average: number;
}

export const ProgressOverview_WeightPoint = {
  make(a: { date: Date; weightKg: number; average: number }): ProgressOverview_WeightPoint {
    return { date: a.date, weightKg: a.weightKg, average: a.average };
  },
  id(self: ProgressOverview_WeightPoint): Date {
    return self.date;
  },
};

/** `values.max()` on numbers. */
function maxValue(values: readonly number[]): number | undefined {
  let best: number | undefined;
  for (const value of values) if (best === undefined || value > best) best = value;
  return best;
}

/**
 * The sets the best sets weigh: what progression counts, and a mixed set
 * too — it is a set that was performed, and only its comparison is
 * restricted. Warm-ups, breakdowns and partial reps stay out.
 */
function weighs(set: LoggedSet): boolean {
  if (!LoggedSet.isLogged(set) || set.isWarmup || SetFlags.contains(set.flags, SetFlags.technicalBreakdown)) return false;
  return (set.partialReps ?? 0) === 0;
}

export const ProgressOverview = {
  /**
   * `best(of:)`. The strongest of these sets: the highest estimated maximum,
   * and among sets that carry no estimate, the heaviest. Warm-ups,
   * breakdowns and sets that mix partial or paused reps are left out,
   * exactly as records and progression leave them out.
   */
  bestOf(a: { of: LoggedSet[] }): LoggedSet | undefined {
    const candidates = a.of.filter((set) => LoggedSet.countsTowardProgression(set));
    const estimated = candidates.flatMap((set): [LoggedSet, number][] => {
      const weight = set.weightKg;
      if (weight === undefined) return [];
      const estimate = Estimates.e1RM({ weightKg: weight, reps: set.reps });
      if (estimate === undefined) return [];
      return [[set, estimate]];
    });
    const top = maxBy(estimated, (x, y) => x[1] < y[1]);
    if (top !== undefined) return top[0];
    return maxBy(candidates, (lhs, rhs) => {
      const left = lhs.weightKg ?? 0;
      const right = rhs.weightKg ?? 0;
      return left === right ? lhs.reps < rhs.reps : left < right;
    });
  },

  /**
   * `best(in:)`. The best set a session holds, across its exercises. A set
   * with an estimate outranks one without, so a day of bench and lateral
   * raises is described by the bench.
   */
  bestIn(a: { in: TrainingSession }): ProgressOverview_BestSet | undefined {
    const tops: ProgressOverview_BestSet[] = a.in.results.flatMap((result) => {
      const set = ProgressOverview.bestOf({ of: result.sets });
      const weight = set?.weightKg;
      if (set === undefined || weight === undefined) return [];
      return [
        ProgressOverview_BestSet.make({
          exerciseID: result.exerciseID,
          name: result.name,
          weightKg: weight,
          reps: set.reps,
          estimate: Estimates.e1RM({ weightKg: weight, reps: set.reps }),
        }),
      ];
    });
    return maxBy(tops, (lhs, rhs) => {
      const left = lhs.estimate;
      const right = rhs.estimate;
      if (left !== undefined && right !== undefined) return left < right;
      if (left === undefined && right !== undefined) return true;
      if (left !== undefined && right === undefined) return false;
      return lhs.weightKg < rhs.weightKg;
    });
  },

  /**
   * Per exercise, the best set since `since`, most recently trained first.
   *
   * Only sets that carry an estimate take part: a comparison between two
   * sets of fifteen would be a comparison of nothing. The best set is the
   * strongest one however it was performed — a set that paused only some
   * of its reps included, as the set it was — but its change is stated
   * only against earlier sets performed the same way (TRAINING_LOGIC §9.2).
   * Measured against an earlier paused best, a touch-and-go set reads as
   * progress that is only the pause coming off. `lib/setline-log.ts` keeps
   * the web app to the same rule (`tests/fixtures/best-set-comparison.json`).
   */
  bestSets(a: { in: TrainingSession[]; since: Date; limit?: number }): ProgressOverview_RecentBest[] {
    const limit = a.limit ?? 5;
    interface Scored {
      weight: number;
      reps: number;
      estimate: number;
      execution: SetExecution;
    }
    interface Entry {
      name: string;
      best?: { set: Scored; date: Date };
      earlier: Scored[];
      lastTrained: Date;
    }
    const byExercise = new Map<string, Entry>();
    const order: string[] = [];

    for (const session of a.in) {
      if (session.kind !== "workout") continue;
      for (const result of session.results) {
        const scored = result.sets.flatMap((set): Scored[] => {
          const weight = set.weightKg;
          if (!weighs(set) || weight === undefined) return [];
          const estimate = Estimates.e1RM({ weightKg: weight, reps: set.reps });
          if (estimate === undefined) return [];
          return [{ weight, reps: set.reps, estimate, execution: LoggedSet.execution(set) }];
        });
        if (scored.length === 0) continue;
        if (!byExercise.has(result.exerciseID)) {
          byExercise.set(result.exerciseID, { name: result.name, earlier: [], lastTrained: distantPast });
          order.push(result.exerciseID);
        }
        const held = byExercise.get(result.exerciseID);
        if (held === undefined) continue;
        const entry: Entry = { ...held, earlier: [...held.earlier] };
        if (session.date.getTime() >= a.since.getTime()) {
          for (const set of scored) {
            if (entry.best === undefined || set.estimate > entry.best.set.estimate) {
              entry.best = { set, date: session.date };
            }
          }
          if (session.date.getTime() >= entry.lastTrained.getTime()) {
            entry.lastTrained = session.date;
            entry.name = result.name;
          }
        } else {
          entry.earlier.push(...scored);
        }
        byExercise.set(result.exerciseID, entry);
      }
    }

    return order
      .flatMap((id): [string, Entry][] => {
        const entry = byExercise.get(id);
        return entry === undefined ? [] : [[id, entry]];
      })
      .filter(([, entry]) => entry.best !== undefined)
      .sort((x, y) => y[1].lastTrained.getTime() - x[1].lastTrained.getTime())
      .slice(0, Math.max(0, limit))
      .flatMap(([id, entry]) => {
        const best = entry.best;
        if (best === undefined) return [];
        const before = maxValue(
          entry.earlier
            .filter((scored) => SetExecution.isComparable(scored.execution, { to: best.set.execution }))
            .map((scored) => scored.estimate),
        );
        return [
          ProgressOverview_RecentBest.make({
            exerciseID: id,
            name: entry.name,
            weightKg: best.set.weight,
            reps: best.set.reps,
            date: best.date,
            delta: before === undefined ? undefined : Estimates.round(best.set.estimate - before, { toIncrement: 0.5 }),
            hasEarlierBest: entry.earlier.length > 0,
          }),
        ];
      });
  },

  /**
   * Per training day, how its lifts moved since `since`, most recently
   * trained first.
   *
   * Each lift of the day is measured from a baseline to its best inside
   * the window, both as estimated maxima and only between sets performed
   * the same way (`SetExecution.isComparable`), as the best sets are. The
   * baseline is the lift's best before the window; for a lift with no
   * history before it, its first session inside the window, so a young
   * account still sees where it is going. A lift trained once and never
   * before has nothing to compare and takes no part.
   *
   * `counts` picks the lifts the day's headline percent and its line are
   * made of — the main lifts, so a machine fly's big kilos don't speak for
   * the day. A day with none of them falls back to all its lifts. Every
   * lift is still listed in `lifts`.
   */
  progressByDay(a: { in: TrainingSession[]; since: Date; counts?: (exerciseID: string) => boolean }): ProgressOverview_DayProgress[] {
    interface Scored {
      estimate: number;
      execution: SetExecution;
      weight: number;
      reps: number;
      date: Date;
    }
    const scored = (result: ExerciseResult, date: Date = distantPast): Scored[] =>
      result.sets.flatMap((set): Scored[] => {
        const weight = set.weightKg;
        if (!weighs(set) || weight === undefined) return [];
        const estimate = Estimates.e1RM({ weightKg: weight, reps: set.reps });
        if (estimate === undefined) return [];
        return [{ estimate, execution: LoggedSet.execution(set), weight, reps: set.reps, date }];
      });

    const workouts = a.in
      .filter((session) => session.kind === "workout")
      .sort((x, y) => x.date.getTime() - y.date.getTime());
    // Every estimated set before the window, per lift, whichever day it was on.
    const before = new Map<string, Scored[]>();
    for (const session of workouts) {
      if (!(session.date.getTime() < a.since.getTime())) continue;
      for (const result of session.results) {
        before.set(result.exerciseID, [...(before.get(result.exerciseID) ?? []), ...scored(result)]);
      }
    }

    const inWindow = workouts.filter((session) => session.date.getTime() >= a.since.getTime());
    const order: string[] = [];
    const grouped = new Map<string, TrainingSession[]>();
    for (const session of inWindow) {
      if (!grouped.has(session.dayID)) order.push(session.dayID);
      grouped.set(session.dayID, [...(grouped.get(session.dayID) ?? []), session]);
    }

    return order
      .flatMap((dayID): ProgressOverview_DayProgress[] => {
        const days = grouped.get(dayID);
        const latest = days?.[days.length - 1];
        if (days === undefined || latest === undefined) return [];
        // Per lift: its sets per session, in order, and its latest name.
        const lifts = new Map<string, { name: string; perSession: Scored[][] }>();
        const liftOrder: string[] = [];
        for (const session of days) {
          for (const result of session.results) {
            const sets = scored(result, session.date);
            if (sets.length === 0) continue;
            if (!lifts.has(result.exerciseID)) liftOrder.push(result.exerciseID);
            const lift = lifts.get(result.exerciseID) ?? { name: result.name, perSession: [] };
            lifts.set(result.exerciseID, { name: result.name, perSession: [...lift.perSession, sets] });
          }
        }

        const percents = new Map<string, number>();
        let leader: ProgressOverview_DayProgress_Leader | undefined;
        // Per lift, what it is measured from and how it was performed.
        let references = new Map<string, { estimate: number; execution: SetExecution }>();
        const liftBests: ProgressOverview_DayProgress_Lift[] = [];
        for (const id of liftOrder) {
          const lift = lifts.get(id);
          if (lift === undefined) continue;
          const windowSets = lift.perSession.flat();
          // On a tie, the latest: the set shown is the one most recently matched.
          let best: Scored | undefined;
          for (const set of windowSets) best = best === undefined ? set : set.estimate >= best.estimate ? set : best;
          if (best === undefined) continue;
          const chosen = best;
          const isNew = (before.get(id) ?? []).length === 0 && lift.perSession.length === 1;
          const keep = (delta: number | undefined) => {
            liftBests.push(
              ProgressOverview_DayProgress_Lift.make({
                exerciseID: id,
                name: lift.name,
                weightKg: chosen.weight,
                reps: chosen.reps,
                date: chosen.date,
                deltaKg: delta,
                isNew,
              }),
            );
          };
          const earlier = before.get(id) ?? [];
          let baseline: number | undefined;
          let current: number;
          const previous = maxValue(
            earlier.filter((set) => SetExecution.isComparable(set.execution, { to: chosen.execution })).map((set) => set.estimate),
          );
          const first =
            earlier.length === 0 && lift.perSession.length > 1
              ? maxBy(lift.perSession[0], (x, y) => x.estimate < y.estimate)
              : undefined;
          if (previous !== undefined) {
            baseline = previous;
            current = chosen.estimate;
          } else if (first !== undefined) {
            // Measured from the first session, against the later
            // sessions' sets performed the same way.
            const later = maxValue(
              lift.perSession
                .slice(1)
                .flat()
                .filter((set) => SetExecution.isComparable(set.execution, { to: first.execution }))
                .map((set) => set.estimate),
            );
            baseline = later === undefined ? undefined : first.estimate;
            current = later ?? first.estimate;
          } else {
            baseline = undefined;
            current = chosen.estimate;
          }
          if (baseline === undefined || !(baseline > 0)) {
            keep(undefined);
            continue;
          }
          references.set(id, { estimate: baseline, execution: chosen.execution });
          percents.set(id, ((current - baseline) / baseline) * 100);
          const delta = Estimates.round(current - baseline, { toIncrement: 0.5 });
          keep(delta);
          if (delta > 0 && delta > (leader?.deltaKg ?? 0)) {
            leader = ProgressOverview_DayProgress_Leader.make({ exerciseID: id, name: lift.name, deltaKg: delta });
          }
        }
        // The lifts that speak for the day: the main ones where there are any.
        const counts = a.counts;
        const main = counts === undefined ? new Set<string>() : new Set([...percents.keys()].filter((id) => counts(id)));
        const speaking = main.size === 0 ? new Set(percents.keys()) : main;
        references = new Map([...references].filter(([id]) => speaking.has(id)));
        const pool = [...percents].filter(([id]) => speaking.has(id)).map(([, value]) => value);
        const mean = pool.length === 0 ? undefined : dec(sum(pool) / pool.length);
        const strengthSeries: { date: Date; value: number }[] = (() => {
          const bestSoFar = new Map<string, number>();
          return days.flatMap((session) => {
            for (const result of session.results) {
              const reference = references.get(result.exerciseID);
              if (reference === undefined) continue;
              const top = maxValue(
                scored(result)
                  .filter((set) => SetExecution.isComparable(set.execution, { to: reference.execution }))
                  .map((set) => set.estimate),
              );
              if (top === undefined) continue;
              const ratio = dec((top / reference.estimate) * 100);
              bestSoFar.set(result.exerciseID, Math.max(bestSoFar.get(result.exerciseID) ?? 0, ratio));
            }
            // A lift measured from before the window starts at its
            // baseline even on a session it was not trained.
            for (const id of references.keys()) {
              const earlier = before.get(id);
              if (!bestSoFar.has(id) && earlier !== undefined && earlier.length > 0) bestSoFar.set(id, 100);
            }
            if (bestSoFar.size === 0) return [];
            return [{ date: session.date, value: dec(sum([...bestSoFar.values()]) / bestSoFar.size) }];
          });
        })();
        return [
          ProgressOverview_DayProgress.make({
            dayID,
            label: latest.dayLabel,
            sessions: days.length,
            changePercent: mean === undefined ? undefined : Estimates.round(mean, { toIncrement: 0.1 }),
            leader,
            lifts: liftBests,
            strength: strengthSeries.map((point) => point.value),
            strengthDates: strengthSeries.map((point) => point.date),
            lastTrained: latest.date,
          }),
        ];
      })
      .sort((x, y) => y.lastTrained.getTime() - x.lastTrained.getTime());
  },

  /**
   * Volume per Monday-to-Sunday week, oldest first, ending with the week
   * `now` falls in. A week without a workout is zero, not missing.
   */
  weeklyVolume(a: { in: TrainingSession[]; weeks?: number; now?: Date }): ProgressOverview_WeekVolume[] {
    const weeks = a.weeks ?? 7;
    const now = a.now ?? new Date();
    const thisMonday = Schedule.mondayFirstWeek({ containing: now })[0];
    if (!(weeks > 0) || thisMonday === undefined) return [];

    const starts: Date[] = [];
    for (let index = 0; index < weeks; index++) starts.push(addDays(thisMonday, -7 * (weeks - 1 - index)));
    const totals = new Map<string, number>();
    for (const session of a.in) {
      if (session.kind !== "workout") continue;
      const monday = Schedule.mondayFirstWeek({ containing: session.date })[0];
      if (monday === undefined) continue;
      const key = Schedule.dateKey(monday);
      totals.set(key, dec((totals.get(key) ?? 0) + RecordsEngine.volumeLoad(session.results.flatMap((result) => result.sets))));
    }
    return starts.map((start, index) =>
      ProgressOverview_WeekVolume.make({
        start,
        number: isoWeekOfYear(start),
        volumeKg: totals.get(Schedule.dateKey(start)) ?? 0,
        isCurrent: index === starts.length - 1,
      }),
    );
  },

  /**
   * Every weigh-in with its trailing average: the mean of the weigh-ins in
   * the `days` calendar days up to and including it. Oldest first.
   *
   * Reads the series `BodyProgress` already parsed, so the chart and the
   * list under it can never disagree about which weigh-ins exist.
   */
  weightTrend(progress: BodyProgress, a: { days?: number } = {}): ProgressOverview_WeightPoint[] {
    const days = a.days ?? 14;
    const points = BodyProgress.points(progress);
    const span = (Math.max(1, days) - 1) * 86_400;
    return points.map((point) => {
      const opens = addingTimeInterval(point.date, -span);
      const window = points.filter(
        (other) => other.date.getTime() >= opens.getTime() && other.date.getTime() <= point.date.getTime(),
      );
      const total = sum(window.map((other) => other.weightKg));
      return ProgressOverview_WeightPoint.make({
        date: point.date,
        weightKg: point.weightKg,
        average: dec(total / Math.max(1, window.length)),
      });
    });
  },
};

/**
 * `extension Agenda { static func weekLabel(containing:now:calendar:) }`.
 *
 * How far a week lies from this one, in the words both clients use:
 * "Deze week", "Vorige week", "Volgende week", "3 weken geleden",
 * "Over 2 weken".
 */
export function Agenda_weekLabel(a: { containing: Date; now?: Date }): string {
  const now = a.now ?? new Date();
  const monday = Schedule.mondayFirstWeek({ containing: a.containing })[0];
  const thisMonday = Schedule.mondayFirstWeek({ containing: now })[0];
  if (monday === undefined || thisMonday === undefined) return "This week";
  const days = daysBetween(thisMonday, monday);
  const offset = Math.trunc(rounded(days / 7));
  if (offset === 0) return "This week";
  if (offset === -1) return "Last week";
  if (offset === 1) return "Next week";
  if (offset < 0) return `${-offset} weeks ago`;
  return `In ${offset} weeks`;
}
