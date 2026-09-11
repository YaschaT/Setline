import XCTest
@testable import SetlineCore

// MARK: - Calibration

final class CalibrationTests: XCTestCase {

    private let bench = ExerciseCatalog.exercise("flat-bench")!

    private func history(sessions: Int) -> ExerciseHistory {
        let all = (0..<sessions).map { index in
            Fixtures.session(
                id: "s\(index)",
                daysAgo: (index + 1) * 3,
                exerciseID: "flat-bench",
                sets: [(100, 6, 1)]
            )
        }
        return ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: all)
    }

    /// Calibration is for "nothing to compare against", not "not enough to
    /// compare against". One session is a reference being built, and last
    /// week's weight is a perfectly good prefill.
    func testCalibrationOnlyAppliesWithNoHistoryAtAll() {
        XCTAssertTrue(Calibration.isNeeded(history: history(sessions: 0)))
        XCTAssertFalse(Calibration.isNeeded(history: history(sessions: 1)))
        XCTAssertFalse(Calibration.isNeeded(history: history(sessions: 3)))
    }

    func testThePromptNamesTheTargetAndProposesNoWeight() {
        let prompt = Calibration.prompt(for: bench)
        XCTAssertEqual(prompt.targetReps, 8)
        XCTAssertEqual(prompt.targetRIR, 2)
        XCTAssertTrue(prompt.headline.contains("8 reps"))
        XCTAssertTrue(prompt.headline.contains("2 in reserve"))
        XCTAssertFalse(prompt.headline.contains("kg"), "It must not suggest a weight")
        XCTAssertEqual(prompt.contextLabel, "Geen historiek")
    }

    func testRemainingSetsPrefillFromTheCalibrationSet() {
        let set = LoggedSet(index: 0, weightKg: 80, reps: 8, rirReported: 2)
        let prefill = Calibration.prefill(after: set, exercise: bench)
        XCTAssertEqual(prefill.weightKg, 80)
        XCTAssertFalse(prefill.steppedUp)
    }

    /// §12.3's cheap extra: clearly easy means the next set may start one
    /// increment higher — within the same exercise, which is legitimate.
    func testAnEasyCalibrationSetStepsTheNextSetUpByOneIncrement() {
        let easy = LoggedSet(index: 0, weightKg: 80, reps: 8, rirReported: 3)
        let prefill = Calibration.prefill(after: easy, exercise: bench)
        XCTAssertEqual(prefill.weightKg, 82.5, "One barbell increment, not a converted estimate")
        XCTAssertTrue(prefill.steppedUp)
    }

    func testNoStepUpWithoutAnRIR() {
        let set = LoggedSet(index: 0, weightKg: 80, reps: 8, rirReported: nil)
        XCTAssertFalse(Calibration.prefill(after: set, exercise: bench).steppedUp)
    }

    /// The whole safety question: a calibration set is logged while the
    /// three-session gate is shut, so it cannot become a record or a proposal.
    func testACalibrationSetCannotBecomeARecordOrAProposal() {
        let empty = history(sessions: 0)
        let calibration = [LoggedSet(index: 0, weightKg: 200, reps: 8, rirReported: 2)]

        let record = RecordsEngine.record(for: calibration, history: empty)
        XCTAssertEqual(record?.type, .sessionBest)
        XCTAssertTrue(record?.headline.hasPrefix("Referentie opbouwen") == true)

        XCTAssertFalse(
            RecordsEngine.isLoadPR(set: calibration[0], history: empty, earlierInSession: []),
            "A first-ever set is not a personal record"
        )

        let planned = PlannedExercise(exerciseID: "flat-bench", role: .secondaryCompound, sets: [SetPrescription(repRange: 6...8)])
        XCTAssertEqual(
            ProgressionEngine.proposal(planned: planned, exercise: bench, history: empty).tone,
            .noReference
        )
    }

    func testTheGridSwitchesToCalibrationAndThenToItsBaseline() {
        let empty = history(sessions: 0)
        let sets = [LoggedSet(index: 0), LoggedSet(index: 1), LoggedSet(index: 2)]

        let pending = SetRowPresenter.rows(
            sets: sets, reference: nil, history: empty, activeIndex: 0, mode: .calibrationPending
        )
        XCTAssertEqual(pending[0].delta, .calibration)
        XCTAssertEqual(pending[1].weightLabel, "volgt uit set 1")

        let baseline = LoggedSet(index: 0, weightKg: 80, reps: 8)
        let after = SetRowPresenter.rows(
            sets: [baseline, LoggedSet(index: 1, weightKg: 80), LoggedSet(index: 2, weightKg: 80)],
            reference: nil, history: empty, activeIndex: 1, mode: .calibrated(baseline: baseline)
        )
        XCTAssertEqual(after[0].delta, .baseline)
        XCTAssertEqual(after[1].delta, .reference("80 × 8"))
    }
}

// MARK: - Reference gate copy

final class ReferenceGateCopyTests: XCTestCase {

    private let gate = "Na drie vergelijkbare sessies kan SETLINE betrouwbare progressievoorstellen en records tonen."

    func testTheProposalAndTheRecordSayTheSameThing() {
        let history = ExerciseHistory(exerciseID: "flat-bench", modifiers: .none, appearances: [])
        let planned = PlannedExercise(exerciseID: "flat-bench", role: .secondaryCompound, sets: [SetPrescription(repRange: 6...8)])

        let proposal = ProgressionEngine.proposal(
            planned: planned, exercise: ExerciseCatalog.exercise("flat-bench")!, history: history
        )
        XCTAssertEqual(proposal.body, gate)
        XCTAssertEqual(proposal.headline, "Referentie opbouwen · sessie 1 van 3")

        let record = RecordsEngine.record(for: [LoggedSet(index: 0, weightKg: 100, reps: 6)], history: history)
        XCTAssertEqual(record?.detail, gate)
    }

    /// The counter has to keep up with the sessions behind it.
    func testTheCounterCountsUpAndStopsAtThree() {
        for sessions in 0...4 {
            let appearances = (0..<sessions).map {
                ExerciseAppearance(date: Date(timeIntervalSince1970: Double(1_788_000_000 - $0 * 86_400)), sets: [])
            }
            let history = ExerciseHistory(exerciseID: "x", modifiers: .none, appearances: appearances)
            XCTAssertEqual(history.referenceSessionNumber, min(sessions + 1, 3))
            XCTAssertEqual(history.hasReference, sessions >= 3)
        }
    }
}

// MARK: - Paused and partial

final class PausedAndPartialTests: XCTestCase {

    private let planned = PlannedExercise(
        exerciseID: "flat-bench",
        role: .secondaryCompound,
        sets: Array(repeating: SetPrescription(repRange: 6...8, targetRIR: 1...2), count: 3)
    )
    private let pausedPlan = PlannedExercise(
        exerciseID: "upper-paused-bench",
        role: .primaryStrength,
        sets: Array(repeating: SetPrescription(repRange: 4...6, targetRIR: 1...2), count: 3),
        modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2)
    )

    private func session(id: String, daysAgo: Int, exerciseID: String, modifiers: SetModifiers, reps: Int) -> TrainingSession {
        let date = Calendar(identifier: .gregorian).date(byAdding: .day, value: -daysAgo, to: Date())!
        let sets = (0..<3).map { LoggedSet(index: $0, weightKg: 100, reps: reps, rirReported: 1, modifiers: modifiers) }
        return TrainingSession(
            id: id, date: date, dayID: "upper", dayLabel: "Upper", completion: 100,
            results: [ExerciseResult(exerciseID: exerciseID, name: exerciseID, sets: sets)]
        )
    }

    /// A planned paused exercise is its own series and progresses inside it.
    func testAPlannedPausedExerciseProgressesWithinItsOwnSeries() {
        let pause = SetModifiers(pauseEnabled: true, pauseSeconds: 2)
        let sessions = (0..<3).map {
            session(id: "p\($0)", daysAgo: ($0 + 1) * 3, exerciseID: "upper-paused-bench", modifiers: pause, reps: 6)
        }
        let history = ExerciseHistory.build(exerciseID: "upper-paused-bench", modifiers: pause, from: sessions)

        XCTAssertEqual(history.appearances.count, 3, "Paused sets are comparable to other paused sets")
        let proposal = ProgressionEngine.proposal(
            planned: pausedPlan,
            exercise: ExerciseCatalog.exercise("upper-paused-bench")!,
            history: history
        )
        XCTAssertEqual(proposal.tone, .ready, "A planned paused lift must be able to progress")
    }

    /// An ad-hoc pause on a normally-unpaused exercise puts that set outside
    /// the series, so it never influences that exercise's progression.
    func testAnAdHocPauseDropsOutOfTheNormalSeries() {
        let normal = (0..<2).map {
            session(id: "n\($0)", daysAgo: ($0 + 1) * 3, exerciseID: "flat-bench", modifiers: .none, reps: 8)
        }
        let adHoc = [session(id: "a", daysAgo: 9, exerciseID: "flat-bench",
                             modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2), reps: 8)]

        let history = ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: normal + adHoc)
        XCTAssertEqual(history.appearances.count, 2, "The paused session is not part of the unpaused series")
        XCTAssertFalse(history.hasReference, "And it does not count toward the three")
    }

    func testPauseLengthsMustMatchToBeComparable() {
        let two = SetModifiers(pauseEnabled: true, pauseSeconds: 2)
        XCTAssertTrue(two.isComparable(to: SetModifiers(pauseEnabled: true, pauseSeconds: 2.4)))
        XCTAssertFalse(two.isComparable(to: SetModifiers(pauseEnabled: true, pauseSeconds: 3)))
        XCTAssertFalse(two.isComparable(to: .none))
    }

    /// The rule that outranks everything: a paused rep is never added onto
    /// the rep count, and the two can never live in one set again.
    func testPausedSetsCarryNoSeparateRepCount() {
        let paused = LoggedSet(
            index: 0, weightKg: 100, reps: 6,
            modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2)
        )
        XCTAssertEqual(paused.reps, 6)
        XCTAssertNil(paused.pausedReps, "Nothing the app writes may set a paused-rep count")
        XCTAssertTrue(paused.countsTowardProgression, "Within its own series it is a normal set")
        XCTAssertTrue(paused.countsTowardVolume)
    }

    /// Partial reps are a count beside the reps, excluded from progression,
    /// still part of volume (§5, and 16R).
    func testPartialRepsCountForVolumeButNotProgression() {
        let partial = LoggedSet(
            index: 0, weightKg: 100, reps: 8,
            flags: [.partialReps], partialReps: 3
        )
        XCTAssertEqual(partial.reps, 8, "The partials are not inside the rep count")
        XCTAssertFalse(partial.countsTowardProgression)
        XCTAssertTrue(partial.countsTowardVolume)
        XCTAssertEqual(RecordsEngine.volumeLoad([partial]), 800)
    }

    func testTheRowTellsPausedAndPartialApartByWordAndCount() {
        let history = ExerciseHistory(exerciseID: "flat-bench", modifiers: .none, appearances: [])
        let rows = SetRowPresenter.rows(
            sets: [
                LoggedSet(index: 0, weightKg: 100, reps: 6, modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2)),
                LoggedSet(index: 1, weightKg: 100, reps: 8, flags: [.partialReps], partialReps: 3),
            ],
            reference: nil, history: history, activeIndex: nil
        )
        XCTAssertEqual(rows[0].delta, .paused)
        XCTAssertEqual(rows[1].delta, .partial(count: 3), "The count travels with the state, so colour is never the only signal")
    }
}

// MARK: - Warm-up ladder

final class WarmupPlannerTests: XCTestCase {

    private let bench = ExerciseCatalog.exercise("flat-bench")!
    private let lateral = ExerciseCatalog.exercise("push-lateral")!
    private let machine = ExerciseCatalog.exercise("pec-fly")!

    private func context(_ position: Int, compound: Bool) -> WarmupPlanner.Context {
        WarmupPlanner.Context(positionInSession: position, isCompound: compound)
    }

    func testAHeavyCompoundGetsThreeRampSets() {
        let ladder = WarmupPlanner.ladder(topSetKg: 105, exercise: bench, context: context(0, compound: true))
        XCTAssertEqual(ladder.count, 3)
        XCTAssertEqual(ladder.map(\.reps), [8, 4, 2], "Ramp reps fall as the load rises")
        XCTAssertTrue(ladder[0].weightKg < ladder[1].weightKg)
        XCTAssertTrue(ladder[1].weightKg < ladder[2].weightKg)
        XCTAssertTrue(ladder.allSatisfy { $0.weightKg < 105 }, "A ramp set is never the top set")
    }

    /// §7: trimmed from the top when the load is light.
    func testLighterLoadsGetAShorterRamp() {
        XCTAssertEqual(WarmupPlanner.ladder(topSetKg: 60, exercise: bench, context: context(0, compound: true)).count, 2)
        XCTAssertEqual(WarmupPlanner.ladder(topSetKg: 35, exercise: bench, context: context(0, compound: true)).count, 1)
        XCTAssertTrue(WarmupPlanner.ladder(topSetKg: 15, exercise: bench, context: context(0, compound: true)).isEmpty)
    }

    /// The Phase 2 proxy for "not first for this muscle group": isolation
    /// work later in the session is already warm.
    func testIsolationLaterInTheSessionGetsNoRamp() {
        XCTAssertTrue(WarmupPlanner.ladder(topSetKg: 40, exercise: lateral, context: context(4, compound: false)).isEmpty)
        XCTAssertFalse(WarmupPlanner.ladder(topSetKg: 40, exercise: lateral, context: context(0, compound: false)).isEmpty,
                       "First exercise of the session still gets one")
    }

    func testASupportedMachineAtModerateLoadGetsASingleRamp() {
        let ladder = WarmupPlanner.ladder(topSetKg: 55, exercise: machine, context: context(0, compound: false))
        XCTAssertEqual(ladder.count, 1)
        XCTAssertEqual(ladder[0].reps, 10)
    }

    func testRampWeightsLandOnRealIncrements() {
        let ladder = WarmupPlanner.ladder(topSetKg: 105, exercise: bench, context: context(0, compound: true))
        for set in ladder {
            let steps = (set.weightKg / bench.incrementKg) as NSDecimalNumber
            XCTAssertEqual(steps.doubleValue, steps.doubleValue.rounded(), accuracy: 0.001,
                           "\(set.weightKg) kg is not a loadable weight")
        }
    }

    /// Warm-ups are display only: they never reach volume, progression or a
    /// record, and the rows carry no status.
    func testWarmupRowsAreInertAndUnloggable() {
        let ladder = WarmupPlanner.ladder(topSetKg: 105, exercise: bench, context: context(0, compound: true))
        let rows = SetRowPresenter.warmupRows(ladder)
        XCTAssertEqual(rows.map(\.indexLabel), ["W1", "W2", "W3"])
        XCTAssertTrue(rows.allSatisfy { $0.isWarmup && $0.status == .warmup && $0.delta == .none })

        let asSets = ladder.map { LoggedSet(index: 0, weightKg: $0.weightKg, reps: $0.reps, isWarmup: true) }
        XCTAssertEqual(RecordsEngine.volumeLoad(asSets), 0)
        XCTAssertTrue(asSets.allSatisfy { !$0.countsTowardProgression && !$0.countsTowardVolume })
    }

    func testHiddenWarmupsSurviveTheBlob() throws {
        var state = LegacyState(raw: ["sessions": .array([])])
        LegacyAdapter.apply(hiddenWarmups: ["flat-bench", "pec-fly"], to: &state)
        let reread = try LegacyState(data: try state.encoded())
        XCTAssertEqual(LegacyAdapter.hiddenWarmups(from: reread), ["flat-bench", "pec-fly"])
    }
}

// MARK: - Interaction between the new set types and records

final class SetTypeRecordInteractionTests: XCTestCase {

    private func history() -> ExerciseHistory {
        let sessions = (0..<3).map {
            Fixtures.session(id: "s\($0)", daysAgo: ($0 + 1) * 3, exerciseID: "flat-bench", sets: [(100, 6, 1)])
        }
        return ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: sessions)
    }

    /// A partial set earlier in the session must not stop a clean set at the
    /// same weight from being the record it is.
    func testAPartialSetDoesNotSuppressALaterCleanPR() {
        let partial = LoggedSet(index: 0, weightKg: 105, reps: 5, flags: [.partialReps], partialReps: 3)
        let clean = LoggedSet(index: 1, weightKg: 105, reps: 6)

        XCTAssertFalse(
            RecordsEngine.isLoadPR(set: partial, history: history(), earlierInSession: []),
            "The partial set itself is never a record"
        )
        XCTAssertTrue(
            RecordsEngine.isLoadPR(set: clean, history: history(), earlierInSession: [partial]),
            "But it must not shadow the clean set behind it"
        )
    }

    func testAFailedSetDoesNotSuppressALaterCleanPREither() {
        let failed = LoggedSet(index: 0, weightKg: 105, reps: 2, flags: [.failed])
        let clean = LoggedSet(index: 1, weightKg: 105, reps: 6)
        XCTAssertTrue(RecordsEngine.isLoadPR(set: clean, history: history(), earlierInSession: [failed]))
    }

    /// A genuine earlier PR still takes the honour once, not twice.
    func testTheFirstCleanSetAtAWeightTakesTheRecord() {
        let first = LoggedSet(index: 0, weightKg: 105, reps: 6)
        let second = LoggedSet(index: 1, weightKg: 105, reps: 6)
        XCTAssertTrue(RecordsEngine.isLoadPR(set: first, history: history(), earlierInSession: []))
        XCTAssertFalse(RecordsEngine.isLoadPR(set: second, history: history(), earlierInSession: [first]))
    }
}

// MARK: - Paused and partial together

final class PausedAndPartialTogetherTests: XCTestCase {

    private func history() -> ExerciseHistory {
        let sessions = (0..<3).map {
            Fixtures.session(id: "s\($0)", daysAgo: ($0 + 1) * 3, exerciseID: "flat-bench", sets: [(100, 6, 1)])
        }
        return ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: sessions)
    }

    /// Both descriptions are true, so neither is allowed to hide the other.
    func testASetThatIsBothShowsBoth() {
        let rows = SetRowPresenter.rows(
            sets: [LoggedSet(
                index: 0, weightKg: 100, reps: 6,
                modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2),
                flags: [.partialReps], partialReps: 3
            )],
            reference: nil, history: history(), activeIndex: nil
        )
        XCTAssertEqual(rows[0].delta, .pausedAndPartial(count: 3))
    }

    /// Partials rule: a partial set stays out of progression and records even
    /// when it was also paused, and still counts toward volume.
    func testAPausedPartialSetIsStillExcludedFromProgressionAndRecords() {
        let set = LoggedSet(
            index: 0, weightKg: 200, reps: 6,
            modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2),
            flags: [.partialReps], partialReps: 2
        )
        XCTAssertFalse(set.countsTowardProgression)
        XCTAssertTrue(set.countsTowardVolume)
        XCTAssertEqual(RecordsEngine.volumeLoad([set]), 1_200)
        XCTAssertFalse(RecordsEngine.isLoadPR(set: set, history: history(), earlierInSession: []))
    }

    /// And it must not shadow a clean set behind it either.
    func testAPausedPartialSetDoesNotSuppressALaterCleanPR() {
        let both = LoggedSet(
            index: 0, weightKg: 105, reps: 5,
            modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2),
            flags: [.partialReps], partialReps: 3
        )
        let clean = LoggedSet(index: 1, weightKg: 105, reps: 6)
        XCTAssertTrue(RecordsEngine.isLoadPR(set: clean, history: history(), earlierInSession: [both]))
    }

    func testPausedAloneAndPartialAloneStillReadSeparately() {
        let history = self.history()
        let paused = SetRowPresenter.rows(
            sets: [LoggedSet(index: 0, weightKg: 100, reps: 6, modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2))],
            reference: nil, history: history, activeIndex: nil
        )
        XCTAssertEqual(paused[0].delta, .paused)

        let partial = SetRowPresenter.rows(
            sets: [LoggedSet(index: 0, weightKg: 100, reps: 6, flags: [.partialReps], partialReps: 2)],
            reference: nil, history: history, activeIndex: nil
        )
        XCTAssertEqual(partial[0].delta, .partial(count: 2))
    }
}

// MARK: - Keypad input

/// The weight field is reachable from a hardware keyboard, where the numeric
/// keyboard type guarantees nothing. These are the rules the field applies.
final class NumericInputTests: XCTestCase {

    private func filter(_ text: String) -> String {
        var seenSeparator = false
        return String(text.compactMap { character -> Character? in
            if character.isNumber { return character }
            if character == "," || character == "." {
                if seenSeparator { return nil }
                seenSeparator = true
                return ","
            }
            return nil
        })
    }

    func testLettersAndSymbolsNeverReachTheField() {
        XCTAssertEqual(filter("§à"), "")
        XCTAssertEqual(filter("1o2"), "12")
        XCTAssertEqual(filter("60kg"), "60")
    }

    func testOneSeparatorSurvivesAndTheRestDoNot() {
        XCTAssertEqual(filter("102.5"), "102,5")
        XCTAssertEqual(filter("102,5"), "102,5")
        XCTAssertEqual(filter("1.2.3"), "1,23")
    }

    func testAFilteredValueStillParsesAsAWeight() {
        XCTAssertEqual(Decimal(string: filter("102.5").replacingOccurrences(of: ",", with: ".")), 102.5)
    }
}

// MARK: - A comparison never hides what the set was

final class SetStateNeverHiddenTests: XCTestCase {

    private let empty = ExerciseHistory(exerciseID: "flat-bench", modifiers: .none, appearances: [])

    /// The calibration baseline is a comparison. `basis` must not overwrite a
    /// marker that explains why the set is out of progression.
    func testTheBaselineLabelDoesNotHideAPausedPartialCalibrationSet() {
        let calibration = LoggedSet(
            index: 0, weightKg: 60, reps: 8,
            modifiers: SetModifiers(pauseEnabled: true, pauseSeconds: 2),
            flags: [.partialReps], partialReps: 1
        )
        let rows = SetRowPresenter.rows(
            sets: [calibration, LoggedSet(index: 1, weightKg: 60)],
            reference: nil, history: empty, activeIndex: 1,
            mode: .calibrated(baseline: calibration)
        )
        XCTAssertEqual(rows[0].delta, .pausedAndPartial(count: 1))
    }

    func testACleanCalibrationSetStillReadsAsTheBaseline() {
        let calibration = LoggedSet(index: 0, weightKg: 60, reps: 8)
        let rows = SetRowPresenter.rows(
            sets: [calibration], reference: nil, history: empty, activeIndex: nil,
            mode: .calibrated(baseline: calibration)
        )
        XCTAssertEqual(rows[0].delta, .baseline)
    }

    func testALaterFailedSetKeepsItsMarkerInsteadOfADelta() {
        let baseline = LoggedSet(index: 0, weightKg: 60, reps: 8)
        let failed = LoggedSet(index: 1, weightKg: 60, reps: 3, flags: [.failed])
        let rows = SetRowPresenter.rows(
            sets: [baseline, failed], reference: nil, history: empty, activeIndex: nil,
            mode: .calibrated(baseline: baseline)
        )
        XCTAssertEqual(rows[1].delta, .failed)
    }
}
