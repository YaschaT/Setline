import XCTest
@testable import SetlineCore

/// The iOS sync loop against an in-memory row that behaves like the table:
/// conditional writes, conflicts, and another client writing mid-sync.
final class StateSyncTests: XCTestCase {

    private actor MemoryStore: StateStore {
        private(set) var row: RemoteState?
        private(set) var updates = 0
        private(set) var inserts = 0
        /// Rows another client writes just before each of our writes lands.
        private var interleaved: [RemoteState] = []

        init(row: RemoteState?) { self.row = row }

        func interleave(_ rows: [RemoteState]) { interleaved = rows }

        func fetch() async throws -> RemoteState? { row }

        func update(_ state: LegacyState, expectedVersion: String, nextVersion: String) async throws -> WriteOutcome {
            updates += 1
            if !interleaved.isEmpty { row = interleaved.removeFirst() }
            guard let current = row, current.version == expectedVersion else { return .conflict }
            row = RemoteState(state: state, version: nextVersion)
            return .written(version: nextVersion)
        }

        func insert(_ state: LegacyState, nextVersion: String) async throws -> WriteOutcome {
            inserts += 1
            if !interleaved.isEmpty { row = interleaved.removeFirst() }
            guard row == nil else { return .conflict }
            row = RemoteState(state: state, version: nextVersion)
            return .written(version: nextVersion)
        }
    }

    private let now = LegacyAdapter.isoDate("2026-09-14T20:00:00.000Z")!

    private func workout(_ id: String) -> TrainingSession {
        TrainingSession(
            id: id, date: now.addingTimeInterval(-3_600), dayID: "push", dayLabel: "Push", completion: 100,
            results: [ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press", sets: [LoggedSet(index: 0, weightKg: 100, reps: 6)])],
            durationSeconds: 1_800
        )
    }

    private func meal(_ id: String) -> JSONValue {
        .object(["id": .string(id), "date": .string("2026-09-14"), "meal": .string("Lunch"), "name": .string("Havermout"),
                 "calories": .number(520), "protein": .number(35), "carbs": .number(70), "fat": .number(12)])
    }

    private func ids(_ state: LegacyState?, _ key: String) -> [String] {
        (state?[key]?.arrayValue ?? []).compactMap { $0["id"]?.stringValue }
    }

    func testAConflictRefetchesAndAppliesTheSameChangeToTheNewerState() async throws {
        let store = MemoryStore(row: RemoteState(state: LegacyState(raw: ["nutritionEntries": .array([meal("n-1")])]), version: "2026-09-14T18:00:00.000Z"))
        // The web app saves a meal between our read and our write.
        await store.interleave([RemoteState(state: LegacyState(raw: ["nutritionEntries": .array([meal("n-1"), meal("n-2")])]), version: "2026-09-14T19:00:00.000Z")])

        let change = StateChange.upsert(workout("ios-1"), createdAt: now)
        let outcome = try await StateSync.run(changes: [change], store: store, now: { [now] in now })

        let row = await store.row
        let updates = await store.updates
        XCTAssertEqual(updates, 2, "the first write lost the race and was retried")
        XCTAssertEqual(ids(row?.state, "nutritionEntries"), ["n-1", "n-2"], "the web's newer meal survives")
        XCTAssertEqual(ids(row?.state, "sessions"), ["ios-1"])
        XCTAssertEqual(outcome?.settled, [change.id])
        XCTAssertEqual(outcome?.version, row?.version)
    }

    func testAnAccountWithoutStoredStateGetsItCreated() async throws {
        let store = MemoryStore(row: nil)
        let outcome = try await StateSync.run(changes: [.upsert(workout("ios-1"), createdAt: now)], store: store, now: { [now] in now })
        let inserts = await store.inserts
        XCTAssertEqual(inserts, 1)
        XCTAssertEqual(ids(outcome?.state, "sessions"), ["ios-1"])
    }

    func testNothingIsWrittenWhenTheStoredStateAlreadyHasTheChange() async throws {
        let change = StateChange.upsert(workout("ios-1"), createdAt: now)
        let stored = StateMerge.apply([change], to: LegacyState(raw: [:]), now: now)
        let store = MemoryStore(row: RemoteState(state: stored, version: "2026-09-14T18:00:00.000Z"))

        let outcome = try await StateSync.run(changes: [change], store: store, now: { [now] in now })

        let writes = await store.updates + store.inserts
        XCTAssertEqual(writes, 0)
        XCTAssertEqual(outcome?.settled, [change.id], "settled all the same")
    }

    /// A device with no copy of its own — a fresh install, or one whose local
    /// copy was cleared — only reads the account on its first sync.
    func testADeviceWithNothingOfItsOwnOnlyReadsTheAccount() async throws {
        let stored = LegacyState(raw: [
            "sessions": .array([JSONValue(session: workout("web-1"))]),
            "nutritionEntries": .array([meal("n-1")]),
        ])
        let store = MemoryStore(row: RemoteState(state: stored, version: "2026-09-14T18:00:00.000Z"))

        let outcome = try await StateSync.run(changes: [], recovering: nil, store: store, now: { [now] in now })

        let writes = await store.updates + store.inserts
        XCTAssertEqual(writes, 0)
        XCTAssertEqual(outcome?.state.raw, stored.raw)
        XCTAssertEqual(outcome?.version, "2026-09-14T18:00:00.000Z")
        XCTAssertEqual(outcome?.settled, [])
    }

    func testLosingEveryRaceLeavesTheChangePendingAndWritesNothingOfOurs() async throws {
        let store = MemoryStore(row: RemoteState(state: LegacyState(raw: [:]), version: "2026-09-14T18:00:00.000Z"))
        await store.interleave((1...3).map { minute in
            RemoteState(state: LegacyState(raw: ["other": .number(Decimal(minute))]), version: "2026-09-14T19:0\(minute):00.000Z")
        })

        let outcome = try await StateSync.run(changes: [.upsert(workout("ios-1"), createdAt: now)], store: store, now: { [now] in now })

        XCTAssertNil(outcome)
        let row = await store.row
        XCTAssertTrue(ids(row?.state, "sessions").isEmpty)
    }

    func testAChangeOutrankedByALaterDeletionSettlesWithoutWriting() async throws {
        let deleted = LegacyState(raw: [StateMerge.tombstonesKey: .object(["sessions": .object(["s-old": .string("2026-09-14T10:00:00.000Z")])])])
        let store = MemoryStore(row: RemoteState(state: deleted, version: "2026-09-14T10:00:00.000Z"))
        let stale = StateChange.upsert(workout("s-old"), createdAt: LegacyAdapter.isoDate("2026-09-14T09:00:00.000Z")!)

        let outcome = try await StateSync.run(changes: [stale], store: store, now: { [now] in now })

        let writes = await store.updates + store.inserts
        XCTAssertEqual(writes, 0)
        XCTAssertEqual(outcome?.settled, [stale.id])
    }

    func testRecoveringAnOldDeviceCopyOnlyAddsWhatIsMissing() async throws {
        let savedAt = LegacyAdapter.isoDate("2026-09-13T12:00:00.000Z")!
        let local = LegacyState(raw: [
            "sessions": .array([JSONValue(session: workout("offline")), JSONValue(session: workout("shared")), JSONValue(session: workout("deleted"))]),
            LegacyAdapter.activeSessionKey: .object(["dayID": .string("push")]),
            LegacyAdapter.customExercisesKey: .array([LegacyAdapter.jsonValue(CustomExercise(name: "Sled", createdAt: savedAt))!]),
        ])
        var sharedOnServer = JSONValue(session: workout("shared")).objectValue!
        sharedOnServer["completion"] = .number(80)
        let store = MemoryStore(row: RemoteState(state: LegacyState(raw: [
            "sessions": .array([.object(sharedOnServer)]),
            StateMerge.tombstonesKey: .object(["sessions": .object(["deleted": .string("2026-09-12T08:00:00.000Z")])]),
            LegacyAdapter.activeSessionKey: .null,
            "nutritionEntries": .array([meal("n-1")]),
        ]), version: "2026-09-14T18:00:00.000Z"))

        _ = try await StateSync.run(changes: [], recovering: (local, savedAt), store: store, now: { [now] in now })

        let stored = await store.row
        let row = try XCTUnwrap(stored)
        XCTAssertEqual(ids(row.state, "sessions"), ["offline", "shared"], "added the offline session; the deleted one stays deleted")
        XCTAssertEqual(row.state["sessions"]?.arrayValue?.last?["completion"], .number(80), "the stored copy of a shared session is not overwritten")
        XCTAssertEqual(row.state[LegacyAdapter.activeSessionKey], .null, "an explicit clear is not undone")
        XCTAssertEqual(LegacyAdapter.customExercises(from: row.state).map(\.id), ["custom:sled"])
        XCTAssertEqual(ids(row.state, "nutritionEntries"), ["n-1"])
    }

    func testVersionsMoveForwardEvenWhenThisClockIsBehind() {
        let behind = LegacyAdapter.isoDate("2026-09-14T17:00:00.000Z")!
        XCTAssertEqual(StateSync.nextVersion(after: "2026-09-14T18:00:00.500Z", now: behind), "2026-09-14T18:00:00.501Z")
        XCTAssertEqual(StateSync.nextVersion(after: nil, now: behind), "2026-09-14T17:00:00.000Z")
    }
}
