import ImageIO
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
        XCTAssertEqual(gallery.span, .weeks(8))
    }

    func testWithoutAWeighInOnBothDaysThereIsNoDifferenceToState() {
        let gallery = CheckInGallery.make(
            [checkIn("a", "2026-07-13"), checkIn("b", "2026-09-06")],
            metrics: [metric("2026-09-06", 82.4)],
            calendar: calendar
        )
        XCTAssertNil(gallery.change)
        XCTAssertEqual(gallery.span, .weeks(8), "the span is still known")
    }

    func testOneCheckInComparesWithNothing() {
        let gallery = CheckInGallery.make([checkIn("a", "2026-07-13")], metrics: [], calendar: calendar)
        XCTAssertEqual(gallery.first?.checkIn.id, "a")
        XCTAssertNil(gallery.span)
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

    func testHowFarApartIsNeverMoreTimeThanThereWas() {
        func span(_ to: String) -> CheckInGallery.Span? {
            CheckInGallery.make(
                [checkIn("a", "2026-07-13"), checkIn("b", to)], metrics: [], calendar: calendar
            ).span
        }
        XCTAssertEqual(span("2026-07-13"), .sameDay, "two pictures of one day")
        XCTAssertEqual(span("2026-07-14"), .days(1), "a day apart is a day, not a week")
        XCTAssertEqual(span("2026-07-19"), .days(6))
        XCTAssertEqual(span("2026-07-20"), .weeks(1))
        XCTAssertEqual(span("2026-07-27"), .weeks(2))
        XCTAssertEqual(span("2026-09-06"), .weeks(8), "55 days")
    }

    // MARK: Two of them, chosen

    private var three: CheckInGallery {
        CheckInGallery.make(
            [checkIn("a", "2026-06-01"), checkIn("b", "2026-07-13"), checkIn("c", "2026-09-06")],
            metrics: [metric("2026-06-01", 86.8), metric("2026-07-13", 85.5), metric("2026-09-06", 84.2)],
            calendar: calendar
        )
    }

    func testTheComparisonIsFirstAgainstLatestUntilAnotherPairIsChosen() {
        let comparison = three.comparison(calendar: calendar)
        XCTAssertEqual(comparison?.before.checkIn.id, "a")
        XCTAssertEqual(comparison?.after.checkIn.id, "c")
        XCTAssertEqual(comparison?.span, .weeks(14))
        XCTAssertEqual(comparison?.change, Decimal(84.2) - Decimal(86.8))
    }

    func testAChosenPairIsOrderedByDateNotByTheOrderItWasPickedIn() {
        let comparison = three.comparison("c", "b", calendar: calendar)
        XCTAssertEqual(comparison?.before.checkIn.id, "b")
        XCTAssertEqual(comparison?.after.checkIn.id, "c")
        XCTAssertEqual(comparison?.span, .weeks(8))
        XCTAssertEqual(comparison?.change, Decimal(84.2) - Decimal(85.5))
    }

    func testAChoiceThatNoLongerExistsFallsBackToFirstAgainstLatest() {
        let comparison = three.comparison("b", "removed", calendar: calendar)
        XCTAssertEqual(comparison?.before.checkIn.id, "a")
        XCTAssertEqual(comparison?.after.checkIn.id, "c")
    }

    func testTheSamePhotoTwiceIsNotAComparison() {
        let comparison = three.comparison("b", "b", calendar: calendar)
        XCTAssertEqual(comparison?.before.checkIn.id, "a")
        XCTAssertEqual(comparison?.after.checkIn.id, "c")
    }

    func testOneCheckInHasNothingToCompareWith() {
        let gallery = CheckInGallery.make([checkIn("a", "2026-06-01")], metrics: [], calendar: calendar)
        XCTAssertNil(gallery.comparison(calendar: calendar))
    }

    // MARK: - The player

    private var year: CheckInGallery {
        CheckInGallery.make(
            [
                checkIn("jan", "2025-10-01"), checkIn("mei", "2026-05-01"), checkIn("jul", "2026-07-15"),
                checkIn("sep", "2026-09-10"), checkIn("okt", "2026-10-01"),
            ],
            metrics: [],
            calendar: calendar
        )
    }

    func testThePlayerShowsEveryPictureOldestFirstCountedFromTheFirst() {
        let frames = year.frames(in: .all, calendar: calendar)
        XCTAssertEqual(frames.map(\.shown.checkIn.id), ["jan", "mei", "jul", "sep", "okt"])
        XCTAssertEqual(frames.first?.since, .sameDay)
        XCTAssertEqual(frames.last?.since, .weeks(52))
    }

    func testAPeriodCountsBackFromTheLatestPictureAndStartsItsOwnCount() {
        let frames = year.frames(in: .quarter, calendar: calendar)
        XCTAssertEqual(frames.map(\.shown.checkIn.id), ["jul", "sep", "okt"])
        XCTAssertEqual(frames.first?.since, .sameDay)
        XCTAssertEqual(frames.last?.since, .weeks(11))
    }

    func testOnlyPeriodsThatShowSomethingNewAreOffered() {
        // A year back reaches the very first picture, so it would only repeat
        // "every picture"; a month back holds two and is offered.
        XCTAssertEqual(year.periods(calendar: calendar), [.all, .halfYear, .quarter, .month])
    }

    func testAPeriodWithOnePictureIsNotOffered() {
        let gallery = CheckInGallery.make(
            [checkIn("a", "2026-01-01"), checkIn("b", "2026-10-01")],
            metrics: [],
            calendar: calendar
        )
        XCTAssertEqual(gallery.periods(calendar: calendar), [.all])
        XCTAssertEqual(CheckInGallery.make([checkIn("a", "2026-01-01")], metrics: [], calendar: calendar)
            .periods(calendar: calendar), [])
    }

    func testACheckInSurvivesBeingStored() throws {
        let stored = [checkIn("a", "2026-07-13"), checkIn("b", "2026-09-06")]
        let data = try JSONEncoder().encode(stored)
        XCTAssertEqual(try JSONDecoder().decode([CheckIn].self, from: data), stored)
    }

    // MARK: When the picture was taken

    /// A small JPEG carrying the camera's own record, as a library photo does.
    private func picture(exif: [CFString: Any]? = nil) throws -> Data {
        let context = try XCTUnwrap(CGContext(
            data: nil, width: 4, height: 4, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        ))
        context.setFillColor(CGColor(red: 0.2, green: 0.4, blue: 0.6, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        let image = try XCTUnwrap(context.makeImage())
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, "public.jpeg" as CFString, 1, nil))
        var properties: [CFString: Any] = [:]
        if let exif { properties[kCGImagePropertyExifDictionary] = exif }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    private func day(_ key: String) -> Date {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))!
    }

    func testACheckInIsDatedByWhenItsPictureWasTaken() throws {
        // Picked from the library in October, taken in July: a July check-in.
        let data = try picture(exif: [kCGImagePropertyExifDateTimeOriginal: "2026:07:05 08:10:00"])
        let taken = try XCTUnwrap(PhotoDate.taken(in: data, calendar: calendar, now: day("2026-10-04")))
        XCTAssertEqual(Schedule.dateKey(taken, calendar: calendar), "2026-07-05")
    }

    func testTheMomentItWasDigitisedServesWhenTheOriginalIsMissing() throws {
        let data = try picture(exif: [kCGImagePropertyExifDateTimeDigitized: "2026:09:01 07:30:00"])
        let taken = try XCTUnwrap(PhotoDate.taken(in: data, calendar: calendar, now: day("2026-10-04")))
        XCTAssertEqual(Schedule.dateKey(taken, calendar: calendar), "2026-09-01")
    }

    func testAPictureThatSaysNothingIsNotGivenADate() throws {
        XCTAssertNil(PhotoDate.taken(in: try picture(), calendar: calendar, now: day("2026-10-04")))
        XCTAssertNil(PhotoDate.taken(in: Data("not a picture".utf8), calendar: calendar))
    }

    func testACameraClockAheadOfTodayIsNotTrusted() throws {
        let data = try picture(exif: [kCGImagePropertyExifDateTimeOriginal: "2027:01:01 09:00:00"])
        XCTAssertNil(PhotoDate.taken(in: data, calendar: calendar, now: day("2026-10-04")))
        let today = try picture(exif: [kCGImagePropertyExifDateTimeOriginal: "2026:10:04 07:00:00"])
        XCTAssertNotNil(PhotoDate.taken(in: today, calendar: calendar, now: day("2026-10-04")), "earlier today is fine")
    }
}
