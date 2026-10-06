import SwiftUI
import SetlineCore

/// Every picture, oldest first, one after the other: the change the
/// comparison shows in two steps, in all of them. Played slow or fast, over
/// every picture or the last stretch of them, and stopped anywhere on the way
/// — each picture says how long after the first one it was taken.
struct PhotoTimelapse: View {
    let gallery: CheckInGallery
    let display: NumberDisplay
    let url: (CheckIn) -> URL?
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var period: CheckInGallery.Period = .all
    @State private var index = 0
    @State private var playing = false
    /// 0 is slow, 1 is fast.
    @State private var speed = 0.35
    @State private var shown: Shown?
    @State private var images = TimelapseImages()

    /// The picture on screen, kept until the next one is ready, so stepping
    /// faster than pictures can be read never flashes an empty frame.
    private struct Shown: Equatable {
        let id: String
        let image: UIImage
    }

    private var frames: [CheckInGallery.Frame] { gallery.frames(in: period) }
    private var periods: [CheckInGallery.Period] { gallery.periods() }

    private var frame: CheckInGallery.Frame? {
        frames.indices.contains(index) ? frames[index] : frames.last
    }

    /// From 1,6 s a picture at its slowest to 0,12 s at its fastest, each
    /// step along the slider the same felt change.
    private var interval: Double { 1.6 * pow(0.12 / 1.6, speed) }

    private struct Run: Hashable {
        let playing: Bool
        let period: CheckInGallery.Period
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            header
            if periods.count > 1 { periodChoice }
            picture
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            scrubber
            controls
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
        .padding(.bottom, SL.Space.s4)
        .background(SL.Surface.ground.ignoresSafeArea())
        .task(id: frame?.shown.checkIn.id) { await showCurrent() }
        .task(id: Run(playing: playing, period: period)) { await play() }
        .onChange(of: period) { _, _ in index = 0 }
        .slRespondsToTextSize()
    }

    // MARK: - Head

    private var header: some View {
        HStack(alignment: .top, spacing: SL.Space.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Tijdlijn")
                    .slTitle()
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                Text(summary)
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: SL.Space.s2)
            Button(action: onClose) {
                SLGlyph(name: .close, size: 16, fixed: true)
                    .foregroundStyle(SL.Ink.primary)
                    .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                    .background(Circle().fill(SL.Surface.raised2))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Sluiten")
        }
    }

    /// "12 opnames over 14 weken"
    private var summary: String {
        let count = frames.count == 1 ? "1 opname" : "\(frames.count) opnames"
        guard let last = frames.last else { return count }
        switch last.since {
        case .sameDay: return "\(count) op één dag"
        case .days(let days): return "\(count) over \(days == 1 ? "1 dag" : "\(days) dagen")"
        case .weeks(let weeks): return "\(count) over \(weeks == 1 ? "1 week" : "\(weeks) weken")"
        }
    }

    private var periodChoice: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SL.Space.s2) {
                ForEach(periods, id: \.self) { option in
                    SLChip(title: name(option), look: option == period ? .selected : .unselected) {
                        playing = false
                        period = option
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Periode")
    }

    private func name(_ period: CheckInGallery.Period) -> String {
        switch period {
        case .all: return "Alles"
        case .year: return "1 jaar"
        case .halfYear: return "6 maanden"
        case .quarter: return "3 maanden"
        case .month: return "1 maand"
        }
    }

    // MARK: - The picture

    private var picture: some View {
        Rectangle()
            .fill(SL.Surface.raised2)
            .overlay {
                if let shown {
                    Image(uiImage: shown.image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .id(shown.id)
                        .transition(.opacity)
                }
            }
            .clipped()
            .overlay(alignment: .bottomLeading) { caption }
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
            .accessibilityElement()
            .accessibilityLabel(frame.map { "Opname \(spoken($0))" } ?? "Geen opname")
    }

    /// The date large, and under it how long after the first picture it was
    /// taken, with the day's weigh-in when there is one.
    private var caption: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let frame {
                Text(date(frame.shown.date))
                    .font(.slFixed(SL.TypeSize.title, SL.Weight.semibold))
                    .slNumerals()
                Text(detail(frame))
                    .font(.slFixed(SL.TypeSize.body, SL.Weight.regular))
                    .slNumerals()
                    .opacity(0.85)
            }
        }
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SL.Space.s4)
        .padding(.top, SL.Space.s6)
        .background(
            LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .top, endPoint: .bottom)
        )
        .accessibilityHidden(true)
    }

    /// "6 okt 2026"
    private func date(_ date: Date) -> String {
        "\(display.shortDate(date)) \(Calendar.current.component(.year, from: date))"
    }

    /// "start · 84,2 kg", "na 14 weken · 81,6 kg"
    private func detail(_ frame: CheckInGallery.Frame) -> String {
        let when: String
        switch frame.since {
        case .sameDay: when = frame.shown.checkIn.id == frames.first?.shown.checkIn.id ? "start" : "zelfde dag"
        case .days(let days): when = days == 1 ? "na 1 dag" : "na \(days) dagen"
        case .weeks(let weeks): when = weeks == 1 ? "na 1 week" : "na \(weeks) weken"
        }
        return [when, frame.shown.weightKg.map(display.kg)].compactMap { $0 }.joined(separator: " · ")
    }

    private func spoken(_ frame: CheckInGallery.Frame) -> String {
        "\(index + 1) van \(frames.count), \(date(frame.shown.date)), \(detail(frame))"
    }

    // MARK: - Where it is, and how fast

    private var scrubber: some View {
        VStack(spacing: 2) {
            Slider(
                value: Binding(
                    get: { Double(min(index, max(frames.count - 1, 0))) },
                    set: { value in
                        playing = false
                        index = Int(value.rounded())
                    }
                ),
                in: 0...Double(max(frames.count - 1, 1)),
                step: 1
            )
            .tint(SL.Signal.action)
            .accessibilityLabel("Opname")
            .accessibilityValue(frame.map(spoken) ?? "")

            HStack {
                Text(frames.first.map { date($0.shown.date) } ?? "").slMeta()
                Spacer(minLength: SL.Space.s2)
                Text("\(min(index + 1, frames.count)) / \(frames.count)").slMeta()
                Spacer(minLength: SL.Space.s2)
                Text(frames.last.map { date($0.shown.date) } ?? "").slMeta()
            }
            .slNumerals()
            .foregroundStyle(SL.Ink.secondary)
            .accessibilityHidden(true)
        }
    }

    private var controls: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s4))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s4))
        return layout {
            Button {
                if !playing, index >= frames.count - 1 { index = 0 }
                playing.toggle()
            } label: {
                Image(systemName: playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(SL.Signal.onAction)
                    .frame(width: 64, height: 64)
                    .background(Circle().fill(SL.Signal.action))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .slFocusRing(Circle())
            .accessibilityLabel(playing ? "Pauzeer" : "Afspelen")

            VStack(alignment: .leading, spacing: 2) {
                Text("Snelheid")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                HStack(spacing: SL.Space.s2) {
                    Text("Traag").slMeta().foregroundStyle(SL.Ink.secondary)
                    Slider(value: $speed, in: 0...1)
                        .tint(SL.Signal.action)
                        .accessibilityLabel("Snelheid")
                        .accessibilityValue(String(format: "%.1f seconden per opname", interval).replacingOccurrences(of: ".", with: ","))
                    Text("Snel").slMeta().foregroundStyle(SL.Ink.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Playing

    /// Steps on while playing: the next picture read before it is due, then
    /// shown when its time comes. At the last picture it stops there — the
    /// latest is what it was played to see — and plays from the start again
    /// when asked.
    private func play() async {
        guard playing else { return }
        while !Task.isCancelled, playing {
            let next = index + 1
            guard frames.indices.contains(next) else {
                playing = false
                return
            }
            let started = Date()
            _ = await images.load(frames[next].shown.checkIn, from: url(frames[next].shown.checkIn))
            // And the one after, while this one is on screen.
            if frames.indices.contains(next + 1) {
                let after = frames[next + 1].shown.checkIn
                Task { _ = await images.load(after, from: url(after)) }
            }
            let wait = interval - Date().timeIntervalSince(started)
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled, playing else { return }
            index = next
        }
    }

    private func showCurrent() async {
        guard let frame else {
            shown = nil
            return
        }
        let checkIn = frame.shown.checkIn
        guard let image = await images.load(checkIn, from: url(checkIn)), !Task.isCancelled else { return }
        let fade = reduceMotion ? nil : Animation.easeInOut(duration: min(0.3, interval * 0.6))
        withAnimation(fade) { shown = Shown(id: checkIn.id, image: image) }
    }
}

/// The player's pictures, read small and kept only for as long as memory
/// allows — a year of weekly photos never sits decoded all at once.
@MainActor
final class TimelapseImages {
    private let cache = NSCache<NSString, UIImage>()

    init() {
        cache.countLimit = 24
    }

    /// The picture, read now if it is not already at hand.
    func load(_ checkIn: CheckIn, from url: URL?) async -> UIImage? {
        let key = checkIn.id as NSString
        if let image = cache.object(forKey: key) { return image }
        guard let url else { return nil }
        let image = await Task.detached(priority: .userInitiated) {
            PhotoThumbnail.load(url, maxPixels: 1200)
        }.value
        if let image { cache.setObject(image, forKey: key) }
        return image
    }
}
