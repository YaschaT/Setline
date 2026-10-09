import Foundation

/// Everyday foods to log in one tap, with a portion people actually eat.
///
/// Values per 100 g are rounded from standard nutrition tables (USDA
/// FoodData Central); the photos are free-licence images, credited in Account. They are suggestions, not products: a logged idea says "per
/// portion" and can be changed on its row like anything else.
public struct FoodIdea: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let grams: Double
    /// How the portion is said: "150 g", "2 eggs".
    public let portion: String
    public let per100: (calories: Double, protein: Double, carbs: Double, fat: Double)
    /// The bundled photo: a free-licence image from Wikimedia Commons or
    /// Openverse, square-cropped so every card matches.
    public let imageName: String
    /// Who made the photo and under which licence, for the credits screen.
    public let credit: String

    public var calories: Double { (per100.calories * grams / 100).rounded() }
    public var protein: Double { (per100.protein * grams / 100).rounded() }
    public var carbs: Double { (per100.carbs * grams / 100).rounded() }
    public var fat: Double { (per100.fat * grams / 100).rounded() }

    public static func == (lhs: FoodIdea, rhs: FoodIdea) -> Bool { lhs.id == rhs.id }

    /// The entry a tap logs, on `date`'s day, for `meal`.
    public func entry(id: String, date: Date, meal: Meal, calendar: Calendar = .current) -> NutritionEntry {
        NutritionEntry(
            id: id,
            date: Schedule.dateKey(date, calendar: calendar),
            meal: meal.rawValue,
            name: name,
            calories: calories,
            protein: protein,
            carbs: carbs,
            fat: fat,
            amount: grams,
            unit: "g",
            loggedAt: date
        )
    }
}

public enum FoodIdeas {
    public static let all: [FoodIdea] = [
        .init(id: "chicken", name: "Chicken breast", grams: 150, portion: "150 g",
              per100: (165, 31, 0, 3.6), imageName: "FoodChicken",
              credit: "Farhan Tahir · CC BY 3.0 · Wikimedia Commons"),
        .init(id: "yogurt", name: "Greek yogurt", grams: 250, portion: "250 g",
              per100: (59, 10, 3.6, 0.4), imageName: "FoodYogurt",
              credit: "U.S. Department of Agriculture · CC0 · rawpixel"),
        .init(id: "eggs", name: "Eggs", grams: 100, portion: "2 eggs",
              per100: (143, 12.6, 0.7, 9.5), imageName: "FoodEggs",
              credit: "Boiled Egg – Crossection · CC BY-SA 2.0 · Wikimedia Commons"),
        .init(id: "tuna", name: "Tuna", grams: 120, portion: "1 can",
              per100: (116, 26, 0, 1), imageName: "FoodTuna",
              credit: "jetaime · CC BY-SA 2.0 · Flickr"),
        .init(id: "salmon", name: "Salmon", grams: 150, portion: "150 g",
              per100: (208, 20, 0, 13), imageName: "FoodSalmon",
              credit: "f097653195017 · CC BY-SA 2.0 · Flickr"),
        .init(id: "oats", name: "Oats", grams: 60, portion: "60 g",
              per100: (389, 17, 66, 7), imageName: "FoodOats",
              credit: "USDA · Public domain · Flickr"),
        .init(id: "rice", name: "Rice, cooked", grams: 200, portion: "200 g",
              per100: (130, 2.7, 28, 0.3), imageName: "FoodRice",
              credit: "Douglas P. Perkins · CC0 · Wikimedia Commons"),
        .init(id: "banana", name: "Banana", grams: 120, portion: "1 banana",
              per100: (89, 1.1, 23, 0.3), imageName: "FoodBanana",
              credit: "Filo gèn' · CC BY-SA 4.0 · Wikimedia Commons"),
        .init(id: "cottage", name: "Cottage cheese", grams: 200, portion: "200 g",
              per100: (81, 10.5, 4.8, 2.3), imageName: "FoodCottage",
              credit: "Валентина Тимків · CC BY-SA 4.0 · Wikimedia Commons"),
        .init(id: "quark", name: "Quark", grams: 250, portion: "250 g",
              per100: (67, 12, 4, 0.2), imageName: "FoodQuark",
              credit: "SKopp · CC BY-SA 4.0 · Wikimedia Commons"),
        .init(id: "turkey", name: "Turkey breast", grams: 150, portion: "150 g",
              per100: (135, 30, 0, 1), imageName: "FoodTurkey",
              credit: "Missvain (Sarah Stierch) · CC BY 4.0 · Wikimedia Commons"),
        .init(id: "shake", name: "Protein shake", grams: 30, portion: "1 scoop",
              per100: (400, 80, 8, 6), imageName: "FoodShake",
              credit: "Sandstein · CC BY 3.0 · Wikimedia Commons"),
        .init(id: "tofu", name: "Tofu", grams: 150, portion: "150 g",
              per100: (144, 17.3, 2.8, 8.7), imageName: "FoodTofu",
              credit: "DryPot · CC BY-SA 3.0 · Wikimedia Commons"),
        .init(id: "lentils", name: "Lentils, cooked", grams: 200, portion: "200 g",
              per100: (116, 9, 20, 0.4), imageName: "FoodLentils",
              credit: "HaJunkiyada · CC BY-SA 4.0 · Wikimedia Commons"),
        .init(id: "bread", name: "Wholegrain bread", grams: 70, portion: "2 slices",
              per100: (247, 13, 41, 3.4), imageName: "FoodBread",
              credit: "Veganbaking.net · CC BY-SA 2.0 · Wikimedia Commons"),
        .init(id: "avocado", name: "Avocado", grams: 75, portion: "½ avocado",
              per100: (160, 2, 8.5, 14.7), imageName: "FoodAvocado",
              credit: "HaJunkiyada · CC BY-SA 4.0 · Wikimedia Commons"),
        .init(id: "blueberries", name: "Blueberries", grams: 125, portion: "1 punnet",
              per100: (57, 0.7, 14.5, 0.3), imageName: "FoodBlueberries",
              credit: "Petar Milošević · CC BY-SA 4.0 · Wikimedia Commons"),
        .init(id: "apple", name: "Apple", grams: 180, portion: "1 apple",
              per100: (52, 0.3, 14, 0.2), imageName: "FoodApple",
              credit: "Abhijit Tembhekar · CC BY 2.0 · Wikimedia Commons"),
    ]

    /// The ideas in the order that helps most today: protein-dense first when
    /// protein is what is missing, otherwise as listed.
    public static func ordered(proteinLeft: Double) -> [FoodIdea] {
        guard proteinLeft > 20 else { return all }
        return all.sorted { ($0.protein / max($0.calories, 1)) > ($1.protein / max($1.calories, 1)) }
    }
}
