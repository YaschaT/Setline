import XCTest
@testable import SetlineCore

final class CheckInTests: XCTestCase {

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func checkIn(_ id: String, _ date: String) -> CheckIn {
        CheckIn(id: id, date: date, fileName: "\(id).jpg")
    }

    private func metric(_ date: String, _ weight: Double) -> BodyMetric {
        BodyMetric(id: date, date: date, weight: weight)
    }

    func testTheStripReadsOldestFirstWhateverOrderTheyWereStoredIn() {
        let gallery = CheckInGallery.make(
            [checkIn("b", "2026-09-06"), checkIn("a", "2026-07-13")],
            metrics: [],
            calendar: calendar
        )
        XCTAssertEqual(gallery.all.map(\.checkIn.id), ["a", "b"])
        XCTAssertEqual(gallery.first?.checkIn.id, "a")
        XCTAssertEqual(gallery.latest?.checkIn.id, "b")
    }

    func testTheWeightBesideACheckInIsTheWeighInFromThatDay() {
        let gallery = CheckInGallery.make(
            [checkIn("a", "2026-07-13"), checkIn("b", "2026-09-06")],
            metrics: [metric("2026-07-13", 79.8), metric("2026-09-06", 82.4)],
            calendar: calendar
        )
        XCTAssertEqual(gallery.first?.weightKg, Decimal(79.8))
        XCTAssertEqual(gallery.change, Decimal(82.4) - Decimal(79.8))
        XCTAssertEqual(gallery.weeks, 8)
    }

    func testWithoutAWeighInOnBothDaysThereIsNoDifferenceToState() {
        let gallery = CheckInGallery.make(
            [checkIn("a", "2026-07-13"), checkIn("b", "2026-09-06")],
            metrics: [metric("2026-09-06", 82.4)],
            calendar: calendar
        )
        XCTAssertNil(gallery.change)
        XCTAssertEqual(gallery.weeks, 8, "the span is still known")
    }

    func testOneCheckInComparesWithNothing() {
        let gallery = CheckInGallery.make([checkIn("a", "2026-07-13")], metrics: [], calendar: calendar)
        XCTAssertEqual(gallery.first?.checkIn.id, "a")
        XCTAssertNil(gallery.weeks)
        XCTAssertNil(gallery.change)
    }

    func testNoCheckInsIsNotAnError() {
        let gallery = CheckInGallery.make([], metrics: [], calendar: calendar)
        XCTAssertEqual(gallery, .empty)
    }

    func testACheckInWithAnUnreadableDateIsSkipped() {
        let gallery = CheckInGallery.make([checkIn("a", "gisteren")], metrics: [], calendar: calendar)
        XCTAssertTrue(gallery.all.isEmpty)
    }

    func testDaysApartAreReportedInWholeWeeks() {
        func weeks(_ to: String) -> Int? {
            CheckInGallery.make(
                [checkIn("a", "2026-07-13"), checkIn("b", to)], metrics: [], calendar: calendar
            ).weeks
        }
        XCTAssertEqual(weeks("2026-07-14"), 1, "a day apart is still a week, never zero")
        XCTAssertEqual(weeks("2026-07-27"), 2)
        XCTAssertEqual(weeks("2026-09-06"), 8)
    }

    func testACheckInSurvivesBeingStored() throws {
        let stored = [checkIn("a", "2026-07-13"), checkIn("b", "2026-09-06")]
        let data = try JSONEncoder().encode(stored)
        XCTAssertEqual(try JSONDecoder().decode([CheckIn].self, from: data), stored)
    }
}
