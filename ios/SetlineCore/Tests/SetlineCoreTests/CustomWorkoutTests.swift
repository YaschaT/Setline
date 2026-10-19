import XCTest
@testable import SetlineCore

final class CustomWorkoutTests: XCTestCase {

    private let workout = CustomWorkout(id: "custom-test", name: "Arms", items: [
        .init(exerciseID: "strict-curl", sets: 4),
        .init(exerciseID: "pressdown", sets: 3, repLow: 10, repHigh: 15),
    ], createdAt: Date(timeIntervalSince1970: 1_760_000_000))

    func testItReadsAsAPlanDay() {
        let day = workout.workoutDay
        XCTAssertEqual(day.id, "custom-test")
        XCTAssertEqual(day.short, "Arms")
        XCTAssertEqual(day.exercises.map(\.exerciseID), ["strict-curl", "pressdown"])
        XCTAssertEqual(day.exercises[0].sets.count, 4)
        XCTAssertEqual(day.exercises[1].sets.first?.repRange, 10...15)
        XCTAssertTrue(CustomWorkout.isCustom(dayID: day.id))
    }

    func testSavedChangedAndRemovedThroughTheSharedState() throws {
        var state = StateMerge.apply([StateChange(.upsertCustomWorkout(workout))], to: LegacyState(raw: [:]))
        XCTAssertEqual(LegacyAdapter.customWorkouts(from: state), [workout])

        var renamed = workout
        renamed.name = "Arms day"
        state = StateMerge.apply([StateChange(.upsertCustomWorkout(renamed))], to: state)
        XCTAssertEqual(LegacyAdapter.customWorkouts(from: state).map(\.name), ["Arms day"])

        state = StateMerge.apply([StateChange(.removeCustomWorkout(id: workout.id))], to: state)
        XCTAssertTrue(LegacyAdapter.customWorkouts(from: state).isEmpty)
    }

    func testTheChangeSurvivesTheQueue() throws {
        let change = StateChange(.upsertCustomWorkout(workout))
        let data = try StateChange.encoder.encode(change)
        XCTAssertEqual(try StateChange.decoder.decode(StateChange.self, from: data).kind, change.kind)
    }
}

final class CustomWorkoutScheduleTests: XCTestCase {
    func testAnOwnWorkoutPutOnADayIsThatDaysWorkout() throws {
        let arms = CustomWorkout(id: "custom-arms", name: "Arms", items: [.init(exerciseID: "strict-curl")])
        let plan = PlanCatalog.personal + [arms.workoutDay]
        let monday = Schedule.mondayFirstWeek(containing: Date()).first!
        let key = Schedule.dateKey(monday)
        let week = Agenda.week(containing: monday, plan: plan, overrides: [key: arms.id], sessions: [])
        XCTAssertEqual(week.first { $0.key == key }?.plannedDay?.id, "custom-arms")

        let options = DayPlan.make(for: monday, plan: plan, overrides: [:], sessions: []).options
        XCTAssertTrue(options.contains { $0.kind == .session(id: "custom-arms") }, "offered when changing a day")
    }
}
