import SwiftUI

/// A food's photo: a product's own image from Open Food Facts, or a bundled
/// photo for the quick adds. While it loads, or where there is
/// none, the tile shows a fork and knife.
struct SLFoodPhoto: View {
    enum Source: Equatable {
        case url(URL?)
        /// A bundled photo, by asset name.
        case asset(String)
    }

    let source: Source
    var cornerRadius: CGFloat = SL.Radius.md

    private var url: URL? {
        if case .url(let url) = source { return url }
        return nil
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        // The tile decides the size; the photo fills it and is cut to it.
        shape
            .fill(SL.Surface.raised2)
            .overlay {
                Image(systemName: "fork.knife")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(SL.Ink.tertiary)
            }
            .overlay {
                if case .asset(let name) = source {
                    Image(name).resizable().scaledToFill()
                } else if let url {
                    AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
                        if let image = phase.image { image.resizable().scaledToFill() }
                    }
                }
            }
            .clipShape(shape)
            .accessibilityHidden(true)
    }
}
