import { Schedule } from "../Engine/Schedule";
import { Meal, type NutritionEntry } from "../Nutrition/NutritionDay";
import { addDays, addingTimeInterval, settingTime, startOfDay, timeIntervalSince } from "../Support/calendar";
import { distantPast } from "../Support/progress";
import { ClosedRange } from "../Support/range";
import { compare, rounded, roundedUp } from "../Support/swift";

/**
 * What the lifter is doing with body weight, and the pace each goal asks
 * for, as a share of body weight per week.
 *
 * The ranges follow the sports-nutrition literature most coaches use:
 * a cut loses 0.5–1 % a week (Helms et al. 2014, which found slower loss
 * keeps more muscle); a lean bulk gains about 0.5–1 % a month and a bulk
 * up to about 2 % a month (the bands intermediates are usually given);
 * maintaining or recomposing holds weight within a narrow band.
 */
export type WeightGoal = "cut" | "maintain" | "recomp" | "leanBulk" | "bulk";

export const WeightGoal = {
  cut: "cut" as WeightGoal,
  maintain: "maintain" as WeightGoal,
  recomp: "recomp" as WeightGoal,
  leanBulk: "leanBulk" as WeightGoal,
  bulk: "bulk" as WeightGoal,
  allCases: ["cut", "maintain", "recomp", "leanBulk", "bulk"] as WeightGoal[],

  /** `WeightGoal(rawValue:)`. */
  fromRawValue(rawValue: string): WeightGoal | undefined {
    return (WeightGoal.allCases as string[]).includes(rawValue) ? (rawValue as WeightGoal) : undefined;
  },

  title(self: WeightGoal): string {
    switch (self) {
      case "cut":
        return "Cut";
      case "maintain":
        return "Maintain";
      case "recomp":
        return "Recomp";
      case "leanBulk":
        return "Lean bulk";
      case "bulk":
        return "Bulk";
    }
  },

  summary(self: WeightGoal): string {
    switch (self) {
      case "cut":
        return "Lose fat, keep muscle. A steady loss each week.";
      case "maintain":
        return "Hold your weight while you train.";
      case "recomp":
        return "Weight stays put; strength and shape change.";
      case "leanBulk":
        return "Build muscle with as little fat as possible. Slow gain.";
      case "bulk":
        return "Build size faster. More gain, some fat with it.";
    }
  },

  /** Weekly change as a share of body weight, lower and upper bound. */
  weeklyRange(self: WeightGoal): ClosedRange {
    switch (self) {
      case "cut":
        return { lowerBound: -0.01, upperBound: -0.005 };
      case "maintain":
      case "recomp":
        return { lowerBound: -0.001, upperBound: 0.001 };
      case "leanBulk":
        return { lowerBound: 0.001, upperBound: 0.0025 };
      case "bulk":
        return { lowerBound: 0.0025, upperBound: 0.005 };
    }
  },

  /**
   * Protein per kilo of body weight a day — higher on a cut, where it
   * protects muscle (ISSN position stand: 1.4–2.0 g/kg; up to 2.3+ in a deficit).
   */
  proteinPerKg(self: WeightGoal): ClosedRange {
    switch (self) {
      case "cut":
        return { lowerBound: 2.0, upperBound: 2.4 };
      default:
        return { lowerBound: 1.6, upperBound: 2.2 };
    }
  },
};

/** How the weight trend compares with the goal. */
export type GoalCheck_Verdict =
  /** Not enough weigh-ins yet to say anything honest. */
  | { kind: "tooEarly"; weighInsNeeded: number; daysNeeded: number }
  | { kind: "onTrack" }
  /** Moving the right way, but too slowly (or not at all). */
  | { kind: "tooSlow" }
  /** Moving the right way, faster than the goal wants. */
  | { kind: "tooFast" }
  /** Moving the wrong way. */
  | { kind: "wrongWay" }
  /**
   * Outside the goal's range, but by less than the weigh-ins swing
   * from day to day: it could still be water. No advice yet.
   */
  | { kind: "unclear" };

export interface GoalCheck {
  readonly goal: WeightGoal;
  readonly verdict: GoalCheck_Verdict;
  /** The trend, kilos per week (negative is a loss). Nil while too early. */
  readonly weeklyKg?: number;
  /** The goal's range in kilos per week at the current weight. */
  readonly targetKg: ClosedRange;
  /**
   * About how many kcal a day to add (positive) or take away (negative)
   * to reach the middle of the range. Nil when on track or too early.
   */
  readonly dailyKcalAdjustment?: number;
  /** Days the trend is measured over. */
  readonly days: number;
}

export const GoalCheck = {
  isOffTrack(self: GoalCheck): boolean {
    switch (self.verdict.kind) {
      case "tooSlow":
      case "tooFast":
      case "wrongWay":
        return true;
      default:
        return false;
    }
  },

  /** A kilo of body weight is about 7,700 kcal of stored energy. */
  kcalPerKg: 7_700.0,
  /** The trend is read over the last three weeks of weigh-ins. */
  window: 21,
  /**
   * At least this many weigh-ins, spread over at least two weeks, so a
   * weekend's food and salt is in the line twice rather than once.
   */
  minimumWeighIns: 4,
  minimumDays: 14,
  /**
   * The first week of a new goal is mostly water and glycogen — up a
   * kilo or more when the food goes up, down as much on a cut — so it
   * is left out of the trend. Weigh-ins from before the goal belong to
   * the old diet and are left out too.
   */
  settlingDays: 7,
  /**
   * How much one morning's weight wanders around its trend before the
   * weigh-ins say otherwise: about 0.6 % of body weight (water, salt,
   * glycogen, what is still being digested), counted as two weigh-ins'
   * worth of evidence. With few weigh-ins this keeps the line honest;
   * with many, their own scatter decides.
   */
  typicalSwing: 0.006,
  swingWeight: 2.0,
  /**
   * How sure the trend must be before it is called off track: the gap
   * to the range has to be at least one standard error (about 84 %
   * confident that the real pace is outside it).
   */
  confidence: 1.0,

  /**
   * Reads the trend from weigh-ins (date, kilos) with a least-squares
   * line over the last three weeks — one heavy morning doesn't move it —
   * and only calls it off track when it is off by more than the
   * weigh-ins' own uncertainty. `startedAt` is when the goal was set.
   */
  evaluate(a: {
    goal: WeightGoal;
    weighIns: { date: Date; kg: number }[];
    startedAt?: Date;
    now?: Date;
  }): GoalCheck {
    const goal = a.goal;
    const now = a.now ?? new Date();
    const settled =
      a.startedAt === undefined ? distantPast : addingTimeInterval(a.startedAt, GoalCheck.settlingDays * 86_400);
    const windowStart = addingTimeInterval(now, -GoalCheck.window * 86_400);
    const since = settled.getTime() >= windowStart.getTime() ? settled : windowStart;
    const recent = a.weighIns
      .filter((w) => w.date.getTime() >= since.getTime() && w.date.getTime() <= now.getTime())
      .sort((x, y) => x.date.getTime() - y.date.getTime());
    let newest: { date: Date; kg: number } | undefined;
    for (const w of a.weighIns) if (newest === undefined || newest.date.getTime() < w.date.getTime()) newest = w;
    const latest = recent[recent.length - 1]?.kg ?? newest?.kg ?? 0;
    const range = WeightGoal.weeklyRange(goal);
    const target: ClosedRange = { lowerBound: range.lowerBound * latest, upperBound: range.upperBound * latest };

    const span =
      recent.length >= 2
        ? Math.trunc(rounded(timeIntervalSince(recent[recent.length - 1].date, recent[0].date) / 86_400))
        : 0;
    if (!(recent.length >= GoalCheck.minimumWeighIns && span >= GoalCheck.minimumDays && latest > 0)) {
      // Still settling: the days left of the first week come first.
      const settling = Math.max(0, Math.trunc(roundedUp(timeIntervalSince(settled, now) / 86_400)));
      return {
        goal,
        verdict: {
          kind: "tooEarly",
          weighInsNeeded: Math.max(0, GoalCheck.minimumWeighIns - recent.length),
          daysNeeded: settling + Math.max(0, GoalCheck.minimumDays - span),
        },
        weeklyKg: undefined,
        targetKg: target,
        dailyKcalAdjustment: undefined,
        days: span,
      };
    }

    // Least-squares slope, kilos per day.
    const t0 = recent[0].date;
    const xs = recent.map((w) => timeIntervalSince(w.date, t0) / 86_400);
    const ys = recent.map((w) => w.kg);
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
    const my = ys.reduce((s, y) => s + y, 0) / ys.length;
    const sxx = xs.map((x) => (x - mx) * (x - mx)).reduce((s, v) => s + v, 0);
    const sxy = xs.map((x, i) => (x - mx) * (ys[i] - my)).reduce((s, v) => s + v, 0);
    const slope = sxx > 0 ? sxy / sxx : 0;
    const weekly = slope * 7;

    // Its standard error, from the scatter around the line pooled with
    // the typical day-to-day swing.
    const residuals = xs.map((x, i) => ys[i] - (my + slope * (x - mx)));
    const swing = GoalCheck.typicalSwing * latest;
    const variance =
      (residuals.map((r) => r * r).reduce((s, v) => s + v, 0) + GoalCheck.swingWeight * swing * swing) /
      (recent.length - 2 + GoalCheck.swingWeight);
    const weeklyError = sxx > 0 ? Math.sqrt(variance / sxx) * 7 : Infinity;
    const gap =
      weekly < target.lowerBound
        ? target.lowerBound - weekly
        : weekly > target.upperBound
          ? weekly - target.upperBound
          : 0;

    let verdict: GoalCheck_Verdict;
    if (ClosedRange.contains(target, weekly)) {
      verdict = { kind: "onTrack" };
    } else if (gap < GoalCheck.confidence * weeklyError) {
      verdict = { kind: "unclear" };
    } else {
      const wantsGain = target.lowerBound > 0;
      const wantsLoss = target.upperBound < 0;
      if ((wantsGain && weekly < 0) || (wantsLoss && weekly > 0)) {
        verdict = { kind: "wrongWay" };
      } else if (wantsGain || wantsLoss) {
        verdict =
          Math.abs(weekly) < Math.min(Math.abs(target.lowerBound), Math.abs(target.upperBound))
            ? { kind: "tooSlow" }
            : { kind: "tooFast" };
      } else {
        // Maintaining: any drift outside the band is the wrong way.
        verdict = { kind: "wrongWay" };
      }
    }

    let adjustment: number | undefined;
    if (verdict.kind !== "onTrack" && verdict.kind !== "unclear") {
      const middle = (target.lowerBound + target.upperBound) / 2;
      const kcal = ((middle - weekly) * GoalCheck.kcalPerKg) / 7;
      adjustment = Math.trunc(rounded(kcal / 50)) * 50;
    }
    return { goal, verdict, weeklyKg: weekly, targetKg: target, dailyKcalAdjustment: adjustment, days: span };
  },
};

/**
 * The three meal windows the reminders follow: breakfast 8–11,
 * lunch 12–15, and dinner or snacks after that.
 */
export interface MealWindow {
  readonly meal: Meal;
  readonly label: string;
  readonly startHour: number;
  readonly endHour: number;
  /** When the reminder fires, if nothing is logged in the window yet. */
  readonly remindAt: { hour: number; minute: number };
}

const ALL_WINDOWS: MealWindow[] = [
  { meal: Meal.ontbijt, label: "Breakfast", startHour: 8, endHour: 11, remindAt: { hour: 10, minute: 30 } },
  { meal: Meal.lunch, label: "Lunch", startHour: 12, endHour: 15, remindAt: { hour: 14, minute: 30 } },
  { meal: Meal.avondeten, label: "Dinner", startHour: 15, endHour: 24, remindAt: { hour: 20, minute: 30 } },
];

export const MealWindow = {
  /** Swift's custom `==`: the same meal and start hour. */
  equals(a: MealWindow, b: MealWindow): boolean {
    return a.meal === b.meal && a.startHour === b.startHour;
  },

  all: ALL_WINDOWS,

  /**
   * Whether anything was logged for this window today: under its meal,
   * or (for dinner) as a snack; or at a time inside the window.
   */
  isLogged(self: MealWindow, a: { in: NutritionEntry[]; on: Date }): boolean {
    const key = Schedule.dateKey(a.on);
    return a.in.some((entry) => {
      if (entry.date !== key) return false;
      if (entry.meal === self.meal) return true;
      if (self.meal === Meal.avondeten && entry.meal === Meal.snack) return true;
      if (entry.loggedAt !== undefined) {
        const hour = entry.loggedAt.getHours();
        return hour >= self.startHour && hour < self.endHour;
      }
      return false;
    });
  },

  /**
   * Today's reminders still worth sending, then every reminder of the next
   * `days` days — so the phone still reminds on a day the app isn't
   * opened. Rescheduled whenever something is logged, which takes a
   * logged meal's reminder away.
   */
  upcoming(a: { entries: NutritionEntry[]; now: Date; days?: number }): { window: MealWindow; fire: Date }[] {
    const result = MealWindow.due({ entries: a.entries, now: a.now });
    const today = startOfDay(a.now);
    const days = a.days ?? 3;
    for (let offset = 1; offset <= Math.max(1, days); offset++) {
      const day = addDays(today, offset);
      for (const window of MealWindow.all) {
        result.push({ window, fire: settingTime(day, window.remindAt.hour, window.remindAt.minute, 0) });
      }
    }
    return result;
  },

  /**
   * The meal whose reminder time has passed today with nothing logged
   * for it, while its window is still open — what the app says in place
   * of a notification when it is open.
   */
  missing(a: { entries: NutritionEntry[]; now: Date }): MealWindow | undefined {
    const hour = a.now.getHours();
    const minute = a.now.getMinutes();
    for (let i = MealWindow.all.length - 1; i >= 0; i--) {
      const window = MealWindow.all[i];
      if (
        compare([hour, minute], [window.remindAt.hour, window.remindAt.minute]) >= 0 &&
        hour < window.endHour &&
        !MealWindow.isLogged(window, { in: a.entries, on: a.now })
      ) {
        return window;
      }
    }
    return undefined;
  },

  /** The reminders still worth sending today, in order. */
  due(a: { entries: NutritionEntry[]; now: Date }): { window: MealWindow; fire: Date }[] {
    return MealWindow.all.flatMap((window) => {
      const fire = settingTime(a.now, window.remindAt.hour, window.remindAt.minute, 0);
      if (!(fire.getTime() > a.now.getTime()) || MealWindow.isLogged(window, { in: a.entries, on: a.now })) return [];
      return [{ window, fire }];
    });
  },
};

// MARK: - The band

/**
 * Where the weight should be, day by day, from the moment the goal was set:
 * the start weight grown (or shrunk) at the goal's slowest and fastest pace.
 */
export interface GoalBand {
  readonly start: Date;
  readonly startKg: number;
  readonly goal: WeightGoal;
}

type BandInit = { goal: WeightGoal; start: Date; startKg: number };
type BandMake = { goal: WeightGoal; since: Date; trend: { date: Date; kg: number }[] };

export const GoalBand = {
  /**
   * `init(goal:start:startKg:)`, and `static func make(goal:since:trend:)` —
   * the start weight: the trend's value on the start day, or the first one
   * after it, or the last one before. The two share Swift's spelling `make`
   * here, told apart by their labels.
   */
  make: ((a: BandInit | BandMake): GoalBand | undefined => {
    if (!("since" in a)) return { goal: a.goal, start: a.start, startKg: a.startKg };
    const sorted = [...a.trend].sort((x, y) => x.date.getTime() - y.date.getTime());
    const from = addingTimeInterval(a.since, -86_400);
    const point = sorted.find((p) => p.date.getTime() >= from.getTime()) ?? sorted[sorted.length - 1];
    if (point === undefined) return undefined;
    return {
      goal: a.goal,
      start: a.since.getTime() <= point.date.getTime() ? a.since : point.date,
      startKg: point.kg,
    };
  }) as {
    (a: BandInit): GoalBand;
    (a: BandMake): GoalBand | undefined;
  },

  /** The band's low and high weight on a date. */
  range(self: GoalBand, a: { on: Date }): ClosedRange {
    const weeks = Math.max(0, timeIntervalSince(a.on, self.start) / (7 * 86_400));
    const range = WeightGoal.weeklyRange(self.goal);
    const low = self.startKg * (1 + range.lowerBound * weeks);
    const high = self.startKg * (1 + range.upperBound * weeks);
    return { lowerBound: Math.min(low, high), upperBound: Math.max(low, high) };
  },
};

