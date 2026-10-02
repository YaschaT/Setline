import SwiftUI
import UIKit

/// One of the design's own glyphs, bundled as a template vector.
///
/// The redesign draws its icons as thin strokes (1.4–2pt on a 14–24pt grid);
/// those are the second group below. The first group is the Material Symbols
/// artwork the earlier sheets still use.
///
/// Sized like the text beside it: the design's point size, scaled for Dynamic
/// Type. Decorative by default; the control it sits in carries the label.
struct SLGlyph: View {
    enum Name: String {
        case timer = "IconTimer"
        case swapVert = "IconSwapVert"
        case search = "IconSearch"
        case download = "IconDownload"
        case calculate = "IconCalculate"

        case chevronRight = "IconChevronRight"
        case chevronLeft = "IconChevronLeft"
        case chevronDown = "IconChevronDown"
        case calendar = "IconCalendar"
        case clock = "IconClock"
        case moon = "IconMoon"
        case play = "IconPlay"
        case close = "IconClose"
        case plus = "IconPlus"
        case check = "IconCheck"
        case skip = "IconSkip"
        case plates = "IconPlates"
        case camera = "IconCameraSmall"
        case image = "IconImage"

        /// "Categoriestijl · één glyph-set, het label benoemt het type".
        case push = "GlyphPush"
        case pull = "GlyphPull"
        case legs = "GlyphLegs"
        case upper = "GlyphUpper"
        case lower = "GlyphLower"
    }

    let name: Name
    let size: CGFloat
    /// Chrome that must not grow with the reader's text size.
    var fixed = false

    var body: some View {
        let scaled = fixed ? size : UIFontMetrics(forTextStyle: .body).scaledValue(for: size)
        Image(name.rawValue)
            .renderingMode(.template)
            .resizable()
            .frame(width: scaled, height: scaled)
            .accessibilityHidden(true)
    }
}

extension SLGlyph.Name {
    /// The category glyph for a session by its name: "Push", "Upper A",
    /// "Full body B". A name outside the set borrows the upper-body glyph —
    /// the label beside it is what tells them apart.
    static func category(for sessionName: String) -> SLGlyph.Name {
        switch sessionName.split(separator: " ").first?.lowercased() {
        case "push": return .push
        case "pull": return .pull
        case "legs": return .legs
        case "lower": return .lower
        default: return .upper
        }
    }
}
