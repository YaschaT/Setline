import SwiftUI
import SetlineCore

/// A milestone as a badge: a hexagon in its tier's metal — bronze, silver,
/// gold, and lime for the top of each kind — with a dark face carrying the
/// icon and the number. Locked, it is a grey outline with the progress drawn
/// round its edge in lime, so a badge shows what it takes before it is won.
struct SLBadge: View {
    let milestone: Milestone
    var size: CGFloat = 84

    private var palette: (light: Color, dark: Color) {
        switch milestone.tier {
        case 0: return (Color(hex: 0xE2A576), Color(hex: 0x7A4526))  // bronze
        case 1: return (Color(hex: 0xEEF2F4), Color(hex: 0x7D8A92))  // silver
        case 2: return (Color(hex: 0xFFE08A), Color(hex: 0xB07D12))  // gold
        default: return (SL.Signal.action, Color(hex: 0x5F8F1E))      // top tier
        }
    }

    private var symbol: String {
        switch milestone.kind {
        case .sessions: return "figure.strengthtraining.traditional"
        case .streak: return "flame.fill"
        case .heaviest: return "dumbbell.fill"
        case .volume: return "mountain.2.fill"
        }
    }

    var body: some View {
        let won = milestone.isReached
        let colors = palette
        ZStack {
            if won {
                RoundedHexagon()
                    .fill(LinearGradient(colors: [colors.light, colors.dark],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .shadow(color: colors.dark.opacity(0.5), radius: size * 0.08, y: size * 0.04)
                RoundedHexagon()
                    .fill(SL.Surface.raised)
                    .padding(size * 0.11)
                RoundedHexagon()
                    .strokeBorderCompat(colors.light.opacity(0.6), lineWidth: max(1, size * 0.015))
                    .padding(size * 0.11)
            } else {
                RoundedHexagon()
                    .fill(SL.Surface.raised)
                RoundedHexagon()
                    .stroke(SL.Surface.hairlineStrong, lineWidth: max(1.5, size * 0.03))
                    .padding(size * 0.02)
                RoundedHexagon()
                    .trim(from: 0, to: milestone.fraction)
                    .stroke(SL.Signal.action, style: StrokeStyle(lineWidth: max(1.5, size * 0.03), lineCap: .round))
                    .padding(size * 0.02)
            }

            VStack(spacing: size * 0.03) {
                Image(systemName: symbol)
                    .font(.system(size: size * 0.24, weight: .semibold))
                    .foregroundStyle(won ? colors.light : SL.Ink.tertiary)
                Text(milestone.badgeLabel)
                    .font(.system(size: size * 0.15, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(won ? SL.Ink.primary : SL.Ink.tertiary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, size * 0.18)
            }
        }
        .frame(width: size, height: size * 1.08)
        .accessibilityElement()
        .accessibilityLabel(milestone.isReached ? "\(milestone.title), earned" : "\(milestone.title), locked")
    }
}

/// A pointy-top hexagon with softened corners.
struct RoundedHexagon: Shape {
    func path(in rect: CGRect) -> Path {
        let corner = min(rect.width, rect.height) * 0.12
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radiusX = rect.width / 2, radiusY = rect.height / 2
        let points = (0..<6).map { index -> CGPoint in
            let angle = (Double(index) * 60 - 90) * .pi / 180
            return CGPoint(x: center.x + radiusX * cos(angle), y: center.y + radiusY * sin(angle))
        }
        var path = Path()
        for index in 0..<6 {
            let previous = points[(index + 5) % 6], point = points[index], next = points[(index + 1) % 6]
            let into = unit(from: point, to: previous), out = unit(from: point, to: next)
            let start = CGPoint(x: point.x + into.x * corner, y: point.y + into.y * corner)
            let end = CGPoint(x: point.x + out.x * corner, y: point.y + out.y * corner)
            if index == 0 { path.move(to: start) } else { path.addLine(to: start) }
            path.addQuadCurve(to: end, control: point)
        }
        path.closeSubpath()
        return path
    }

    private func unit(from a: CGPoint, to b: CGPoint) -> CGPoint {
        let dx = b.x - a.x, dy = b.y - a.y
        let length = max(sqrt(dx * dx + dy * dy), 0.001)
        return CGPoint(x: dx / length, y: dy / length)
    }
}

private extension Shape {
    func strokeBorderCompat(_ color: Color, lineWidth: CGFloat) -> some View {
        stroke(color, lineWidth: lineWidth)
    }
}
