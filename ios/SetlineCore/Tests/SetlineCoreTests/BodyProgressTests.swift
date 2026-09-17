import XCTest
@testable import SetlineCore

/// Segment Lichaam reads the weigh-ins the account already holds, and nothing
/// it does not.
final class BodyProgressTests: XCTestCase {

    private let calendar = Calendar(identifier: .gregorian)

    // MARK: Weigh-ins


    private func metric(_ id: String, _ date: String, _ weight: Double) -> BodyMetric {
        BodyMetric(id: id, date: date, weight: weight, waist: 84)
    }

    func testTheWeightSeriesReadsNewestFirstWithItsOwnDeltas() throws {
        let progress = BodyProgress.make(metrics: [
            metric("m1", "2026-08-10", 79.8),
            metric("m3", "2026-09-06", 82.4),
            metric("m2", "2026-08-24", 81.0),
        ], calendar: calendar)

        XCTAssertEqual(progress.entries.map(\.id), ["m3", "m2", "m1"])
        XCTAssertEqual(progress.latest?.weightKg, 82.4)
        XCTAssertEqual(progress.latest?.change, 1.4, "against the weigh-in before it")
        XCTAssertNil(progress.points.first?.change, "the first weigh-in has nothing to compare to")
        XCTAssertEqual(progress.points.map(\.id), ["m1", "m2", "m3"], "the chart runs oldest first")
    }

    func testTheChangeUsesTheFourWeekWindowOrTheSpanItHas() throws {
        let fourWeeks = BodyProgress.make(metrics: [
            metric("m1", "2026-08-09", 82.1),
            metric("m2", "2026-08-23", 82.0),
            metric("m3", "2026-09-06", 82.4),
        ], calendar: calendar)
        let change = try XCTUnwrap(fourWeeks.change)
        XCTAssertEqual(change.value, 0.3)
        XCTAssertEqual(change.weeks, 4)

        let young = BodyProgress.make(metrics: [
            metric("m1", "2026-08-30", 81.0),
            metric("m2", "2026-09-06", 82.4),
        ], calendar: calendar)
        XCTAssertEqual(young.change?.weeks, 1, "a week-old series says one week")
    }

    func testAWeighInWithoutAUsableWeightOrDateIsLeftOut() {
        let progress = BodyProgress.make(metrics: [
            metric("bad-date", "niet-een-datum", 80),
            metric("no-weight", "2026-09-01", 0),
            metric("good", "2026-09-06", 82.4),
        ], calendar: calendar)

        XCTAssertEqual(progress.entries.map(\.id), ["good"])
        XCTAssertNil(progress.change, "one weigh-in is not a trend")
    }

    func testAGapInTheSeriesDoesNotStretchTheWindow() throws {
        // Weighed eight weeks ago, then four weeks ago, then now: the change
        // is stated against four weeks, not against the oldest reading.
        let progress = BodyProgress.make(metrics: [
            metric("m1", "2026-07-12", 79.8),
            metric("m2", "2026-08-09", 81.0),
            metric("m3", "2026-09-06", 82.4),
        ], calendar: calendar)

        let change = try XCTUnwrap(progress.change)
        XCTAssertEqual(change.weeks, 4)
        XCTAssertEqual(change.value, 1.4)
    }
}
