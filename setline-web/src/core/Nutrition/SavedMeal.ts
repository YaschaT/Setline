// MealBuilder.swift (SavedMeal) — a meal of your own: a name, with what goes
// in it underneath. Spaghetti is pasta, sauce, mince and a spoon of olive oil;
// saved once, it is one tap to log again. Kept on this device, per account,
// like favorites.
import { Schedule } from "../Engine/Schedule";
import { NutritionEntry, type Meal } from "./NutritionDay";

export interface SavedMeal_Ingredient {
  id: string;
  name: string;
  /** As it is said: "80 g", "1 tbsp". */
  amount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface SavedMeal {
  id: string;
  name: string;
  ingredients: SavedMeal_Ingredient[];
}

const sum = (meal: SavedMeal, key: "calories" | "protein" | "carbs" | "fat") =>
  Math.round(meal.ingredients.reduce((total, item) => total + item[key], 0));

export const SavedMeal = {
  calories: (meal: SavedMeal) => sum(meal, "calories"),
  protein: (meal: SavedMeal) => sum(meal, "protein"),
  carbs: (meal: SavedMeal) => sum(meal, "carbs"),
  fat: (meal: SavedMeal) => sum(meal, "fat"),

  /** "Pasta, tomato sauce, olive oil" */
  ingredientLine: (meal: SavedMeal) => meal.ingredients.map((item) => item.name).join(", "),

  /** One entry, the meal's name and totals. Logged as one meal, so changing the amount afterwards to 1.5 scales every number with it. */
  entry(meal: SavedMeal, a: { id: string; on: Date; meal: Meal }): NutritionEntry {
    return NutritionEntry.make({
      id: a.id,
      date: Schedule.dateKey(a.on),
      meal: a.meal,
      name: meal.name,
      calories: SavedMeal.calories(meal),
      protein: SavedMeal.protein(meal),
      carbs: SavedMeal.carbs(meal),
      fat: SavedMeal.fat(meal),
      amount: 1,
      unit: "meal",
      loggedAt: new Date(),
    });
  },

  /** What storage gave back, kept only when it is a meal. */
  decode(raw: unknown): SavedMeal | undefined {
    if (typeof raw !== "object" || raw === null) return undefined;
    const object = raw as Record<string, unknown>;
    if (typeof object.id !== "string" || typeof object.name !== "string" || !Array.isArray(object.ingredients)) return undefined;
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    return {
      id: object.id,
      name: object.name,
      ingredients: object.ingredients
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).name === "string")
        .map((item) => ({
          id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
          name: item.name as string,
          amount: typeof item.amount === "string" ? item.amount : "",
          calories: number(item.calories),
          protein: number(item.protein),
          carbs: number(item.carbs),
          fat: number(item.fat),
        })),
    };
  },
};
