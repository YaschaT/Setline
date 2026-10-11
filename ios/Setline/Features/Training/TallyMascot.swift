import SwiftUI
import SetlineCore

/// Tally: the SETLINE mark as a small character that counts the week.
///
/// The logo is three slanted bars struck through by a fourth — a tally. Here
/// there is one bar for each workout the week asks for: lime once done,
/// dashed while still to come, each a little higher than the last, as the
/// mark rises. When the week is met the crossbar strikes through them, the
/// way it does on the loading screen. The face sits on the newest bar — the
/// workout you just did — and on the crossbar once the week is struck.
///
/// The shapes are the mark's own: the loader's coordinates, measured in
/// bar widths.
struct TallyMascot: View {
    enum Mood: Equatable {
        /// A workout planned today, not done yet.
        case ready
        /// A lift can go up today.
        case focused
        /// Trained today.
        case proud
        /// A rest day.
        case resting
        /// The week's goal is met.
        case struck
    }

    let done: Int
    let goal: Int
    let mood: Mood
    /// Bar width in points; the whole mark scales from it.
    var unit: CGFloat = 13
    /// Bumped by the caller to make it jump (a tap, a finished workout).
    var jumps: Int = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var bobbing = false
    @State private var blink = false

    // The mark, in bar widths, from the loader's artwork (bar 1 at the origin).
    private static let barPoints: [CGPoint] = [.init(x: 0.349, y: 0.354), .init(x: 1, y: 0), .init(x: 0.651, y: 2.531), .init(x: 0, y: 2.828)]
    private static let step = CGSize(width: 1.112, height: -0.401)
    private static let slope: CGFloat = -0.295

    private var count: Int { min(max(goal, 1), 7) }
    private var filled: Int { min(done, count) }
    private var size: CGSize {
        CGSize(width: (CGFloat(count - 1) * Self.step.width + 1.6) * unit,
               height: (2.828 + CGFloat(count - 1) * -Self.step.height + 0.4) * unit)
    }
    /// Where bar `i` starts, in points, inside the frame.
    private func origin(_ i: Int) -> CGPoint {
        let top = CGFloat(count - 1) * -Self.step.height
        return CGPoint(x: (0.34 + CGFloat(i) * Self.step.width) * unit, y: (top + CGFloat(i) * Self.step.height + 0.2) * unit)
    }

    private var lime: Color { mood == .resting ? SL.Signal.recovery : SL.Signal.action }

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(0..<count, id: \.self) { i in
                let o = origin(i)
                let isDone = i < filled
                Group {
                    if isDone {
                        TallyBar().fill(lime)
                            .overlay(TallyBar().stroke(lime, style: StrokeStyle(lineWidth: unit * 0.14, lineJoin: .round)))
                    } else {
                        // Still to come: the bar's place, faintly lit.
                        TallyBar().fill(lime.opacity(0.13))
                            .overlay(TallyBar().stroke(lime.opacity(0.13), style: StrokeStyle(lineWidth: unit * 0.14, lineJoin: .round)))
                    }
                }
                .frame(width: unit, height: unit * 2.828)
                .offset(x: o.x, y: o.y)
                // Done bars do small reps, one after another.
                .offset(y: isDone && bobbing && mood != .resting ? -unit * 0.22 : 0)
                .animation(
                    reduceMotion ? nil : .easeInOut(duration: 0.55).repeatForever(autoreverses: true).delay(Double(i) * 0.12),
                    value: bobbing
                )
            }
            if mood == .struck {
                crossbar.transition(.scale(scale: 0.2, anchor: .leading).combined(with: .opacity))
            }
            face
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .keyframeAnimator(initialValue: CGFloat(0), trigger: jumps) { view, lift in
            view.offset(y: -lift)
        } keyframes: { _ in
            SpringKeyframe(unit * 0.9, duration: 0.16)
            SpringKeyframe(0, duration: 0.35, spring: .bouncy)
        }
        .task {
            guard !reduceMotion else { return }
            // Only once the screen has settled: started during a sheet's
            // slide-in, the repeating animation would repeat the slide too.
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else { return }
            bobbing = true
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Double.random(in: 2.6...4.2)))
                blink = true
                try? await Task.sleep(for: .milliseconds(120))
                blink = false
            }
        }
        .accessibilityElement()
        .accessibilityLabel("\(filled) of \(count) workouts this week")
    }

    /// The fourth stroke, across every bar, rising as the mark does.
    private var crossbar: some View {
        let first = origin(0)
        let left = CGPoint(x: first.x - 0.33 * unit, y: first.y + 1.4 * unit)
        let span = (CGFloat(count - 1) * Self.step.width + 1.85) * unit
        return Path { path in
            let rise = Self.slope * span
            path.move(to: left)
            path.addLine(to: CGPoint(x: left.x + span, y: left.y + rise))
            path.addLine(to: CGPoint(x: left.x + span - 0.04 * unit, y: left.y + rise + 0.44 * unit))
            path.addLine(to: CGPoint(x: left.x - 0.02 * unit, y: left.y + 0.44 * unit))
            path.closeSubpath()
        }
        .fill(SL.Signal.action)
    }

    /// Two eyes on the newest bar — or on the crossbar once the week is
    /// struck, or on the first dashed bar before the week has begun.
    @ViewBuilder
    private var face: some View {
        let anchor: CGPoint = {
            if mood == .struck {
                let first = origin(0)
                let mid = (CGFloat(count - 1) * Self.step.width + 1.85) / 2
                return CGPoint(x: first.x + (mid - 0.33) * unit, y: first.y + (1.4 + Self.slope * mid + 0.22) * unit)
            }
            let o = origin(max(filled - 1, 0))
            return CGPoint(x: o.x + 0.6 * unit, y: o.y + 0.82 * unit)
        }()
        let ink: Color = filled == 0 && mood != .struck ? lime : SL.Signal.onAction
        let eye = unit * 0.25
        let gap = unit * 0.13
        Group {
            switch mood {
            case .proud, .struck:
                // Happy: two little arches.
                HStack(spacing: gap * 0.6) {
                    ForEach(0..<2, id: \.self) { _ in
                        Arch().stroke(ink, style: StrokeStyle(lineWidth: eye * 0.8, lineCap: .round))
                            .frame(width: eye * 1.35, height: eye * 0.9)
                    }
                }
            case .resting:
                HStack(spacing: gap * 0.6) {
                    ForEach(0..<2, id: \.self) { _ in
                        Capsule().fill(ink).frame(width: eye * 1.15, height: eye * 0.6)
                    }
                }
            case .ready, .focused:
                HStack(spacing: gap) {
                    ForEach(0..<2, id: \.self) { _ in
                        Capsule().fill(ink)
                            .frame(width: eye * 1.05, height: blink ? eye * 0.3 : eye * 1.45)
                    }
                }
                .overlay(alignment: .top) {
                    if mood == .focused {
                        // Brows down: today there is a weight to beat.
                        HStack(spacing: gap * 1.2) {
                            Capsule().fill(ink).frame(width: eye * 1.8, height: eye * 0.5).rotationEffect(.degrees(18))
                            Capsule().fill(ink).frame(width: eye * 1.8, height: eye * 0.5).rotationEffect(.degrees(-18))
                        }
                        .offset(y: -eye * 1.4)
                    }
                }
            }
        }
        // The bar leans, so the face does too.
        .rotationEffect(.degrees(-8))
        .position(anchor)
        .offset(y: mood != .resting && filled > 0 && bobbing ? -unit * 0.22 : 0)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.55).repeatForever(autoreverses: true).delay(Double(max(filled - 1, 0)) * 0.12), value: bobbing)
        .animation(.easeOut(duration: 0.08), value: blink)
    }

    /// One bar of the mark: a slanted, sheared rep.
    private struct TallyBar: Shape {
        func path(in rect: CGRect) -> Path {
            let points = TallyMascot.barPoints.map { CGPoint(x: rect.minX + $0.x * rect.width, y: rect.minY + $0.y / 2.828 * rect.height) }
            var path = Path()
            path.addLines(points)
            path.closeSubpath()
            return path
        }
    }

    private struct Arch: Shape {
        func path(in rect: CGRect) -> Path {
            var path = Path()
            path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.maxY), control: CGPoint(x: rect.midX, y: rect.minY - rect.height * 0.6))
            return path
        }
    }
}
