import {
  charCount,
  countChars,
  dropFirstChars,
  foldingDiacritics,
  graphemes,
  icuRegex,
  isLetterChar,
  isNumberChar,
  isWhitespaceChar,
  replacingRegex,
  splitChars,
  splitOn,
  swiftDouble,
  trimmingWhitespaces,
  trimmingWhitespacesAndNewlines,
} from "../Support/nutrition";
import { rounded } from "../Support/swift";
import { ScannedFood, type ScannedFood_Confidence } from "./FoodLookup";
import type { FoodProduct } from "./FoodSearch";
import { MealRecognition, type MealRecognition_Food } from "./MealRecognition";

/**
 * One piece of text and where it sits, in Vision's normalised
 * coordinates (0…1, origin bottom-left).
 */
export interface PackageLabel_Observation {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const PackageLabel_Observation = {
  make(p: { text: string; x: number; y: number; width: number; height: number }): PackageLabel_Observation {
    return { text: p.text, x: p.x, y: p.y, width: p.width, height: p.height };
  },
  midY(self: PackageLabel_Observation): number {
    return self.y + self.height / 2;
  },
};

/** What a nutrition table says, per 100 g, and the serving it names. */
export interface PackageLabel_Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** "Serving size 1 scoop (30 g)", "per 30 g". */
  servingGrams?: number;
}

export const PackageLabel_Nutrition = {
  scanned(self: PackageLabel_Nutrition, a: { name: string; grams: number; confidence?: ScannedFood_Confidence }): ScannedFood {
    const factor = a.grams / 100;
    return ScannedFood.make({
      name: a.name, grams: a.grams,
      calories: rounded(self.kcal * factor),
      protein: rounded(self.protein * factor * 10) / 10,
      carbs: rounded(self.carbs * factor * 10) / 10,
      fat: rounded(self.fat * factor * 10) / 10,
      confidence: a.confidence ?? "high",
    });
  },
};

/** Everything one photo's text says about the product. */
export interface PackageLabel_Reading {
  nutrition?: PackageLabel_Nutrition;
  /** The biggest print, as it reads: "Gold Standard 100% Whey". */
  title: string;
  /** The table food the big print names, flavours left out. */
  tableFood?: MealRecognition_Food;
  /**
   * Every line of the front print, small brand lines included — what a
   * product's name and brand are checked against.
   */
  printed: string;
}

export const PackageLabel_Reading = {
  make(p: { nutrition: PackageLabel_Nutrition | undefined; title: string; tableFood: MealRecognition_Food | undefined; printed?: string }): PackageLabel_Reading {
    return { nutrition: p.nutrition, title: p.title, tableFood: p.tableFood, printed: p.printed ?? "" };
  },
  isEmpty(self: PackageLabel_Reading): boolean {
    return self.nutrition === undefined && self.title === "" && self.tableFood === undefined;
  },
};

// MARK: - Nutrition table

const proteinWords = String.raw`(?:protein|proteins|proteine|proteines|eiwit|eiwitten|eiweiss|proteinas)`;
const carbWords = String.raw`(?:carbohydrate|carbohydrates|carbs|koolhydraten|koolhydraat|glucides|kohlenhydrate|hidratos)`;
const fatWords = String.raw`(?:fat|fats|total fat|vet|vetten|fett|lipides|matieres grasses|graisses|grasas)`;
/**
 * Saturated fat and sugars sit right under fat and carbohydrate and must
 * never be read as them.
 */
const subRowWords = ["saturat", "verzadig", "gesattigt", "satur", "sugar", "suiker", "zucker", "sucre", "waarvan", "of which", "dont", "davon"];

/**
 * The grams after a nutrient on its own row: "Protein 78 g 23.4 g" → 78.
 * A number before the word ("24g protein per scoop") is marketing, not
 * the table, and is not read.
 */
function value(words: string, lines: string[]): number | undefined {
  for (const line of lines) {
    if (subRowWords.some((word) => line.includes(word))) continue;
    const number = firstNumber(line, String.raw`\b${words}\b[^0-9]{0,24}?(\d+(?:\.\d+)?)\s*(?:g|gr|gram)?\b`);
    if (number !== undefined) return number;
  }
  return undefined;
}

// MARK: - What it is

/**
 * Words on a package that say how it tastes, not what it is: "chocolate"
 * on a tub of whey is not a bar of chocolate.
 */
const flavourWords = new Set<string>([
  "chocolate", "choco", "chocolade", "vanilla", "vanille", "strawberry", "aardbei", "banana", "banaan",
  "cookies", "cookie", "cream", "caramel", "salted", "peanut", "coconut", "mango", "lemon", "citroen",
  "cherry", "raspberry", "blueberry", "berry", "mint", "coffee", "mocha", "milk", "double", "rich",
  "flavour", "flavor", "smaak", "gout", "white", "hazelnut", "apple", "orange", "fruit",
]);

const filler = new Set<string>(["the", "and", "with", "met", "en", "de", "het", "van", "of", "-", "·"]);

function words(text: string): string[] {
  return splitChars(PackageLabel.normalised(text), (ch) => !isLetterChar(ch) && !isNumberChar(ch))
    .filter((word) => charCount(word) >= 2 && !filler.has(word));
}

// MARK: - Text

function numbers(text: string, pattern: string): number[] {
  let regex: RegExp;
  try {
    regex = icuRegex(pattern, "gi");
  } catch {
    return [];
  }
  const out: number[] = [];
  for (const match of text.matchAll(regex)) {
    if (match[1] === undefined) continue;
    const number = swiftDouble(match[1]);
    if (number !== undefined) out.push(number);
  }
  return out;
}

function firstNumber(text: string, pattern: string): number | undefined {
  let regex: RegExp;
  try {
    regex = icuRegex(pattern, "i");
  } catch {
    return undefined;
  }
  const match = regex.exec(text);
  if (match === null || match[1] === undefined) return undefined;
  return swiftDouble(match[1]);
}

/**
 * Reading a package rather than a plate: the words Apple's on-device text
 * recognition finds on a tub, a bar or a screenshot of one. A plate is
 * recognised by what it looks like; a package says what it is in print —
 * "100% WHEY" in big letters, and a nutrition table in small ones.
 *
 * Free, and nothing leaves the phone: this only reads the text the phone
 * has already found.
 */
export const PackageLabel = {
  read(observations: PackageLabel_Observation[]): PackageLabel_Reading {
    const rows = PackageLabel.rows({ from: observations });
    const title = PackageLabel.title({ of: observations });
    return PackageLabel_Reading.make({
      nutrition: PackageLabel.nutrition({ in: rows }), title, tableFood: PackageLabel.tableFood({ in: title }),
      printed: PackageLabel.title({ of: observations, share: 0.2, limit: 10 }),
    });
  },

  // MARK: - Rows

  /**
   * Text that sits on one line of the package, left to right. Vision often
   * returns "Protein" and "78 g" as two pieces when the table's columns are
   * far apart; a nutrient and its number belong on one row.
   */
  rows(a: { from: PackageLabel_Observation[] }): string[] {
    const midY = PackageLabel_Observation.midY;
    const sorted = a.from
      .filter((o) => trimmingWhitespaces(o.text) !== "")
      .sort((l, r) => (midY(l) > midY(r) ? -1 : midY(r) > midY(l) ? 1 : 0));
    const rows: PackageLabel_Observation[][] = [];
    for (const observation of sorted) {
      const last = rows.length - 1;
      const anchor = last >= 0 ? rows[last][0] : undefined;
      if (anchor !== undefined && Math.abs(midY(anchor) - midY(observation)) < Math.min(anchor.height, observation.height) * 0.6) {
        rows[last].push(observation);
      } else {
        rows.push([observation]);
      }
    }
    return rows.map((row) => [...row].sort((l, r) => (l.x < r.x ? -1 : r.x < l.x ? 1 : 0)).map((o) => o.text).join(" "));
  },

  /**
   * Reads the table from rows of text. The first number after a nutrient
   * is its first column, which on European packaging is per 100 g; a
   * label that only gives a serving is converted to 100 g.
   */
  nutrition(a: { in: string[] }): PackageLabel_Nutrition | undefined {
    const lines = a.in.map(PackageLabel.normalised);
    const all = lines.join(" \n ");

    const serving = PackageLabel.servingGrams({ in: lines });
    const mentionsHundred = icuRegex(String.raw`(?:per|pour|pro|/)\s*100\s*(?:g|gr|ml)\b|100\s*(?:g|gr|ml)\b`).test(all);

    let kcal = firstNumber(all, String.raw`(\d+(?:\.\d+)?)\s*kcal`) ?? firstNumber(all, String.raw`kcal\D{0,6}(\d+(?:\.\d+)?)`);
    if (kcal === undefined) {
      const kj = firstNumber(all, String.raw`(\d+(?:\.\d+)?)\s*kj`);
      if (kj !== undefined) kcal = kj / 4.184;
    }

    const protein = value(proteinWords, lines);
    const carbs = value(carbWords, lines);
    const fat = value(fatWords, lines);
    const macros = [protein, carbs, fat].filter((m) => m !== undefined);
    if (!(macros.length >= 2 || (kcal !== undefined && macros.length !== 0))) return undefined;

    let p = protein ?? 0;
    let c = carbs ?? 0;
    let f = fat ?? 0;
    let energy = kcal ?? p * 4 + c * 4 + f * 9;
    // A label that only speaks per serving: bring it to 100 g.
    if (!mentionsHundred && serving !== undefined && serving > 0 && serving !== 100) {
      const factor = 100 / serving;
      p *= factor; c *= factor; f *= factor; energy *= factor;
    }
    if (!(energy > 0 && energy <= 950 && p <= 100 && c <= 100 && f <= 100 && p + c + f <= 110)) return undefined;
    return {
      kcal: rounded(energy),
      protein: rounded(p * 10) / 10,
      carbs: rounded(c * 10) / 10,
      fat: rounded(f * 10) / 10,
      servingGrams: serving,
    };
  },

  /** "Serving size 1 scoop (30 g)", "portie 30 g", "per 30 g", "30 g = 1 schep". */
  servingGrams(a: { in: string[] }): number | undefined {
    const patterns = [
      String.raw`(?:serving|portion|portie|schep|scoop|dosis|dose|portion)[^0-9]{0,24}(?:\d+\s*(?:scoop|schep|serving)s?\s*)?\(?\s*(\d+(?:\.\d+)?)\s*(?:g|gr|gram)\b`,
      String.raw`(\d+(?:\.\d+)?)\s*(?:g|gr|gram)\s*(?:=|\()?\s*(?:1\s*)?(?:scoop|schep|serving|portie|portion)`,
      String.raw`(?:per|pour|pro)\s*(\d+(?:\.\d+)?)\s*(?:g|gr)\b`,
    ];
    for (const pattern of patterns) {
      for (const line of a.in) {
        // "per 100 g per 30 g": the serving is the one that isn't 100.
        const grams = numbers(line, pattern).find((n) => n > 0 && n !== 100 && n <= 500);
        if (grams !== undefined) return grams;
      }
    }
    return undefined;
  },

  /**
   * The table food the big print names. Flavour words are dropped first,
   * so "Whey Protein Double Rich Chocolate" is whey, not chocolate — unless
   * a flavour is all there is ("Banana").
   */
  tableFood(a: { in: string }): MealRecognition_Food | undefined {
    if (a.in === "") return undefined;
    const all = splitOn(PackageLabel.normalised(a.in), " ");
    const kept = all.filter((w) => !flavourWords.has(w)).join(" ");
    if (kept !== "") {
      const food = MealRecognition.match(kept);
      if (food !== undefined) return food;
    }
    return MealRecognition.match(all.join(" "));
  },

  /**
   * The biggest print on the package, top to bottom: the brand and the
   * product name. Numbers, nutrient rows and small print are left out.
   */
  title(a: { of: PackageLabel_Observation[]; share?: number; limit?: number }): string {
    const share = a.share ?? 0.45;
    const limit = a.limit ?? 4;
    const candidates = a.of.filter((observation) => {
      const text = PackageLabel.normalised(observation.text);
      const letters = countChars(text, isLetterChar);
      if (!(letters >= 3 && letters >= countChars(text, isNumberChar))) return false;
      // "Protein 78 g" is a table row; "WHEY PROTEIN" is the name.
      const nutrient = [proteinWords, carbWords, fatWords, "kcal", "kj", "energ"].some((pattern) => icuRegex(pattern).test(text));
      return !(nutrient && graphemes(text).some(isNumberChar));
    });
    if (candidates.length === 0) return "";
    const tallest = candidates.map((o) => o.height).reduce((m, h) => (h > m ? h : m));
    if (!(tallest > 0)) return "";
    const midY = PackageLabel_Observation.midY;
    const big = candidates
      .filter((o) => o.height >= tallest * share)
      .sort((l, r) => (midY(l) > midY(r) ? -1 : midY(r) > midY(l) ? 1 : 0))
      .slice(0, Math.max(0, limit))
      .map((o) => trimmingWhitespacesAndNewlines(o.text));
    return big.join(" ");
  },

  /**
   * Search results for the big print, the product on the package first.
   *
   * The print on a tub says much more than a product's name does ("XXL
   * Nutrition · Delicious Whey · Chocolate · 1 kg · 33 servings"), so a
   * product is judged by how much of *its* name and brand the package
   * shows, not the other way round — and a brand printed on the package
   * counts most. A generic food is never the package.
   */
  products(products: FoodProduct[], a: { matching: string }): FoodProduct[] {
    const printed = new Set(words(a.matching));
    if (printed.size === 0) return [];
    const unknown = new Set<string>(["merk", "onbekend", "generiek"]);
    const scored: [FoodProduct, number][] = [];
    for (const product of products) {
      const brand = words(product.brand).filter((w) => !unknown.has(w));
      if (!(brand.length !== 0 || !product.brand.toLowerCase().includes("generiek"))) continue;
      const name = words(product.name);
      const own = new Set([...name, ...brand]);
      if (own.size === 0) continue;
      const shown = [...own].filter((w) => printed.has(w)).length / own.size;
      // A brand on the package, or in the product's name when the
      // database left the brand empty ("Whey protein - Xxl Nutrition").
      const brandShown = brand.length !== 0 && brand.every((w) => printed.has(w));
      let nameHasPrintedBrand = false;
      if (brand.length === 0 && name.length >= 2) {
        for (let i = 0; i + 1 < name.length; i++) {
          if (printed.has(name[i]) && printed.has(name[i + 1])) {
            nameHasPrintedBrand = true;
            break;
          }
        }
      }
      const score = shown + (brandShown ? 0.5 : 0) + (nameHasPrintedBrand ? 0.25 : 0);
      if (score >= 0.6) scored.push([product, score]);
    }
    return scored.sort((l, r) => (l[1] > r[1] ? -1 : r[1] > l[1] ? 1 : 0)).map((pair) => pair[0]);
  },

  /**
   * "Whey protein · Gold Standard" style name for a product read from its
   * label: the big print, in sentence case.
   */
  displayName(title: string): string {
    const cleaned = splitChars(title, isWhitespaceChar).slice(0, 6).join(" ");
    const first = graphemes(cleaned)[0];
    if (first === undefined) return "Product from the label";
    return first.toUpperCase() + dropFirstChars(cleaned).toLowerCase();
  },

  normalised(text: string): string {
    let out = foldingDiacritics(text.toLowerCase());
    out = replacingRegex(out, String.raw`(\d),(\d)`, "$1.$2");
    // OCR reads a "0" in "0 g" as the letter o.
    out = replacingRegex(out, String.raw`\bo\s*g\b`, "0 g");
    out = replacingRegex(out, String.raw`\s+`, " ");
    return trimmingWhitespaces(out);
  },
};
