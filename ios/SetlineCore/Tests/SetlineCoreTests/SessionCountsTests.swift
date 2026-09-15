import XCTest
@testable import SetlineCore

// MARK: - Stored set counts
//
// History shows "completed of planned" for a session saved with exact counts,
// and the stored completion percentage for every other session. Planned is the
// prescribed working sets; completed is how many of those were logged. Sets
// added during the session are in neither number.

final class SessionCountsTests: XCTestCase {

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

    private func benchSlot() -> SessionSlot {
        SessionSlot(position: 0, plan: bench, exerciseName: "Flat bench press", prefillWeight: 100)
    }

    private func write(_ slot: inout SessionSlot, row: Int, weight: Decimal = 100, reps: Int) {
        slot.active.sets[row].weightKg = weight
        slot.active.sets[row].reps = reps
    }

    private func finished(_ slots: [SessionSlot], id: String? = nil) -> TrainingSession {
        ActiveSessionSnapshot(
            dayID: "push", dayLabel: "Push", startedAt: Date(timeIntervalSince1970: 1_789_000_000), currentIndex: 0,
            results: slots.flatMap(\.results), activeSeconds: 1_800, slots: slots
        ).finishedSession(id: id)
    }

    private func storedSession(_ extra: [String: JSONValue]) -> TrainingSession? {
        var object: [String: JSONValue] = [
            "id": .string("s1"),
            "date": .string("2026-09-01T08:00:00.000Z"),
            "dayId": .string("push"),
            "dayLabel": .string("Push"),
            "completion": .number(50),
            "results": .array([]),
        ]
        object.merge(extra) { _, new in new }
        return LegacyAdapter.session(from: .object(object))
    }

    // MARK: Counting

    func testAddedSetsAreInNeitherNumber() {
        var bench = benchSlot()
        for row in 0..<3 { write(&bench, row: row, reps: 8) }
        bench.addSet()
        write(&bench, row: 3, weight: 90, reps: 10)
        bench.addSet()

        var fly = SessionSlot(position: 1, plan: fly, exerciseName: "Pec fly", prefillWeight: 40)
        write(&fly, row: 0, weight: 40, reps: 12)
        fly.addSet()
        write(&fly, row: 3, weight: 40, reps: 12)

        let session = finished([bench, fly])

        XCTAssertEqual(session.plannedSetCount, 6, "3 + 3 prescribed; the three added rows are not planned sets")
        XCTAssertEqual(session.completedSetCount, 4, "3 + 1 logged prescribed; the logged added sets are not among them")
        XCTAssertEqual(session.completion, 66, "the percentage says the same thing")
        XCTAssertEqual(session.results.flatMap(\.sets).count, 6, "while history keeps every logged set, added ones included")
    }

    func testALoggedAddedSetNeverCompletesAMissedPrescribedSet() {
        var bench = benchSlot()
        write(&bench, row: 0, reps: 6)
        write(&bench, row: 1, reps: 8)
        bench.addSet()
        write(&bench, row: 3, reps: 8)

        let session = finished([bench])

        XCTAssertEqual(session.completedSetCount, 2)
        XCTAssertEqual(session.plannedSetCount, 3)
    }

    func testASwapKeepsCountingAgainstTheSamePrescription() {
        var slot = benchSlot()
        write(&slot, row: 0, reps: 6)
        slot.swap(to: "db-bench", name: "Dumbbell bench press", temporary: true)
        write(&slot, row: 0, weight: 36, reps: 8)

        let session = finished([slot])

        XCTAssertEqual(session.plannedSetCount, 3, "a swap moves the open sets; it adds and removes none")
        XCTAssertEqual(session.completedSetCount, 2, "one on bench press, one on the substitute")
    }

    func testASnapshotSavedBeforeSlotsStoresNoExactCount() {
        let old = ActiveSessionSnapshot(
            dayID: "pull", dayLabel: "Pull", startedAt: Date(), currentIndex: 0,
            results: [ExerciseResult(exerciseID: "lat-pulldown", name: "Lat pulldown", sets: [
                LoggedSet(index: 0, weightKg: 60, reps: 8),
                LoggedSet(index: 1, weightKg: 60, reps: 0),
            ])]
        )

        let session = old.finishedSession()

        XCTAssertNil(session.plannedSetCount, "its rows need not cover every exercise of the day")
        XCTAssertNil(session.completedSetCount)
        XCTAssertEqual(session.completion, 50, "so history shows the percentage it always had")
    }

    // MARK: Storing and reading

    func testCountsTravelWithTheSessionThroughTheAccount() throws {
        var slot = benchSlot()
        write(&slot, row: 0, reps: 6)
        write(&slot, row: 1, reps: 8)
        let session = finished([slot], id: "ios-1")

        let stored = StateMerge.apply([.upsert(session)], to: LegacyState(raw: [:]))
        let row = try XCTUnwrap(stored["sessions"]?.arrayValue?.first?.objectValue)
        XCTAssertEqual(row["iosPlannedSetCount"], .number(3))
        XCTAssertEqual(row["iosCompletedSetCount"], .number(2))

        let read = try XCTUnwrap(LegacyAdapter.sessions(from: LegacyState(data: stored.encoded())).first)
        XCTAssertEqual(read.plannedSetCount, 3)
        XCTAssertEqual(read.completedSetCount, 2)
        XCTAssertEqual(read.completion, 66)
    }

    func testASessionWithoutCountsFallsBackToItsPercentage() throws {
        let web = try XCTUnwrap(storedSession(["completion": .number(75)]))

        XCTAssertNil(web.plannedSetCount)
        XCTAssertNil(web.completedSetCount)
        XCTAssertEqual(web.completion, 75)
        XCTAssertNil(
            JSONValue(session: web).objectValue?["iosPlannedSetCount"],
            "and writing it back invents none"
        )
    }

    func testCountsThatDoNotHoldTogetherAreIgnored() {
        let broken: [[String: JSONValue]] = [
            ["iosPlannedSetCount": .number(6)],
            ["iosCompletedSetCount": .number(4)],
            ["iosPlannedSetCount": .number(4), "iosCompletedSetCount": .number(6)],
            ["iosPlannedSetCount": .number(0), "iosCompletedSetCount": .number(0)],
            ["iosPlannedSetCount": .number(6), "iosCompletedSetCount": .number(-1)],
            ["iosPlannedSetCount": .string("zes"), "iosCompletedSetCount": .number(4)],
        ]
        for fields in broken {
            let session = storedSession(fields)
            XCTAssertNil(session?.plannedSetCount, "\(fields)")
            XCTAssertNil(session?.completedSetCount, "\(fields)")
            XCTAssertEqual(session?.completion, 50, "the session itself still reads")
        }

        let whole = storedSession(["iosPlannedSetCount": .number(6), "iosCompletedSetCount": .number(6)])
        XCTAssertEqual(whole?.plannedSetCount, 6)
        XCTAssertEqual(whole?.completedSetCount, 6)
    }

    /// The merge drops these fields when a session's results change under
    /// them. That only works if they are exactly the fields written here.
    func testTheWrittenCountsAreTheFieldsTheMergeTreatsAsDerived() {
        let session = TrainingSession(
            id: "s1", date: Date(), dayID: "push", dayLabel: "Push", completion: 50, results: [],
            plannedSetCount: 6, completedSetCount: 3
        )
        let written = JSONValue(session: session).objectValue?.keys.filter { $0.hasPrefix("ios") } ?? []

        XCTAssertEqual(Set(written), Set(StateMerge.derivedSessionFields))
    }
}
