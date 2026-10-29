import { LoggedSet, type TrainingSession } from "../Domain/Model";
import { RecordsEngine } from "../Engine/RecordsEngine";
import { Schedule } from "../Engine/Schedule";
import { Meal, type NutritionEntry } from "../Nutrition/NutritionDay";
import { startOfMondayWeek } from "../Support/calendar";
import { dayComponent } from "../Support/engine";
import { distantPast } from "../Support/progress";
import { grouping } from "../Support/swift";

// Things worth having done, kept for good: sessions logged, weeks in a row,
// the heaviest set and the total weight moved. Each says when it was reached,
// or how far there is still to go — real achievements, not points.

export type Milestone_Family = "training" | "food" | "progress";

export const Milestone_Family = {
  training: "training" as Milestone_Family,
  food: "food" as Milestone_Family,
  progress: "progress" as Milestone_Family,
  allCases: ["training", "food", "progress"] as Milestone_Family[],
};

export type Milestone_Kind =
  | "sessions"
  | "streak"
  | "heaviest"
  | "volume"
  // Food habits
  | "logging"
  | "protein"
  | "fullDay"
  // Progress habits
  | "onTrack"
  | "weighIns"
  | "photos";

export const Milestone_Kind = {
  sessions: "sessions" as Milestone_Kind,
  streak: "streak" as Milestone_Kind,
  heaviest: "heaviest" as Milestone_Kind,
  volume: "volume" as Milestone_Kind,
  logging: "logging" as Milestone_Kind,
  protein: "protein" as Milestone_Kind,
  fullDay: "fullDay" as Milestone_Kind,
  onTrack: "onTrack" as Milestone_Kind,
  weighIns: "weighIns" as Milestone_Kind,
  photos: "photos" as Milestone_Kind,

  /** Which collection a kind belongs to. */
  family(self: Milestone_Kind): Milestone_Family {
    switch (self) {
      case "sessions":
      case "streak":
      case "heaviest":
      case "volume":
        return "training";
      case "logging":
      case "protein":
      case "fullDay":
        return "food";
      case "onTrack":
      case "weighIns":
      case "photos":
        return "progress";
    }
  },
};

export interface Milestone {
  id: string;
  kind: Milestone_Kind;
  title: string;
  /** When it was reached; `nil` while it is still ahead. */
  reachedOn?: Date;
  /** Where the account stands towards it, and the mark itself. */
  current: number;
  target: number;
  /** What the badge itself says: "25", "8 wk", "100 kg", "10 t". */
  badgeLabel: string;
  /** 0 bronze, 1 silver, 2 gold, 3 the top of its kind. */
  tier: number;
  /** One line on how it is earned. */
  howTo: string;
}

export const Milestone = {
  make(a: {
    id: string;
    kind: Milestone_Kind;
    title: string;
    reachedOn: Date | undefined;
    current: number;
    target: number;
    badgeLabel?: string;
    tier?: number;
    howTo?: string;
  }): Milestone {
    return {
      id: a.id,
      kind: a.kind,
      title: a.title,
      reachedOn: a.reachedOn,
      current: a.current,
      target: a.target,
      badgeLabel: a.badgeLabel ?? "",
      tier: a.tier ?? 0,
      howTo: a.howTo ?? "",
    };
  },
  isReached(self: Milestone): boolean {
    return self.reachedOn !== undefined;
  },
  fraction(self: Milestone): number {
    return Math.min(1, Math.max(0, self.current / Math.max(self.target, 1)));
  },
};

/** Swift `Int(x)` on a Double mark. */
const int = Math.trunc;

/** `dates.max()`. */
function maxDate(dates: readonly Date[]): Date | undefined {
  let best: Date | undefined;
  for (const date of dates) if (best === undefined || date.getTime() > best.getTime()) best = date;
  return best;
}

export const Milestones = {
  sessionMarks: [1, 10, 25, 50, 100, 250, 500],
  streakMarks: [2, 4, 8, 12, 26, 52],
  heaviestMarks: [40, 60, 80, 100, 120, 140, 160, 180, 200],
  /** Tonnes moved in total. */
  volumeMarks: [10, 50, 100, 250, 500, 1000],

  /**
   * Bronze for the first marks, silver, gold, and the last one of each kind
   * its own top tier.
   */
  tier(index: number, a: { of: number }): number {
    const count = a.of;
    if (index === count - 1) return 3;
    return Math.min(2, Math.trunc((index * 3) / Math.max(count - 1, 1)));
  },

  make(a: { sessions: TrainingSession[]; bestStreak: number; streakReachedOn?: Date }): Milestone[] {
    const workouts = a.sessions
      .filter((session) => session.kind === "workout")
      .sort((x, y) => x.date.getTime() - y.date.getTime());
    const list: Milestone[] = [];

    // Sessions: the date of the nth workout.
    Milestones.sessionMarks.forEach((mark, index) => {
      const reached = workouts.length >= mark ? workouts[mark - 1].date : undefined;
      list.push(
        Milestone.make({
          id: `sessions-${mark}`,
          kind: "sessions",
          title: mark === 1 ? "First session" : `${mark} sessions`,
          reachedOn: reached,
          current: workouts.length,
          target: mark,
          badgeLabel: `${mark}`,
          tier: Milestones.tier(index, { of: Milestones.sessionMarks.length }),
          howTo: mark === 1 ? "Log your first workout." : `Log ${mark} workouts.`,
        }),
      );
    });

    // Heaviest set and total volume, walked in order so each mark has a date.
    let heaviest = 0;
    let tonnes = 0;
    const heaviestOn = new Map<number, Date>();
    const volumeOn = new Map<number, Date>();
    for (const session of workouts) {
      for (const result of session.results) {
        for (const set of result.sets) {
          if (!LoggedSet.countsTowardVolume(set)) continue;
          const weight = set.weightKg ?? 0;
          heaviest = Math.max(heaviest, weight);
          for (const mark of Milestones.heaviestMarks) {
            if (heaviest >= mark && !heaviestOn.has(mark)) heaviestOn.set(mark, session.date);
          }
        }
      }
      tonnes += RecordsEngine.volumeLoad(session.results.flatMap((result) => result.sets)) / 1000;
      for (const mark of Milestones.volumeMarks) {
        if (tonnes >= mark && !volumeOn.has(mark)) volumeOn.set(mark, session.date);
      }
    }
    Milestones.heaviestMarks.forEach((mark, index) => {
      list.push(
        Milestone.make({
          id: `heaviest-${int(mark)}`,
          kind: "heaviest",
          title: `First ${int(mark)} kg set`,
          reachedOn: heaviestOn.get(mark),
          current: heaviest,
          target: mark,
          badgeLabel: `${int(mark)} kg`,
          tier: Milestones.tier(index, { of: Milestones.heaviestMarks.length }),
          howTo: `Lift ${int(mark)} kg or more in any working set.`,
        }),
      );
    });
    Milestones.volumeMarks.forEach((mark, index) => {
      list.push(
        Milestone.make({
          id: `volume-${int(mark)}`,
          kind: "volume",
          title: `${int(mark)} tonnes lifted`,
          reachedOn: volumeOn.get(mark),
          current: tonnes,
          target: mark,
          badgeLabel: `${int(mark)} t`,
          tier: Milestones.tier(index, { of: Milestones.volumeMarks.length }),
          howTo: `Lift ${int(mark)} tonnes in total: weight × reps, every working set.`,
        }),
      );
    });
    Milestones.streakMarks.forEach((mark, index) => {
      list.push(
        Milestone.make({
          id: `streak-${mark}`,
          kind: "streak",
          title: `${mark}-week streak`,
          reachedOn: a.bestStreak >= mark ? (a.streakReachedOn ?? workouts[workouts.length - 1]?.date) : undefined,
          current: a.bestStreak,
          target: mark,
          badgeLabel: `${mark} wk`,
          tier: Milestones.tier(index, { of: Milestones.streakMarks.length }),
          howTo: `Hit your weekly workout goal ${mark} weeks in a row.`,
        }),
      );
    });
    return list;
  },

  /** Reached since `date` — what the finish screen can celebrate. */
  reached(a: { in: Milestone[]; since: Date }): Milestone[] {
    return a.in.filter((milestone) => (milestone.reachedOn ?? distantPast).getTime() >= a.since.getTime());
  },

  // MARK: - Habits

  loggingMarks: [7, 30, 100, 365],
  proteinMarks: [5, 14, 30],
  fullDayMarks: [10, 50, 100],
  onTrackMarks: [2, 4, 8, 12],
  weighInMarks: [2, 4, 8],
  photoMarks: [3, 6, 12],

  /**
   * Badges for the habits around training: logging food, hitting protein,
   * staying in the goal's band, weighing in, check-in photos. They reward
   * doing it, never a number on the scale.
   */
  habits(a: {
    entries: NutritionEntry[];
    proteinTarget: number | undefined;
    weighInDates: Date[];
    photoDates: Date[];
    bestWeeksOnTrack: number;
  }): Milestone[] {
    const list: Milestone[] = [];
    const days = grouping(a.entries, (entry) => entry.date);
    const dayKeys = [...days.keys()].sort();

    // Days logged: the date of the nth one.
    Milestones.loggingMarks.forEach((mark, index) => {
      list.push(
        Milestone.make({
          id: `logging-${mark}`,
          kind: "logging",
          title: `${mark} days logged`,
          reachedOn: dayKeys.length >= mark ? Schedule.date({ fromKey: dayKeys[mark - 1] }) : undefined,
          current: dayKeys.length,
          target: mark,
          badgeLabel: `${mark} d`,
          tier: Milestones.tier(index, { of: Milestones.loggingMarks.length }),
          howTo: `Log what you eat on ${mark} different days.`,
        }),
      );
    });

    // Protein streak: days in a row at or over the target.
    let best = 0;
    let run = 0;
    let previous: Date | undefined;
    const bestOn = new Map<number, Date>();
    const target = a.proteinTarget;
    if (target !== undefined && target > 0) {
      for (const key of dayKeys) {
        const date = Schedule.date({ fromKey: key });
        if (date === undefined) continue;
        const protein = (days.get(key) ?? []).reduce((total, entry) => total + entry.protein, 0);
        const follows = previous === undefined ? false : dayComponent(previous, date) === 1;
        run = protein >= target ? (follows ? run + 1 : 1) : 0;
        previous = date;
        if (run > best) {
          best = run;
          for (const mark of Milestones.proteinMarks) {
            if (best >= mark && !bestOn.has(mark)) bestOn.set(mark, date);
          }
        }
      }
    }
    Milestones.proteinMarks.forEach((mark, index) => {
      list.push(
        Milestone.make({
          id: `protein-${mark}`,
          kind: "protein",
          title: `Protein ${mark} days running`,
          reachedOn: bestOn.get(mark),
          current: best,
          target: mark,
          badgeLabel: `${mark} d`,
          tier: Milestones.tier(index, { of: Milestones.proteinMarks.length }),
          howTo: `Hit your protein target ${mark} days in a row.`,
        }),
      );
    });

    // Full days: breakfast, lunch and dinner all logged.
    let full = 0;
    const fullOn = new Map<number, Date>();
    for (const key of dayKeys) {
      const meals = new Set((days.get(key) ?? []).map((entry) => entry.meal));
      if (!(meals.has(Meal.ontbijt) && meals.has(Meal.lunch) && meals.has(Meal.avondeten))) continue;
      const date = Schedule.date({ fromKey: key });
      if (date === undefined) continue;
      full += 1;
      for (const mark of Milestones.fullDayMarks) {
        if (full >= mark && !fullOn.has(mark)) fullOn.set(mark, date);
      }
    }
    Milestones.fullDayMarks.forEach((mark, index) => {
      list.push(
        Milestone.make({
          id: `fullday-${mark}`,
          kind: "fullDay",
          title: `${mark} full days`,
          reachedOn: fullOn.get(mark),
          current: full,
          target: mark,
          badgeLabel: `${mark}`,
          tier: Milestones.tier(index, { of: Milestones.fullDayMarks.length }),
          howTo: `Log breakfast, lunch and dinner on ${mark} days.`,
        }),
      );
    });

    // On track with the weight goal, weeks in a row.
    Milestones.onTrackMarks.forEach((mark, index) => {
      list.push(
        Milestone.make({
          id: `ontrack-${mark}`,
          kind: "onTrack",
          title: `${mark} weeks on track`,
          reachedOn: a.bestWeeksOnTrack >= mark ? maxDate(a.weighInDates) : undefined,
          current: a.bestWeeksOnTrack,
          target: mark,
          badgeLabel: `${mark} wk`,
          tier: Milestones.tier(index, { of: Milestones.onTrackMarks.length }),
          howTo: `Stay inside your weight goal's band ${mark} weeks in a row.`,
        }),
      );
    });

    // Weigh-in habit: weeks in a row with four weigh-ins or more.
    // `Calendar.current`'s week: Monday first, as the app's region has it.
    const weeks = new Map<number, Date[]>();
    for (const date of a.weighInDates) {
      const start = startOfMondayWeek(date).getTime();
      const bucket = weeks.get(start);
      if (bucket) bucket.push(date);
      else weeks.set(start, [date]);
    }
    let habitRun = 0;
    let habitBest = 0;
    const habitOn = new Map<number, Date>();
    let lastWeek: Date | undefined;
    for (const time of [...weeks.keys()].sort((x, y) => x - y)) {
      const week = new Date(time);
      const follows = lastWeek === undefined ? false : dayComponent(lastWeek, week) === 7;
      habitRun = (weeks.get(time) ?? []).length >= 4 ? (follows ? habitRun + 1 : 1) : 0;
      lastWeek = week;
      if (habitRun > habitBest) {
        habitBest = habitRun;
        for (const mark of Milestones.weighInMarks) {
          if (habitBest >= mark && !habitOn.has(mark)) {
            const reached = maxDate(weeks.get(time) ?? []);
            if (reached !== undefined) habitOn.set(mark, reached);
          }
        }
      }
    }
    Milestones.weighInMarks.forEach((mark, index) => {
      list.push(
        Milestone.make({
          id: `weighins-${mark}`,
          kind: "weighIns",
          title: `${mark} weeks weighing in`,
          reachedOn: habitOn.get(mark),
          current: habitBest,
          target: mark,
          badgeLabel: `${mark} wk`,
          tier: Milestones.tier(index, { of: Milestones.weighInMarks.length }),
          howTo: `Weigh in 4 times a week, ${mark} weeks in a row.`,
        }),
      );
    });

    // Check-in photos.
    const photos = [...a.photoDates].sort((x, y) => x.getTime() - y.getTime());
    Milestones.photoMarks.forEach((mark, index) => {
      list.push(
        Milestone.make({
          id: `photos-${mark}`,
          kind: "photos",
          title: `${mark} check-in photos`,
          reachedOn: photos.length >= mark ? photos[mark - 1] : undefined,
          current: photos.length,
          target: mark,
          badgeLabel: `${mark}`,
          tier: Milestones.tier(index, { of: Milestones.photoMarks.length }),
          howTo: `Take ${mark} check-in photos.`,
        }),
      );
    });
    return list;
  },
};
