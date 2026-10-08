import XCTest
@testable import SetlineCore

/// TRAINING_LOGIC §11: fatigue is read from logged sets, two signals propose,
/// one never does, and nothing is ever applied by itself.
final class FatigueTests: XCTestCase {

    private let now = LegacyAdapter.isoDate("2026-09-18T18:00:00.000Z")!

    private func set(_ weight: Decimal, _ reps: Int, rir: Int? = nil) -> LoggedSet {
        LoggedSet(index: 0, weightKg: weight, reps: reps, rirReported: rir)
    }

    private func session(
        _ id: String,
        daysAgo: Int,
        dayID: String = "push",
        results: [ExerciseResult],
        planned: Int? = nil,
        completed: Int? = nil
    ) -> TrainingSession {
        var session = TrainingSession(
            id: id,
            date: Calendar.current.date(byAdding: .day, value: -daysAgo, to: now)!,
            dayID: dayID,
            dayLabel: dayID.capitalized,
            completion: 100,
            results: results
        )
        session.plannedSetCount = planned
        session.completedSetCount = completed
        return session
    }

    private func result(_ id: String, _ name: String, _ sets: [LoggedSet]) -> ExerciseResult {
        ExerciseResult(exerciseID: id, name: name, sets: sets)
    }

    func testOneSignalNeverProposesAnything() {
        // Reps fell on a single exercise: a bad day, not a pattern.
        let reading = Fatigue.read(sessions: [
            session("b", daysAgo: 1, results: [result("flat-bench", "Bankdrukken", [set(100, 5)])]),
            session("a", daysAgo: 4, results: [result("flat-bench", "Bankdrukken", [set(100, 6)])]),
        ], now: now)
        XCTAssertFalse(reading.proposes)
    }

    func testRepsFallingOnTwoExercisesIsOneSignal() {
        let reading = Fatigue.read(sessions: [
            session("b", daysAgo: 1, results: [
                result("flat-bench", "Bankdrukken", [set(100, 5)]),
                result("pec-fly", "Pec-fly", [set(55, 11)]),
            ]),
            session("a", daysAgo: 4, results: [
                result("flat-bench", "Bankdrukken", [set(100, 6)]),
                result("pec-fly", "Pec-fly", [set(55, 12)]),
            ]),
        ], now: now)
        XCTAssertTrue(reading.signals.contains(.performanceRegression))
        XCTAssertFalse(reading.proposes, "still only one signal")
    }

    func testRepsFallingAndEffortDriftingTogetherPropose() {
        let reading = Fatigue.read(sessions: [
            session("b", daysAgo: 1, results: [
                result("flat-bench", "Bankdrukken", [set(100, 5)]),
                result("pec-fly", "Pec-fly", [set(55, 11)]),
                result("pressdown", "Pressdown", [set(35, 12, rir: 0)]),
            ]),
            session("a", daysAgo: 4, results: [
                result("flat-bench", "Bankdrukken", [set(100, 6)]),
                result("pec-fly", "Pec-fly", [set(55, 12)]),
                result("pressdown", "Pressdown", [set(35, 12, rir: 2)]),
            ]),
        ], now: now)
        XCTAssertEqual(reading.signals, [.performanceRegression, .effortDrift])
        XCTAssertTrue(reading.proposes)
        XCTAssertTrue(reading.evidence.contains { $0.detail.contains("→") })
    }

    func testFinishingLessThanFourFifthsTwiceIsItsOwnSignal() {
        let reading = Fatigue.read(sessions: [
            session("b", daysAgo: 1, results: [], planned: 20, completed: 12),
            session("a", daysAgo: 4, results: [], planned: 20, completed: 15),
        ], now: now)
        XCTAssertTrue(reading.signals.contains(.completionDrop))
    }

    func testNothingOlderThanAWeekCounts() {
        let reading = Fatigue.read(sessions: [
            session("b", daysAgo: 1, results: [result("flat-bench", "Bankdrukken", [set(100, 5, rir: 0)])]),
            session("a", daysAgo: 20, results: [result("flat-bench", "Bankdrukken", [set(100, 6, rir: 2)])]),
        ], now: now)
        XCTAssertEqual(reading, .none)
    }

    func testOneSessionSaysNothingAtAll() {
        XCTAssertEqual(
            Fatigue.read(sessions: [session("a", daysAgo: 1, results: [])], now: now),
            .none
        )
    }

    // MARK: The prescription

    func testTheLighterWeekCutsSetsAndNotExercises() {
        let deload = Deload(startedAt: now)
        XCTAssertEqual(deload.sets(from: 5), 3)
        XCTAssertEqual(deload.sets(from: 4), 2)
        XCTAssertEqual(deload.sets(from: 1), 1, "never to zero")
        XCTAssertEqual(deload.detail, "Same exercises, 40% fewer sets, RIR +2. Weight stays.")
        XCTAssertEqual(deload.headline, "Suggestion: 5 lighter days")
    }

    func testTheLighterWeekEndsOnItsOwn() {
        let deload = Deload(startedAt: now)
        let calendar = Calendar.current
        XCTAssertTrue(deload.isActive(on: now))
        XCTAssertTrue(deload.isActive(on: calendar.date(byAdding: .day, value: 4, to: now)!))
        XCTAssertFalse(deload.isActive(on: calendar.date(byAdding: .day, value: 5, to: now)!))
        XCTAssertFalse(deload.isActive(on: calendar.date(byAdding: .day, value: -1, to: now)!))
    }

    func testItSurvivesBeingStored() throws {
        let deload = Deload(startedAt: now)
        let state = StateMerge.apply(
            [StateChange(.setDeload(LegacyAdapter.json(deload)), createdAt: now)],
            to: LegacyState(raw: [:]), now: now
        )
        let read = try XCTUnwrap(LegacyAdapter.deload(from: state))
        XCTAssertEqual(read.days, 5)
        XCTAssertEqual(read.rirIncrease, 2)

        let cleared = StateMerge.apply([StateChange(.setDeload(.null), createdAt: now)], to: state, now: now)
        XCTAssertNil(LegacyAdapter.deload(from: cleared))
    }
}

/// Addendum 12R and the review's PR treatment, as the row model states them.
final class SetRowReserveTests: XCTestCase {

    func testAReportedReserveTakesTheComparisonColumn() {
        XCTAssertFalse(SetDelta.reserve(1).describesTheSet, "it compares nothing, it reports")
        XCTAssertNotEqual(SetDelta.reserve(1), SetDelta.reserve(2))
    }
}

/// The home card's set count and the session that opens must agree, in a
/// normal week and in a lighter one.
final class SessionPrescriptionTests: XCTestCase {

    private let day = PlanCatalog.personal.first { $0.id == "push" }!

    /// What a session holds when it opens: one slot per exercise, built from
    /// the prescription, counted by the rows the program prescribed.
    private func openedSessionSetCount(deload: Deload?) -> Int {
        day.exercises.enumerated().reduce(0) { total, item in
            let slot = SessionSlot(
                position: item.offset,
                plan: SessionPrescription.planned(item.element, deload: deload),
                exerciseName: item.element.exerciseID
            )
            return total + slot.prescribedSetCount
        }
    }

    func testANormalWeekCountsThePlanAsWritten() {
        let count = SessionPrescription.setCount(of: day, deload: nil)
        XCTAssertEqual(count, WeekPlan.sets(of: day))
        XCTAssertEqual(count, openedSessionSetCount(deload: nil))
    }

    func testALighterWeekCountsTheSetsTheSessionOpensWith() {
        let deload = Deload(startedAt: Date())
        let count = SessionPrescription.setCount(of: day, deload: deload)
        XCTAssertEqual(count, openedSessionSetCount(deload: deload))
        XCTAssertLessThan(count, WeekPlan.sets(of: day), "The full plan is not what the session opens with")
        // Sets are cut, never exercises (§11.2).
        let lightened = day.exercises.map { SessionPrescription.planned($0, deload: deload) }
        XCTAssertEqual(lightened.map(\.exerciseID), day.exercises.map(\.exerciseID))
        XCTAssertTrue(lightened.allSatisfy { $0.targetSets >= 1 })
    }

    func testASetAddedDuringTheSessionIsNotPartOfThePrescription() {
        let planned = SessionPrescription.planned(day.exercises[0], deload: Deload(startedAt: Date()))
        var slot = SessionSlot(position: 0, plan: planned, exerciseName: planned.exerciseID)
        _ = slot.addSet()
        XCTAssertEqual(slot.prescribedSetCount, planned.targetSets)
        XCTAssertEqual(slot.setCount, planned.targetSets + 1)
    }
}
