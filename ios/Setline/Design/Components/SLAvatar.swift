import SwiftUI

/// Redesign 1a's avatar: the account's picture in a circle or, without one,
/// the initial of its name in lime on the raised surface — ringed by the
/// strong hairline either way. A fixed size: it is a mark, not text, so the
/// initial does not grow with Dynamic Type.
struct SLAvatar: View {
    let photo: UIImage?
    let initial: String?
    var size: CGFloat = 48

    var body: some View {
        ZStack {
            Circle().fill(SL.Surface.raised2)
            if let photo {
                Image(uiImage: photo)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else if let initial {
                // 1a: 19 on a 48 circle.
                Text(initial)
                    .font(.slFixed(size * 19 / 48, SL.Weight.semibold))
                    .foregroundStyle(SL.Signal.action)
            }
        }
        .frame(width: size, height: size)
        .overlay(Circle().strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border))
        .accessibilityHidden(true)
    }
}
