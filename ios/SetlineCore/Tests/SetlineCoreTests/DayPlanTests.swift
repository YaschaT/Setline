import XCTest
@testable import SetlineCore

/// Artboards 41d–41g: the four weeks the drawer shows, and what one date can
/// be set to.
final class DayPlanTests: XCTestCase {

    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        calendar.firstWeekday = 2
        return calendar
    }()

    /// September 2026: Monday push, Tuesday pull, Wednesday legs, Thursday
    /// rest, Friday lower, Saturday upper, Sunday rest.
    private func date(_ day: Int, month: Int = 9, hour: Int = 9) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour))!
    }

    private var plan: [WorkoutDay] { PlanCatalog.personal }

    private func session(on day: Int, dayID: String = "push", label: String = "Push", minutes: Int? = 54) -> TrainingSession {
        TrainingSession(
            id: "s-\(day)",
            date: date(day, hour: 17),
            dayID: dayID,
            dayLabel: label,
            completion: 100,
            results: [ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press",
                                     sets: [LoggedSet(index: 0, weightKg: 100, reps: 6)])],
            durationSeconds: minutes.map { $0 * 60 }
        )
    }

    private func make(
        _ day: Int,
        overrides: [String: String] = [:],
        sessions: [TrainingSession] = [],
        now: Int = 10
    ) -> DayPlan {
        DayPlan.make(
            for: date(day), plan: plan, overrides: overrides, sessions: sessions,
            now: date(now), calendar: calendar
        )
    }

    private func option(_ plan: DayPlan, _ id: String) throws -> DayPlan.Option {
        try XCTUnwrap(plan.options.first { $0.id == id })
    }

    // MARK: - 41e · a date the programme decides

    func testAFutureDateOffersThePlansSessionsRestAndTheStandard() throws {
        // Thursday 10 September rests in the programme.
        let sheet = make(10)
        XCTAssertFalse(sheet.isLocked)
        XCTAssertFalse(sheet.isOverridden)
        XCTAssertEqual(sheet.title, "Donderdag 10 sep")
        XCTAssertEqual(sheet.state, "Nu: rustdag · volgens je plan")
        XCTAssertEqual(sheet.standardTitle, "rustdag")

        XCTAssertEqual(
            sheet.options.map(\.id),
            plan.map { "session-\($0.id)" } + ["rest", "standard"],
            "the programme's own sessions, then rest, then the way back"
        )
        XCTAssertTrue(try option(sheet, "rest").isCurrent, "a rest day already reads as rest")
    }

    func testASessionAlreadyElsewhereThisWeekSaysSo() throws {
        let sheet = make(10)
        let lower = try option(sheet, "session-lower")
        XCTAssertEqual(lower.hint, "ook vr 11", "Lower already falls on Friday")
        XCTAssertEqual(
            sheet.note(for: lower),
            "Lower staat dan twee keer in deze week; vr 11 blijft staan. Dit verandert alleen deze datum, niet de oefeningen in Lower."
        )
        XCTAssertEqual(sheet.confirmTitle(for: lower), "Zet Lower op do 10")
    }

    func testAssigningADateWritesThatDateAndNothingElse() throws {
        let sheet = make(10)
        let change = try XCTUnwrap(sheet.change(for: try option(sheet, "session-lower"), programKey: "personal"))
        guard case .setScheduleDay(let key, let dayID) = change.kind else { return XCTFail("\(change.kind)") }
        XCTAssertEqual(key, "personal:2026-09-10", "one date, by its own key")
        XCTAssertEqual(dayID, "lower")
    }

    func testRestIsAssignedLikeAnySession() throws {
        // Friday 11 holds Lower; setting it to rest is a change like any other.
        let sheet = make(11)
        let change = try XCTUnwrap(sheet.change(for: try option(sheet, "rest"), programKey: "personal"))
        guard case .setScheduleDay(let key, let dayID) = change.kind else { return XCTFail("\(change.kind)") }
        XCTAssertEqual(key, "personal:2026-09-11")
        XCTAssertEqual(dayID, "rest")
    }

    func testPickingTheProgrammesOwnSessionTakesTheChangeOffInstead() throws {
        // Friday's standard is Lower; with Pull set by hand, choosing Lower
        // again is the same as going back to standard.
        let sheet = make(11, overrides: ["2026-09-11": "pull"])
        let change = try XCTUnwrap(sheet.change(for: try option(sheet, "session-lower"), programKey: "personal"))
        guard case .removeScheduleOverride(let key) = change.kind else { return XCTFail("\(change.kind)") }
        XCTAssertEqual(key, "personal:2026-09-11", "no override that only repeats the plan")
    }

    func testChoosingWhatTheDateAlreadyHoldsWritesNothing() throws {
        let sheet = make(11)
        XCTAssertNil(
            sheet.change(for: try option(sheet, "session-lower"), programKey: "personal"),
            "Friday already holds Lower by the programme's own reading"
        )
        XCTAssertNil(sheet.change(for: try option(sheet, "standard"), programKey: "personal"))
    }

    // MARK: - 41f · a date you set yourself

    func testAChangedDateOffersTheWayBackFirst() throws {
        let sheet = make(11, overrides: ["2026-09-11": "pull"])
        XCTAssertTrue(sheet.isOverridden)
        XCTAssertEqual(sheet.state, "Nu: Pull · door jou gezet")
        XCTAssertEqual(sheet.options.first?.kind, .standard)
        XCTAssertEqual(sheet.options.first?.title, "Terug naar standaard")
        XCTAssertEqual(sheet.options.first?.hint, "Lower", "what it goes back to")
        XCTAssertEqual(sheet.confirmTitle(for: try XCTUnwrap(sheet.options.first)), "Zet terug naar Lower")
    }

    func testGoingBackToStandardRemovesTheChangeItself() throws {
        let sheet = make(11, overrides: ["2026-09-11": "pull"])
        let change = try XCTUnwrap(sheet.change(for: try option(sheet, "standard"), programKey: "personal"))
        guard case .removeScheduleOverride(let key) = change.kind else { return XCTFail("\(change.kind)") }
        XCTAssertEqual(key, "personal:2026-09-11")
    }

    func testAChangeReplacesTheOneBeforeItRatherThanStacking() throws {
        let sheet = make(11, overrides: ["2026-09-11": "pull"])
        let change = try XCTUnwrap(sheet.change(for: try option(sheet, "session-upper"), programKey: "personal"))
        guard case .setScheduleDay(let key, let dayID) = change.kind else { return XCTFail("\(change.kind)") }
        XCTAssertEqual(key, "personal:2026-09-11", "the same key, written again")
        XCTAssertEqual(dayID, "upper")
    }

    // MARK: - 41g · a date that was trained

    func testALoggedDateIsLockedAndPointsAtItsSession() {
        let sheet = make(9, sessions: [session(on: 9, dayID: "legs", label: "Legs")], now: 10)
        XCTAssertTrue(sheet.isLocked)
        XCTAssertEqual(sheet.state, "Legs · gelogd · 54 min")
        XCTAssertEqual(sheet.session?.id, "s-9")
        XCTAssertTrue(sheet.options.isEmpty, "nothing to assign")
    }

    func testNothingCanBeWrittenForALoggedDate() {
        let sheet = make(9, sessions: [session(on: 9, dayID: "legs", label: "Legs")], now: 10)
        let anywhere = DayPlan.Option(kind: .rest, title: "Rust", hint: nil, isCurrent: false)
        XCTAssertNil(sheet.change(for: anywhere, programKey: "personal"), "a logged day is not assignable")
    }

    // MARK: - Reading a date changes nothing

    func testOpeningTheSheetLeavesTheAccountAsItWas() {
        let overrides = ["2026-09-11": "pull"]
        let sessions = [session(on: 9, dayID: "legs", label: "Legs")]
        let state = LegacyState(raw: [
            "sessions": .array(sessions.map { JSONValue(session: $0) }),
            "scheduleOverrides": .object(overrides.mapValues { JSONValue.string($0) }),
            "planMode": .string("personal"),
        ])
        let before = state.raw

        for day in 7...13 {
            let sheet = make(day, overrides: overrides, sessions: sessions)
            for option in sheet.options {
                _ = sheet.note(for: option)
                _ = sheet.confirmTitle(for: option)
                _ = sheet.change(for: option, programKey: "personal")
            }
        }

        XCTAssertEqual(state.raw, before, "building a change never applies one")
    }

    // MARK: - 41d · the four weeks the drawer shows

    func testTheDrawerShowsTheWeekBeforeAndTheTwoAfter() throws {
        let weeks = Agenda.weeks(
            around: date(10), plan: plan, overrides: [:], sessions: [session(on: 7)],
            firstSession: date(31, month: 8), now: date(10), calendar: calendar
        )
        XCTAssertEqual(weeks.count, 4)
        XCTAssertEqual(weeks.map { $0.days.first?.dayNumber }, [31, 7, 14, 21])
        XCTAssertEqual(weeks.filter(\.isCurrent).count, 1)
        XCTAssertEqual(weeks[1].label, "Week 2 · deze week")
        XCTAssertEqual(weeks[0].label, "Week 1 · 31 aug")
        XCTAssertEqual(weeks[3].label, "Week 4 · 21 sep")
    }

    func testAWeekIsNumberedTheSameFromEveryDayInsideIt() {
        // The drawer's header reads the selected date, its rows read Monday:
        // both must name the same week.
        let first = date(4)
        for day in 7...13 {
            XCTAssertEqual(
                WeekPlan.number(firstSession: first, on: date(day), calendar: calendar),
                WeekPlan.number(firstSession: first, on: date(7), calendar: calendar),
                "day \(day)"
            )
        }
    }

    func testTheDrawerReadsTheSameDatesTheRailDoes() {
        let overrides = ["2026-09-10": "push"]
        let sessions = [session(on: 7)]
        let weeks = Agenda.weeks(
            around: date(10), plan: plan, overrides: overrides, sessions: sessions,
            now: date(10), calendar: calendar
        )
        let rail = Agenda.week(
            containing: date(10), plan: plan, overrides: overrides, sessions: sessions,
            now: date(10), calendar: calendar
        )
        XCTAssertEqual(weeks[1].days, rail, "one reading of a date, wherever it is drawn")
        XCTAssertEqual(rail.first(where: { $0.dayNumber == 10 })?.mark, .moved)
    }
}
