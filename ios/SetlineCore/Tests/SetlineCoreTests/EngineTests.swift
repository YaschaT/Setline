import XCTest
@testable import SetlineCore

final class ProgressionEngineTests: XCTestCase {

    private let planned = PlannedExercise(
        exerciseID: "flat-bench",
        role: .secondaryCompound,
        sets: [
            SetPrescription(repRange: 6...8, targetRIR: 1...2),
            SetPrescription(repRange: 6...8, targetRIR: 1...2),
            SetPrescription(repRange: 6...8, targetRIR: 1...2),
        ]
    )

    private func history(_ sessions: [TrainingSession]) -> ExerciseHistory {
        ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: sessions)
    }

    private func topSets(weight: Decimal, reps: Int, rir: Int? = 1) -> [(Decimal, Int, Int?)] {
        [(weight, reps, rir), (weight, reps, rir), (weight, reps, rir)]
    }

    func testNoProposalBeforeThreeReferenceSessions() {
        let sessions = [
            Fixtures.session(id: "a", daysAgo: 3, exerciseID: "flat-bench", sets: topSets(weight: 100, reps: 8)),
            Fixtures.session(id: "b", daysAgo: 6, exerciseID: "flat-bench", sets: topSets(weight: 100, reps: 8)),
        ]
        let proposal = ProgressionEngine.proposal(
            planned: planned,
            exercise: ExerciseCatalog.exercise("flat-bench")!,
            history: history(sessions)
        )
        XCTAssertEqual(proposal.tone, .noReference)
        XCTAssertNil(proposal.weightKg)
        XCTAssertEqual(proposal.headline, "Building a reference · session 3 of 3")
    }

    func testTwoQualifyingSessionsAtTheSameLoadReadyTheIncrease() {
        let sessions = (0..<3).map { index in
            Fixtures.session(id: "s\(index)", daysAgo: index * 3, exerciseID: "flat-bench", sets: topSets(weight: 100, reps: 8))
        }
        let proposal = ProgressionEngine.proposal(
            planned: planned,
            exercise: ExerciseCatalog.exercise("flat-bench")!,
            history: history(sessions)
        )
        XCTAssertEqual(proposal.tone, .ready)
        XCTAssertEqual(proposal.label, "TOP OF RANGE CONFIRMED")
        XCTAssertEqual(proposal.weightKg, 102.5, "Barbell steps 2,5 kg")
        XCTAssertEqual(proposal.targetReps, 6, "Reps reset to the bottom of the range")
    }

    func testOneQualifyingSessionAsksForConfirmation() {
        let sessions = [
            Fixtures.session(id: "a", daysAgo: 0, exerciseID: "flat-bench", sets: topSets(weight: 100, reps: 8)),
            Fixtures.session(id: "b", daysAgo: 3, exerciseID: "flat-bench", sets: topSets(weight: 100, reps: 7)),
            Fixtures.session(id: "c", daysAgo: 6, exerciseID: "flat-bench", sets: topSets(weight: 100, reps: 7)),
        ]
        let proposal = ProgressionEngine.proposal(
            planned: planned,
            exercise: ExerciseCatalog.exercise("flat-bench")!,
            history: history(sessions)
        )
        XCTAssertEqual(proposal.tone, .close)
        XCTAssertEqual(proposal.headline, "1 more confirmation at 100 kg")
        XCTAssertEqual(proposal.weightKg, 100, "The proposal holds the load, it does not advance it")
    }

    func testMissingTheRangeStaysNeutral() {
        let sessions = (0..<3).map { index in
            Fixtures.session(id: "s\(index)", daysAgo: index * 3, exerciseID: "flat-bench", sets: topSets(weight: 100, reps: 6))
        }
        let proposal = ProgressionEngine.proposal(
            planned: planned,
            exercise: ExerciseCatalog.exercise("flat-bench")!,
            history: history(sessions)
        )
        XCTAssertEqual(proposal.tone, .neutral)
        XCTAssertEqual(proposal.headline, "Keep building at 100 kg")
    }

    /// §3.1: a session where every set hit the top of the range at RIR 4 is
    /// not a signal to add load — the median RIR is outside the target.
    func testHighRIRDoesNotQualifyASession() {
        let sessions = (0..<3).map { index in
            Fixtures.session(id: "s\(index)", daysAgo: index * 3, exerciseID: "flat-bench", sets: topSets(weight: 100, reps: 8, rir: 4))
        }
        let proposal = ProgressionEngine.proposal(
            planned: planned,
            exercise: ExerciseCatalog.exercise("flat-bench")!,
            history: history(sessions)
        )
        XCTAssertNotEqual(proposal.tone, .ready)
    }

    /// §3.2 LOAD_STEP: a low-rep primary lift advances on one confirmation.
    func testLowRepPrimaryStrengthNeedsOnlyOneConfirmation() {
        let lowRep = PlannedExercise(
            exerciseID: "flat-bench",
            role: .primaryStrength,
            sets: [SetPrescription(repRange: 4...6, targetRIR: 1...3)]
        )
        XCTAssertEqual(ProgressionEngine.requiredConfirmations(for: lowRep), 1)
        XCTAssertEqual(ProgressionEngine.requiredConfirmations(for: planned), 2)
    }

    func testRestInheritsFromRole() {
        XCTAssertEqual(RestPrescription.forRole(.primaryStrength).defaultSeconds, 180)
        XCTAssertEqual(RestPrescription.forRole(.secondaryCompound).defaultSeconds, 120)
        XCTAssertEqual(RestPrescription.forRole(.isolation).defaultSeconds, 90)
        XCTAssertEqual(RestPrescription.forRole(.primaryStrength).displayLabel, "3:00")
    }

    func testAdjustingTheTimerNeverResetsIt() {
        let start = Date()
        var timer = RestTimerState(targetSeconds: 120, startedAt: start)
        let thirtySecondsIn = start.addingTimeInterval(30)
        XCTAssertEqual(timer.remaining(at: thirtySecondsIn), 90)

        timer.adjust(by: 15, floorRemainingAt: thirtySecondsIn)
        XCTAssertEqual(timer.remaining(at: thirtySecondsIn), 105)
        XCTAssertEqual(timer.startedAt, start, "The clock kept running; only the target moved")
    }
}

final class RecordsEngineTests: XCTestCase {

    private func history(_ sessions: [TrainingSession]) -> ExerciseHistory {
        ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: sessions)
    }

    private var threeSessions: [TrainingSession] {
        (0..<3).map { index in
            Fixtures.session(id: "s\(index)", daysAgo: (index + 1) * 3, exerciseID: "flat-bench", sets: [(100, 6, 1)])
        }
    }

    func testNoRecordBannerDuringTheBaselinePeriod() {
        let sessions = Array(threeSessions.prefix(2))
        let record = RecordsEngine.record(
            for: [LoggedSet(index: 0, weightKg: 200, reps: 5)],
            history: history(sessions)
        )
        XCTAssertEqual(record?.headline, "Building a reference · session 3 of 3")
        // Phase 2 replaced this copy: artboard 08 had promised progression
        // after one session, which the three-session gate then withheld.
        XCTAssertEqual(
            record?.detail,
            "After three comparable sessions, SETLINE can show reliable progression suggestions and records."
        )
    }

    func testLoadPROutranksEverythingElse() {
        let record = RecordsEngine.record(
            for: [LoggedSet(index: 0, weightKg: 105, reps: 6)],
            history: history(threeSessions)
        )
        XCTAssertEqual(record?.type, .load)
        XCTAssertEqual(record?.headline, "Heaviest ever · 105 kg × 6")
        // 17R: the previous best in full — unit, reps and the day it was
        // first done ("Vorige beste 122,5 kg × 3 op 31 aug").
        let first = history(threeSessions).appearances.map(\.date).min()!
        XCTAssertEqual(record?.detail, "Previous best 100 kg × 6 on \(NumberDisplay.english.shortDate(first))")
    }

    func testRepPRAtAKnownLoad() {
        let record = RecordsEngine.record(
            for: [LoggedSet(index: 0, weightKg: 100, reps: 8)],
            history: history(threeSessions)
        )
        XCTAssertEqual(record?.type, .rep)
        XCTAssertEqual(record?.headline, "+2 reps at 100 kg")
        XCTAssertEqual(record?.detail, "8 reps, last time 6")
    }

    /// §15 change 5: the epsilon is 0.5 kg, not 0.05, so rounding noise
    /// never manufactures a record.
    func testQuarterKiloIsNotARecord() {
        let record = RecordsEngine.record(
            for: [LoggedSet(index: 0, weightKg: 100.25, reps: 6)],
            history: history(threeSessions)
        )
        XCTAssertNotEqual(record?.type, .load)
    }

    /// §10.2 guard 2 and §13 rule 3.
    func testNoEstimatedOneRepMaxAboveTenReps() {
        XCTAssertNil(Estimates.e1RM(weightKg: 100, reps: 11))
        XCTAssertNotNil(Estimates.e1RM(weightKg: 100, reps: 10))
    }

    /// Neither a load PR (105 kg still stands) nor a rep PR (no history at
    /// 102,5 kg), but a higher estimate than anything before it.
    func testEstimatedStrengthAlwaysSaysItIsAnEstimate() {
        let sessions = (0..<3).map { index in
            Fixtures.session(
                id: "s\(index)",
                daysAgo: (index + 1) * 3,
                exerciseID: "flat-bench",
                sets: [(105, 2, 1), (100, 6, 1)]
            )
        }
        let record = RecordsEngine.record(
            for: [LoggedSet(index: 0, weightKg: 102.5, reps: 6)],
            history: history(sessions)
        )
        XCTAssertEqual(record?.type, .estimatedStrength)
        XCTAssertTrue(record?.headline.contains("Estimated strength") == true)
        XCTAssertTrue(record?.detail.contains("Not measured") == true)
    }

    /// §9.2 and §1: a paused set is only ever compared to other paused sets.
    func testPausedSetsAreNotComparableToUnpausedOnes() {
        let paused = SetModifiers(pauseEnabled: true, pauseSeconds: 2)
        XCTAssertFalse(paused.isComparable(to: .none))
        XCTAssertTrue(paused.isComparable(to: SetModifiers(pauseEnabled: true, pauseSeconds: 2.4)))
        XCTAssertFalse(paused.isComparable(to: SetModifiers(pauseEnabled: true, pauseSeconds: 3)))
    }

    func testWarmupsNeverEnterVolumeOrRecords() {
        let warmup = LoggedSet(index: 0, weightKg: 60, reps: 8, isWarmup: true)
        XCTAssertFalse(warmup.countsTowardVolume)
        XCTAssertFalse(warmup.countsTowardProgression)
        XCTAssertEqual(RecordsEngine.volumeLoad([warmup]), 0)
    }
}

final class SetRowPresenterTests: XCTestCase {

    func testEmptyRowShowsLastSessionAndWrittenRowShowsTheDelta() {
        let sessions = (0..<3).map { index in
            Fixtures.session(id: "s\(index)", daysAgo: (index + 1) * 3, exerciseID: "flat-bench", sets: [(47.5, 8, 1), (47.5, 8, 1)])
        }
        let history = ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: sessions)
        let sets = [
            LoggedSet(index: 0, weightKg: 50, reps: 8),
            LoggedSet(index: 1),
        ]
        let rows = SetRowPresenter.rows(
            sets: sets,
            reference: history.mostRecent,
            history: history,
            activeIndex: 1
        )
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[0].status, .written)
        XCTAssertEqual(rows[0].repsLabel, "8")
        XCTAssertEqual(rows[1].status, .nextUp)
        XCTAssertEqual(rows[1].repsLabel, "—")
        XCTAssertEqual(rows[1].delta, .reference("47.5 × 8"))
    }

    func testAHeavierCompleteSetReadsPRAtTheMomentItHappens() {
        let sessions = (0..<3).map { index in
            Fixtures.session(id: "s\(index)", daysAgo: (index + 1) * 3, exerciseID: "flat-bench", sets: [(47.5, 8, 1)])
        }
        let history = ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: sessions)
        let rows = SetRowPresenter.rows(
            sets: [LoggedSet(index: 0, weightKg: 50, reps: 8)],
            reference: history.mostRecent,
            history: history,
            activeIndex: nil
        )
        XCTAssertEqual(rows[0].delta, .personalRecord)
    }

    func testAdviceLineOnlyAppearsOnceTheLastSetIsWritten() {
        let sessions = (0..<3).map { index in
            Fixtures.session(id: "s\(index)", daysAgo: (index + 1) * 3, exerciseID: "flat-bench", sets: [(100, 8, 1), (100, 8, 1)])
        }
        let history = ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: sessions)
        let planned = PlannedExercise(
            exerciseID: "flat-bench",
            role: .secondaryCompound,
            sets: [SetPrescription(repRange: 6...8), SetPrescription(repRange: 6...8)]
        )
        let exercise = ExerciseCatalog.exercise("flat-bench")!

        let partial = [LoggedSet(index: 0, weightKg: 100, reps: 8), LoggedSet(index: 1)]
        XCTAssertNil(SetRowPresenter.adviceLine(sets: partial, planned: planned, exercise: exercise, history: history))

        let complete = [
            LoggedSet(index: 0, weightKg: 100, reps: 8),
            LoggedSet(index: 1, weightKg: 100, reps: 8),
        ]
        XCTAssertEqual(
            SetRowPresenter.adviceLine(sets: complete, planned: planned, exercise: exercise, history: history),
            "All reps done. Next time 102.5 kg."
        )
    }
}

final class CatalogTests: XCTestCase {

    func testEveryPlannedExerciseResolvesToACatalogEntryWithARole() {
        let plans = [
            PlanCatalog.personal,
            PlanCatalog.sciencePPLUL,
            PlanCatalog.scienceUpperLower,
            PlanCatalog.scienceFullBody,
        ]
        for plan in plans {
            for day in plan {
                XCTAssertFalse(day.exercises.isEmpty, "\(day.id) has no exercises")
                for planned in day.exercises {
                    XCTAssertNotNil(
                        ExerciseCatalog.exercise(planned.exerciseID),
                        "\(planned.exerciseID) is planned but not in the catalogue"
                    )
                    XCTAssertFalse(planned.sets.isEmpty, "\(planned.exerciseID) has no typed sets")
                    XCTAssertNotNil(planned.authoredNote, "\(planned.exerciseID) lost its authored strings")
                }
            }
        }
    }

    func testPlanShapesMatchTheWebApp() {
        XCTAssertEqual(PlanCatalog.personal.count, 5)
        XCTAssertEqual(PlanCatalog.sciencePPLUL.count, 5)
        XCTAssertEqual(PlanCatalog.scienceUpperLower.count, 4)
        XCTAssertEqual(PlanCatalog.scienceFullBody.count, 3)
        XCTAssertEqual(PlanCatalog.personal.map(\.id), ["push", "pull", "legs", "lower", "upper"])
    }

    func testAuthoredGuidanceAndAlternativesCameAcrossWhole() {
        XCTAssertEqual(GuidanceCatalog.byExercise.count, 39)
        XCTAssertEqual(AlternativesCatalog.byExercise.count, 39)
        XCTAssertEqual(AlternativesCatalog.byExercise.values.map(\.count).reduce(0, +), 78)
        XCTAssertEqual(
            GuidanceCatalog.guide(for: "flat-bench").warmup,
            "Bar×15 → 60×8 → 80×5 → 100×3 → 110×1. No set to failure."
        )
    }

    /// The typed prescription must reproduce what the string meant.
    func testCompoundPrescriptionsBecomeTypedSets() {
        let bench = PlanCatalog.personal
            .first { $0.id == "push" }?
            .exercises.first { $0.exerciseID == "flat-bench" }
        XCTAssertEqual(bench?.authoredNote?.prescription, "1×5–6 + 2×6–8")
        XCTAssertEqual(bench?.sets.count, 3)
        XCTAssertEqual(bench?.sets[0].repRange, 5...6)
        XCTAssertEqual(bench?.sets[1].repRange, 6...8)
        XCTAssertEqual(bench?.sets[2].repRange, 6...8)
    }

    func testPausedBenchKeepsItsPauseAsAModifier() {
        let paused = PlanCatalog.personal
            .first { $0.id == "upper" }?
            .exercises.first { $0.exerciseID == "upper-paused-bench" }
        XCTAssertEqual(paused?.modifiers.pauseEnabled, true)
        XCTAssertEqual(paused?.modifiers.pauseSeconds, 2)
    }

    func testDutchNumberFormatting() {
        let display = NumberDisplay.english
        XCTAssertEqual(display.kg(102.5), "102.5 kg")
        XCTAssertEqual(display.volumeKg(6480), "6,480 kg")
        XCTAssertEqual(display.signedDelta(2.5), "+2.5")
        XCTAssertEqual(display.signedDelta(0), "=")
        XCTAssertEqual(display.setReference(weightKg: 47.5, reps: 8), "47.5 × 8")
    }
}

final class ScheduleTests: XCTestCase {

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        return calendar
    }

    private func date(_ string: String) -> Date {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: string)!
    }

    func testDefaultWeekMatchesTheWebApp() {
        // Monday 7 September 2026 is a push day in the default shape.
        XCTAssertEqual(Schedule.canonicalDay(for: date("2026-09-07"), overrides: [:], calendar: calendar), "push")
        XCTAssertEqual(Schedule.canonicalDay(for: date("2026-09-08"), overrides: [:], calendar: calendar), "pull")
        XCTAssertEqual(Schedule.canonicalDay(for: date("2026-09-09"), overrides: [:], calendar: calendar), "legs")
        XCTAssertEqual(Schedule.canonicalDay(for: date("2026-09-10"), overrides: [:], calendar: calendar), "rest")
        XCTAssertEqual(Schedule.canonicalDay(for: date("2026-09-13"), overrides: [:], calendar: calendar), "rest")
    }

    func testAnOverrideWinsOverTheDefaultShape() {
        let overrides = ["2026-09-10": "upper"]
        XCTAssertEqual(Schedule.canonicalDay(for: date("2026-09-10"), overrides: overrides, calendar: calendar), "upper")
    }

    /// Science plan day ids are prefixed, so the canonical id has to resolve
    /// onto them rather than matching exactly.
    func testCanonicalDaysResolveOntoPrefixedSciencePlanIDs() {
        XCTAssertEqual(Schedule.day(for: "push", in: PlanCatalog.personal)?.id, "push")
        XCTAssertEqual(Schedule.day(for: "push", in: PlanCatalog.sciencePPLUL)?.id, "science-push")
        XCTAssertNil(Schedule.day(for: "rest", in: PlanCatalog.personal))
    }

    func testWeekStartsOnMonday() {
        let week = Schedule.mondayFirstWeek(containing: date("2026-09-10"), calendar: calendar)
        XCTAssertEqual(week.count, 7)
        XCTAssertEqual(Schedule.dateKey(week[0], calendar: calendar), "2026-09-07")
        XCTAssertEqual(Schedule.dateKey(week[6], calendar: calendar), "2026-09-13")
    }
}

final class PausedSessionEndingTests: XCTestCase {

    private func snapshot(logged: Int) -> ActiveSessionSnapshot {
        let sets = (0..<3).map { index in
            LoggedSet(index: index, weightKg: 100, reps: index < logged ? 6 : 0)
        }
        return ActiveSessionSnapshot(
            dayID: "push",
            dayLabel: "Push",
            startedAt: Date(timeIntervalSince1970: 1_788_000_000),
            currentIndex: 0,
            results: [ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press", sets: sets)]
        )
    }

    /// Ending from the home screen keeps what was written and nothing else.
    func testEndingKeepsOnlyWrittenSets() {
        let session = snapshot(logged: 2).finishedSession()
        XCTAssertEqual(session.results.first?.sets.count, 2)
        XCTAssertEqual(session.completion, 66)
        XCTAssertEqual(session.dayID, "push")
        XCTAssertEqual(session.kind, .workout)
    }

    /// The session keeps the date it was started on, not the date it was
    /// ended — a Friday workout finished on Saturday is still Friday's.
    func testTheSessionKeepsItsOriginalDate() {
        let started = Date(timeIntervalSince1970: 1_788_000_000)
        XCTAssertEqual(snapshot(logged: 1).finishedSession().date, started)
    }

    func testAnUntouchedPausedSessionProducesNothingWorthKeeping() {
        let snapshot = snapshot(logged: 0)
        XCTAssertFalse(snapshot.hasProgress)
        XCTAssertTrue(snapshot.finishedSession().results.allSatisfy { $0.sets.isEmpty })
    }
}
