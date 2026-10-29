import { Schedule } from "../Engine/Schedule";
import {
  asDouble,
  asInt,
  asObject,
  asString,
  base64,
  decodeArray,
  decodeDouble,
  decodeIfPresentDouble,
  decodeString,
  doubleDescription,
  graphemes,
  isNumberChar,
  jsonObject,
  keyedContainer,
  splitOn,
  swiftDouble,
  trimmingWhitespaces,
  trimmingWhitespacesAndNewlines,
  tryOptional,
  urlFromString,
} from "../Support/nutrition";
import { rounded, uuid } from "../Support/swift";
import { FoodProduct } from "./FoodSearch";
import { NutritionEntry, type Meal } from "./NutritionDay";

// MARK: - Barcode

/**
 * A product read from its barcode in Open Food Facts: the values per 100 g,
 * and the serving the packaging gives, when it gives one.
 */
export interface BarcodeProduct {
  barcode: string;
  product: FoodProduct;
  /** "30 g" on a box of cereal: the amount a portion starts at. */
  servingGrams?: number;
}

export const BarcodeProduct = {
  /**
   * Reads Open Food Facts' v2 product answer. Nil when the product is not
   * there, or has no energy value to log — a name alone is not a portion.
   */
  parse(data: string, a: { barcode: string }): BarcodeProduct | undefined {
    const barcode = a.barcode;
    const root = asObject(jsonObject(data));
    if (root === undefined) return undefined;
    if (!(asInt(root["status"]) === 1 || asString(root["status"]) === "success")) return undefined;
    const product = asObject(root["product"]);
    if (product === undefined) return undefined;
    const nutriments = asObject(product["nutriments"]);
    if (nutriments === undefined) return undefined;

    const number = (key: string): number | undefined => {
      const asDbl = asDouble(nutriments[key]);
      if (asDbl !== undefined) return asDbl;
      const text = asString(nutriments[key]);
      if (text !== undefined) return swiftDouble(text.replaceAll(",", "."));
      return undefined;
    };
    const kj = number("energy_100g");
    const kcal = number("energy-kcal_100g") ?? (kj === undefined ? undefined : kj / 4.184);
    if (kcal === undefined) return undefined;

    const name =
      [product["product_name_en"], product["product_name"], product["generic_name"]]
        .map((v) => asString(v))
        .filter((v): v is string => v !== undefined)
        .map(trimmingWhitespacesAndNewlines)
        .find((v) => v !== "") ?? `Product ${barcode}`;
    const brandPieces = splitOn(asString(product["brands"]) ?? "", ",");
    const brand = brandPieces.length > 0 ? trimmingWhitespaces(brandPieces[0]) : "";
    const image = asString(product["image_front_small_url"]) ?? asString(product["image_url"]);
    const serving = ((): number | undefined => {
      const value = asDouble(product["serving_quantity"]);
      if (value !== undefined && value > 0) return value;
      const text = asString(product["serving_quantity"]);
      if (text !== undefined) {
        const parsed = swiftDouble(text);
        if (parsed !== undefined && parsed > 0) return parsed;
      }
      return undefined;
    })();

    return {
      barcode,
      product: FoodProduct.make({
        id: `off-${barcode}`, name, brand,
        calories: rounded(kcal),
        protein: number("proteins_100g") ?? 0,
        carbs: number("carbohydrates_100g") ?? 0,
        fat: number("fat_100g") ?? 0,
        note: `Open Food Facts · barcode ${barcode}`,
        imageURL: image === undefined ? undefined : urlFromString(image),
      }),
      servingGrams: serving,
    };
  },

  lookupURL(barcode: string): string | undefined {
    const digits = graphemes(barcode).filter(isNumberChar).join("");
    if (digits === "") return undefined;
    return urlFromString(`https://world.openfoodfacts.org/api/v2/product/${digits}.json?fields=product_name,product_name_en,generic_name,brands,nutriments,image_front_small_url,image_url,serving_quantity`);
  },
};

// MARK: - Photo scan

export type ScannedFood_Confidence = "high" | "medium" | "low";

export const ScannedFood_Confidence = {
  high: "high" as ScannedFood_Confidence,
  medium: "medium" as ScannedFood_Confidence,
  low: "low" as ScannedFood_Confidence,
  allCases: ["high", "medium", "low"] as ScannedFood_Confidence[],
};

/**
 * One food the photo scan sees on the plate, with its estimated amount and
 * what that amount holds. The person checks the grams before it is logged.
 */
export interface ScannedFood {
  id: string;
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: ScannedFood_Confidence;
  /**
   * The table food it is, when it is one: what decides which questions
   * can make it more precise.
   */
  key?: string;
}

export const ScannedFood = {
  make(p: {
    name: string; grams: number; calories: number; protein: number; carbs: number; fat: number;
    confidence?: ScannedFood_Confidence; key?: string; id?: string;
  }): ScannedFood {
    return {
      id: p.id ?? uuid(),
      key: p.key,
      name: p.name,
      grams: p.grams,
      calories: p.calories,
      protein: p.protein,
      carbs: p.carbs,
      fat: p.fat,
      confidence: p.confidence ?? "medium",
    };
  },

  /** `init(from decoder:)`: CodingKeys name, grams, calories, protein, carbs, fat, confidence. */
  decode(json: unknown): ScannedFood {
    const container = keyedContainer(json);
    const confidence = tryOptional(() => {
      const raw = decodeString(container, "confidence");
      if (!(ScannedFood_Confidence.allCases as string[]).includes(raw)) throw new Error("dataCorrupted");
      return raw as ScannedFood_Confidence;
    });
    return ScannedFood.make({
      name: decodeString(container, "name"),
      grams: Math.max(1, decodeDouble(container, "grams")),
      calories: Math.max(0, decodeDouble(container, "calories")),
      protein: Math.max(0, decodeIfPresentDouble(container, "protein") ?? 0),
      carbs: Math.max(0, decodeIfPresentDouble(container, "carbs") ?? 0),
      fat: Math.max(0, decodeIfPresentDouble(container, "fat") ?? 0),
      confidence: confidence ?? "medium",
    });
  },

  /**
   * The same food at another amount; the values follow the grams. It
   * stays the same row: answers and other matches stay attached to it.
   */
  scaled(self: ScannedFood, a: { to: number }): ScannedFood {
    const newGrams = a.to;
    const factor = self.grams > 0 ? newGrams / self.grams : 1;
    return ScannedFood.make({
      name: self.name, grams: newGrams,
      calories: rounded(self.calories * factor),
      protein: rounded(self.protein * factor * 10) / 10,
      carbs: rounded(self.carbs * factor * 10) / 10,
      fat: rounded(self.fat * factor * 10) / 10,
      confidence: self.confidence, key: self.key, id: self.id,
    });
  },

  entry(self: ScannedFood, a: { id: string; on: Date; meal: Meal }): NutritionEntry {
    return NutritionEntry.make({
      id: a.id, date: Schedule.dateKey(a.on), meal: a.meal, name: self.name,
      calories: self.calories, protein: self.protein, carbs: self.carbs, fat: self.fat,
      amount: rounded(self.grams), unit: "g", loggedAt: new Date(),
    });
  },
};

export interface FoodScanAnswer_Question {
  text: string;
  options: string[];
}

export const FoodScanAnswer_Question = {
  /** Synthesized `Decodable`. */
  decode(json: unknown): FoodScanAnswer_Question {
    const container = keyedContainer(json);
    return {
      text: decodeString(container, "text"),
      options: decodeArray(container, "options", (v) => {
        if (typeof v !== "string") throw new Error("typeMismatch");
        return v;
      }),
    };
  },
};

/**
 * The scan's answer: what it saw, what Tally says about it, and the one
 * thing it would like to know (`/api/meal-scan`, `lib/meal-scan.ts`).
 */
export interface FoodScanAnswer {
  items: ScannedFood[];
  say: string;
  question?: FoodScanAnswer_Question;
}

export const FoodScanAnswer = {
  make(p: { items: ScannedFood[]; say?: string; question?: FoodScanAnswer_Question }): FoodScanAnswer {
    return { items: p.items, say: p.say ?? "", question: p.question };
  },

  /** `init(from decoder:)`: anything unreadable falls back, and a question needs two options. */
  decode(json: unknown): FoodScanAnswer {
    const container = keyedContainer(json);
    const items = tryOptional(() => decodeArray(container, "items", ScannedFood.decode)) ?? [];
    const say = tryOptional(() => decodeString(container, "say")) ?? "";
    const raw = tryOptional(() =>
      container["question"] === undefined || container["question"] === null
        ? undefined
        : FoodScanAnswer_Question.decode(container["question"]),
    );
    const question = raw !== undefined && raw.options.length >= 2 ? raw : undefined;
    return { items, say, question };
  },
};

export interface FoodScanRequest_Turn {
  role: string;
  text: string;
}

export const FoodScanRequest_Turn = {
  tally(text: string): FoodScanRequest_Turn { return { role: "assistant", text }; },
  user(text: string): FoodScanRequest_Turn { return { role: "user", text }; },
};

export interface FoodScanRequest_PlateItem {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: string;
}

/**
 * What the phone sends to the meal scan: the photo, what was said, and on a
 * follow-up the plate so far, so the answer is the whole plate again.
 */
export interface FoodScanRequest {
  image?: string;
  text?: string;
  plate?: FoodScanRequest_PlateItem[];
  turns?: FoodScanRequest_Turn[];
}

export const FoodScanRequest = {
  make(p: { imageJPEG: Uint8Array | undefined; text: string | undefined; plate?: ScannedFood[]; turns?: FoodScanRequest_Turn[] }): FoodScanRequest {
    const plate = p.plate ?? [];
    const turns = p.turns ?? [];
    return {
      image: p.imageJPEG === undefined ? undefined : base64(p.imageJPEG),
      text: p.text === "" ? undefined : p.text,
      plate: plate.length === 0 ? undefined : plate.map((f) => ({
        name: f.name, grams: f.grams, calories: f.calories, protein: f.protein,
        carbs: f.carbs, fat: f.fat, confidence: f.confidence,
      })),
      turns: turns.length === 0 ? undefined : turns,
    };
  },

  /** Synthesized `Encodable`: nil members are left out. */
  encode(self: FoodScanRequest): string {
    const object: Record<string, unknown> = {};
    if (self.image !== undefined) object["image"] = self.image;
    if (self.text !== undefined) object["text"] = self.text;
    if (self.plate !== undefined) object["plate"] = self.plate;
    if (self.turns !== undefined) object["turns"] = self.turns.map((t) => ({ role: t.role, text: t.text }));
    return JSON.stringify(object);
  },
};

// MARK: - Favorites

/** A food kept to log again in one tap, exactly as it was written. */
export interface FavoriteFood {
  name: string;
  amount?: number;
  unit?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const FavoriteFood = {
  id(self: FavoriteFood): string {
    return `${self.name.toLowerCase()}|${doubleDescription(self.amount ?? 0)}|${self.unit ?? ""}`;
  },

  /** `init(_ entry:)`. */
  make(entry: NutritionEntry): FavoriteFood {
    return {
      name: entry.name,
      amount: entry.amount,
      unit: entry.unit,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
    };
  },

  matches(self: FavoriteFood, entry: NutritionEntry): boolean {
    return FavoriteFood.id(self) === FavoriteFood.id(FavoriteFood.make(entry));
  },

  entry(self: FavoriteFood, a: { id: string; on: Date; meal: Meal }): NutritionEntry {
    return NutritionEntry.make({
      id: a.id, date: Schedule.dateKey(a.on), meal: a.meal, name: self.name,
      calories: self.calories, protein: self.protein, carbs: self.carbs, fat: self.fat,
      amount: self.amount, unit: self.unit, loggedAt: new Date(),
    });
  },

  /** "150 g" — or nothing, for an entry the web wrote without an amount. */
  portion(self: FavoriteFood): string | undefined {
    const amount = self.amount;
    if (amount === undefined || !(amount > 0)) return undefined;
    const number = amount === rounded(amount) ? String(Math.trunc(amount)) : doubleDescription(amount);
    return `${number} ${self.unit ?? "g"}`;
  },

  /** Synthesized `Encodable` (the app keeps favourites per account on the device). */
  encode(self: FavoriteFood): Record<string, unknown> {
    const object: Record<string, unknown> = { name: self.name };
    if (self.amount !== undefined) object["amount"] = self.amount;
    if (self.unit !== undefined) object["unit"] = self.unit;
    object["calories"] = self.calories;
    object["protein"] = self.protein;
    object["carbs"] = self.carbs;
    object["fat"] = self.fat;
    return object;
  },

  /** Synthesized `Decodable`. */
  decode(json: unknown): FavoriteFood {
    const container = keyedContainer(json);
    const unitValue = container["unit"];
    if (unitValue !== undefined && unitValue !== null && typeof unitValue !== "string") throw new Error("typeMismatch");
    return {
      name: decodeString(container, "name"),
      amount: decodeIfPresentDouble(container, "amount"),
      unit: unitValue === undefined || unitValue === null ? undefined : unitValue,
      calories: decodeDouble(container, "calories"),
      protein: decodeDouble(container, "protein"),
      carbs: decodeDouble(container, "carbs"),
      fat: decodeDouble(container, "fat"),
    };
  },
};
