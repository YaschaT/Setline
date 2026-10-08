import XCTest
@testable import SetlineCore

/// 39a: the marks the week rail draws, and the rest day's one question — what
/// comes next, and when.
final class WeekRailTests: XCTestCase {

    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        calendar.firstWeekday = 2
        return calendar
    }()

    /// September 2026. The personal plan trains Monday (push), Tuesday
    /// (pull), Wednesday (legs), Friday (lower) and Saturday (upper), and
    /// rests on Thursday and Sunday.
    private func date(_ day: Int, month: Int = 9, hour: Int = 9) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour))!
    }

    private var plan: [WorkoutDay] { PlanCatalog.personal }

    private func workout(_ id: String) -> WorkoutDay {
        plan.first { $0.id == id }!
    }

    private func session(on day: Int, dayID: String, label: String) -> TrainingSession {
        TrainingSession(
            id: "s-\(day)",
            date: date(day, hour: 17),
            dayID: dayID,
            dayLabel: label,
            completion: 100,
            results: [
                ExerciseResult(
                    exerciseID: "flat-bench",
                    name: "Flat bench press",
                    sets: [LoggedSet(index: 0, weightKg: 100, reps: 6, rirReported: 1)]
                ),
            ]
        )
    }

    private func next(
        after day: Int,
        now: Date? = nil,
        overrides: [String: String] = [:],
        sessions: [TrainingSession] = [],
        deload: Deload? = nil,
        plan: [WorkoutDay]? = nil
    ) -> AgendaDay? {
        Agenda.nextTraining(
            after: date(day),
            plan: plan ?? self.plan,
            overrides: overrides,
            sessions: sessions,
            deload: deload,
            now: now ?? date(day),
            calendar: calendar
        )
    }

    // MARK: - The marks

    /// 39a's own week: two done, today here, two to go.
    func testTheRailDrawsTheArtboardsWeekFromRealData() {
        let week = Agenda.week(
            containing: date(10),
            plan: plan,
            overrides: ["2026-09-08": "rest"],
            sessions: [session(on: 7, dayID: "push", label: "Push"), session(on: 9, dayID: "legs", label: "Legs")],
            now: date(10),
            calendar: calendar
        )
        XCTAssertEqual(week.map(\.mark), [.logged, .rest, .logged, .rest, .planned, .planned, .rest])
        XCTAssertEqual(week.filter(\.isToday).map(\.dayNumber), [10])
    }

    func testAMovedSessionAndAMissedOneEachKeepTheirOwnMark() {
        // Tuesday and Wednesday passed without a session; Saturday's Upper
        // moved to Sunday.
        let week = Agenda.week(
            containing: date(10),
            plan: plan,
            overrides: ["2026-09-12": "rest", "2026-09-13": "upper"],
            sessions: [session(on: 7, dayID: "push", label: "Push")],
            now: date(10),
            calendar: calendar
        )
        XCTAssertEqual(week.map(\.mark), [.logged, .missed, .missed, .rest, .planned, .rest, .moved])
    }

    // MARK: - 1 · Today is a rest day

    func testARestDayLooksAheadToTomorrowsSession() throws {
        // Thursday 10 rests; Friday holds Lower.
        let next = try XCTUnwrap(next(after: 10))
        XCTAssertEqual(next.dayNumber, 11)
        XCTAssertEqual(next.plannedDay?.id, "lower")
        XCTAssertEqual(Agenda.restLine(next: next, now: date(10), calendar: calendar), "Next training tomorrow")
        XCTAssertEqual(
            Agenda.sessionLine(next),
            "Fr 11 Sep · ±\(WeekPlan.minutes(of: workout("lower"))) min"
        )
    }

    // MARK: - Later this week, next week, nothing at all

    func testTheWordForWhenFollowsTheCalendar() {
        let monday = date(7)
        XCTAssertEqual(Agenda.when(date(7, hour: 20), from: monday, calendar: calendar), "today")
        XCTAssertEqual(Agenda.when(date(8), from: monday, calendar: calendar), "tomorrow")
        XCTAssertEqual(Agenda.when(date(9), from: monday, calendar: calendar), "the day after tomorrow")
        XCTAssertEqual(Agenda.when(date(11), from: monday, calendar: calendar), "Friday", "later this week")
        XCTAssertEqual(Agenda.when(date(13), from: monday, calendar: calendar), "Sunday")
        XCTAssertEqual(Agenda.when(date(15), from: monday, calendar: calendar), "Tuesday 15 Sep", "past this week")
        XCTAssertEqual(Agenda.when(date(5, month: 10), from: monday, calendar: calendar), "Monday 5 Oct")
    }

    func testASessionLaterThisWeekIsNamedByItsWeekday() throws {
        // Tuesday to Thursday set to rest: from Monday, the next session is
        // Friday's, four days out and still this week.
        let overrides = ["2026-09-08": "rest", "2026-09-09": "rest", "2026-09-10": "rest"]
        let next = try XCTUnwrap(self.next(after: 7, overrides: overrides))
        XCTAssertEqual(next.dayNumber, 11)
        XCTAssertEqual(Agenda.restLine(next: next, now: date(7), calendar: calendar), "Next training Friday")
    }

    func testASessionBeyondThisWeekCarriesItsDate() throws {
        // Friday 11: Saturday is set to rest, so the next session is Monday 14.
        let next = try XCTUnwrap(self.next(after: 11, overrides: ["2026-09-12": "rest"]))
        XCTAssertEqual(next.dayNumber, 14)
        XCTAssertEqual(next.plannedDay?.id, "push")
        XCTAssertEqual(
            Agenda.restLine(next: next, now: date(11), calendar: calendar),
            "Next training Monday 14 Sep"
        )
    }

    func testNothingPlannedSaysSoInsteadOfInventingASession() {
        XCTAssertNil(next(after: 10, plan: []))
        XCTAssertEqual(Agenda.restLine(next: nil, now: date(10), calendar: calendar), "No training planned")
    }

    // MARK: - Week boundary

    func testSundaysNextSessionIsMondayOfTheNextWeek() throws {
        let next = try XCTUnwrap(self.next(after: 13))
        XCTAssertEqual(next.dayNumber, 14)
        XCTAssertEqual(Agenda.restLine(next: next, now: date(13), calendar: calendar), "Next training tomorrow")
        XCTAssertEqual(
            Agenda.sessionLine(next),
            "Mo 14 Sep · ±\(WeekPlan.minutes(of: workout("push"))) min"
        )
    }

    func testTheSearchCrossesAMonthBoundary() throws {
        // Wednesday 30 September → Thursday 1 October rests → Friday 2 October.
        let next = try XCTUnwrap(self.next(after: 30))
        XCTAssertEqual(calendar.component(.month, from: next.date), 10)
        XCTAssertEqual(next.dayNumber, 2)
        XCTAssertEqual(Agenda.sessionLine(next)?.hasPrefix("Fr 2 Oct"), true)
    }

    // MARK: - Schedule overrides

    func testAMovedSessionIsNextWhereItWasMovedTo() throws {
        // Friday's Lower moved onto Sunday; Saturday set to rest.
        let overrides = ["2026-09-11": "rest", "2026-09-12": "rest", "2026-09-13": "lower"]
        let next = try XCTUnwrap(self.next(after: 10, overrides: overrides))
        XCTAssertEqual(next.dayNumber, 13)
        XCTAssertEqual(next.plannedDay?.id, "lower")
        XCTAssertEqual(next.mark, .moved)
        XCTAssertEqual(next.movedFrom, "Friday")
        XCTAssertEqual(Agenda.restLine(next: next, now: date(10), calendar: calendar), "Next training Sunday")
    }

    // MARK: - A lighter week

    func testALighterWeekShortensTheNextSessionThroughTheSharedRule() throws {
        let deload = Deload(startedAt: date(7))
        let next = try XCTUnwrap(self.next(after: 10, deload: deload))
        let effective = SessionPrescription.day(workout("lower"), deload: deload)

        XCTAssertEqual(WeekPlan.sets(of: try XCTUnwrap(next.plannedDay)), SessionPrescription.setCount(of: workout("lower"), deload: deload))
        XCTAssertLessThan(WeekPlan.minutes(of: effective), WeekPlan.minutes(of: workout("lower")))
        XCTAssertEqual(Agenda.sessionLine(next), "Fr 11 Sep · ±\(WeekPlan.minutes(of: effective)) min")
    }

    func testTheLighterWeekDoesNotReachASessionPastItsWindow() throws {
        // A deload from Monday 7 ends before Monday 14.
        let deload = Deload(startedAt: date(7))
        let next = try XCTUnwrap(self.next(after: 13, deload: deload))
        XCTAssertEqual(Agenda.sessionLine(next), "Mo 14 Sep · ±\(WeekPlan.minutes(of: workout("push"))) min")
    }

    // MARK: - What "next" steps over

    func testSavedAndPassedDaysAreNeverTheNextSession() throws {
        // Monday evening, Monday logged: from Sunday, the next is Tuesday.
        let logged = try XCTUnwrap(self.next(
            after: 6, now: date(7, hour: 20), sessions: [session(on: 7, dayID: "push", label: "Push")]
        ))
        XCTAssertEqual(logged.dayNumber, 8)

        // From a rest day last week, the days that passed unlogged are
        // stepped over: the next session still to come is today's.
        let fromLastWeek = try XCTUnwrap(self.next(after: 3, now: date(7)))
        XCTAssertEqual(fromLastWeek.dayNumber, 7)
        XCTAssertEqual(Agenda.when(fromLastWeek.date, from: date(7), calendar: calendar), "today")
    }

    // MARK: - Reading never writes

    func testLookingAheadLeavesTheAccountExactlyAsItWas() {
        let overrides = ["2026-09-11": "rest", "2026-09-13": "lower"]
        let sessions = [session(on: 7, dayID: "push", label: "Push")]
        let state = LegacyState(raw: [
            "sessions": .array(sessions.map { JSONValue(session: $0) }),
            "scheduleOverrides": .object(overrides.mapValues { JSONValue.string($0) }),
            "planMode": .string("personal"),
            "iosActiveSession": .object(["dayId": .string("pull")]),
        ])
        let before = state.raw

        for day in 1...30 {
            let found = Agenda.nextTraining(
                after: date(day), plan: plan, overrides: overrides, sessions: sessions,
                deload: Deload(startedAt: date(7)), now: date(10), calendar: calendar
            )
            _ = Agenda.restLine(next: found, now: date(10), calendar: calendar)
            _ = found.flatMap(Agenda.sessionLine)
        }

        XCTAssertEqual(state.raw, before, "no schedule, session, programme or active session moved")
        XCTAssertEqual(LegacyAdapter.scheduleOverrides(from: state), overrides)
    }
}
