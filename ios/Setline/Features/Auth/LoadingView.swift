import SwiftUI

/// While the app finds out who is signed in and reads their training: at
/// launch, and after signing in on a phone that holds no copy of the account
/// yet (`AppState.isLoading`).
///
/// SETLINE Loader v2 (SETLINE Redesign): the mark builds itself — three reps
/// drop in, the bar slides through them, the whole mark lifts once — then the
/// wordmark rises and the mark keeps doing small reps, counted by three ticks
/// beside "Warming up…", until the training is there. The timings, curves and
/// geometry are the design file's, in its 880 × 780 viewBox.
///
/// It shows only after a moment, so a quick launch never flashes it, and the
/// animation starts when it shows. With Reduce Motion the finished mark and
/// wordmark stand still.
struct LoadingView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start: Date?

    /// How fast the intro plays. The cold launch plays it at 1.6×, so the
    /// whole mark-and-wordmark moment lasts about two seconds.
    var speed: Double = 1
    /// How long to wait before showing anything: a moment after sign-in, so a
    /// quick load never flashes it; nothing at a cold launch, which is the
    /// one place the intro is meant to be seen.
    var delay: Duration = .milliseconds(300)
    /// Called once the wordmark has landed (or at once-ish with Reduce
    /// Motion), so the launch can hold the intro until it is complete.
    var onIntroFinished: (() -> Void)? = nil

    /// When, in design seconds, the wordmark, its line and the caption are in.
    private static let introLength: Double = 3.4

    var body: some View {
        Group {
            if let start {
                if reduceMotion {
                    LoaderStage(frame: LoaderFrame(t: LoaderFrame.settled, idle: false))
                } else {
                    TimelineView(.animation) { context in
                        LoaderStage(frame: LoaderFrame(t: context.date.timeIntervalSince(start) * speed, idle: true))
                    }
                }
            } else {
                Color.clear
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SL.Surface.ground)
        .ignoresSafeArea()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading your training.")
        .slRespondsToTextSize()
        .task {
            if delay > .zero { try? await Task.sleep(for: delay) }
            start = Date()
            guard let onIntroFinished else { return }
            let seconds = reduceMotion ? 0.8 : Self.introLength / speed
            try? await Task.sleep(for: .seconds(seconds))
            onIntroFinished()
        }
    }
}

// MARK: - One moment of the animation

/// Everything the stage draws at time `t`, worked out once per frame.
private struct LoaderFrame {
    /// A moment after the intro, when everything has landed.
    static let settled: Double = 3.0

    struct Bar {
        let points: [CGPoint]
        /// Where its sparks fly from.
        let base: CGPoint
        /// The direction it drops along (it falls in against this).
        let direction: CGVector
        /// The bottom middle of its outline: what it squashes about.
        var anchor: CGPoint {
            let xs = points.map(\.x)
            return CGPoint(x: (xs.min()! + xs.max()!) / 2, y: points.map(\.y).max()!)
        }
    }

    static let bars: [Bar] = [
        Bar(points: [.init(x: 360, y: 500), .init(x: 485, y: 432), .init(x: 418, y: 918), .init(x: 293, y: 975)],
            base: .init(x: 355, y: 946), direction: .init(dx: 0.138, dy: -0.99)),
        Bar(points: [.init(x: 578, y: 415), .init(x: 707, y: 348), .init(x: 632, y: 898), .init(x: 500, y: 970)],
            base: .init(x: 566, y: 934), direction: .init(dx: 0.15, dy: -0.989)),
        Bar(points: [.init(x: 805, y: 345), .init(x: 935, y: 278), .init(x: 855, y: 870), .init(x: 720, y: 938)],
            base: .init(x: 787, y: 904), direction: .init(dx: 0.15, dy: -0.989)),
    ]
    static let crossbar: [CGPoint] = [
        .init(x: 232, y: 700), .init(x: 1012, y: 470), .init(x: 1005, y: 555), .init(x: 228, y: 782),
    ]

    /// A bar while it falls or settles.
    struct BarPose {
        var visible: Bool
        var offset: Double
        var scale: CGSize
        /// Earlier positions drawn faintly behind a falling bar: (offset, opacity).
        var trails: [(Double, Double)]
        /// 0…1 through its sparks on landing, if they are flying.
        var sparks: Double?
    }

    let t: Double
    let idle: Bool

    // Timings (seconds).
    private static let drop = 0.26
    private static func dropStart(_ i: Int) -> Double { 0.35 + Double(i) * 0.24 }
    private static func landing(_ i: Int) -> Double { dropStart(i) + drop }
    private static let slideStart = 1.12, slideLength = 0.2
    private static var slideEnd: Double { slideStart + slideLength }

    private static func clamp(_ x: Double) -> Double { max(0, min(1, x)) }
    private static func outCubic(_ x: Double) -> Double { 1 - pow(1 - x, 3) }
    private static func outQuint(_ x: Double) -> Double { 1 - pow(1 - x, 5) }
    private static func inOutCubic(_ x: Double) -> Double {
        x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2
    }

    /// The camera shake: each landing knocks the stage, the bar hardest.
    var shake: Double {
        var shake = 0.0
        for i in 0..<3 {
            let d = t - Self.landing(i)
            if d > 0 { shake += 4 * exp(-14 * d) * sin(d * 70) }
        }
        let d = t - Self.slideEnd
        if d > 0 { shake += 9 * exp(-10 * d) * sin(d * 62) }
        return shake
    }

    func bar(_ i: Int) -> BarPose {
        let p = Self.clamp((t - Self.dropStart(i)) / Self.drop)
        let offset = { (p: Double) in (1 - p * p) * 900 }
        let q = max(0, t - Self.landing(i))
        var sy = 1.0
        if p > 0, p < 1 {
            sy = 1 + 0.3 * (1 - p)
        } else if p >= 1 {
            sy = 1 - 0.2 * exp(-7 * q) * cos(q * .pi * 4.5)
        }
        let sx = 1 + (1 - sy) * 0.5
        let falling = p > 0 && p < 1
        return BarPose(
            visible: p > 0,
            offset: offset(p),
            scale: CGSize(width: sx, height: sy),
            trails: falling
                ? [0.16, 0.32].enumerated().map { k, lag in (offset(max(0, p - lag)), 0.22 - Double(k) * 0.1) }
                : [],
            sparks: q > 0 && q < 0.45 ? Self.outCubic(q / 0.45) : nil
        )
    }

    /// 0…1: how far the bar has slid through the reps.
    var slide: Double { Self.outQuint(Self.clamp((t - Self.slideStart) / Self.slideLength)) }

    /// 1 → 0: the white flash when the bar locks in.
    var flash: Double {
        let f = Self.clamp((t - Self.slideEnd) / 0.35)
        return f > 0 ? 1 - f : 0
    }

    /// 0…1 through the ring that spreads from the lock-in, if it is spreading.
    var ring: Double? {
        let s = Self.clamp((t - Self.slideEnd) / 0.7)
        return s > 0 && s < 1 ? Self.outCubic(s) : nil
    }

    /// The whole mark: its lift, then its reps.
    var mark: (y: Double, scale: CGSize, reps: Int) {
        let l = Self.clamp((t - 1.62) / 0.9)
        var ly = 0.0, sx = 1.0, sy = 1.0
        if l > 0, l < 0.24 {
            let k = Self.inOutCubic(l / 0.24)
            sy = 1 - 0.12 * k
            sx = 1 + 0.07 * k
        } else if l >= 0.24, l < 0.64 {
            let k = (l - 0.24) / 0.4
            ly = -96 * sin(k * .pi)
            let stretch = cos(k * .pi)
            sy = 1 + 0.1 * abs(stretch) * (k < 0.5 ? 1 : 0.6) - 0.12 * (k < 0.12 ? 1 - k / 0.12 : 0)
            sx = 2 - sy
        } else if l >= 0.64, l < 1 {
            let k = (l - 0.64) / 0.36
            let d = exp(-4.5 * k) * cos(k * .pi * 2.6)
            sy = 1 - 0.09 * d
            sx = 1 + 0.05 * d
        }

        let it = t - 3.1
        var iy = 0.0, squash = 1.0, reps = 0
        if idle, it > 0 {
            let ph = it.truncatingRemainder(dividingBy: 1.5) / 1.5
            reps = Int(it / 1.5) % 4
            if ph < 0.16 {
                squash = 1 - 0.06 * sin(ph / 0.16 * .pi)
            } else if ph < 0.6 {
                iy = -22 * sin((ph - 0.16) / 0.44 * .pi)
            } else if ph < 0.72 {
                squash = 1 - 0.04 * sin((ph - 0.6) / 0.12 * .pi)
            }
            if ph >= 0.38 { reps += 1 }
            reps %= 4
        }
        return (ly + iy, CGSize(width: sx * (2 - squash), height: sy * squash), reps)
    }

    var shadowVisible: Bool { t > Self.landing(0) }

    func letter(_ i: Int) -> Double { Self.outQuint(Self.clamp((t - 2.5 - Double(i) * 0.045) / 0.55)) }
    var underline: Double { Self.outQuint(Self.clamp((t - 2.75) / 0.6)) }
    var caption: Double { Self.clamp((t - 2.95) / 0.45) }
}

// MARK: - The stage

/// Laid out as the design's 390 × 844 artboard: the mark and wordmark a
/// little above the middle, the caption 64 pt from the bottom.
private struct LoaderStage: View {
    let frame: LoaderFrame

    private static let markSize = CGSize(width: 226, height: 200)
    private static let wordSize: CGFloat = 24
    private static let wordLine: CGFloat = 24 * 1.15
    private static let tracking: CGFloat = 24 * 0.3

    var body: some View {
        let mark = frame.mark
        let shake = frame.shake
        GeometryReader { proxy in
            let size = proxy.size
            // The design's column (mark, 8 gap, shadow, 36, wordmark) is
            // centred with a −40 top margin: its top sits 168.8 above centre.
            let markTop = size.height / 2 - 168.8
            ZStack(alignment: .topLeading) {
                Canvas { context, _ in
                    draw(in: &context, origin: CGPoint(x: size.width / 2 - Self.markSize.width / 2, y: markTop), mark: mark)
                }

                shadow(lift: mark.y)
                    .position(x: size.width / 2, y: markTop + Self.markSize.height + 8 + 6)

                wordmark
                    .position(x: size.width / 2, y: markTop + 220 + 36 + (Self.wordLine + 12 + 2) / 2)

                caption(reps: mark.reps)
                    .position(x: size.width / 2, y: size.height - 64 - 10)
            }
            .offset(x: shake * 0.4, y: shake)
        }
    }

    // MARK: Mark

    private static let lime = SL.Signal.action
    private static let hot = Color(hex: 0xF4FFE0)
    private static let joint = StrokeStyle(lineWidth: 16, lineJoin: .round)

    private func draw(in context: inout GraphicsContext, origin: CGPoint, mark: (y: Double, scale: CGSize, reps: Int)) {
        // The svg box, squashed and lifted about its bottom middle…
        let box = Self.markSize
        context.translateBy(x: origin.x + box.width / 2, y: origin.y + box.height + mark.y)
        context.scaleBy(x: mark.scale.width, y: mark.scale.height)
        context.translateBy(x: -box.width / 2, y: -box.height)
        // …and the 880 × 780 viewBox fitted into it.
        let unit = box.height / 780
        context.translateBy(x: (box.width - 880 * unit) / 2, y: 0)
        context.scaleBy(x: unit, y: unit)
        context.translateBy(x: -180, y: -240)

        let poses = (0..<3).map(frame.bar)

        // Behind the bars: trails, sparks, speed lines, the ring.
        for (i, pose) in poses.enumerated() {
            let bar = LoaderFrame.bars[i]
            for (offset, opacity) in pose.trails {
                var trail = context
                trail.opacity = opacity
                place(bar, offset: offset, scale: pose.scale, in: &trail)
                fill(bar.points, Self.lime, in: trail)
            }
            if let k = pose.sparks {
                for degrees in [-168.0, -140, -112, -68, -40, -12] {
                    let r = degrees * .pi / 180
                    let r1 = 30 + 150 * k, r2 = r1 + 60 * (1 - k) + 8
                    var line = Path()
                    line.move(to: .init(x: bar.base.x + cos(r) * r1, y: bar.base.y + 20 + sin(r) * r1 * 0.6))
                    line.addLine(to: .init(x: bar.base.x + cos(r) * r2, y: bar.base.y + 20 + sin(r) * r2 * 0.6))
                    context.stroke(line, with: .color(Self.lime.opacity(1 - k)), style: .init(lineWidth: 10, lineCap: .round))
                }
            }
        }
        let slide = frame.slide
        if slide > 0, slide < 1 {
            let x = 200 + 840 * slide
            for k in 0..<3 {
                let kk = Double(k)
                var line = Path()
                line.move(to: .init(x: x - 260 - kk * 40, y: 760 - (x - 260 - 228) * 0.295 - 40 + kk * 40))
                line.addLine(to: .init(x: x - 40, y: 760 - (x - 40 - 228) * 0.295 - 40 + kk * 40))
                context.stroke(line, with: .color(Self.hot.opacity(0.5 - kk * 0.12)),
                               style: .init(lineWidth: 6 - kk * 1.5, lineCap: .round))
            }
        }
        if let k = frame.ring {
            let ring = Path(ellipseIn: CGRect(x: 620 - (120 + 820 * k), y: 640 - (100 + 700 * k),
                                              width: 2 * (120 + 820 * k), height: 2 * (100 + 700 * k)))
            context.stroke(ring, with: .color(Self.lime.opacity((1 - k) * 0.55)), lineWidth: 14 * (1 - k) + 1)
        }

        // The reps.
        for (i, pose) in poses.enumerated() where pose.visible {
            var bar = context
            place(LoaderFrame.bars[i], offset: pose.offset, scale: pose.scale, in: &bar)
            fill(LoaderFrame.bars[i].points, Self.lime, in: bar)
        }

        // The bar, revealed as it slides in.
        var crossbar = context
        crossbar.clip(to: Path(CGRect(x: 180, y: 380, width: 860 * slide + 20, height: 460)))
        fill(LoaderFrame.crossbar, Self.lime, in: crossbar)

        let flash = frame.flash
        if flash > 0 {
            var lit = context
            lit.opacity = flash * 0.85
            fill(LoaderFrame.crossbar, Self.hot, in: lit)
            for bar in LoaderFrame.bars {
                fill(bar.points, Self.hot.opacity(0.5), in: lit)
            }
        }
    }

    /// Moves a bar along its drop line and squashes it about its foot.
    private func place(_ bar: LoaderFrame.Bar, offset: Double, scale: CGSize, in context: inout GraphicsContext) {
        let anchor = bar.anchor
        context.translateBy(x: anchor.x + bar.direction.dx * offset, y: anchor.y + bar.direction.dy * offset)
        context.scaleBy(x: scale.width, y: scale.height)
        context.translateBy(x: -anchor.x, y: -anchor.y)
    }

    /// A shape of the mark: filled, with the 16-unit round outline that
    /// softens its corners.
    private func fill(_ points: [CGPoint], _ color: Color, in context: GraphicsContext) {
        var path = Path()
        path.addLines(points)
        path.closeSubpath()
        context.fill(path, with: .color(color))
        context.stroke(path, with: .color(color), style: Self.joint)
    }

    // MARK: Shadow, wordmark, caption

    private func shadow(lift: Double) -> some View {
        let scale = 1 + lift / 200
        // CSS `radial-gradient(closest-side, …)`: an ellipse touching the
        // box's sides.
        return Rectangle()
            .fill(EllipticalGradient(colors: [SL.Signal.action.opacity(0.22), SL.Signal.action.opacity(0)],
                                     center: .center, startRadiusFraction: 0, endRadiusFraction: 0.5))
            .frame(width: 170, height: 12)
            .scaleEffect(x: max(0.45, scale), y: 1)
            .opacity(frame.shadowVisible ? min(1, max(0.3, scale)) : 0)
    }

    private var wordmark: some View {
        VStack(spacing: 12) {
            HStack(spacing: Self.tracking) {
                ForEach(Array("SETLINE".enumerated()), id: \.offset) { i, letter in
                    Text(String(letter))
                        .font(SLTypeface.font(size: Self.wordSize, weight: .bold, width: 125))
                        .foregroundStyle(SL.Ink.primary)
                        .frame(height: Self.wordLine)
                        .offset(y: (1 - frame.letter(i)) * Self.wordLine * 1.1)
                }
            }
            .frame(height: Self.wordLine)
            .clipped()

            Capsule()
                .fill(SL.Signal.action)
                .frame(width: 132, height: 2)
                .scaleEffect(x: frame.underline, y: 1, anchor: .leading)
        }
        .fixedSize()
    }

    private func caption(reps: Int) -> some View {
        HStack(spacing: 12) {
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(reps > i ? SL.Signal.action : SL.Surface.hairlineStrong)
                        .frame(width: 5, height: 18)
                        .scaleEffect(x: 1, y: reps == i + 1 ? 1.15 : 1)
                        .transformEffect(Self.skew)
                }
            }
            Text("Warming up…")
                .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                .foregroundStyle(SL.Ink.secondary)
        }
        .fixedSize()
        .opacity(frame.caption)
        .offset(y: (1 - frame.caption) * 8)
    }

    /// CSS `skewX(-9deg)` about the tick's centre (5 × 18).
    private static let skew: CGAffineTransform = {
        let c = tan(-9 * Double.pi / 180)
        return CGAffineTransform(a: 1, b: 0, c: c, d: 1, tx: -c * 9, ty: 0)
    }()
}

#Preview {
    LoadingView()
}
