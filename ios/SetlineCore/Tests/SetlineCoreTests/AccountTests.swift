import XCTest
@testable import SetlineCore

/// Artboard 23 states facts about the account, and "Exporteer alles" hands
/// those facts back. Both must come from stored data only.
final class AccountTests: XCTestCase {

    private let now = LegacyAdapter.isoDate("2026-09-17T18:00:00.000Z")!

    private func bench(_ sets: [LoggedSet]) -> ExerciseResult {
        ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press", sets: sets)
    }

    private func session(_ id: String, results: [ExerciseResult], counts: (Int, Int)? = (3, 3)) -> TrainingSession {
        TrainingSession(
            id: id, date: now.addingTimeInterval(-86_400), dayID: "push", dayLabel: "Push", completion: 100,
            results: results, durationSeconds: 3_000,
            plannedSetCount: counts?.0, completedSetCount: counts?.1
        )
    }

    private func state(_ extra: [String: JSONValue] = [:], sessions: [TrainingSession]) -> LegacyState {
        var raw: [String: JSONValue] = [
            "planMode": .string("personal"),
            "sessions": .array(sessions.map { JSONValue(session: $0) }),
        ]
        raw.merge(extra) { _, new in new }
        return LegacyState(raw: raw)
    }

    // MARK: What the screen may state

    func testTheAccountStatesOnlyWhatIsStored() {
        let logged = session("s1", results: [bench([LoggedSet(index: 0, weightKg: 100, reps: 6)])])
        let summary = AccountSummary.make(state: state(sessions: [logged]), plan: PlanCatalog.personal, now: now)

        XCTAssertEqual(summary.planName, "Push / Pull / Benen")
        XCTAssertNil(summary.targets, "no stored targets, so the design's example numbers are not shown")
        XCTAssertEqual(summary.sessionCount, 1)
        XCTAssertEqual(summary.loggedExerciseCount, 1)
        XCTAssertEqual(summary.weighInCount, 0)
        XCTAssertEqual(summary.trainingDays, ["ma", "di", "wo", "vr", "za"], "the week's shape, not a fixed list")
    }

    func testStoredTargetsAndWeighInsAreStated() {
        let stored = state([
            "targets": .object([
                "calories": .number(2250), "protein": .number(165), "carbs": .number(240), "fat": .number(70),
            ]),
            "metrics": .array([.object(["id": .string("m1"), "date": .string("2026-09-06"), "weight": .number(82.4)])]),
        ], sessions: [session("s1", results: [bench([LoggedSet(index: 0, weightKg: 100, reps: 6)])])])

        let summary = AccountSummary.make(state: stored, plan: PlanCatalog.personal, now: now)

        XCTAssertEqual(summary.targets?.calories, 2_250)
        XCTAssertEqual(summary.targets?.protein, 165)
        XCTAssertEqual(summary.weighInCount, 1)
    }

    func testTrainingDaysFollowTheAccountsOwnSchedule() {
        let overrides = JSONValue.object([
            "personal:2026-09-14": .string("push"),
            "personal:2026-09-15": .string("rest"),
            "personal:2026-09-16": .string("rest"),
            "personal:2026-09-17": .string("rest"),
            "personal:2026-09-18": .string("pull"),
            "personal:2026-09-19": .string("rest"),
            "personal:2026-09-20": .string("rest"),
        ])
        let stored = state(["scheduleOverrides": overrides], sessions: [])

        let summary = AccountSummary.make(state: stored, plan: PlanCatalog.personal, now: now)

        XCTAssertEqual(summary.trainingDays, ["ma", "vr"])
    }

    func testRestIsStatedPerRoleNotAsOneDefault() {
        let summary = AccountSummary.make(state: state(sessions: []), plan: PlanCatalog.personal, now: now)
        XCTAssertEqual(summary.rest.map(\.label), ["3:00", "2:00", "1:30"])
        XCTAssertEqual(summary.rest.map(\.roleLabel), ["primaire lift", "samengesteld", "isolatie"])
    }

    // MARK: Export

    func testTheJSONExportCarriesTrainingDataAndNoSyncBookkeeping() throws {
        let stored = state([
            StateMerge.tombstonesKey: .object(["sessions": .object(["gone": .string("2026-09-01T10:00:00.000Z")])]),
            StateMerge.resetKey: .object(["at": .string("2026-08-01T10:00:00.000Z")]),
            LegacyAdapter.painFlagsKey: .array([]),
        ], sessions: [session("s1", results: [bench([LoggedSet(index: 0, weightKg: 100, reps: 6)])])])

        let data = try StateExport.json(from: stored)
        let decoded = try JSONDecoder().decode(JSONValue.self, from: data).objectValue ?? [:]

        XCTAssertNil(decoded[StateMerge.tombstonesKey], "deletion records describe syncing, not training")
        XCTAssertNil(decoded[StateMerge.resetKey])
        XCTAssertEqual(decoded["sessions"]?.arrayValue?.count, 1)
        XCTAssertNotNil(decoded[LegacyAdapter.painFlagsKey], "the user's own data stays")
        let text = String(decoding: data, as: UTF8.self).lowercased()
        for secret in ["access_token", "refresh_token", "apikey", "password", "bearer"] {
            XCTAssertFalse(text.contains(secret), "\(secret) must never reach an export")
        }
    }

    func testTheCSVHasOneRowPerLoggedWorkingSet() {
        let sets = [
            LoggedSet(index: 0, weightKg: 60, reps: 8, isWarmup: true),
            LoggedSet(index: 1, weightKg: 100, reps: 6, rirReported: 1),
            LoggedSet(index: 2, weightKg: 100, reps: 0),
            LoggedSet(index: 3, weightKg: 90, reps: 10, substitutedFrom: "incline-bench", origin: .sessionAdded),
        ]
        let csv = StateExport.csv(from: [session("s1", results: [bench(sets)])])
        let lines = csv.split(separator: "\n").map(String.init)

        XCTAssertEqual(lines.count, 3, "header plus the two written working sets")
        XCTAssertTrue(lines[0].hasPrefix("datum,dag,sessie_id,oefening"))
        XCTAssertTrue(lines[1].contains("Flat bench press,flat-bench,2,100,6,1"), lines[1])
        XCTAssertTrue(lines[1].contains("voorgeschreven"))
        XCTAssertTrue(lines[2].contains("extra,incline-bench"), lines[2])
        XCTAssertTrue(lines[2].hasSuffix(",50,3,3,100"), "session context travels with every row: \(lines[2])")
    }

    func testExportFileNamesAreDated() {
        let names = StateExport.fileNames(now: now, calendar: Calendar(identifier: .gregorian))
        XCTAssertEqual(names.json, "setline-export-2026-09-17.json")
        XCTAssertEqual(names.csv, "setline-sets-2026-09-17.csv")
    }
}
