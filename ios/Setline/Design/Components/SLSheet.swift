import SwiftUI

/// A bottom sheet as the redesign draws it: surface-1 under the strong
/// hairline, radius 22 at the top and never taller than 86% of the screen.
/// Its head is the title at 21 with one line of 13 beneath it, and a round
/// close control that is a full 44 across.
///
/// The system presents it, so it can be swiped down, is read as a modal by
/// VoiceOver, and gives the keyboard its usual room.
struct SLSheet<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize

    let title: String
    var subtitle: String? = nil
    let onClose: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) {
            head
            ScrollView {
                content
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.bottom, SL.Space.s2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SL.Surface.raised)
        .overlay(alignment: .top) { topEdge }
        // At accessibility sizes the content needs the whole screen.
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.fraction(0.86)])
        .presentationDragIndicator(.hidden)
        .presentationBackground(SL.Surface.raised)
        .presentationCornerRadius(SL.Radius.xl)
        .slRespondsToTextSize()
    }

    private var head: some View {
        // Beside a title that runs to several lines, the close control stays
        // at the top, where it is looked for.
        HStack(alignment: typeSize.isAccessibilitySize ? .top : .center, spacing: SL.Space.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .slTitle()
                    .foregroundStyle(SL.Ink.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle {
                    Text(subtitle)
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onClose) {
                SLGlyph(name: .close, size: 16, fixed: true)
                    .foregroundStyle(SL.Ink.primary)
                    .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                    .background(Circle().fill(SL.Surface.raised2))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .slFocusRing(Circle())
            .accessibilityLabel("Sluiten")
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s4)
        .padding(.bottom, SL.Space.s3)
    }

    /// The design's `border-top`: a hairline along the top that runs out in
    /// the corners, because the sides carry no border at all.
    private var topEdge: some View {
        UnevenRoundedRectangle(
            topLeadingRadius: SL.Radius.xl,
            topTrailingRadius: SL.Radius.xl,
            style: .continuous
        )
        .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
        .frame(height: SL.Radius.xl * 2)
        .mask(
            LinearGradient(
                colors: [.black, .black.opacity(0)],
                startPoint: .top,
                endPoint: UnitPoint(x: 0.5, y: 0.5)
            )
        )
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
