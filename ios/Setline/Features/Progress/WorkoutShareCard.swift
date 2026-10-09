import SwiftUI
import SetlineCore

/// A workout as a picture to share: story-sized, in the app's own colours,
/// with the numbers that say what the day was — volume, time, sets — the
/// medals it earned and the streak it kept. Drawn at fixed sizes, since it
/// is an image and not a screen.
struct WorkoutShareCard: View {
    let session: TrainingSession
    let medals: [LiftMedal]
    let streakWeeks: Int
    let display: NumberDisplay

    static let size = CGSize(width: 360, height: 640)

    private var volume: Decimal { RecordsEngine.volumeLoad(session.results.flatMap(\.sets)) }
    private var setCount: Int { session.results.flatMap(\.sets).filter(\.countsTowardVolume).count }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("SETLINE")
                    .font(.slFixed(13, SL.Weight.bold))
                    .tracking(3)
                    .foregroundStyle(SL.Signal.action)
                Spacer()
                Text(display.shortDate(session.date))
                    .font(.slFixed(13, SL.Weight.medium))
                    .foregroundStyle(SL.Ink.secondary)
            }

            Spacer(minLength: 0)

            Text(WeekPlan.fullWeekday(session.date).uppercased())
                .font(.slFixed(12, SL.Weight.bold))
                .tracking(1.5)
                .foregroundStyle(SL.Ink.secondary)
            Text(session.dayLabel)
                .font(.slFixed(64, SL.Weight.bold))
                .tracking(-2)
                .foregroundStyle(SL.Ink.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            HStack(alignment: .top, spacing: 0) {
                stat(display.volumeKg(volume), "volume")
                if let seconds = session.durationSeconds, seconds > 0 {
                    stat(display.minutes(seconds), "time")
                }
                stat("\(setCount)", "sets")
            }
            .padding(.top, 20)

            if !medals.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(medals.prefix(3)) { medal in
                        HStack(spacing: 12) {
                            SLMedal(place: medal.place, size: 30)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(medal.name)
                                    .font(.slFixed(15, SL.Weight.semibold))
                                    .foregroundStyle(SL.Ink.primary)
                                    .lineLimit(1)
                                Text("\(medal.place.title) · \(display.kg(medal.weightKg)) × \(medal.reps)")
                                    .font(.slFixed(12, SL.Weight.regular))
                                    .foregroundStyle(SL.Ink.secondary)
                            }
                        }
                    }
                    if medals.count > 3 {
                        Text("+\(medals.count - 3) more medals")
                            .font(.slFixed(12, SL.Weight.medium))
                            .foregroundStyle(SL.Ink.secondary)
                    }
                }
                .padding(.top, 28)
            }

            Spacer(minLength: 0)

            if streakWeeks > 0 {
                HStack(spacing: 8) {
                    Image(systemName: "flame")
                        .font(.system(size: 15, weight: .semibold))
                    Text(streakWeeks == 1 ? "1-week streak" : "\(streakWeeks)-week streak")
                        .font(.slFixed(15, SL.Weight.semibold))
                }
                .foregroundStyle(SL.Signal.onAction)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(Capsule().fill(SL.Signal.action))
            }
        }
        .padding(28)
        .frame(width: Self.size.width, height: Self.size.height, alignment: .topLeading)
        .background(SL.Surface.ground)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.slFixed(20, SL.Weight.bold))
                .foregroundStyle(SL.Ink.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.slFixed(12, SL.Weight.regular))
                .foregroundStyle(SL.Ink.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The card as an image, three times its points for a sharp story.
    @MainActor
    func image() -> Image? {
        let renderer = ImageRenderer(content: self)
        renderer.scale = 3
        guard let picture = renderer.uiImage else { return nil }
        #if DEBUG
        // `-SetlineDumpShareCard` writes the card to the app's tmp folder,
        // so it can be looked at without going through the share sheet.
        if ProcessInfo.processInfo.arguments.contains("-SetlineDumpShareCard") {
            try? picture.pngData()?.write(to: FileManager.default.temporaryDirectory.appendingPathComponent("sharecard.png"))
        }
        #endif
        return Image(uiImage: picture)
    }
}
