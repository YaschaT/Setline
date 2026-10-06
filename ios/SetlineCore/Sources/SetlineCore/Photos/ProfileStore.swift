import Foundation

/// The name and picture an account shows on this phone: the greeting and the
/// avatar on Training, and the head of Account.
///
/// Like the check-in photos they stay in the app's own container, apart for
/// every account (`PhotoOwner.folder`), and are never uploaded or written into
/// the shared account state — there is nowhere on the server to keep them.
/// Signing out closes them; nothing is deleted.
public struct ProfileStore: Sendable {

    public let owner: PhotoOwner
    private let directory: URL

    public init(owner: PhotoOwner, container: URL? = nil) {
        let base = container
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.owner = owner
        directory = base
            .appendingPathComponent("Profile", isDirectory: true)
            .appendingPathComponent(owner.folder, isDirectory: true)
    }

    private var nameFile: URL { directory.appendingPathComponent("name.txt") }
    private var photoFile: URL { directory.appendingPathComponent("photo.jpg") }

    /// The name as it was typed, or nil when none was.
    public func name() -> String? {
        guard let data = try? Data(contentsOf: nameFile),
              let text = String(data: data, encoding: .utf8) else { return nil }
        return Self.cleaned(text)
    }

    /// Keeps a name; an empty one removes it.
    public func setName(_ name: String) throws {
        guard let cleaned = Self.cleaned(name) else {
            try remove(nameFile)
            return
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data(cleaned.utf8).write(to: nameFile, options: .atomic)
    }

    public func photo() -> Data? {
        try? Data(contentsOf: photoFile)
    }

    public func setPhoto(_ data: Data) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: photoFile, options: .atomic)
    }

    public func removePhoto() throws {
        try remove(photoFile)
    }

    /// "Yascha" from "Yascha Torfs" — or from "yascha torfs", typed on a
    /// keyboard that did not capitalise it: what the greeting calls you.
    public static func firstName(of name: String?) -> String? {
        guard let first = name.flatMap(cleaned)?.split(whereSeparator: \.isWhitespace).first else { return nil }
        return first.prefix(1).uppercased() + first.dropFirst()
    }

    /// The letter on an avatar without a picture: the name's, else the
    /// address's, else none.
    public static func initial(name: String?, email: String?) -> String? {
        let source = name.flatMap(cleaned) ?? email
        return source?.first(where: \.isLetter).map { String($0).uppercased() }
    }

    private static func cleaned(_ text: String) -> String? {
        let trimmed = text
            .components(separatedBy: .newlines).joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : String(trimmed.prefix(60))
    }

    private func remove(_ file: URL) throws {
        guard FileManager.default.fileExists(atPath: file.path) else { return }
        try FileManager.default.removeItem(at: file)
    }
}
