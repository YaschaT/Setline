import SwiftUI

/// A screen's content at full height, the way the entry artboards lay it out:
/// a flexible space (their `flex:1; min-height`) keeps the lower part down by
/// the commit block, and the whole column scrolls once it no longer fits.
struct SLAnchoredScroll<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                content
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height, alignment: .top)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}
