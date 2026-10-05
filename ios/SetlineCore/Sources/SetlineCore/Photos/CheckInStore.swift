import Foundation

/// Check-in photos, kept in the app's own container and nowhere else — and
/// within it, apart for every account.
///
/// The handoff is explicit about this: "Foto's blijven op je toestel tenzij je
/// sync aanzet." There is no sync to turn on, so nothing here is ever uploaded,
/// and none of it goes into the shared account state.
///
/// Each owner has a folder (`PhotoOwner.folder`) holding its pictures and the
/// list of them. Before photos had owners, the app kept one list for the whole
/// phone at the top of the same place; `migrateUnownedPhotos()` moves it, once,
/// into the folder of the account it can be shown to belong to.
public actor CheckInStore {

    public nonisolated let owner: PhotoOwner
    /// Where every owner's folder lives, and where the unowned photos were kept.
    private let root: URL
    private let directory: URL
    private let index: URL
    private let mayAdopt: Bool

    /// Every store on the phone works in the same place on disk, so one
    /// account's two stores — after signing out and straight back in — never
    /// write over each other.
    private static let disk = NSLock()

    /// `mayAdoptUnownedPhotos` is `PhotoOwner.mayAdoptUnownedPhotos(…)`: whether
    /// this owner can be shown to own the photos kept before they had owners.
    public init(owner: PhotoOwner, mayAdoptUnownedPhotos: Bool, container: URL? = nil) {
        let base = container
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.owner = owner
        root = base.appendingPathComponent("CheckIns", isDirectory: true)
        directory = root.appendingPathComponent(owner.folder, isDirectory: true)
        index = directory.appendingPathComponent("check-ins.json")
        mayAdopt = mayAdoptUnownedPhotos
    }

    /// This owner's photos, and no one else's.
    public func load() -> [CheckIn] {
        Self.disk.withLock {
            // Usually done at sign-in already; if that was cut short, now.
            _ = migrate()
            return stored()
        }
    }

    /// Writes the picture, then the record, so a half-written check-in is a
    /// file nobody references rather than a record pointing at nothing.
    public func add(_ data: Data, on date: Date) throws -> [CheckIn] {
        try Self.disk.withLock {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

            let id = "checkin-\(Int(Date().timeIntervalSince1970 * 1000))"
            let checkIn = CheckIn(id: id, date: Schedule.dateKey(date), fileName: "\(id).jpg")
            try data.write(to: url(for: checkIn), options: .atomic)

            var all = stored()
            all.append(checkIn)
            try save(all)
            return all
        }
    }

    public func remove(_ checkIn: CheckIn) throws -> [CheckIn] {
        try Self.disk.withLock {
            let remaining = stored().filter { $0.id != checkIn.id }
            try save(remaining)
            try? FileManager.default.removeItem(at: url(for: checkIn))
            return remaining
        }
    }

    public nonisolated func url(for checkIn: CheckIn) -> URL {
        directory.appendingPathComponent(checkIn.fileName)
    }

    // MARK: - The photos kept before they had owners

    /// What `migrateUnownedPhotos()` found, and did.
    public enum UnownedPhotos: Equatable, Sendable {
        /// There are none, or they have moved already.
        case none
        /// They stay where they are: this owner cannot be shown to own them.
        case leftInPlace
        /// Another account claimed them first. They move to it, not here.
        case claimedByAnother
        /// Moved into this owner's folder.
        case moved(Int)
        /// Not moved this time, and nothing removed: the copy could not be
        /// confirmed. The next attempt starts where this one stopped.
        case notYet
    }

    /// Moves the photos the app kept for the whole phone into this account's
    /// folder — when this account may have them — and only then removes them
    /// from where they were.
    ///
    /// Safe to run any number of times. The claim is written before anything
    /// is copied, so a move that is interrupted can only ever be finished by
    /// the account that began it. Every picture is copied through a temporary
    /// file and compared, the account's list is read back from disk, and only
    /// when every photo is there in full do the originals go. A record is
    /// added to the account's list once, however often this runs. Dates are
    /// kept as they were, so each photo still sits beside its day's weigh-in.
    @discardableResult
    public func migrateUnownedPhotos() -> UnownedPhotos {
        Self.disk.withLock { migrate() }
    }

    private var unownedIndex: URL { root.appendingPathComponent("check-ins.json") }
    private var claim: URL { root.appendingPathComponent("unowned-claimed-by.txt") }

    private func migrate() -> UnownedPhotos {
        let files = FileManager.default
        guard files.fileExists(atPath: unownedIndex.path) else { return .none }
        // A demo account never takes them, whatever else is true.
        guard owner.kind == .account else { return .leftInPlace }

        let claimedBy = (try? String(contentsOf: claim, encoding: .utf8))?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let claimedBy, !claimedBy.isEmpty {
            guard claimedBy == owner.folder else { return .claimedByAnother }
        } else {
            guard mayAdopt else { return .leftInPlace }
            do { try Data(owner.folder.utf8).write(to: claim, options: .atomic) } catch { return .notYet }
        }

        // Unreadable on either side: change nothing rather than guess.
        guard let unowned = try? JSONDecoder().decode([CheckIn].self, from: Data(contentsOf: unownedIndex)),
              var mine = try? readIndex()
        else { return .notYet }

        do {
            try files.createDirectory(at: directory, withIntermediateDirectories: true)
            var moved: [CheckIn] = []
            for record in unowned {
                let source = root.appendingPathComponent(record.fileName)
                let target = url(for: record)
                if files.fileExists(atPath: source.path) {
                    // A copy from an earlier attempt is kept when it matches.
                    if !files.contentsEqual(atPath: source.path, andPath: target.path) {
                        try copy(source, to: target)
                    }
                } else if !files.fileExists(atPath: target.path) {
                    // No picture anywhere: a record `load()` never showed.
                    continue
                }
                moved.append(record)
                if !mine.contains(where: { $0.id == record.id }) { mine.append(record) }
            }
            try save(mine)

            let confirmed = try readIndex()
            for record in moved {
                let source = root.appendingPathComponent(record.fileName)
                let target = url(for: record)
                guard confirmed.contains(where: { $0.id == record.id }),
                      files.fileExists(atPath: target.path),
                      !files.fileExists(atPath: source.path)
                        || files.contentsEqual(atPath: source.path, andPath: target.path)
                else { return .notYet }
            }

            // Confirmed: the originals go, pictures first, then the list, and
            // the claim last.
            for record in unowned {
                try? files.removeItem(at: root.appendingPathComponent(record.fileName))
            }
            try files.removeItem(at: unownedIndex)
            try? files.removeItem(at: claim)
            return .moved(moved.count)
        } catch {
            return .notYet
        }
    }

    /// Through a temporary file, so a copy cut short is never taken for a
    /// finished one.
    private func copy(_ source: URL, to target: URL) throws {
        let files = FileManager.default
        let partial = target.appendingPathExtension("partial")
        try? files.removeItem(at: partial)
        try files.copyItem(at: source, to: partial)
        if files.fileExists(atPath: target.path) { try files.removeItem(at: target) }
        try files.moveItem(at: partial, to: target)
    }

    // MARK: - The owner's list

    /// The records whose picture is still there.
    private func stored() -> [CheckIn] {
        // A record whose picture is gone is not a check-in any more.
        ((try? readIndex()) ?? []).filter { FileManager.default.fileExists(atPath: url(for: $0).path) }
    }

    /// No list yet is an empty one; a list that cannot be read is an error, so
    /// it is never written over.
    private func readIndex() throws -> [CheckIn] {
        guard FileManager.default.fileExists(atPath: index.path) else { return [] }
        return try JSONDecoder().decode([CheckIn].self, from: Data(contentsOf: index))
    }

    private func save(_ checkIns: [CheckIn]) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(checkIns).write(to: index, options: .atomic)
        // Photos of yourself are not for anyone else's backup. Set on the
        // root, it covers every owner's folder.
        var resource = URLResourceValues()
        resource.isExcludedFromBackup = true
        var mutable = root
        try? mutable.setResourceValues(resource)
    }
}
