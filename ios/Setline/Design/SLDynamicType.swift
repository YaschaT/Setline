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
    /// The artboards' measures — `max-width: 26ch`, `32ch`, `34ch` — as the
    /// design renders them: one `ch` draws 0.5565 of the font size (26ch is
    /// 217pt at 15pt). The measure grows with the text, so a line keeps its
    /// length in characters at every size, and gives way to the full width
    /// once that is narrower.
    func slMeasure(_ characters: CGFloat, fontSize: CGFloat, alignment: Alignment = .leading) -> some View {
        frame(
            maxWidth: UIFontMetrics(forTextStyle: .body).scaledValue(for: characters * fontSize * 0.5565),
            alignment: alignment
        )
    }

    /// The design's CSS `line-height`: a line box of `factor × size`, scaled
    /// with the text. On iOS 26 that is exact — including the display sizes,
    /// where 1.04 and 1.1 are tighter than the font's own line. Before iOS 26
    /// SwiftUI can only add space, so it adds what CSS would and cannot
    /// tighten below the font's natural line.
    func slLineHeight(_ factor: CGFloat, size: CGFloat) -> some View {
        modifier(SLLineHeight(factor: factor, size: size))
    }

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

private struct SLLineHeight: ViewModifier {
    let factor: CGFloat
    let size: CGFloat

    func body(content: Content) -> some View {
        let scaled = UIFontMetrics(forTextStyle: .body).scaledValue(for: size)
        if #available(iOS 26.0, *) {
            content
                .lineHeight(.exact(points: scaled * factor))
                // A line box tighter than the font's own line leaves the last
                // line's descenders outside the text's frame, where they would
                // be cut off; CSS lets them hang over, and so does this.
                .textRenderer(SLOverhangRenderer(overhang: scaled * 0.3))
        } else {
            content.lineSpacing(max(0, scaled * factor - UIFont.systemFont(ofSize: scaled).lineHeight))
        }
    }
}

/// Draws text exactly as SwiftUI lays it out, with room past the frame for
/// glyphs that hang outside a tightened line box.
private struct SLOverhangRenderer: TextRenderer {
    let overhang: CGFloat

    var displayPadding: EdgeInsets {
        EdgeInsets(top: overhang, leading: 0, bottom: overhang, trailing: 0)
    }

    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        for line in layout {
            context.draw(line)
        }
    }
}
