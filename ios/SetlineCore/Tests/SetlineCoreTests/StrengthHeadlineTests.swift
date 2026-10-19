import XCTest
@testable import SetlineCore

/// A headline lift is a main lift, ranked by percent gained.
final class StrengthHeadlineTests: XCTestCase {

    private let day = LegacyAdapter.isoDate("2026-09-07T17:00:00.000Z")!

    private func when(_ weeksAgo: Int) -> Date {
        Calendar(identifier: .gregorian).date(byAdding: .weekOfYear, value: -weeksAgo, to: day)!
    }

    private func session(_ id: String, _ date: Date, _ results: [(String, String, Decimal, Int)]) -> TrainingSession {
        TrainingSession(
            id: id, date: date, dayID: "push", dayLabel: "Push", completion: 100,
            results: results.map { ExerciseResult(exerciseID: $0.0, name: $0.1, sets: [LoggedSet(index: 0, weightKg: $0.2, reps: $0.3)]) }
        )
    }

    /// The machine fly gains 30 kg, the bench 5: the bench still leads.
    private var sessions: [TrainingSession] {
        [
            session("a", when(6), [("flat-bench", "Flat bench press", 100, 5), ("pec-fly", "Pec fly", 60, 8)]),
            session("b", when(3), [("flat-bench", "Flat bench press", 102.5, 5), ("pec-fly", "Pec fly", 75, 8)]),
            session("c", when(0), [("flat-bench", "Flat bench press", 105, 5), ("pec-fly", "Pec fly", 90, 8)]),
        ]
    }

    func testAMachineIsolationLiftIsNeverTheHeadline() {
        let rows = ExercisePicker.rows(sessions: sessions)
        let pick = StrengthHeadline.pick(rows: rows, sessions: sessions, plan: [])
        XCTAssertEqual(pick?.exerciseID, "flat-bench")
        XCTAssertFalse(StrengthHeadline.isMainLift("pec-fly", plan: []))
        XCTAssertTrue(StrengthHeadline.isMainLift("flat-bench", plan: []))
    }

    func testThePlanRoleDecidesWhenThePlanHasTheLift() {
        let plan = [WorkoutDay(id: "push", label: "Push", short: "Push", focus: "", exercises: [
            PlannedExercise(exerciseID: "pec-fly", role: .primaryStrength, sets: [], modifiers: .none),
        ])]
        XCTAssertTrue(StrengthHeadline.isMainLift("pec-fly", plan: plan))
    }

    func testThePercentIsOfTheShownNumbers() throws {
        let rows = ExercisePicker.rows(sessions: sessions)
        let pick = try XCTUnwrap(StrengthHeadline.pick(rows: rows, sessions: sessions, plan: []))
        let percent = try XCTUnwrap(StrengthHeadline.percentChange(pick))
        XCTAssertGreaterThan(percent, 0)
        XCTAssertLessThan(percent, 10)
    }
}

final class DayHeadlineTests: XCTestCase {
    private let day = LegacyAdapter.isoDate("2026-09-07T17:00:00.000Z")!
    private func when(_ weeksAgo: Int) -> Date {
        Calendar(identifier: .gregorian).date(byAdding: .weekOfYear, value: -weeksAgo, to: day)!
    }
    private func session(_ id: String, _ date: Date, bench: Decimal, fly: Decimal) -> TrainingSession {
        TrainingSession(id: id, date: date, dayID: "push", dayLabel: "Push", completion: 100, results: [
            ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press", sets: [LoggedSet(index: 0, weightKg: bench, reps: 5)]),
            ExerciseResult(exerciseID: "pec-fly", name: "Pec fly", sets: [LoggedSet(index: 0, weightKg: fly, reps: 8)]),
        ])
    }

    func testTheDaysPercentIsMadeOfItsMainLifts() throws {
        let sessions = [session("a", when(4), bench: 100, fly: 50), session("b", when(0), bench: 105, fly: 75)]
        let since = when(5)
        let all = try XCTUnwrap(ProgressOverview.progressByDay(in: sessions, since: since).first?.changePercent)
        let main = try XCTUnwrap(ProgressOverview.progressByDay(in: sessions, since: since,
                                                                counts: { StrengthHeadline.isMainLift($0, plan: []) }).first?.changePercent)
        XCTAssertGreaterThan(all, 20, "the fly's +50 % pulls the average up")
        XCTAssertEqual(main, 5, "the bench alone")
        XCTAssertEqual(ProgressOverview.progressByDay(in: sessions, since: since, counts: { _ in false }).first?.changePercent, all,
                       "a day without main lifts falls back to all of them")
    }
}
