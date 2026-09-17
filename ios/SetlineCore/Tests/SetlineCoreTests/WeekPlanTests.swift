import XCTest
@testable import SetlineCore

/// The week of Monday 14 September 2026, which the plan shapes as
/// push · pull · legs · rest · lower · upper · rest.
final class WeekPlanTests: XCTestCase {

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        calendar.locale = Locale(identifier: "nl_BE")
        return calendar
    }

    private let monday = LegacyAdapter.isoDate("2026-09-14T12:00:00.000Z")!
    private let plan = PlanCatalog.personal

    private func week(_ overrides: [String: String] = [:]) -> [WeekPlan.Day] {
        WeekPlan.week(containing: monday, overrides: overrides, plan: plan, calendar: calendar)
    }

    private func draft(_ overrides: [String: String] = [:]) -> WeekDraft {
        WeekDraft(
            dates: Schedule.mondayFirstWeek(containing: monday, calendar: calendar),
            overrides: overrides,
            calendar: calendar
        )
    }

    // MARK: Reading the week

    func testTheWeekIsTheShapeThePlanGivesIt() {
        let days = week()
        XCTAssertEqual(days.map(\.key), [
            "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17",
            "2026-09-18", "2026-09-19", "2026-09-20",
        ])
        XCTAssertEqual(days.map { $0.workout?.id }, ["push", "pull", "legs", nil, "lower", "upper", nil])
        XCTAssertEqual(days.first?.weekday, "ma")
    }

    func testADayThePlanRestsOnAndNobodyTouchedIsOpen() {
        XCTAssertEqual(week()[3].kind, .open)
    }

    func testMarkingThatDayMakesItARestDay() {
        XCTAssertEqual(week(["2026-09-17": "rest"])[3].kind, .rest)
    }

    func testNothingIsAnnouncedAsMovedWhenNothingMoved() {
        XCTAssertTrue(week().allSatisfy { $0.movedFrom == nil })
    }

    func testASessionSittingElsewhereSaysWhereItUsuallyIs() {
        let days = week(["2026-09-14": "rest", "2026-09-17": "push"])
        XCTAssertEqual(days[3].workout?.id, "push")
        XCTAssertEqual(days[3].movedFrom, "maandag")
        XCTAssertEqual(days[0].kind, .rest)
    }

    func testASecondCopyIsNotAMove() {
        // Push is on Thursday as well, but it never left Monday.
        let days = week(["2026-09-17": "push"])
        XCTAssertNil(days[3].movedFrom)
        XCTAssertNil(days[0].movedFrom)
    }

    // MARK: Rearranging

    func testMovingASessionLeavesTheDateItCameFromHoldingTheOtherDay() {
        var draft = draft()
        draft.move(from: "2026-09-14", to: "2026-09-17")
        XCTAssertEqual(draft.canonical(on: "2026-09-17"), "push")
        XCTAssertEqual(draft.canonical(on: "2026-09-14"), "rest", "or the plan would put push straight back")

        let days = draft.week(plan: plan)
        XCTAssertEqual(days[3].movedFrom, "maandag")
        XCTAssertEqual(days[0].kind, .rest)
    }

    func testASessionDraggedOffADayThePlanRestsOnLeavesItEmpty() {
        // Thursday is a rest day in the plan and is holding a session anyway;
        // Sunday rests too. Moving it there leaves Thursday with nothing
        // planned and nothing decided.
        var draft = draft(["2026-09-17": "push", "2026-09-14": "rest"])
        draft.move(from: "2026-09-17", to: "2026-09-20")

        let days = draft.week(plan: plan)
        XCTAssertEqual(days[3].kind, .open)
        XCTAssertEqual(days[6].workout?.id, "push")
        XCTAssertEqual(
            draft.changes(programKey: "personal").map(\.kind),
            [
                .removeScheduleOverride(key: "personal:2026-09-17"),
                .setScheduleDay(key: "personal:2026-09-20", dayID: "push"),
            ]
        )
    }

    func testDraggingASessionBackToItsOwnWeekdayTidiesUp() {
        var draft = draft(["2026-09-14": "rest", "2026-09-17": "push"])
        draft.move(from: "2026-09-17", to: "2026-09-14")
        XCTAssertTrue(draft.assignments.isEmpty, "the plan says this already")
        XCTAssertNil(draft.week(plan: plan)[0].movedFrom)
    }

    func testTwoSessionsTradePlaces() {
        var draft = draft()
        draft.move(from: "2026-09-14", to: "2026-09-16")
        XCTAssertEqual(draft.canonical(on: "2026-09-16"), "push")
        XCTAssertEqual(draft.canonical(on: "2026-09-14"), "legs")
    }

    func testMovingWritesDownOnlyTheTwoDatesThatChanged() {
        var draft = draft()
        draft.move(from: "2026-09-14", to: "2026-09-17")
        let changes = draft.changes(programKey: "personal")
        XCTAssertEqual(changes.count, 2)
        XCTAssertEqual(Set(changes.map(\.kind)), [
            .setScheduleDay(key: "personal:2026-09-14", dayID: "rest"),
            .setScheduleDay(key: "personal:2026-09-17", dayID: "push"),
        ])
    }

    func testAnUntouchedWeekHasNothingToSave() {
        let draft = draft(["2026-09-17": "rest"])
        XCTAssertFalse(draft.isChanged)
        XCTAssertTrue(draft.changes(programKey: "personal").isEmpty)
    }

    func testMarkingARestDayIsRecordedEvenWhereThePlanRestsAnyway() {
        var draft = draft()
        draft.markRest("2026-09-17")
        XCTAssertEqual(
            draft.changes(programKey: "personal").map(\.kind),
            [.setScheduleDay(key: "personal:2026-09-17", dayID: "rest")]
        )
    }

    func testHandingADateBackToThePlanDeletesTheOverride() {
        var draft = draft(["2026-09-17": "rest"])
        draft.clear("2026-09-17")
        XCTAssertEqual(
            draft.changes(programKey: "personal").map(\.kind),
            [.removeScheduleOverride(key: "personal:2026-09-17")]
        )
        XCTAssertEqual(draft.week(plan: plan)[3].kind, .open)
    }

    func testAnotherWeeksDatesAreNeverTouched() {
        var draft = draft(["2026-09-07": "rest", "2026-09-17": "rest"])
        draft.clear("2026-09-07")
        draft.move(from: "2026-09-14", to: "2026-09-15")
        XCTAssertTrue(draft.changes(programKey: "personal").allSatisfy { change in
            if case let .setScheduleDay(key, _) = change.kind { return key.hasSuffix("-14") || key.hasSuffix("-15") }
            return false
        })
    }

    func testTheProgramScopesEveryChange() {
        var draft = draft()
        draft.markRest("2026-09-17")
        XCTAssertEqual(
            draft.changes(programKey: "science-upper-lower").map(\.kind),
            [.setScheduleDay(key: "science-upper-lower:2026-09-17", dayID: "rest")]
        )
    }

    // MARK: Labels

    func testTheWeekIsNamedByItsDates() {
        XCTAssertEqual(WeekPlan.range(Schedule.mondayFirstWeek(containing: monday, calendar: calendar), calendar: calendar), "14–20 sep")
    }

    func testAWeekAcrossTwoMonthsNamesBoth() {
        let end = LegacyAdapter.isoDate("2026-09-30T12:00:00.000Z")!
        XCTAssertEqual(WeekPlan.range(Schedule.mondayFirstWeek(containing: end, calendar: calendar), calendar: calendar), "28 sep–4 okt")
    }

    func testWeekOneIsTheWeekOfTheFirstSession() {
        XCTAssertEqual(WeekPlan.number(firstSession: nil, on: monday, calendar: calendar), 1)
        XCTAssertEqual(WeekPlan.number(firstSession: monday, on: monday, calendar: calendar), 1)
        let sixWeeksOn = calendar.date(byAdding: .day, value: 42, to: monday)!
        XCTAssertEqual(WeekPlan.number(firstSession: monday, on: sixWeeksOn, calendar: calendar), 7)
    }

    func testASessionReportsItsSetsAndAnEstimate() {
        let push = plan.first { $0.id == "push" }!
        XCTAssertEqual(WeekPlan.sets(of: push), push.exercises.reduce(0) { $0 + $1.targetSets })
        XCTAssertGreaterThan(WeekPlan.minutes(of: push), 0)
    }
}
