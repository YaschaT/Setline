import XCTest
@testable import SetlineCore

/// What friends asked for after testing on their own phones (2026-10-30).
final class FriendFeedbackTests: XCTestCase {
    func testATypedRestLengthReadsTheWayPeopleTypeIt() {
        XCTAssertEqual(RestTimerState.parseLength("1:30"), 90)
        XCTAssertEqual(RestTimerState.parseLength("1.30"), 90)
        XCTAssertEqual(RestTimerState.parseLength("1,5"), 90)
        XCTAssertEqual(RestTimerState.parseLength("2"), 120)
        XCTAssertEqual(RestTimerState.parseLength("90"), 90)
        XCTAssertEqual(RestTimerState.parseLength("130"), 90)
        XCTAssertEqual(RestTimerState.parseLength("245"), 165)
        XCTAssertEqual(RestTimerState.parseLength("5"), 300)
        XCTAssertNil(RestTimerState.parseLength("1:75"))
        XCTAssertNil(RestTimerState.parseLength("abc"))
        XCTAssertNil(RestTimerState.parseLength("16:00"))
    }

    func testASetWithoutWeightIsASet() {
        XCTAssertTrue(LoggedSet(index: 0, weightKg: 0, reps: 8).isLogged)
        XCTAssertFalse(LoggedSet(index: 0, weightKg: nil, reps: 8).isLogged)
        XCTAssertFalse(LoggedSet(index: 0, weightKg: 0, reps: 0).isLogged)
    }

    func testYourOwnWeekWinsFromItsStartDateOn() {
        let calendar = Calendar.current
        let friday = calendar.date(from: DateComponents(year: 2026, month: 10, day: 30))!
        let thursday = calendar.date(from: DateComponents(year: 2026, month: 10, day: 29))!
        let week = [Schedule.weekKey(5): "custom-abc", Schedule.weekKey(4): "custom-abc", Schedule.weekFromKey: "2026-10-30"]
        XCTAssertEqual(Schedule.canonicalDay(for: friday, overrides: week), "custom-abc")
        // Before it was made, the week stays as it was: nothing turns into a missed day.
        XCTAssertEqual(Schedule.canonicalDay(for: thursday, overrides: week), Schedule.defaultWeek[4])
        // A date's own change still wins.
        XCTAssertEqual(Schedule.canonicalDay(for: friday, overrides: week.merging(["2026-10-30": "rest"]) { $1 }), "rest")
    }

    func testAWorkoutSurvivesTheTripThroughALink() throws {
        let workout = CustomWorkout(name: "Friday Pump 💪", items: [
            .init(exerciseID: "flat-bench", sets: 4, repLow: 6, repHigh: 8), .init(exerciseID: "hack-squat"),
        ])
        let received = try XCTUnwrap(CustomWorkoutLink.received(CustomWorkoutLink.code(workout)))
        XCTAssertEqual(received.workout.name, "Friday Pump 💪")
        XCTAssertEqual(received.workout.items, workout.items)
        XCTAssertNotEqual(received.workout.id, workout.id)
        XCTAssertEqual(received.skipped, 0)
    }

    func testALinkFromTheWebReadsTheSameHere() {
        // Made by the web app: {"n":"Friday Pump 💪","i":["flat-bench~4~6~8","hack-squat~3~8~10","cable-curl~3~10~12","not-a-real-one~3~8~12"]}
        let code = "eyJuIjoiRnJpZGF5IFB1bXAg8J-SqiIsImkiOlsiZmxhdC1iZW5jaH40fjZ-OCIsImhhY2stc3F1YXR-M344fjEwIiwiY2FibGUtY3VybH4zfjEwfjEyIiwibm90LWEtcmVhbC1vbmV-M344fjEyIl19"
        let received = CustomWorkoutLink.received(code)
        XCTAssertEqual(received?.workout.items.count, 3)
        XCTAssertEqual(received?.skipped, 1)
        XCTAssertEqual(received?.workout.name, "Friday Pump 💪")
        XCTAssertNil(CustomWorkoutLink.received("%%%"))
    }
}
