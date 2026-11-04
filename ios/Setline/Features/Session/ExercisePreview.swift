import SwiftUI
import SetlineCore

/// The exercise, moving: its start and end photo one after the other, so the
/// form is there without a tap. Keyed by exercise, so a swap shows the new
/// one at once. An exercise without a faithful photo shows nothing.
struct ExercisePreview: View {
    let exerciseID: String
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showsEnd = false

    var body: some View {
        // An exercise added from the online library brings its own photos.
        let added = app.customExercises.first { $0.id == exerciseID }?.photoFolder
        let frames = added.map(ExerciseMedia.frames(folder:)) ?? ExerciseMedia.frames(for: exerciseID)
        if frames.count == 2 {
            ZStack(alignment: .bottomLeading) {
                ZStack {
                    photo(frames[0]).opacity(showsEnd ? 0 : 1)
                    photo(frames[1]).opacity(showsEnd ? 1 : 0)
                }
                .animation(.easeInOut(duration: 0.35), value: showsEnd)
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
            .task(id: exerciseID) {
                showsEnd = false
                guard !reduceMotion else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(1200))
                    guard !Task.isCancelled else { return }
                    showsEnd.toggle()
                }
            }
        }
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
