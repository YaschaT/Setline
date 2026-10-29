// Port of ios/SetlineCore/Tests/SetlineCoreTests/CheckInTests.swift.
//
// The Swift tests read dates on a UTC calendar; the web reads the local
// calendar (the run is pinned to Europe/Brussels). Every date here is a day
// key or a wall-clock time, so the same days and spans come out.
import { test } from "node:test";
import { BodyMetric } from "../../src/core/Domain/Model";
import { Schedule } from "../../src/core/Engine/Schedule";
import { CheckIn, CheckInGallery, CheckInGallery_Span, type CheckInGallery_Period } from "../../src/core/Photos/CheckIn";
import { PhotoDate } from "../../src/core/Photos/PhotoDate";
import { dec } from "../../src/core/Support/swift";
import { assertEqual, assertNil, assertNotNil, assertTrue } from "../helpers";

function checkIn(id: string, date: string): CheckIn {
  return CheckIn.make({ id, date, fileName: `${id}.jpg` });
}

function metric(date: string, weight: number): BodyMetric {
  return BodyMetric.make({ id: date, date, weight });
}

test("testTheStripReadsOldestFirstWhateverOrderTheyWereStoredIn", () => {
  const gallery = CheckInGallery.makeCheckIns([checkIn("b", "2026-09-06"), checkIn("a", "2026-07-13")], { metrics: [] });
  assertEqual(gallery.all.map((s) => s.checkIn.id), ["a", "b"]);
  assertEqual(gallery.first?.checkIn.id, "a");
  assertEqual(gallery.latest?.checkIn.id, "b");
});

test("testTheWeightBesideACheckInIsTheWeighInFromThatDay", () => {
  const gallery = CheckInGallery.makeCheckIns([checkIn("a", "2026-07-13"), checkIn("b", "2026-09-06")], {
    metrics: [metric("2026-07-13", 79.8), metric("2026-09-06", 82.4)],
  });
  assertEqual(gallery.first?.weightKg, 79.8);
  assertEqual(gallery.change, dec(82.4 - 79.8));
  assertEqual(gallery.span, CheckInGallery_Span.weeks(8));
});

test("testWithoutAWeighInOnBothDaysThereIsNoDifferenceToState", () => {
  const gallery = CheckInGallery.makeCheckIns([checkIn("a", "2026-07-13"), checkIn("b", "2026-09-06")], {
    metrics: [metric("2026-09-06", 82.4)],
  });
  assertNil(gallery.change);
  assertEqual(gallery.span, CheckInGallery_Span.weeks(8), "the span is still known");
});

test("testOneCheckInComparesWithNothing", () => {
  const gallery = CheckInGallery.makeCheckIns([checkIn("a", "2026-07-13")], { metrics: [] });
  assertEqual(gallery.first?.checkIn.id, "a");
  assertNil(gallery.span);
  assertNil(gallery.change);
});

test("testNoCheckInsIsNotAnError", () => {
  const gallery = CheckInGallery.makeCheckIns([], { metrics: [] });
  assertEqual(gallery, CheckInGallery.empty);
});

test("testACheckInWithAnUnreadableDateIsSkipped", () => {
  const gallery = CheckInGallery.makeCheckIns([checkIn("a", "gisteren")], { metrics: [] });
  assertTrue(gallery.all.length === 0);
});

test("testHowFarApartIsNeverMoreTimeThanThereWas", () => {
  const span = (to: string) => CheckInGallery.makeCheckIns([checkIn("a", "2026-07-13"), checkIn("b", to)], { metrics: [] }).span;
  assertEqual(span("2026-07-13"), CheckInGallery_Span.sameDay, "two pictures of one day");
  assertEqual(span("2026-07-14"), CheckInGallery_Span.days(1), "a day apart is a day, not a week");
  assertEqual(span("2026-07-19"), CheckInGallery_Span.days(6));
  assertEqual(span("2026-07-20"), CheckInGallery_Span.weeks(1));
  assertEqual(span("2026-07-27"), CheckInGallery_Span.weeks(2));
  assertEqual(span("2026-09-06"), CheckInGallery_Span.weeks(8), "55 days");
});

// MARK: Two of them, chosen

function three(): CheckInGallery {
  return CheckInGallery.makeCheckIns([checkIn("a", "2026-06-01"), checkIn("b", "2026-07-13"), checkIn("c", "2026-09-06")], {
    metrics: [metric("2026-06-01", 86.8), metric("2026-07-13", 85.5), metric("2026-09-06", 84.2)],
  });
}

test("testTheComparisonIsFirstAgainstLatestUntilAnotherPairIsChosen", () => {
  const comparison = CheckInGallery.comparison(three());
  assertEqual(comparison?.before.checkIn.id, "a");
  assertEqual(comparison?.after.checkIn.id, "c");
  assertEqual(comparison?.span, CheckInGallery_Span.weeks(14));
  assertEqual(comparison?.change, dec(84.2 - 86.8));
});

test("testAChosenPairIsOrderedByDateNotByTheOrderItWasPickedIn", () => {
  const comparison = CheckInGallery.comparison(three(), "c", "b");
  assertEqual(comparison?.before.checkIn.id, "b");
  assertEqual(comparison?.after.checkIn.id, "c");
  assertEqual(comparison?.span, CheckInGallery_Span.weeks(8));
  assertEqual(comparison?.change, dec(84.2 - 85.5));
});

test("testAChoiceThatNoLongerExistsFallsBackToFirstAgainstLatest", () => {
  const comparison = CheckInGallery.comparison(three(), "b", "removed");
  assertEqual(comparison?.before.checkIn.id, "a");
  assertEqual(comparison?.after.checkIn.id, "c");
});

test("testTheSamePhotoTwiceIsNotAComparison", () => {
  const comparison = CheckInGallery.comparison(three(), "b", "b");
  assertEqual(comparison?.before.checkIn.id, "a");
  assertEqual(comparison?.after.checkIn.id, "c");
});

test("testOneCheckInHasNothingToCompareWith", () => {
  const gallery = CheckInGallery.makeCheckIns([checkIn("a", "2026-06-01")], { metrics: [] });
  assertNil(CheckInGallery.comparison(gallery));
});

// MARK: - The player

function year(): CheckInGallery {
  return CheckInGallery.makeCheckIns(
    [
      checkIn("jan", "2025-10-01"), checkIn("mei", "2026-05-01"), checkIn("jul", "2026-07-15"),
      checkIn("sep", "2026-09-10"), checkIn("okt", "2026-10-01"),
    ],
    { metrics: [] },
  );
}

test("testThePlayerShowsEveryPictureOldestFirstCountedFromTheFirst", () => {
  const frames = CheckInGallery.frames(year(), { in: "all" });
  assertEqual(frames.map((f) => f.shown.checkIn.id), ["jan", "mei", "jul", "sep", "okt"]);
  assertEqual(frames[0]?.since, CheckInGallery_Span.sameDay);
  assertEqual(frames[frames.length - 1]?.since, CheckInGallery_Span.weeks(52));
});

test("testAPeriodCountsBackFromTheLatestPictureAndStartsItsOwnCount", () => {
  const frames = CheckInGallery.frames(year(), { in: "quarter" });
  assertEqual(frames.map((f) => f.shown.checkIn.id), ["jul", "sep", "okt"]);
  assertEqual(frames[0]?.since, CheckInGallery_Span.sameDay);
  assertEqual(frames[frames.length - 1]?.since, CheckInGallery_Span.weeks(11));
});

test("testOnlyPeriodsThatShowSomethingNewAreOffered", () => {
  // A year back reaches the very first picture, so it would only repeat
  // "every picture"; a month back holds two and is offered.
  assertEqual(CheckInGallery.periods(year()), ["all", "halfYear", "quarter", "month"] as CheckInGallery_Period[]);
});

test("testAPeriodWithOnePictureIsNotOffered", () => {
  const gallery = CheckInGallery.makeCheckIns([checkIn("a", "2026-01-01"), checkIn("b", "2026-10-01")], { metrics: [] });
  assertEqual(CheckInGallery.periods(gallery), ["all"] as CheckInGallery_Period[]);
  assertEqual(CheckInGallery.periods(CheckInGallery.makeCheckIns([checkIn("a", "2026-01-01")], { metrics: [] })), []);
});

test("testACheckInSurvivesBeingStored", () => {
  const stored = [checkIn("a", "2026-07-13"), checkIn("b", "2026-09-06")];
  const data = JSON.stringify(stored.map(CheckIn.encode));
  assertEqual((JSON.parse(data) as unknown[]).map(CheckIn.decode), stored);
});

// MARK: When the picture was taken

/**
 * A 4×4 JPEG as ImageIO writes it with no properties (made with the Swift
 * test's own `picture()`): its EXIF block names only the pixel size.
 */
const BASE_JPEG = "/9j/4AAQSkZJRgABAQAASABIAAD/4QBARXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAABKADAAQAAAABAAAABAAAAAD/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwACAgICAgIDAgIDBQMDAwUGBQUFBQYIBgYGBgYICggICAgICAoKCgoKCgoKDAwMDAwMDg4ODg4PDw8PDw8PDw8P/9sAQwECAgIEBAQHBAQHEAsJCxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ/90ABAAB/9oADAMBAAIRAxEAPwDzeiiiv6IP57P/2Q==";

/** A small JPEG carrying the camera's own record, as a library photo does. */
function picture(exif?: { DateTimeOriginal?: string; DateTimeDigitized?: string }): Uint8Array {
  const base = new Uint8Array(Buffer.from(BASE_JPEG, "base64"));
  if (exif === undefined) return base;
  // A big-endian TIFF block: IFD0 points at an EXIF IFD holding the dates.
  const tags: [number, string][] = [];
  if (exif.DateTimeOriginal !== undefined) tags.push([0x9003, exif.DateTimeOriginal]);
  if (exif.DateTimeDigitized !== undefined) tags.push([0x9004, exif.DateTimeDigitized]);
  const exifIFD = 26;
  const dataStart = exifIFD + 2 + tags.length * 12 + 4;
  const strings = tags.map(([, text]) => [...new TextEncoder().encode(text), 0]);
  const tiff = new Uint8Array(dataStart + strings.reduce((n, s) => n + s.length, 0));
  const view = new DataView(tiff.buffer);
  tiff.set([0x4d, 0x4d, 0x00, 0x2a]);
  view.setUint32(4, 8);
  view.setUint16(8, 1);
  view.setUint16(10, 0x8769); view.setUint16(12, 4); view.setUint32(14, 1); view.setUint32(18, exifIFD);
  view.setUint32(22, 0);
  view.setUint16(exifIFD, tags.length);
  let at = dataStart;
  tags.forEach(([tag], k) => {
    const entry = exifIFD + 2 + k * 12;
    view.setUint16(entry, tag); view.setUint16(entry + 2, 2); view.setUint32(entry + 4, strings[k].length); view.setUint32(entry + 8, at);
    tiff.set(strings[k], at);
    at += strings[k].length;
  });
  const payload = new Uint8Array([...new TextEncoder().encode("Exif\0\0"), ...tiff]);
  const app1 = new Uint8Array([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]);
  // Replace ImageIO's own APP1 (right after the JFIF APP0) with this one.
  const app0End = 2 + 2 + ((base[4] << 8) | base[5]);
  const oldApp1End = app0End + 2 + ((base[app0End + 2] << 8) | base[app0End + 3]);
  return new Uint8Array([...base.subarray(0, app0End), ...app1, ...base.subarray(oldApp1End)]);
}

function day(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

test("testACheckInIsDatedByWhenItsPictureWasTaken", () => {
  // Picked from the library in October, taken in July: a July check-in.
  const data = picture({ DateTimeOriginal: "2026:07:05 08:10:00" });
  const taken = PhotoDate.taken({ in: data, now: day("2026-10-04") });
  if (taken === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(Schedule.dateKey(taken), "2026-07-05");
});

test("testTheMomentItWasDigitisedServesWhenTheOriginalIsMissing", () => {
  const data = picture({ DateTimeDigitized: "2026:09:01 07:30:00" });
  const taken = PhotoDate.taken({ in: data, now: day("2026-10-04") });
  if (taken === undefined) throw new Error("XCTUnwrap failed");
  assertEqual(Schedule.dateKey(taken), "2026-09-01");
});

test("testAPictureThatSaysNothingIsNotGivenADate", () => {
  assertNil(PhotoDate.taken({ in: picture(), now: day("2026-10-04") }));
  assertNil(PhotoDate.taken({ in: new TextEncoder().encode("not a picture") }));
});

test("testACameraClockAheadOfTodayIsNotTrusted", () => {
  const data = picture({ DateTimeOriginal: "2027:01:01 09:00:00" });
  assertNil(PhotoDate.taken({ in: data, now: day("2026-10-04") }));
  const today = picture({ DateTimeOriginal: "2026:10:04 07:00:00" });
  assertNotNil(PhotoDate.taken({ in: today, now: day("2026-10-04") }), "earlier today is fine");
});
