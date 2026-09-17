import XCTest
@testable import SetlineCore

/// The keys both clients may now write, each at the smallest safe grain: one
/// date, one meal, one target field. Nothing here may ever replace a key.
final class SharedKeysMergeTests: XCTestCase {

    private let now = LegacyAdapter.isoDate("2026-09-17T18:00:00.000Z")!

    private func state(_ raw: [String: JSONValue]) -> LegacyState { LegacyState(raw: raw) }

    // MARK: Schedule

    func testOneDateIsWrittenAndTheRestOfTheMapIsLeftAlone() {
        let before = state([
            "scheduleOverrides": .object(["personal:2026-09-14": .string("push"), "personal:2026-09-15": .string("pull")]),
        ])
        let after = StateMerge.apply(
            [StateChange(.setScheduleDay(key: "personal:2026-09-15", dayID: "rest"), createdAt: now)],
            to: before, now: now
        )
        XCTAssertEqual(after["scheduleOverrides"]?["personal:2026-09-15"], .string("rest"))
        XCTAssertEqual(after["scheduleOverrides"]?["personal:2026-09-14"], .string("push"))
    }

    func testClearingADateNobodyOverrodeChangesNothing() {
        let before = state(["scheduleOverrides": .object(["personal:2026-09-14": .string("push")])])
        let after = StateMerge.apply(
            [StateChange(.removeScheduleOverride(key: "personal:2026-09-20"), createdAt: now)],
            to: before, now: now
        )
        XCTAssertEqual(after["scheduleOverrides"]?.objectValue?.count, 1)
    }

    func testClearingWorksWhenTheAccountHasNoOverridesAtAll() {
        let after = StateMerge.apply(
            [StateChange(.removeScheduleOverride(key: "personal:2026-09-20"), createdAt: now)],
            to: state(["planMode": .string("personal")]), now: now
        )
        XCTAssertNil(after["scheduleOverrides"], "nothing is invented to delete from")
        XCTAssertEqual(after["planMode"], .string("personal"))
    }

    func testTheKeyMatchesTheWebAppsProgramScope() {
        let date = LegacyAdapter.isoDate("2026-09-17T10:00:00.000Z")!
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        XCTAssertEqual(
            Schedule.overrideKey(for: date, mode: "personal", sciencePlanID: "ppl-ul", calendar: calendar),
            "personal:2026-09-17"
        )
        XCTAssertEqual(
            Schedule.overrideKey(for: date, mode: "science", sciencePlanID: "upper-lower", calendar: calendar),
            "science-upper-lower:2026-09-17"
        )
    }

    // MARK: Meals

    func testAMealKeepsFieldsIOSDoesNotModel() throws {
        let stored = JSONValue.object([
            "id": .string("m1"), "date": .string("2026-09-17"), "meal": .string("Lunch"),
            "name": .string("Kip"), "calories": .number(700), "protein": .number(50),
            "carbs": .number(70), "fat": .number(12), "source": .string("zoekopdracht"),
        ])
        let edit = JSONValue.object([
            "id": .string("m1"), "date": .string("2026-09-17"), "meal": .string("Lunch"),
            "name": .string("Kip en rijst"), "calories": .number(740), "protein": .number(52),
            "carbs": .number(80), "fat": .number(14),
        ])
        let after = StateMerge.apply(
            [StateChange(.upsertNutritionEntry(edit), createdAt: now)],
            to: state(["nutritionEntries": .array([stored])]), now: now
        )
        let entry = try XCTUnwrap(after["nutritionEntries"]?.arrayValue?.first?.objectValue)
        XCTAssertEqual(entry["name"], .string("Kip en rijst"))
        XCTAssertEqual(entry["source"], .string("zoekopdracht"), "a field only the web writes survives an iOS edit")
    }

    func testADeletedMealIsNotBroughtBackByAnOlderEdit() {
        let deletedAt = "2026-09-17T12:00:00.000Z"
        let before = state([
            "nutritionEntries": .array([]),
            StateMerge.tombstonesKey: .object(["nutritionEntries": .object(["m1": .string(deletedAt)])]),
        ])
        let stale = StateChange(
            .upsertNutritionEntry(.object(["id": .string("m1"), "name": .string("Kip")])),
            createdAt: LegacyAdapter.isoDate("2026-09-17T11:00:00.000Z")!
        )
        XCTAssertTrue(StateMerge.apply([stale], to: before, now: now)["nutritionEntries"]?.arrayValue?.isEmpty ?? false)

        let logAgain = StateChange(
            .upsertNutritionEntry(.object(["id": .string("m1"), "name": .string("Kip")])),
            createdAt: LegacyAdapter.isoDate("2026-09-17T13:00:00.000Z")!
        )
        let after = StateMerge.apply([logAgain], to: before, now: now)
        XCTAssertEqual(after["nutritionEntries"]?.arrayValue?.count, 1, "logging it again after the deletion is a new decision")
        XCTAssertNil(after[StateMerge.tombstonesKey]?["nutritionEntries"]?["m1"])
    }

    func testDeletingAMealLeavesARecordOfTheDeletion() throws {
        let entry = JSONValue.object(["id": .string("m1"), "name": .string("Kip")])
        let after = StateMerge.apply(
            [StateChange(.removeNutritionEntry(id: "m1"), createdAt: now)],
            to: state(["nutritionEntries": .array([entry])]), now: now
        )
        XCTAssertTrue(after["nutritionEntries"]?.arrayValue?.isEmpty ?? false)
        XCTAssertEqual(after[StateMerge.tombstonesKey]?["nutritionEntries"]?["m1"], .string(LegacyAdapter.isoString(now)))
    }

    // MARK: Targets

    func testOneTargetFieldMovesAndTheOthersStay() throws {
        let after = StateMerge.apply(
            [StateChange(.setTarget(field: "protein", value: 170), createdAt: now)],
            to: state(["targets": .object([
                "calories": .number(2250), "protein": .number(165), "carbs": .number(240), "fat": .number(70),
            ])]),
            now: now
        )
        let targets = try XCTUnwrap(after["targets"]?.objectValue)
        XCTAssertEqual(targets["protein"], .number(170))
        XCTAssertEqual(targets["calories"], .number(2250))
        XCTAssertEqual(targets.count, 4)
    }

    // MARK: Reading back

    func testOnlyTheActiveProgramsOverridesAreRead() {
        let raw: [String: JSONValue] = [
            "planMode": .string("science"),
            "sciencePlanId": .string("upper-lower"),
            "scheduleOverrides": .object([
                "personal:2026-09-17": .string("push"),
                "science-upper-lower:2026-09-17": .string("upper"),
                "science-ppl-ul:2026-09-18": .string("legs"),
            ]),
        ]
        let overrides = LegacyAdapter.scheduleOverrides(from: LegacyState(raw: raw))
        XCTAssertEqual(overrides, ["2026-09-17": "upper"], "another plan's days are not this plan's days")
    }

    func testAnOlderUnscopedOverrideStillCountsWhereTheWebAppCountsIt() {
        let overrides = LegacyAdapter.scheduleOverrides(from: LegacyState(raw: [
            "planMode": .string("personal"),
            "scheduleOverrides": .object(["2026-09-17": .string("push")]),
        ]))
        XCTAssertEqual(overrides, ["2026-09-17": "push"])

        let scoped = LegacyAdapter.scheduleOverrides(from: LegacyState(raw: [
            "planMode": .string("science"),
            "sciencePlanId": .string("upper-lower"),
            "scheduleOverrides": .object(["2026-09-17": .string("push")]),
        ]))
        XCTAssertTrue(scoped.isEmpty, "the web app ignores bare keys on the newer plans, so we do too")
    }

    func testAScopedOverrideWinsOverTheOlderBareOne() {
        let overrides = LegacyAdapter.scheduleOverrides(from: LegacyState(raw: [
            "planMode": .string("personal"),
            "scheduleOverrides": .object([
                "2026-09-17": .string("push"),
                "personal:2026-09-17": .string("rest"),
            ]),
        ]))
        XCTAssertEqual(overrides, ["2026-09-17": "rest"])
    }

    // MARK: Storage

    func testTheNewOperationsSurviveBeingStoredOnTheDevice() throws {
        let changes = [
            StateChange(.setScheduleDay(key: "personal:2026-09-18", dayID: "upper"), createdAt: now),
            StateChange(.removeScheduleOverride(key: "personal:2026-09-19"), createdAt: now),
            StateChange(.upsertNutritionEntry(.object(["id": .string("m1")])), createdAt: now),
            StateChange(.removeNutritionEntry(id: "m1"), createdAt: now),
            StateChange(.setTarget(field: "calories", value: 2300), createdAt: now),
        ]
        let data = try StateChange.encoder.encode(changes)
        XCTAssertEqual(try StateChange.decoder.decode([StateChange].self, from: data), changes)
    }
}
