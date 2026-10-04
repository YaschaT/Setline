import PhotosUI
import SwiftUI
import SetlineCore

/// Redesign 1e · Foto's.
///
/// Two pictures the same size, far enough apart in time to show something, and
/// what lies between them; under that, every picture in a grid. The first
/// against the latest is what it opens on, and any two can be put side by side
/// instead.
///
/// The photos never leave the phone, which the screen says out loud rather
/// than implying.
struct PhotosHomeView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var checkIns: [CheckIn] = []
    @State private var picking: PhotosPickerItem?
    @State private var removing: CheckIn?
    @State private var failure: String?
    @State private var loaded = false
    /// The two pictures chosen for the comparison, by id. Empty is the default
    /// pair: the first against the latest.
    @State private var chosen: [String] = []
    @State private var choosing = false
    @State private var viewing: Viewed?
    /// Holding a picture asks to remove it; the tap that ends the hold must
    /// not open it as well.
    @State private var heldTile = false

    private struct Viewed: Identifiable { let id: String }

    private let store = CheckInStore()

    private var gallery: CheckInGallery {
        CheckInGallery.make(checkIns, metrics: app.metrics)
    }

    private var comparison: CheckInGallery.Comparison? {
        gallery.comparison(chosen.first, chosen.count > 1 ? chosen[1] : nil)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                SLScreenTitle(title: "Foto's", subtitle: count) { addPill }

                if let failure {
                    SLAttentionCard(title: "Niet gelukt") {
                        Text(failure)
                            .slBody()
                            .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(SL.Ink.primary)
                    }
                }

                if gallery.all.isEmpty {
                    empty
                } else {
                    comparisonSection
                    allSection
                }

                Text("Foto's blijven op dit toestel. Nooit gedeeld, nooit geanalyseerd.")
                    .slMeta()
                    .slLineHeight(1.5, size: SL.TypeSize.meta)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.horizontal, SL.Space.s1)
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)
            .padding(.bottom, SL.Space.s6)
        }
        .task {
            guard !loaded else { return }
            checkIns = await store.load()
            loaded = true
        }
        .onChange(of: picking) { _, item in
            guard let item else { return }
            Task { await add(item) }
        }
        .confirmationDialog(
            "Opname verwijderen?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible
        ) {
            Button("Verwijder", role: .destructive) {
                if let checkIn = removing { Task { await remove(checkIn) } }
                removing = nil
            }
            Button("Annuleer", role: .cancel) { removing = nil }
        } message: {
            Text("De foto wordt van dit toestel verwijderd.")
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
        .fullScreenCover(item: $viewing) { viewed in
            if let shown = gallery.all.first(where: { $0.checkIn.id == viewed.id }) {
                PhotoViewer(
                    shown: shown,
                    image: UIImage(contentsOfFile: store.url(for: shown.checkIn).path),
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

    private var count: String {
        gallery.all.count == 1 ? "1 opname" : "\(gallery.all.count) opnames"
    }

    /// The one commit on this screen: lime, a pill, beside the title.
    private var addPill: some View {
        PhotosPicker(selection: $picking, matching: .images, photoLibrary: .shared()) {
            HStack(spacing: SL.Space.s2) {
                SLGlyph(name: .camera, size: 20)
                Text("Nieuwe opname").slBody(SL.Weight.semibold)
            }
            .foregroundStyle(SL.Signal.onAction)
            .lineLimit(1)
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: SL.Space.hitMin)
            .background(Capsule().fill(SL.Signal.action))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Kiest een foto uit je bibliotheek en bewaart hem op dit toestel")
    }

    // MARK: - The two pictures

    private var comparisonSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(title: "Vergelijking", meta: comparison.map(between))

            HStack(alignment: .top, spacing: SL.Space.s2) {
                if let comparison {
                    slot(comparison.before, tag: "voor")
                    slot(comparison.after, tag: "nu")
                } else if let only = gallery.first {
                    slot(only, tag: "voor")
                    // The first picture keeps the shape of the pair it will be
                    // half of, rather than sprawling across the row on its own.
                    Color.clear.frame(maxWidth: .infinity)
                }
            }

            if gallery.all.count > 2 {
                Button { choosing = true } label: {
                    HStack(spacing: 6) {
                        Text("Andere datums kiezen")
                        SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.secondary)
                    }
                }
                .buttonStyle(SLOutlineButtonStyle())
            } else if gallery.all.count == 1 {
                Text("Vanaf twee opnames staat de vergelijking hier.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.horizontal, SL.Space.s1)
            }
        }
    }

    /// "14 weken verschil · −2,6 kg" — never more time than the two dates
    /// hold, and the weight moves only where both days have a weigh-in; it is
    /// never guessed. Two pictures of one day share that day's weigh-in, so
    /// there is no change to state.
    private func between(_ comparison: CheckInGallery.Comparison) -> String {
        let span: String
        switch comparison.span {
        case .sameDay: return "zelfde dag"
        case .days(let days): span = days == 1 ? "1 dag verschil" : "\(days) dagen verschil"
        case .weeks(let weeks): span = weeks == 1 ? "1 week verschil" : "\(weeks) weken verschil"
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
                    Text(shown.weightKg.map(app.display.kg) ?? "geen weging")
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
        .accessibilityLabel("Opname \(tag), \(caption(shown))")
        .accessibilityHint("Dubbeltik om de foto te openen")
        .accessibilityActions { Button("Verwijderen") { removing = shown.checkIn } }
    }

    /// A rectangle takes the size it is offered and nothing more; the picture
    /// fills it from the inside. Letting the image itself size the view lets a
    /// 4.000pt-wide photo decide how wide the screen is.
    private func picture(_ checkIn: CheckIn) -> some View {
        Rectangle()
            .fill(SL.Surface.raised2)
            .overlay {
                if let image = UIImage(contentsOfFile: store.url(for: checkIn).path) {
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
            SLSectionHead(title: "Alle opnames", meta: "\(gallery.all.count)")
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
                    .accessibilityLabel("Opname \(caption(shown))")
                    .accessibilityHint("Dubbeltik om de foto te openen")
                    .accessibilityActions { Button("Verwijderen") { removing = shown.checkIn } }
                }
            }
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: SL.Space.s1) {
            Text("Nog geen opnames")
                .slLead()
                .foregroundStyle(SL.Ink.primary)
            Text("Een foto naast een latere foto laat zien wat de weegschaal niet vertelt. Zelfde pose, licht en afstand.")
                .slBody()
                .slLineHeight(1.45, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .slListCard()
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
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                failure = "Die foto kon niet worden gelezen. Probeer een andere."
                return
            }
            // Dated by when it was taken, which is what it is compared by;
            // only a picture that says nothing is dated today.
            checkIns = try await store.add(data, on: PhotoDate.taken(in: data) ?? Date())
        } catch {
            failure = "De foto kon niet worden bewaard. Er is mogelijk geen ruimte vrij op je toestel."
        }
    }

    private func remove(_ checkIn: CheckIn) async {
        do {
            checkIns = try await store.remove(checkIn)
            chosen.removeAll { $0 == checkIn.id }
        } catch {
            failure = "De opname kon niet worden verwijderd."
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
                .accessibilityLabel("Sluiten")
            }

            Group {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
                        .accessibilityLabel("Foto van \(caption)")
                } else {
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .fill(SL.Surface.raised2)
                        .overlay(SLGlyph(name: .image, size: 22).foregroundStyle(SL.Surface.mute))
                        .aspectRatio(3.0 / 4.0, contentMode: .fit)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Button { confirms = true } label: { Text("Verwijderen") }
                .buttonStyle(SLOutlineButtonStyle(edge: SL.Signal.loss.opacity(0.5)))
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
        .padding(.bottom, SL.Space.s3)
        .background(SL.Surface.ground.ignoresSafeArea())
        .confirmationDialog("Opname verwijderen?", isPresented: $confirms, titleVisibility: .visible) {
            Button("Verwijder", role: .destructive, action: onRemove)
            Button("Annuleer", role: .cancel) {}
        } message: {
            Text("De foto wordt van dit toestel verwijderd.")
        }
        .slRespondsToTextSize()
    }
}

// MARK: - Choosing the two to compare

/// "Andere datums kiezen": any two pictures, side by side. The earlier one is
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
            title: "Vergelijking kiezen",
            subtitle: picked.count == 2 ? "2 opnames gekozen" : "Kies twee opnames · \(picked.count) gekozen",
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
                    Button { onDone(picked) } label: { Text("Vergelijk deze twee") }
                        .buttonStyle(SLPrimaryButtonStyle())
                        .disabled(picked.count != 2)
                    Button(action: onReset) { Text("Eerste en laatste opname") }
                        .buttonStyle(SLQuietButtonStyle())
                        .accessibilityHint("Zet de vergelijking terug op je eerste en je laatste opname")
                }
            }
        }
    }

    /// Which of the two a picked picture is: the earlier one is `voor`.
    private func role(_ shown: CheckInGallery.Shown) -> String? {
        guard picked.contains(shown.checkIn.id) else { return nil }
        let dates = all.filter { picked.contains($0.checkIn.id) }.map(\.date).sorted()
        guard picked.count == 2, let first = dates.first else { return "gekozen" }
        return shown.date == first ? "voor" : "nu"
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
        .accessibilityLabel("Opname \(label(shown.date))\(tag.map { ", \($0)" } ?? "")")
        .accessibilityAddTraits(tag == nil ? .isButton : [.isSelected, .isButton])
    }
}
