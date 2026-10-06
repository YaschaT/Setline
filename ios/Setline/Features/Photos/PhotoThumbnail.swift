import ImageIO
import UIKit

/// A picture read at the size it is shown, not the size it was taken: a
/// 12-megapixel photo decoded whole for a 350-point frame costs the memory and
/// time that sliding between two pictures, or stepping through all of them,
/// cannot spare.
enum PhotoThumbnail {
    /// The picture at `url`, upright, its longest side at most `maxPixels`.
    /// Nil when there is no picture there.
    static func load(_ url: URL, maxPixels: CGFloat) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithURL(url as CFURL, sourceOptions) else { return nil }
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ] as CFDictionary
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options) else { return nil }
        return UIImage(cgImage: image)
    }
}
