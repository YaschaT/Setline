import { Schedule } from "../Engine/Schedule";
import { rounded } from "../Support/swift";
import { Meal, NutritionEntry } from "./NutritionDay";

export interface Recipe_Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const Recipe_Macros = {
  make(calories: number, protein: number, carbs: number, fat: number): Recipe_Macros {
    return { calories, protein, carbs, fat };
  },
};

export interface Recipe_Ingredient {
  name: string;
  grams: number;
  /** How it is said in the list: "60 g", "3 eggs", "1 tbsp". */
  amount: string;
  per100: Recipe_Macros;
}

export const Recipe_Ingredient = {
  make(name: string, grams: number, amount: string | undefined, per100: Recipe_Macros): Recipe_Ingredient {
    return { name, grams, amount: amount ?? `${Math.trunc(grams)} g`, per100 };
  },
};

/**
 * High-protein recipes for each meal of the day, written for SETLINE: what
 * goes in, in grams, and how to make it in a few plain steps.
 *
 * Every number is worked out from the ingredients — the same USDA FoodData
 * Central values per 100 g the quick adds use — never typed in, so a recipe
 * and a logged portion of the same food always agree. Each recipe borrows
 * the photo of its main ingredient, so no new imagery has to be licensed.
 */
export interface Recipe {
  id: string;
  name: string;
  meal: Meal;
  minutes: number;
  /** One line on why it is in the list. */
  summary: string;
  ingredients: Recipe_Ingredient[];
  steps: string[];
  /** The main ingredient's photo. */
  imageName: string;
}

export const Recipe = {
  /** The whole recipe, one serving, rounded as the app rounds a portion. */
  macros(self: Recipe): Recipe_Macros {
    const sum = (value: (m: Recipe_Macros) => number) =>
      rounded(self.ingredients.reduce((total, i) => total + (value(i.per100) * i.grams) / 100, 0));
    return Recipe_Macros.make(sum((m) => m.calories), sum((m) => m.protein), sum((m) => m.carbs), sum((m) => m.fat));
  },

  grams(self: Recipe): number {
    return self.ingredients.reduce((total, i) => total + i.grams, 0);
  },

  /** What logging it writes: one entry, the recipe's name and totals. */
  entry(self: Recipe, a: { id: string; date: Date; meal?: Meal }): NutritionEntry {
    const m = Recipe.macros(self);
    return NutritionEntry.make({
      id: a.id,
      date: Schedule.dateKey(a.date),
      meal: a.meal ?? self.meal,
      name: self.name,
      calories: m.calories,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
      amount: rounded(Recipe.grams(self)),
      unit: "g",
      loggedAt: a.date,
    });
  },

  /** Swift `==`: the same recipe is the same id. */
  equals(lhs: Recipe, rhs: Recipe): boolean {
    return lhs.id === rhs.id;
  },
};

function recipe(r: Recipe): Recipe {
  return r;
}

// Per 100 g, rounded from USDA FoodData Central.
const oats = Recipe_Macros.make(389, 17, 66, 7);
const milk = Recipe_Macros.make(47, 3.4, 4.8, 1.6);
const whey = Recipe_Macros.make(400, 80, 8, 6);
const banana = Recipe_Macros.make(89, 1.1, 23, 0.3);
const blueberries = Recipe_Macros.make(57, 0.7, 14.5, 0.3);
const quark = Recipe_Macros.make(67, 12, 4, 0.2);
const honey = Recipe_Macros.make(304, 0.3, 82, 0);
const eggs = Recipe_Macros.make(143, 12.6, 0.7, 9.5);
const spinach = Recipe_Macros.make(23, 2.9, 3.6, 0.4);
const bread = Recipe_Macros.make(247, 13, 41, 3.4);
const oliveOil = Recipe_Macros.make(884, 0, 0, 100);
const chicken = Recipe_Macros.make(165, 31, 0, 3.6);
const rice = Recipe_Macros.make(130, 2.7, 28, 0.3);
const broccoli = Recipe_Macros.make(34, 2.8, 7, 0.4);
const soySauce = Recipe_Macros.make(53, 8, 4.9, 0.6);
const tuna = Recipe_Macros.make(116, 26, 0, 1);
const wrap = Recipe_Macros.make(300, 9, 50, 7);
const avocado = Recipe_Macros.make(160, 2, 8.5, 14.7);
const tomatoes = Recipe_Macros.make(18, 0.9, 3.9, 0.2);
const yogurt = Recipe_Macros.make(59, 10, 3.6, 0.4);
const lentils = Recipe_Macros.make(116, 9, 20, 0.4);
const feta = Recipe_Macros.make(264, 14, 4, 21);
const cucumber = Recipe_Macros.make(15, 0.7, 3.6, 0.1);
const salmon = Recipe_Macros.make(208, 20, 0, 13);
const sweetPotato = Recipe_Macros.make(86, 1.6, 20, 0.1);
const pasta = Recipe_Macros.make(348, 14, 71, 2.5);
const beef = Recipe_Macros.make(137, 21, 0, 5.5);
const passata = Recipe_Macros.make(30, 1.4, 5.5, 0.2);
const tofu = Recipe_Macros.make(144, 17.3, 2.8, 8.7);
const cottage = Recipe_Macros.make(81, 10.5, 4.8, 2.3);
const apple = Recipe_Macros.make(52, 0.3, 14, 0.2);
const cinnamon = Recipe_Macros.make(247, 4, 81, 1.2);
const peanutButter = Recipe_Macros.make(588, 25, 20, 50);
const turkey = Recipe_Macros.make(135, 30, 0, 1);

const all = [
    // Breakfast
    recipe({ id: "protein-oats", name: "Protein oats", meal: Meal.ontbijt, minutes: 10,
           summary: "Slow carbs and a protein-heavy start to the day.",
           ingredients: [
               Recipe_Ingredient.make("Oats", 60, undefined, oats), Recipe_Ingredient.make("Semi-skimmed milk", 250, "250 ml", milk),
               Recipe_Ingredient.make("Whey protein", 30, "1 scoop", whey), Recipe_Ingredient.make("Banana", 60, "½ banana", banana),
               Recipe_Ingredient.make("Blueberries", 50, undefined, blueberries),
           ],
           steps: [
               "Bring the oats and milk to a gentle simmer and stir for 4–5 minutes until thick.",
               "Take the pan off the heat and stir in the whey until smooth — off the heat, so it does not clump.",
               "Slice the banana over the top and add the blueberries.",
           ],
           imageName: "FoodOats" }),
    recipe({ id: "quark-bowl", name: "Quark berry bowl", meal: Meal.ontbijt, minutes: 5,
           summary: "No cooking, done in five minutes.",
           ingredients: [
               Recipe_Ingredient.make("Quark", 250, undefined, quark), Recipe_Ingredient.make("Blueberries", 100, undefined, blueberries),
               Recipe_Ingredient.make("Oats", 30, undefined, oats), Recipe_Ingredient.make("Honey", 10, "2 tsp", honey),
           ],
           steps: [
               "Spoon the quark into a bowl and stir it until creamy.",
               "Top with the blueberries and scatter the oats over for crunch.",
               "Drizzle with the honey.",
           ],
           imageName: "FoodQuark" }),
    recipe({ id: "spinach-scramble", name: "Spinach scramble on toast", meal: Meal.ontbijt, minutes: 10,
           summary: "Three eggs, greens and wholegrain bread.",
           ingredients: [
               Recipe_Ingredient.make("Eggs", 150, "3 eggs", eggs), Recipe_Ingredient.make("Spinach", 50, "2 handfuls", spinach),
               Recipe_Ingredient.make("Wholegrain bread", 70, "2 slices", bread), Recipe_Ingredient.make("Olive oil", 5, "1 tsp", oliveOil),
           ],
           steps: [
               "Toast the bread.",
               "Warm the oil in a pan over medium heat and wilt the spinach for a minute.",
               "Whisk the eggs with a pinch of salt, pour them in and stir slowly until just set.",
               "Pile onto the toast and finish with black pepper.",
           ],
           imageName: "FoodEggs" }),

    // Lunch
    recipe({ id: "chicken-rice-bowl", name: "Chicken rice bowl", meal: Meal.lunch, minutes: 20,
           summary: "The classic: lean protein, rice and greens.",
           ingredients: [
               Recipe_Ingredient.make("Chicken breast", 150, undefined, chicken), Recipe_Ingredient.make("Rice, cooked", 200, undefined, rice),
               Recipe_Ingredient.make("Broccoli", 100, undefined, broccoli), Recipe_Ingredient.make("Soy sauce", 10, "2 tsp", soySauce),
               Recipe_Ingredient.make("Olive oil", 5, "1 tsp", oliveOil),
           ],
           steps: [
               "Cut the chicken into strips and season with salt and pepper.",
               "Fry in the oil over medium-high heat for 6–7 minutes, turning, until cooked through.",
               "Steam or boil the broccoli for 4 minutes.",
               "Fill a bowl with the rice, add the chicken and broccoli, and pour over the soy sauce.",
           ],
           imageName: "FoodChicken" }),
    recipe({ id: "tuna-avocado-wrap", name: "Tuna avocado wrap", meal: Meal.lunch, minutes: 10,
           summary: "Pantry protein, ready in ten minutes.",
           ingredients: [
               Recipe_Ingredient.make("Tuna", 120, "1 can", tuna), Recipe_Ingredient.make("Wholewheat wrap", 60, "1 wrap", wrap),
               Recipe_Ingredient.make("Avocado", 50, "⅓ avocado", avocado), Recipe_Ingredient.make("Cherry tomatoes", 60, "5 tomatoes", tomatoes),
               Recipe_Ingredient.make("Greek yogurt", 30, "2 tbsp", yogurt),
           ],
           steps: [
               "Drain the tuna and mix it with the yogurt, salt and pepper.",
               "Mash the avocado and spread it over the wrap.",
               "Add the tuna and the halved tomatoes, then roll it up tightly and cut in two.",
           ],
           imageName: "FoodTuna" }),
    recipe({ id: "lentil-feta-salad", name: "Lentil feta salad", meal: Meal.lunch, minutes: 15,
           summary: "Plant protein and fibre that keeps you full.",
           ingredients: [
               Recipe_Ingredient.make("Lentils, cooked", 200, undefined, lentils), Recipe_Ingredient.make("Feta", 40, undefined, feta),
               Recipe_Ingredient.make("Cucumber", 100, "⅓ cucumber", cucumber), Recipe_Ingredient.make("Cherry tomatoes", 80, undefined, tomatoes),
               Recipe_Ingredient.make("Spinach", 30, "1 handful", spinach), Recipe_Ingredient.make("Olive oil", 10, "2 tsp", oliveOil),
           ],
           steps: [
               "Rinse and drain the lentils.",
               "Dice the cucumber and halve the tomatoes.",
               "Toss everything with the spinach, the oil and a squeeze of lemon.",
               "Crumble the feta over the top.",
           ],
           imageName: "FoodLentils" }),

    // Dinner
    recipe({ id: "salmon-tray", name: "Salmon sweet potato tray", meal: Meal.avondeten, minutes: 30,
           summary: "One tray, omega-3s and slow carbs.",
           ingredients: [
               Recipe_Ingredient.make("Salmon", 150, "1 fillet", salmon), Recipe_Ingredient.make("Sweet potato", 250, "1 medium", sweetPotato),
               Recipe_Ingredient.make("Broccoli", 150, undefined, broccoli), Recipe_Ingredient.make("Olive oil", 10, "2 tsp", oliveOil),
           ],
           steps: [
               "Heat the oven to 200 °C.",
               "Cut the sweet potato into wedges, toss with half the oil and roast for 15 minutes.",
               "Add the salmon and the broccoli, drizzle with the rest of the oil and season.",
               "Roast 12 minutes more, until the salmon flakes.",
           ],
           imageName: "FoodSalmon" }),
    recipe({ id: "beef-pasta", name: "Lean beef pasta", meal: Meal.avondeten, minutes: 25,
           summary: "Comfort food, built around lean protein.",
           ingredients: [
               Recipe_Ingredient.make("Wholewheat pasta, dry", 90, undefined, pasta), Recipe_Ingredient.make("Lean beef mince", 125, undefined, beef),
               Recipe_Ingredient.make("Passata", 200, "200 ml", passata), Recipe_Ingredient.make("Spinach", 40, "1 handful", spinach),
           ],
           steps: [
               "Cook the pasta in salted water as the pack says.",
               "Brown the mince in a dry pan over high heat, breaking it up, for 5 minutes.",
               "Add the passata, season, and simmer for 10 minutes.",
               "Stir the spinach through until wilted, then toss with the drained pasta.",
           ],
           imageName: "FoodPasta" }),
    recipe({ id: "tofu-stir-fry", name: "Tofu stir-fry", meal: Meal.avondeten, minutes: 20,
           summary: "Fully plant-based and protein-rich.",
           ingredients: [
               Recipe_Ingredient.make("Tofu, firm", 200, undefined, tofu), Recipe_Ingredient.make("Rice, cooked", 180, undefined, rice),
               Recipe_Ingredient.make("Broccoli", 120, undefined, broccoli), Recipe_Ingredient.make("Soy sauce", 15, "1 tbsp", soySauce),
               Recipe_Ingredient.make("Olive oil", 10, "2 tsp", oliveOil),
           ],
           steps: [
               "Press the tofu dry with a towel and cut it into cubes.",
               "Fry in the oil over high heat for 8 minutes until golden on all sides.",
               "Add the broccoli and a splash of water, cover, and steam for 3 minutes.",
               "Stir in the soy sauce and serve over the rice.",
           ],
           imageName: "FoodTofu" }),

    // Snacks
    recipe({ id: "cottage-apple", name: "Cottage cheese & apple", meal: Meal.snack, minutes: 2,
           summary: "Sweet, crunchy, and slow-digesting protein.",
           ingredients: [
               Recipe_Ingredient.make("Cottage cheese", 200, undefined, cottage), Recipe_Ingredient.make("Apple", 150, "1 small apple", apple),
               Recipe_Ingredient.make("Cinnamon", 1, "a pinch", cinnamon),
           ],
           steps: [
               "Dice the apple.",
               "Spoon over the cottage cheese and dust with cinnamon.",
           ],
           imageName: "FoodCottage" }),
    recipe({ id: "peanut-yogurt", name: "Peanut yogurt bowl", meal: Meal.snack, minutes: 3,
           summary: "Creamy and filling between meals.",
           ingredients: [
               Recipe_Ingredient.make("Greek yogurt", 200, undefined, yogurt), Recipe_Ingredient.make("Peanut butter", 15, "1 tbsp", peanutButter),
               Recipe_Ingredient.make("Blueberries", 60, undefined, blueberries),
           ],
           steps: [
               "Stir the peanut butter loosely through the yogurt, leaving ribbons.",
               "Top with the blueberries.",
           ],
           imageName: "FoodYogurt" }),
    recipe({ id: "turkey-avocado-toast", name: "Turkey avocado toast", meal: Meal.snack, minutes: 5,
           summary: "A savoury snack between meals.",
           ingredients: [
               Recipe_Ingredient.make("Wholegrain bread", 35, "1 slice", bread), Recipe_Ingredient.make("Turkey breast", 60, "3 slices", turkey),
               Recipe_Ingredient.make("Avocado", 30, "¼ avocado", avocado),
           ],
           steps: [
               "Toast the bread and spread the avocado over it.",
               "Lay the turkey on top and finish with pepper and a little salt.",
           ],
           imageName: "FoodTurkey" }),
] as Recipe[];

export const Recipes = {
  all,

  /** Photos only recipes use, credited beside the quick adds' own. */
  photoCredits: [
    { name: "Lean beef pasta", credit: "HaJunkiyada · CC BY-SA 4.0 · Wikimedia Commons" },
  ] as { name: string; credit: string }[],

  /** The recipes for one meal. Pre-workout borrows the snacks. */
  for(meal: Meal): Recipe[] {
    const wanted: Meal = meal === Meal.preWorkout ? Meal.snack : meal;
    return all.filter((r) => r.meal === wanted);
  },
};
