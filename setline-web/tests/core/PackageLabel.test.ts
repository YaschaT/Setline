// Port of ios/SetlineCore/Tests/SetlineCoreTests/PackageLabelTests.swift.
import { test } from "node:test";
import { FoodProduct } from "../../src/core/Nutrition/FoodSearch";
import { PackageLabel, PackageLabel_Nutrition, PackageLabel_Observation } from "../../src/core/Nutrition/PackageLabel";
import { assertEqual, assertFalse, assertNil, assertTrue } from "../helpers";

function line(text: string, o: { y: number; x?: number; height?: number }): PackageLabel_Observation {
  return PackageLabel_Observation.make({ text, x: o.x ?? 0.1, y: o.y, width: 0.3, height: o.height ?? 0.02 });
}

test("testEuropeanTableReadsTheFirstColumnPer100g", () => {
  const nutrition = PackageLabel.nutrition({ in: [
    "Nutrition facts per 100 g per 30 g",
    "Energy 1590 kJ / 380 kcal 477 kJ / 114 kcal",
    "Fat 5,0 g 1,5 g",
    "of which saturates 3,1 g 0,9 g",
    "Carbohydrate 7,0 g 2,1 g",
    "of which sugars 6,5 g 2,0 g",
    "Protein 78 g 23 g",
  ] });
  if (nutrition === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(nutrition.kcal, 380);
  assertEqual(nutrition.protein, 78);
  assertEqual(nutrition.carbs, 7);
  assertEqual(nutrition.fat, 5);
  assertEqual(nutrition.servingGrams, 30);
});

test("testDutchTable", () => {
  const nutrition = PackageLabel.nutrition({ in: [
    "Voedingswaarde per 100 g",
    "Energie 1600 kJ 383 kcal",
    "Vetten 6 g",
    "waarvan verzadigde vetzuren 2 g",
    "Koolhydraten 8 g",
    "waarvan suikers 4 g",
    "Eiwitten 75 g",
  ] });
  if (nutrition === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(nutrition.kcal, 383);
  assertEqual(nutrition.fat, 6);
  assertEqual(nutrition.carbs, 8);
  assertEqual(nutrition.protein, 75);
});

test("testServingOnlyLabelIsBroughtTo100g", () => {
  const nutrition = PackageLabel.nutrition({ in: [
    "Serving Size 1 Scoop (31g)",
    "Calories 120 kcal",
    "Total Fat 1.5g",
    "Total Carbohydrate 3g",
    "Protein 24g",
  ] });
  if (nutrition === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(nutrition.servingGrams, 31);
  assertEqual(nutrition.protein, 77.4);
  assertEqual(nutrition.kcal, 387);
});

test("testMarketingNumbersAreNotTheTable", () => {
  assertNil(PackageLabel.nutrition({ in: ["24g protein per serving", "100% whey"] }));
});

test("testSplitColumnsJoinIntoRows", () => {
  const rows = PackageLabel.rows({ from: [
    line("Protein", { y: 0.40 }),
    line("78 g", { y: 0.401, x: 0.6 }),
    line("Fat", { y: 0.30 }),
    line("5 g", { y: 0.299, x: 0.6 }),
  ] });
  assertEqual(rows, ["Protein 78 g", "Fat 5 g"]);
});

test("testBigPrintNamesWheyNotTheFlavour", () => {
  const observations = [
    line("OPTIMUM NUTRITION", { y: 0.85, height: 0.03 }),
    line("GOLD STANDARD", { y: 0.78, height: 0.06 }),
    line("100% WHEY", { y: 0.70, height: 0.08 }),
    line("DOUBLE RICH CHOCOLATE", { y: 0.60, height: 0.04 }),
    line("Ingredients: whey protein, cocoa, milk, emulsifier", { y: 0.2, height: 0.01 }),
    line("Protein 24 g", { y: 0.15, height: 0.01 }),
  ];
  const reading = PackageLabel.read(observations);
  assertTrue(reading.title.includes("100% WHEY"));
  assertFalse(reading.title.includes("Ingredients"));
  assertEqual(reading.tableFood?.key, "whey");
});

test("testProteinPowderWordsMatchWhey", () => {
  assertEqual(PackageLabel.tableFood({ in: "Vanilla protein powder" })?.key, "whey");
  assertEqual(PackageLabel.tableFood({ in: "Whey Protein Isolate" })?.key, "whey");
  assertEqual(PackageLabel.tableFood({ in: "Banana" })?.key, "banana");
});

test("testLabelValuesScaleToTheServing", () => {
  const food = PackageLabel_Nutrition.scanned({ kcal: 380, protein: 78, carbs: 7, fat: 5, servingGrams: 30 }, { name: "Whey", grams: 30 });
  assertEqual(food.calories, 114);
  assertEqual(food.protein, 23.4);
  assertEqual(food.confidence, "high");
});

test("testBrandOnThePackagePicksThatProductOverGenericWhey", () => {
  const product = (name: string, brand: string, kcal = 390) =>
    FoodProduct.make({ id: name, name, brand, calories: kcal, protein: 80, carbs: 5, fat: 5, note: "" });
  const results = [
    product("Whey protein", "Generiek"),
    product("Platinum Whey", "NPL"),
    product("Whey protein - Xxl Nutrition", "Merk onbekend"),
    product("Delicious Whey Xxl Nutrition", "Xxl Nutrition", 388),
  ];
  const ranked = PackageLabel.products(results, { matching: "XXL NUTRITION DELICIOUS WHEY CHOCOLATE 1000 g" });
  assertEqual(ranked.map((p) => p.name), ["Delicious Whey Xxl Nutrition", "Whey protein - Xxl Nutrition"]);
  assertTrue(PackageLabel.products(results, { matching: "Gold Standard 100% Whey" }).length === 0);
});
