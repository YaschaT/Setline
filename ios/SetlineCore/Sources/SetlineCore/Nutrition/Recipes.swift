import Foundation

/// High-protein recipes for each meal of the day, written for SETLINE: what
/// goes in, in grams, and how to make it in a few plain steps.
///
/// Every number is worked out from the ingredients — the same USDA FoodData
/// Central values per 100 g the quick adds use — never typed in, so a recipe
/// and a logged portion of the same food always agree. Each recipe borrows
/// the photo of its main ingredient, so no new imagery has to be licensed.
public struct Recipe: Identifiable, Equatable, Sendable {
    public struct Ingredient: Equatable, Sendable {
        public let name: String
        public let grams: Double
        /// How it is said in the list: "60 g", "3 eggs", "1 tbsp".
        public let amount: String
        let per100: Macros

        public init(_ name: String, _ grams: Double, _ amount: String? = nil, _ per100: Macros) {
            self.name = name
            self.grams = grams
            self.amount = amount ?? "\(Int(grams)) g"
            self.per100 = per100
        }
    }

    public struct Macros: Equatable, Sendable {
        public let calories: Double
        public let protein: Double
        public let carbs: Double
        public let fat: Double
        public init(_ calories: Double, _ protein: Double, _ carbs: Double, _ fat: Double) {
            self.calories = calories; self.protein = protein; self.carbs = carbs; self.fat = fat
        }
    }

    public let id: String
    public let name: String
    public let meal: Meal
    public let minutes: Int
    /// One line on why it is in the list.
    public let summary: String
    public let ingredients: [Ingredient]
    public let steps: [String]
    /// The main ingredient's photo.
    public let imageName: String

    /// The whole recipe, one serving, rounded as the app rounds a portion.
    public var macros: Macros {
        func sum(_ value: (Macros) -> Double) -> Double {
            ingredients.reduce(0) { $0 + value($1.per100) * $1.grams / 100 }.rounded()
        }
        return Macros(sum(\.calories), sum(\.protein), sum(\.carbs), sum(\.fat))
    }

    public var grams: Double { ingredients.reduce(0) { $0 + $1.grams } }

    /// What logging it writes: one entry, the recipe's name and totals.
    public func entry(id: String, date: Date, meal: Meal? = nil, calendar: Calendar = .current) -> NutritionEntry {
        let m = macros
        return NutritionEntry(
            id: id,
            date: Schedule.dateKey(date, calendar: calendar),
            meal: (meal ?? self.meal).rawValue,
            name: name,
            calories: m.calories,
            protein: m.protein,
            carbs: m.carbs,
            fat: m.fat,
            amount: grams.rounded(),
            unit: "g",
            loggedAt: date
        )
    }

    public static func == (lhs: Recipe, rhs: Recipe) -> Bool { lhs.id == rhs.id }
}

public enum Recipes {
    // Per 100 g, rounded from USDA FoodData Central.
    private static let oats = Recipe.Macros(389, 17, 66, 7)
    private static let milk = Recipe.Macros(47, 3.4, 4.8, 1.6)
    private static let whey = Recipe.Macros(400, 80, 8, 6)
    private static let banana = Recipe.Macros(89, 1.1, 23, 0.3)
    private static let blueberries = Recipe.Macros(57, 0.7, 14.5, 0.3)
    private static let quark = Recipe.Macros(67, 12, 4, 0.2)
    private static let honey = Recipe.Macros(304, 0.3, 82, 0)
    private static let eggs = Recipe.Macros(143, 12.6, 0.7, 9.5)
    private static let spinach = Recipe.Macros(23, 2.9, 3.6, 0.4)
    private static let bread = Recipe.Macros(247, 13, 41, 3.4)
    private static let oliveOil = Recipe.Macros(884, 0, 0, 100)
    private static let chicken = Recipe.Macros(165, 31, 0, 3.6)
    private static let rice = Recipe.Macros(130, 2.7, 28, 0.3)
    private static let broccoli = Recipe.Macros(34, 2.8, 7, 0.4)
    private static let soySauce = Recipe.Macros(53, 8, 4.9, 0.6)
    private static let tuna = Recipe.Macros(116, 26, 0, 1)
    private static let wrap = Recipe.Macros(300, 9, 50, 7)
    private static let avocado = Recipe.Macros(160, 2, 8.5, 14.7)
    private static let tomatoes = Recipe.Macros(18, 0.9, 3.9, 0.2)
    private static let yogurt = Recipe.Macros(59, 10, 3.6, 0.4)
    private static let lentils = Recipe.Macros(116, 9, 20, 0.4)
    private static let feta = Recipe.Macros(264, 14, 4, 21)
    private static let cucumber = Recipe.Macros(15, 0.7, 3.6, 0.1)
    private static let salmon = Recipe.Macros(208, 20, 0, 13)
    private static let sweetPotato = Recipe.Macros(86, 1.6, 20, 0.1)
    private static let pasta = Recipe.Macros(348, 14, 71, 2.5)
    private static let beef = Recipe.Macros(137, 21, 0, 5.5)
    private static let passata = Recipe.Macros(30, 1.4, 5.5, 0.2)
    private static let tofu = Recipe.Macros(144, 17.3, 2.8, 8.7)
    private static let cottage = Recipe.Macros(81, 10.5, 4.8, 2.3)
    private static let apple = Recipe.Macros(52, 0.3, 14, 0.2)
    private static let cinnamon = Recipe.Macros(247, 4, 81, 1.2)
    private static let peanutButter = Recipe.Macros(588, 25, 20, 50)
    private static let turkey = Recipe.Macros(135, 30, 0, 1)

    public static let all: [Recipe] = [
        // Breakfast
        Recipe(id: "protein-oats", name: "Protein oats", meal: .ontbijt, minutes: 10,
               summary: "Slow carbs and a protein-heavy start to the day.",
               ingredients: [
                   .init("Oats", 60, nil, oats), .init("Semi-skimmed milk", 250, "250 ml", milk),
                   .init("Whey protein", 30, "1 scoop", whey), .init("Banana", 60, "½ banana", banana),
                   .init("Blueberries", 50, nil, blueberries),
               ],
               steps: [
                   "Bring the oats and milk to a gentle simmer and stir for 4–5 minutes until thick.",
                   "Take the pan off the heat and stir in the whey until smooth — off the heat, so it does not clump.",
                   "Slice the banana over the top and add the blueberries.",
               ],
               imageName: "FoodOats"),
        Recipe(id: "quark-bowl", name: "Quark berry bowl", meal: .ontbijt, minutes: 5,
               summary: "No cooking, done in five minutes.",
               ingredients: [
                   .init("Quark", 250, nil, quark), .init("Blueberries", 100, nil, blueberries),
                   .init("Oats", 30, nil, oats), .init("Honey", 10, "2 tsp", honey),
               ],
               steps: [
                   "Spoon the quark into a bowl and stir it until creamy.",
                   "Top with the blueberries and scatter the oats over for crunch.",
                   "Drizzle with the honey.",
               ],
               imageName: "FoodQuark"),
        Recipe(id: "spinach-scramble", name: "Spinach scramble on toast", meal: .ontbijt, minutes: 10,
               summary: "Three eggs, greens and wholegrain bread.",
               ingredients: [
                   .init("Eggs", 150, "3 eggs", eggs), .init("Spinach", 50, "2 handfuls", spinach),
                   .init("Wholegrain bread", 70, "2 slices", bread), .init("Olive oil", 5, "1 tsp", oliveOil),
               ],
               steps: [
                   "Toast the bread.",
                   "Warm the oil in a pan over medium heat and wilt the spinach for a minute.",
                   "Whisk the eggs with a pinch of salt, pour them in and stir slowly until just set.",
                   "Pile onto the toast and finish with black pepper.",
               ],
               imageName: "FoodEggs"),

        // Lunch
        Recipe(id: "chicken-rice-bowl", name: "Chicken rice bowl", meal: .lunch, minutes: 20,
               summary: "The classic: lean protein, rice and greens.",
               ingredients: [
                   .init("Chicken breast", 150, nil, chicken), .init("Rice, cooked", 200, nil, rice),
                   .init("Broccoli", 100, nil, broccoli), .init("Soy sauce", 10, "2 tsp", soySauce),
                   .init("Olive oil", 5, "1 tsp", oliveOil),
               ],
               steps: [
                   "Cut the chicken into strips and season with salt and pepper.",
                   "Fry in the oil over medium-high heat for 6–7 minutes, turning, until cooked through.",
                   "Steam or boil the broccoli for 4 minutes.",
                   "Fill a bowl with the rice, add the chicken and broccoli, and pour over the soy sauce.",
               ],
               imageName: "FoodChicken"),
        Recipe(id: "tuna-avocado-wrap", name: "Tuna avocado wrap", meal: .lunch, minutes: 10,
               summary: "Pantry protein, ready in ten minutes.",
               ingredients: [
                   .init("Tuna", 120, "1 can", tuna), .init("Wholewheat wrap", 60, "1 wrap", wrap),
                   .init("Avocado", 50, "⅓ avocado", avocado), .init("Cherry tomatoes", 60, "5 tomatoes", tomatoes),
                   .init("Greek yogurt", 30, "2 tbsp", yogurt),
               ],
               steps: [
                   "Drain the tuna and mix it with the yogurt, salt and pepper.",
                   "Mash the avocado and spread it over the wrap.",
                   "Add the tuna and the halved tomatoes, then roll it up tightly and cut in two.",
               ],
               imageName: "FoodTuna"),
        Recipe(id: "lentil-feta-salad", name: "Lentil feta salad", meal: .lunch, minutes: 15,
               summary: "Plant protein and fibre that keeps you full.",
               ingredients: [
                   .init("Lentils, cooked", 200, nil, lentils), .init("Feta", 40, nil, feta),
                   .init("Cucumber", 100, "⅓ cucumber", cucumber), .init("Cherry tomatoes", 80, nil, tomatoes),
                   .init("Spinach", 30, "1 handful", spinach), .init("Olive oil", 10, "2 tsp", oliveOil),
               ],
               steps: [
                   "Rinse and drain the lentils.",
                   "Dice the cucumber and halve the tomatoes.",
                   "Toss everything with the spinach, the oil and a squeeze of lemon.",
                   "Crumble the feta over the top.",
               ],
               imageName: "FoodLentils"),

        // Dinner
        Recipe(id: "salmon-tray", name: "Salmon sweet potato tray", meal: .avondeten, minutes: 30,
               summary: "One tray, omega-3s and slow carbs.",
               ingredients: [
                   .init("Salmon", 150, "1 fillet", salmon), .init("Sweet potato", 250, "1 medium", sweetPotato),
                   .init("Broccoli", 150, nil, broccoli), .init("Olive oil", 10, "2 tsp", oliveOil),
               ],
               steps: [
                   "Heat the oven to 200 °C.",
                   "Cut the sweet potato into wedges, toss with half the oil and roast for 15 minutes.",
                   "Add the salmon and the broccoli, drizzle with the rest of the oil and season.",
                   "Roast 12 minutes more, until the salmon flakes.",
               ],
               imageName: "FoodSalmon"),
        Recipe(id: "beef-pasta", name: "Lean beef pasta", meal: .avondeten, minutes: 25,
               summary: "Comfort food, built around lean protein.",
               ingredients: [
                   .init("Wholewheat pasta, dry", 90, nil, pasta), .init("Lean beef mince", 125, nil, beef),
                   .init("Passata", 200, "200 ml", passata), .init("Spinach", 40, "1 handful", spinach),
               ],
               steps: [
                   "Cook the pasta in salted water as the pack says.",
                   "Brown the mince in a dry pan over high heat, breaking it up, for 5 minutes.",
                   "Add the passata, season, and simmer for 10 minutes.",
                   "Stir the spinach through until wilted, then toss with the drained pasta.",
               ],
               imageName: "FoodPasta"),
        Recipe(id: "tofu-stir-fry", name: "Tofu stir-fry", meal: .avondeten, minutes: 20,
               summary: "Fully plant-based and protein-rich.",
               ingredients: [
                   .init("Tofu, firm", 200, nil, tofu), .init("Rice, cooked", 180, nil, rice),
                   .init("Broccoli", 120, nil, broccoli), .init("Soy sauce", 15, "1 tbsp", soySauce),
                   .init("Olive oil", 10, "2 tsp", oliveOil),
               ],
               steps: [
                   "Press the tofu dry with a towel and cut it into cubes.",
                   "Fry in the oil over high heat for 8 minutes until golden on all sides.",
                   "Add the broccoli and a splash of water, cover, and steam for 3 minutes.",
                   "Stir in the soy sauce and serve over the rice.",
               ],
               imageName: "FoodTofu"),

        // Snacks
        Recipe(id: "cottage-apple", name: "Cottage cheese & apple", meal: .snack, minutes: 2,
               summary: "Sweet, crunchy, and slow-digesting protein.",
               ingredients: [
                   .init("Cottage cheese", 200, nil, cottage), .init("Apple", 150, "1 small apple", apple),
                   .init("Cinnamon", 1, "a pinch", cinnamon),
               ],
               steps: [
                   "Dice the apple.",
                   "Spoon over the cottage cheese and dust with cinnamon.",
               ],
               imageName: "FoodCottage"),
        Recipe(id: "peanut-yogurt", name: "Peanut yogurt bowl", meal: .snack, minutes: 3,
               summary: "Creamy and filling between meals.",
               ingredients: [
                   .init("Greek yogurt", 200, nil, yogurt), .init("Peanut butter", 15, "1 tbsp", peanutButter),
                   .init("Blueberries", 60, nil, blueberries),
               ],
               steps: [
                   "Stir the peanut butter loosely through the yogurt, leaving ribbons.",
                   "Top with the blueberries.",
               ],
               imageName: "FoodYogurt"),
        Recipe(id: "turkey-avocado-toast", name: "Turkey avocado toast", meal: .snack, minutes: 5,
               summary: "A savoury snack between meals.",
               ingredients: [
                   .init("Wholegrain bread", 35, "1 slice", bread), .init("Turkey breast", 60, "3 slices", turkey),
                   .init("Avocado", 30, "¼ avocado", avocado),
               ],
               steps: [
                   "Toast the bread and spread the avocado over it.",
                   "Lay the turkey on top and finish with pepper and a little salt.",
               ],
               imageName: "FoodTurkey"),
    ]

    /// Photos only recipes use, credited beside the quick adds' own.
    public static let photoCredits: [(name: String, credit: String)] = [
        ("Lean beef pasta", "HaJunkiyada · CC BY-SA 4.0 · Wikimedia Commons"),
    ]

    /// The recipes for one meal. Pre-workout borrows the snacks.
    public static func `for`(_ meal: Meal) -> [Recipe] {
        let wanted: Meal = meal == .preWorkout ? .snack : meal
        return all.filter { $0.meal == wanted }
    }
}
