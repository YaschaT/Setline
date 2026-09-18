import XCTest
@testable import SetlineCore

/// Artboard 24's queue: what is still only on this phone, in rows a person
/// recognises.
final class SyncQueueTests: XCTestCase {

    private let now = LegacyAdapter.isoDate("2026-09-18T18:00:00.000Z")!

    private func session(_ id: String, day: String, sets: Int, load: String) -> JSONValue {
        .object([
            "id": .string(id),
            "date": .string("2026-09-18T17:00:00.000Z"),
            "dayId": .string(day.lowercased()),
            "dayLabel": .string(day),
            "completion": .number(100),
            "results": .array([.object([
                "exerciseId": .string("flat-bench"),
                "name": .string("Bankdrukken"),
                "sets": .array((0..<sets).map { _ in .object([
                    "weight": .string(load), "reps": .string("8"),
                    "pausedReps": .string(""), "pauseSeconds": .string(""), "pauseEnabled": .bool(false),
                ]) }),
            ])]),
        ])
    }

    func testASessionIsOneRowWithItsSetsAndVolume() {
        let rows = SyncQueue.rows(from: [StateChange(.upsertSession(session("s1", day: "Push", sets: 3, load: "100")), createdAt: now)])
        XCTAssertEqual(rows.count, 1)
        XCTAssertTrue(rows[0].title.hasPrefix("Push · "))
        XCTAssertEqual(rows[0].detail, "3 sets · 2.400 kg")
    }

    func testASessionSavedTwiceIsStillOneThingWaiting() {
        let rows = SyncQueue.rows(from: [
            StateChange(.upsertSession(session("s1", day: "Push", sets: 2, load: "100")), createdAt: now),
            StateChange(.upsertSession(session("s1", day: "Push", sets: 3, load: "100")), createdAt: now),
        ])
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].detail, "3 sets · 2.400 kg", "the latest save is what waits")
    }

    func testARearrangedWeekIsOneRowHoweverManyDatesItTouched() {
        let rows = SyncQueue.rows(from: [
            StateChange(.setScheduleDay(key: "personal:2026-09-14", dayID: "rest"), createdAt: now),
            StateChange(.setScheduleDay(key: "personal:2026-09-17", dayID: "push"), createdAt: now),
            StateChange(.removeScheduleOverride(key: "personal:2026-09-20"), createdAt: now),
        ])
        XCTAssertEqual(rows, [SyncQueue.Row(title: "Weekplanning", detail: "3 dagen gewijzigd")])
    }

    func testBookkeepingNobodyWaitsOnIsNotListed() {
        let rows = SyncQueue.rows(from: [
            StateChange(.setActiveSession(.null), createdAt: now),
            StateChange(.hideWarmup(exerciseID: "flat-bench"), createdAt: now),
        ])
        XCTAssertTrue(rows.isEmpty)
    }

    func testAMealSaysWhatItIs() {
        let rows = SyncQueue.rows(from: [StateChange(.upsertNutritionEntry(.object([
            "id": .string("m1"), "name": .string("Kip, rijst"), "calories": .number(740),
        ])), createdAt: now)])
        XCTAssertEqual(rows, [SyncQueue.Row(title: "Kip, rijst", detail: "Voeding · 740 kcal")])
    }

    func testSeveralTargetEditsAreOneRow() {
        let rows = SyncQueue.rows(from: [
            StateChange(.setTarget(field: "protein", value: 170), createdAt: now),
            StateChange(.setTarget(field: "calories", value: 2400), createdAt: now),
        ])
        XCTAssertEqual(rows.count, 1)
    }
}
