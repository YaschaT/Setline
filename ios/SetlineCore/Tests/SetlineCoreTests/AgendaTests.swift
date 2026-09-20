import XCTest
@testable import SetlineCore

/// Browsing dates: what each one holds, and what reading it must never do.
final class AgendaTests: XCTestCase {

    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        calendar.firstWeekday = 2
        return calendar
    }()

    /// Monday 7 September 2026, the week every artboard draws.
    private var monday: Date {
        calendar.date(from: DateComponents(year: 2026, month: 9, day: 7, hour: 9))!
    }

    private func date(_ day: Int, hour: Int = 9) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 9, day: day, hour: hour))!
    }

    private var plan: [WorkoutDay] { PlanCatalog.personal }

    private func session(on day: Int, dayID: String = "push", label: String = "Push A") -> TrainingSession {
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
            ],
            plannedSetCount: 18,
            completedSetCount: 18
        )
    }

    private func week(
        on date: Date,
        overrides: [String: String] = [:],
        sessions: [TrainingSession] = [],
        deload: Deload? = nil,
        now: Date? = nil
    ) -> [AgendaDay] {
        Agenda.week(
            containing: date,
            plan: plan,
            overrides: overrides,
            sessions: sessions,
            deload: deload,
            now: now ?? self.monday,
            calendar: calendar
        )
    }

    private func day(_ week: [AgendaDay], _ number: Int) throws -> AgendaDay {
        try XCTUnwrap(week.first { $0.dayNumber == number })
    }

    // MARK: - 1 · Today

    func testTodayIsThePlannedSessionUntilSomethingIsSaved() throws {
        let today = try day(week(on: monday), 7)
        XCTAssertTrue(today.isToday)
        XCTAssertFalse(today.isPast)
        guard case .planned(let workout) = today.content else { return XCTFail("\(today.content)") }
        XCTAssertEqual(workout.id, "push")
        XCTAssertEqual(WeekPlan.sets(of: workout), 19, "the full prescription")
        XCTAssertNil(today.session)
    }

    func testTodayBecomesItsSavedSessionOnceOneExists() throws {
        let today = try day(week(on: monday, sessions: [session(on: 7)]), 7)
        XCTAssertTrue(today.isToday)
        XCTAssertEqual(today.session?.id, "s-7")
        XCTAssertNil(today.plannedDay, "a logged day is described by what was saved")
    }

    // MARK: - 2 · A future training day

    func testAFutureTrainingDayPreviewsTheProgramme() throws {
        // Wednesday 9 September is `legs` in the default week.
        let wednesday = try day(week(on: monday), 9)
        XCTAssertFalse(wednesday.isPast)
        guard case .planned(let workout) = wednesday.content else { return XCTFail("\(wednesday.content)") }
        XCTAssertEqual(workout.id, "legs")
        XCTAssertNil(wednesday.session)
    }

    // MARK: - 3 · A rest day

    func testARestDayHoldsNothing() throws {
        // Thursday rests in the default week.
        let thursday = try day(week(on: monday), 10)
        XCTAssertEqual(thursday.content, .rest)
        XCTAssertTrue(thursday.isRest)
        XCTAssertNil(thursday.plannedDay)
        XCTAssertNil(thursday.session)
        XCTAssertNil(thursday.title)
    }

    // MARK: - 4 · A schedule override

    func testAnOverrideDecidesWhatADateHolds() throws {
        // Push moved off Monday onto Thursday, which the plan rests on.
        let overrides = ["2026-09-07": "rest", "2026-09-10": "push"]
        let moved = week(on: monday, overrides: overrides)

        XCTAssertEqual(try day(moved, 7).content, .rest, "the date it left")
        let thursday = try day(moved, 10)
        XCTAssertEqual(thursday.plannedDay?.id, "push")
        XCTAssertEqual(thursday.movedFrom, "maandag", "and it says where it came from")
        XCTAssertTrue(thursday.isMoved)
    }

    // MARK: - 5 · A completed historical date

    func testACompletedDateReadsItsSavedSession() throws {
        // Reading the previous week from Monday: Friday 4 September was logged.
        let previous = week(on: date(4), sessions: [session(on: 4, dayID: "legs", label: "Benen")])
        let friday = try day(previous, 4)
        XCTAssertTrue(friday.isPast)
        XCTAssertEqual(friday.session?.dayLabel, "Benen")
        XCTAssertEqual(friday.title, "Benen", "the label the session was saved with")
        XCTAssertNil(friday.plannedDay)
    }

    // MARK: - 6 · The programme changed since

    func testAChangedProgrammeDoesNotRewriteALoggedDay() throws {
        let logged = session(on: 4, dayID: "legs", label: "Benen")
        // The same date, read against a programme that no longer holds that day.
        var otherPlan = plan.filter { $0.id != "lower" && $0.id != "legs" }
        otherPlan[0].label = "Iets anders"

        let week = Agenda.week(
            containing: date(4),
            plan: otherPlan,
            overrides: ["2026-09-04": "push"],
            sessions: [logged],
            now: monday,
            calendar: calendar
        )
        let friday = try day(week, 4)
        XCTAssertEqual(friday.session?.dayLabel, "Benen", "history keeps its own name")
        XCTAssertEqual(friday.session?.results.first?.sets.first?.weightKg, 100, "and its own sets")
        XCTAssertNil(friday.plannedDay, "the current programme never describes a logged day")
    }

    func testAPlannedDayThatWasNeverLoggedIsMissedRatherThanMoved() throws {
        // Friday 4 September, read on Monday 7: planned, past, nothing saved.
        let friday = try day(week(on: date(4)), 4)
        guard case .missed(let workout) = friday.content else { return XCTFail("\(friday.content)") }
        XCTAssertEqual(workout.id, "lower")
        XCTAssertTrue(friday.isPast)
    }

    // MARK: - 7 · A lighter week

    func testALighterWeekPreviewsTheSetsTheSessionWillOpenWith() throws {
        let deload = Deload(startedAt: monday)
        let lighter = try day(week(on: monday, deload: deload), 7)
        let workout = try XCTUnwrap(lighter.plannedDay)

        XCTAssertEqual(WeekPlan.sets(of: workout), SessionPrescription.setCount(of: plan[0], deload: deload))
        XCTAssertEqual(WeekPlan.sets(of: workout), 11, "the lighter week, not the full 19")
        XCTAssertEqual(
            workout.exercises.map(\.exerciseID),
            plan[0].exercises.map(\.exerciseID),
            "sets are cut, exercises are not"
        )
    }

    func testTheLighterWeekReachesOnlyTheDatesItCovers() throws {
        // A five-day deload from Monday 7 does not reach Monday 14.
        let deload = Deload(startedAt: monday)
        let after = Agenda.week(
            containing: date(14), plan: plan, overrides: [:], sessions: [],
            deload: deload, now: monday, calendar: calendar
        )
        let nextMonday = try day(after, 14)
        XCTAssertEqual(WeekPlan.sets(of: try XCTUnwrap(nextMonday.plannedDay)), 19, "back to the full plan")
    }

    // MARK: - 8 · Week boundaries

    func testAWeekIsSevenDatesMondayFirst() throws {
        let days = week(on: date(9))
        XCTAssertEqual(days.count, 7)
        XCTAssertEqual(days.map(\.dayNumber), [7, 8, 9, 10, 11, 12, 13])
        XCTAssertEqual(days.first?.weekday, "ma")
        XCTAssertEqual(days.last?.weekday, "zo")
        XCTAssertEqual(days.filter(\.isToday).count, 1, "exactly one today")
    }

    func testAWeekAcrossAMonthBoundaryKeepsItsSevenDates() throws {
        // 28 September – 4 October 2026.
        let days = week(on: date(30), now: date(30))
        XCTAssertEqual(days.count, 7)
        XCTAssertEqual(days.map(\.dayNumber), [28, 29, 30, 1, 2, 3, 4])
        XCTAssertEqual(WeekPlan.range(days.map(\.date), calendar: calendar), "28 sep–4 okt")
    }

    func testASessionOnASundayBelongsToThatWeekNotTheNext() throws {
        let sunday = session(on: 13, dayID: "rest", label: "Push B")
        let days = week(on: monday, sessions: [sunday])
        XCTAssertEqual(try day(days, 13).session?.id, "s-13")
        let next = week(on: date(14), sessions: [sunday], now: date(14))
        XCTAssertTrue(next.allSatisfy { $0.session == nil }, "and not to the week after it")
    }

    // MARK: - Reading never writes

    func testBrowsingLeavesTheAccountExactlyAsItWas() {
        let overrides = ["2026-09-07": "rest", "2026-09-08": "push"]
        let sessions = [session(on: 4), session(on: 2, dayID: "pull", label: "Pull A")]
        let state = LegacyState(raw: [
            "sessions": .array(sessions.map { JSONValue(session: $0) }),
            "scheduleOverrides": .object(overrides.mapValues { JSONValue.string($0) }),
            "planMode": .string("personal"),
            "iosActiveSession": .object(["dayId": .string("push")]),
            "nutritionEntries": .array([.object(["id": .string("n-1")])]),
        ])
        let before = state.raw

        // Read every week of a month, in both directions, with everything on.
        for offset in -2...2 {
            let anchor = calendar.date(byAdding: .day, value: offset * 7, to: monday)!
            _ = Agenda.week(
                containing: anchor, plan: plan, overrides: overrides, sessions: sessions,
                deload: Deload(startedAt: monday), now: monday, calendar: calendar
            )
            _ = Agenda.day(
                on: anchor, plan: plan, overrides: overrides, sessions: sessions,
                now: monday, calendar: calendar
            )
        }

        XCTAssertEqual(state.raw, before, "no schedule, session, programme or active session moved")
        XCTAssertEqual(LegacyAdapter.sessions(from: state).count, 2)
        XCTAssertEqual(LegacyAdapter.scheduleOverrides(from: state), overrides)
    }

    // MARK: - What a week says about itself

    func testTheWeekSummaryNamesTodayOrCountsWhatWasLogged() {
        XCTAssertEqual(Agenda.summary(of: week(on: monday), now: monday, calendar: calendar), "vandaag maandag 7 sep")

        let previous = week(on: date(4), sessions: [session(on: 2), session(on: 4)])
        XCTAssertEqual(Agenda.summary(of: previous, now: monday, calendar: calendar), "2 sessies gelogd")

        let next = week(on: date(14), now: monday)
        XCTAssertEqual(Agenda.summary(of: next, now: monday, calendar: calendar), "geen sessies gelogd")
    }
}
