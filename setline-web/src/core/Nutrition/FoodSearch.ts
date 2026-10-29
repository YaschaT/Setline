import type { AuthSession } from "../Sync/AuthSession";
import { AuthFailure } from "../Sync/AuthSession";
import type { AuthSessionCoordinator } from "../Sync/AuthSessionCoordinator";
import {
  decodeArray,
  decodeDouble,
  decodeIfPresentBool,
  decodeIfPresentString,
  decodeJSON,
  decodeString,
  keyedContainer,
  prefixChars,
  queryString,
  trimmingWhitespacesAndNewlines,
  tryOptional,
  urlFromString,
  charCount,
} from "../Support/nutrition";
import { rounded } from "../Support/swift";

/** A product as a food database describes it: values per 100 g. */
export interface FoodProduct {
  id: string;
  name: string;
  brand: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /**
   * The line under the name: where the numbers came from, in the server's
   * own words.
   */
  note: string;
  /**
   * The product's front photo from Open Food Facts, when it has one. The
   * generic table has none. (A Swift `URL`, kept as its absolute string.)
   */
  imageURL?: string;
}

export const FoodProduct = {
  /** `init(from decoder:)` — CodingKeys `sourceNote` and `imageUrl`. */
  decode(json: unknown): FoodProduct {
    const container = keyedContainer(json);
    const id = decodeString(container, "id");
    const name = decodeString(container, "name");
    const brand = decodeIfPresentString(container, "brand") ?? "";
    const calories = decodeDouble(container, "calories");
    const protein = decodeDouble(container, "protein");
    const carbs = decodeDouble(container, "carbs");
    const fat = decodeDouble(container, "fat");
    const note = decodeIfPresentString(container, "sourceNote") ?? "";
    const image = decodeIfPresentString(container, "imageUrl") ?? "";
    const imageURL = image === "" ? undefined : urlFromString(image);
    return { id, name, brand, calories, protein, carbs, fat, note, imageURL };
  },

  make(p: {
    id: string; name: string; brand: string;
    calories: number; protein: number; carbs: number; fat: number;
    note: string; imageURL?: string;
  }): FoodProduct {
    return {
      id: p.id, name: p.name, brand: p.brand,
      calories: p.calories, protein: p.protein, carbs: p.carbs, fat: p.fat,
      note: p.note, imageURL: p.imageURL,
    };
  },
};

/**
 * What one search comes to on screen. When there is nothing to show, the
 * reason is said in plain words and the screen offers to fill the values in
 * by hand; no result is ever made up on this side.
 */
export type FoodSearchOutcome =
  | { kind: "found"; value: FoodProduct[] }
  /**
   * Answered, but only from the generic table — Open Food Facts was out
   * of reach at the far end.
   */
  | { kind: "partial"; value: FoodProduct[]; note: string }
  | { kind: "failed"; value: string };

export const FoodSearchOutcome = {
  found(products: FoodProduct[]): FoodSearchOutcome { return { kind: "found", value: products }; },
  partial(products: FoodProduct[], a: { note: string }): FoodSearchOutcome { return { kind: "partial", value: products, note: a.note }; },
  failed(message: string): FoodSearchOutcome { return { kind: "failed", value: message }; },
};

/** The screen's words when a search has nothing to show. */
export const FoodSearch_Message = {
  tooShort: "Type at least two characters.",
  unreachable: "Search didn't work. Enter the values yourself.",
  signIn: "Sign in again to search for products.",
  partial: "Product database temporarily unavailable; showing generic estimates.",

  nothingFound(query: string): string {
    return `Nothing found for ${query}. Enter the values yourself.`;
  },
};

interface FoodSearch_Answer {
  results: FoodProduct[];
  partial?: boolean;
}

function decodeAnswer(data: string): FoodSearch_Answer {
  const container = keyedContainer(decodeJSON(data));
  return {
    results: decodeArray(container, "results", FoodProduct.decode),
    partial: decodeIfPresentBool(container, "partial"),
  };
}

function decodeFailure(data: string): { message: string } {
  const container = keyedContainer(decodeJSON(data));
  return { message: decodeString(container, "message") };
}

/**
 * What the app does with a search, which is deliberately almost nothing.
 *
 * The table, the query to Open Food Facts, the filtering and the ordering all
 * live on the server (`lib/food-search.ts`), behind one endpoint both clients
 * call. This app sends a query and shows the answer in the order it arrives;
 * it has no opinion of its own to disagree with the web app's.
 */
export const FoodSearch = {
  shortestQuery: 2,

  /**
   * Asks the shared search as this account, with a token that is good for it.
   *
   * The token comes from `auth`, the coordinator every sync request goes
   * through, so one that has expired — or is about to — is refreshed
   * before the search is sent. Handing the search the stored token as it
   * was meant that an hour after the last sync every search failed with
   * "meld je opnieuw aan", while the account was signed in and syncing.
   *
   * A search the server still turns down does not mark the session
   * expired. The endpoint answers 401 whenever it cannot confirm the token
   * with Supabase — its own trouble reaching Supabase included — so only
   * sync, which asks Supabase directly, decides that signing in is due.
   */
  async search(
    query: string,
    a: {
      auth: AuthSessionCoordinator;
      send: (path: string, accessToken: string) => Promise<{ status: number; data: string }>;
    },
  ): Promise<FoodSearchOutcome> {
    const trimmed = trimmingWhitespacesAndNewlines(query);
    if (charCount(trimmed) < FoodSearch.shortestQuery) return FoodSearchOutcome.failed(FoodSearch_Message.tooShort);

    let session: AuthSession;
    try {
      session = await a.auth.validSession();
    } catch (error) {
      if (error instanceof AuthFailure && error.kind === "expired") return FoodSearchOutcome.failed(FoodSearch_Message.signIn);
      return FoodSearchOutcome.failed(FoodSearch_Message.unreachable);
    }

    try {
      const { status, data } = await a.send(FoodSearch.path({ for: trimmed }), session.accessToken);
      return FoodSearch.outcome({ status, data, query: trimmed });
    } catch {
      return FoodSearchOutcome.failed(FoodSearch_Message.unreachable);
    }
  },

  /**
   * What an answer means for the screen: the products, in the order the
   * server ranked them, or why there are none.
   */
  outcome(a: { status: number; data: string; query: string }): FoodSearchOutcome {
    if (!(a.status >= 200 && a.status < 300)) {
      // A refused token is the session's business, and a server error
      // carries the server's own technical words; neither is something
      // to read out here. A plain request error keeps its message.
      if (a.status === 401 || a.status >= 500) return FoodSearchOutcome.failed(FoodSearch_Message.unreachable);
      return FoodSearchOutcome.failed(FoodSearch.message({ from: a.data }) ?? FoodSearch_Message.unreachable);
    }
    const products = tryOptional(() => FoodSearch.results({ from: a.data }));
    if (products === undefined) return FoodSearchOutcome.failed(FoodSearch_Message.unreachable);
    if (products.length === 0) return FoodSearchOutcome.failed(FoodSearch_Message.nothingFound(a.query));
    return FoodSearch.isPartial(a.data)
      ? FoodSearchOutcome.partial(products, { note: FoodSearch_Message.partial })
      : FoodSearchOutcome.found(products);
  },

  path(a: { for: string }): string {
    return `/api/food-search?${queryString([{ name: "q", value: prefixChars(a.for, 80) }])}`;
  },

  /** The products, in the order the server ranked them. */
  results(a: { from: string }): FoodProduct[] {
    return decodeAnswer(a.from).results;
  },

  /** Whether the server could only offer its generic estimates. */
  isPartial(data: string): boolean {
    return tryOptional(() => decodeAnswer(data))?.partial ?? false;
  },

  message(a: { from: string }): string | undefined {
    return tryOptional(() => decodeFailure(a.from))?.message;
  },

  /**
   * What a portion of it is worth. This is the entry form's arithmetic, the
   * same rounding the web app's own form does, and not part of the search.
   */
  portion(a: { of: FoodProduct; grams: number }): NutritionDraft {
    const product = a.of;
    const grams = a.grams;
    const factor = Math.max(0, grams) / 100;
    const macro = (value: number) => rounded(value * factor * 10) / 10;
    return NutritionDraft.make({
      // The name is the food; how much of it is its own field. 42a draws
      // them apart ("Havermout · 100 g") and 42d changes the amount
      // afterwards, which needs the number kept as a number.
      name: product.name,
      calories: grams > 0 ? rounded(product.calories * factor) : 0,
      protein: macro(product.protein),
      carbs: macro(product.carbs),
      fat: macro(product.fat),
      amount: grams > 0 ? grams : undefined,
      unit: grams > 0 ? "g" : undefined,
    });
  },
};

/** What a chosen product puts in the form, before anyone edits it. */
export interface NutritionDraft {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /**
   * How much of it these numbers are worth, kept so the amount can be
   * changed later and the macros follow it.
   */
  amount?: number;
  unit?: string;
}

export const NutritionDraft = {
  make(p: { name: string; calories: number; protein: number; carbs: number; fat: number; amount?: number; unit?: string }): NutritionDraft {
    return { name: p.name, calories: p.calories, protein: p.protein, carbs: p.carbs, fat: p.fat, amount: p.amount, unit: p.unit };
  },
};
