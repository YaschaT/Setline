import SwiftUI
import SetlineCore

/// The exercise, moving: its start and end photo one after the other, so the
/// form is there without a tap. Keyed by exercise, so a swap shows the new
/// one at once. An exercise without a faithful photo shows nothing.
///
/// Small by default, so the sets stay in view; bigger when you want to study
/// the form, or hidden once you know it. The choice is remembered.
struct ExercisePreview: View {
    let exerciseID: String
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage("setline.session.photoSize") private var size = Size.small.rawValue
    @State private var showsEnd = false

    enum Size: String { case small, large, hidden }

    private var current: Size { Size(rawValue: size) ?? .small }

    var body: some View {
        // An exercise added from the online library brings its own photos.
        let added = app.customExercises.first { $0.id == exerciseID }?.photoFolder
        let frames = added.map(ExerciseMedia.frames(folder:)) ?? ExerciseMedia.frames(for: exerciseID)
        if frames.count == 2 {
            Group {
                switch current {
                case .small: small(frames)
                case .large: large(frames)
                case .hidden: hiddenRow
                }
            }
            .task(id: "\(exerciseID)-\(size)") {
                showsEnd = false
                guard !reduceMotion, current != .hidden else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(1200))
                    guard !Task.isCancelled else { return }
                    showsEnd.toggle()
                }
            }
        }
    }

    private func set(_ next: Size) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.3)) { size = next.rawValue }
    }

    // MARK: - Small: a row beside the sets

    private func small(_ frames: [URL]) -> some View {
        HStack(spacing: SL.Space.s3) {
            Button { set(.large) } label: {
                photos(frames)
                    .frame(width: 96, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
            }
            .buttonStyle(SLPressStyle(scale: 0.96))
            .accessibilityLabel("Photos of the start and end position")
            .accessibilityHint("Shows them bigger")

            VStack(alignment: .leading, spacing: 6) {
                Text(showsEnd ? "End position" : "Start position")
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .contentTransition(.opacity)
                    .animation(.easeInOut(duration: 0.35), value: showsEnd)
                HStack(spacing: 4) {
                    phaseMark(lit: !showsEnd)
                    phaseMark(lit: showsEnd)
                }
                // The credit is on the big view, where it has room.
            }
            .accessibilityHidden(true)

            Spacer(minLength: 0)

            HStack(spacing: 0) {
                plainButton("arrow.up.left.and.arrow.down.right", "Show photos bigger") { set(.large) }
                plainButton("eye.slash", "Hide photos") { set(.hidden) }
            }
        }
        .padding(SL.Space.s2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: 1)
        )
        .transition(.opacity)
    }

    private func phaseMark(lit: Bool) -> some View {
        Capsule()
            .fill(lit ? SL.Signal.action : SL.Surface.hairlineStrong)
            .frame(width: 16, height: 4)
            .animation(.easeInOut(duration: 0.35), value: lit)
    }

    private func plainButton(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.88))
        .accessibilityLabel(label)
    }

    // MARK: - Large: the form, up close

    private func large(_ frames: [URL]) -> some View {
        ZStack(alignment: .bottomLeading) {
            photos(frames)
            Text(showsEnd ? "End" : "Start")
                .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                .tracking(0.6)
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(.black.opacity(0.45)))
                .padding(SL.Space.s2)
        }
        .overlay(alignment: .bottomTrailing) {
            Text(ExerciseMedia.credit)
                .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                .foregroundStyle(.white.opacity(0.85))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(.black.opacity(0.35)))
                .padding(SL.Space.s2)
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Photos of the start and end position")
        .overlay(alignment: .topTrailing) {
            HStack(spacing: 0) {
                photoButton("arrow.down.right.and.arrow.up.left", "Show photos smaller") { set(.small) }
                photoButton("eye.slash", "Hide photos") { set(.hidden) }
            }
            .padding(SL.Space.s1)
        }
        .transition(.opacity)
    }

    private func photoButton(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(Circle().fill(.black.opacity(0.45)))
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .contentShape(Circle())
        }
        .buttonStyle(SLPressStyle(scale: 0.88))
        .accessibilityLabel(label)
    }

    // MARK: - Hidden: one quiet way back

    private var hiddenRow: some View {
        Button { set(.small) } label: {
            HStack(spacing: 6) {
                Image(systemName: "photo")
                    .font(.system(size: 13, weight: .semibold))
                Text("Show exercise photos")
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
            }
            .foregroundStyle(SL.Ink.secondary)
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
        .transition(.opacity)
    }

    // MARK: - The two photos, crossfading

    private func photos(_ frames: [URL]) -> some View {
        ZStack {
            photo(frames[0]).opacity(showsEnd ? 0 : 1)
            photo(frames[1]).opacity(showsEnd ? 1 : 0)
        }
        .animation(.easeInOut(duration: 0.35), value: showsEnd)
    }

    private func photo(_ url: URL) -> some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                Rectangle().fill(SL.Surface.raised2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
}
