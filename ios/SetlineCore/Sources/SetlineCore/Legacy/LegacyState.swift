import Foundation

/// The web app's saved state, held exactly as it arrived.
///
/// `raw` is the whole object. Typed accessors read through it; writes patch
/// named keys and leave everything else untouched. That is what makes the
/// round-trip lossless rather than merely "complete enough".
public struct LegacyState: Sendable {
    public static let storageKey = "yascha-training-v1"

    public private(set) var raw: [String: JSONValue]

    public init(raw: [String: JSONValue]) { self.raw = raw }

    public init(data: Data) throws {
        let decoded = try JSONDecoder().decode(JSONValue.self, from: data)
        guard let object = decoded.objectValue else {
            throw LegacyStateError.notAnObject
        }
        self.raw = object
    }

    /// Accepts either the bare state object or a portable export
    /// (`PRIVATE-DATA/yascha-training-backup.json`), which wraps it under
    /// `state` alongside `photos` and export metadata.
    public static func fromExportOrState(data: Data) throws -> LegacyState {
        let decoded = try JSONDecoder().decode(JSONValue.self, from: data)
        guard let object = decoded.objectValue else { throw LegacyStateError.notAnObject }
        if let nested = object["state"]?.objectValue { return LegacyState(raw: nested) }
        return LegacyState(raw: object)
    }

    public func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(JSONValue.object(raw))
    }

    public mutating func set(_ key: String, to value: JSONValue) { raw[key] = value }

    public subscript(key: String) -> JSONValue? { raw[key] }
}

public enum LegacyStateError: Error, Equatable {
    case notAnObject
}
