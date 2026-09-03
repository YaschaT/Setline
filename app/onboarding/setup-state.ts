import { datesInWeek, dateKey } from "@/lib/week";

/** Mirrors the canonical day ids in app/page.tsx. */
export type CanonicalDayId = "push" | "pull" | "legs" | "lower" | "upper" | "rest";
export type PlanMode = "personal" | "science";
export type SciencePlanId = "ppl-ul" | "upper-lower" | "full-body";

export type Goal = "spiermassa" | "kracht" | "droger" | "behouden";

export type PlanChoice = {
  id: string;
  label: string;
  days: string;
  summary: string;
  planMode: PlanMode;
  sciencePlanId: SciencePlanId;
  schedule: Record<number, CanonicalDayId>;
  /** Training slots this plan can place on a day, in rotation order. */
  slots: CanonicalDayId[];
};

export const PLAN_CHOICES: PlanChoice[] = [
  {
    id: "personal",
    label: "Mijn plan",
    days: "5 dagen",
    summary: "Push, Pull, Legs plus Upper en Lower — met de specialisatie die er al in zit.",
    planMode: "personal",
    sciencePlanId: "ppl-ul",
    schedule: { 0: "rest", 1: "push", 2: "pull", 3: "legs", 4: "rest", 5: "lower", 6: "upper" },
    slots: ["push", "pull", "legs", "lower", "upper"],
  },
  {
    id: "science-ppl-ul",
    label: "PPL + Upper/Lower",
    days: "5 dagen",
    summary: "Neutralere volumes, grote spiergroepen ongeveer twee keer per week.",
    planMode: "science",
    sciencePlanId: "ppl-ul",
    schedule: { 0: "rest", 1: "push", 2: "pull", 3: "legs", 4: "rest", 5: "lower", 6: "upper" },
    slots: ["push", "pull", "legs", "lower", "upper"],
  },
  {
    id: "science-upper-lower",
    label: "Upper/Lower",
    days: "4 dagen",
    summary: "Vier sessies, veel hersteltijd, weinig ruimte om een week te missen.",
    planMode: "science",
    sciencePlanId: "upper-lower",
    schedule: { 0: "rest", 1: "push", 2: "pull", 3: "rest", 4: "lower", 5: "upper", 6: "rest" },
    slots: ["push", "pull", "lower", "upper"],
  },
  {
    id: "science-full-body",
    label: "Full body",
    days: "3 dagen",
    summary: "Drie sessies die alles raken. Het meest vergevingsgezind voor een drukke week.",
    planMode: "science",
    sciencePlanId: "full-body",
    schedule: { 0: "rest", 1: "push", 2: "rest", 3: "legs", 4: "rest", 5: "lower", 6: "rest" },
    slots: ["push", "legs", "lower"],
  },
];

export const GOALS: Array<{ id: Goal; label: string; detail: string }> = [
  { id: "spiermassa", label: "Spiermassa", detail: "Groeien, met een licht overschot." },
  { id: "kracht", label: "Kracht", detail: "Zwaarder tillen, gewicht ongeveer gelijk." },
  { id: "droger", label: "Droger worden", detail: "Vet eraf, kracht vasthouden." },
  { id: "behouden", label: "Behouden", detail: "Vasthouden wat er staat." },
];

export const DAY_SHORT: Record<CanonicalDayId, string> = {
  push: "PUSH",
  pull: "PULL",
  legs: "LEGS",
  lower: "LOWER",
  upper: "UPPER",
  rest: "",
};

/** Weekday index (0 = Sunday, matching Date#getDay) for Monday-first position. */
export function weekdayIndexForPosition(position: number) {
  return (position + 1) % 7;
}

export function programKey(mode: PlanMode, sciencePlanId: SciencePlanId) {
  return mode === "personal" ? "personal" : `science-${sciencePlanId}`;
}

/**
 * Turns a training day back on by handing it the plan slot that is currently
 * used least, so toggling days around never silently drops a movement pattern.
 */
export function slotForNewTrainingDay(
  week: CanonicalDayId[],
  slots: CanonicalDayId[],
): CanonicalDayId {
  const counts = new Map(slots.map((slot) => [slot, 0]));
  for (const day of week) {
    if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let best = slots[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const slot of slots) {
    const count = counts.get(slot) ?? 0;
    if (count < bestCount) {
      best = slot;
      bestCount = count;
    }
  }
  return best;
}

const GOAL_CALORIE_FACTOR: Record<Goal, number> = {
  spiermassa: 1.1,
  kracht: 1.05,
  droger: 0.85,
  behouden: 1,
};

export type Targets = { calories: number; protein: number; carbs: number; fat: number };

/**
 * A transparent starting point, not a prescription: roughly 33 kcal per kilo
 * for someone lifting several times a week, nudged by the goal, with protein
 * at 2 g/kg and fat at 0.8 g/kg. Everything left over goes to carbs.
 */
export function targetsFor(weightKg: number, goal: Goal): Targets {
  const maintenance = weightKg * 33;
  const calories = Math.round((maintenance * GOAL_CALORIE_FACTOR[goal]) / 10) * 10;
  const protein = Math.round(weightKg * 2);
  const fat = Math.round(weightKg * 0.8);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}

/** How many weeks of the chosen week shape to write forward. */
const WEEKS_TO_SEED = 12;

/**
 * Projects the week the user built onto real calendar dates, so the schedule
 * they just looked at is the schedule they open the app to.
 */
export function scheduleOverridesForWeek(
  week: CanonicalDayId[],
  plan: PlanChoice,
): Record<string, CanonicalDayId> {
  const key = programKey(plan.planMode, plan.sciencePlanId);
  const overrides: Record<string, CanonicalDayId> = {};
  const monday = datesInWeek()[0];

  for (let weekIndex = 0; weekIndex < WEEKS_TO_SEED; weekIndex += 1) {
    for (let position = 0; position < 7; position += 1) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + weekIndex * 7 + position);
      overrides[`${key}:${dateKey(date)}`] = week[position];
    }
  }
  return overrides;
}
