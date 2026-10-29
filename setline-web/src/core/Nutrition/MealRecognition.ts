import {
  charCount,
  foldingDiacritics,
  graphemes,
  icuRegex,
  isLetterChar,
  isNumberChar,
  replacingRegex,
  splitChars,
  splitOn,
  swiftDouble,
  trimmingWhitespaces,
} from "../Support/nutrition";
import { rounded } from "../Support/swift";
import { ScannedFood, type ScannedFood_Confidence } from "./FoodLookup";

/**
 * Reading a meal without paying anyone for it: what Apple's own image
 * recognition names on the phone, or what was typed, matched against common
 * foods with standard values (per 100 g, USDA-style) and a usual portion.
 *
 * It knows *what*, not *how much*: a photo starts every food at its usual
 * portion, to be checked; a typed amount is used exactly.
 */
export interface MealRecognition_Food {
  key: string;
  name: string;
  /** A usual portion, in grams. */
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Words that mean it, English and Dutch, lowercased. */
  aliases: string[];
  /** One piece, for "2 eggs". */
  pieceGrams?: number;
}

export const MealRecognition_Food = {
  scanned(self: MealRecognition_Food, a: { grams?: number; confidence: ScannedFood_Confidence }): ScannedFood {
    const amount = a.grams ?? self.grams;
    const factor = amount / 100;
    return ScannedFood.make({
      name: self.name, grams: amount,
      calories: rounded(self.kcal * factor),
      protein: rounded(self.protein * factor * 10) / 10,
      carbs: rounded(self.carbs * factor * 10) / 10,
      fat: rounded(self.fat * factor * 10) / 10,
      confidence: a.confidence, key: self.key,
    });
  },
};

function f(
  key: string, name: string, grams: number, kcal: number, p: number, c: number, fat: number,
  aliases: string[] = [], piece?: number,
): MealRecognition_Food {
  return { key, name, grams, kcal, protein: p, carbs: c, fat, aliases, pieceGrams: piece };
}

/** One part of a typed meal: the words, and the amount when one was given. */
export interface MealRecognition_Part {
  words: string;
  grams?: number;
  count?: number;
}

export const MealRecognition_Part = {
  make(p: { words: string; grams: number | undefined; count: number | undefined }): MealRecognition_Part {
    return { words: p.words, grams: p.grams, count: p.count };
  },
};

/**
 * A question the scan can ask about a food it found — what's on the
 * bread, which sauce, how big the plate was — answered with a tap.
 */
export type MealRecognition_Question_Kind =
  /** Each answer adds its own row (the Nutella on the bread). */
  | "adds"
  /** One answer scales the food itself (a large plate). */
  | "size"
  /**
   * Whether a photo's guess is right: yes, a lookalike, or
   * something else to type.
   */
  | "identity";

export const MealRecognition_Question_Kind = {
  adds: "adds" as MealRecognition_Question_Kind,
  size: "size" as MealRecognition_Question_Kind,
  identity: "identity" as MealRecognition_Question_Kind,
  allCases: ["adds", "size", "identity"] as MealRecognition_Question_Kind[],
};

export interface MealRecognition_Question_Answer {
  id: string;
  label: string;
  /**
   * For `adds`: the table food it adds, and how much — per piece of
   * the food asked about (a slice), or for the whole of it.
   */
  addsKey?: string;
  grams: number;
  perPiece: boolean;
  /** For `size`: what the usual amount is multiplied by. */
  factor: number;
}

export const MealRecognition_Question_Answer = {
  make(p: { id: string; label: string; addsKey: string | undefined; grams: number; perPiece: boolean; factor: number }): MealRecognition_Question_Answer {
    return { id: p.id, label: p.label, addsKey: p.addsKey, grams: p.grams, perPiece: p.perPiece, factor: p.factor };
  },
};

export interface MealRecognition_Question {
  id: string;
  text: string;
  symbol: string;
  kind: MealRecognition_Question_Kind;
  answers: MealRecognition_Question_Answer[];
}

export const MealRecognition_Question = {
  make(p: { id: string; text: string; symbol: string; kind: MealRecognition_Question_Kind; answers: MealRecognition_Question_Answer[] }): MealRecognition_Question {
    return { id: p.id, text: p.text, symbol: p.symbol, kind: p.kind, answers: p.answers };
  },
};

function add(id: string, label: string, key: string, grams: number, perPiece = false): MealRecognition_Question_Answer {
  return MealRecognition_Question_Answer.make({ id, label, addsKey: key, grams, perPiece, factor: 1 });
}

/** Apple's labels that mean the same food as one already in the table. */
const labelAliases: Record<string, string> = {
  red_wine: "wine", white_wine: "wine", sparkling_wine: "wine", wine_bottle: "wine",
  cake_regular: "cake", birthday_cake: "cake", wedding_cake: "cake", fruitcake: "cake",
  frozen_dessert: "ice_cream", chocolate_chip: "cookie", citrus_fruit: "oranges",
  seafood: "shellfish_prepared", shellfish: "shellfish_prepared", meat: "beef",
  bean: "green_beans", gingerbread: "cookie", tapioca_pearls: "bubble_tea",
  spaghetti_bolognese: "bolognese",
};

/**
 * Labels too broad to log on their own: kept only when nothing more
 * precise was seen.
 */
const umbrellas = new Set<string>(["vegetable", "fruit", "berry", "beef", "food", "dessert", "drink"]);

const sizeQuestion = MealRecognition_Question.make({
  id: "size", text: "How big was your plate?", symbol: "circle.dashed", kind: "size",
  answers: [
    MealRecognition_Question_Answer.make({ id: "small", label: "Small", addsKey: undefined, grams: 0, perPiece: false, factor: 0.7 }),
    MealRecognition_Question_Answer.make({ id: "normal", label: "Normal", addsKey: undefined, grams: 0, perPiece: false, factor: 1 }),
    MealRecognition_Question_Answer.make({ id: "large", label: "Large", addsKey: undefined, grams: 0, perPiece: false, factor: 1.4 }),
  ],
});

/**
 * Dishes a photo easily mistakes for each other: a plate of yellow rice
 * is paella, nasi or risotto; noodles are ramen or bami.
 */
const lookalikeGroups: string[][] = [
  ["paella", "nasi", "risotto", "rice", "curry", "stir_fry", "chili"],
  ["spaghetti", "bolognese", "pasta", "lasagna", "bami", "ramen"],
  ["pie", "quiche", "casserole", "lasagna", "waterzooi", "stew"],
  ["stew", "curry", "chili", "soup", "waterzooi"],
  ["pizza", "quiche", "quesadilla", "croque"],
  ["hamburger", "sandwich", "hotdog", "croque", "kebab"],
  ["grilled_chicken", "fried_chicken", "turkey", "fish", "salmon", "steak"],
  ["fries", "potato", "croquette"],
  ["salad", "vegetable", "broccoli", "green_beans"],
  ["pancake", "crepe", "waffle"],
  ["cake", "cheesecake", "pastry", "muffin", "cookie"],
  ["yogurt", "skyr", "quark", "pudding", "oatmeal"],
  ["burrito", "taco", "quesadilla", "tortilla", "springroll"],
  ["sushi", "springroll", "dumpling"],
];

/** Swift's `Float` comparisons for Vision's confidences. */
const float = Math.fround;

export const MealRecognition = {
  /**
   * Keyed by Apple's image labels where there is one; the rest are only
   * reachable by typing.
   */
  foods: [
    f("rice", "White rice, cooked", 180, 130, 2.7, 28.2, 0.3, ["rice", "rijst", "witte rijst"]),
    f("pasta", "Pasta, cooked", 200, 158, 5.8, 30.9, 0.9, ["pasta", "penne", "macaroni"]),
    f("spaghetti", "Spaghetti, cooked", 200, 158, 5.8, 30.9, 0.9, ["spaghetti"]),
    f("bread", "Bread", 70, 265, 9, 49, 3.2, ["bread", "brood", "boterham", "toast"], 35),
    f("white_bread", "White bread", 70, 265, 9, 49, 3.2, ["white bread", "wit brood"], 35),
    f("bagel", "Bagel", 100, 257, 10, 50, 1.6, ["bagel"], 100),
    f("croissant", "Croissant", 60, 406, 8.2, 45.8, 21, ["croissant"], 60),
    f("potato", "Potatoes, boiled", 200, 87, 1.9, 20.1, 0.1, ["potato", "potatoes", "aardappel", "aardappelen", "krieltjes"], 90),
    f("fries", "Fries", 150, 312, 3.4, 41, 15, ["fries", "frietjes", "friet", "frieten", "patat"]),
    f("oatmeal", "Oatmeal, cooked", 250, 71, 2.5, 12, 1.5, ["oatmeal", "porridge", "pap"]),
    f("oats", "Oats, dry", 60, 379, 13.2, 67.7, 6.5, ["oats", "havermout", "oat flakes"]),
    f("cereal", "Breakfast cereal", 40, 380, 8, 80, 2, ["cereal", "cornflakes", "muesli", "granola"]),
    f("pancake", "Pancake", 120, 227, 6.4, 28, 10, ["pancake", "pancakes", "pannenkoek", "pannenkoeken"], 60),
    f("waffle", "Waffle", 75, 291, 7.9, 33, 14, ["waffle", "wafel"], 75),
    f("tortilla", "Tortilla wrap", 60, 310, 8, 52, 7.5, ["wrap", "tortilla"], 60),
    // Eggs and dairy
    f("egg", "Eggs, boiled", 100, 143, 12.6, 0.7, 9.5, ["egg", "eggs", "ei", "eieren"], 50),
    f("fried_egg", "Fried eggs", 92, 196, 13.6, 0.8, 15, ["fried egg", "fried eggs", "spiegelei", "spiegeleieren"], 46),
    f("scrambled_eggs", "Scrambled eggs", 120, 149, 10, 1.6, 11, ["scrambled eggs", "roerei"]),
    f("omelet", "Omelette", 150, 154, 10.6, 0.6, 12, ["omelet", "omelette"]),
    f("yogurt", "Yoghurt", 200, 61, 3.5, 4.7, 3.3, ["yogurt", "yoghurt"]),
    f("skyr", "Skyr", 150, 63, 11, 3.8, 0.2, ["skyr"]),
    f("quark", "Low-fat quark", 250, 67, 12, 4, 0.2, ["quark", "kwark"]),
    f("cottage_cheese", "Cottage cheese", 150, 98, 11, 3.4, 4.3, ["cottage cheese", "huttenkase"]),
    f("cheese", "Cheese", 30, 402, 25, 1.3, 33, ["cheese", "kaas"], 20),
    f("milk", "Semi-skimmed milk", 250, 47, 3.5, 4.8, 1.5, ["milk", "melk"]),
    f("whey", "Whey protein powder", 30, 380, 78, 7, 5, ["whey", "whey protein", "protein powder", "eiwitpoeder", "proteinepoeder", "isolate", "casein", "caseine", "protein shake", "eiwitshake", "proteine"], 30),
    // Meat and fish
    f("grilled_chicken", "Chicken breast, cooked", 150, 165, 31, 0, 3.6, ["chicken", "chicken breast", "kip", "kipfilet", "kippenborst"], 150),
    f("fried_chicken", "Fried chicken", 150, 246, 24, 9, 13, ["fried chicken", "gefrituurde kip"]),
    f("turkey", "Turkey breast", 150, 135, 29, 0, 1.7, ["turkey", "kalkoen", "kalkoenfilet"]),
    f("beef", "Beef, cooked", 150, 250, 26, 0, 15, ["beef", "rundvlees", "minced beef", "gehakt"]),
    f("steak", "Steak", 200, 271, 25, 0, 19, ["steak", "biefstuk"], 200),
    f("meatball", "Meatballs", 120, 197, 14, 8, 12, ["meatball", "meatballs", "balletjes", "gehaktbal"], 40),
    f("bacon", "Bacon", 30, 541, 37, 1.4, 42, ["bacon", "spek"], 10),
    f("sausage", "Sausage", 100, 301, 12, 2, 27, ["sausage", "worst", "braadworst"], 75),
    f("pepperoni", "Pepperoni", 30, 494, 23, 1.2, 44, ["pepperoni", "salami"]),
    f("kebab", "Kebab meat", 200, 215, 16, 10, 12, ["kebab", "doner", "shoarma"]),
    f("salmon", "Salmon, cooked", 150, 206, 22, 0, 12, ["salmon", "zalm"], 125),
    f("tuna", "Tuna", 120, 132, 28, 0, 1.3, ["tuna", "tonijn"]),
    f("fish", "White fish, cooked", 150, 105, 23, 0, 1, ["fish", "vis", "kabeljauw", "cod", "pangasius"]),
    f("shellfish_prepared", "Shrimp, cooked", 120, 99, 24, 0.2, 0.3, ["shrimp", "prawns", "garnalen", "scampi"]),
    f("tofu", "Tofu", 150, 144, 15.8, 2.8, 8.7, ["tofu"]),
    // Dishes
    f("hamburger", "Hamburger", 220, 254, 13, 24, 11, ["hamburger", "burger"], 220),
    f("sandwich", "Sandwich", 200, 250, 11, 30, 9, ["sandwich", "broodje"], 200),
    f("pizza", "Pizza", 250, 266, 11, 33, 10, ["pizza"]),
    f("taco", "Taco", 170, 226, 9, 20, 12, ["taco", "tacos"], 85),
    f("burrito", "Burrito", 250, 206, 8, 25, 8, ["burrito"], 250),
    f("sushi", "Sushi", 200, 150, 5, 30, 1, ["sushi", "maki"]),
    f("dumpling", "Dumplings", 150, 210, 8, 28, 7, ["dumpling", "dumplings", "gyoza"]),
    f("curry", "Chicken curry", 300, 150, 10, 8, 9, ["curry"]),
    f("soup", "Soup", 300, 50, 3, 6, 1.5, ["soup", "soep"]),
    f("salad", "Mixed salad", 150, 20, 1.5, 3.5, 0.2, ["salad", "sla", "salade"]),
    f("hummus", "Hummus", 50, 166, 8, 14, 10, ["hummus"]),
    // Vegetables
    f("broccoli", "Broccoli", 100, 35, 2.4, 7, 0.4, ["broccoli"]),
    f("carrot", "Carrots", 80, 41, 0.9, 10, 0.2, ["carrot", "carrots", "wortel", "wortels", "wortelen"]),
    f("corn", "Sweetcorn", 100, 96, 3.4, 21, 1.5, ["corn", "mais"]),
    f("green_beans", "Green beans", 100, 31, 1.8, 7, 0.2, ["green beans", "sperziebonen", "boontjes"]),
    f("mushroom", "Mushrooms", 80, 22, 3.1, 3.3, 0.3, ["mushroom", "mushrooms", "champignons"]),
    f("tomato", "Tomatoes", 100, 18, 0.9, 3.9, 0.2, ["tomato", "tomatoes", "tomaat", "tomaten"], 100),
    f("bell_pepper", "Bell pepper", 100, 31, 1, 6, 0.3, ["bell pepper", "paprika"], 150),
    f("pepper_veggie", "Peppers", 100, 31, 1, 6, 0.3, ["peppers"]),
    f("avocado", "Avocado", 100, 160, 2, 8.5, 14.7, ["avocado"], 150),
    f("eggplant", "Aubergine", 100, 25, 1, 6, 0.2, ["eggplant", "aubergine"]),
    f("onion", "Onion", 50, 40, 1.1, 9.3, 0.1, ["onion", "ui", "uien"], 100),
    f("radish", "Radishes", 50, 16, 0.7, 3.4, 0.1, ["radish", "radijs"]),
    f("vegetable", "Vegetables", 150, 35, 2, 7, 0.3, ["vegetables", "groenten", "groente"]),
    // Fruit
    f("banana", "Banana", 120, 89, 1.1, 22.8, 0.3, ["banana", "bananas", "banaan", "bananen"], 120),
    f("apple", "Apple", 180, 52, 0.3, 13.8, 0.2, ["apple", "apples", "appel", "appels"], 180),
    f("oranges", "Orange", 150, 47, 0.9, 11.8, 0.1, ["orange", "oranges", "sinaasappel", "mandarijn"], 150),
    f("grapefruit", "Grapefruit", 150, 42, 0.8, 10.7, 0.1, ["grapefruit"]),
    f("strawberry", "Strawberries", 100, 32, 0.7, 7.7, 0.3, ["strawberry", "strawberries", "aardbei", "aardbeien"]),
    f("blueberry", "Blueberries", 100, 57, 0.7, 14.5, 0.3, ["blueberry", "blueberries", "bosbessen", "blauwe bessen"]),
    f("raspberry", "Raspberries", 100, 52, 1.2, 12, 0.7, ["raspberry", "raspberries", "frambozen"]),
    f("blackberry", "Blackberries", 100, 43, 1.4, 9.6, 0.5, ["blackberries", "bramen"]),
    f("berry", "Berries", 100, 50, 0.9, 12, 0.4, ["berries", "bessen"]),
    f("grape", "Grapes", 100, 69, 0.7, 18, 0.2, ["grape", "grapes", "druiven"]),
    f("mango", "Mango", 150, 60, 0.8, 15, 0.4, ["mango"]),
    f("pineapple", "Pineapple", 150, 50, 0.5, 13, 0.1, ["pineapple", "ananas"]),
    f("melon", "Melon", 250, 34, 0.8, 8.2, 0.2, ["melon", "meloen"]),
    f("watermelon", "Watermelon", 250, 30, 0.6, 7.6, 0.2, ["watermelon", "watermeloen"]),
    f("kiwi", "Kiwi", 75, 61, 1.1, 15, 0.5, ["kiwi"], 75),
    f("peach", "Peach", 150, 39, 0.9, 9.5, 0.3, ["peach", "perzik"], 150),
    f("pear", "Pear", 180, 57, 0.4, 15, 0.1, ["pear", "peer"], 180),
    f("cherry", "Cherries", 100, 63, 1.1, 16, 0.2, ["cherries", "kersen"]),
    f("coconut", "Coconut", 40, 354, 3.3, 15, 33, ["coconut", "kokos"]),
    f("fruit", "Fruit", 150, 55, 0.7, 14, 0.2, ["fruit"]),
    // Nuts and fats
    f("nut", "Mixed nuts", 30, 607, 20, 21, 54, ["nuts", "noten", "almonds", "amandelen", "walnuts"]),
    f("peanut", "Peanuts", 30, 567, 26, 16, 49, ["peanuts", "pinda", "pindas"]),
    f("peanut_butter", "Peanut butter", 20, 588, 25, 20, 50, ["peanut butter", "pindakaas"]),
    f("olive_oil", "Olive oil", 10, 884, 0, 0, 100, ["olive oil", "olijfolie", "oil", "olie"]),
    f("butter", "Butter", 10, 717, 0.9, 0.1, 81, ["butter", "boter", "roomboter"]),
    // Dishes as they are eaten here (Belgium, the Netherlands)
    f("pie", "Chicken pie (vol-au-vent)", 250, 160, 11, 9, 9,
      ["kippenpastei", "vol-au-vent", "vol au vent", "koninginnenhapje", "chicken pie", "pie", "pastei"]),
    f("stew", "Flemish beef stew", 250, 165, 18, 6, 7.5, ["stoofvlees", "stoverij", "carbonnade", "beef stew", "stoofpot"]),
    f("stamppot", "Stamppot", 350, 110, 3, 13, 5, ["stoemp", "stamppot", "hutspot", "boerenkool"]),
    f("frikandel", "Frikandel", 75, 250, 12, 10, 18, ["frikandel", "frikadel", "curryworst"], 75),
    f("croquette", "Croquette", 70, 240, 8, 20, 14, ["kroket", "kroketten", "bitterbal", "bitterballen", "croquette"], 70),
    f("croque", "Croque monsieur", 150, 290, 15, 22, 16, ["croque", "croque monsieur", "tosti"], 150),
    f("pistolet", "Bread roll", 60, 270, 9, 52, 2.5, ["pistolet", "pistolets", "piccolo", "bread roll", "kaiserbroodje"], 60),
    f("bolognese", "Spaghetti bolognese", 400, 150, 7, 18, 5, ["bolognese", "spaghetti bolognese", "spaghetti bolo", "bolo"]),
    f("lasagna", "Lasagne", 350, 165, 9, 13, 8.5, ["lasagne", "lasagna"]),
    f("casserole", "Oven dish", 350, 140, 8, 12, 7, ["ovenschotel", "casserole", "gratin"]),
    f("witloof", "Chicory with ham and cheese", 350, 120, 8, 5, 8, ["witloof", "witloof met hesp", "chicory gratin"]),
    f("waterzooi", "Waterzooi", 350, 95, 8, 5, 5, ["waterzooi"]),
    f("nasi", "Nasi goreng", 350, 160, 6, 20, 6, ["nasi", "nasi goreng", "fried rice", "gebakken rijst"]),
    f("bami", "Bami goreng", 350, 150, 6, 20, 5, ["bami", "bami goreng", "fried noodles", "noedels", "noodles"]),
    f("springroll", "Spring roll", 100, 220, 6, 25, 11, ["loempia", "spring roll", "springroll"], 100),
    f("chili", "Chili con carne", 350, 110, 8, 10, 4, ["chili", "chili con carne"]),
    f("quiche", "Quiche", 150, 260, 10, 18, 17, ["quiche"]),
    f("risotto", "Risotto", 300, 140, 4, 20, 5, ["risotto"]),
    f("paella", "Paella", 350, 155, 9, 19, 5, ["paella"]),
    f("ramen", "Ramen", 500, 90, 4.5, 12, 3, ["ramen"]),
    f("stir_fry", "Stir-fry", 350, 120, 9, 9, 6, ["stir fry", "wok", "roerbak"]),
    f("spareribs", "Spareribs", 300, 290, 22, 6, 20, ["spareribs", "ribs", "ribbetjes"]),
    f("ham", "Ham", 50, 145, 21, 1.5, 6, ["ham", "hesp", "beenham"]),
    f("hotdog", "Hot dog", 150, 250, 10, 22, 14, ["hotdog", "hot dog"], 150),
    f("nachos", "Nachos", 150, 345, 9, 36, 19, ["nachos"]),
    f("quesadilla", "Quesadilla", 180, 290, 13, 24, 16, ["quesadilla"], 180),
    f("falafel", "Falafel", 100, 333, 13, 32, 18, ["falafel"], 17),
    f("samosa", "Samosa", 100, 262, 5, 30, 14, ["samosa"], 60),
    f("pierogi", "Pierogi", 200, 190, 6, 28, 6, ["pierogi"]),
    f("crepe", "Crêpe", 120, 220, 6, 28, 9, ["crepe", "crêpe", "flensje"], 60),
    f("pretzel", "Pretzel", 80, 338, 9, 69, 3, ["pretzel", "bretzel"], 80),
    f("pudding", "Pudding", 150, 120, 3, 19, 3.5, ["pudding", "vla", "custard"]),
    f("pastry", "Pastry", 80, 400, 6, 45, 22, ["pastry", "koffiekoek", "gebak"], 80),
    f("mayonnaise", "Mayonnaise", 15, 680, 1, 1, 75, ["mayo", "mayonaise", "mayonnaise"]),
    f("ketchup", "Ketchup", 15, 100, 1.2, 24, 0.1, ["ketchup"]),
    f("fries_sauce", "Fries sauce", 30, 300, 1, 10, 28, ["frietsaus", "andalouse", "samurai", "cocktailsaus"]),
    // On bread, with pasta, in coffee: what the questions add
    f("choco_spread", "Chocolate spread", 15, 539, 6.3, 57.5, 31, ["choco", "nutella", "chocopasta", "hazelnootpasta", "chocolate spread"]),
    f("jam", "Jam", 15, 250, 0.4, 60, 0.1, ["jam", "confituur", "konfituur"]),
    f("honey", "Honey", 10, 304, 0.3, 82, 0, ["honey", "honing"]),
    f("chicken_spread", "Chicken spread", 20, 105, 20, 1, 2.5, ["kipfilet beleg", "kip beleg", "chicken spread"]),
    f("speculoos", "Speculoos spread", 15, 584, 1.5, 57, 38, ["speculoospasta", "speculoos", "lotus"]),
    f("tomato_sauce", "Tomato sauce", 100, 50, 1.5, 8, 1.5, ["tomatensaus", "tomato sauce", "marinara"]),
    f("meat_sauce", "Meat sauce", 120, 110, 8, 6, 6, ["vleessaus", "meat sauce", "bolognesesaus"]),
    f("pesto", "Pesto", 30, 450, 5, 5, 45, ["pesto"]),
    f("cream_sauce", "Cream sauce", 80, 180, 2, 5, 17, ["roomsaus", "cream sauce", "carbonara"]),
    f("grated_cheese", "Grated cheese", 15, 400, 28, 2, 31, ["geraspte kaas", "parmezaan", "parmesan", "grated cheese"]),
    f("vinaigrette", "Vinaigrette", 20, 300, 0, 5, 30, ["vinaigrette", "dressing"]),
    f("caesar", "Caesar dressing", 20, 450, 2, 4, 48, ["caesar dressing"]),
    f("sugar", "Sugar", 5, 400, 0, 100, 0, ["sugar", "suiker"]),
    // Sweets and drinks
    f("cake", "Cake", 100, 371, 4, 53, 16, ["cake", "taart"]),
    f("cheesecake", "Cheesecake", 120, 321, 5.5, 25.5, 22.5, ["cheesecake"]),
    f("cupcake", "Cupcake", 60, 305, 3.4, 51, 10, ["cupcake"], 60),
    f("muffin", "Muffin", 110, 377, 5, 52, 17, ["muffin"], 110),
    f("donut", "Doughnut", 60, 452, 4.9, 51, 25, ["donut", "doughnut"], 60),
    f("cookie", "Cookie", 30, 488, 5, 64, 24, ["cookie", "cookies", "koek", "koekje", "koekjes"], 15),
    f("chocolate", "Chocolate", 25, 546, 4.9, 61, 31, ["chocolate", "chocolade"]),
    f("ice_cream", "Ice cream", 100, 207, 3.5, 24, 11, ["ice cream", "ijs", "roomijs"]),
    f("popcorn", "Popcorn", 30, 387, 13, 78, 4.5, ["popcorn"]),
    f("smoothie", "Smoothie", 300, 60, 1, 13, 0.5, ["smoothie"]),
    f("milkshake", "Milkshake", 300, 112, 3.9, 18, 3, ["milkshake"]),
    f("juice", "Fruit juice", 250, 45, 0.5, 10.4, 0.2, ["juice", "sap", "jus"]),
    f("coffee", "Coffee", 200, 2, 0.3, 0, 0, ["coffee", "koffie"]),
    f("tea_drink", "Tea", 250, 1, 0, 0.3, 0, ["tea", "thee"]),
    f("bubble_tea", "Bubble tea", 400, 80, 0.5, 16, 1.5, ["bubble tea"]),
    f("beer", "Beer", 330, 43, 0.5, 3.6, 0, ["beer", "bier", "pint"]),
    f("wine", "Wine", 150, 85, 0.1, 2.6, 0, ["wine", "wijn"]),
  ] as MealRecognition_Food[],

  food(a: { forLabel: string }): MealRecognition_Food | undefined {
    const key = labelAliases[a.forLabel] ?? a.forLabel;
    return MealRecognition.foods.find((food) => food.key === key);
  },

  /**
   * What a photo's labels come to: the foods the table knows, most certain
   * first, at their usual portion.
   */
  fromLabels(labels: { label: string; confidence: number }[], a: { limit?: number } = {}): ScannedFood[] {
    const limit = a.limit ?? 5;
    const seen = new Set<string>();
    const precise: [MealRecognition_Food, number][] = [];
    const broad: [MealRecognition_Food, number][] = [];
    const sorted = [...labels].sort((l, r) => (float(l.confidence) > float(r.confidence) ? -1 : float(r.confidence) > float(l.confidence) ? 1 : 0));
    for (const { label, confidence } of sorted) {
      if (!(float(confidence) >= float(0.12))) continue;
      const food = MealRecognition.food({ forLabel: label });
      if (food === undefined || seen.has(food.key)) continue;
      seen.add(food.key);
      if (umbrellas.has(food.key) || umbrellas.has(label)) broad.push([food, confidence]);
      else precise.push([food, confidence]);
    }
    const chosen = (precise.length === 0 ? broad : precise).slice(0, Math.max(0, limit));
    return chosen.map(([food, confidence]) =>
      MealRecognition_Food.scanned(food, {
        confidence: float(confidence) >= float(0.6) ? "high" : float(confidence) >= float(0.3) ? "medium" : "low",
      }),
    );
  },

  // MARK: - A typed line

  /** "200 g rice, 2 eggs and chicken breast" → three parts. */
  parts(a: { of: string }): MealRecognition_Part[] {
    const separators = icuRegex(String.raw`\s*(?:,|;|\+|&|\n|\band\b|\ben\b|\bmet\b|\bwith\b)\s*`, "gi");
    const lowered = a.of.toLowerCase();
    const joined = lowered.replace(separators, "|");
    const gramsPattern = icuRegex(String.raw`(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram|grams|grammes|ml)\b`);
    const countPattern = icuRegex(String.raw`^\s*(\d+(?:[.,]\d+)?|a|an|een|half)\s+`);

    const parts: MealRecognition_Part[] = [];
    for (const raw of splitOn(joined, "|")) {
      let text = trimmingWhitespaces(raw);
      if (text === "") continue;
      let grams: number | undefined;
      let count: number | undefined;
      const gramsMatch = gramsPattern.exec(text);
      const countMatch = gramsMatch ? null : countPattern.exec(text);
      if (gramsMatch) {
        grams = swiftDouble(gramsMatch[1].replaceAll(",", "."));
        text = text.slice(0, gramsMatch.index) + text.slice(gramsMatch.index + gramsMatch[0].length);
      } else if (countMatch) {
        const word = countMatch[1];
        count = ["a", "an", "een"].includes(word) ? 1 : word === "half" ? 0.5 : swiftDouble(word.replaceAll(",", "."));
        text = text.slice(0, countMatch.index) + text.slice(countMatch.index + countMatch[0].length);
      }
      const words = splitOn(replacingRegex(text, String.raw`\b(of|van|gram|grams)\b`, " "), " ").join(" ");
      if (words !== "") parts.push(MealRecognition_Part.make({ words, grams, count }));
    }
    return parts;
  },

  /** The table's food a few words mean: the longest alias found in them. */
  match(words: string): MealRecognition_Food | undefined {
    const lowered = foldingDiacritics(words.toLowerCase());
    const text = ` ${lowered} `;
    const tokens = splitOn(lowered, " ");
    let best: [MealRecognition_Food, number] | undefined;
    for (const food of MealRecognition.foods) {
      for (const raw of food.aliases) {
        const alias = foldingDiacritics(raw);
        // A whole word, or — for a long, specific name — inside a
        // Dutch compound: "kippenpasteitje" is still kippenpastei.
        const whole = text.includes(` ${alias} `) || text.includes(` ${alias}s `) || text.includes(` ${alias}en `);
        const inside = charCount(alias) >= 6 && !alias.includes(" ") && tokens.some((t) => t.includes(alias));
        if ((whole || inside) && charCount(alias) > (best?.[1] ?? 0)) best = [food, charCount(alias)];
      }
    }
    if (best !== undefined) return best[0];
    // A typo in a longer name: "kippenpqstei" is still kippenpastei.
    let closest: [MealRecognition_Food, number] | undefined;
    for (const food of MealRecognition.foods) {
      for (const raw of food.aliases) {
        if (!(charCount(raw) >= 6 && !raw.includes(" "))) continue;
        const alias = foldingDiacritics(raw);
        for (const token of tokens) {
          if (!(Math.abs(charCount(token) - charCount(alias)) <= 2)) continue;
          const distance = MealRecognition.distance(token, alias);
          if (distance <= 2 && distance < (closest?.[1] ?? 3)) closest = [food, distance];
        }
      }
    }
    return closest?.[0];
  },

  /** Letters to change, add or remove to turn one word into the other. */
  distance(aText: string, bText: string): number {
    const a = graphemes(aText);
    const b = graphemes(bText);
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const current = [i, ...new Array<number>(b.length).fill(0)];
      for (let j = 1; j <= b.length; j++) {
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      previous = current;
    }
    return previous[b.length];
  },

  /**
   * Other table foods a few words could mean, best first — what "Other
   * match" offers next to the one chosen.
   */
  candidates(words: string, a: { limit?: number } = {}): MealRecognition_Food[] {
    const limit = a.limit ?? 4;
    const tokens = [...new Set(splitOn(words.toLowerCase(), " ").filter((t) => charCount(t) >= 3))];
    if (tokens.length === 0) return [];
    return MealRecognition.foods
      .map((food): [MealRecognition_Food, number] => {
        // Short aliases ("ei", "kip") only count as whole words: inside
        // "kippenpastei" they mean nothing.
        const score = food.aliases.reduce(
          (total, alias) =>
            total +
            tokens.filter(
              (token) =>
                token === alias || (charCount(alias) >= 4 && token.includes(alias)) || (charCount(token) >= 4 && alias.includes(token)),
            ).length,
          0,
        );
        return [food, score];
      })
      .filter((pair) => pair[1] > 0)
      .sort((l, r) => (l[1] > r[1] ? -1 : r[1] > l[1] ? 1 : 0))
      .slice(0, Math.max(0, limit))
      .map((pair) => pair[0]);
  },

  /**
   * The words that carry meaning in what was typed, folded: no accents,
   * no filler, and brands written one way ("dokter" → "dr").
   */
  significant(text: string): string[] {
    const filler = new Set<string>(["met", "and", "with", "van", "the", "een", "and", "of", "en", "de", "het"]);
    const synonyms: Record<string, string> = { dokter: "dr", doctor: "dr", "dr.": "dr" };
    return splitChars(foldingDiacritics(text.toLowerCase()), (ch) => !isLetterChar(ch) && !isNumberChar(ch))
      .map((word) => (Object.prototype.hasOwnProperty.call(synonyms, word) ? synonyms[word] : word))
      .filter((word) => (charCount(word) >= 3 || word === "dr") && !filler.has(word));
  },

  /**
   * A typed word found among others: exactly, inside one, or one or two
   * letters off for a longer word ("bolognaise" is bolognese).
   */
  found(word: string, a: { in: string[] }): boolean {
    return a.in.some(
      (other) =>
        other === word ||
        (charCount(word) >= 4 && other.includes(word)) ||
        (charCount(other) >= 4 && word.includes(other)) ||
        (charCount(word) >= 6 && Math.abs(charCount(other) - charCount(word)) <= 2 && MealRecognition.distance(word, other) <= 2),
    );
  },

  /**
   * How well a product answers what was typed, 0…1: the share of the
   * typed words found in its name and brand, with a little extra for a
   * generic table food over a brand.
   */
  similarity(query: string, a: { to: string; brand: string }): number {
    const asked = MealRecognition.significant(query);
    if (asked.length === 0) return 0;
    const haystack = MealRecognition.significant(`${a.to} ${a.brand}`);
    const hits = asked.filter((word) => MealRecognition.found(word, { in: haystack })).length;
    let score = hits / asked.length;
    if (a.brand.toLowerCase() === "generiek" || a.brand === "") score += 0.15;
    return Math.min(1, score);
  },

  /**
   * How much of what was typed a table food explains, 0…1. "pizza" is
   * all of "pizza", but only a third of "dr oetker pizza bolognese" — then
   * the product itself answers better than a general pizza.
   */
  coverage(query: string, a: { by: MealRecognition_Food }): number {
    const asked = MealRecognition.significant(query);
    if (asked.length === 0) return 0;
    const words = [...a.by.aliases.flatMap((alias) => MealRecognition.significant(alias)), ...MealRecognition.significant(a.by.name)];
    return asked.filter((word) => MealRecognition.found(word, { in: words })).length / asked.length;
  },

  // MARK: - Questions that make it precise

  /** The questions worth asking about a food, by its table key. */
  questions(a: { for: string | undefined }): MealRecognition_Question[] {
    const key = a.for;
    if (key === undefined) return [];
    const breads = new Set(["bread", "white_bread", "pistolet", "bagel", "croissant", "tortilla", "pancake", "crepe", "waffle", "sandwich"]);
    const starches = new Set(["pasta", "spaghetti", "rice", "potato"]);
    const dishes = new Set(["pizza", "pie", "stew", "stamppot", "bolognese", "lasagna", "casserole", "witloof", "waterzooi", "curry",
      "nasi", "bami", "chili", "risotto", "paella", "ramen", "stir_fry", "soup", "quiche", "kebab", "burrito", "sushi"]);
    const bowls = new Set(["yogurt", "skyr", "quark", "oatmeal", "oats", "cereal", "cottage_cheese"]);
    if (breads.has(key)) {
      return [MealRecognition_Question.make({ id: "on", text: "What's on it?", symbol: "square.stack.3d.down.forward", kind: "adds", answers: [
        add("butter", "Butter", "butter", 5, true),
        add("choco", "Choco / Nutella", "choco_spread", 15, true),
        add("jam", "Jam", "jam", 15, true),
        add("peanut", "Peanut butter", "peanut_butter", 15, true),
        add("cheese", "Cheese", "cheese", 20, true),
        add("ham", "Ham", "ham", 20, true),
        add("chicken", "Chicken spread", "chicken_spread", 20, true),
        add("speculoos", "Speculoos", "speculoos", 15, true),
        add("honey", "Honey", "honey", 10, true),
      ] })];
    }
    if (starches.has(key)) {
      return [MealRecognition_Question.make({ id: "sauce", text: "Any sauce with it?", symbol: "drop.fill", kind: "adds", answers: [
        add("tomato", "Tomato sauce", "tomato_sauce", 100),
        add("meat", "Meat sauce", "meat_sauce", 120),
        add("pesto", "Pesto", "pesto", 30),
        add("cream", "Cream sauce", "cream_sauce", 80),
        add("cheese", "Grated cheese", "grated_cheese", 15),
        add("oil", "Oil or butter", "olive_oil", 10),
      ] })];
    }
    if (key === "fries") {
      return [MealRecognition_Question.make({ id: "sauce", text: "Sauce with your fries?", symbol: "drop.fill", kind: "adds", answers: [
        add("mayo", "Mayo", "mayonnaise", 30),
        add("ketchup", "Ketchup", "ketchup", 20),
        add("fries_sauce", "Fries sauce", "fries_sauce", 30),
      ] })];
    }
    if (key === "salad") {
      return [MealRecognition_Question.make({ id: "dressing", text: "Any dressing?", symbol: "drop.fill", kind: "adds", answers: [
        add("vinaigrette", "Vinaigrette", "vinaigrette", 20),
        add("caesar", "Caesar", "caesar", 20),
        add("oil", "Olive oil", "olive_oil", 10),
        add("cheese", "Cheese", "grated_cheese", 15),
      ] })];
    }
    if (key === "coffee" || key === "tea_drink") {
      return [MealRecognition_Question.make({ id: "milk", text: "Milk or sugar?", symbol: "cup.and.saucer.fill", kind: "adds", answers: [
        add("milk", "Milk", "milk", 30),
        add("sugar", "Sugar", "sugar", 5),
      ] })];
    }
    if (bowls.has(key)) {
      return [MealRecognition_Question.make({ id: "topping", text: "Anything on top?", symbol: "sparkles", kind: "adds", answers: [
        add("fruit", "Fruit", "berry", 75),
        add("granola", "Granola", "cereal", 30),
        add("honey", "Honey", "honey", 10),
        add("nuts", "Nuts", "nut", 15),
        add("peanut", "Peanut butter", "peanut_butter", 15),
      ] })];
    }
    if (dishes.has(key)) return [sizeQuestion];
    return [];
  },

  /** What a photo's guess could also be, closest first. */
  lookalikes(a: { of: string | undefined; limit?: number }): MealRecognition_Food[] {
    const key = a.of;
    const limit = a.limit ?? 3;
    if (key === undefined) return [];
    const seen: string[] = [];
    for (const group of lookalikeGroups) {
      if (!group.includes(key)) continue;
      for (const other of group) if (other !== key && !seen.includes(other)) seen.push(other);
    }
    return seen
      .slice(0, Math.max(0, limit))
      .map((other) => MealRecognition.foods.find((food) => food.key === other))
      .filter((food): food is MealRecognition_Food => food !== undefined);
  },

  /**
   * "Is that paella?" for a photo's guess: yes, its lookalikes, or
   * something else to tell.
   */
  identityQuestion(a: { for: ScannedFood }): MealRecognition_Question {
    const answers: MealRecognition_Question_Answer[] = [
      MealRecognition_Question_Answer.make({ id: "yes", label: "Yes", addsKey: undefined, grams: 0, perPiece: false, factor: 1 }),
    ];
    for (const food of MealRecognition.lookalikes({ of: a.for.key })) {
      answers.push(MealRecognition_Question_Answer.make({
        id: `is-${food.key}`, label: MealRecognition.short(food.name), addsKey: food.key, grams: food.grams, perPiece: false, factor: 1,
      }));
    }
    answers.push(MealRecognition_Question_Answer.make({ id: "else", label: "Something else", addsKey: undefined, grams: 0, perPiece: false, factor: 1 }));
    return MealRecognition_Question.make({ id: "what", text: "Is that right?", symbol: "eye", kind: "identity", answers });
  },

  /** "Chicken pie (vol-au-vent)" → "Chicken pie"; "White rice, cooked" → "White rice". */
  short(name: string): string {
    const base = splitOn(name, "(")[0] ?? name;
    return trimmingWhitespaces(splitOn(base, ",")[0] ?? base);
  },

  /**
   * The row an answer adds to a food: the topping at its amount — per
   * slice when it goes on each slice, so choco on four slices is four
   * times fifteen grams.
   */
  added(answer: MealRecognition_Question_Answer, a: { to: ScannedFood }): ScannedFood | undefined {
    const item = a.to;
    const key = answer.addsKey;
    const food = key === undefined ? undefined : MealRecognition.foods.find((f) => f.key === key);
    if (food === undefined) return undefined;
    const base = MealRecognition.foods.find((f) => f.key === item.key);
    const pieces = answer.perPiece ? Math.max(1, rounded(item.grams / (base?.pieceGrams ?? item.grams))) : 1;
    return MealRecognition_Food.scanned(food, { grams: answer.grams * pieces, confidence: "high" });
  },

  /** A food at its usual amount times a size answer. */
  sized(item: ScannedFood, a: { by: MealRecognition_Question_Answer }): ScannedFood {
    const usual = MealRecognition.foods.find((f) => f.key === item.key)?.grams ?? item.grams;
    return ScannedFood.scaled(item, { to: rounded(usual * a.by.factor) });
  },

  /**
   * A typed part as a food, when the table knows it: the amount as typed,
   * pieces as pieces, otherwise its usual portion.
   */
  scanned(part: MealRecognition_Part): ScannedFood | undefined {
    const food = MealRecognition.match(part.words);
    if (food === undefined) return undefined;
    if (part.grams !== undefined) return MealRecognition_Food.scanned(food, { grams: part.grams, confidence: "high" });
    if (part.count !== undefined) {
      return MealRecognition_Food.scanned(food, { grams: (food.pieceGrams ?? food.grams) * part.count, confidence: "high" });
    }
    return MealRecognition_Food.scanned(food, { confidence: "medium" });
  },
};
