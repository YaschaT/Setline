import SwiftUI

/// The comparison as one picture: the earlier one under the later, and a line
/// between them that the finger moves — left of it is then, right of it is
/// now. Dragged sideways, or tapped where the line should go; a pull up or
/// down still scrolls the page.
///
/// Both pictures fill the same 3:4 frame the side-by-side pair uses, so the
/// same pose lines up as it does there.
struct BeforeAfterSlider: View {
    let before: URL?
    let after: URL?
    /// "voor · 6 sep", "nu · 6 okt"
    let beforeTag: String
    let afterTag: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Where the line stands, as a share of the width: 0 shows only now, 1
    /// only then.
    @State private var split: CGFloat = 0.5
    @State private var dragStart: CGFloat?
    @State private var beforeImage: UIImage?
    @State private var afterImage: UIImage?

    var body: some View {
        GeometryReader { proxy in
            let width = max(proxy.size.width, 1)
            let x = split * width
            ZStack(alignment: .topLeading) {
                // Each tag belongs to its picture, so the line cuts it as it
                // cuts the picture.
                picture(afterImage)
                    .overlay(alignment: .topTrailing) { tag(afterTag) }
                picture(beforeImage)
                    .overlay(alignment: .topLeading) { tag(beforeTag) }
                    .mask(alignment: .leading) { Rectangle().frame(width: x) }

                Rectangle()
                    .fill(Color.white)
                    .frame(width: 2)
                    .shadow(color: .black.opacity(0.35), radius: 3)
                    .offset(x: x - 1)
                handle
                    .position(x: x, y: proxy.size.height / 2)
            }
            .contentShape(Rectangle())
            .gesture(SidewaysDrag(
                onChanged: { dx in
                    let start = dragStart ?? split
                    dragStart = start
                    split = Self.clamped(start + dx / width)
                },
                onEnded: { _ in dragStart = nil }
            ))
            .onTapGesture(coordinateSpace: .local) { location in
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
                    split = Self.clamped(location.x / width)
                }
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        .task(id: [before, after]) { await load() }
        .accessibilityElement()
        .accessibilityLabel("Voor en na, \(beforeTag) tegenover \(afterTag)")
        .accessibilityValue("\(Int((split * 100).rounded())) procent voor")
        .accessibilityHint("Veeg omhoog of omlaag om de lijn te verschuiven")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: split = Self.clamped(split + 0.1)
            case .decrement: split = Self.clamped(split - 0.1)
            @unknown default: break
            }
        }
    }

    /// A rectangle the size it is offered, the picture filling it from inside.
    private func picture(_ image: UIImage?) -> some View {
        Rectangle()
            .fill(SL.Surface.raised2)
            .overlay {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                }
            }
            .clipped()
    }

    /// 44 to hold, the arrows saying which way it goes.
    private var handle: some View {
        HStack(spacing: 2) {
            SLGlyph(name: .chevronLeft, size: 12, fixed: true)
            SLGlyph(name: .chevronRight, size: 12, fixed: true)
        }
        .foregroundStyle(SL.Ink.primary)
        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
        .background(Circle().fill(SL.Surface.raised))
        .overlay(Circle().strokeBorder(Color.white, lineWidth: 2))
        .shadow(color: .black.opacity(0.35), radius: 4)
    }

    private func tag(_ text: String) -> some View {
        Text(text)
            .font(.slFixed(SL.TypeSize.meta, SL.Weight.semibold))
            .slNumerals()
            .foregroundStyle(SL.Ink.primary)
            .lineLimit(1)
            .padding(.horizontal, SL.Space.s2)
            .padding(.vertical, 4)
            .background(Capsule().fill(Color.black.opacity(0.55)))
            .padding(SL.Space.s3)
    }

    private func load() async {
        let (before, after) = (before, after)
        async let then = Task.detached(priority: .userInitiated) {
            before.flatMap { PhotoThumbnail.load($0, maxPixels: 1400) }
        }.value
        async let now = Task.detached(priority: .userInitiated) {
            after.flatMap { PhotoThumbnail.load($0, maxPixels: 1400) }
        }.value
        let (b, a) = await (then, now)
        beforeImage = b
        afterImage = a
    }

    private static func clamped(_ value: CGFloat) -> CGFloat {
        min(max(value, 0), 1)
    }
}
