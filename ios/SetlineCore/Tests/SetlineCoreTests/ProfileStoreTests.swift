import XCTest
@testable import SetlineCore

/// The name and avatar stay on the phone, and on the phone each account keeps
/// its own — the same rule as the progress photos.
final class ProfileStoreTests: XCTestCase {

    private var container: URL!

    override func setUpWithError() throws {
        container = FileManager.default.temporaryDirectory
            .appendingPathComponent("ProfileStoreTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: container, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: container)
    }

    private let a = PhotoOwner.account("2f1c9a4e-0b7d-4c55-9a51-0d6f3e8b1a72")
    private let b = PhotoOwner.account("8e3d0c61-5a29-4f0b-b4a7-6c2e9d1f0e35")

    private func store(_ owner: PhotoOwner) -> ProfileStore {
        ProfileStore(owner: owner, container: container)
    }

    func testEachAccountKeepsItsOwnNameAndPhoto() throws {
        try store(a).setName("Yascha Torfs")
        try store(a).setPhoto(Data("a".utf8))

        XCTAssertEqual(store(a).name(), "Yascha Torfs")
        XCTAssertEqual(store(a).photo(), Data("a".utf8))
        XCTAssertNil(store(b).name())
        XCTAssertNil(store(b).photo())
        XCTAssertNil(store(.demo(a.id)).name(), "a demo account never sees a real account's profile")
    }

    func testAnEmptyNameRemovesTheName() throws {
        try store(a).setName("Yascha")
        try store(a).setName("   \n ")
        XCTAssertNil(store(a).name())
    }

    func testANameIsKeptOnOneTrimmedLine() throws {
        try store(a).setName("  Yascha\nTorfs  ")
        XCTAssertEqual(store(a).name(), "Yascha Torfs")
    }

    func testRemovingThePhotoKeepsTheName() throws {
        try store(a).setName("Yascha")
        try store(a).setPhoto(Data("a".utf8))
        try store(a).removePhoto()
        try store(a).removePhoto()

        XCTAssertNil(store(a).photo())
        XCTAssertEqual(store(a).name(), "Yascha")
    }

    func testTheGreetingUsesTheFirstName() {
        XCTAssertEqual(ProfileStore.firstName(of: "Yascha Torfs"), "Yascha")
        XCTAssertEqual(ProfileStore.firstName(of: " Yascha "), "Yascha")
        XCTAssertEqual(ProfileStore.firstName(of: "yascha torfs"), "Yascha")
        XCTAssertEqual(ProfileStore.firstName(of: "élise"), "Élise")
        XCTAssertNil(ProfileStore.firstName(of: "  "))
        XCTAssertNil(ProfileStore.firstName(of: nil))
    }

    func testTheInitialComesFromTheNameElseTheAddress() {
        XCTAssertEqual(ProfileStore.initial(name: "yascha", email: "demo@setline.be"), "Y")
        XCTAssertEqual(ProfileStore.initial(name: nil, email: "torfsyascha@gmail.com"), "T")
        XCTAssertEqual(ProfileStore.initial(name: " ", email: "1demo@setline.be"), "D")
        XCTAssertNil(ProfileStore.initial(name: nil, email: nil))
    }
}
