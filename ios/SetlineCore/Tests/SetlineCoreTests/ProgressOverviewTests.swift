import XCTest
@testable import SetlineCore

/// The overview numbers of the redesign: a session's best set, the best sets
/// of the last weeks, tonnage per week and the smoothed weight.
final class ProgressOverviewTests: XCTestCase {

    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        calendar.firstWeekday = 2
        return calendar
    }()

    private func date(_ day: Int, month: Int = 9, hour: Int = 18) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour))!
    }

    private func set(_ index: Int, _ weight: Decimal, _ reps: Int, warmup: Bool = false) -> LoggedSet {
        LoggedSet(index: index, weightKg: weight, reps: reps, isWarmup: warmup)
    }

    private func session(
        _ id: String,
        on day: Int,
        month: Int = 9,
        results: [ExerciseResult],
        kind: SessionKind = .workout
    ) -> TrainingSession {
        TrainingSession(
            id: id, date: date(day, month: month), dayID: "push", dayLabel: "Push A",
            completion: 100, kind: kind, results: results
        )
    }

    // MARK: Best set

    func testBestSetIsTheHighestEstimateNotTheHeaviest() {
        // 100 × 3 estimates 105,9; 90 × 8 estimates 111,7.
        let best = ProgressOverview.best(of: [set(0, 100, 3), set(1, 90, 8)])
        XCTAssertEqual(best?.weightKg, 90)
        XCTAssertEqual(best?.reps, 8)
    }

    func testWarmupsNeverAreTheBestSet() {
        let best = ProgressOverview.best(of: [set(0, 140, 1, warmup: true), set(1, 80, 5)])
        XCTAssertEqual(best?.weightKg, 80)
    }

    func testSetsAboveTenRepsFallBackToTheHeaviest() {
        let best = ProgressOverview.best(of: [set(0, 12, 15), set(1, 14, 12)])
        XCTAssertEqual(best?.weightKg, 14)
    }

    func testASessionIsDescribedByItsStrongestExercise() {
        let workout = session("a", on: 7, results: [
            ExerciseResult(exerciseID: "lateral", name: "Lateral raise", sets: [set(0, 14, 15)]),
            ExerciseResult(exerciseID: "bench", name: "Bankdrukken", sets: [set(0, 92.5, 5), set(1, 90, 5)]),
        ])
        let best = ProgressOverview.best(in: workout)
        XCTAssertEqual(best?.name, "Bankdrukken")
        XCTAssertEqual(best?.weightKg, 92.5)
        XCTAssertEqual(best?.reps, 5)
    }

    func testASessionWithNothingLoggedHasNoBestSet() {
        let empty = session("a", on: 7, results: [
            ExerciseResult(exerciseID: "bench", name: "Bankdrukken", sets: [LoggedSet(index: 0)]),
        ])
        XCTAssertNil(ProgressOverview.best(in: empty))
    }

    // MARK: Best sets of the last weeks

    func testBestSetsCompareAgainstTheBestBeforeTheWindow() {
        let sessions = [
            session("old", on: 1, month: 7, results: [
                ExerciseResult(exerciseID: "bench", name: "Bankdrukken", sets: [set(0, 90, 5)]),
            ]),
            session("new", on: 6, results: [
                ExerciseResult(exerciseID: "bench", name: "Bankdrukken", sets: [set(0, 92.5, 5)]),
            ]),
        ]
        let rows = ProgressOverview.bestSets(in: sessions, since: date(1, month: 8))
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].weightKg, 92.5)
        XCTAssertEqual(rows[0].reps, 5)
        // 92,5 × 36/32 − 90 × 36/32 = 2,8 → to the half kilo.
        XCTAssertEqual(rows[0].delta, 3)
    }

    func testAnExerciseNewInTheWindowHasNoDelta() {
        let sessions = [
            session("new", on: 6, results: [
                ExerciseResult(exerciseID: "dips", name: "Dips", sets: [set(0, 20, 8)]),
            ]),
        ]
        let rows = ProgressOverview.bestSets(in: sessions, since: date(1, month: 8))
        XCTAssertEqual(rows.first?.name, "Dips")
        XCTAssertNil(rows.first?.delta)
    }

    func testBestSetsAreOrderedByLastTrainedAndLimited() {
        let sessions = [
            session("a", on: 2, results: [
                ExerciseResult(exerciseID: "squat", name: "Squat", sets: [set(0, 140, 5)]),
            ]),
            session("b", on: 6, results: [
                ExerciseResult(exerciseID: "bench", name: "Bankdrukken", sets: [set(0, 92.5, 5)]),
            ]),
            session("c", on: 4, results: [
                ExerciseResult(exerciseID: "deadlift", name: "Deadlift", sets: [set(0, 165, 3)]),
            ]),
        ]
        let rows = ProgressOverview.bestSets(in: sessions, since: date(1, month: 8), limit: 2)
        XCTAssertEqual(rows.map(\.name), ["Bankdrukken", "Deadlift"])
    }

    func testAnExerciseOnlyTrainedBeforeTheWindowIsLeftOut() {
        let sessions = [
            session("old", on: 1, month: 6, results: [
                ExerciseResult(exerciseID: "bench", name: "Bankdrukken", sets: [set(0, 90, 5)]),
            ]),
        ]
        XCTAssertTrue(ProgressOverview.bestSets(in: sessions, since: date(1, month: 8)).isEmpty)
    }

    func testRecoveryDaysAreNotWorkouts() {
        let sessions = [
            session("r", on: 6, results: [
                ExerciseResult(exerciseID: "bench", name: "Bankdrukken", sets: [set(0, 90, 5)]),
            ], kind: .recovery),
        ]
        XCTAssertTrue(ProgressOverview.bestSets(in: sessions, since: date(1, month: 8)).isEmpty)
        XCTAssertEqual(
            ProgressOverview.weeklyVolume(in: sessions, weeks: 1, now: date(9), calendar: calendar).first?.volumeKg, 0
        )
    }

    // MARK: Tonnage per week

    func testWeeklyVolumeEndsWithThisWeekAndKeepsEmptyWeeks() {
        let sessions = [
            // Week of 7 Sep (w37): 100 × 5 × 2 = 1.000 kg.
            session("a", on: 8, results: [
                ExerciseResult(exerciseID: "bench", name: "Bankdrukken", sets: [set(0, 100, 5), set(1, 100, 5)]),
            ]),
            // Week of 24 Aug (w35): 50 × 10 = 500 kg.
            session("b", on: 26, month: 8, results: [
                ExerciseResult(exerciseID: "row", name: "Row", sets: [set(0, 50, 10)]),
            ]),
        ]
        let weeks = ProgressOverview.weeklyVolume(in: sessions, weeks: 3, now: date(9), calendar: calendar)
        XCTAssertEqual(weeks.map(\.number), [35, 36, 37])
        XCTAssertEqual(weeks.map(\.volumeKg), [500, 0, 1000])
        XCTAssertEqual(weeks.map(\.isCurrent), [false, false, true])
    }

    func testWeeklyVolumeLeavesWarmupsOut() {
        let sessions = [
            session("a", on: 8, results: [
                ExerciseResult(exerciseID: "bench", name: "Bankdrukken", sets: [
                    set(0, 60, 5, warmup: true), set(1, 100, 5),
                ]),
            ]),
        ]
        let weeks = ProgressOverview.weeklyVolume(in: sessions, weeks: 1, now: date(9), calendar: calendar)
        XCTAssertEqual(weeks.first?.volumeKg, 500)
    }

    // MARK: Weight, smoothed

    func testTrailingAverageCoversFourteenCalendarDays() {
        let metrics = [
            BodyMetric(id: "1", date: "2026-08-20", weight: 84),
            BodyMetric(id: "2", date: "2026-09-01", weight: 82),
            BodyMetric(id: "3", date: "2026-09-08", weight: 81),
        ]
        let trend = ProgressOverview.weightTrend(BodyProgress.make(metrics: metrics, calendar: calendar))
        XCTAssertEqual(trend.count, 3)
        XCTAssertEqual(trend[0].average, 84)
        // 1 Sep: 20 Aug is twelve days back, inside the window.
        XCTAssertEqual(trend[1].average, 83)
        // 8 Sep: 20 Aug is nineteen days back, outside it.
        XCTAssertEqual(trend[2].average, Decimal(string: "81.5"))
    }

    func testWeightTrendOfNothingIsEmpty() {
        XCTAssertTrue(ProgressOverview.weightTrend(.empty).isEmpty)
    }

    // MARK: Weeks, named

    func testWeekLabelsCountFromThisWeek() {
        let now = date(9)
        XCTAssertEqual(Agenda.weekLabel(containing: date(13), now: now, calendar: calendar), "This week")
        XCTAssertEqual(Agenda.weekLabel(containing: date(6), now: now, calendar: calendar), "Last week")
        XCTAssertEqual(Agenda.weekLabel(containing: date(14), now: now, calendar: calendar), "Next week")
        XCTAssertEqual(Agenda.weekLabel(containing: date(18, month: 8), now: now, calendar: calendar), "3 weeks ago")
        XCTAssertEqual(Agenda.weekLabel(containing: date(22), now: now, calendar: calendar), "In 2 weeks")
    }

    /// The week the clocks go back is 167 or 169 hours long; it is still one
    /// week away.
    func testWeekLabelsSurviveTheClockChange() {
        let now = calendar.date(from: DateComponents(year: 2026, month: 10, day: 21, hour: 9))!
        let after = calendar.date(from: DateComponents(year: 2026, month: 10, day: 28, hour: 9))!
        XCTAssertEqual(Agenda.weekLabel(containing: after, now: now, calendar: calendar), "Next week")
    }

    // MARK: Progress per training day

    private func day(_ id: String, _ dayID: String, on dayOfMonth: Int, month: Int = 9, _ results: [ExerciseResult]) -> TrainingSession {
        TrainingSession(
            id: id, date: date(dayOfMonth, month: month), dayID: dayID, dayLabel: dayID.capitalized,
            completion: 100, kind: .workout, results: results
        )
    }

    private func lift(_ id: String, _ weight: Decimal, _ reps: Int) -> ExerciseResult {
        ExerciseResult(exerciseID: id, name: id.capitalized, sets: [set(0, weight, reps)])
    }

    func testADayIsMeasuredAgainstItsBestBeforeTheWindow() {
        let sessions = [
            day("old", "push", on: 1, month: 7, [lift("bench", 100, 5)]),
            day("a", "push", on: 2, [lift("bench", 105, 5)]),
            day("b", "pull", on: 3, [lift("row", 80, 8)]),
        ]
        let days = ProgressOverview.progressByDay(in: sessions, since: date(1))
        XCTAssertEqual(days.map(\.dayID), ["pull", "push"])
        let push = days[1]
        XCTAssertEqual(push.sessions, 1)
        XCTAssertEqual(push.changePercent, 5)
        XCTAssertEqual(push.leader?.exerciseID, "bench")
        // Row has no history and one session: nothing to compare yet.
        XCTAssertNil(days[0].changePercent)
        XCTAssertNil(days[0].leader)
    }

    func testANewLiftIsMeasuredFromItsFirstSessionInTheWindow() {
        let sessions = [
            day("a", "legs", on: 2, [lift("squat", 100, 5)]),
            day("b", "legs", on: 9, [lift("squat", 110, 5)]),
        ]
        let legs = ProgressOverview.progressByDay(in: sessions, since: date(1)).first
        XCTAssertEqual(legs?.sessions, 2)
        XCTAssertEqual(legs?.changePercent, 10)
        XCTAssertEqual(legs?.leader?.deltaKg, Estimates.round(Estimates.e1RM(weightKg: 110, reps: 5)! - Estimates.e1RM(weightKg: 100, reps: 5)!, toIncrement: 0.5))
        XCTAssertEqual(legs?.strength.first, 100)
        XCTAssertEqual(legs.map { Estimates.round($0.strength[1], toIncrement: 0.1) }, 110)
    }

    func testTheStrengthLineKeepsEachLiftsBestAndEndsAtTheChange() {
        let sessions = [
            day("a", "legs", on: 2, [lift("squat", 100, 5)]),
            day("b", "legs", on: 9, [lift("squat", 110, 5)]),
            day("c", "legs", on: 16, [lift("squat", 105, 5)]),
        ]
        let legs = ProgressOverview.progressByDay(in: sessions, since: date(1)).first
        let line = legs?.strength.map { Estimates.round($0, toIncrement: 0.1) }
        XCTAssertEqual(line, [100, 110, 110])
        XCTAssertEqual(legs?.changePercent, 10)
    }

    func testADayListsEachLiftsBestSetAndWhatItGained() {
        let sessions = [
            day("old", "push", on: 1, month: 7, [lift("bench", 100, 5)]),
            day("a", "push", on: 2, [lift("bench", 105, 5), lift("fly", 20, 10)]),
            day("b", "push", on: 9, [lift("bench", 102.5, 5)]),
        ]
        let lifts = ProgressOverview.progressByDay(in: sessions, since: date(1)).first?.lifts ?? []
        XCTAssertEqual(lifts.map(\.exerciseID), ["bench", "fly"])
        XCTAssertEqual(lifts[0].weightKg, 105)
        XCTAssertEqual(lifts[0].date, date(2))
        XCTAssertNotNil(lifts[0].deltaKg)
        XCTAssertFalse(lifts[0].isNew)
        XCTAssertNil(lifts[1].deltaKg)
        XCTAssertTrue(lifts[1].isNew)
    }

    func testATiedBestSetIsDatedByItsLatestSession() {
        let sessions = [
            day("a", "push", on: 2, [lift("bench", 100, 8)]),
            day("b", "push", on: 9, [lift("bench", 100, 8)]),
        ]
        let bench = ProgressOverview.progressByDay(in: sessions, since: date(1)).first?.lifts.first
        XCTAssertEqual(bench?.date, date(9))
    }

    func testTheDayChangeIsTheMeanOfItsLifts() {
        let sessions = [
            day("old", "upper", on: 1, month: 7, [lift("bench", 100, 5), lift("row", 100, 5)]),
            day("a", "upper", on: 2, [lift("bench", 110, 5), lift("row", 96, 5)]),
        ]
        let upper = ProgressOverview.progressByDay(in: sessions, since: date(1)).first
        XCTAssertEqual(upper?.changePercent, 3)
        XCTAssertEqual(upper?.leader?.exerciseID, "bench")
    }
}
