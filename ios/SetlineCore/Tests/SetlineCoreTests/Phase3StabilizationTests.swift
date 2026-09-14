import XCTest
@testable import SetlineCore

// MARK: - P0-1 · Logged work is never discarded

final class SessionSlotTests: XCTestCase {

    private let bench = PlannedExercise(
        exerciseID: "flat-bench",
        role: .primaryStrength,
        sets: [
            SetPrescription(repRange: 5...6, targetRIR: 1...2),
            SetPrescription(repRange: 6...8, targetRIR: 1...2),
            SetPrescription(repRange: 6...8, targetRIR: 1...2),
        ]
    )

    private func freshSlot() -> SessionSlot {
        SessionSlot(position: 0, plan: bench, exerciseName: "Flat bench press", prefillWeight: 102.5)
    }

    private func write(_ slot: inout SessionSlot, row: Int, weight: Decimal, reps: Int) {
        slot.active.sets[row].weightKg = weight
        slot.active.sets[row].reps = reps
    }

    func testSwapAfterSetOneKeepsSetOneOnTheOrigin() {
        var slot = freshSlot()
        write(&slot, row: 0, weight: 102.5, reps: 5)
        let setOne = slot.active.sets[0]

        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)

        XCTAssertEqual(slot.preserved.map(\.exerciseID), ["flat-bench"])
        XCTAssertEqual(slot.preserved.first?.sets, [setOne])
        XCTAssertEqual(slot.active.exerciseID, "db-bench")
        XCTAssertEqual(slot.active.sets.count, 2, "only the two open rows move")
        XCTAssertEqual(slot.active.prescription, Array(bench.sets[1...2]), "each row keeps its own prescription")
        XCTAssertTrue(slot.active.sets.allSatisfy { !$0.isLogged && $0.substitutedFrom == "flat-bench" })
        XCTAssertEqual(slot.loggedSetCount, 1)
        XCTAssertEqual(slot.setCount, 3)
        XCTAssertEqual(slot.results.map(\.exerciseID), ["flat-bench"])
    }

    func testSwapAfterMultipleSetsMovesOnlyTheRemainingSet() {
        var slot = freshSlot()
        write(&slot, row: 0, weight: 102.5, reps: 5)
        write(&slot, row: 1, weight: 102.5, reps: 6)

        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)

        XCTAssertEqual(slot.preserved.first?.sets.count, 2)
        XCTAssertEqual(slot.active.sets.count, 1)
        XCTAssertEqual(slot.active.prescription, [bench.sets[2]])
        XCTAssertEqual(slot.loggedSetCount, 2)
        XCTAssertEqual(slot.setCount, 3)
    }

    func testUndoAfterSubstituteSetsWereLoggedKeepsBothSides() {
        var slot = freshSlot()
        write(&slot, row: 0, weight: 102.5, reps: 5)
        let beforeSwap = slot.active
        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        write(&slot, row: 0, weight: 36, reps: 8)
        let substituteSet = slot.active.sets[0]

        XCTAssertTrue(slot.undo())

        XCTAssertEqual(slot.active, beforeSwap, "the origin comes back exactly as it was, open rows included")
        XCTAssertEqual(slot.preserved.map(\.exerciseID), ["db-bench"])
        XCTAssertEqual(slot.preserved.first?.sets, [substituteSet])
        XCTAssertEqual(slot.loggedSetCount, 2, "nothing written on either side disappears")
        XCTAssertEqual(Set(slot.results.map(\.exerciseID)), ["flat-bench", "db-bench"])
    }

    func testUndoBeforeAnythingIsLoggedLeavesNoTrace() {
        var slot = freshSlot()
        let original = slot.active
        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        slot.undo()
        XCTAssertEqual(slot.active, original)
        XCTAssertTrue(slot.preserved.isEmpty)
        XCTAssertFalse(slot.canUndo)
    }

    func testChainedSwapsAndUndosNeverLoseWork() {
        var slot = freshSlot()
        write(&slot, row: 0, weight: 102.5, reps: 5)
        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        write(&slot, row: 0, weight: 36, reps: 8)
        slot.swap(to: "chest-press-machine", name: "Converging chest press", temporary: true)
        write(&slot, row: 0, weight: 70, reps: 8)

        XCTAssertEqual(slot.loggedSetCount, 3)
        XCTAssertEqual(slot.active.substitutedFromID, "flat-bench", "a stand-in always names the programmed exercise")

        slot.undo()
        XCTAssertEqual(slot.active.exerciseID, "db-bench")
        XCTAssertEqual(slot.loggedSetCount, 3)

        slot.undo()
        XCTAssertEqual(slot.active.exerciseID, "flat-bench")
        XCTAssertEqual(slot.loggedSetCount, 3)
        XCTAssertEqual(slot.results.flatMap(\.sets).count, 3)
        XCTAssertEqual(Set(slot.results.map(\.exerciseID)), ["flat-bench", "db-bench", "chest-press-machine"])
    }

    func testPermanentReplacementMarksNothingAndKeepsTheOldWork() {
        var slot = freshSlot()
        write(&slot, row: 0, weight: 102.5, reps: 5)
        slot.swap(to: "chest-press-machine", name: "Converging chest press", temporary: false)
        XCTAssertNil(slot.active.substitutedFromID)
        XCTAssertTrue(slot.active.sets.allSatisfy { $0.substitutedFrom == nil })
        XCTAssertEqual(slot.preserved.first?.exerciseID, "flat-bench")
        XCTAssertTrue(slot.lastChangeWasPermanent)
    }

    func testSwappingACompleteExerciseMovesNoRows() {
        var slot = freshSlot()
        for row in 0..<3 { write(&slot, row: row, weight: 102.5, reps: 6) }
        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        XCTAssertTrue(slot.active.sets.isEmpty)
        XCTAssertEqual(slot.loggedSetCount, 3)
    }

    func testPrefillNeverTouchesAWrittenRow() {
        var slot = freshSlot()
        write(&slot, row: 0, weight: 102.5, reps: 5)
        slot.prefillOpenSets(weightKg: 90)
        XCTAssertEqual(slot.active.sets[0].weightKg, 102.5)
        XCTAssertEqual(slot.active.sets[1].weightKg, 90)
    }
}

// MARK: - P0-2 · Swaps survive pause and a cold relaunch

final class SlotSnapshotTests: XCTestCase {

    private func pausedSession() -> ActiveSessionSnapshot {
        let push = PlanCatalog.personal.first { $0.id == "push" }!
        var slots = push.exercises.enumerated().map { index, planned in
            SessionSlot(
                position: index, plan: planned,
                exerciseName: ExerciseCatalog.exercise(planned.exerciseID)!.name,
                prefillWeight: 50
            )
        }
        // Flat bench: one set, a temporary swap, one set on the substitute.
        slots[0].active.sets[0].reps = 5
        slots[0].swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        slots[0].active.sets[0].weightKg = 36
        slots[0].active.sets[0].reps = 8
        // Pec fly: swapped to a custom exercise.
        slots[2].swap(to: CustomExercise.identifier(for: "Cable fly low"), name: "Cable fly low", temporary: true)

        return ActiveSessionSnapshot(
            dayID: "push", dayLabel: "Push", startedAt: Date(), currentIndex: 2,
            results: slots.flatMap(\.results), activeSeconds: 900, slots: slots
        )
    }

    func testSubstituteAndCustomExerciseSurviveThePause() {
        var state = LegacyState(raw: [:])
        LegacyAdapter.apply(activeSession: pausedSession(), to: &state)
        let restored = LegacyAdapter.activeSession(from: state)

        XCTAssertEqual(restored?.slots?[0].active.exerciseID, "db-bench")
        XCTAssertEqual(restored?.slots?[0].active.substitutedFromID, "flat-bench")
        XCTAssertEqual(restored?.slots?[2].active.exerciseID, "custom:cable-fly-low")
        XCTAssertEqual(restored?.slots?[0].canUndo, true, "undo still works after resuming")
    }

    /// A cold relaunch is a decode from bytes. Nothing written may be lost in it.
    func testLoggedSubstituteSetsSurviveAColdRelaunch() throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let cold = try decoder.decode(ActiveSessionSnapshot.self, from: encoder.encode(pausedSession()))

        XCTAssertEqual(cold.loggedSetCount, 2)
        let bench = try XCTUnwrap(cold.slots?[0])
        XCTAssertEqual(bench.preserved.first?.sets.first?.reps, 5)
        XCTAssertEqual(bench.active.sets.first?.reps, 8)
        XCTAssertEqual(bench.active.sets.first?.substitutedFrom, "flat-bench")
    }

    func testEndingAPausedSessionKeepsEverySideOfASwap() {
        let finished = pausedSession().finishedSession()
        XCTAssertEqual(Set(finished.results.map(\.exerciseID)), ["flat-bench", "db-bench"])
        XCTAssertEqual(finished.results.flatMap(\.sets).count, 2)
    }

    func testSnapshotsWrittenBeforeSlotsStillDecode() throws {
        let legacy = ActiveSessionSnapshot(
            dayID: "push", dayLabel: "Push", startedAt: Date(), currentIndex: 0,
            results: [ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press",
                                     sets: [LoggedSet(index: 0, weightKg: 100, reps: 6)])]
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(legacy)
        XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("\"slots\""))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(ActiveSessionSnapshot.self, from: data)
        XCTAssertNil(decoded.slots)
        XCTAssertEqual(decoded.loggedSetCount, 1)
    }
}

// MARK: - P0-4 · Each set gets its own target

final class PerSetTargetTests: XCTestCase {

    private let mixed = PlannedExercise(
        exerciseID: "flat-bench",
        role: .primaryStrength,
        sets: [
            SetPrescription(repRange: 5...6, targetRIR: 1...2),
            SetPrescription(repRange: 6...8, targetRIR: 1...2),
            SetPrescription(repRange: 6...8, targetRIR: 1...2),
        ]
    )
    private let bench = ExerciseCatalog.exercise("flat-bench")!

    /// Three sessions at 100 kg, every set at the top of its own range.
    private var readyHistory: ExerciseHistory {
        let sessions = (0..<3).map { index in
            Fixtures.session(
                id: "s\(index)", daysAgo: (index + 1) * 3, exerciseID: "flat-bench",
                sets: [(100, 6, 1), (100, 8, 1), (100, 8, 1)]
            )
        }
        return ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: sessions)
    }

    func testReadyProposalTargetsEachSetsOwnRange() {
        let proposal = ProgressionEngine.proposal(planned: mixed, exercise: bench, history: readyHistory)
        XCTAssertEqual(proposal.tone, .ready)
        XCTAssertEqual(proposal.setTargets, [5, 6, 6], "set 1's 5 must not leak into the 6–8 sets")
        XCTAssertTrue(proposal.body.contains("mik op 5 · 6 · 6"), proposal.body)
    }

    func testUniformRangesStillReadAsOneNumber() {
        XCTAssertEqual(ProgressionEngine.repsLabel([6, 6, 6]), "6")
        XCTAssertEqual(ProgressionEngine.repsLabel([5, 6, 6]), "5 · 6 · 6")
    }

    /// The audit's finding, pinned: follow the pre-fill, never hear you missed.
    func testFollowingTheProposalIsNeverCalledAMiss() {
        let proposal = ProgressionEngine.proposal(planned: mixed, exercise: bench, history: readyHistory)
        let targets = proposal.setTargets ?? []
        XCTAssertEqual(targets.count, 3)
        let logged = targets.enumerated().map { index, reps in
            LoggedSet(index: index, weightKg: proposal.weightKg, reps: reps)
        }
        let advice = SetRowPresenter.adviceLine(
            sets: logged, planned: mixed, exercise: bench, history: readyHistory, proposedTargets: targets
        )
        XCTAssertEqual(advice, "Op doel. Volgende keer 102,5 kg, mik op 6 · 8 · 8.")
    }

    func testMissingAProposedTargetIsStillAMiss() {
        let logged = [5, 5, 5].enumerated().map { LoggedSet(index: $0.offset, weightKg: 102.5, reps: $0.element) }
        XCTAssertEqual(
            SetRowPresenter.adviceLine(
                sets: logged, planned: mixed, exercise: bench, history: readyHistory, proposedTargets: [5, 6, 6]
            ),
            "Niet alle reps gehaald. Volgende keer hetzelfde gewicht."
        )
    }

    func testTheTopOfEveryRangeStillEarnsTheIncrease() {
        let logged = [6, 8, 8].enumerated().map { LoggedSet(index: $0.offset, weightKg: 102.5, reps: $0.element) }
        let advice = SetRowPresenter.adviceLine(
            sets: logged, planned: mixed, exercise: bench, history: readyHistory, proposedTargets: [5, 6, 6]
        )
        XCTAssertEqual(advice?.hasPrefix("Alle reps gehaald."), true)
    }
}

// MARK: - P0-3 / P1 · Contexts that apply together, and only honest claims

final class SwapContextTests: XCTestCase {

    private func ids(_ context: SwapContext) -> [String] {
        SubstitutionRanker.rank(context).map(\.exercise.id)
    }

    func testOccupiedAndPainApplyTogether() {
        let both = ids(SwapContext(
            currentExerciseID: "flat-bench", role: .primaryStrength,
            isOccupied: true, painfulLoadTags: PainRegion.shoulder.loadTags
        ))
        XCTAssertFalse(both.contains("close-grip-bench"), "same rack as the busy bench")
        XCTAssertFalse(both.contains("db-bench"), "loads the flagged shoulder")
        XCTAssertFalse(both.contains("dips"), "loads the flagged shoulder")
    }

    func testAPainFlagNeverSwitchesOccupiedOff() {
        let context = SwapContext(
            currentExerciseID: "lat-pulldown", role: .secondaryCompound,
            isOccupied: true, painfulLoadTags: PainRegion.knee.loadTags
        )
        XCTAssertTrue(context.isOccupied)
        XCTAssertFalse(ids(context).contains("neutral-pulldown"), "the busy station is still excluded")
    }

    /// A flag that removes nothing from this list must not reshape it either.
    func testIrrelevantPainLeavesTheListUntouched() {
        let plain = ids(SwapContext(currentExerciseID: "flat-bench", role: .primaryStrength))
        let knee = ids(SwapContext(
            currentExerciseID: "flat-bench", role: .primaryStrength, painfulLoadTags: PainRegion.knee.loadTags
        ))
        XCTAssertEqual(plain, knee)
    }

    func testPainIsClaimedOnlyWhenItChangesTheList() {
        let fly = SwapContext(currentExerciseID: "pec-fly", role: .isolation, painfulLoadTags: PainRegion.shoulder.loadTags)
        XCTAssertTrue(SubstitutionRanker.painChangesRecommendations(fly, tags: PainRegion.shoulder.loadTags))

        let bench = SwapContext(currentExerciseID: "flat-bench", role: .primaryStrength, painfulLoadTags: PainRegion.knee.loadTags)
        XCTAssertFalse(SubstitutionRanker.painChangesRecommendations(bench, tags: PainRegion.knee.loadTags))
        XCTAssertFalse(
            SubstitutionRanker.painChangesRecommendations(bench, tags: PainRegion.hip.loadTags),
            "a region without tags can never change a list"
        )
    }

    func testOtherHasNoSentenceForm() {
        XCTAssertNil(PainRegion.other.sentenceName, "'met je ergens anders' must be unwritable")
        XCTAssertEqual(PainRegion.shoulder.sentenceName, "schouder")
    }

    func testExercisesAlreadyInTodaysSessionAreNeverSubstitutes() {
        let context = SwapContext(
            currentExerciseID: "flat-bench", role: .primaryStrength,
            excludedExerciseIDs: ["incline-bench", "pec-fly"]
        )
        XCTAssertFalse(ids(context).contains("incline-bench"))
    }

    func testExclusionFollowsCanonicalIDs() {
        let context = SwapContext(
            currentExerciseID: "neutral-row", role: .secondaryCompound,
            excludedExerciseIDs: ["upper-wide-row"]
        )
        XCTAssertFalse(ids(context).contains("wide-row"), "an alias in the session excludes its canonical exercise")
    }

    func testRecordedReasonReflectsBothContexts() {
        XCTAssertEqual(SwapContext(currentExerciseID: "x", role: .accessory, isOccupied: true, painfulLoadTags: [.gripLimited]).reason, .occupied)
        XCTAssertEqual(SwapContext(currentExerciseID: "x", role: .accessory, painfulLoadTags: [.gripLimited]).reason, .discomfort)
        XCTAssertEqual(SwapContext(currentExerciseID: "x", role: .accessory).reason, .preference)
    }

    func testNoReorderWhenTheCurrentExerciseIsComplete() {
        let bench = ExerciseCatalog.exercise("flat-bench")!
        let fly = ExerciseCatalog.exercise("pec-fly")!
        XCTAssertNil(ReorderPlanner.plan(current: bench, currentIndex: 0, currentIsComplete: true, later: [(fly, .isolation, false)]))
        XCTAssertNotNil(ReorderPlanner.plan(current: bench, currentIndex: 0, currentIsComplete: false, later: [(fly, .isolation, false)]))
    }
}

// MARK: - Program replacement undo, for the whole workout

final class ReplacementUndoTests: XCTestCase {

    private let bench = PlanCatalog.personal.first { $0.id == "push" }!.exercises[0]
    private let record = ProgramReplacement(
        originExerciseID: "flat-bench", substituteExerciseID: "chest-press-machine",
        scope: .thisPlan, dayID: "push"
    )

    private func slot() -> SessionSlot {
        SessionSlot(position: 0, plan: bench, exerciseName: "Flat bench press", prefillWeight: 100)
    }

    private var encoder: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }

    private var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }

    func testAPermanentSwapCarriesItsProgramChange() {
        var s = slot()
        s.swap(to: "chest-press-machine", name: "Converging chest press", temporary: false, replacement: record)
        XCTAssertEqual(s.latestUndo?.replacement?.id, record.id)
        XCTAssertTrue(s.lastChangeWasPermanent)
    }

    func testATemporarySwapNeverCarriesOne() {
        var s = slot()
        s.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true, replacement: record)
        XCTAssertNil(s.latestUndo?.replacement)
    }

    /// The toast and the header line can both undo the same change. Whichever
    /// fires second must do nothing — not reverse the change before it.
    func testAStaleUndoNeverReversesADifferentChange() {
        var s = slot()
        s.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        s.swap(to: "chest-press-machine", name: "Converging chest press", temporary: false, replacement: record)
        let replacementChange = s.latestUndo!.id

        XCTAssertTrue(s.undo(ifLatestIs: replacementChange), "header undo")
        XCTAssertFalse(s.undo(ifLatestIs: replacementChange), "late toast undo")
        XCTAssertEqual(s.active.exerciseID, "db-bench", "the earlier temporary swap is still in place")
    }

    /// "Until the workout ends" includes a pause and a cold launch.
    func testTheProgramChangeSurvivesAColdRelaunch() throws {
        var s = slot()
        s.swap(to: "chest-press-machine", name: "Converging chest press", temporary: false, replacement: record)
        var cold = try decoder.decode(SessionSlot.self, from: encoder.encode(s))
        XCTAssertEqual(cold.latestUndo?.id, s.latestUndo?.id)
        XCTAssertEqual(cold.latestUndo?.replacement?.id, record.id)
        XCTAssertTrue(cold.undo(ifLatestIs: s.latestUndo?.id))
        XCTAssertEqual(cold.active.exerciseID, "flat-bench")
    }

    /// Undo points saved before they carried an id or a program change must
    /// still decode — otherwise the whole paused session silently disappears.
    func testUndoPointsSavedBeforeThisChangeStillDecode() throws {
        var s = slot()
        s.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: encoder.encode(s)) as? [String: Any])
        let stack = try XCTUnwrap(json["undoStack"] as? [[String: Any]])
        json["undoStack"] = stack.map { point -> [String: Any] in
            var old = point
            old.removeValue(forKey: "id")
            old.removeValue(forKey: "replacement")
            return old
        }
        var decoded = try decoder.decode(SessionSlot.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertTrue(decoded.canUndo)
        XCTAssertTrue(decoded.undo())
        XCTAssertEqual(decoded.active.exerciseID, "flat-bench")
    }
}
