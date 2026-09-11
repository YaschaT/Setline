import Foundation

/// Dutch (BE) number rendering, in one place.
///
/// Every number the design shows uses a comma decimal and a dot thousands
/// separator: "102,5 kg", "6.480 kg", "+2,5". Numerals are always tabular in
/// the view layer; this type only decides the characters.
public struct NumberDisplay: Sendable {
    public let locale: Locale

    public init(locale: Locale) { self.locale = locale }

    public static let dutch = NumberDisplay(locale: Locale(identifier: "nl_BE"))

    private func decimal(_ value: Decimal, maxFractionDigits: Int = 2) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = maxFractionDigits
        formatter.minimumFractionDigits = 0
        formatter.usesGroupingSeparator = true
        return formatter.string(from: value as NSDecimalNumber) ?? "\(value)"
    }

    /// "102,5 kg"
    public func kg(_ value: Decimal) -> String { "\(decimal(value)) kg" }

    /// "102,5"
    public func number(_ value: Decimal) -> String { decimal(value) }

    /// "6.480 kg" — volume, always whole kilos.
    public func volumeKg(_ value: Decimal) -> String { "\(decimal(value, maxFractionDigits: 0)) kg" }

    /// "+2,5" / "−1" / "=" — the delta column. Uses a real minus sign.
    public func signedDelta(_ value: Decimal) -> String {
        if value == 0 { return "=" }
        let magnitude = decimal(abs(value))
        return value > 0 ? "+\(magnitude)" : "−\(magnitude)"
    }

    /// "+2 reps" / "−1 rep"
    public func signedReps(_ value: Int) -> String {
        let noun = abs(value) == 1 ? "rep" : "reps"
        return value > 0 ? "+\(value) \(noun)" : "−\(abs(value)) \(noun)"
    }

    /// "47,5 × 8" — a previous set, as shown in the delta column.
    public func setReference(weightKg: Decimal, reps: Int) -> String {
        "\(decimal(weightKg)) × \(reps)"
    }

    /// "7 sep" — the short date the delta column header and history rows use.
    public func shortDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.dateFormat = "d MMM"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }

    /// "53 min"
    public func minutes(_ seconds: Int) -> String { "\(seconds / 60) min" }
}
