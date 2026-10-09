import XCTest
@testable import SetlineCore

final class RecipesTests: XCTestCase {
    func testEveryMealHasRecipes() {
        for meal in [Meal.ontbijt, .lunch, .avondeten, .snack] {
            XCTAssertGreaterThanOrEqual(Recipes.for(meal).count, 3, meal.label)
        }
        XCTAssertEqual(Recipes.for(.preWorkout), Recipes.for(.snack))
    }

    func testMacrosAreTheSumOfTheIngredients() throws {
        let oats = try XCTUnwrap(Recipes.all.first { $0.id == "protein-oats" })
        // 60 g oats 233 + 250 ml milk 118 + 30 g whey 120 + 60 g banana 53 + 50 g blueberries 29 = 553
        XCTAssertEqual(oats.macros.calories, 553)
        // 10.2 + 8.5 + 24 + 0.7 + 0.4 = 43.8
        XCTAssertEqual(oats.macros.protein, 44)
    }

    func testEnergyAgreesWithTheMacros() {
        // 4 kcal per g of protein and carbs, 9 per g of fat — within 15 %,
        // so a typo in a per-100 g value shows up here.
        for recipe in Recipes.all {
            let m = recipe.macros
            let estimate = m.protein * 4 + m.carbs * 4 + m.fat * 9
            XCTAssertEqual(m.calories, estimate, accuracy: estimate * 0.15, recipe.name)
        }
    }

    func testEveryRecipeIsHighProtein() {
        for recipe in Recipes.all where recipe.meal != .snack {
            XCTAssertGreaterThanOrEqual(recipe.macros.protein, 25, recipe.name)
        }
    }

    func testLoggingWritesOneEntryWithTheTotals() throws {
        let bowl = try XCTUnwrap(Recipes.all.first { $0.id == "chicken-rice-bowl" })
        let entry = bowl.entry(id: "x", date: Date(timeIntervalSince1970: 0), meal: .avondeten)
        XCTAssertEqual(entry.name, "Chicken rice bowl")
        XCTAssertEqual(entry.meal, Meal.avondeten.rawValue)
        XCTAssertEqual(entry.calories, bowl.macros.calories)
        XCTAssertEqual(entry.protein, bowl.macros.protein)
    }
}
