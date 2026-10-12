import XCTest
@testable import SetlineCore

final class SetAdditionTests: XCTestCase {
    private func session() -> TrainingSession {
        TrainingSession(
            id: "s", date: Date(), dayID: "push", dayLabel: "Push", completion: 100,
            results: [
                ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press", sets: [
                    LoggedSet(index: 0, weightKg: 100, reps: 6),
                    LoggedSet(index: 1, weightKg: 100, reps: 6),
                ]),
                ExerciseResult(exerciseID: "pec-fly", name: "Pec fly", sets: [LoggedSet(index: 0, weightKg: 40, reps: 12)]),
            ]
        )
    }

    func testAddedSetsGoAfterTheOnesThereNumberedOn() {
        let extra = LoggedSet(index: 99, weightKg: 100, reps: 5, origin: .sessionAdded)
        let updated = session().adding([SetAddition(exerciseID: "flat-bench", sets: [extra, extra])])
        XCTAssertEqual(updated.results[0].sets.map(\.index), [0, 1, 2, 3])
        XCTAssertEqual(updated.results[0].sets.last?.reps, 5)
        XCTAssertEqual(updated.results[1].sets.count, 1)
    }

    func testAnExerciseNotInTheWorkoutIsSkipped() {
        let base = session()
        let updated = base.adding([SetAddition(exerciseID: "squat", sets: [LoggedSet(index: 0, weightKg: 140, reps: 5)])])
        XCTAssertEqual(updated, base)
        XCTAssertEqual(updated.results.map(\.sets.count), [2, 1])
    }
}
