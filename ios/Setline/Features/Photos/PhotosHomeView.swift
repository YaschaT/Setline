import PhotosUI
import SwiftUI
import SetlineCore

/// Redesign 1e · Foto's.
///
/// Two pictures the same size, far enough apart in time to show something, and
/// what lies between them; under that, every picture in a grid. The first
/// against the latest is what it opens on, and any two can be compared
/// instead — over each other with a line to slide between them, or side by
/// side. `Afspelen` steps through every picture, oldest first.
///
/// The photos never leave the phone, which the screen says out loud rather
/// than implying, and on the phone they are the signed-in account's alone
/// (`AppState.photos`).
struct PhotosHomeView: View {
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The avatar's way to Account, as on Training.
    var onAccount: () -> Void = {}
    /// The due mark breathes, like today's on Training.
    @State private var breathes = false
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var checkIns: [CheckIn] = []
    @State private var picking: PhotosPickerItem?
    @State private var removing: CheckIn?
    @State private var failure: String?
    /// Whose photos are on screen; another account signed in reads its own.
    @State private var shownOwner: PhotoOwner?
    /// The two pictures chosen for the comparison, by id. Empty is the default
    /// pair: the first against the latest.
    @State private var chosen: [String] = []
    @State private var choosing = false
    @State private var viewing: Viewed?
    @State private var playingTimeline = false
    /// Over each other or side by side; remembered on this phone.
    @AppStorage("setline.photos.compareMode") private var compareMode: CompareMode = .overlay
    /// Holding a picture asks to remove it; the tap that ends the hold must
    /// not open it as well.
    @State private var heldTile = false

    private struct Viewed: Identifiable { let id: String }

    private enum CompareMode: String {
        case overlay
        case sideBySide
    }

    private var gallery: CheckInGallery {
        CheckInGallery.make(checkIns, metrics: app.metrics)
    }

    private var comparison: CheckInGallery.Comparison? {
        gallery.comparison(chosen.first, chosen.count > 1 ? chosen[1] : nil)
    }

    var body: some View {
        ScrollView {
            // 24 between sections, 8 from a section's head to its card.
            VStack(alignment: .leading, spacing: SL.Space.s6) {
                header
                hero
                    .padding(.top, SL.Space.s5)

                if let failure {
                    SLAttentionCard(title: "Didn't work") {
                        Text(failure)
                            .slBody()
                            .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(SL.Ink.primary)
                    }
                }

                if gallery.all.count > 1 {
                    comparisonSection
                }
                if !gallery.all.isEmpty {
                    allSection
                }

            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)
            .padding(.bottom, SL.Space.s6)
        }
        .task(id: app.photos?.owner) {
            guard let photos = app.photos else {
                checkIns = []
                shownOwner = nil
                return
            }
            guard shownOwner != photos.owner else { return }
            chosen = []
            checkIns = await photos.load()
            shownOwner = photos.owner
        }
        .onChange(of: picking) { _, item in
            guard let item else { return }
            Task { await add(item) }
        }
        .confirmationDialog(
            "Delete this photo?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let checkIn = removing { Task { await remove(checkIn) } }
                removing = nil
            }
            Button("Cancel", role: .cancel) { removing = nil }
        } message: {
            Text("The photo is deleted from this phone.")
        }
        .onChange(of: removing?.id) { _, open in
            if open == nil { heldTile = false }
        }
        .sheet(isPresented: $choosing) {
            ComparePicker(
                all: gallery.all,
                initial: comparison.map { [$0.before.checkIn.id, $0.after.checkIn.id] } ?? [],
                picture: { picture($0) },
                label: { label($0) },
                onDone: { pair in
                    chosen = pair
                    choosing = false
                },
                onReset: {
                    chosen = []
                    choosing = false
                },
                onClose: { choosing = false }
            )
        }
        .fullScreenCover(isPresented: $playingTimeline) {
            PhotoTimelapse(
                gallery: gallery,
                display: app.display,
                url: { app.photos?.url(for: $0) },
                onClose: { playingTimeline = false }
            )
        }
        .fullScreenCover(item: $viewing) { viewed in
            if let shown = gallery.all.first(where: { $0.checkIn.id == viewed.id }) {
                PhotoViewer(
                    shown: shown,
                    image: app.photos.flatMap { UIImage(contentsOfFile: $0.url(for: shown.checkIn).path) },
                    caption: caption(shown),
                    onRemove: {
                        viewing = nil
                        Task { await remove(shown.checkIn) }
                    },
                    onClose: { viewing = nil }
                )
            }
        }
        .slRespondsToTextSize()
    }

    // MARK: - The head

    /// Training's head: the avatar to Account, the tab and how many photos,
    /// and one round button — the timelapse, once there is something to play.
    private var header: some View {
        HStack(alignment: .center, spacing: SL.Space.s3) {
            Button(action: onAccount) {
                SLAvatar(photo: app.profilePhoto, initial: app.avatarInitial, size: 40)
                    .contentShape(Circle())
            }
            .buttonStyle(SLPressStyle(scale: 0.92))
            .accessibilityLabel("Account")

            VStack(alignment: .leading, spacing: 2) {
                Text("Photos")
                    .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                Text(gallery.all.count == 1 ? "1 photo" : "\(gallery.all.count) photos")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if gallery.all.count > 1 {
                Button { playingTimeline = true } label: {
                    SLGlyph(name: .play, size: 16, fixed: true)
                        .foregroundStyle(SL.Ink.primary)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(SL.Surface.raised))
                        .overlay(Circle().strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border))
                        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                        .contentShape(Circle())
                }
                .buttonStyle(SLPressStyle(scale: 0.9, bounces: true))
                .accessibilityLabel("Play timelapse")
            }
        }
    }

    // MARK: - The rhythm

    /// A photo every two weeks: often enough to see a change, rare enough
    /// that a week's water and light do not drown it.
    private static let rhythmDays = 14

    private var daysSinceLatest: Int? {
        gallery.all.last.map { Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: $0.date), to: Calendar.current.startOfDay(for: Date())).day ?? 0 }
    }

    private var isDue: Bool { daysSinceLatest.map { $0 >= Self.rhythmDays } ?? true }

    /// Weeks from the first photo to the latest — the progress on record.
    private var weeksTracked: Int {
        guard let first = gallery.all.first, let last = gallery.all.last else { return 0 }
        return (Calendar.current.dateComponents([.day], from: first.date, to: last.date).day ?? 0) / 7
    }

    /// Photos taken on rhythm in a row, newest back: each no more than the
    /// rhythm and a few days' grace after the one before.
    private var onRhythm: Int {
        let dates = gallery.all.map(\.date)
        guard !dates.isEmpty else { return 0 }
        var count = 1
        for i in stride(from: dates.count - 1, to: 0, by: -1) {
            let gap = Calendar.current.dateComponents([.day], from: dates[i - 1], to: dates[i]).day ?? 0
            guard gap <= Self.rhythmDays + 4 else { break }
            count += 1
        }
        if let since = daysSinceLatest, since > Self.rhythmDays + 4 { return 0 }
        return count
    }

    /// Training's card, read for photos: the weeks on record as the number,
    /// the latest photos as its marks with the next one waiting, and the
    /// one action.
    private var hero: some View {
        let nudge: String = {
            guard let since = daysSinceLatest else { return "Your first photo starts the record" }
            if isDue { return since == Self.rhythmDays ? "Photo due today" : "Photo due — \(since - Self.rhythmDays) days late" }
            let left = Self.rhythmDays - since
            return left == 1 ? "Next photo tomorrow" : "Next photo in \(left) days"
        }()
        let empty = gallery.all.isEmpty
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom, spacing: SL.Space.s3) {
                Text("\(weeksTracked)")
                    .font(.slCapped(96, SL.Weight.bold, maxScale: 1.2, relativeTo: .largeTitle))
                    .tracking(-5)
                    .monospacedDigit()
                    .foregroundStyle(empty ? SL.Ink.primary : SL.Signal.action)
                    .lineLimit(1)
                    .padding(.vertical, -13)
                VStack(alignment: .leading, spacing: 2) {
                    Text(weeksTracked == 1 ? "week on record" : "weeks on record")
                        .slLead(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                    Text(nudge)
                        .slMeta(SL.Weight.semibold)
                        .slNumerals()
                        .foregroundStyle(isDue && !empty ? SL.Signal.attention : SL.Ink.secondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 2)
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)

            photoMarks.padding(.top, SL.Space.s5)

            Rectangle()
                .fill(SL.Surface.hairline)
                .frame(height: SL.Metric.border)
                .padding(.horizontal, -SL.Space.s5)
                .padding(.vertical, SL.Space.s5)

            if onRhythm > 1 {
                HStack(spacing: SL.Space.s2) {
                    SLGlyph(name: .flame, size: 16).foregroundStyle(SL.Signal.action)
                    Text("\(onRhythm) photos on rhythm")
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                    Text("· every 2 weeks")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .padding(.bottom, SL.Space.s4)
            } else {
                Text("Same pose, light and distance every two weeks. That's how you see what the scale doesn't.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, SL.Space.s4)
            }

            PhotosPicker(selection: $picking, matching: .images, photoLibrary: .shared()) {
                HStack(spacing: 10) {
                    SLGlyph(name: .camera, size: 18)
                    Text(empty ? "Take your first photo" : isDue ? "Take this check-in" : "Add a photo")
                }
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .accessibilityHint("Picks a photo from your library and keeps it on this phone")

            Text("Photos stay on this phone. Never shared, never analysed.")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
                .padding(.top, SL.Space.s3)
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            ZStack {
                SL.Surface.raised
                RadialGradient(colors: [SL.Signal.action.opacity(empty ? 0.05 : 0.1), .clear],
                               center: .topTrailing, startRadius: 0, endRadius: 280)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(SL.Surface.hairlineStrong.opacity(0.6), lineWidth: SL.Metric.border)
        )
        .onAppear {
            guard !reduceMotion, !breathes else { return }
            withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false).delay(0.8)) { breathes = true }
        }
    }

    /// The latest photos as Training's week marks: each one a small round
    /// picture with its date, then the next check-in waiting — ringed and
    /// breathing when due, dashed while not.
    private var photoMarks: some View {
        let recent = Array(gallery.all.suffix(5))
        let nextDate = gallery.all.last.flatMap { Calendar.current.date(byAdding: .day, value: Self.rhythmDays, to: $0.date) }
        return HStack(spacing: 0) {
            ForEach(Array(recent.enumerated()), id: \.element.checkIn.id) { index, shown in
                Button { viewing = Viewed(id: shown.checkIn.id) } label: {
                    VStack(spacing: 6) {
                        picture(shown.checkIn)
                            .frame(width: 40, height: 40)
                            .clipShape(Circle())
                            .overlay(Circle().strokeBorder(index == recent.count - 1 ? SL.Signal.action : SL.Surface.hairlineStrong, lineWidth: index == recent.count - 1 ? 2 : 1))
                        Text(label(shown.date))
                            .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                            .monospacedDigit()
                            .foregroundStyle(SL.Ink.secondary)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SLPressStyle(scale: 0.85, bounces: true))
                .accessibilityLabel("Photo \(caption(shown))")
                .accessibilityHint("Opens the photo")
            }
            PhotosPicker(selection: $picking, matching: .images, photoLibrary: .shared()) {
                VStack(spacing: 6) {
                    Group {
                        if isDue || recent.isEmpty {
                            Circle().strokeBorder(SL.Signal.action, lineWidth: 2)
                                .background(Circle().fill(SL.Signal.action.opacity(0.12)).padding(-4))
                                .overlay(SLGlyph(name: .plus, size: 14).foregroundStyle(SL.Signal.action))
                                .background(
                                    Circle()
                                        .strokeBorder(SL.Signal.action.opacity(breathes ? 0 : 0.5), lineWidth: 1.5)
                                        .scaleEffect(breathes ? 1.6 : 1)
                                )
                        } else {
                            Circle().strokeBorder(SL.Surface.mute, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                                .overlay(SLGlyph(name: .plus, size: 12).foregroundStyle(SL.Surface.mute))
                        }
                    }
                    .frame(width: 40, height: 40)
                    Text(isDue || recent.isEmpty ? "Now" : nextDate.map { label($0) } ?? "Next")
                        .font(.sl(SL.TypeSize.micro, isDue ? SL.Weight.bold : SL.Weight.regular))
                        .monospacedDigit()
                        .foregroundStyle(isDue ? SL.Ink.primary : SL.Ink.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(SLPressStyle(scale: 0.85, bounces: true))
            .accessibilityLabel(isDue ? "Add this check-in's photo" : "Add a photo")
            if recent.count < 4 {
                ForEach(0..<(4 - recent.count), id: \.self) { _ in
                    Color.clear.frame(maxWidth: .infinity, minHeight: 1)
                }
            }
        }
        .padding(.horizontal, -SL.Space.s1)
    }

    // MARK: - The two pictures

    private var comparisonSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(title: "Compare", meta: comparison.map(between))

            if let comparison {
                modeChoice
                if compareMode == .overlay {
                    BeforeAfterSlider(
                        before: app.photos?.url(for: comparison.before.checkIn),
                        after: app.photos?.url(for: comparison.after.checkIn),
                        beforeTag: "before · \(label(comparison.before.date))",
                        afterTag: "now · \(label(comparison.after.date))"
                    )
                    HStack(alignment: .top, spacing: SL.Space.s2) {
                        caption(comparison.before, tag: "before", alignment: .leading)
                        caption(comparison.after, tag: "now", alignment: .trailing)
                    }
                } else {
                    HStack(alignment: .top, spacing: SL.Space.s2) {
                        slot(comparison.before, tag: "before")
                        slot(comparison.after, tag: "now")
                    }
                }
            } else if let only = gallery.first {
                HStack(alignment: .top, spacing: SL.Space.s2) {
                    slot(only, tag: "before")
                    // The first picture keeps the shape of the pair it will be
                    // half of, rather than sprawling across the row on its own.
                    Color.clear.frame(maxWidth: .infinity)
                }
            }

            if gallery.all.count > 1 {
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(spacing: SL.Space.s2))
                    : AnyLayout(HStackLayout(spacing: SL.Space.s2))
                layout {
                    Button { playingTimeline = true } label: {
                        HStack(spacing: 6) {
                            SLGlyph(name: .play, size: 14)
                                .foregroundStyle(SL.Signal.action)
                            Text("Play")
                        }
                    }
                    .buttonStyle(SLOutlineButtonStyle())
                    .accessibilityHint("Shows all your photos in a row, from the first to the latest")

                    if gallery.all.count > 2 {
                        Button { choosing = true } label: {
                            HStack(spacing: 6) {
                                Text("Other dates")
                                SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.secondary)
                            }
                        }
                        .buttonStyle(SLOutlineButtonStyle())
                        .accessibilityLabel("Choose other dates")
                    }
                }
                .padding(.top, SL.Space.s2)
            } else {
                Text("From two photos on, the comparison appears here.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.horizontal, SL.Space.s1)
            }
        }
    }

    /// Over each other, or side by side — in a row while both fit on one
    /// line each, under each other once the text is too large for that.
    private var modeChoice: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: SL.Space.s2) { modeChips }
                .fixedSize(horizontal: true, vertical: false)
            VStack(alignment: .leading, spacing: SL.Space.s2) { modeChips }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("View")
    }

    @ViewBuilder
    private var modeChips: some View {
        SLChip(title: "Overlay", look: compareMode == .overlay ? .selected : .unselected) {
            compareMode = .overlay
        }
        SLChip(title: "Side by side", look: compareMode == .sideBySide ? .selected : .unselected) {
            compareMode = .sideBySide
        }
    }

    /// Under the slider: each picture's day and weigh-in, at its own side, and
    /// the way to open it large.
    private func caption(
        _ shown: CheckInGallery.Shown,
        tag: String,
        alignment: HorizontalAlignment
    ) -> some View {
        Button { viewing = Viewed(id: shown.checkIn.id) } label: {
            VStack(alignment: alignment, spacing: 0) {
                Text("\(label(shown.date)) · \(tag)")
                    .slBody(SL.Weight.semibold)
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                Text(shown.weightKg.map(app.display.kg) ?? "no weigh-in")
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: alignment == .leading ? .leading : .trailing)
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Photo \(tag), \(caption(shown))")
        .accessibilityHint("Double-tap to open the photo")
    }

    /// "14 weken verschil · −2,6 kg" — never more time than the two dates
    /// hold, and the weight moves only where both days have a weigh-in; it is
    /// never guessed. Two pictures of one day share that day's weigh-in, so
    /// there is no change to state.
    private func between(_ comparison: CheckInGallery.Comparison) -> String {
        let span: String
        switch comparison.span {
        case .sameDay: return "same day"
        case .days(let days): span = days == 1 ? "1 day apart" : "\(days) days apart"
        case .weeks(let weeks): span = weeks == 1 ? "1 week apart" : "\(weeks) weeks apart"
        }
        guard let change = comparison.change else { return span }
        return "\(span) · \(change == 0 ? "0" : app.display.signedDelta(change)) kg"
    }

    private func slot(_ shown: CheckInGallery.Shown, tag: String) -> some View {
        Button { viewing = Viewed(id: shown.checkIn.id) } label: {
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                picture(shown.checkIn)
                    .aspectRatio(3.0 / 4.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(label(shown.date)) · \(tag)")
                        .slBody(SL.Weight.semibold)
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                    Text(shown.weightKg.map(app.display.kg) ?? "no weigh-in")
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Photo \(tag), \(caption(shown))")
        .accessibilityHint("Double-tap to open the photo")
        .accessibilityActions { Button("Delete") { removing = shown.checkIn } }
    }

    /// A rectangle takes the size it is offered and nothing more; the picture
    /// fills it from the inside. Letting the image itself size the view lets a
    /// 4.000pt-wide photo decide how wide the screen is.
    private func picture(_ checkIn: CheckIn) -> some View {
        Rectangle()
            .fill(SL.Surface.raised2)
            .overlay {
                if let url = app.photos?.url(for: checkIn), let image = UIImage(contentsOfFile: url.path) {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    SLGlyph(name: .image, size: 22).foregroundStyle(SL.Surface.mute)
                }
            }
            .clipped()
    }

    // MARK: - Every picture

    private var allSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(title: "All photos", meta: "\(gallery.all.count)")
            LazyVGrid(
                columns: Array(
                    repeating: GridItem(.flexible(), spacing: SL.Space.s2, alignment: .top),
                    count: typeSize.isAccessibilitySize ? 2 : 3
                ),
                alignment: .leading,
                // 1e's grid gap, between rows as between columns.
                spacing: SL.Space.s2
            ) {
                // Newest first: the one just added is the one looked for.
                ForEach(gallery.all.reversed(), id: \.checkIn.id) { shown in
                    Button {
                        if heldTile { heldTile = false } else { viewing = Viewed(id: shown.checkIn.id) }
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            picture(shown.checkIn)
                                .aspectRatio(3.0 / 4.0, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                            Text(label(shown.date))
                                .slMeta()
                                .slNumerals()
                                .foregroundStyle(SL.Ink.meta)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .simultaneousGesture(LongPressGesture().onEnded { _ in
                        heldTile = true
                        removing = shown.checkIn
                    })
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Photo \(caption(shown))")
                    .accessibilityHint("Double-tap to open the photo")
                    .accessibilityActions { Button("Delete") { removing = shown.checkIn } }
                }
            }
        }
    }

    /// "6 sep"
    private func label(_ date: Date) -> String {
        app.display.shortDate(date)
    }

    /// "6 sep, 84,2 kg"
    private func caption(_ shown: CheckInGallery.Shown) -> String {
        [label(shown.date), shown.weightKg.map(app.display.kg)].compactMap { $0 }.joined(separator: ", ")
    }

    // MARK: - Adding and removing

    private func add(_ item: PhotosPickerItem) async {
        failure = nil
        picking = nil
        // Kept for the signed-in account only; nobody signed in, nowhere to keep it.
        guard let photos = app.photos else { return }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                failure = "That photo couldn't be read. Try another one."
                return
            }
            // Dated by when it was taken, which is what it is compared by;
            // only a picture that says nothing is dated today.
            checkIns = try await photos.add(data, on: PhotoDate.taken(in: data) ?? Date())
        } catch {
            failure = "The photo couldn't be saved. Your phone may be out of space."
        }
    }

    private func remove(_ checkIn: CheckIn) async {
        guard let photos = app.photos else { return }
        do {
            checkIns = try await photos.remove(checkIn)
            chosen.removeAll { $0 == checkIn.id }
        } catch {
            failure = "The photo couldn't be deleted."
        }
    }
}

// MARK: - One picture, large

/// A picture at the size of the screen, with its date and weight and the one
/// thing that can be done to it.
private struct PhotoViewer: View {
    let shown: CheckInGallery.Shown
    let image: UIImage?
    let caption: String
    let onRemove: () -> Void
    let onClose: () -> Void

    @State private var confirms = false

    var body: some View {
        VStack(spacing: SL.Space.s3) {
            HStack(spacing: SL.Space.s3) {
                Text(caption)
                    .slLead()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: SL.Space.s2)
                Button(action: onClose) {
                    SLGlyph(name: .close, size: 16, fixed: true)
                        .foregroundStyle(SL.Ink.primary)
                        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                        .background(Circle().fill(SL.Surface.raised2))
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }

            Group {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
                        .accessibilityLabel("Photo from \(caption)")
                } else {
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .fill(SL.Surface.raised2)
                        .overlay(SLGlyph(name: .image, size: 22).foregroundStyle(SL.Surface.mute))
                        .aspectRatio(3.0 / 4.0, contentMode: .fit)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Button { confirms = true } label: { Text("Delete") }
                .buttonStyle(SLOutlineButtonStyle(edge: SL.Signal.loss.opacity(0.5)))
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
        .padding(.bottom, SL.Space.s3)
        .background(SL.Surface.ground.ignoresSafeArea())
        .confirmationDialog("Delete this photo?", isPresented: $confirms, titleVisibility: .visible) {
            Button("Delete", role: .destructive, action: onRemove)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The photo is deleted from this phone.")
        }
        .slRespondsToTextSize()
    }
}

// MARK: - Choosing the two to compare

/// "Choose other dates": any two pictures, side by side. The earlier one is
/// the `voor` whichever was tapped first, so there is no wrong order to pick
/// them in.
private struct ComparePicker<Picture: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize

    let all: [CheckInGallery.Shown]
    let picture: (CheckIn) -> Picture
    let label: (Date) -> String
    let onDone: ([String]) -> Void
    let onReset: () -> Void
    let onClose: () -> Void

    @State private var picked: [String]

    init(
        all: [CheckInGallery.Shown],
        initial: [String],
        picture: @escaping (CheckIn) -> Picture,
        label: @escaping (Date) -> String,
        onDone: @escaping ([String]) -> Void,
        onReset: @escaping () -> Void,
        onClose: @escaping () -> Void
    ) {
        self.all = all
        self.picture = picture
        self.label = label
        self.onDone = onDone
        self.onReset = onReset
        self.onClose = onClose
        _picked = State(initialValue: initial)
    }

    var body: some View {
        SLSheet(
            title: "Choose comparison",
            subtitle: picked.count == 2 ? "2 photos chosen" : "Pick two photos · \(picked.count) chosen",
            onClose: onClose
        ) {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                LazyVGrid(
                    columns: Array(
                        repeating: GridItem(.flexible(), spacing: SL.Space.s2, alignment: .top),
                        count: typeSize.isAccessibilitySize ? 2 : 3
                    ),
                    alignment: .leading,
                    spacing: SL.Space.s3
                ) {
                    ForEach(all.reversed(), id: \.checkIn.id) { shown in
                        tile(shown)
                    }
                }

                VStack(spacing: SL.Space.s1) {
                    Button { onDone(picked) } label: { Text("Compare these two") }
                        .buttonStyle(SLPrimaryButtonStyle())
                        .disabled(picked.count != 2)
                    Button(action: onReset) { Text("First and latest photo") }
                        .buttonStyle(SLQuietButtonStyle())
                        .accessibilityHint("Resets the comparison to your first and latest photo")
                }
            }
        }
    }

    /// Which of the two a picked picture is: the earlier one is `voor`.
    private func role(_ shown: CheckInGallery.Shown) -> String? {
        guard picked.contains(shown.checkIn.id) else { return nil }
        let dates = all.filter { picked.contains($0.checkIn.id) }.map(\.date).sorted()
        guard picked.count == 2, let first = dates.first else { return "chosen" }
        return shown.date == first ? "before" : "now"
    }

    private func tile(_ shown: CheckInGallery.Shown) -> some View {
        let tag = role(shown)
        return Button {
            if let index = picked.firstIndex(of: shown.checkIn.id) {
                picked.remove(at: index)
            } else {
                // A third pick takes the place of the first: the newest two
                // choices are the ones meant.
                if picked.count == 2 { picked.removeFirst() }
                picked.append(shown.checkIn.id)
            }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                picture(shown.checkIn)
                    .aspectRatio(3.0 / 4.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .strokeBorder(tag == nil ? Color.clear : SL.Signal.action, lineWidth: 2)
                    )
                    .overlay(alignment: .topLeading) {
                        if let tag {
                            Text(tag.uppercased())
                                .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                                .tracking(SL.TypeSize.micro * 0.06)
                                .foregroundStyle(SL.Signal.action)
                                .padding(.horizontal, SL.Space.s2)
                                .frame(minHeight: 24)
                                .background(Capsule().fill(SL.Surface.ground))
                                .padding(6)
                        }
                    }
                Text(label(shown.date))
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(tag == nil ? SL.Ink.meta : SL.Signal.action)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Photo \(label(shown.date))\(tag.map { ", \($0)" } ?? "")")
        .accessibilityAddTraits(tag == nil ? .isButton : [.isSelected, .isButton])
    }
}
