import PhotosUI
import SwiftUI
import SetlineCore

/// Turning a saved workout into a post, or editing one (SETLINE Social 2
/// and 8). Everything but the summary is optional: a good post is one tap.
struct PostComposerView: View {
    enum Mode {
        case create(TrainingSession)
        case edit(FeedPost)
    }

    @Environment(AppState.self) private var app
    @Environment(SocialStore.self) private var social
    let mode: Mode
    let onClose: () -> Void

    @State private var draft: PostDraft
    @State private var picked: [PhotosPickerItem] = []
    @State private var choosingVisibility = false
    @State private var addingMusic = false
    @State private var posting = false
    @State private var failure: String?
    @State private var confirmsDelete = false

    init(mode: Mode, onClose: @escaping () -> Void) {
        self.mode = mode
        self.onClose = onClose
        switch mode {
        case .create: _draft = State(initialValue: PostDraft())
        case .edit(let post): _draft = State(initialValue: PostDraft(post: post))
        }
    }

    private var isEditing: Bool { if case .edit = mode { return true } else { return false } }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: SL.Space.s6) {
                    summary
                    field("Title") {
                        TextField(defaultTitle, text: $draft.title)
                            .textInputAutocapitalization(.sentences)
                            .submitLabel(.done)
                    }
                    field("Notes") {
                        TextField("How did it go?", text: $draft.notes, axis: .vertical)
                            .lineLimit(3...8)
                    }
                    photos
                    attachments
                    hiddenStats
                    visibilityRow
                    if isEditing { deleteButton }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s5)
                .padding(.bottom, SL.Space.s8)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(SL.Surface.ground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { actions }
        .sheet(isPresented: $choosingVisibility) {
            VisibilitySheet(selection: $draft.visibility, friendCount: social.friends.count, onClose: { choosingVisibility = false })
        }
        .sheet(isPresented: $addingMusic) {
            MusicSheet(tracks: $draft.tracks, onClose: { addingMusic = false })
        }
        .alert("Delete this post?", isPresented: $confirmsDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { Task { await deletePost() } }
        } message: {
            Text("Its photos, comments and kudos are removed for everyone. Your workout stays in your log.")
        }
        .onChange(of: picked) { _, items in Task { await addPhotos(items) } }
        .slRespondsToTextSize()
    }

    // MARK: - Head and foot

    private var header: some View {
        HStack {
            Button("Cancel", action: onClose)
                .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                .foregroundStyle(SL.Ink.secondary)
                .frame(minWidth: 64, minHeight: SL.Space.hitMin, alignment: .leading)
            Spacer()
            Text(isEditing ? "Edit post" : "New post")
                .slLead(SL.Weight.semibold)
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Color.clear.frame(width: 64, height: 1)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.vertical, SL.Space.s1)
        .overlay(alignment: .bottom) { SLHairline() }
    }

    private var actions: some View {
        VStack(spacing: SL.Space.s2) {
            if let failure {
                Text(failure)
                    .slMeta()
                    .foregroundStyle(SL.Signal.attention)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button { Task { await post() } } label: {
                HStack(spacing: SL.Space.s2) {
                    if posting { ProgressView().tint(SL.Signal.onAction) }
                    Text(posting ? (isEditing ? "Saving…" : "Posting…") : (isEditing ? "Save changes" : "Post"))
                }
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .disabled(posting)
            if !isEditing {
                Button("Save without posting", action: onClose)
                    .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minHeight: SL.Space.hitMin)
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
        .padding(.bottom, SL.Space.s2)
        .background(SL.Surface.ground.ignoresSafeArea(edges: .bottom))
    }

    // MARK: - The summary, written for you

    private struct Summary {
        let day: String
        let date: Date
        let volumeKg: Double
        let seconds: Int?
        let sets: Int
        let medals: [PostMedal]
        let streak: Int
    }

    private var summaryData: Summary {
        switch mode {
        case .create(let session):
            let medals = Medals.medals(for: session, in: app.sessions).map {
                PostMedal(place: $0.place.rawValue, name: $0.name, weight_kg: NSDecimalNumber(decimal: $0.weightKg).doubleValue, reps: $0.reps)
            }
            return Summary(
                day: session.dayLabel, date: session.date,
                volumeKg: NSDecimalNumber(decimal: RecordsEngine.volumeLoad(session.results.flatMap(\.sets))).doubleValue,
                seconds: session.durationSeconds,
                sets: session.results.flatMap(\.sets).filter(\.countsTowardVolume).count,
                medals: medals, streak: app.streak.weeks
            )
        case .edit(let post):
            return Summary(day: post.title, date: post.date, volumeKg: post.volume_kg, seconds: post.duration_seconds,
                           sets: post.set_count, medals: post.medals, streak: post.streak_weeks)
        }
    }

    private var defaultTitle: String { summaryData.day }

    private var summary: some View {
        let data = summaryData
        return VStack(alignment: .leading, spacing: SL.Space.s3) {
            HStack(spacing: SL.Space.s3) {
                SLWorkoutSymbol(dayName: data.day, size: 20)
                    .foregroundStyle(SL.Signal.action)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.actionTint))
                VStack(alignment: .leading, spacing: 2) {
                    Text(data.day).slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    Text(app.display.shortDate(data.date)).slMeta().foregroundStyle(SL.Ink.secondary)
                }
            }
            HStack(alignment: .top, spacing: 0) {
                summaryStat(app.display.volumeKg(Decimal(data.volumeKg)), "volume", hidden: draft.hidden.contains(.volume))
                if let seconds = data.seconds, seconds >= 60 {
                    summaryStat(app.display.minutes(seconds), "time", hidden: draft.hidden.contains(.duration))
                }
                summaryStat("\(data.sets)", "sets", hidden: false)
            }
            if !data.medals.isEmpty || data.streak > 0 {
                FlowChips(medals: data.medals, streak: data.streak, hideWeights: draft.hidden.contains(.weights), display: app.display)
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .slListCard(radius: SL.Radius.xl)
        .accessibilityElement(children: .combine)
    }

    private func summaryStat(_ value: String, _ label: String, hidden: Bool) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(hidden ? "Hidden" : value)
                .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(hidden ? SL.Ink.tertiary : SL.Ink.primary)
            Text(label).slMeta().foregroundStyle(SL.Ink.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Fields

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text(label).slMeta(SL.Weight.semibold).foregroundStyle(SL.Ink.secondary)
            content()
                .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                .foregroundStyle(SL.Ink.primary)
                .tint(SL.Signal.action)
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised))
                .overlay(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
        }
    }

    // MARK: - Photos

    private var photos: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack {
                Text("Photos").slMeta(SL.Weight.semibold).foregroundStyle(SL.Ink.secondary)
                Spacer()
                Text("\(draft.photos.count) of \(PostDraft.maxPhotos)").slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: SL.Space.s2), count: 4), spacing: SL.Space.s2) {
                ForEach(draft.photos) { photo in
                    DraftPhotoTile(photo: photo) {
                        draft.photos.removeAll { $0.id == photo.id }
                    }
                }
                if draft.photos.count < PostDraft.maxPhotos {
                    PhotosPicker(selection: $picked, maxSelectionCount: PostDraft.maxPhotos - draft.photos.count, matching: .images) {
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .strokeBorder(SL.Ink.secondary.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                            .aspectRatio(4 / 5, contentMode: .fit)
                            .overlay(SLGlyph(name: .plus, size: 20, fixed: true).foregroundStyle(SL.Ink.secondary))
                    }
                    .accessibilityLabel("Add photos")
                }
            }
            Text("Location data is removed from photos before they leave your phone.")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func addPhotos(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        for item in items where draft.photos.count < PostDraft.maxPhotos {
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let photo = await Task.detached(priority: .userInitiated, operation: { SocialStore.preparePhoto(data) }).value
            else { continue }
            draft.photos.append(photo)
        }
        picked = []
    }

    // MARK: - Music, place

    private var attachments: some View {
        VStack(spacing: 0) {
            Button { addingMusic = true } label: {
                rowLabel(
                    symbol: "music.note", lit: !draft.tracks.isEmpty, title: "Music",
                    detail: draft.tracks.isEmpty ? "Optional · what kept you going" : musicLine
                )
            }
            .buttonStyle(SLRowButtonStyle())
            SLHairline().padding(.leading, 52)
            WorkoutPlaceRow(place: $draft.place)
                .padding(.horizontal, SL.Space.s3)
        }
        .slBorderBox()
        .slListCard()
    }

    private var musicLine: String {
        let songs = draft.tracks.filter { $0.kind == "song" }.count
        let playlist = draft.tracks.first { $0.kind == "playlist" }
        var parts: [String] = []
        if songs > 0 { parts.append(songs == 1 ? "1 song" : "\(songs) songs") }
        if let playlist { parts.append(playlist.title) }
        return parts.joined(separator: " · ")
    }

    private func rowLabel(symbol: String, lit: Bool, title: String, detail: String) -> some View {
        HStack(spacing: SL.Space.s3) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(lit ? SL.Signal.action : SL.Ink.secondary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                Text(detail).slMeta().foregroundStyle(SL.Ink.secondary).lineLimit(1)
            }
            Spacer(minLength: SL.Space.s2)
            SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
        }
        .padding(.horizontal, SL.Space.s4)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
    }

    // MARK: - Hidden numbers, visibility

    private var hiddenStats: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("Hide from this post").slMeta(SL.Weight.semibold).foregroundStyle(SL.Ink.secondary)
            VStack(spacing: 0) {
                ForEach(Array(HiddenStat.allCases.enumerated()), id: \.element) { index, stat in
                    Toggle(isOn: Binding(
                        get: { draft.hidden.contains(stat) },
                        set: { on in if on { draft.hidden.insert(stat) } else { draft.hidden.remove(stat) } }
                    )) {
                        Text(stat.label).slBody().foregroundStyle(SL.Ink.primary)
                    }
                    .tint(SL.Signal.action)
                    .padding(.horizontal, SL.Space.s4)
                    .frame(minHeight: 52)
                    .overlay(alignment: .top) { if index > 0 { SLHairline().padding(.leading, SL.Space.s4) } }
                }
            }
            .slBorderBox()
            .slListCard()
        }
    }

    private var visibilityRow: some View {
        Button { choosingVisibility = true } label: {
            rowLabel(
                symbol: draft.visibility == .private ? "lock.fill" : "person.2.fill",
                lit: false,
                title: "Who can see this",
                detail: draft.visibility == .friends && social.friends.isEmpty
                    ? "Friends · only you for now"
                    : draft.visibility.label
            )
        }
        .buttonStyle(SLRowButtonStyle())
        .slBorderBox()
        .slListCard()
    }

    private var deleteButton: some View {
        Button { confirmsDelete = true } label: { Text("Delete post").foregroundStyle(SL.Signal.loss) }
            .buttonStyle(SLOutlineButtonStyle(edge: SL.Signal.loss.opacity(0.5)))
    }

    // MARK: - Writing

    private func post() async {
        posting = true
        failure = nil
        defer { posting = false }
        do {
            switch mode {
            case .create(let session):
                let medals = Medals.medals(for: session, in: app.sessions)
                try await social.createPost(from: session, medals: medals, streakWeeks: app.streak.weeks, draft: draft)
            case .edit(let post):
                try await social.update(post, draft: draft)
            }
            onClose()
        } catch is SocialStore.Queued {
            // Offline: kept on this phone and sent once the connection is
            // back; the Friends tab says so.
            onClose()
        } catch {
            failure = isEditing
                ? "Couldn't save your changes. Check your connection and try again — nothing was lost."
                : "Couldn't post just now. Try again — nothing was lost."
        }
    }

    private func deletePost() async {
        guard case .edit(let post) = mode else { return }
        do {
            try await social.delete(post)
            onClose()
        } catch {
            failure = "Couldn't delete the post. Try again."
        }
    }
}

// MARK: - Pieces

/// Medal and streak chips under the summary.
private struct FlowChips: View {
    let medals: [PostMedal]
    let streak: Int
    let hideWeights: Bool
    let display: NumberDisplay

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            ForEach(Array(medals.prefix(3).enumerated()), id: \.offset) { _, medal in
                if let place = LiftMedal.Place(rawValue: medal.place) {
                    HStack(spacing: SL.Space.s2) {
                        SLMedal(place: place, size: 22)
                        Text(hideWeights ? "\(place.title) · \(medal.name)" : "\(place.title) · \(medal.name) \(display.kg(Decimal(medal.weight_kg))) × \(medal.reps)")
                            .slMeta(SL.Weight.semibold)
                            .slNumerals()
                            .foregroundStyle(SLMedal.metal(place).face)
                            .lineLimit(1)
                    }
                }
            }
            if streak > 0 {
                Text(streak == 1 ? "1-week streak" : "\(streak)-week streak")
                    .slMeta(SL.Weight.semibold)
                    .foregroundStyle(SL.Signal.action)
                    .padding(.horizontal, SL.Space.s3)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(SL.Signal.actionTint))
            }
        }
    }
}

/// A photo on the draft, new or already posted, with its remove button.
private struct DraftPhotoTile: View {
    @Environment(SocialStore.self) private var social
    let photo: DraftPhoto
    let onRemove: () -> Void
    @State private var loaded: UIImage?

    var body: some View {
        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
            .fill(SL.Surface.hairline)
            .aspectRatio(4 / 5, contentMode: .fit)
            .overlay {
                if let image = loaded {
                    Image(uiImage: image).resizable().scaledToFill()
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Button(action: onRemove) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(SL.Ink.primary)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(SL.Surface.ground.opacity(0.8)))
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove photo")
            }
            .task(id: photo.id) {
                if let jpeg = photo.jpeg { loaded = UIImage(data: jpeg) }
                else if let path = photo.existing?.path { loaded = await social.image(path) }
            }
    }
}

// MARK: - Who can see this

struct VisibilitySheet: View {
    @Binding var selection: PostVisibility
    let friendCount: Int
    let onClose: () -> Void

    var body: some View {
        SLSheet(title: "Who can see this?", subtitle: "You can change it after posting", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s3) {
                option(.private, symbol: "lock.fill", detail: "A private diary entry. Never shown to anyone.")
                option(.friends, symbol: "person.2.fill", detail: "You and friends you accept — including friends you add later.")
                HStack(spacing: SL.Space.s3) {
                    Image(systemName: "globe")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(SL.Ink.tertiary)
                        .frame(width: 40, height: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Public").slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.tertiary)
                        Text("Coming later").slMeta().foregroundStyle(SL.Ink.tertiary)
                    }
                    Spacer()
                }
                .padding(SL.Space.s3)
                .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .strokeBorder(SL.Surface.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 4])))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Public, coming later")

                if selection == .friends && friendCount == 0 {
                    HStack(alignment: .top, spacing: SL.Space.s2) {
                        Image(systemName: "info.circle")
                            .foregroundStyle(SL.Signal.recovery)
                        Text("You have no friends on Setline yet, so for now only you will see this. Invite someone and they'll see your Friends posts too.")
                            .slMeta()
                            .foregroundStyle(SL.Ink.primary.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(SL.Space.s3)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.recoveryTint))
                }

                Button("Done", action: onClose)
                    .buttonStyle(SLPrimaryButtonStyle())
                    .padding(.top, SL.Space.s2)
            }
        }
    }

    private func option(_ value: PostVisibility, symbol: String, detail: String) -> some View {
        let isOn = selection == value
        return Button { selection = value } label: {
            HStack(spacing: SL.Space.s3) {
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(isOn ? SL.Signal.action : SL.Ink.secondary)
                    .frame(width: 40, height: 40)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(isOn ? SL.Signal.actionTint : SL.Surface.raised))
                VStack(alignment: .leading, spacing: 2) {
                    Text(value.label).slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    Text(detail).slMeta().foregroundStyle(SL.Ink.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: SL.Space.s2)
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(isOn ? SL.Signal.action : SL.Ink.tertiary)
            }
            .padding(SL.Space.s3)
            .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))
            .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(isOn ? SL.Surface.selection : SL.Surface.hairline, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Music

/// Songs by hand, or one playlist link from any service. Shown as text and
/// a link: no artwork, no account connection.
struct MusicSheet: View {
    @Binding var tracks: [DraftTrack]
    let onClose: () -> Void

    @State private var song = ""
    @State private var link = ""

    private var songs: [DraftTrack] { tracks.filter { $0.kind == "song" } }
    private var playlist: DraftTrack? { tracks.first { $0.kind == "playlist" } }

    var body: some View {
        SLSheet(title: "Add music", subtitle: "What kept you going? Up to \(PostDraft.maxSongs) songs.", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s5) {
                if !songs.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(songs.enumerated()), id: \.element.id) { index, track in
                            HStack(spacing: SL.Space.s3) {
                                Text("\(index + 1)").slMeta().slNumerals().foregroundStyle(SL.Ink.secondary).frame(width: 18)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(track.title).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                                    if let artist = track.artist { Text(artist).slMeta().foregroundStyle(SL.Ink.secondary) }
                                }
                                Spacer()
                                Button { tracks.removeAll { $0.id == track.id } } label: {
                                    Image(systemName: "xmark").foregroundStyle(SL.Ink.secondary).frame(width: 44, height: 44)
                                }
                                .accessibilityLabel("Remove \(track.title)")
                            }
                            .padding(.leading, SL.Space.s4)
                            .frame(minHeight: 56)
                            .overlay(alignment: .top) { if index > 0 { SLHairline().padding(.leading, 46) } }
                        }
                    }
                    .slBorderBox()
                    .slListCard(raised: true)
                }

                VStack(alignment: .leading, spacing: SL.Space.s2) {
                    Text("Add a song").slMeta(SL.Weight.semibold).foregroundStyle(SL.Ink.secondary)
                    HStack(spacing: SL.Space.s2) {
                        TextField("Song – Artist", text: $song)
                            .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                            .foregroundStyle(SL.Ink.primary)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 48)
                            .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.ground))
                            .overlay(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                            .onSubmit(addSong)
                        Button("Add", action: addSong)
                            .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                            .foregroundStyle(canAddSong ? SL.Ink.primary : SL.Ink.tertiary)
                            .frame(minWidth: 60, minHeight: 48)
                            .overlay(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                            .disabled(!canAddSong)
                    }
                    if songs.count >= PostDraft.maxSongs {
                        Text("That's 5 — the post shows the first ones.").slMeta().foregroundStyle(SL.Ink.secondary)
                    }
                }

                VStack(alignment: .leading, spacing: SL.Space.s2) {
                    Text("Or share a playlist link").slMeta(SL.Weight.semibold).foregroundStyle(SL.Ink.secondary)
                    TextField("https://…", text: $link)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 48)
                        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.ground))
                        .overlay(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                        .onChange(of: link) { _, value in setPlaylist(value) }
                    if let playlist {
                        HStack(spacing: SL.Space.s2) {
                            Image(systemName: "checkmark").foregroundStyle(SL.Signal.action)
                            Text("\(playlist.title) · friends can open it").slMeta().foregroundStyle(SL.Ink.secondary)
                        }
                    }
                }

                Text("Shown on your post as text with a link. Setline doesn't connect to your Spotify or Apple Music account.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Button("Done", action: onClose)
                    .buttonStyle(SLPrimaryButtonStyle())
            }
        }
        .onAppear { link = playlist?.url ?? "" }
    }

    private var canAddSong: Bool {
        !song.trimmingCharacters(in: .whitespaces).isEmpty && songs.count < PostDraft.maxSongs
    }

    /// "Till I Collapse – Eminem" → title and artist.
    private func addSong() {
        guard canAddSong else { return }
        let parts = song.split(whereSeparator: { $0 == "–" || $0 == "-" }).map { $0.trimmingCharacters(in: .whitespaces) }
        let title = parts.first ?? song
        let artist = parts.count > 1 ? parts.dropFirst().joined(separator: " – ") : nil
        let insertAt = tracks.firstIndex { $0.kind == "playlist" } ?? tracks.count
        tracks.insert(DraftTrack(kind: "song", title: String(title.prefix(120)), artist: artist), at: insertAt)
        song = ""
    }

    /// A pasted link becomes the post's one playlist, named by its service.
    private func setPlaylist(_ value: String) {
        tracks.removeAll { $0.kind == "playlist" }
        var text = value.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        if !text.hasPrefix("http") { text = "https://" + text }
        guard text.hasPrefix("https://"), let host = URL(string: text)?.host() else { return }
        let service = host.contains("spotify") ? "Spotify playlist"
            : host.contains("music.apple") ? "Apple Music playlist"
            : host.contains("youtube") ? "YouTube playlist"
            : host.contains("soundcloud") ? "SoundCloud playlist"
            : "Playlist"
        tracks.append(DraftTrack(kind: "playlist", title: service, artist: nil, url: text))
    }
}
