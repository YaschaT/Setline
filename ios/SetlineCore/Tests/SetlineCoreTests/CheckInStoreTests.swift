import XCTest
@testable import SetlineCore

/// Progress photos stay on the phone, and on the phone they belong to one
/// account.
///
/// Before, the app kept one list of photos for the whole phone, so an account
/// that signed in after another saw the other's photos. Each account now keeps
/// its own folder, by user id; the old list moves, once, to the account it can
/// be shown to belong to, and is otherwise left exactly where it was.
final class CheckInStoreTests: XCTestCase {

    private var container: URL!

    override func setUpWithError() throws {
        container = FileManager.default.temporaryDirectory
            .appendingPathComponent("CheckInStoreTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: container, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: container)
    }

    private let a = PhotoOwner.account("2f1c9a4e-0b7d-4c55-9a51-0d6f3e8b1a72")
    private let b = PhotoOwner.account("8e3d0c61-5a29-4f0b-b4a7-6c2e9d1f0e35")

    private func store(_ owner: PhotoOwner, adopts: Bool = true) -> CheckInStore {
        CheckInStore(owner: owner, mayAdoptUnownedPhotos: adopts, container: container)
    }

    private var root: URL { container.appendingPathComponent("CheckIns", isDirectory: true) }
    private var unownedIndex: URL { root.appendingPathComponent("check-ins.json") }
    private var claim: URL { root.appendingPathComponent("unowned-claimed-by.txt") }

    /// The phone-wide list as the app wrote it before photos had owners.
    private let unowned: [(record: CheckIn, bytes: Data)] = [
        (CheckIn(id: "checkin-1751699400000", date: "2026-07-05", fileName: "checkin-1751699400000.jpg"), Data("july".utf8)),
        (CheckIn(id: "checkin-1757145600000", date: "2026-09-06", fileName: "checkin-1757145600000.jpg"), Data("september".utf8)),
        (CheckIn(id: "checkin-1759305600000", date: "2026-10-01", fileName: "checkin-1759305600000.jpg"), Data("october".utf8)),
    ]

    private var unownedRecords: [CheckIn] { unowned.map(\.record) }

    private func seedUnownedPhotos() throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        for item in unowned {
            try item.bytes.write(to: root.appendingPathComponent(item.record.fileName))
        }
        try JSONEncoder().encode(unownedRecords).write(to: unownedIndex)
    }

    private func exists(_ url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path)
    }

    private func unownedLeftIntact() -> Bool {
        exists(unownedIndex) && unowned.allSatisfy { exists(root.appendingPathComponent($0.record.fileName)) }
    }

    // MARK: - The steps, in order

    /// 1. The photos kept for the whole phone move to the account that owns
    ///    them: the same records, dates and pictures — and gone from where
    ///    they were.
    func testUnownedPhotosMoveToTheAccountThatOwnsThem() async throws {
        try seedUnownedPhotos()
        let photos = store(a)

        let outcome = await photos.migrateUnownedPhotos()
        let loaded = await photos.load()

        XCTAssertEqual(outcome, .moved(3))
        XCTAssertEqual(loaded, unownedRecords, "same ids, dates and file names, in the same order")
        for item in unowned {
            XCTAssertEqual(try Data(contentsOf: photos.url(for: item.record)), item.bytes, "the picture itself, in full")
            XCTAssertFalse(exists(root.appendingPathComponent(item.record.fileName)), "the original goes once copied")
        }
        XCTAssertFalse(exists(unownedIndex))
        XCTAssertFalse(exists(claim))
        XCTAssertTrue(photos.url(for: unownedRecords[0]).path.contains("/CheckIns/accounts/\(a.id)/"))
    }

    /// 2. A relaunch is a new store for the same account: the photos are there.
    func testTheyAreStillThereAfterARelaunch() async throws {
        try seedUnownedPhotos()
        _ = await store(a).load()

        let relaunched = await store(a).load()

        XCTAssertEqual(relaunched, unownedRecords)
    }

    /// 3–6. Signing out deletes nothing; another account sees none of A's
    ///      photos and keeps its own; back on A, A's photos return without B's.
    func testEachAccountSeesOnlyItsOwnPhotos() async throws {
        try seedUnownedPhotos()
        _ = await store(a).load()

        // Signing out drops the store and nothing else. B may even be allowed
        // to take unowned photos: there are none left to take.
        let second = store(b)
        let seenByB = await second.load()
        XCTAssertEqual(seenByB, [], "B sees none of A's photos")

        let added = try await second.add(Data("b".utf8), on: Date(timeIntervalSince1970: 1_759_600_000))
        let afterAdding = await second.load()
        XCTAssertEqual(added.count, 1)
        XCTAssertEqual(afterAdding.count, 1, "B's photo is B's")
        XCTAssertTrue(second.url(for: added[0]).path.contains("/CheckIns/accounts/\(b.id)/"))

        let backOnA = await store(a).load()
        XCTAssertEqual(backOnA, unownedRecords, "A's photos return")
        XCTAssertFalse(backOnA.contains { $0.id == added[0].id }, "and B's photo is not among them")
        XCTAssertTrue(exists(second.url(for: added[0])), "B's photo is still on the phone")
    }

    /// 7. Running the move again — after it finished, or after it was cut
    ///    short before the originals were removed — duplicates nothing.
    func testRunningTheMoveAgainDuplicatesNothing() async throws {
        try seedUnownedPhotos()
        let photos = store(a)
        let first = await photos.migrateUnownedPhotos()
        let second = await photos.migrateUnownedPhotos()
        XCTAssertEqual(first, .moved(3))
        XCTAssertEqual(second, .none)

        // Cut short after the copy: the originals and the claim are still there.
        try seedUnownedPhotos()
        try Data(a.folder.utf8).write(to: claim)

        let resumed = await photos.migrateUnownedPhotos()
        let loaded = await photos.load()
        XCTAssertEqual(resumed, .moved(3))
        XCTAssertEqual(loaded, unownedRecords, "no record twice")
        XCTAssertFalse(exists(unownedIndex))
    }

    // MARK: - Ownership that cannot be shown

    func testWithoutShownOwnershipNothingMoves() async throws {
        try seedUnownedPhotos()
        let photos = store(a, adopts: false)

        let outcome = await photos.migrateUnownedPhotos()
        let loaded = await photos.load()

        XCTAssertEqual(outcome, .leftInPlace)
        XCTAssertEqual(loaded, [], "not shown to an account that cannot be shown to own them")
        XCTAssertTrue(unownedLeftIntact(), "and left exactly where they were")
        XCTAssertFalse(exists(claim), "nor claimed")
    }

    /// A move that was begun is finished by the account that began it, and
    /// by no other — whatever that other may otherwise take.
    func testAMoveBegunByOneAccountIsNeverFinishedByAnother() async throws {
        try seedUnownedPhotos()
        try Data(a.folder.utf8).write(to: claim)

        let byB = await store(b).migrateUnownedPhotos()
        let seenByB = await store(b).load()
        XCTAssertEqual(byB, .claimedByAnother)
        XCTAssertEqual(seenByB, [])
        XCTAssertTrue(unownedLeftIntact())

        // A's claim stands even where A could no longer be shown to own them:
        // that was decided before anyone else used the phone.
        let byA = await store(a, adopts: false).migrateUnownedPhotos()
        XCTAssertEqual(byA, .moved(3))
    }

    /// A demo account never takes them, never sees them, and keeps its own
    /// photos apart from any real account's — even one with the same id.
    func testADemoAccountNeverTakesOrSeesThem() async throws {
        try seedUnownedPhotos()
        let demo = store(.demo(a.id), adopts: true)

        let outcome = await demo.migrateUnownedPhotos()
        let seen = await demo.load()
        XCTAssertEqual(outcome, .leftInPlace)
        XCTAssertEqual(seen, [])
        XCTAssertTrue(unownedLeftIntact())

        // Not even when the claim names its folder.
        try Data(PhotoOwner.demo(a.id).folder.utf8).write(to: claim)
        let named = await demo.migrateUnownedPhotos()
        XCTAssertEqual(named, .leftInPlace)
        XCTAssertTrue(unownedLeftIntact())

        try FileManager.default.removeItem(at: claim)
        _ = await store(a).load()
        _ = try await demo.add(Data("demo".utf8), on: Date())
        let demoCount = await demo.load().count
        let accountCount = await store(a).load().count
        XCTAssertEqual(demoCount, 1)
        XCTAssertEqual(accountCount, 3, "the demo's photo is not the account's")
        XCTAssertNotEqual(PhotoOwner.demo(a.id).folder, a.folder)
    }

    /// Nothing is removed before the copy is confirmed. Here the account's
    /// folder cannot be made — a file stands in its place — so nothing moves
    /// and nothing goes; once it can, the move finishes.
    func testNothingIsRemovedBeforeTheCopyIsConfirmed() async throws {
        try seedUnownedPhotos()
        let accounts = root.appendingPathComponent("accounts", isDirectory: true)
        try FileManager.default.createDirectory(at: accounts, withIntermediateDirectories: true)
        let blocker = accounts.appendingPathComponent(a.id)
        try Data("not a folder".utf8).write(to: blocker)
        let photos = store(a)

        let blocked = await photos.migrateUnownedPhotos()
        XCTAssertEqual(blocked, .notYet)
        XCTAssertTrue(unownedLeftIntact(), "every original still there")
        XCTAssertTrue(exists(claim), "the claim stays, so only A can finish")

        try FileManager.default.removeItem(at: blocker)
        let finished = await photos.migrateUnownedPhotos()
        let loaded = await photos.load()
        XCTAssertEqual(finished, .moved(3))
        XCTAssertEqual(loaded, unownedRecords)
    }

    /// The weigh-in beside each photo, and what a comparison says, are what
    /// they were: both are read from the photo's date, which is kept.
    func testWeighInsAndComparisonsAreUnchangedByTheMove() async throws {
        let metrics = [
            BodyMetric(id: "1", date: "2026-09-06", weight: 81),
            BodyMetric(id: "2", date: "2026-10-01", weight: 82.4),
        ]
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(secondsFromGMT: 0)!
        let before = CheckInGallery.make(unownedRecords, metrics: metrics, calendar: utc)

        try seedUnownedPhotos()
        let moved = await store(a).load()
        let after = CheckInGallery.make(moved, metrics: metrics, calendar: utc)

        let (september, october) = (unownedRecords[1].id, unownedRecords[2].id)
        XCTAssertEqual(after, before)
        XCTAssertEqual(after.comparison(september, october, calendar: utc), before.comparison(september, october, calendar: utc))
        XCTAssertEqual(after.comparison(september, october, calendar: utc)?.span, .weeks(4))
        XCTAssertEqual(after.comparison(september, october, calendar: utc)?.change, Decimal(82.4) - Decimal(81))
    }

    // MARK: - Who may take them

    func testOnlyTheOneRealAccountOnThePhoneMayTakeThem() {
        XCTAssertTrue(a.mayAdoptUnownedPhotos(email: "a@setline.be", accountsOnDevice: []))
        XCTAssertTrue(a.mayAdoptUnownedPhotos(email: "a@setline.be", accountsOnDevice: ["A@setline.be"]))
        XCTAssertTrue(
            a.mayAdoptUnownedPhotos(
                email: "a@setline.be",
                accountsOnDevice: ["a@setline.be", "demo@setline.be", "demo-b@setline.be"]
            ),
            "demo accounts do not count"
        )
        XCTAssertFalse(
            a.mayAdoptUnownedPhotos(email: "a@setline.be", accountsOnDevice: ["a@setline.be", "b@gmail.com"]),
            "another real account has used this phone: nobody can be shown to own them"
        )
        XCTAssertFalse(PhotoOwner.demo(a.id).mayAdoptUnownedPhotos(email: "demo@setline.be", accountsOnDevice: []))
    }

    func testAnIDCannotNameAFolderOutsideItsOwn() {
        XCTAssertEqual(a.folder, "accounts/\(a.id)")
        let odd = PhotoOwner.account("../../Library/Caches")
        XCTAssertTrue(odd.folder.hasPrefix("accounts/h-"))
        XCTAssertFalse(odd.folder.dropFirst("accounts/".count).contains("/"))
        XCTAssertFalse(odd.folder.contains(".."))
        XCTAssertNotEqual(PhotoOwner.account("").folder, "accounts/")
    }
}
