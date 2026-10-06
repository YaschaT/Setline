import SwiftUI

/// While the app finds out who is signed in and reads their training: at
/// launch, and after signing in on a phone that holds no copy of the account
/// yet (`AppState.isLoading`).
///
/// A ring says something is happening and one line says what; under it,
/// Training's week and day drawn as empty shapes, so the screen that follows
/// fills in what was already sketched. It shows only after a moment, so a
/// quick launch never flashes it, and with Reduce Motion the ring and the
/// sheen stand still.
struct LoadingView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visible = false

    /// Monday first, as the strip reads: today's place among the seven.
    private let today = (Calendar.current.component(.weekday, from: Date()) + 5) % 7

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            content(
                turn: reduceMotion ? 0 : time.truncatingRemainder(dividingBy: 1.1) / 1.1,
                sheen: reduceMotion ? nil : time.truncatingRemainder(dividingBy: 1.8) / 1.8
            )
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SL.Surface.ground.ignoresSafeArea())
        .opacity(visible ? 1 : 0)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Je training wordt geladen. Even je planning ophalen.")
        .task {
            try? await Task.sleep(for: .milliseconds(300))
            withAnimation(.easeOut(duration: 0.25)) { visible = true }
        }
        .slRespondsToTextSize()
    }

    private func content(turn: Double, sheen: Double?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("SETLINE")
                .font(.sl(SL.TypeSize.lead, SL.Weight.bold))
                .tracking(SL.TypeSize.lead * 0.04)
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s5)

            VStack(spacing: SL.Space.s2) {
                ring(turn: turn)
                    .padding(.bottom, SL.Space.s5)
                Text("Je training wordt geladen")
                    .slTitle()
                    .foregroundStyle(SL.Ink.primary)
                Text("Even je planning ophalen.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
            .padding(.top, SL.Space.s10)

            skeleton(sheen: sheen)
                .padding(.top, SL.Space.s8)
        }
    }

    // MARK: - The ring

    /// A lime arc fading into its own tail, a turn a little over a second.
    private func ring(turn: Double) -> some View {
        ZStack {
            Circle()
                .stroke(SL.Surface.raised2, lineWidth: 6)
            Circle()
                .trim(from: 0, to: 0.72)
                .stroke(
                    AngularGradient(
                        colors: [SL.Signal.action.opacity(0), SL.Signal.action],
                        center: .center,
                        startAngle: .degrees(0),
                        endAngle: .degrees(0.72 * 360)
                    ),
                    style: StrokeStyle(lineWidth: 6, lineCap: .round)
                )
                .rotationEffect(.degrees(turn * 360 - 90))
        }
        .frame(width: 72, height: 72)
    }

    // MARK: - Training, sketched

    private func skeleton(sheen: Double?) -> some View {
        shapes
            .overlay {
                if let sheen {
                    GeometryReader { proxy in
                        let width = proxy.size.width
                        LinearGradient(
                            colors: [.clear, Color.white.opacity(0.06), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: width * 0.6)
                        .offset(x: -width * 0.6 + sheen * width * 1.6)
                    }
                    .mask(shapes)
                }
            }
    }

    /// The week strip and a day card, at the sizes Training gives them.
    private var shapes: some View {
        VStack(spacing: SL.Space.s3) {
            HStack(spacing: SL.Space.s2) {
                ForEach(0..<7, id: \.self) { day in
                    bone(height: 40, radius: 10, lit: day == today)
                }
            }
            .padding(SL.Space.s3)
            .background(card(radius: SL.Radius.lg))

            VStack(alignment: .leading, spacing: SL.Space.s3) {
                bone(height: 72, radius: SL.Radius.md)
                bone(height: 18).padding(.trailing, 110)
                bone(height: 14).padding(.trailing, 170)
                HStack(spacing: SL.Space.s2) {
                    Circle().fill(Self.boneFill).frame(width: 22, height: 22)
                    bone(height: 12).frame(width: 120)
                }
                bone(height: 48, radius: SL.Radius.md)
            }
            .padding(SL.Space.s4)
            .background(card(radius: SL.Radius.xl))
        }
    }

    private static let boneFill = Color.white.opacity(0.07)

    private func bone(height: CGFloat, radius: CGFloat = 6, lit: Bool = false) -> some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(lit ? Color.white.opacity(0.16) : Self.boneFill)
            .frame(maxWidth: .infinity)
            .frame(height: height)
    }

    private func card(radius: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(SL.Surface.raised)
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
            )
    }
}
