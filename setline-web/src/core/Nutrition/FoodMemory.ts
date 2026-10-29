import { Schedule } from "../Engine/Schedule";
import { NutritionEntry, type Meal } from "./NutritionDay";

/**
 * What this account has eaten before — the two lists the add sheet offers
 * (42c: "VAAK BIJ AVONDETEN", "RECENT").
 *
 * Both are read from the account's own entries. Nothing is suggested that was
 * never logged here, no food is invented, and no portion is guessed: a row is
 * a previous entry, offered again exactly as it was written.
 */
export const FoodMemory = {
  /**
   * What is logged at this meal most often, the most recent version of each
   * winning ties. Entries from `excluding` — usually today — are left out,
   * so the sheet does not offer what is already on the plate.
   */
  often(a: { at: Meal; in: NutritionEntry[]; excluding?: string; limit?: number }): NutritionEntry[] {
    const limit = a.limit ?? 3;
    const candidates = a.in
      .map((entry, offset) => ({ offset, entry }))
      .filter(({ entry }) => entry.meal === a.at && entry.date !== a.excluding && entry.name !== "");
    const counts = new Map<string, number>();
    const latest = new Map<string, { offset: number; entry: NutritionEntry }>();
    for (const { offset, entry } of candidates) {
      const key = entry.name.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const held = latest.get(key);
      if (held !== undefined && held.offset > offset) continue;
      latest.set(key, { offset, entry });
    }
    return [...latest.values()]
      .sort((left, right) => {
        const leftCount = counts.get(left.entry.name.toLowerCase()) ?? 0;
        const rightCount = counts.get(right.entry.name.toLowerCase()) ?? 0;
        if (leftCount !== rightCount) return leftCount > rightCount ? -1 : 1;
        return left.offset > right.offset ? -1 : left.offset < right.offset ? 1 : 0;
      })
      .slice(0, Math.max(0, limit))
      .map((held) => held.entry);
  },

  /**
   * The last things logged, newest first and one row per food, whatever
   * meal they were logged at.
   */
  recent(a: { in: NutritionEntry[]; excluding?: string; limit?: number }): NutritionEntry[] {
    const limit = a.limit ?? 5;
    const seen = new Set<string>();
    const rows: NutritionEntry[] = [];
    for (const entry of [...a.in].reverse()) {
      if (!(entry.date !== a.excluding && entry.name !== "")) continue;
      const key = entry.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(entry);
      if (rows.length === limit) break;
    }
    return rows;
  },

  /**
   * The same food, logged again: a new entry on this date and meal, at the
   * amount it was eaten at before.
   *
   * `date` says which day it belongs to; `loggedAt` is the moment it is
   * logged, which is now. The two were once one value — the moment the
   * food screen was opened — so a lunch logged at 12:40 on a screen opened
   * at 12:00 was stamped 12:00.
   */
  repeated(entry: NutritionEntry, a: { on: Date; meal: Meal; id?: string; loggedAt?: Date }): NutritionEntry {
    const loggedAt = a.loggedAt ?? new Date();
    return NutritionEntry.make({
      id: a.id ?? `food-${Math.trunc(Date.now())}`,
      date: Schedule.dateKey(a.on),
      meal: a.meal,
      name: entry.name,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      amount: entry.amount,
      unit: entry.unit,
      loggedAt,
    });
  },
};
