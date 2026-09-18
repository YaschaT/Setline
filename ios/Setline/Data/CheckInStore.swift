import Foundation
import SetlineCore

/// Check-in photos, kept in the app's own container and nowhere else.
///
/// The handoff is explicit about this: "Foto's blijven op je toestel tenzij je
/// sync aanzet." There is no sync to turn on, so nothing here is ever uploaded,
/// and none of it goes into the shared account state.
actor CheckInStore {

    private let directory: URL
    private let index: URL

    init(container: URL? = nil) {
        let base = container
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        directory = base.appendingPathComponent("CheckIns", isDirectory: true)
        index = directory.appendingPathComponent("check-ins.json")
    }

    func load() -> [CheckIn] {
        guard let data = try? Data(contentsOf: index),
              let stored = try? JSONDecoder().decode([CheckIn].self, from: data)
        else { return [] }
        // A record whose picture is gone is not a check-in any more.
        return stored.filter { FileManager.default.fileExists(atPath: url(for: $0).path) }
    }

    /// Writes the picture, then the record, so a half-written check-in is a
    /// file nobody references rather than a record pointing at nothing.
    func add(_ data: Data, on date: Date) throws -> [CheckIn] {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let id = "checkin-\(Int(Date().timeIntervalSince1970 * 1000))"
        let checkIn = CheckIn(id: id, date: Schedule.dateKey(date), fileName: "\(id).jpg")
        try data.write(to: url(for: checkIn), options: .atomic)

        var all = load()
        all.append(checkIn)
        try save(all)
        return all
    }

    func remove(_ checkIn: CheckIn) throws -> [CheckIn] {
        let remaining = load().filter { $0.id != checkIn.id }
        try save(remaining)
        try? FileManager.default.removeItem(at: url(for: checkIn))
        return remaining
    }

    nonisolated func url(for checkIn: CheckIn) -> URL {
        directory.appendingPathComponent(checkIn.fileName)
    }

    private func save(_ checkIns: [CheckIn]) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(checkIns).write(to: index, options: .atomic)
        // Photos of yourself are not for anyone else's backup.
        var resource = URLResourceValues()
        resource.isExcludedFromBackup = true
        var mutable = directory
        try? mutable.setResourceValues(resource)
    }
}
