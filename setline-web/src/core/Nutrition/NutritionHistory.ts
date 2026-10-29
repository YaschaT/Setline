import type { NutritionTargets } from "../Domain/Model";
import { addDays, startOfDay } from "../Support/calendar";
import { rounded } from "../Support/swift";
import { NutritionDay, type NutritionEntry } from "./NutritionDay";

export type NutritionHistory_Flag = "lowProtein" | "lowCarbs" | "overCalories" | "underCalories";

export const NutritionHistory_Flag = {
  lowProtein: "lowProtein" as NutritionHistory_Flag,
  lowCarbs: "lowCarbs" as NutritionHistory_Flag,
  overCalories: "overCalories" as NutritionHistory_Flag,
  underCalories: "underCalories" as NutritionHistory_Flag,
  allCases: ["lowProtein", "lowCarbs", "overCalories", "underCalories"] as NutritionHistory_Flag[],

  label(self: NutritionHistory_Flag): string {
    switch (self) {
      case "lowProtein": return "Low protein";
      case "lowCarbs": return "Low carbs";
      case "overCalories": return "Over kcal";
      case "underCalories": return "Under kcal";
    }
  },
};

export interface NutritionHistory_Day {
  date: Date;
  summary: NutritionDay;
  flags: NutritionHistory_Flag[];
}

export const NutritionHistory_Day = {
  id(self: NutritionHistory_Day): string {
    return self.summary.dateKey;
  },
  isLogged(self: NutritionHistory_Day): boolean {
    return self.summary.entries.length !== 0;
  },
  /** Calories within 10 % of the target and protein at 90 % or more. */
  onTarget(self: NutritionHistory_Day): boolean {
    return NutritionHistory_Day.isLogged(self) && NutritionDay.hasTarget(self.summary) && self.flags.length === 0;
  },
};

/**
 * The days before today, as eaten: each day's totals against the targets,
 * what fell short, and how the stretch adds up — so a weight goal can be
 * read against what was actually logged, not only the scale.
 *
 * Today is left out: it is still being eaten.
 */
export interface NutritionHistory {
  /** Newest first. */
  days: NutritionHistory_Day[];
  calorieTarget?: number;
}

export const NutritionHistory = {
  logged(self: NutritionHistory): NutritionHistory_Day[] {
    return self.days.filter(NutritionHistory_Day.isLogged);
  },

  /** The average of the days something was logged; nil when none was. */
  averageCalories(self: NutritionHistory): number | undefined {
    const logged = NutritionHistory.logged(self);
    if (logged.length === 0) return undefined;
    return logged.reduce((total, day) => total + day.summary.calories, 0) / logged.length;
  },

  averageProtein(self: NutritionHistory): number | undefined {
    const logged = NutritionHistory.logged(self);
    if (logged.length === 0) return undefined;
    return logged.reduce((total, day) => total + day.summary.protein, 0) / logged.length;
  },

  daysOnCalories(self: NutritionHistory): number {
    return NutritionHistory.logged(self).filter((d) => !d.flags.includes("overCalories") && !d.flags.includes("underCalories")).length;
  },

  daysProteinHit(self: NutritionHistory): number {
    return NutritionHistory.logged(self).filter((d) => !d.flags.includes("lowProtein")).length;
  },

  /** Kcal a day the logged average sits from the target, rounded to 10. */
  averageGap(self: NutritionHistory): number | undefined {
    const target = self.calorieTarget;
    const average = NutritionHistory.averageCalories(self);
    if (target === undefined || !(target > 0) || average === undefined) return undefined;
    return Math.trunc(rounded((average - target) / 10)) * 10;
  },

  make(a: { entries: NutritionEntry[]; targets: NutritionTargets | undefined; days?: number; before?: Date }): NutritionHistory {
    const count = a.days ?? 14;
    const today = a.before ?? new Date();
    const start = startOfDay(today);
    const days: NutritionHistory_Day[] = [];
    for (let back = 1; back <= Math.max(1, count); back++) {
      const date = addDays(start, -back);
      const summary = NutritionDay.makeEntries({ entries: a.entries, on: date, targets: a.targets });
      days.push({ date, summary, flags: NutritionHistory.flags(summary) });
    }
    const calories = a.targets?.calories;
    return { days, calorieTarget: calories !== undefined && calories > 0 ? calories : undefined };
  },

  flags(day: NutritionDay): NutritionHistory_Flag[] {
    const targets = day.targets;
    if (day.entries.length === 0 || targets === undefined) return [];
    const flags: NutritionHistory_Flag[] = [];
    if (targets.calories > 0) {
      const ratio = day.calories / targets.calories;
      if (ratio > 1.1) flags.push("overCalories");
      if (ratio < 0.9) flags.push("underCalories");
    }
    if (targets.protein > 0 && day.protein < 0.9 * targets.protein) flags.push("lowProtein");
    if (targets.carbs > 0 && day.carbs < 0.7 * targets.carbs) flags.push("lowCarbs");
    return flags;
  },
};
