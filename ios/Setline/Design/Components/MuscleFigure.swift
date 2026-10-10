import SwiftUI
import SetlineCore

/// A small front-view body with the muscle group an exercise trains filled
/// in — the way Hevy and Apple's own fitness views show "what this works",
/// readable at a glance without learning an icon.
///
/// Drawn on a 20 × 28 grid and scaled to fit.
struct MuscleFigure: View {
    let group: MuscleGroup?
    /// The filled muscle: lime for a lift that gained, ink otherwise.
    var highlight: Color = SL.Ink.primary
    var outline: Color = SL.Ink.secondary
    /// A set stroke in points; nil scales it with the figure.
    var lineWidth: CGFloat? = nil

    var body: some View {
        Canvas { context, size in
            let scale = min(size.width / 20, size.height / 28)
            let dx = (size.width - 20 * scale) / 2, dy = (size.height - 28 * scale) / 2
            var transform = CGAffineTransform(translationX: dx, y: dy).scaledBy(x: scale, y: scale)
            func shaped(_ path: Path) -> Path { path.applying(transform) }

            // The muscle first, so the outline sits on top of it.
            for region in Self.regions(group) {
                context.fill(shaped(region), with: .color(highlight))
            }
            context.stroke(shaped(Self.silhouette), with: .color(outline),
                           style: StrokeStyle(lineWidth: lineWidth ?? 1.1 * scale / 1.6, lineCap: .round, lineJoin: .round))
            _ = transform
            transform = .identity
        }
        .aspectRatio(20 / 28, contentMode: .fit)
        .accessibilityHidden(true)
    }

    private static let silhouette: Path = {
        var p = Path()
        p.addEllipse(in: CGRect(x: 7.8, y: 0.6, width: 4.4, height: 4.6))
        // Torso, shoulders to hips.
        p.move(to: CGPoint(x: 8.6, y: 5.4))
        p.addLine(to: CGPoint(x: 5.2, y: 6.6))
        p.addQuadCurve(to: CGPoint(x: 4.2, y: 8.2), control: CGPoint(x: 4.3, y: 6.9))
        p.addLine(to: CGPoint(x: 3.2, y: 14.6))
        p.addLine(to: CGPoint(x: 2.8, y: 17.4))
        p.move(to: CGPoint(x: 5.6, y: 9.4))
        p.addLine(to: CGPoint(x: 6.6, y: 16.2))
        p.addLine(to: CGPoint(x: 6.4, y: 27.2))
        p.move(to: CGPoint(x: 11.4, y: 5.4))
        p.addLine(to: CGPoint(x: 14.8, y: 6.6))
        p.addQuadCurve(to: CGPoint(x: 15.8, y: 8.2), control: CGPoint(x: 15.7, y: 6.9))
        p.addLine(to: CGPoint(x: 16.8, y: 14.6))
        p.addLine(to: CGPoint(x: 17.2, y: 17.4))
        p.move(to: CGPoint(x: 14.4, y: 9.4))
        p.addLine(to: CGPoint(x: 13.4, y: 16.2))
        p.addLine(to: CGPoint(x: 13.6, y: 27.2))
        // Inner legs.
        p.move(to: CGPoint(x: 9.6, y: 27.2))
        p.addLine(to: CGPoint(x: 10, y: 18))
        p.addLine(to: CGPoint(x: 10.4, y: 27.2))
        return p
    }()

    private static func regions(_ group: MuscleGroup?) -> [Path] {
        func ellipse(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> Path {
            Path(ellipseIn: CGRect(x: x - w / 2, y: y - h / 2, width: w, height: h))
        }
        func capsule(_ a: CGPoint, _ b: CGPoint, _ width: CGFloat) -> Path {
            var p = Path()
            p.move(to: a)
            p.addLine(to: b)
            return p.strokedPath(StrokeStyle(lineWidth: width, lineCap: .round))
        }
        switch group {
        case .borst:
            return [ellipse(8.3, 9.0, 3.4, 2.6), ellipse(11.7, 9.0, 3.4, 2.6)]
        case .schouders:
            return [ellipse(5.4, 7.6, 2.4, 2.2), ellipse(14.6, 7.6, 2.4, 2.2)]
        case .armen:
            return [capsule(CGPoint(x: 4.3, y: 9.2), CGPoint(x: 3.6, y: 13.6), 1.7),
                    capsule(CGPoint(x: 15.7, y: 9.2), CGPoint(x: 16.4, y: 13.6), 1.7)]
        case .core:
            return [Path(roundedRect: CGRect(x: 8.4, y: 10.8, width: 3.2, height: 4.8), cornerRadius: 1)]
        case .benen:
            return [capsule(CGPoint(x: 8.1, y: 18), CGPoint(x: 7.9, y: 23.5), 2.4),
                    capsule(CGPoint(x: 11.9, y: 18), CGPoint(x: 12.1, y: 23.5), 2.4)]
        case .rug:
            // The lats, seen as the V of the torso's sides.
            var left = Path()
            left.move(to: CGPoint(x: 5.9, y: 8.4)); left.addLine(to: CGPoint(x: 7.9, y: 9.2)); left.addLine(to: CGPoint(x: 7.0, y: 14.6)); left.closeSubpath()
            var right = Path()
            right.move(to: CGPoint(x: 14.1, y: 8.4)); right.addLine(to: CGPoint(x: 12.1, y: 9.2)); right.addLine(to: CGPoint(x: 13.0, y: 14.6)); right.closeSubpath()
            return [left, right]
        case nil:
            return []
        }
    }
}
