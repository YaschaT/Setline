import UIKit

/// The avatar's picture, made from whatever the library hands over.
enum ProfilePhoto {
    /// The centred square of the picture at `side` pixels, as JPEG: enough for
    /// the largest avatar at 3×, a fraction of a full photo. Nil when the data
    /// is not a picture.
    static func square(from data: Data, side: CGFloat = 512) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let edge = min(image.size.width, image.size.height)
        guard edge > 0 else { return nil }
        let scale = side / edge
        let drawn = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let square = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            image.draw(in: CGRect(
                x: (side - drawn.width) / 2,
                y: (side - drawn.height) / 2,
                width: drawn.width,
                height: drawn.height
            ))
        }
        return square.jpegData(compressionQuality: 0.85)
    }
}
