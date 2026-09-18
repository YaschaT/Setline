/**
 * Looking a product up, once, for every client.
 *
 * The table, the query, the filtering and the ordering live here and nowhere
 * else: the Cloudflare route, the Vercel function and the iOS app all reach
 * this same code path through one endpoint, so the same query cannot give two
 * different answers depending on where it was typed.
 */

export type FoodResult = {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "Open Food Facts" | "Generiek";
  sourceNote: string;
};

export type FoodSearchOutcome =
  | { ok: true; status: 200; body: { results: FoodResult[]; query: string; partial?: true; disclaimer: string } }
  | { ok: false; status: 400 | 502; body: { error: string; message: string } };

type GenericFood = Omit<FoodResult, "id" | "imageUrl" | "source" | "sourceNote"> & {
  aliases: string[];
};

export const SHORTEST_QUERY = 2;
export const MAX_RESULTS = 15;

const GENERIC_FOODS: GenericFood[] = [
  { name: "Banaan", brand: "Generiek", calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, aliases: ["banana", "fruit"] },
  { name: "Havermout", brand: "Generiek", calories: 379, protein: 13.2, carbs: 67.7, fat: 6.5, aliases: ["oats", "oatmeal"] },
  { name: "Witte rijst, gekookt", brand: "Generiek", calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3, aliases: ["rijst", "rice"] },
  { name: "Aardappelen, gekookt", brand: "Generiek", calories: 87, protein: 1.9, carbs: 20.1, fat: 0.1, aliases: ["aardappel", "potato"] },
  { name: "Kipfilet, bereid", brand: "Generiek", calories: 165, protein: 31, carbs: 0, fat: 3.6, aliases: ["kip", "chicken"] },
  { name: "Zalm, bereid", brand: "Generiek", calories: 206, protein: 22, carbs: 0, fat: 12, aliases: ["salmon", "vis"] },
  { name: "Volkorenbrood", brand: "Generiek", calories: 247, protein: 13, carbs: 41, fat: 3.4, aliases: ["brood", "bread"] },
  { name: "Ei, heel", brand: "Generiek", calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, aliases: ["eieren", "egg"] },
  { name: "Magere skyr", brand: "Generiek", calories: 63, protein: 11, carbs: 3.8, fat: 0.2, aliases: ["kwark", "yoghurt"] },
  { name: "Halfvolle melk", brand: "Generiek", calories: 47, protein: 3.5, carbs: 4.8, fat: 1.5, aliases: ["milk"] },
  { name: "Olijfolie", brand: "Generiek", calories: 884, protein: 0, carbs: 0, fat: 100, aliases: ["olie", "olive oil"] },
  { name: "Rice crispies", brand: "Generiek", calories: 382, protein: 6.3, carbs: 87, fat: 1, aliases: ["rice krispies", "ontbijtgranen", "cereal"] },
];

export const DISCLAIMER = "Controleer verpakkingswaarden; Open Food Facts-data is community-beheerd.";
const PARTIAL_DISCLAIMER = "Productdatabase tijdelijk niet bereikbaar; generieke schattingen getoond.";

export function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function slug(value: string) {
  return normalized(value).replace(/[^a-z0-9]+/g, "-");
}

function numberOrZero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function genericMatches(query: string): FoodResult[] {
  const needle = normalized(query);
  if (needle.length < SHORTEST_QUERY) return [];
  return GENERIC_FOODS
    .filter((food) => normalized([food.name, ...food.aliases].join(" ")).includes(needle))
    .slice(0, 5)
    .map((food, index) => ({
      id: `generic-${slug(food.name)}-${index}`,
      name: food.name,
      brand: food.brand,
      imageUrl: "",
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      source: "Generiek" as const,
      sourceNote: "Gemiddelde schatting per 100 g",
    }));
}

/**
 * Open Food Facts' current search. Its predecessor, `/cgi/search.pl`, answers
 * 503 and the v2 endpoint ignores the search term and returns whatever is
 * popular, so neither can be asked what a word means.
 */
export function endpointFor(query: string) {
  const endpoint = new URL("https://search.openfoodfacts.org/search");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("page_size", String(MAX_RESULTS));
  endpoint.searchParams.set("lang", "nl");
  endpoint.searchParams.set(
    "fields",
    "code,product_name,product_name_nl,brands,nutriments,image_front_small_url,countries_tags",
  );
  return endpoint;
}

type Hit = {
  code?: string;
  product_name?: string | null;
  product_name_nl?: string | null;
  /** An array on the search index, a comma-joined string on the older APIs. */
  brands?: string[] | string | null;
  image_front_small_url?: string | null;
  countries_tags?: string[];
  nutriments?: Record<string, unknown>;
};

type Payload = { hits?: Hit[]; products?: Hit[] };

function firstBrand(brands: Hit["brands"]) {
  const value = Array.isArray(brands) ? brands[0] : brands?.split(",")[0];
  return value?.trim() || "Merk onbekend";
}

/** Belgian products first; anything nameless or implausibly dense is dropped. */
export function productsFrom(payload: Payload): FoodResult[] {
  return (payload.hits ?? payload.products ?? [])
    .map((product): (FoodResult & { belgian: boolean }) | null => {
      const name = (product.product_name_nl || product.product_name || "").trim();
      const nutrients = product.nutriments ?? {};
      const calories = numberOrZero(nutrients["energy-kcal_100g"] ?? nutrients["energy-kcal"]);
      if (!name || calories <= 0 || calories > 1_200) return null;
      const belgian = (product.countries_tags ?? []).some((country) => /belg/i.test(country));
      return {
        id: `off-${product.code || slug(name)}`,
        name,
        brand: firstBrand(product.brands),
        imageUrl: product.image_front_small_url || "",
        calories,
        protein: numberOrZero(nutrients.proteins_100g),
        carbs: numberOrZero(nutrients.carbohydrates_100g),
        fat: numberOrZero(nutrients.fat_100g),
        source: "Open Food Facts",
        sourceNote: belgian ? "Belgisch product · per 100 g" : "Waarden per 100 g",
        belgian,
      };
    })
    .filter((product): product is FoodResult & { belgian: boolean } => Boolean(product))
    .sort((a, b) => Number(b.belgian) - Number(a.belgian))
    .map(({ belgian: _belgian, ...product }) => product);
}

export function merge(generic: FoodResult[], products: FoodResult[]): FoodResult[] {
  const seen = new Set<string>();
  return [...generic, ...products]
    .filter((product) => {
      const key = normalized(`${product.name}-${product.brand}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_RESULTS);
}

/**
 * The whole search, minus authorisation and minus the framework: every caller
 * hands in its own `fetch` and gets back exactly what it should send.
 */
export async function searchFood(
  rawQuery: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<FoodSearchOutcome> {
  const query = rawQuery?.trim().slice(0, 80) ?? "";
  if (query.length < SHORTEST_QUERY) {
    return { ok: false, status: 400, body: { error: "QUERY_TOO_SHORT", message: "Typ minstens twee tekens." } };
  }

  const generic = genericMatches(query);

  try {
    const response = await fetchImpl(endpointFor(query), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Setline/1.0 (privé trainingslogboek; setline.be)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Open Food Facts gaf status ${response.status}.`);

    const results = merge(generic, productsFrom((await response.json()) as Payload));
    return { ok: true, status: 200, body: { results, query, disclaimer: DISCLAIMER } };
  } catch (error) {
    if (generic.length > 0) {
      return { ok: true, status: 200, body: { results: generic, query, partial: true, disclaimer: PARTIAL_DISCLAIMER } };
    }
    return {
      ok: false,
      status: 502,
      body: {
        error: "FOOD_SEARCH_ERROR",
        message: error instanceof Error ? error.message : "Producten konden niet worden gezocht.",
      },
    };
  }
}
