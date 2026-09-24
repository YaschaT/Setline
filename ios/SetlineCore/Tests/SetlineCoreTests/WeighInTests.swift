import XCTest
@testable import SetlineCore

/// Writing a weigh-in from this client: one row per day, every other row and
/// every other key left exactly as it was.
final class WeighInTests: XCTestCase {

    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        return calendar
    }()

    private func date(_ day: Int, hour: Int = 8) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 9, day: day, hour: hour))!
    }

    private func metric(_ id: String, _ day: Int, _ weight: Double, waist: Double? = nil) -> BodyMetric {
        BodyMetric(id: id, date: WeighIn.dateKey(date(day), calendar: calendar), weight: weight, waist: waist)
    }

    private func state(_ metrics: [BodyMetric], extra: [String: JSONValue] = [:]) -> LegacyState {
        var raw: [String: JSONValue] = ["metrics": .array(metrics.map(WeighIn.json))]
        for (key, value) in extra { raw[key] = value }
        return LegacyState(raw: raw)
    }

    private func write(
        _ weight: Decimal,
        on day: Int,
        into state: LegacyState,
        id: String = "new-row",
        at createdAt: Date? = nil
    ) -> LegacyState {
        let stored = LegacyAdapter.metrics(from: state)
        let entry = WeighIn.entry(
            weightKg: weight, on: date(day), in: stored, id: id, calendar: calendar
        )
        return StateMerge.apply(
            [StateChange(.upsertMetric(WeighIn.json(entry)), createdAt: createdAt ?? date(day))],
            to: state
        )
    }

    // MARK: - No weigh-in yet today

    func testAFirstWeighInOfTheDayIsAddedWithoutTouchingTheOthers() {
        let before = state([metric("a", 20, 84.1), metric("b", 22, 83.8)])
        let after = write(83.4, on: 24, into: before, id: "c")

        let metrics = LegacyAdapter.metrics(from: after)
        XCTAssertEqual(metrics.count, 3)
        XCTAssertEqual(metrics.map(\.id), ["a", "b", "c"], "Appended, as the web app appends")
        XCTAssertEqual(metrics.last?.weight, 83.4)
        XCTAssertEqual(metrics.last?.date, "2026-09-24")
        XCTAssertEqual(metrics[0].weight, 84.1, "An earlier weigh-in is not rewritten")
        XCTAssertEqual(metrics[1].weight, 83.8)
    }

    func testTheFirstWeighInOfAnEmptyAccountStands() {
        let after = write(83.4, on: 24, into: state([]), id: "first")
        XCTAssertEqual(LegacyAdapter.metrics(from: after).map(\.weight), [83.4])
    }

    // MARK: - A weigh-in already exists today

    func testWeighingAgainOnTheSameDayReplacesThatDaysNumber() {
        let before = state([metric("a", 22, 83.8), metric("b", 24, 83.4)])
        let after = write(83.9, on: 24, into: before, id: "must-not-be-used")

        let metrics = LegacyAdapter.metrics(from: after)
        XCTAssertEqual(metrics.count, 2, "No second row for a day already weighed")
        XCTAssertEqual(metrics.last?.id, "b", "The day's own row is written again")
        XCTAssertEqual(metrics.last?.weight, 83.9)
        XCTAssertEqual(metrics.first?.weight, 83.8)
    }

    func testAWaistThisClientNeverMeasuresSurvivesTheCorrection() {
        let before = state([metric("b", 24, 83.4, waist: 81.5)])
        let after = write(83.9, on: 24, into: before)

        let stored = LegacyAdapter.metrics(from: after)
        XCTAssertEqual(stored.first?.weight, 83.9)
        XCTAssertEqual(stored.first?.waist, 81.5, "The web app measured it; this client leaves it alone")
    }

    func testARowWrittenBeforeTheDateFormatSettledIsStillTodays() {
        // Older rows carry a full timestamp rather than `yyyy-MM-dd`.
        let legacy = BodyMetric(id: "old", date: "2026-09-24T07:12:00.000Z", weight: 83.4)
        let after = write(84.0, on: 24, into: state([legacy]), id: "would-be-new")

        let metrics = LegacyAdapter.metrics(from: after)
        XCTAssertEqual(metrics.count, 1, "The same day, however its date was written")
        XCTAssertEqual(metrics.first?.id, "old")
        XCTAssertEqual(metrics.first?.weight, 84.0)
    }

    // MARK: - Everything else in the account

    func testWritingAWeighInLeavesTheRestOfTheAccountAlone() {
        let before = state(
            [metric("a", 22, 83.8)],
            extra: [
                "sessions": .array([.object(["id": .string("s1")])]),
                "nutritionEntries": .array([.object(["id": .string("n1")])]),
                "scheduleOverrides": .object(["2026-09-24": .string("rest")]),
                "recoveryDraft": .object(["note": .string("web only")]),
            ]
        )
        let after = write(83.4, on: 24, into: before)

        XCTAssertEqual(after.raw["sessions"], before.raw["sessions"])
        XCTAssertEqual(after.raw["nutritionEntries"], before.raw["nutritionEntries"])
        XCTAssertEqual(after.raw["scheduleOverrides"], before.raw["scheduleOverrides"])
        XCTAssertEqual(after.raw["recoveryDraft"], before.raw["recoveryDraft"], "A key iOS does not own is carried through")
    }

    // MARK: - What the screen reads back

    func testTheTrendFollowsFromTheSeriesAfterAWeighIn() throws {
        let before = state([metric("a", 1, 85.0), metric("b", 22, 83.8)])
        let after = write(83.4, on: 24, into: before)

        let progress = BodyProgress.make(metrics: LegacyAdapter.metrics(from: after), calendar: calendar)
        XCTAssertEqual(progress.latest?.weightKg, 83.4, "Today's weigh-in is the latest")
        XCTAssertEqual(progress.entries.count, 3)
        XCTAssertEqual(progress.entries.first?.change, Decimal(string: "-0.4"), "Against the weigh-in before it")

        let change = try XCTUnwrap(progress.change)
        XCTAssertEqual(change.value, Decimal(string: "-1.6"), "Against the weigh-in nearest four weeks back")
        XCTAssertEqual(change.weeks, 3)
    }

    // MARK: - Offline, and the queue that survives a relaunch

    func testAQueuedWeighInSurvivesBeingWrittenDownAndReadBack() throws {
        let entry = WeighIn.entry(weightKg: 83.4, on: date(24), in: [], id: "q", calendar: calendar)
        let change = StateChange(.upsertMetric(WeighIn.json(entry)), createdAt: date(24))

        let data = try JSONEncoder().encode([change])
        let restored = try JSONDecoder().decode([StateChange].self, from: data)
        guard case .upsertMetric(let json)? = restored.first?.kind else {
            return XCTFail("\(String(describing: restored.first?.kind))")
        }
        XCTAssertEqual(json["id"]?.stringValue, "q")
        XCTAssertEqual(json["weight"]?.decimalValue, Decimal(string: "83.4"))
        XCTAssertEqual(SyncQueue.rows(from: restored).first?.title, "Weging")
    }

    func testTheWeightIsWrittenAsATenthAndNotAsABinaryApproximation() {
        let entry = WeighIn.entry(weightKg: Decimal(string: "83.4")!, on: date(24), in: [], id: "r", calendar: calendar)
        XCTAssertEqual(WeighIn.json(entry)["weight"]?.decimalValue, Decimal(string: "83.4"))
    }
}
