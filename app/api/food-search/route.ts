import { getCurrentUser } from "@/app/auth/current-user";

export const dynamic = "force-dynamic";

type FoodResult = {
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

type GenericFood = Omit<FoodResult, "id" | "imageUrl" | "source" | "sourceNote"> & {
  aliases: string[];
};

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

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function numberOrZero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHENTICATED", message: "Log in om producten te zoeken." }, 401);

  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (query.length < 2) {
    return json({ error: "QUERY_TOO_SHORT", message: "Typ minstens twee tekens." }, 400);
  }

  const needle = normalized(query);
  const genericResults: FoodResult[] = GENERIC_FOODS
    .filter((food) => normalized([food.name, ...food.aliases].join(" ")).includes(needle))
    .slice(0, 5)
    .map((food, index) => ({
      id: `generic-${normalized(food.name).replace(/[^a-z0-9]+/g, "-")}-${index}`,
      name: food.name,
      brand: food.brand,
      imageUrl: "",
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      source: "Generiek",
      sourceNote: "Gemiddelde schatting per 100 g",
    }));

  const endpoint = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  endpoint.searchParams.set("search_terms", query);
  endpoint.searchParams.set("search_simple", "1");
  endpoint.searchParams.set("action", "process");
  endpoint.searchParams.set("json", "1");
  endpoint.searchParams.set("page_size", "15");
  endpoint.searchParams.set("lc", "nl");
  endpoint.searchParams.set("cc", "be");
  endpoint.searchParams.set("fields", "code,product_name,product_name_nl,brands,nutriments,image_front_small_url,countries_tags");

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "YaschaTraining/1.0 (private nutrition tracker; yascha-training.yaschat99.chatgpt.site)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Open Food Facts gaf status ${response.status}.`);

    const payload = (await response.json()) as {
      products?: Array<{
        code?: string;
        product_name?: string;
        product_name_nl?: string;
        brands?: string;
        image_front_small_url?: string;
        countries_tags?: string[];
        nutriments?: Record<string, unknown>;
      }>;
    };

    const products = (payload.products ?? [])
      .map((product): (FoodResult & { belgian: boolean }) | null => {
        const name = (product.product_name_nl || product.product_name || "").trim();
        const nutrients = product.nutriments ?? {};
        const calories = numberOrZero(nutrients["energy-kcal_100g"] ?? nutrients["energy-kcal"]);
        const protein = numberOrZero(nutrients.proteins_100g);
        const carbs = numberOrZero(nutrients.carbohydrates_100g);
        const fat = numberOrZero(nutrients.fat_100g);
        if (!name || calories <= 0 || calories > 1_200) return null;
        const belgian = (product.countries_tags ?? []).some((country) => /belg/i.test(country));
        return {
          id: `off-${product.code || normalized(name).replace(/[^a-z0-9]+/g, "-")}`,
          name,
          brand: (product.brands || "Merk onbekend").split(",")[0].trim(),
          imageUrl: product.image_front_small_url || "",
          calories,
          protein,
          carbs,
          fat,
          source: "Open Food Facts",
          sourceNote: belgian ? "Belgisch product · per 100 g" : "Waarden per 100 g",
          belgian,
        };
      })
      .filter((product): product is FoodResult & { belgian: boolean } => Boolean(product))
      .sort((a, b) => Number(b.belgian) - Number(a.belgian))
      .map((product): FoodResult => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        imageUrl: product.imageUrl,
        calories: product.calories,
        protein: product.protein,
        carbs: product.carbs,
        fat: product.fat,
        source: product.source,
        sourceNote: product.sourceNote,
      }));

    const seen = new Set<string>();
    const results = [...genericResults, ...products].filter((product) => {
      const key = normalized(`${product.name}-${product.brand}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 15);

    return json({ results, query, disclaimer: "Controleer verpakkingswaarden; Open Food Facts-data is community-beheerd." });
  } catch (error) {
    if (genericResults.length > 0) {
      return json({
        results: genericResults,
        query,
        partial: true,
        disclaimer: "Productdatabase tijdelijk niet bereikbaar; generieke schattingen getoond.",
      });
    }
    return json(
      { error: "FOOD_SEARCH_ERROR", message: error instanceof Error ? error.message : "Producten konden niet worden gezocht." },
      502,
    );
  }
}
