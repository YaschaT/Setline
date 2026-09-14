import XCTest
@testable import SetlineCore

// MARK: - Sets added during a session
//
// An added set is real work: history, volume and records count it like any
// working set. It is never one of the prescribed slots, and adding it never
// changes the program.

final class AddedSetTests: XCTestCase {

    private let bench = PlannedExercise(
        exerciseID: "flat-bench",
        role: .primaryStrength,
        sets: [
            SetPrescription(repRange: 5...6, targetRIR: 1...2),
            SetPrescription(repRange: 6...8, targetRIR: 1...2),
            SetPrescription(repRange: 6...8, targetRIR: 1...2),
        ]
    )
    private let fly = PlannedExercise(
        exerciseID: "pec-fly",
        role: .isolation,
        sets: Array(repeating: SetPrescription(repRange: 10...12, targetRIR: 1...2), count: 3)
    )
    private let benchExercise = ExerciseCatalog.exercise("flat-bench")!

    private func freshSlot() -> SessionSlot {
        SessionSlot(position: 0, plan: bench, exerciseName: "Flat bench press", prefillWeight: 100)
    }

    private func write(_ slot: inout SessionSlot, row: Int, weight: Decimal = 100, reps: Int, rir: Int? = nil) {
        slot.active.sets[row].weightKg = weight
        slot.active.sets[row].reps = reps
        slot.active.sets[row].rirReported = rir
    }

    private func logged(_ index: Int, _ weight: Decimal, _ reps: Int, origin: SetOrigin = .prescribed) -> LoggedSet {
        LoggedSet(index: index, weightKg: weight, reps: reps, origin: origin)
    }

    /// The same bench appearance, three sessions running.
    private func sessions(_ sets: [LoggedSet]) -> [TrainingSession] {
        (0..<3).map { index in
            TrainingSession(
                id: "s\(index)",
                date: Calendar(identifier: .gregorian).date(byAdding: .day, value: -(index + 1) * 3, to: Date())!,
                dayID: "push",
                dayLabel: "Push",
                completion: 100,
                results: [ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press", sets: sets)]
            )
        }
    }

    /// Three sessions is enough for a reference, so proposals and records apply.
    private func history(_ sets: [LoggedSet]) -> ExerciseHistory {
        ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: sessions(sets))
    }

    /// Bench press with its prescription done, one extra set logged and a
    /// second extra set still open.
    private func pausedSnapshot() -> (snapshot: ActiveSessionSnapshot, slot: SessionSlot) {
        var slot = freshSlot()
        for row in 0..<3 { write(&slot, row: row, reps: 8) }
        slot.addSet()
        write(&slot, row: 3, weight: 90, reps: 10, rir: 2)
        slot.addSet()
        let snapshot = ActiveSessionSnapshot(
            dayID: "push", dayLabel: "Push", startedAt: Date(), currentIndex: 0,
            results: slot.results, activeSeconds: 900, slots: [slot]
        )
        return (snapshot, slot)
    }

    // MARK: Adding

    func testThreePrescribedSetsTakeAFourth() {
        var slot = freshSlot()
        let added = slot.addSet()

        XCTAssertEqual(slot.active.sets.count, 4)
        XCTAssertEqual(slot.active.sets.last, added)
        XCTAssertEqual(added.index, 3)
        XCTAssertEqual(added.origin, .sessionAdded)
        XCTAssertFalse(added.isWarmup, "an added set is a working set")
        XCTAssertFalse(added.isLogged, "adding a set never logs it")
        XCTAssertEqual(slot.active.prescription.count, 3, "no prescription is invented for it")
        XCTAssertEqual(slot.setCount, 4, "the session total grows with it")
        XCTAssertEqual(slot.prescribedSetCount, 3)
    }

    func testSetsFourAndFive() {
        var slot = freshSlot()
        let four = slot.addSet()
        let five = slot.addSet()

        XCTAssertEqual([four.index, five.index], [3, 4])
        XCTAssertNotEqual(four.id, five.id)
        XCTAssertEqual(slot.active.sets.map(\.index), [0, 1, 2, 3, 4])
        XCTAssertEqual(
            slot.active.sets.map(\.origin),
            [.prescribed, .prescribed, .prescribed, .sessionAdded, .sessionAdded]
        )
        XCTAssertEqual(slot.prescribedRows.count, 3)
        XCTAssertEqual(slot.setCount, 5)
    }

    func testAnAddedSetStartsFromTheMostRecentWrittenSet() {
        var slot = freshSlot()
        write(&slot, row: 0, weight: 100, reps: 6)
        write(&slot, row: 1, weight: 97.5, reps: 8)

        XCTAssertEqual(slot.addSet().weightKg, 97.5, "the weight actually lifted last, not the pre-fill")
        XCTAssertEqual(slot.mostRecentWrittenSet?.reps, 8, "and the sheet repeats its reps")
    }

    func testBeforeAnythingIsWrittenItTakesTheLastRowsPrefill() {
        var slot = freshSlot()
        XCTAssertEqual(slot.addSet(fallbackWeightKg: 60).weightKg, 100)
    }

    func testOnASubstituteWithNoRowsItNeverCarriesTheOriginsWeight() {
        var slot = freshSlot()
        for row in 0..<3 { write(&slot, row: row, reps: 8) }
        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        XCTAssertTrue(slot.active.sets.isEmpty)

        let added = slot.addSet(fallbackWeightKg: 32)
        XCTAssertEqual(added.weightKg, 32, "§12.3: never the barbell's 100 kg")
        XCTAssertEqual(added.substitutedFrom, "flat-bench")
    }

    // MARK: Logging

    func testALoggedAddedSetIsOrdinaryWork() {
        var slot = freshSlot()
        for row in 0..<3 { write(&slot, row: row, reps: 8) }
        slot.addSet()
        write(&slot, row: 3, weight: 90, reps: 10, rir: 2)

        XCTAssertFalse(slot.hasOpenSets)
        XCTAssertEqual(slot.loggedSetCount, 4)
        XCTAssertEqual(slot.loggedPrescribedSetCount, 3)
        let written = slot.results.flatMap(\.sets)
        XCTAssertEqual(
            written.map(\.origin), [.prescribed, .prescribed, .prescribed, .sessionAdded],
            "it goes into history"
        )
        XCTAssertEqual(RecordsEngine.volumeLoad(written), 3300, "and into volume")
    }

    func testAnAddedSetCanSetARealRecord() {
        let reference = history([logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8)])
        var slot = freshSlot()
        for row in 0..<3 { write(&slot, row: row, reps: 8) }
        slot.addSet()
        write(&slot, row: 3, weight: 105, reps: 3)

        XCTAssertTrue(RecordsEngine.isLoadPR(
            set: slot.active.sets[3], history: reference, earlierInSession: Array(slot.active.sets.prefix(3))
        ))
        XCTAssertEqual(RecordsEngine.record(for: slot.results.flatMap(\.sets), history: reference)?.type, .load)
    }

    func testRIRIsAskedOnTheLastPrescribedSetAndOnEveryAddedSet() {
        var slot = freshSlot()
        XCTAssertEqual((0..<3).map { slot.asksForRIR(at: $0) }, [false, false, true])

        slot.addSet()
        slot.addSet()
        XCTAssertEqual(
            (0..<5).map { slot.asksForRIR(at: $0) }, [false, false, true, true, true],
            "adding a set never takes the question away from set 3"
        )
    }

    func testAnAddedRowSaysExtraWhereTheColumnWouldBeEmpty() {
        var slot = freshSlot()
        slot.addSet()
        let rows = SetRowPresenter.rows(
            sets: slot.active.sets,
            reference: nil,
            history: ExerciseHistory(exerciseID: "flat-bench", modifiers: .none, appearances: []),
            activeIndex: 0
        )

        XCTAssertEqual(rows.map(\.isAdded), [false, false, false, true])
        XCTAssertEqual(rows.map(\.indexLabel), ["1", "2", "3", "4"])
        XCTAssertEqual(rows[2].delta, SetDelta.none)
        XCTAssertEqual(rows[3].delta, SetDelta.added)
        XCTAssertFalse(rows[3].isWarmup)
    }

    // MARK: Removing

    func testAnUnloggedAddedSetIsRemovedOutright() throws {
        var slot = freshSlot()
        slot.addSet()
        let five = slot.addSet()

        let removed = try XCTUnwrap(slot.removeAddedSet(at: 3))
        XCTAssertFalse(removed.set.isLogged)
        XCTAssertEqual(slot.active.sets.count, 4)
        XCTAssertEqual(slot.active.sets[3].id, five.id, "set 5 moves up")
        XCTAssertEqual(slot.active.sets.map(\.index), [0, 1, 2, 3], "and the numbers follow the rows")
        XCTAssertEqual(slot.setCount, 4)
    }

    func testAPrescribedSetIsNeverRemoved() {
        var slot = freshSlot()
        slot.addSet()

        XCTAssertNil(slot.removeAddedSet(at: 2))
        XCTAssertNil(slot.removeAddedSet(at: 7))
        XCTAssertEqual(slot.active.sets.count, 4)
    }

    func testALoggedAddedSetComesBackExactlyOnUndo() throws {
        var slot = freshSlot()
        for row in 0..<3 { write(&slot, row: row, reps: 8) }
        slot.addSet()
        slot.addSet()
        write(&slot, row: 3, weight: 90, reps: 10, rir: 1)
        let before = slot.active

        let removed = try XCTUnwrap(slot.removeAddedSet(at: 3))
        XCTAssertEqual(removed.set.reps, 10)
        XCTAssertEqual(slot.loggedSetCount, 3)

        slot.restore(removed)
        XCTAssertEqual(slot.active, before, "logged numbers, position and set numbers all come back")
        slot.restore(removed)
        XCTAssertEqual(slot.active, before, "a second undo never duplicates it")
    }

    func testARemovedSetNeverComesBackOnAnotherExercise() throws {
        var slot = freshSlot()
        slot.addSet()
        write(&slot, row: 3, weight: 90, reps: 10)
        let removed = try XCTUnwrap(slot.removeAddedSet(at: 3))

        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        slot.restore(removed)
        XCTAssertFalse(slot.active.sets.contains { $0.id == removed.set.id })
    }

    // MARK: Pause, resume and a cold relaunch

    func testAddedSetsSurviveAPauseAndResume() throws {
        let (snapshot, slot) = pausedSnapshot()
        var state = LegacyState(raw: [:])
        LegacyAdapter.apply(activeSession: snapshot, to: &state)

        let resumed = try XCTUnwrap(LegacyAdapter.activeSession(from: state)?.slots?.first)
        XCTAssertEqual(resumed, slot)
        XCTAssertEqual(
            resumed.active.sets.map(\.origin),
            [.prescribed, .prescribed, .prescribed, .sessionAdded, .sessionAdded]
        )
        XCTAssertEqual(resumed.active.sets[3].reps, 10, "the logged extra set")
        XCTAssertFalse(resumed.active.sets[4].isLogged, "and the open one, still open")
    }

    /// The device's store and the account both hold bytes. Nothing added may
    /// be lost in them.
    func testAddedSetsSurviveAColdRelaunch() throws {
        let (snapshot, slot) = pausedSnapshot()
        var state = LegacyState(raw: [:])
        LegacyAdapter.apply(activeSession: snapshot, to: &state)

        let cold = try XCTUnwrap(LegacyAdapter.activeSession(from: LegacyState(data: state.encoded())))
        XCTAssertEqual(cold.slots?.first, slot)
        XCTAssertEqual(cold.loggedSetCount, 4)
        XCTAssertEqual(cold.plannedSetCount, 5, "the resume card counts the added rows")
    }

    func testSetsSavedBeforeOriginExistedReadAsPrescribed() throws {
        var slot = freshSlot()
        write(&slot, row: 0, reps: 6)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(slot)) as? [String: Any])
        var active = try XCTUnwrap(json["active"] as? [String: Any])
        let rows = try XCTUnwrap(active["sets"] as? [[String: Any]])
        XCTAssertTrue(rows.allSatisfy { $0["origin"] != nil })
        active["sets"] = rows.map { row -> [String: Any] in
            var old = row
            old.removeValue(forKey: "origin")
            return old
        }
        json["active"] = active

        let decoded = try JSONDecoder().decode(SessionSlot.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertEqual(decoded.active.sets.map(\.origin), [.prescribed, .prescribed, .prescribed])
        XCTAssertEqual(decoded.active.sets[0].reps, 6)
    }

    // MARK: Substitution and undo

    func testATemporarySwapKeepsLoggedAddedSetsAndMovesOpenOnes() {
        var slot = freshSlot()
        write(&slot, row: 0, reps: 6)
        write(&slot, row: 1, reps: 8)
        slot.addSet()
        write(&slot, row: 3, weight: 90, reps: 10)
        slot.addSet()

        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)

        XCTAssertEqual(slot.preserved.map(\.exerciseID), ["flat-bench"])
        XCTAssertEqual(
            slot.preserved.first?.sets.map(\.origin), [.prescribed, .prescribed, .sessionAdded],
            "logged work stays with bench press, the extra set included"
        )
        XCTAssertEqual(
            slot.active.sets.map(\.origin), [.prescribed, .sessionAdded],
            "open rows move, and the extra one is still extra"
        )
        XCTAssertEqual(slot.active.sets.map(\.index), [0, 1])
        XCTAssertEqual(slot.active.prescription, [bench.sets[2]], "only the prescribed row brings a prescription")
        XCTAssertTrue(slot.active.sets.allSatisfy { !$0.isLogged && $0.substitutedFrom == "flat-bench" })
        XCTAssertEqual(slot.setCount, 5, "nothing lost, nothing invented")
        XCTAssertEqual(slot.prescribedSetCount, 3)
        XCTAssertEqual(slot.loggedSetCount, 3)
    }

    func testAPermanentReplacementCarriesOpenAddedRowsUnmarked() {
        var slot = freshSlot()
        slot.addSet()
        slot.swap(to: "chest-press-machine", name: "Converging chest press", temporary: false)

        XCTAssertEqual(slot.active.sets.map(\.origin), [.prescribed, .prescribed, .prescribed, .sessionAdded])
        XCTAssertTrue(slot.active.sets.allSatisfy { $0.substitutedFrom == nil })
    }

    func testUndoingTheSwapBringsBackTheAddedRowsAndKeepsTheSubstitutesWork() {
        var slot = freshSlot()
        write(&slot, row: 0, reps: 6)
        slot.addSet()
        write(&slot, row: 3, weight: 90, reps: 10)
        slot.addSet()
        let beforeSwap = slot.active

        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        XCTAssertEqual(slot.active.sets.map(\.origin), [.prescribed, .prescribed, .sessionAdded])
        write(&slot, row: 0, weight: 36, reps: 8)
        write(&slot, row: 2, weight: 36, reps: 10)

        XCTAssertTrue(slot.undo())
        XCTAssertEqual(slot.active, beforeSwap, "bench press comes back with its added rows, logged and open")
        XCTAssertEqual(slot.preserved.map(\.exerciseID), ["db-bench"])
        XCTAssertEqual(slot.preserved.first?.sets.map(\.origin), [.prescribed, .sessionAdded])
        XCTAssertEqual(slot.loggedSetCount, 4, "nothing written on either side disappears")
    }

    // MARK: Completion

    func testCompletionIsMeasuredAgainstThePrescription() {
        var benchSlot = freshSlot()
        for row in 0..<3 { write(&benchSlot, row: row, reps: 8) }
        benchSlot.addSet()
        write(&benchSlot, row: 3, weight: 90, reps: 10)

        var flySlot = SessionSlot(position: 1, plan: fly, exerciseName: "Pec fly", prefillWeight: 40)
        write(&flySlot, row: 0, weight: 40, reps: 12)
        write(&flySlot, row: 1, weight: 40, reps: 12)
        flySlot.addSet()

        XCTAssertEqual(SessionSlot.completion(of: [benchSlot, flySlot]), 83, "5 of 6 prescribed sets")
        let snapshot = ActiveSessionSnapshot(
            dayID: "push", dayLabel: "Push", startedAt: Date(), currentIndex: 1,
            results: benchSlot.results + flySlot.results, slots: [benchSlot, flySlot]
        )
        XCTAssertEqual(snapshot.loggedSetCount, 6)
        XCTAssertEqual(snapshot.plannedSetCount, 8, "the counter reads 6/8: every row counts there")
        XCTAssertEqual(snapshot.finishedSession().completion, 83)

        write(&flySlot, row: 3, weight: 40, reps: 12)
        XCTAssertEqual(
            SessionSlot.completion(of: [benchSlot, flySlot]), 83,
            "an extra set cannot finish an unfinished prescription"
        )

        write(&flySlot, row: 2, weight: 40, reps: 12)
        flySlot.addSet()
        XCTAssertEqual(
            SessionSlot.completion(of: [benchSlot, flySlot]), 100,
            "and an extra set left open is not a missed set"
        )
    }

    func testFinishingKeepsEveryAddedSetThatWasLogged() {
        let finished = pausedSnapshot().snapshot.finishedSession()
        XCTAssertEqual(
            finished.results.flatMap(\.sets).map(\.origin),
            [.prescribed, .prescribed, .prescribed, .sessionAdded]
        )
        XCTAssertEqual(finished.completion, 100)
    }

    // MARK: The program

    func testAddingSetsNeverChangesThePrescription() {
        var slot = freshSlot()
        slot.addSet()
        slot.addSet()

        XCTAssertEqual(slot.plan, bench)
        XCTAssertEqual(slot.activePlanned, bench, "what every engine reads as the prescription is unchanged")
        XCTAssertEqual(slot.openPrescription, bench.sets, "and only prescribed rows carry one")
    }

    func testSavingASessionWithAddedSetsLeavesThePlanUntouched() throws {
        let plan: JSONValue = .array([.object([
            "id": .string("push"),
            "exercises": .array([.object([
                "id": .string("flat-bench"),
                "prescription": .string("1×5–6 + 2×6–8"),
            ])]),
        ])])
        var state = LegacyState(raw: ["plan": plan])
        let before = LegacyAdapter.plan(from: state)

        LegacyAdapter.apply(sessions: [pausedSnapshot().snapshot.finishedSession()], to: &state)
        let reloaded = try LegacyState(data: state.encoded())

        XCTAssertEqual(reloaded["plan"], plan)
        XCTAssertEqual(LegacyAdapter.plan(from: reloaded), before)
    }

    func testTheNextSessionIsStillBuiltFromThreeSets() {
        let withExtras = history([
            logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8), logged(3, 90, 10, origin: .sessionAdded),
        ])
        let proposal = ProgressionEngine.proposal(planned: bench, exercise: benchExercise, history: withExtras)

        XCTAssertEqual(proposal.setTargets?.count, 3)
        XCTAssertEqual(SessionSlot(position: 0, plan: bench, exerciseName: "Flat bench press").active.sets.count, 3)
    }

    // MARK: Progression

    func testAnExtraSetNeverFillsASkippedPrescribedSlot() {
        let appearance = ExerciseAppearance(date: Date(), sets: [
            logged(0, 100, 6), logged(1, 100, 8), logged(3, 100, 8, origin: .sessionAdded),
        ])

        XCTAssertEqual(ProgressionEngine.prescribedSlots(appearance, planned: bench).map { $0?.index }, [0, 1, nil])
        XCTAssertFalse(ProgressionEngine.qualifies(appearance, planned: bench))
    }

    /// iOS saves only written sets, so a skipped set 3 leaves no row and the
    /// extra set comes back numbered as set 3. Its origin is what keeps it
    /// out of the empty slot.
    func testAfterASaveAndReloadAnExtraSetStillCannotEarnTheIncrease() throws {
        var state = LegacyState(raw: [:])
        LegacyAdapter.apply(
            sessions: sessions([logged(0, 100, 6), logged(1, 100, 8), logged(3, 100, 8, origin: .sessionAdded)]),
            to: &state
        )
        let read = LegacyAdapter.sessions(from: try LegacyState(data: state.encoded()))
        let reloaded = ExerciseHistory.build(exerciseID: "flat-bench", modifiers: .none, from: read)

        XCTAssertEqual(reloaded.mostRecent?.sets.map(\.index), [0, 1, 2], "the number the extra set comes back with")
        XCTAssertEqual(reloaded.mostRecent?.sets.last?.origin, .sessionAdded)
        let proposal = ProgressionEngine.proposal(planned: bench, exercise: benchExercise, history: reloaded)
        XCTAssertNotEqual(proposal.tone, .ready)
        XCTAssertEqual(proposal.weightKg, 100, "no increase earned by an extra set")
    }

    func testALighterExtraSetNeitherBlocksNorFakesAnEarnedIncrease() {
        let earned = history([
            logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8), logged(3, 80, 12, origin: .sessionAdded),
        ])
        let proposal = ProgressionEngine.proposal(planned: bench, exercise: benchExercise, history: earned)

        XCTAssertEqual(proposal.tone, .ready, "the prescription was met; the back-off set is extra")
        XCTAssertEqual(proposal.weightKg, 102.5)
        XCTAssertEqual(proposal.setTargets, [5, 6, 6])
    }

    func testAnUnmarkedWebExtraRowPastThePrescriptionStaysOut() {
        let web = history([logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8), logged(3, 80, 12)])
        XCTAssertEqual(ProgressionEngine.proposal(planned: bench, exercise: benchExercise, history: web).tone, .ready)
    }

    func testTheAdviceLineIsJudgedOnThePrescribedSetsOnly() {
        let reference = history([logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8)])
        func advice(_ sets: [LoggedSet]) -> String? {
            SetRowPresenter.adviceLine(sets: sets, planned: bench, exercise: benchExercise, history: reference)
        }

        XCTAssertEqual(
            advice([logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8), logged(3, 100, 4, origin: .sessionAdded)]),
            "Alle reps gehaald. Volgende keer 102,5 kg.",
            "a short extra set does not take away what the prescription earned"
        )
        XCTAssertEqual(
            advice([logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 5), logged(3, 100, 8, origin: .sessionAdded)]),
            "Niet alle reps gehaald. Volgende keer hetzelfde gewicht.",
            "and a strong one does not make up for a missed set"
        )
        XCTAssertNotNil(
            advice([
                logged(0, 100, 6), logged(1, 100, 8), logged(2, 100, 8),
                LoggedSet(index: 3, weightKg: 100, origin: .sessionAdded),
            ]),
            "an open extra row does not hold the advice back"
        )
        XCTAssertNil(
            advice([
                logged(0, 100, 6), logged(1, 100, 8), LoggedSet(index: 2, weightKg: 100),
                logged(3, 100, 8, origin: .sessionAdded),
            ]),
            "while set 3 is open there is nothing to judge yet"
        )
    }

    // MARK: The web blob

    func testOnlyAddedSetsCarryAnOriginInTheWebBlob() throws {
        let session = TrainingSession(
            id: "1", date: Date(), dayID: "push", dayLabel: "Push", completion: 100,
            results: [ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press", sets: [
                logged(0, 100, 6), logged(1, 90, 10, origin: .sessionAdded),
            ])]
        )
        let rows = JSONValue(session: session)
            .objectValue?["results"]?.arrayValue?.first?
            .objectValue?["sets"]?.arrayValue
        XCTAssertNil(rows?[0].objectValue?["origin"], "a prescribed set keeps the web app's exact shape")
        XCTAssertEqual(rows?[1].objectValue?["origin"], .string("sessionAdded"))

        var state = LegacyState(raw: [:])
        LegacyAdapter.apply(sessions: [session], to: &state)
        let read = LegacyAdapter.sessions(from: try LegacyState(data: state.encoded()))
        XCTAssertEqual(read.first?.results.first?.sets.map(\.origin), [.prescribed, .sessionAdded])
    }
}
