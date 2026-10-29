import type { NutritionTargets } from "../Domain/Model";
import { Schedule } from "../Engine/Schedule";
import type { JSONValue } from "../Legacy/JSONValue";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import { addDays, hourOf } from "../Support/calendar";
import { formatF } from "../Support/nutrition";
import { rounded } from "../Support/swift";

/**
 * One logged item of food, in the shape the web app stores it.
 *
 * The fields are its fields: both apps write this list, so an entry written
 * here has to read back there without translation.
 */
export interface NutritionEntry {
  id: string;
  date: string;
  meal: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /**
   * How much of it, in `unit`. Written by this app so the amount can be
   * changed afterwards and the macros follow it (42d); absent on entries
   * the web app wrote, where the amount was never kept.
   */
  amount?: number;
  unit?: string;
  /**
   * When it was logged, as it happened. Never derived from the meal it sits
   * under: a late lunch is still a lunch, and the clock says what it says.
   */
  loggedAt?: Date;
}

export const NutritionEntry = {
  make(p: {
    id: string;
    date: string;
    meal: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    amount?: number;
    unit?: string;
    loggedAt?: Date;
  }): NutritionEntry {
    return {
      id: p.id,
      date: p.date,
      meal: p.meal,
      name: p.name,
      calories: p.calories,
      protein: p.protein,
      carbs: p.carbs,
      fat: p.fat,
      amount: p.amount,
      unit: p.unit,
      loggedAt: p.loggedAt,
    };
  },

  /**
   * The same item at another amount: the macros scale with it, because
   * they were what that amount weighed.
   */
  scaled(self: NutritionEntry, a: { to: number }): NutritionEntry {
    const newAmount = a.to;
    const amount = self.amount;
    if (amount === undefined || !(amount > 0) || !(newAmount > 0)) return self;
    const factor = newAmount / amount;
    return NutritionEntry.make({
      id: self.id, date: self.date, meal: self.meal, name: self.name,
      calories: rounded(self.calories * factor),
      protein: rounded(self.protein * factor * 10) / 10,
      carbs: rounded(self.carbs * factor * 10) / 10,
      fat: rounded(self.fat * factor * 10) / 10,
      amount: newAmount, unit: self.unit, loggedAt: self.loggedAt,
    });
  },

  /** "100 g", "2 sneden" — what the row says beside the name. */
  portion(self: NutritionEntry): string | undefined {
    const { amount, unit } = self;
    if (amount === undefined || !(amount > 0) || unit === undefined || unit === "") return undefined;
    const whole = rounded(amount) === amount;
    const number = whole ? String(Math.trunc(amount)) : formatF(amount, 1).replaceAll(".", ",");
    return `${number} ${unit}`;
  },

  /**
   * Whether the amount is weighed or counted. Grams and millilitres take a
   * useful step; slices and pieces come one at a time, because half a slice
   * is not something this form can weigh.
   */
  isWeighed(self: NutritionEntry): boolean {
    const unit = self.unit?.toLowerCase();
    if (unit === undefined) return false;
    return unit === "g" || unit === "ml";
  },

  /**
   * What one tap of the stepper changes — 42d names it in the label above
   * the control ("HOEVEELHEID · PER 25 G"), so it is never a surprise.
   */
  step(self: NutritionEntry): number {
    const amount = self.amount;
    if (amount === undefined || !(amount > 0) || !NutritionEntry.isWeighed(self)) return 1;
    if (amount >= 200) return 25;
    if (amount >= 50) return 10;
    if (amount >= 20) return 5;
    return 1;
  },

  /**
   * The same entry under another heading (42d's meal segment).
   *
   * Its own time is kept. A lunch eaten at 15:30 and filed under Lunch was
   * still eaten at 15:30; the heading says which meal it was, and the clock
   * is not rewritten to agree with it.
   */
  filed(self: NutritionEntry, a: { under: Meal }): NutritionEntry {
    return NutritionEntry.make({
      id: self.id, date: self.date, meal: a.under, name: self.name,
      calories: self.calories, protein: self.protein, carbs: self.carbs, fat: self.fat,
      amount: self.amount, unit: self.unit, loggedAt: self.loggedAt,
    });
  },

  json(self: NutritionEntry): JSONValue {
    const object: { [key: string]: JSONValue } = {
      id: self.id,
      date: self.date,
      meal: self.meal,
      name: self.name,
      calories: self.calories,
      protein: self.protein,
      carbs: self.carbs,
      fat: self.fat,
    };
    // Three keys the web app does not model. It carries unknown keys on an
    // entry through untouched, so an amount written here survives its
    // edits, and an entry without them still reads everywhere.
    if (self.amount !== undefined && self.amount > 0) object["amount"] = self.amount;
    if (self.unit !== undefined && self.unit !== "") object["unit"] = self.unit;
    if (self.loggedAt !== undefined) object["loggedAt"] = LegacyAdapter.isoString(self.loggedAt);
    return object;
  },

  /**
   * What the food is worth when the label only gives macros. The web app
   * falls back to the same 4 · 4 · 9, so an item logged on either side of
   * the account counts the same.
   */
  calories(a: { protein: number; carbs: number; fat: number }): number {
    return rounded(a.protein * 4 + a.carbs * 4 + a.fat * 9);
  },
};

export type Meal = "Ontbijt" | "Lunch" | "Pre-workout" | "Avondeten" | "Snack";

export const Meal = {
  ontbijt: "Ontbijt" as Meal,
  lunch: "Lunch" as Meal,
  preWorkout: "Pre-workout" as Meal,
  avondeten: "Avondeten" as Meal,
  snack: "Snack" as Meal,
  allCases: ["Ontbijt", "Lunch", "Pre-workout", "Avondeten", "Snack"] as Meal[],

  /** `Meal(rawValue:)`. */
  fromRawValue(rawValue: string): Meal | undefined {
    return (Meal.allCases as string[]).includes(rawValue) ? (rawValue as Meal) : undefined;
  },

  id(self: Meal): string {
    return self;
  },

  /**
   * The stored value stays the web app's Dutch; this is what the screen
   * calls it.
   */
  label(self: Meal): string {
    switch (self) {
      case "Ontbijt": return "Breakfast";
      case "Lunch": return "Lunch";
      case "Pre-workout": return "Pre-workout";
      case "Avondeten": return "Dinner";
      case "Snack": return "Snack";
    }
  },

  /** How a sentence names it: "Add to dinner". */
  spoken(self: Meal): string {
    return Meal.label(self).toLowerCase();
  },

  /**
   * What is most likely being logged at this hour — the meal picker opens
   * there, and is one tap from anything else. The hours are the web app's
   * own, so the same clock gives the same answer in both.
   */
  likely(a: { at: Date }): Meal {
    const hour = hourOf(a.at);
    if (hour < 11) return Meal.ontbijt;
    if (hour < 16) return Meal.lunch;
    return Meal.avondeten;
  },
};

/**
 * One of the four headings a day is read in (42a), with what sits under it.
 *
 * The headings are fixed and stay even when empty, so a day has a shape
 * before anything is logged. `Snacks` also carries what the web app files as
 * pre-workout, and anything it files under a name this app does not know:
 * a heading that hid an entry would be worse than one that gathers a few.
 */
export interface MealSection {
  meal: Meal;
  title: string;
  entries: NutritionEntry[];
  calories: number;
}

export const MealSection = {
  id(self: MealSection): string {
    return self.title;
  },
  isEmpty(self: MealSection): boolean {
    return self.entries.length === 0;
  },

  /** Ontbijt, lunch, avondeten, snacks — four, always, in this order. */
  headings: [
    [Meal.ontbijt, "Breakfast"], [Meal.lunch, "Lunch"], [Meal.avondeten, "Dinner"], [Meal.snack, "Snacks"],
  ] as [Meal, string][],

  /**
   * What a heading is called: "Snacks" gathers more than one meal, so it is
   * named in the plural everywhere it appears.
   */
  title(a: { of: Meal }): string {
    return MealSection.headings.find((h) => h[0] === a.of)?.[1] ?? a.of;
  },

  make(p: { meal: Meal; title: string; entries: NutritionEntry[] }): MealSection {
    return {
      meal: p.meal,
      title: p.title,
      entries: p.entries,
      calories: p.entries.reduce((total, entry) => total + entry.calories, 0),
    };
  },
};

/** A day's eating, against the day's targets. */
export interface NutritionDay {
  dateKey: string;
  entries: NutritionEntry[];
  targets?: NutritionTargets;

  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function belongs(entry: NutritionEntry, meal: Meal): boolean {
  const stored = Meal.fromRawValue(entry.meal);
  switch (meal) {
    case "Snack": return stored === undefined || stored === Meal.snack || stored === Meal.preWorkout;
    default: return stored === meal;
  }
}

export const NutritionDay = {
  /** `init(dateKey:entries:targets:)`. */
  make(p: { dateKey: string; entries: NutritionEntry[]; targets: NutritionTargets | undefined }): NutritionDay {
    return {
      dateKey: p.dateKey,
      entries: p.entries,
      targets: p.targets,
      calories: p.entries.reduce((total, e) => total + e.calories, 0),
      protein: p.entries.reduce((total, e) => total + e.protein, 0),
      carbs: p.entries.reduce((total, e) => total + e.carbs, 0),
      fat: p.entries.reduce((total, e) => total + e.fat, 0),
    };
  },

  /** `static func make(entries:on:targets:)`. */
  makeEntries(a: { entries: NutritionEntry[]; on: Date; targets: NutritionTargets | undefined }): NutritionDay {
    const key = Schedule.dateKey(a.on);
    return NutritionDay.make({ dateKey: key, entries: a.entries.filter((e) => e.date === key), targets: a.targets });
  },

  /**
   * The day under its four headings, in the order they are eaten. Entries
   * keep the order they were logged in; nothing is re-sorted by hour.
   */
  sections(self: NutritionDay): MealSection[] {
    return MealSection.headings.map(([meal, title]) =>
      MealSection.make({ meal, title, entries: self.entries.filter((e) => belongs(e, meal)) }),
    );
  },

  /**
   * A target of zero is not a target — the web app writes zeroes where the
   * account has never set one.
   */
  hasTarget(self: NutritionDay): boolean {
    return (self.targets?.calories ?? 0) > 0;
  },

  /**
   * Never below zero: past the target there is nothing left to eat, and
   * the line underneath already says by how much it was passed.
   */
  remaining(self: NutritionDay): number {
    return Math.max(0, (self.targets?.calories ?? 0) - self.calories);
  },

  /** How full the ring is drawn, and it stops at full. */
  consumed(self: NutritionDay): number {
    const target = self.targets?.calories;
    if (!NutritionDay.hasTarget(self) || target === undefined || !(target > 0)) return 0;
    return Math.min(1, Math.max(0, self.calories / target));
  },

  fraction(self: NutritionDay, a: { of: Macro }): number {
    const target = NutritionDay.target(self, { for: a.of });
    if (!(target > 0)) return 0;
    return Math.min(1, Math.max(0, NutritionDay.total(self, { of: a.of }) / target));
  },

  total(self: NutritionDay, a: { of: Macro }): number {
    switch (a.of) {
      case "protein": return self.protein;
      case "carbs": return self.carbs;
      case "fat": return self.fat;
    }
  },

  target(self: NutritionDay, a: { for: Macro }): number {
    const targets = self.targets;
    if (targets === undefined) return 0;
    switch (a.for) {
      case "protein": return targets.protein;
      case "carbs": return targets.carbs;
      case "fat": return targets.fat;
    }
  },

  macros(_self: NutritionDay): Macro[] {
    return Macro.allCases;
  },
};

export type Macro = "protein" | "carbs" | "fat";

export const Macro = {
  protein: "protein" as Macro,
  carbs: "carbs" as Macro,
  fat: "fat" as Macro,
  allCases: ["protein", "carbs", "fat"] as Macro[],

  label(self: Macro): string {
    switch (self) {
      case "protein": return "Protein";
      case "carbs": return "Carbs";
      case "fat": return "Fat";
    }
  },

  /**
   * Protein is the one macro this design colours: it is the one the reader
   * is steering. The other two are reported, not urged.
   */
  isLed(self: Macro): boolean {
    return self === "protein";
  },
};

/**
 * Days in a row on which protein stayed under its target — the one thing the
 * nutrition screen raises by itself (redesign 1c, "Aandacht").
 *
 * It is read from what was logged and nothing else. Only whole days count:
 * today joins once it is over, because a day half eaten is always short. A
 * day with nothing logged ends the run rather than extending it — not logging
 * is not the same as not eating. And a single short day is not a pattern, so
 * nothing is said until there are two.
 */
export interface ProteinShortfall {
  days: number;
  /** The mean number of grams those days fell short by, to the gram. */
  averageGrams: number;
}

export const ProteinShortfall = {
  /** `init(days:averageGrams:)`. */
  make(p: { days: number; averageGrams: number }): ProteinShortfall {
    return { days: p.days, averageGrams: p.averageGrams };
  },

  /** The longest run this looks back over. */
  window: 60,

  /** `static func make(entries:targets:today:)`. */
  makeEntries(a: { entries: NutritionEntry[]; targets: NutritionTargets | undefined; today?: Date }): ProteinShortfall | undefined {
    const today = a.today ?? new Date();
    const target = a.targets === undefined ? undefined : a.targets.protein;
    if (target === undefined || !(target > 0)) return undefined;
    const byDate = new Map<string, number>();
    for (const entry of a.entries) byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.protein);

    let days = 0;
    let shortfall = 0.0;
    let cursor: Date | undefined = addDays(today, -1);
    while (cursor !== undefined && days < ProteinShortfall.window) {
      const day: Date = cursor;
      const eaten = byDate.get(Schedule.dateKey(day));
      if (eaten === undefined || !(eaten < target)) break;
      shortfall += target - eaten;
      days += 1;
      cursor = addDays(day, -1);
    }
    if (days < 2) return undefined;
    return ProteinShortfall.make({ days, averageGrams: Math.trunc(rounded(shortfall / days)) });
  },
};
