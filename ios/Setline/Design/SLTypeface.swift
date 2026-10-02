import CoreText
import SwiftUI
import UIKit

/// Archivo, the redesign's one typeface (`--sl-font`).
///
/// The app bundles the variable font (`Fonts/Archivo-Variable.ttf`, SIL Open
/// Font License — the licence text ships beside it) and registers it through
/// `UIAppFonts`. A weight is therefore a position on the font's `wght` axis
/// rather than a separate file: 400, 500, 600 and 700 are the four the design
/// uses.
///
/// The design names a second face for numbers, "Archivo Expanded". No such
/// family is published, so the design file itself renders its numbers in
/// Archivo at normal width — and so does this app. The `wdth` axis is pinned
/// to 100 to say so explicitly.
///
/// If the font is ever missing from the bundle the system face is used, so
/// nothing renders in a fallback serif.
enum SLTypeface {
    /// The PostScript name of the file's default instance (its `wght` default
    /// is 600).
    private static let postScriptName = "Archivo-SemiBold"
    private static let weightAxis = 0x7767_6874   // 'wght'
    private static let widthAxis = 0x7764_7468    // 'wdth'

    /// Whether Archivo was registered from the bundle.
    static let isAvailable: Bool = UIFont(name: postScriptName, size: 12) != nil

    /// Fonts are asked for on every body pass; building a descriptor each
    /// time would be wasted work. `NSCache` is safe to share across threads.
    nonisolated(unsafe) private static let cache = NSCache<NSString, UIFont>()

    static func uiFont(size: CGFloat, weight: Font.Weight) -> UIFont {
        let axisValue = axis(for: weight)
        let key = "\(size)-\(axisValue)" as NSString
        if let cached = cache.object(forKey: key) { return cached }

        let font: UIFont
        if isAvailable {
            let descriptor = UIFontDescriptor(fontAttributes: [
                .name: postScriptName,
                UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [
                    weightAxis: axisValue,
                    widthAxis: 100,
                ],
            ])
            font = UIFont(descriptor: descriptor, size: size)
        } else {
            font = .systemFont(ofSize: size, weight: uiWeight(for: weight))
        }
        cache.setObject(font, forKey: key)
        return font
    }

    static func font(size: CGFloat, weight: Font.Weight) -> Font {
        Font(uiFont(size: size, weight: weight) as CTFont)
    }

    private static func axis(for weight: Font.Weight) -> Int {
        switch weight {
        case .bold, .heavy, .black: return 700
        case .semibold: return 600
        case .medium: return 500
        default: return 400
        }
    }

    private static func uiWeight(for weight: Font.Weight) -> UIFont.Weight {
        switch weight {
        case .bold, .heavy, .black: return .bold
        case .semibold: return .semibold
        case .medium: return .medium
        default: return .regular
        }
    }
}
