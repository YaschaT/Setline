// Port of ios/SetlineCore/Tests/SetlineCoreTests/RecipesTests.swift.
import { test } from "node:test";
import { Meal } from "../../src/core/Nutrition/NutritionDay";
import { Recipe, Recipes } from "../../src/core/Nutrition/Recipes";
import { assertClose, assertEqual, assertGreaterThanOrEqual, assertTrue } from "../helpers";

test("testEveryMealHasRecipes", () => {
  for (const meal of [Meal.ontbijt, Meal.lunch, Meal.avondeten, Meal.snack]) {
    assertGreaterThanOrEqual(Recipes.for(meal).length, 3, Meal.label(meal));
  }
  // Recipe's `==` compares ids.
  const pre = Recipes.for(Meal.preWorkout);
  const snack = Recipes.for(Meal.snack);
  assertTrue(pre.length === snack.length && pre.every((r, i) => Recipe.equals(r, snack[i])));
});

test("testMacrosAreTheSumOfTheIngredients", () => {
  const oats = Recipes.all.find((r) => r.id === "protein-oats");
  if (oats === undefined) throw new Error("XCTUnwrap failed");
  // 60 g oats 233 + 250 ml milk 118 + 30 g whey 120 + 60 g banana 53 + 50 g blueberries 29 = 553
  assertEqual(Recipe.macros(oats).calories, 553);
  // 10.2 + 8.5 + 24 + 0.7 + 0.4 = 43.8
  assertEqual(Recipe.macros(oats).protein, 44);
});

test("testEnergyAgreesWithTheMacros", () => {
  // 4 kcal per g of protein and carbs, 9 per g of fat — within 15 %,
  // so a typo in a per-100 g value shows up here.
  for (const recipe of Recipes.all) {
    const m = Recipe.macros(recipe);
    const estimate = m.protein * 4 + m.carbs * 4 + m.fat * 9;
    assertClose(m.calories, estimate, estimate * 0.15, recipe.name);
  }
});

test("testEveryRecipeIsHighProtein", () => {
  for (const recipe of Recipes.all) {
    if (recipe.meal === Meal.snack) continue;
    assertGreaterThanOrEqual(Recipe.macros(recipe).protein, 25, recipe.name);
  }
});

test("testLoggingWritesOneEntryWithTheTotals", () => {
  const bowl = Recipes.all.find((r) => r.id === "chicken-rice-bowl");
  if (bowl === undefined) throw new Error("XCTUnwrap failed");
  const entry = Recipe.entry(bowl, { id: "x", date: new Date(0), meal: Meal.avondeten });
  assertEqual(entry.name, "Chicken rice bowl");
  assertEqual(entry.meal, Meal.avondeten);
  assertEqual(entry.calories, Recipe.macros(bowl).calories);
  assertEqual(entry.protein, Recipe.macros(bowl).protein);
});
