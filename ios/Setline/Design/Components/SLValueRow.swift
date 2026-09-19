import SwiftUI

/// A value and what it did beside it, on their shared baseline — "63,5 kg
/// +6,2 in 8 weken" (20). At accessibility sizes the two stack, so the number
/// itself never breaks across lines.
struct SLValueRow<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @ViewBuilder var content: Content

    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s1))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s3))
        layout { content }
    }
}
