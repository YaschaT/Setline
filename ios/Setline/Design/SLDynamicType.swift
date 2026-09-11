import SwiftUI
import UIKit

extension Font {
    /// The design's fixed point sizes, scaled for Dynamic Type.
    ///
    /// The handoff specifies exact sizes *and* requires Dynamic Type support
    /// "via `@ScaledMetric` relative to the sizes above". `UIFontMetrics`
    /// applies the same scaling `@ScaledMetric` does, from one place, so every
    /// call site keeps the artboard's literal number and still grows with the
    /// reader's setting.
    ///
    /// Interactive elements pair this with `minHeight:` rather than a fixed
    /// height, so the 44pt floor holds at every size and controls grow rather
    /// than clip.
    static func sl(
        _ size: CGFloat,
        _ weight: Font.Weight,
        relativeTo style: UIFont.TextStyle = .body
    ) -> Font {
        .system(size: UIFontMetrics(forTextStyle: style).scaledValue(for: size), weight: weight)
    }

    /// The same scaling, with a ceiling.
    ///
    /// For chrome that must stay inside a fixed column — the set grid's
    /// column headers — where overflowing the column is worse than being a
    /// point or two smaller. Never use this for content.
    static func slCapped(
        _ size: CGFloat,
        _ weight: Font.Weight,
        maxScale: CGFloat,
        relativeTo style: UIFont.TextStyle = .body
    ) -> Font {
        let scaled = UIFontMetrics(forTextStyle: style).scaledValue(for: size)
        return .system(size: min(scaled, size * maxScale), weight: weight)
    }
}

extension View {
    /// Makes a view re-render when the reader changes their text size.
    ///
    /// `UIFontMetrics` reads the current category at draw time; reading
    /// `dynamicTypeSize` from the environment is what tells SwiftUI to draw
    /// again when it changes.
    func slRespondsToTextSize() -> some View {
        modifier(SLTextSizeObserver())
    }
}

private struct SLTextSizeObserver: ViewModifier {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    func body(content: Content) -> some View {
        content.id(dynamicTypeSize)
    }
}
