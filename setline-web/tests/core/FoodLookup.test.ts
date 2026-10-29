// Port of ios/SetlineCore/Tests/SetlineCoreTests/FoodLookupTests.swift.
import { test } from "node:test";
import {
  BarcodeProduct,
  FavoriteFood,
  FoodScanAnswer,
  FoodScanRequest,
  FoodScanRequest_Turn,
  ScannedFood,
} from "../../src/core/Nutrition/FoodLookup";
import { Meal, NutritionEntry } from "../../src/core/Nutrition/NutritionDay";
import { assertEqual, assertNil, assertTrue } from "../helpers";

test("testBarcodeParsesValuesPer100gAndServing", () => {
  const json = `
  {"status":1,"product":{"product_name":"Skyr naturel","brands":"Arla, Lidl","serving_quantity":"150",
  "image_front_small_url":"https://images.openfoodfacts.org/x.jpg",
  "nutriments":{"energy-kcal_100g":63,"proteins_100g":11,"carbohydrates_100g":3.8,"fat_100g":0.2}}}`;
  const product = BarcodeProduct.parse(json, { barcode: "5701234567890" });
  if (product === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(product.product.name, "Skyr naturel");
  assertEqual(product.product.brand, "Arla");
  assertEqual(product.product.calories, 63);
  assertEqual(product.product.protein, 11);
  assertEqual(product.servingGrams, 150);
});

test("testBarcodeWithoutProductOrEnergyIsNil", () => {
  assertNil(BarcodeProduct.parse(`{"status":0}`, { barcode: "1" }));
  assertNil(BarcodeProduct.parse(`{"status":1,"product":{"product_name":"X","nutriments":{}}}`, { barcode: "1" }));
});

test("testBarcodeFallsBackToKilojoules", () => {
  const json = `{"status":1,"product":{"product_name":"Bar","nutriments":{"energy_100g":1674}}}`;
  const product = BarcodeProduct.parse(json, { barcode: "2" });
  if (product === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(product.product.calories, 400);
});

test("testScannedFoodScalesWithGrams", () => {
  const answer = FoodScanAnswer.decode(JSON.parse(`
  {"items":[{"name":"Chicken breast","grams":150,"calories":248,"protein":46.5,"carbs":0,"fat":5.4,"confidence":"high"}]}`));
  const doubled = ScannedFood.scaled(answer.items[0], { to: 300 });
  assertEqual(doubled.calories, 496);
  assertEqual(doubled.protein, 93);
  assertEqual(answer.items[0].confidence, "high");
});

test("testMealScanAnswerCarriesTallysLineAndQuestion", () => {
  const answer = FoodScanAnswer.decode(JSON.parse(`
  {"say":"Stoofvlees with fries!","items":[{"name":"Stoofvlees","grams":250,"calories":420,"protein":38,"carbs":12,"fat":22,"confidence":"medium"}],
   "question":{"text":"Mayo with the fries?","options":["Yes","No"]}}`));
  assertEqual(answer.say, "Stoofvlees with fries!");
  assertEqual(answer.question?.options, ["Yes", "No"]);
  const none = FoodScanAnswer.decode(JSON.parse(`{"say":"x","items":[],"question":null}`));
  assertNil(none.question);
});

test("testMealScanRequestSendsThePlateBack", () => {
  const plate = [ScannedFood.make({ name: "Fries", grams: 180, calories: 560, protein: 6, carbs: 70, fat: 28, confidence: "medium" })];
  const request = FoodScanRequest.make({
    imageJPEG: new Uint8Array([1, 2]), text: "", plate,
    turns: [FoodScanRequest_Turn.tally("Mayo?"), FoodScanRequest_Turn.user("No")],
  });
  const json = JSON.parse(FoodScanRequest.encode(request)) as Record<string, unknown>;
  assertEqual(json["image"], "AQI=");
  assertNil(json["text"]);
  assertEqual((json["plate"] as Record<string, unknown>[] | undefined)?.[0]?.["confidence"], "medium");
  const turns = json["turns"] as Record<string, unknown>[] | undefined;
  assertEqual(turns?.[turns.length - 1]?.["role"], "user");
});

test("testFavoriteRoundTripsAnEntry", () => {
  const entry = NutritionEntry.make({ id: "a", date: "2026-10-10", meal: "lunch", name: "Skyr", calories: 95, protein: 16.5, carbs: 5.7, fat: 0.3, amount: 150, unit: "g" });
  const favorite = FavoriteFood.make(entry);
  assertTrue(FavoriteFood.matches(favorite, entry));
  assertEqual(FavoriteFood.portion(favorite), "150 g");
  const again = FavoriteFood.entry(favorite, { id: "b", on: new Date(), meal: Meal.snack });
  assertEqual(again.calories, 95);
  assertEqual(again.meal, Meal.snack);
});
