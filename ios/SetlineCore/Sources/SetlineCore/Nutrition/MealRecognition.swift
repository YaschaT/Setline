import Foundation

/// Reading a meal without paying anyone for it: what Apple's own image
/// recognition names on the phone, or what was typed, matched against common
/// foods with standard values (per 100 g, USDA-style) and a usual portion.
///
/// It knows *what*, not *how much*: a photo starts every food at its usual
/// portion, to be checked; a typed amount is used exactly.
public enum MealRecognition {
    public struct Food: Equatable, Sendable {
        public let key: String
        public let name: String
        /// A usual portion, in grams.
        public let grams: Double
        public let kcal: Double
        public let protein: Double
        public let carbs: Double
        public let fat: Double
        /// Words that mean it, English and Dutch, lowercased.
        public let aliases: [String]
        /// One piece, for "2 eggs".
        public let pieceGrams: Double?

        public func scanned(grams: Double? = nil, confidence: ScannedFood.Confidence) -> ScannedFood {
            let amount = grams ?? self.grams
            let factor = amount / 100
            return ScannedFood(
                name: name, grams: amount,
                calories: (kcal * factor).rounded(),
                protein: (protein * factor * 10).rounded() / 10,
                carbs: (carbs * factor * 10).rounded() / 10,
                fat: (fat * factor * 10).rounded() / 10,
                confidence: confidence, key: key
            )
        }
    }

    private static func f(_ key: String, _ name: String, _ grams: Double, _ kcal: Double, _ p: Double, _ c: Double, _ fat: Double,
                          _ aliases: [String] = [], piece: Double? = nil) -> Food {
        Food(key: key, name: name, grams: grams, kcal: kcal, protein: p, carbs: c, fat: fat,
             aliases: aliases, pieceGrams: piece)
    }

    /// Keyed by Apple's image labels where there is one; the rest are only
    /// reachable by typing.
    public static let foods: [Food] = [
        // Starches
        f("rice", "White rice, cooked", 180, 130, 2.7, 28.2, 0.3, ["rice", "rijst", "witte rijst"]),
        f("pasta", "Pasta, cooked", 200, 158, 5.8, 30.9, 0.9, ["pasta", "penne", "macaroni"]),
        f("spaghetti", "Spaghetti, cooked", 200, 158, 5.8, 30.9, 0.9, ["spaghetti"]),
        f("bread", "Bread", 70, 265, 9, 49, 3.2, ["bread", "brood", "boterham", "toast"], piece: 35),
        f("white_bread", "White bread", 70, 265, 9, 49, 3.2, ["white bread", "wit brood"], piece: 35),
        f("bagel", "Bagel", 100, 257, 10, 50, 1.6, ["bagel"], piece: 100),
        f("croissant", "Croissant", 60, 406, 8.2, 45.8, 21, ["croissant"], piece: 60),
        f("potato", "Potatoes, boiled", 200, 87, 1.9, 20.1, 0.1, ["potato", "potatoes", "aardappel", "aardappelen", "krieltjes"], piece: 90),
        f("fries", "Fries", 150, 312, 3.4, 41, 15, ["fries", "frietjes", "friet", "frieten", "patat"]),
        f("oatmeal", "Oatmeal, cooked", 250, 71, 2.5, 12, 1.5, ["oatmeal", "porridge", "pap"]),
        f("oats", "Oats, dry", 60, 379, 13.2, 67.7, 6.5, ["oats", "havermout", "oat flakes"]),
        f("cereal", "Breakfast cereal", 40, 380, 8, 80, 2, ["cereal", "cornflakes", "muesli", "granola"]),
        f("pancake", "Pancake", 120, 227, 6.4, 28, 10, ["pancake", "pancakes", "pannenkoek", "pannenkoeken"], piece: 60),
        f("waffle", "Waffle", 75, 291, 7.9, 33, 14, ["waffle", "wafel"], piece: 75),
        f("tortilla", "Tortilla wrap", 60, 310, 8, 52, 7.5, ["wrap", "tortilla"], piece: 60),
        // Eggs and dairy
        f("egg", "Eggs, boiled", 100, 143, 12.6, 0.7, 9.5, ["egg", "eggs", "ei", "eieren"], piece: 50),
        f("fried_egg", "Fried eggs", 92, 196, 13.6, 0.8, 15, ["fried egg", "fried eggs", "spiegelei", "spiegeleieren"], piece: 46),
        f("scrambled_eggs", "Scrambled eggs", 120, 149, 10, 1.6, 11, ["scrambled eggs", "roerei"]),
        f("omelet", "Omelette", 150, 154, 10.6, 0.6, 12, ["omelet", "omelette"]),
        f("yogurt", "Yoghurt", 200, 61, 3.5, 4.7, 3.3, ["yogurt", "yoghurt"]),
        f("skyr", "Skyr", 150, 63, 11, 3.8, 0.2, ["skyr"]),
        f("quark", "Low-fat quark", 250, 67, 12, 4, 0.2, ["quark", "kwark"]),
        f("cottage_cheese", "Cottage cheese", 150, 98, 11, 3.4, 4.3, ["cottage cheese", "huttenkase"]),
        f("cheese", "Cheese", 30, 402, 25, 1.3, 33, ["cheese", "kaas"], piece: 20),
        f("milk", "Semi-skimmed milk", 250, 47, 3.5, 4.8, 1.5, ["milk", "melk"]),
        f("whey", "Whey protein powder", 30, 380, 78, 7, 5, ["whey", "protein shake", "eiwitshake", "proteine"], piece: 30),
        // Meat and fish
        f("grilled_chicken", "Chicken breast, cooked", 150, 165, 31, 0, 3.6, ["chicken", "chicken breast", "kip", "kipfilet", "kippenborst"], piece: 150),
        f("fried_chicken", "Fried chicken", 150, 246, 24, 9, 13, ["fried chicken", "gefrituurde kip"]),
        f("turkey", "Turkey breast", 150, 135, 29, 0, 1.7, ["turkey", "kalkoen", "kalkoenfilet"]),
        f("beef", "Beef, cooked", 150, 250, 26, 0, 15, ["beef", "rundvlees", "minced beef", "gehakt"]),
        f("steak", "Steak", 200, 271, 25, 0, 19, ["steak", "biefstuk"], piece: 200),
        f("meatball", "Meatballs", 120, 197, 14, 8, 12, ["meatball", "meatballs", "balletjes", "gehaktbal"], piece: 40),
        f("bacon", "Bacon", 30, 541, 37, 1.4, 42, ["bacon", "spek"], piece: 10),
        f("sausage", "Sausage", 100, 301, 12, 2, 27, ["sausage", "worst", "braadworst"], piece: 75),
        f("pepperoni", "Pepperoni", 30, 494, 23, 1.2, 44, ["pepperoni", "salami"]),
        f("kebab", "Kebab meat", 200, 215, 16, 10, 12, ["kebab", "doner", "shoarma"]),
        f("salmon", "Salmon, cooked", 150, 206, 22, 0, 12, ["salmon", "zalm"], piece: 125),
        f("tuna", "Tuna", 120, 132, 28, 0, 1.3, ["tuna", "tonijn"]),
        f("fish", "White fish, cooked", 150, 105, 23, 0, 1, ["fish", "vis", "kabeljauw", "cod", "pangasius"]),
        f("shellfish_prepared", "Shrimp, cooked", 120, 99, 24, 0.2, 0.3, ["shrimp", "prawns", "garnalen", "scampi"]),
        f("tofu", "Tofu", 150, 144, 15.8, 2.8, 8.7, ["tofu"]),
        // Dishes
        f("hamburger", "Hamburger", 220, 254, 13, 24, 11, ["hamburger", "burger"], piece: 220),
        f("sandwich", "Sandwich", 200, 250, 11, 30, 9, ["sandwich", "broodje"], piece: 200),
        f("pizza", "Pizza", 250, 266, 11, 33, 10, ["pizza"]),
        f("taco", "Taco", 170, 226, 9, 20, 12, ["taco", "tacos"], piece: 85),
        f("burrito", "Burrito", 250, 206, 8, 25, 8, ["burrito"], piece: 250),
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
        f("tomato", "Tomatoes", 100, 18, 0.9, 3.9, 0.2, ["tomato", "tomatoes", "tomaat", "tomaten"], piece: 100),
        f("bell_pepper", "Bell pepper", 100, 31, 1, 6, 0.3, ["bell pepper", "paprika"], piece: 150),
        f("pepper_veggie", "Peppers", 100, 31, 1, 6, 0.3, ["peppers"]),
        f("avocado", "Avocado", 100, 160, 2, 8.5, 14.7, ["avocado"], piece: 150),
        f("eggplant", "Aubergine", 100, 25, 1, 6, 0.2, ["eggplant", "aubergine"]),
        f("onion", "Onion", 50, 40, 1.1, 9.3, 0.1, ["onion", "ui", "uien"], piece: 100),
        f("radish", "Radishes", 50, 16, 0.7, 3.4, 0.1, ["radish", "radijs"]),
        f("vegetable", "Vegetables", 150, 35, 2, 7, 0.3, ["vegetables", "groenten", "groente"]),
        // Fruit
        f("banana", "Banana", 120, 89, 1.1, 22.8, 0.3, ["banana", "bananas", "banaan", "bananen"], piece: 120),
        f("apple", "Apple", 180, 52, 0.3, 13.8, 0.2, ["apple", "apples", "appel", "appels"], piece: 180),
        f("oranges", "Orange", 150, 47, 0.9, 11.8, 0.1, ["orange", "oranges", "sinaasappel", "mandarijn"], piece: 150),
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
        f("kiwi", "Kiwi", 75, 61, 1.1, 15, 0.5, ["kiwi"], piece: 75),
        f("peach", "Peach", 150, 39, 0.9, 9.5, 0.3, ["peach", "perzik"], piece: 150),
        f("pear", "Pear", 180, 57, 0.4, 15, 0.1, ["pear", "peer"], piece: 180),
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
        f("frikandel", "Frikandel", 75, 250, 12, 10, 18, ["frikandel", "frikadel", "curryworst"], piece: 75),
        f("croquette", "Croquette", 70, 240, 8, 20, 14, ["kroket", "kroketten", "bitterbal", "bitterballen", "croquette"], piece: 70),
        f("croque", "Croque monsieur", 150, 290, 15, 22, 16, ["croque", "croque monsieur", "tosti"], piece: 150),
        f("pistolet", "Bread roll", 60, 270, 9, 52, 2.5, ["pistolet", "pistolets", "piccolo", "bread roll", "kaiserbroodje"], piece: 60),
        f("bolognese", "Spaghetti bolognese", 400, 150, 7, 18, 5, ["bolognese", "spaghetti bolognese", "spaghetti bolo", "bolo"]),
        f("lasagna", "Lasagne", 350, 165, 9, 13, 8.5, ["lasagne", "lasagna"]),
        f("casserole", "Oven dish", 350, 140, 8, 12, 7, ["ovenschotel", "casserole", "gratin"]),
        f("witloof", "Chicory with ham and cheese", 350, 120, 8, 5, 8, ["witloof", "witloof met hesp", "chicory gratin"]),
        f("waterzooi", "Waterzooi", 350, 95, 8, 5, 5, ["waterzooi"]),
        f("nasi", "Nasi goreng", 350, 160, 6, 20, 6, ["nasi", "nasi goreng", "fried rice", "gebakken rijst"]),
        f("bami", "Bami goreng", 350, 150, 6, 20, 5, ["bami", "bami goreng", "fried noodles", "noedels", "noodles"]),
        f("springroll", "Spring roll", 100, 220, 6, 25, 11, ["loempia", "spring roll", "springroll"], piece: 100),
        f("chili", "Chili con carne", 350, 110, 8, 10, 4, ["chili", "chili con carne"]),
        f("quiche", "Quiche", 150, 260, 10, 18, 17, ["quiche"]),
        f("risotto", "Risotto", 300, 140, 4, 20, 5, ["risotto"]),
        f("paella", "Paella", 350, 155, 9, 19, 5, ["paella"]),
        f("ramen", "Ramen", 500, 90, 4.5, 12, 3, ["ramen"]),
        f("stir_fry", "Stir-fry", 350, 120, 9, 9, 6, ["stir fry", "wok", "roerbak"]),
        f("spareribs", "Spareribs", 300, 290, 22, 6, 20, ["spareribs", "ribs", "ribbetjes"]),
        f("ham", "Ham", 50, 145, 21, 1.5, 6, ["ham", "hesp", "beenham"]),
        f("hotdog", "Hot dog", 150, 250, 10, 22, 14, ["hotdog", "hot dog"], piece: 150),
        f("nachos", "Nachos", 150, 345, 9, 36, 19, ["nachos"]),
        f("quesadilla", "Quesadilla", 180, 290, 13, 24, 16, ["quesadilla"], piece: 180),
        f("falafel", "Falafel", 100, 333, 13, 32, 18, ["falafel"], piece: 17),
        f("samosa", "Samosa", 100, 262, 5, 30, 14, ["samosa"], piece: 60),
        f("pierogi", "Pierogi", 200, 190, 6, 28, 6, ["pierogi"]),
        f("crepe", "Crêpe", 120, 220, 6, 28, 9, ["crepe", "crêpe", "flensje"], piece: 60),
        f("pretzel", "Pretzel", 80, 338, 9, 69, 3, ["pretzel", "bretzel"], piece: 80),
        f("pudding", "Pudding", 150, 120, 3, 19, 3.5, ["pudding", "vla", "custard"]),
        f("pastry", "Pastry", 80, 400, 6, 45, 22, ["pastry", "koffiekoek", "gebak"], piece: 80),
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
        f("cupcake", "Cupcake", 60, 305, 3.4, 51, 10, ["cupcake"], piece: 60),
        f("muffin", "Muffin", 110, 377, 5, 52, 17, ["muffin"], piece: 110),
        f("donut", "Doughnut", 60, 452, 4.9, 51, 25, ["donut", "doughnut"], piece: 60),
        f("cookie", "Cookie", 30, 488, 5, 64, 24, ["cookie", "cookies", "koek", "koekje", "koekjes"], piece: 15),
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
    ]

    /// Apple's labels that mean the same food as one already in the table.
    private static let labelAliases: [String: String] = [
        "red_wine": "wine", "white_wine": "wine", "sparkling_wine": "wine", "wine_bottle": "wine",
        "cake_regular": "cake", "birthday_cake": "cake", "wedding_cake": "cake", "fruitcake": "cake",
        "frozen_dessert": "ice_cream", "chocolate_chip": "cookie", "citrus_fruit": "oranges",
        "seafood": "shellfish_prepared", "shellfish": "shellfish_prepared", "meat": "beef",
        "bean": "green_beans", "gingerbread": "cookie", "tapioca_pearls": "bubble_tea",
        "spaghetti_bolognese": "bolognese",
    ]

    /// Labels too broad to log on their own: kept only when nothing more
    /// precise was seen.
    private static let umbrellas: Set<String> = ["vegetable", "fruit", "berry", "beef", "food", "dessert", "drink"]

    public static func food(forLabel label: String) -> Food? {
        let key = labelAliases[label] ?? label
        return foods.first { $0.key == key }
    }

    /// What a photo's labels come to: the foods the table knows, most certain
    /// first, at their usual portion.
    public static func fromLabels(_ labels: [(label: String, confidence: Float)], limit: Int = 5) -> [ScannedFood] {
        var seen = Set<String>()
        var precise: [(Food, Float)] = []
        var broad: [(Food, Float)] = []
        for (label, confidence) in labels.sorted(by: { $0.confidence > $1.confidence }) where confidence >= 0.12 {
            guard let food = food(forLabel: label), seen.insert(food.key).inserted else { continue }
            if umbrellas.contains(food.key) || umbrellas.contains(label) { broad.append((food, confidence)) } else { precise.append((food, confidence)) }
        }
        let chosen = (precise.isEmpty ? broad : precise).prefix(limit)
        return chosen.map { food, confidence in
            food.scanned(confidence: confidence >= 0.6 ? .high : confidence >= 0.3 ? .medium : .low)
        }
    }

    // MARK: - A typed line

    /// One part of a typed meal: the words, and the amount when one was given.
    public struct Part: Equatable, Sendable {
        public let words: String
        public let grams: Double?
        public let count: Double?
    }

    /// "200 g rice, 2 eggs and chicken breast" → three parts.
    public static func parts(of line: String) -> [Part] {
        let separators = try! NSRegularExpression(pattern: #"\s*(?:,|;|\+|&|\n|\band\b|\ben\b|\bmet\b|\bwith\b)\s*"#, options: .caseInsensitive)
        let lowered = line.lowercased()
        let range = NSRange(lowered.startIndex..., in: lowered)
        let joined = separators.stringByReplacingMatches(in: lowered, range: range, withTemplate: "|")
        let gramsPattern = try! NSRegularExpression(pattern: #"(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram|grams|grammes|ml)\b"#)
        let countPattern = try! NSRegularExpression(pattern: #"^\s*(\d+(?:[.,]\d+)?|a|an|een|half)\s+"#)

        return joined.split(separator: "|").compactMap { raw -> Part? in
            var text = String(raw).trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { return nil }
            var grams: Double?
            var count: Double?
            let whole = NSRange(text.startIndex..., in: text)
            if let match = gramsPattern.firstMatch(in: text, range: whole),
               let numberRange = Range(match.range(at: 1), in: text),
               let fullRange = Range(match.range, in: text) {
                grams = Double(text[numberRange].replacingOccurrences(of: ",", with: "."))
                text.removeSubrange(fullRange)
            } else if let match = countPattern.firstMatch(in: text, range: whole),
                      let numberRange = Range(match.range(at: 1), in: text),
                      let fullRange = Range(match.range, in: text) {
                let word = String(text[numberRange])
                count = ["a", "an", "een"].contains(word) ? 1 : word == "half" ? 0.5 : Double(word.replacingOccurrences(of: ",", with: "."))
                text.removeSubrange(fullRange)
            }
            let words = text
                .replacingOccurrences(of: #"\b(of|van|gram|grams)\b"#, with: " ", options: .regularExpression)
                .split(separator: " ").joined(separator: " ")
            return words.isEmpty ? nil : Part(words: words, grams: grams, count: count)
        }
    }

    /// The table's food a few words mean: the longest alias found in them.
    public static func match(_ words: String) -> Food? {
        let lowered = words.lowercased().folding(options: .diacriticInsensitive, locale: nil)
        let text = " \(lowered) "
        let tokens = lowered.split(separator: " ").map(String.init)
        var best: (Food, Int)?
        for food in foods {
            for raw in food.aliases {
                let alias = raw.folding(options: .diacriticInsensitive, locale: nil)
                // A whole word, or — for a long, specific name — inside a
                // Dutch compound: "kippenpasteitje" is still kippenpastei.
                let whole = text.contains(" \(alias) ") || text.contains(" \(alias)s ") || text.contains(" \(alias)en ")
                let inside = alias.count >= 6 && !alias.contains(" ") && tokens.contains { $0.contains(alias) }
                if (whole || inside), alias.count > (best?.1 ?? 0) { best = (food, alias.count) }
            }
        }
        if let best { return best.0 }
        // A typo in a longer name: "kippenpqstei" is still kippenpastei.
        var closest: (Food, Int)?
        for food in foods {
            for raw in food.aliases where raw.count >= 6 && !raw.contains(" ") {
                let alias = raw.folding(options: .diacriticInsensitive, locale: nil)
                for token in tokens where abs(token.count - alias.count) <= 2 {
                    let distance = Self.distance(token, alias)
                    if distance <= 2, distance < (closest?.1 ?? 3) { closest = (food, distance) }
                }
            }
        }
        return closest?.0
    }

    /// Letters to change, add or remove to turn one word into the other.
    static func distance(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        guard !a.isEmpty else { return b.count }
        guard !b.isEmpty else { return a.count }
        var previous = Array(0...b.count)
        for i in 1...a.count {
            var current = [i] + Array(repeating: 0, count: b.count)
            for j in 1...b.count {
                current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1))
            }
            previous = current
        }
        return previous[b.count]
    }

    /// Other table foods a few words could mean, best first — what "Other
    /// match" offers next to the one chosen.
    public static func candidates(_ words: String, limit: Int = 4) -> [Food] {
        let tokens = Set(words.lowercased().split(separator: " ").map(String.init).filter { $0.count >= 3 })
        guard !tokens.isEmpty else { return [] }
        return foods
            .map { food -> (Food, Int) in
                // Short aliases ("ei", "kip") only count as whole words: inside
                // "kippenpastei" they mean nothing.
                let score = food.aliases.reduce(0) { total, alias in
                    total + tokens.filter { token in
                        token == alias || (alias.count >= 4 && token.contains(alias)) || (token.count >= 4 && alias.contains(token))
                    }.count
                }
                return (food, score)
            }
            .filter { $0.1 > 0 }
            .sorted { $0.1 > $1.1 }
            .prefix(limit)
            .map(\.0)
    }

    /// The words that carry meaning in what was typed, folded: no accents,
    /// no filler, and brands written one way ("dokter" → "dr").
    static func significant(_ text: String) -> [String] {
        let filler: Set<String> = ["met", "and", "with", "van", "the", "een", "and", "of", "en", "de", "het"]
        let synonyms = ["dokter": "dr", "doctor": "dr", "dr.": "dr"]
        return text.lowercased().folding(options: .diacriticInsensitive, locale: nil)
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            .map { synonyms[String($0)] ?? String($0) }
            .filter { ($0.count >= 3 || $0 == "dr") && !filler.contains($0) }
    }

    /// A typed word found among others: exactly, inside one, or one or two
    /// letters off for a longer word ("bolognaise" is bolognese).
    static func found(_ word: String, in words: [String]) -> Bool {
        words.contains { other in
            other == word || (word.count >= 4 && other.contains(word)) || (other.count >= 4 && word.contains(other))
                || (word.count >= 6 && abs(other.count - word.count) <= 2 && distance(word, other) <= 2)
        }
    }

    /// How well a product answers what was typed, 0…1: the share of the
    /// typed words found in its name and brand, with a little extra for a
    /// generic table food over a brand.
    public static func similarity(_ query: String, to name: String, brand: String) -> Double {
        let asked = significant(query)
        guard !asked.isEmpty else { return 0 }
        let haystack = significant("\(name) \(brand)")
        let hits = asked.filter { found($0, in: haystack) }.count
        var score = Double(hits) / Double(asked.count)
        if brand.lowercased() == "generiek" || brand.isEmpty { score += 0.15 }
        return min(1, score)
    }

    /// How much of what was typed a table food explains, 0…1. "pizza" is
    /// all of "pizza", but only a third of "dr oetker pizza bolognese" — then
    /// the product itself answers better than a general pizza.
    public static func coverage(_ query: String, by food: Food) -> Double {
        let asked = significant(query)
        guard !asked.isEmpty else { return 0 }
        let words = food.aliases.flatMap { significant($0) } + significant(food.name)
        return Double(asked.filter { found($0, in: words) }.count) / Double(asked.count)
    }

    // MARK: - Questions that make it precise

    /// A question the scan can ask about a food it found — what's on the
    /// bread, which sauce, how big the plate was — answered with a tap.
    public struct Question: Identifiable, Equatable, Sendable {
        public enum Kind: Equatable, Sendable {
            /// Each answer adds its own row (the Nutella on the bread).
            case adds
            /// One answer scales the food itself (a large plate).
            case size
        }

        public struct Answer: Identifiable, Equatable, Sendable {
            public let id: String
            public let label: String
            /// For `adds`: the table food it adds, and how much — per piece of
            /// the food asked about (a slice), or for the whole of it.
            public let addsKey: String?
            public let grams: Double
            public let perPiece: Bool
            /// For `size`: what the usual amount is multiplied by.
            public let factor: Double
        }

        public let id: String
        public let text: String
        public let symbol: String
        public let kind: Kind
        public let answers: [Answer]
    }

    private static func add(_ id: String, _ label: String, _ key: String, _ grams: Double, perPiece: Bool = false) -> Question.Answer {
        .init(id: id, label: label, addsKey: key, grams: grams, perPiece: perPiece, factor: 1)
    }

    private static let sizeQuestion = Question(
        id: "size", text: "How big was your plate?", symbol: "circle.dashed", kind: .size,
        answers: [
            .init(id: "small", label: "Small", addsKey: nil, grams: 0, perPiece: false, factor: 0.7),
            .init(id: "normal", label: "Normal", addsKey: nil, grams: 0, perPiece: false, factor: 1),
            .init(id: "large", label: "Large", addsKey: nil, grams: 0, perPiece: false, factor: 1.4),
        ]
    )

    /// The questions worth asking about a food, by its table key.
    public static func questions(for key: String?) -> [Question] {
        guard let key else { return [] }
        let breads: Set<String> = ["bread", "white_bread", "pistolet", "bagel", "croissant", "tortilla", "pancake", "crepe", "waffle", "sandwich"]
        let starches: Set<String> = ["pasta", "spaghetti", "rice", "potato"]
        let dishes: Set<String> = ["pizza", "pie", "stew", "stamppot", "bolognese", "lasagna", "casserole", "witloof", "waterzooi", "curry",
                                   "nasi", "bami", "chili", "risotto", "paella", "ramen", "stir_fry", "soup", "quiche", "kebab", "burrito", "sushi"]
        let bowls: Set<String> = ["yogurt", "skyr", "quark", "oatmeal", "oats", "cereal", "cottage_cheese"]
        if breads.contains(key) {
            return [Question(id: "on", text: "What's on it?", symbol: "square.stack.3d.down.forward", kind: .adds, answers: [
                add("butter", "Butter", "butter", 5, perPiece: true),
                add("choco", "Choco / Nutella", "choco_spread", 15, perPiece: true),
                add("jam", "Jam", "jam", 15, perPiece: true),
                add("peanut", "Peanut butter", "peanut_butter", 15, perPiece: true),
                add("cheese", "Cheese", "cheese", 20, perPiece: true),
                add("ham", "Ham", "ham", 20, perPiece: true),
                add("chicken", "Chicken spread", "chicken_spread", 20, perPiece: true),
                add("speculoos", "Speculoos", "speculoos", 15, perPiece: true),
                add("honey", "Honey", "honey", 10, perPiece: true),
            ])]
        }
        if starches.contains(key) {
            return [Question(id: "sauce", text: "Any sauce with it?", symbol: "drop.fill", kind: .adds, answers: [
                add("tomato", "Tomato sauce", "tomato_sauce", 100),
                add("meat", "Meat sauce", "meat_sauce", 120),
                add("pesto", "Pesto", "pesto", 30),
                add("cream", "Cream sauce", "cream_sauce", 80),
                add("cheese", "Grated cheese", "grated_cheese", 15),
                add("oil", "Oil or butter", "olive_oil", 10),
            ])]
        }
        if key == "fries" {
            return [Question(id: "sauce", text: "Sauce with your fries?", symbol: "drop.fill", kind: .adds, answers: [
                add("mayo", "Mayo", "mayonnaise", 30),
                add("ketchup", "Ketchup", "ketchup", 20),
                add("fries_sauce", "Fries sauce", "fries_sauce", 30),
            ])]
        }
        if key == "salad" {
            return [Question(id: "dressing", text: "Any dressing?", symbol: "drop.fill", kind: .adds, answers: [
                add("vinaigrette", "Vinaigrette", "vinaigrette", 20),
                add("caesar", "Caesar", "caesar", 20),
                add("oil", "Olive oil", "olive_oil", 10),
                add("cheese", "Cheese", "grated_cheese", 15),
            ])]
        }
        if key == "coffee" || key == "tea_drink" {
            return [Question(id: "milk", text: "Milk or sugar?", symbol: "cup.and.saucer.fill", kind: .adds, answers: [
                add("milk", "Milk", "milk", 30),
                add("sugar", "Sugar", "sugar", 5),
            ])]
        }
        if bowls.contains(key) {
            return [Question(id: "topping", text: "Anything on top?", symbol: "sparkles", kind: .adds, answers: [
                add("fruit", "Fruit", "berry", 75),
                add("granola", "Granola", "cereal", 30),
                add("honey", "Honey", "honey", 10),
                add("nuts", "Nuts", "nut", 15),
                add("peanut", "Peanut butter", "peanut_butter", 15),
            ])]
        }
        if dishes.contains(key) { return [sizeQuestion] }
        return []
    }

    /// The row an answer adds to a food: the topping at its amount — per
    /// slice when it goes on each slice, so choco on four slices is four
    /// times fifteen grams.
    public static func added(_ answer: Question.Answer, to item: ScannedFood) -> ScannedFood? {
        guard let key = answer.addsKey, let food = foods.first(where: { $0.key == key }) else { return nil }
        let base = foods.first { $0.key == item.key }
        let pieces = answer.perPiece ? max(1, (item.grams / (base?.pieceGrams ?? item.grams)).rounded()) : 1
        return food.scanned(grams: answer.grams * pieces, confidence: .high)
    }

    /// A food at its usual amount times a size answer.
    public static func sized(_ item: ScannedFood, by answer: Question.Answer) -> ScannedFood {
        let usual = foods.first { $0.key == item.key }?.grams ?? item.grams
        return item.scaled(to: (usual * answer.factor).rounded())
    }

    /// A typed part as a food, when the table knows it: the amount as typed,
    /// pieces as pieces, otherwise its usual portion.
    public static func scanned(_ part: Part) -> ScannedFood? {
        guard let food = match(part.words) else { return nil }
        if let grams = part.grams { return food.scanned(grams: grams, confidence: .high) }
        if let count = part.count {
            return food.scanned(grams: (food.pieceGrams ?? food.grams) * count, confidence: .high)
        }
        return food.scanned(confidence: .medium)
    }
}
