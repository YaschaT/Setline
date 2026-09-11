import Foundation

/// A lossless in-memory JSON tree.
///
/// The web app stores the whole of Setline as one JSON blob, in
/// `localStorage` under `yascha-training-v1` and in Supabase
/// `public.user_state.state`. iOS reads and writes that same blob during
/// Phase 1 so both clients keep working.
///
/// A strict `Codable` struct would silently drop any key it does not know
/// about — which is exactly how a port loses data nobody notices for a
/// month. This type keeps every key, in the shape it arrived in, and the
/// typed layer reads through it rather than replacing it.
public enum JSONValue: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Decimal)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Decimal.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unrecognised JSON value")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    // MARK: Accessors

    public var objectValue: [String: JSONValue]? {
        if case .object(let value) = self { return value }
        return nil
    }

    public var arrayValue: [JSONValue]? {
        if case .array(let value) = self { return value }
        return nil
    }

    public var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    public var decimalValue: Decimal? {
        switch self {
        case .number(let value): return value
        // The web app writes weights and reps as strings ("47.5", "8"); a
        // number is only ever what the JSON already held.
        case .string(let value): return Decimal(string: value.replacingOccurrences(of: ",", with: "."))
        default: return nil
        }
    }

    public var intValue: Int? {
        guard let decimal = decimalValue else { return nil }
        return (decimal as NSDecimalNumber).intValue
    }

    public var doubleValue: Double? {
        guard let decimal = decimalValue else { return nil }
        return (decimal as NSDecimalNumber).doubleValue
    }

    public var boolValue: Bool? {
        switch self {
        case .bool(let value): return value
        case .number(let value): return value != 0
        case .string(let value): return value == "true"
        default: return nil
        }
    }

    public subscript(key: String) -> JSONValue? { objectValue?[key] }
}
