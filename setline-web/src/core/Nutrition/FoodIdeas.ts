import { Schedule } from "../Engine/Schedule";
import { rounded } from "../Support/swift";
import { NutritionEntry, type Meal } from "./NutritionDay";

/**
 * Everyday foods to log in one tap, with a portion people actually eat.
 *
 * Values per 100 g are rounded from standard nutrition tables (USDA
 * FoodData Central); the photos are free-licence images, credited in Account. They are suggestions, not products: a logged idea says "per
 * portion" and can be changed on its row like anything else.
 */
export interface FoodIdea {
  id: string;
  name: string;
  grams: number;
  /** How the portion is said: "150 g", "2 eggs". */
  portion: string;
  per100: { calories: number; protein: number; carbs: number; fat: number };
  /**
   * The bundled photo: a free-licence image from Wikimedia Commons or
   * Openverse, square-cropped so every card matches.
   */
  imageName: string;
  /** Who made the photo and under which licence, for the credits screen. */
  credit: string;
}

export const FoodIdea = {
  calories(self: FoodIdea): number { return rounded((self.per100.calories * self.grams) / 100); },
  protein(self: FoodIdea): number { return rounded((self.per100.protein * self.grams) / 100); },
  carbs(self: FoodIdea): number { return rounded((self.per100.carbs * self.grams) / 100); },
  fat(self: FoodIdea): number { return rounded((self.per100.fat * self.grams) / 100); },

  /** Swift `==`: the same idea is the same id. */
  equals(lhs: FoodIdea, rhs: FoodIdea): boolean {
    return lhs.id === rhs.id;
  },

  /** The entry a tap logs, on `date`'s day, for `meal`. */
  entry(self: FoodIdea, a: { id: string; date: Date; meal: Meal }): NutritionEntry {
    return NutritionEntry.make({
      id: a.id,
      date: Schedule.dateKey(a.date),
      meal: a.meal,
      name: self.name,
      calories: FoodIdea.calories(self),
      protein: FoodIdea.protein(self),
      carbs: FoodIdea.carbs(self),
      fat: FoodIdea.fat(self),
      amount: self.grams,
      unit: "g",
      loggedAt: a.date,
    });
  },
};

function idea(
  id: string, name: string, grams: number, portion: string,
  per100: [number, number, number, number], imageName: string, credit: string,
): FoodIdea {
  return {
    id, name, grams, portion,
    per100: { calories: per100[0], protein: per100[1], carbs: per100[2], fat: per100[3] },
    imageName, credit,
  };
}

export const FoodIdeas = {
  all: [
    idea("chicken", "Chicken breast", 150, "150 g",
      [165, 31, 0, 3.6], "FoodChicken",
      "Farhan Tahir · CC BY 3.0 · Wikimedia Commons"),
    idea("yogurt", "Greek yogurt", 250, "250 g",
      [59, 10, 3.6, 0.4], "FoodYogurt",
      "U.S. Department of Agriculture · CC0 · rawpixel"),
    idea("eggs", "Eggs", 100, "2 eggs",
      [143, 12.6, 0.7, 9.5], "FoodEggs",
      "Boiled Egg – Crossection · CC BY-SA 2.0 · Wikimedia Commons"),
    idea("tuna", "Tuna", 120, "1 can",
      [116, 26, 0, 1], "FoodTuna",
      "jetaime · CC BY-SA 2.0 · Flickr"),
    idea("salmon", "Salmon", 150, "150 g",
      [208, 20, 0, 13], "FoodSalmon",
      "f097653195017 · CC BY-SA 2.0 · Flickr"),
    idea("oats", "Oats", 60, "60 g",
      [389, 17, 66, 7], "FoodOats",
      "USDA · Public domain · Flickr"),
    idea("rice", "Rice, cooked", 200, "200 g",
      [130, 2.7, 28, 0.3], "FoodRice",
      "Douglas P. Perkins · CC0 · Wikimedia Commons"),
    idea("banana", "Banana", 120, "1 banana",
      [89, 1.1, 23, 0.3], "FoodBanana",
      "Filo gèn' · CC BY-SA 4.0 · Wikimedia Commons"),
    idea("cottage", "Cottage cheese", 200, "200 g",
      [81, 10.5, 4.8, 2.3], "FoodCottage",
      "Валентина Тимків · CC BY-SA 4.0 · Wikimedia Commons"),
    idea("quark", "Quark", 250, "250 g",
      [67, 12, 4, 0.2], "FoodQuark",
      "SKopp · CC BY-SA 4.0 · Wikimedia Commons"),
    idea("turkey", "Turkey breast", 150, "150 g",
      [135, 30, 0, 1], "FoodTurkey",
      "Missvain (Sarah Stierch) · CC BY 4.0 · Wikimedia Commons"),
    idea("shake", "Protein shake", 30, "1 scoop",
      [400, 80, 8, 6], "FoodShake",
      "Sandstein · CC BY 3.0 · Wikimedia Commons"),
    idea("tofu", "Tofu", 150, "150 g",
      [144, 17.3, 2.8, 8.7], "FoodTofu",
      "DryPot · CC BY-SA 3.0 · Wikimedia Commons"),
    idea("lentils", "Lentils, cooked", 200, "200 g",
      [116, 9, 20, 0.4], "FoodLentils",
      "HaJunkiyada · CC BY-SA 4.0 · Wikimedia Commons"),
    idea("bread", "Wholegrain bread", 70, "2 slices",
      [247, 13, 41, 3.4], "FoodBread",
      "Veganbaking.net · CC BY-SA 2.0 · Wikimedia Commons"),
    idea("avocado", "Avocado", 75, "½ avocado",
      [160, 2, 8.5, 14.7], "FoodAvocado",
      "HaJunkiyada · CC BY-SA 4.0 · Wikimedia Commons"),
    idea("blueberries", "Blueberries", 125, "1 punnet",
      [57, 0.7, 14.5, 0.3], "FoodBlueberries",
      "Petar Milošević · CC BY-SA 4.0 · Wikimedia Commons"),
    idea("apple", "Apple", 180, "1 apple",
      [52, 0.3, 14, 0.2], "FoodApple",
      "Abhijit Tembhekar · CC BY 2.0 · Wikimedia Commons"),
  ] as FoodIdea[],

  /**
   * The ideas in the order that helps most today: protein-dense first when
   * protein is what is missing, otherwise as listed.
   */
  ordered(a: { proteinLeft: number }): FoodIdea[] {
    if (!(a.proteinLeft > 20)) return FoodIdeas.all;
    const density = (i: FoodIdea) => FoodIdea.protein(i) / Math.max(FoodIdea.calories(i), 1);
    return [...FoodIdeas.all].sort((l, r) => (density(l) > density(r) ? -1 : density(r) > density(l) ? 1 : 0));
  },
};
