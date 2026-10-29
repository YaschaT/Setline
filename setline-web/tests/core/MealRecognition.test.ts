// Port of ios/SetlineCore/Tests/SetlineCoreTests/MealRecognitionTests.swift.
import { test } from "node:test";
import { MealRecognition, MealRecognition_Food, MealRecognition_Part } from "../../src/core/Nutrition/MealRecognition";
import { assertClose, assertEqual, assertFalse, assertGreaterThan, assertLessThan, assertNil, assertTrue } from "../helpers";

const scannedParts = (line: string) =>
  MealRecognition.parts({ of: line }).map(MealRecognition.scanned).filter((f) => f !== undefined);

test("testTypedLineSplitsAndReadsAmounts", () => {
  const parts = MealRecognition.parts({ of: "200 g rice, 2 eggs and kipfilet" });
  assertEqual(parts.length, 3);
  assertEqual(parts[0], MealRecognition_Part.make({ words: "rice", grams: 200, count: undefined }));
  assertEqual(parts[1], MealRecognition_Part.make({ words: "eggs", grams: undefined, count: 2 }));
  assertEqual(parts[2].words, "kipfilet");
});

test("testTypedPartsBecomeFoods", () => {
  const foods = scannedParts("200g rijst met 2 eieren en kipfilet");
  assertEqual(foods.map((f) => f.name), ["White rice, cooked", "Eggs, boiled", "Chicken breast, cooked"]);
  assertEqual(foods[0].grams, 200);
  assertEqual(foods[0].calories, 260);
  assertEqual(foods[1].grams, 100);
  assertEqual(foods[2].confidence, "medium");
});

test("testLongestAliasWins", () => {
  assertEqual(MealRecognition.match("peanut butter")?.key, "peanut_butter");
  assertEqual(MealRecognition.match("fried chicken")?.key, "fried_chicken");
  assertNil(MealRecognition.match("zzz"));
});

test("testLabelsPreferPreciseFoodsOverBroadOnes", () => {
  const foods = MealRecognition.fromLabels([
    { label: "food", confidence: 0.9 }, { label: "vegetable", confidence: 0.7 }, { label: "rice", confidence: 0.65 },
    { label: "grilled_chicken", confidence: 0.4 }, { label: "broccoli", confidence: 0.2 }, { label: "plate", confidence: 0.8 },
  ]);
  assertEqual(foods.map((f) => f.name), ["White rice, cooked", "Chicken breast, cooked", "Broccoli"]);
  assertEqual(foods[0].confidence, "high");
  assertEqual(foods[2].confidence, "low");
});

test("testOnlyBroadLabelsStillGiveSomething", () => {
  assertEqual(MealRecognition.fromLabels([{ label: "fruit", confidence: 0.5 }]).map((f) => f.name), ["Fruit"]);
});

test("testBelgianDishesAndCompounds", () => {
  assertEqual(MealRecognition.match("kippenpastei")?.key, "pie");
  assertEqual(MealRecognition.match("kippenpasteitje met frietjes")?.key, "pie");
  assertEqual(MealRecognition.match("stoofvlees")?.key, "stew");
  assertEqual(MealRecognition.match("vol-au-vent")?.key, "pie");
  assertEqual(MealRecognition.match("kip")?.key, "grilled_chicken");
  assertEqual(scannedParts("kippenpastei met frietjes en mayo").map((f) => f.name), ["Chicken pie (vol-au-vent)", "Fries", "Mayonnaise"]);
});

test("testSimilarityPrefersTheNameThatWasTyped", () => {
  const good = MealRecognition.similarity("kipfilet", { to: "Kipfilet, bereid", brand: "Generiek" });
  const bad = MealRecognition.similarity("kippenpastei", { to: "Pasta salade", brand: "Delhaize" });
  assertGreaterThan(good, 0.9);
  assertLessThan(bad, 0.5);
});

test("testTyposAndShortWordsInsideCompounds", () => {
  assertEqual(MealRecognition.match("kippenpqstei")?.key, "pie");
  assertEqual(MealRecognition.match("stoofvees")?.key, "stew");
  const others = MealRecognition.candidates("kippenpqstei").map((f) => f.key);
  assertFalse(others.includes("egg"));
});

test("testBrandedProductBeatsTheGeneralDish", () => {
  const pizza = MealRecognition.match("dokter oetker pizza bolognaise");
  if (pizza === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(pizza.key, "pizza");
  assertLessThan(MealRecognition.coverage("dokter oetker pizza bolognaise", { by: pizza }), 0.6);
  assertEqual(MealRecognition.coverage("pizza", { by: pizza }), 1);
  const product = MealRecognition.similarity("dokter oetker pizza bolognaise", { to: "Ristorante Pizza Bolognese", brand: "Dr. Oetker" });
  assertClose(product, 1, 0.01);
});

test("testBreadAsksWhatIsOnItPerSlice", () => {
  const bread = MealRecognition.scanned(MealRecognition_Part.make({ words: "boterhammen", grams: undefined, count: 4 }));
  if (bread === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(bread.grams, 140);
  const question = MealRecognition.questions({ for: bread.key })[0];
  if (question === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(question.text, "What's on it?");
  const choco = question.answers.find((a) => a.id === "choco");
  if (choco === undefined) throw new Error("XCTUnwrap failed");
  const added = MealRecognition.added(choco, { to: bread });
  if (added === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(added.name, "Chocolate spread");
  assertEqual(added.grams, 60);
});

test("testDishAsksHowBigAndKeepsItsRow", () => {
  const food = MealRecognition.match("pizza");
  if (food === undefined) throw new Error("XCTUnwrap failed");
  const pizza = MealRecognition_Food.scanned(food, { confidence: "medium" });
  const question = MealRecognition.questions({ for: pizza.key })[0];
  if (question === undefined) throw new Error("XCTUnwrap failed");
  const large = question.answers.find((a) => a.id === "large");
  if (large === undefined) throw new Error("XCTUnwrap failed");
  const bigger = MealRecognition.sized(pizza, { by: large });
  assertEqual(bigger.grams, 350);
  assertEqual(bigger.id, pizza.id);
});

test("testPhotoGuessOffersLookalikes", () => {
  const food = MealRecognition.food({ forLabel: "paella" });
  if (food === undefined) throw new Error("XCTUnwrap failed");
  const paella = MealRecognition_Food.scanned(food, { confidence: "medium" });
  const question = MealRecognition.identityQuestion({ for: paella });
  assertEqual(question.kind, "identity");
  const labels = question.answers.map((a) => a.label);
  assertEqual(labels[0], "Yes");
  assertTrue(labels.includes("Nasi goreng"));
  assertEqual(labels[labels.length - 1], "Something else");
});
