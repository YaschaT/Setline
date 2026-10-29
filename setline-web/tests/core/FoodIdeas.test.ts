// Port of ios/SetlineCore/Tests/SetlineCoreTests/FoodIdeasTests.swift.
import { test } from "node:test";
import { FoodIdea, FoodIdeas } from "../../src/core/Nutrition/FoodIdeas";
import { FoodProduct } from "../../src/core/Nutrition/FoodSearch";
import { Meal } from "../../src/core/Nutrition/NutritionDay";
import { assertEqual, assertNil } from "../helpers";

test("testAProductKeepsItsPhotoAndAnEmptyOneIsNone", () => {
  const json = `
  [{"id":"1","name":"Skyr","brand":"Arla","calories":63,"protein":11,"carbs":4,"fat":0.2,
    "sourceNote":"Open Food Facts","imageUrl":"https://images.openfoodfacts.org/x.jpg"},
   {"id":"2","name":"Rice","brand":"","calories":130,"protein":2.7,"carbs":28,"fat":0.3,
    "sourceNote":"Generic","imageUrl":""}]`;
  const products = (JSON.parse(json) as unknown[]).map(FoodProduct.decode);
  assertEqual(products[0].imageURL, "https://images.openfoodfacts.org/x.jpg");
  assertNil(products[1].imageURL);
});

test("testAnIdeaLogsItsPortionNotHundredGrams", () => {
  const chicken = FoodIdeas.all.find((i) => i.id === "chicken");
  if (chicken === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(FoodIdea.calories(chicken), 248);
  assertEqual(FoodIdea.protein(chicken), 47);
  const entry = FoodIdea.entry(chicken, { id: "x", date: new Date(), meal: Meal.lunch });
  assertEqual(entry.amount, 150);
  assertEqual(entry.meal, Meal.lunch);
  assertEqual(entry.protein, 47);
});

test("testProteinFirstWhenProteinIsMissing", () => {
  assertEqual(FoodIdeas.ordered({ proteinLeft: 0 }).map((i) => i.id), FoodIdeas.all.map((i) => i.id));
  const ordered = FoodIdeas.ordered({ proteinLeft: 90 });
  assertEqual(ordered[0]?.id, "tuna", "most protein per calorie");
  assertEqual(ordered[ordered.length - 1]?.id, "banana");
});
