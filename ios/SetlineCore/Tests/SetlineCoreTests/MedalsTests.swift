import XCTest
@testable import SetlineCore

final class MedalsTests: XCTestCase {
    private func session(_ day: Int, weight: Decimal, reps: Int = 5, id: String? = nil) -> TrainingSession {
        TrainingSession(id: id ?? "s\(day)", date: Date(timeIntervalSince1970: Double(day) * 86_400), dayID: "push", dayLabel: "Push",
                        completion: 100, results: [ExerciseResult(exerciseID: "bench", name: "Bench", sets: [LoggedSet(index: 0, weightKg: weight, reps: reps)])])
    }

    func testNoMedalBeforeThreeComparableSessions() {
        let history = [session(1, weight: 80), session(2, weight: 82.5)]
        let today = session(3, weight: 100)
        XCTAssertTrue(Medals.medals(for: today, in: history + [today]).isEmpty)
    }

    func testHeaviestDayEverIsGold() throws {
        let history = [session(1, weight: 80), session(2, weight: 85), session(3, weight: 90)]
        let today = session(4, weight: 95)
        let medal = try XCTUnwrap(Medals.medals(for: today, in: history + [today]).first)
        XCTAssertEqual(medal.place, .gold)
        XCTAssertEqual(medal.weightKg, 95)
        XCTAssertEqual(medal.sessionsCompared, 3)
    }

    func testSecondAndThirdBestEarnSilverAndBronze() throws {
        let history = [session(1, weight: 80), session(2, weight: 100), session(3, weight: 90), session(4, weight: 70)]
        let silver = session(5, weight: 95)
        XCTAssertEqual(Medals.medals(for: silver, in: history + [silver]).first?.place, .silver)
        let bronze = session(5, weight: 85)
        XCTAssertEqual(Medals.medals(for: bronze, in: history + [bronze]).first?.place, .bronze)
        let none = session(5, weight: 75)
        XCTAssertTrue(Medals.medals(for: none, in: history + [none]).isEmpty)
    }

    func testMoreRepsAtTheSameLoadCountsAsAStrongerEffort() throws {
        let history = [session(1, weight: 100, reps: 5), session(2, weight: 100, reps: 5), session(3, weight: 100, reps: 6)]
        let today = session(4, weight: 100, reps: 8)
        XCTAssertEqual(Medals.medals(for: today, in: history + [today]).first?.place, .gold)
    }

    func testLaterSessionsNeverCount() {
        let history = [session(1, weight: 80), session(2, weight: 85), session(3, weight: 90)]
        let today = session(4, weight: 95)
        let later = session(9, weight: 140)
        XCTAssertEqual(Medals.medals(for: today, in: history + [today, later]).first?.place, .gold)
    }

    func testMatchingTheBestIsSilverNotGold() {
        let history = [session(1, weight: 80), session(2, weight: 95), session(3, weight: 90)]
        let today = session(4, weight: 95)
        XCTAssertEqual(Medals.medals(for: today, in: history + [today]).first?.place, .silver)
    }

    func testRepeatingTheSameWeightEveryTimeEarnsNothing() {
        let history = [session(1, weight: 100), session(2, weight: 100), session(3, weight: 100)]
        let today = session(4, weight: 100)
        XCTAssertTrue(Medals.medals(for: today, in: history + [today]).isEmpty)
    }
}
