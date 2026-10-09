import SwiftUI
import SetlineCore

/// A lift medal: a round disc in its metal with the place struck in, hung
/// from two short ribbon tails. Flat metal, the same three the badges use,
/// so a medal and a badge read as one family.
struct SLMedal: View {
    let place: LiftMedal.Place
    var size: CGFloat = 36

    static func metal(_ place: LiftMedal.Place) -> (face: Color, edge: Color) {
        switch place {
        case .gold: return (Color(hex: 0xFFD166), Color(hex: 0xB07D12))
        case .silver: return (Color(hex: 0xDDE3E7), Color(hex: 0x7D8A92))
        case .bronze: return (Color(hex: 0xE2A576), Color(hex: 0x7A4526))
        }
    }

    var body: some View {
        let metal = Self.metal(place)
        ZStack(alignment: .top) {
            // Ribbon tails, behind the disc.
            HStack(spacing: size * 0.04) {
                Ribbon().fill(metal.edge).frame(width: size * 0.26, height: size * 0.42)
                Ribbon().fill(metal.edge.opacity(0.75)).frame(width: size * 0.26, height: size * 0.42)
            }
            ZStack {
                Circle().fill(metal.edge)
                Circle().fill(metal.face).padding(size * 0.07)
                Circle().strokeBorder(metal.edge.opacity(0.55), lineWidth: max(1, size * 0.035)).padding(size * 0.17)
                Text("\(place.rawValue)")
                    .font(.slFixed(size * 0.36, SL.Weight.bold))
                    .foregroundStyle(metal.edge)
            }
            .frame(width: size * 0.82, height: size * 0.82)
            .offset(y: size * 0.24)
        }
        .frame(width: size, height: size * 1.06, alignment: .top)
        .accessibilityElement()
        .accessibilityLabel(place.title)
    }

    private struct Ribbon: Shape {
        func path(in rect: CGRect) -> Path {
            var path = Path()
            path.move(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY - rect.height * 0.22))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.closeSubpath()
            return path
        }
    }
}

/// One medal as a row: the medal, the lift, and what earned it.
struct SLMedalRow: View {
    let medal: LiftMedal
    let display: NumberDisplay

    var body: some View {
        HStack(spacing: SL.Space.s3) {
            SLMedal(place: medal.place, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(medal.name)
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Ink.primary)
                    .lineLimit(1)
                Text("\(medal.place.title) · \(display.kg(medal.weightKg)) × \(medal.reps)")
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(medal.place.title) on \(medal.name): \(display.kg(medal.weightKg)) times \(medal.reps)")
    }
}
