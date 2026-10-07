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

    // MARK: Whole sessions

    func testDeletingASessionLeavesATombstoneAnOlderCopyCannotUndo() throws {
        let stored = JSONValue.object(["id": .string("s1"), "date": .string("2026-09-14T17:00:00.000Z"), "dayId": .string("push")])
        let kept = JSONValue.object(["id": .string("s2"), "date": .string("2026-09-15T17:00:00.000Z"), "dayId": .string("pull")])
        let after = StateMerge.apply(
            [StateChange(.removeSession(id: "s1"), createdAt: now)],
            to: state(["sessions": .array([stored, kept])]), now: now
        )
        XCTAssertEqual(after["sessions"]?.arrayValue?.compactMap { $0["id"]?.stringValue }, ["s2"])
        XCTAssertEqual(after[StateMerge.tombstonesKey]?["sessions"]?["s1"], .string(LegacyAdapter.isoString(now)))

        let stale = StateChange(.upsertSession(stored), createdAt: now.addingTimeInterval(-60))
        XCTAssertEqual(StateMerge.apply([stale], to: after, now: now)["sessions"]?.arrayValue?.count, 1, "an older copy stays deleted")
        let again = StateChange(.upsertSession(stored), createdAt: now.addingTimeInterval(60))
        XCTAssertEqual(StateMerge.apply([again], to: after, now: now)["sessions"]?.arrayValue?.count, 2, "logged again afterwards wins")
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

    // MARK: Programme

    private var editedPlan: JSONValue {
        .array([.object([
            "id": .string("push"),
            "label": .string("Maandag · Push"),
            "short": .string("Push"),
            "exercises": .array([.object(["id": .string("flat-bench"), "name": .string("Bankdrukken")])]),
        ])])
    }

    func testChangingProgrammeMovesTwoFieldsAndLeavesThePlanAlone() {
        let before = state([
            "planMode": .string("personal"),
            "sciencePlanId": .string("ppl-ul"),
            "plan": editedPlan,
            "sessions": .array([.object(["id": .string("w-1")])]),
        ])
        let after = StateMerge.apply(
            [StateChange(.setProgram(mode: "science", sciencePlanID: "upper-lower"), createdAt: now)],
            to: before, now: now
        )
        XCTAssertEqual(after["planMode"], .string("science"))
        XCTAssertEqual(after["sciencePlanId"], .string("upper-lower"))
        XCTAssertEqual(after["plan"], editedPlan, "a science programme is not stored in `plan`")
        XCTAssertEqual(after["sessions"]?.arrayValue?.count, 1)
    }

    func testGoingBackToYourOwnPlanRemembersWhichScienceProgrammeItWas() {
        let after = StateMerge.apply(
            [StateChange(.setProgram(mode: "personal", sciencePlanID: nil), createdAt: now)],
            to: state(["planMode": .string("science"), "sciencePlanId": .string("full-body")]),
            now: now
        )
        XCTAssertEqual(after["planMode"], .string("personal"))
        XCTAssertEqual(after["sciencePlanId"], .string("full-body"))
    }

    func testTheEditedPlanIsOnlyReadOnYourOwnProgramme() {
        let personal = LegacyAdapter.plan(from: state([
            "planMode": .string("personal"), "plan": editedPlan,
        ]))
        XCTAssertEqual(personal.map(\.id), ["push"], "the account's own plan")

        let science = LegacyAdapter.plan(from: state([
            "planMode": .string("science"), "sciencePlanId": .string("upper-lower"), "plan": editedPlan,
        ]))
        XCTAssertEqual(science.map(\.id), PlanCatalog.scienceUpperLower.map(\.id), "the programme's own days")
    }

    func testEveryProgrammeTheAccountCanBeOnIsNamed() {
        let programs = ProgramCatalog.all(personalPlan: PlanCatalog.personal)
        XCTAssertEqual(programs.map(\.name), ["Push / Pull / Benen", "PPL + Upper / Lower", "Upper / Lower", "Full body"])
        XCTAssertEqual(programs.map(\.id), ["personal", "science-ppl-ul", "science-upper-lower", "science-full-body"])
    }

    func testTheCurrentProgrammeIsTheOneTheAccountSays() {
        let science = LegacyState(raw: ["planMode": .string("science"), "sciencePlanId": .string("full-body")])
        XCTAssertEqual(ProgramCatalog.current(in: science, plan: PlanCatalog.personal).name, "Full body")

        let personal = LegacyState(raw: ["planMode": .string("personal")])
        XCTAssertEqual(ProgramCatalog.current(in: personal, plan: PlanCatalog.personal).mode, "personal")
    }

    // MARK: What intake answers

    func testTheExperienceAnswerIsKeptOnItsOwnKey() {
        let after = StateMerge.apply(
            [StateChange(.setExperience("week"), createdAt: now)],
            to: state(["planMode": .string("personal")]), now: now
        )
        XCTAssertEqual(after["experienceLevel"], .string("week"))
        XCTAssertEqual(after["planMode"], .string("personal"))
        XCTAssertEqual(LegacyAdapter.experience(from: LegacyState(raw: after.raw)), .week)
    }

    func testTheRackIsKeptAsTwoKeysAndReadBackHeaviestFirst() throws {
        let after = StateMerge.apply(
            [StateChange(.setEquipment(plates: [5, 20, 1.25], barKg: 15), createdAt: now)],
            to: state([:]), now: now
        )
        XCTAssertEqual(after["plates"]?.arrayValue?.compactMap(\.decimalValue), [5, 20, 1.25])
        XCTAssertEqual(after["barWeightKg"], .number(15))

        let inventory = LegacyAdapter.plateInventory(from: LegacyState(raw: after.raw))
        XCTAssertEqual(inventory.plates, [20, 5, 1.25])
        XCTAssertEqual(inventory.barKg, 15)
        XCTAssertEqual(inventory.smallestJump, 2.5)
    }

    func testAnAccountThatNeverAnsweredGetsTheSetTheDesignAssumes() {
        let inventory = LegacyAdapter.plateInventory(from: LegacyState(raw: [:]))
        XCTAssertEqual(inventory, .default)
        XCTAssertNil(LegacyAdapter.experience(from: LegacyState(raw: [:])))
    }

    func testTheRackDecidesWhatTheCalculatorCanMake() {
        let sparse = PlateInventory(plates: [20, 10], barKg: 20)
        let solution = PlateMath.solve(target: 55, bar: sparse.barKg, plates: sparse.plates)
        XCTAssertEqual(solution.total, 60, "20 kg steps, so 55 is not on the menu")
        XCTAssertEqual(sparse.smallestJump, 20)
    }

    // MARK: Storage

    func testTheNewOperationsSurviveBeingStoredOnTheDevice() throws {
        let changes = [
            StateChange(.setScheduleDay(key: "personal:2026-09-18", dayID: "upper"), createdAt: now),
            StateChange(.removeScheduleOverride(key: "personal:2026-09-19"), createdAt: now),
            StateChange(.upsertNutritionEntry(.object(["id": .string("m1")])), createdAt: now),
            StateChange(.removeNutritionEntry(id: "m1"), createdAt: now),
            StateChange(.removeSession(id: "s1"), createdAt: now),
            StateChange(.setTarget(field: "calories", value: 2300), createdAt: now),
            StateChange(.setProgram(mode: "science", sciencePlanID: "upper-lower"), createdAt: now),
            StateChange(.setProgram(mode: "personal", sciencePlanID: nil), createdAt: now),
            StateChange(.setExperience("block"), createdAt: now),
            StateChange(.setEquipment(plates: [20, 10], barKg: 15), createdAt: now),
        ]
        let data = try StateChange.encoder.encode(changes)
        XCTAssertEqual(try StateChange.decoder.decode([StateChange].self, from: data), changes)
    }
}

extension SharedKeysMergeTests {

    func testNewlyLoggedFoodGoesAtTheEndWhereTheWebAppPutsIts() throws {
        let stored = JSONValue.object(["id": .string("m1"), "name": .string("Havermout")])
        let after = StateMerge.apply(
            [StateChange(.upsertNutritionEntry(.object(["id": .string("m2"), "name": .string("Skyr")])), createdAt: now)],
            to: LegacyState(raw: ["nutritionEntries": .array([stored])]), now: now
        )
        XCTAssertEqual(
            after["nutritionEntries"]?.arrayValue?.compactMap { $0["id"]?.stringValue },
            ["m1", "m2"]
        )
    }
}
