import SwiftUI
import UIKit

/// One of the design's own glyphs — the Material Symbols Rounded artwork the
/// artboards draw (weight 400, unfilled) — bundled as a template vector.
///
/// Sized like the text beside it: the design's point size, scaled for Dynamic
/// Type. Decorative by default; the control it sits in carries the label.
struct SLGlyph: View {
    enum Name: String {
        case timer = "IconTimer"
        case swapVert = "IconSwapVert"
        case search = "IconSearch"
        case chevronRight = "IconChevronRight"
        case download = "IconDownload"
        case calculate = "IconCalculate"
    }

    let name: Name
    let size: CGFloat

    var body: some View {
        let scaled = UIFontMetrics(forTextStyle: .body).scaledValue(for: size)
        Image(name.rawValue)
            .renderingMode(.template)
            .resizable()
            .frame(width: scaled, height: scaled)
            .accessibilityHidden(true)
    }
}
