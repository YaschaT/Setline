import SwiftUI
import SetlineCore

/// Friends: the workouts of the people you train alongside, and kudos for
/// theirs. Only accepted friends see a post, and a post is a summary — the
/// name of the day, its numbers and its medals — never the log behind it.
struct FriendsView: View {
    @Environment(AppState.self) private var app
    @Environment(SocialStore.self) private var social
    /// The avatar's way to Account, as on Training.
    let onAccount: () -> Void
    @State private var showsPeople = false
    @State private var chatting = false
    @State private var composing: ComposeTarget?
    /// Workouts the lifter said not to post, so the prompt moves on.
    @AppStorage("setline.social.skippedPrompts") private var skippedPrompts = ""

    private enum ComposeTarget: Identifiable {
        case workout(TrainingSession)
        case rest(Date)
        var id: String {
            switch self {
            case .workout(let session): return session.id
            case .rest(let date): return SocialStore.restID(date)
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                switch social.phase {
                case .loading:
                    // Cards in the shape of the posts on their way (S2).
                    FeedSkeleton()
                    FeedSkeleton(short: true)
                case .notSetUp:
                    notice(
                        title: "Friends is almost ready",
                        text: "The server still needs its one setup step. Once that's done, this tab fills in by itself."
                    )
                case .failed(let message):
                    notice(title: "Couldn't load your friends", text: message, retry: true)
                case .needsProfile:
                    ProfileSetupCard()
                case .ready:
                    if social.offlineSince != nil { offlineBanner }
                    if !social.incoming.isEmpty { requestsBanner }
                    if !social.friends.isEmpty, social.chatAvailable { chatRow }
                    if !social.pending.isEmpty { pendingBanner }
                    if let session = unpostedWorkout {
                        latestWorkoutPrompt(session)
                    }
                    if !social.hasPost(sessionID: SocialStore.restID(Date())),
                       !app.sessions.contains(where: { $0.kind == .workout && Calendar.current.isDateInToday($0.date) }) {
                        restDayRow
                    }
                    if social.friends.isEmpty { onlyYouCard }
                    if social.feed.isEmpty {
                        if social.friends.isEmpty { firstPostHint } else { emptyFeed }
                    } else {
                        ForEach(social.feed) { post in
                            PostCard(post: post)
                        }
                    }
                }
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Metric.tabContentTop)
            .padding(.bottom, SL.Space.s6)
        }
        .slTabHeader { header }
        .refreshable { await social.load() }
        .task(id: app.userID) {
            await social.load()
            await social.refreshChatLatest()
        }
        .fullScreenCover(isPresented: $chatting, onDismiss: { Task { await social.refreshChatLatest() } }) {
            ChatView(onClose: { chatting = false })
        }
        .fullScreenCover(item: $composing) { target in
            switch target {
            case .workout(let session):
                PostComposerView(mode: .create(session), onClose: { composing = nil })
            case .rest(let date):
                PostComposerView(mode: .rest(date), onClose: { composing = nil })
            }
        }
        .sheet(isPresented: $showsPeople) {
            PeopleSheet(onClose: { showsPeople = false })
        }
        .slRespondsToTextSize()
    }

    private var header: some View {
        SLTabHeader(
            title: "Friends",
            subtitle: social.me.map { "@\($0.username) · \(social.friends.count == 1 ? "1 friend" : "\(social.friends.count) friends")" },
            onAccount: onAccount
        ) {
            if social.phase == .ready {
                SLHeaderButton(
                    glyph: .personAdd,
                    label: social.incoming.isEmpty ? "Add friends" : "Friends, \(social.incoming.count) requests"
                ) { showsPeople = true }
            }
        }
    }

    /// The way into the chat, at the top of the feed: the latest message, and
    /// a lime dot while a friend's message is newer than your last look.
    private var chatRow: some View {
        let latest = social.chatLatest
        let unread = latest.map { $0.user_id != social.myID && $0.created_at > ChatReadMarker.value } ?? false
        let who = latest.map { $0.user_id == social.myID ? "You" : ($0.author?.display_name.split(separator: " ").first.map(String.init) ?? "Friend") }
        return Button { chatting = true } label: {
            HStack(spacing: SL.Space.s3) {
                Image(systemName: "bubble.left.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(SL.Signal.action)
                    .frame(width: 40, height: 40)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.actionTint))
                    .overlay(alignment: .topTrailing) {
                        if unread {
                            Circle().fill(SL.Signal.action).frame(width: 10, height: 10)
                                .overlay(Circle().strokeBorder(SL.Surface.ground, lineWidth: 2).padding(-2))
                                .offset(x: 2, y: -2)
                        }
                    }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Chat").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    Text(latest.map { "\(who ?? "Friend"): \($0.body)" } ?? "Ask about training or food, or cheer each other on")
                        .slMeta(unread ? SL.Weight.semibold : SL.Weight.regular)
                        .foregroundStyle(unread ? SL.Ink.primary : SL.Ink.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: SL.Space.s2)
                SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(SL.Space.s3)
            .slBorderBox()
            .slListCard()
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.98))
        .accessibilityLabel(unread ? "Chat, new message" : "Chat")
    }

    private var requestsBanner: some View {
        Button { showsPeople = true } label: {
            HStack(spacing: SL.Space.s3) {
                SLGlyph(name: .people, size: 18, fixed: true)
                    .foregroundStyle(SL.Signal.onAction)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(SL.Signal.attention))
                Text(social.incoming.count == 1
                     ? "\(social.incoming[0].requester?.display_name ?? "Someone") wants to be friends"
                     : "\(social.incoming.count) friend requests")
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Ink.primary)
                Spacer()
                SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(SL.Space.s3)
            .slBorderBox()
            .slListCard()
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.98))
    }

    /// The latest workout of the last three days that has no post yet and
    /// wasn't waved away.
    private var unpostedWorkout: TrainingSession? {
        let skipped = Set(skippedPrompts.split(separator: ",").map(String.init))
        let since = Date().addingTimeInterval(-3 * 86_400)
        return app.sessions
            .filter { $0.kind == .workout && $0.date >= since && !skipped.contains($0.id) && !social.hasPost(sessionID: $0.id) }
            .max { $0.date < $1.date }
    }

    /// "Your latest workout — post it?", with a preview of the post.
    private func latestWorkoutPrompt(_ session: TrainingSession) -> some View {
        let golds = Medals.medals(for: session, in: app.sessions).filter { $0.place == .gold }
        let volume = RecordsEngine.volumeLoad(session.results.flatMap(\.sets))
        let sets = session.results.flatMap(\.sets).filter(\.countsTowardVolume).count
        return VStack(alignment: .leading, spacing: SL.Space.s3) {
            Text("YOUR LATEST WORKOUT")
                .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                .tracking(1.2)
                .foregroundStyle(SL.Ink.secondary)
            // A small preview of the post it becomes.
            HStack(spacing: SL.Space.s3) {
                SLWorkoutSymbol(dayName: session.dayLabel, size: 20)
                    .foregroundStyle(SL.Signal.action)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.actionTint))
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.dayLabel).slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    Text("\(PostCard.when(session.date)) · \(app.display.volumeKg(volume)) · \(sets) sets")
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
                Spacer(minLength: 0)
            }
            if let gold = golds.first {
                HStack(spacing: SL.Space.s2) {
                    SLMedal(place: .gold, size: 22)
                    Text(golds.count == 1 ? "Best ever · \(gold.name)" : "\(golds.count) bests ever · \(gold.name) and more")
                        .slMeta(SL.Weight.semibold)
                        .foregroundStyle(SLMedal.metal(.gold).face)
                        .lineLimit(1)
                }
            }
            HStack(spacing: SL.Space.s2) {
                Button { composing = .workout(session) } label: { Text("Post it") }
                    .buttonStyle(SLPrimaryButtonStyle())
                Button("Not this one") {
                    skippedPrompts = (skippedPrompts.split(separator: ",").map(String.init) + [session.id]).suffix(30).joined(separator: ",")
                }
                .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                .foregroundStyle(SL.Ink.secondary)
                .frame(minHeight: SL.Space.hitMin)
                .padding(.horizontal, SL.Space.s2)
            }
        }
        .padding(SL.Space.s4)
        .slBorderBox()
        .slListCard(radius: SL.Radius.xl)
    }

    /// Resting today: share why, in one tap.
    private var restDayRow: some View {
        Button { composing = .rest(Date()) } label: {
            HStack(spacing: SL.Space.s3) {
                Image(systemName: "moon.zzz.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SL.Signal.recovery)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(SL.Signal.recoveryTint))
                VStack(alignment: .leading, spacing: 2) {
                    Text(app.todayDay == nil ? "Rest day today?" : "Not training today?")
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                    Text("Post a rest day and say why")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                }
                Spacer(minLength: SL.Space.s2)
                SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(SL.Space.s3)
            .slBorderBox()
            .slListCard()
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.98))
    }

    /// No connection: the feed below is what loaded last (S3).
    private var offlineBanner: some View {
        HStack(spacing: SL.Space.s3) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SL.Signal.attention)
                .frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text("You're offline").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                Text(offlineDetail)
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: SL.Space.s2)
            Button("Retry") { Task { await social.load() } }
                .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.primary)
                .padding(.horizontal, SL.Space.s3)
                .frame(minHeight: 36)
                .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                .frame(minHeight: SL.Space.hitMin)
        }
        .padding(SL.Space.s3)
        .slBorderBox()
        .slListCard()
        .accessibilityElement(children: .combine)
    }

    private var offlineDetail: String {
        guard let loaded = social.lastLoaded else { return "Kudos and comments wait for a connection." }
        let time = loaded.formatted(date: Calendar.current.isDateInToday(loaded) ? .omitted : .abbreviated, time: .shortened)
        return "Showing what loaded at \(time). Kudos and comments wait for a connection."
    }

    /// Posts made without a connection, waiting on this phone.
    private var pendingBanner: some View {
        HStack(spacing: SL.Space.s3) {
            Image(systemName: "icloud.and.arrow.up")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SL.Signal.attention)
                .frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(social.pending.count == 1 ? "1 post waiting to go out" : "\(social.pending.count) posts waiting to go out")
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Ink.primary)
                Text("It's saved on this phone and posts when you're back online.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: SL.Space.s2)
            Button("Retry") { Task { await social.load() } }
                .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                .foregroundStyle(SL.Signal.action)
                .frame(minHeight: SL.Space.hitMin)
        }
        .padding(SL.Space.s3)
        .slBorderBox()
        .slListCard()
    }

    /// No friends yet: Friends posts are visible to you alone, and the way
    /// out of that is one tap.
    private var onlyYouCard: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            HStack(alignment: .top, spacing: SL.Space.s3) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SL.Signal.recovery)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(SL.Signal.recoveryTint))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Only you can see this — for now")
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                    Text("Friends you add later see your Friends posts, old ones too. Private posts stay private.")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Button { showsPeople = true } label: { Text("Invite a gym friend") }
                .buttonStyle(SLPrimaryButtonStyle())
        }
        .padding(SL.Space.s4)
        .slBorderBox()
        .slListCard(radius: SL.Radius.xl)
    }

    private var firstPostHint: some View {
        Text("Finish a workout and tap Create post to share it here.")
            .slBody()
            .foregroundStyle(SL.Ink.secondary)
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
            .padding(.vertical, SL.Space.s6)
    }

    private var emptyFeed: some View {
        VStack(spacing: SL.Space.s3) {
            SLGlyph(name: .people, size: 36, fixed: true)
                .foregroundStyle(SL.Ink.tertiary)
            Text("No workouts from friends yet")
                .slLead(SL.Weight.semibold)
                .foregroundStyle(SL.Ink.primary)
            Text("Add the people you train with. Their workouts show up here, and yours show up for them.")
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button { showsPeople = true } label: { Text("Add friends") }
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.top, SL.Space.s2)
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity)
        .slBorderBox()
        .slListCard()
    }

    private func notice(title: String, text: String, retry: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text(title).slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
            Text(text).slBody().foregroundStyle(SL.Ink.secondary).fixedSize(horizontal: false, vertical: true)
            if retry {
                Button { Task { await social.load() } } label: { Text("Try again") }
                    .buttonStyle(SLOutlineButtonStyle())
                    .padding(.top, SL.Space.s2)
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .slListCard()
    }
}

// MARK: - Profile

/// The first visit: a username friends can find you by, and the name they
/// see. Says plainly what is shared and what never is.
private struct ProfileSetupCard: View {
    @Environment(AppState.self) private var app
    @Environment(SocialStore.self) private var social
    @State private var username = ""
    @State private var name = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                Text("Train with friends")
                    .font(.sl(SL.TypeSize.title, SL.Weight.bold))
                    .foregroundStyle(SL.Ink.primary)
                Text("See each other's workouts, medals and streaks, and give kudos. Only friends you accept see your workouts — never your log, body weight or photos.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            field(label: "Username", prefix: "@", text: $username, hint: usernameHint)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: username) { _, value in
                    let cleaned = value.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "_" }
                    if cleaned != value { username = String(cleaned.prefix(20)) }
                }
            field(label: "Name friends see", prefix: nil, text: $name, hint: nil)

            if let error {
                Text(error).slMeta().foregroundStyle(SL.Signal.loss)
            }

            Button {
                Task { await create() }
            } label: { Text(saving ? "Creating…" : "Create profile") }
                .buttonStyle(SLPrimaryButtonStyle())
                .disabled(!canCreate || saving)
        }
        .padding(SL.Space.s5)
        .slBorderBox()
        .slListCard()
        .onAppear {
            if name.isEmpty { name = app.greetingName ?? "" }
            if username.isEmpty { username = SocialStore.suggestedUsername(from: app.greetingName) }
        }
    }

    private var canCreate: Bool {
        SocialStore.isValidUsername(username) && !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var usernameHint: String {
        username.count < 3 ? "3 to 20 letters, numbers or _" : "Friends find you by this"
    }

    private func field(label: String, prefix: String?, text: Binding<String>, hint: String?) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s1) {
            Text(label).slMeta(SL.Weight.semibold).foregroundStyle(SL.Ink.secondary)
            HStack(spacing: 2) {
                if let prefix { Text(prefix).slLead(SL.Weight.regular).foregroundStyle(SL.Ink.tertiary) }
                TextField("", text: text)
                    .font(.sl(SL.TypeSize.lead, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.primary)
            }
            .padding(.horizontal, SL.Space.s3)
            .frame(minHeight: 48)
            .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
            if let hint { Text(hint).slMeta().foregroundStyle(SL.Ink.tertiary) }
        }
    }

    private func create() async {
        saving = true
        error = nil
        do {
            try await social.createProfile(username: username, displayName: name.trimmingCharacters(in: .whitespaces))
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Couldn't create your profile. Try again."
        }
        saving = false
    }
}

// MARK: - A post

/// One workout in the feed: who, when, the day's numbers, its medals and
/// streak, and kudos.
struct PostCard: View {
    @Environment(AppState.self) private var app
    @Environment(SocialStore.self) private var social
    @Environment(\.dynamicTypeSize) private var typeSize
    let post: FeedPost
    /// The full post: all notes, every medal and song, and no way further.
    var isDetail = false

    @State private var confirmsBlock = false
    @State private var reporting = false
    @State private var confirmsDelete = false
    @State private var editing = false
    @State private var opened = false
    @State private var profile: ProfileTarget?
    @State private var bursts = 0

    private var isMine: Bool { post.user_id == social.myID }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SL.Space.s3) {
                Button { profile = ProfileTarget(id: post.user_id) } label: {
                    HStack(spacing: SL.Space.s3) {
                        avatar
                        VStack(alignment: .leading, spacing: 1) {
                            Text(isMine ? "You" : (post.author?.display_name ?? "A friend"))
                                .slBody(SL.Weight.semibold)
                                .foregroundStyle(SL.Ink.primary)
                            Text(Self.when(post.date))
                                .slMeta()
                                .foregroundStyle(SL.Ink.secondary)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens their profile")
                Spacer()
                if isMine { VisibilityBadge(visibility: post.postVisibility) }
                menu
            }

            Group {
                if isDetail {
                    titleBlock
                } else {
                    Button { opened = true } label: { titleBlock.contentShape(Rectangle()) }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens the post and its comments")
                }
            }
            .padding(.top, SL.Space.s4)

            if !post.photos.isEmpty {
                PostPhotos(photos: post.photos, carousel: isDetail)
                    .padding(.top, SL.Space.s4)
            }

            if post.isRest {
                restChip.padding(.top, SL.Space.s4)
            } else {
                stats.padding(.top, SL.Space.s4)
            }

            if !post.isRest, !hiddenNumbers.isEmpty {
                Text(quietLine)
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.top, SL.Space.s2)
            }

            if let place = post.place {
                PostPlaceView(place: place).padding(.top, SL.Space.s4)
            }

            if !post.medals.isEmpty {
                VStack(alignment: .leading, spacing: SL.Space.s2) {
                    ForEach(Array(post.medals.prefix(isDetail ? 20 : 3).enumerated()), id: \.offset) { _, medal in
                        HStack(alignment: typeSize.isAccessibilitySize ? .top : .center, spacing: SL.Space.s2) {
                            if let place = LiftMedal.Place(rawValue: medal.place) {
                                SLMedal(place: place, size: 24, shines: place == .gold)
                                // Side by side while they fit; at the largest
                                // sizes the detail goes under the lift.
                                let layout = typeSize.isAccessibilitySize
                                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
                                    : AnyLayout(HStackLayout(spacing: SL.Space.s2))
                                layout {
                                    Text(medal.name)
                                        .slBody(SL.Weight.medium)
                                        .foregroundStyle(SL.Ink.primary)
                                        .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                                    Text(post.hides(.weights) ? place.title : "\(place.title) · \(app.display.kg(Decimal(medal.weight_kg))) × \(medal.reps)")
                                        .slMeta()
                                        .slNumerals()
                                        .foregroundStyle(SL.Ink.secondary)
                                        .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                                }
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.top, SL.Space.s4)
            }

            if !post.tracks.isEmpty {
                PostMusic(tracks: post.tracks, full: isDetail)
                    .padding(.top, SL.Space.s4)
            }

            Rectangle().fill(SL.Surface.hairline).frame(height: SL.Metric.border)
                .padding(.horizontal, -SL.Space.s4)
                .padding(.top, SL.Space.s4)

            kudosRow.padding(.top, SL.Space.s3)
        }
        .padding(SL.Space.s4)
        .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
        .overlay(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border))
        .confirmationDialog("Block \(post.author?.display_name ?? "them")?", isPresented: $confirmsBlock, titleVisibility: .visible) {
            Button("Block", role: .destructive) { Task { try? await social.block(post.user_id) } }
        } message: {
            Text("You stop being friends and neither of you can send a new request.")
        }
        .confirmationDialog("Report this post", isPresented: $reporting, titleVisibility: .visible) {
            ForEach(["Spam", "Inappropriate", "Not a real workout", "Something else"], id: \.self) { reason in
                Button(reason) { Task { try? await social.report(post: post, reason: reason) } }
            }
        } message: {
            Text("Setline reviews every report within 24 hours.")
        }
        .alert("Delete this post?", isPresented: $confirmsDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { Task { try? await social.delete(post) } }
        } message: {
            Text("Its photos, comments and kudos are removed for everyone. Your workout stays in your log.")
        }
        .fullScreenCover(isPresented: $editing) {
            PostComposerView(mode: .edit(post), onClose: { editing = false })
        }
        .fullScreenCover(isPresented: $opened) {
            PostDetailView(postID: post.id, onClose: { opened = false })
        }
        .fullScreenCover(item: $profile) { target in
            FriendProfileView(userID: target.id, onClose: { profile = nil })
        }
    }

    /// A rest day's why, in the recovery mint.
    private var restChip: some View {
        HStack(spacing: 6) {
            Image(systemName: RestReason.symbol(for: post.rest_reason))
                .font(.system(size: 13, weight: .semibold))
            Text(post.rest_reason ?? "Resting")
                .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
        }
        .foregroundStyle(SL.Signal.recovery)
        .padding(.horizontal, SL.Space.s3)
        .frame(minHeight: 32)
        .background(Capsule().fill(SL.Signal.recoveryTint))
        .accessibilityElement(children: .combine)
    }

    /// The numbers the lifter kept off this post.
    private var hiddenNumbers: [HiddenStat] { HiddenStat.allCases.filter { post.hides($0) } }

    /// "Numbers hidden on this post" — or which, when only some are.
    private var quietLine: String {
        if hiddenNumbers.count == HiddenStat.allCases.count { return "Numbers hidden on this post" }
        let names = hiddenNumbers.map { $0 == .weights ? "weights" : $0.label.lowercased() }
        return "\(names.joined(separator: " and ").prefix(1).uppercased())\(names.joined(separator: " and ").dropFirst()) hidden on this post"
    }

    /// The title and notes: a way into the post on the feed, plain text in it.
    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text(post.displayTitle)
                .font(.sl(SL.TypeSize.display, SL.Weight.bold))
                .tracking(-0.02 * SL.TypeSize.display)
                .foregroundStyle(SL.Ink.primary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if let with = TrainedWithLine.text(post.trainedWith) {
                Text(with).slBody(SL.Weight.medium).foregroundStyle(SL.Signal.action)
            }
            if let notes = post.notes, !notes.isEmpty {
                Text(notes)
                    .slBody()
                    .foregroundStyle(SL.Ink.primary.opacity(0.82))
                    .lineLimit(isDetail ? nil : 3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var avatar: some View {
        Text(post.author?.initial ?? "?")
            .font(.slFixed(15, SL.Weight.semibold))
            .foregroundStyle(SL.Signal.action)
            .frame(width: 40, height: 40)
            .background(Circle().fill(SL.Surface.raised2))
            .overlay(alignment: .bottomTrailing) {
                if post.streak_weeks > 0 {
                    Text("\(post.streak_weeks)")
                        .font(.slFixed(10, SL.Weight.bold))
                        .foregroundStyle(SL.Signal.onAction)
                        .padding(.horizontal, 4)
                        .frame(minWidth: 18, minHeight: 18)
                        .background(Capsule().fill(SL.Signal.action))
                        .overlay(Capsule().strokeBorder(SL.Surface.raised, lineWidth: 2))
                        .offset(x: 4, y: 4)
                        .accessibilityLabel("\(post.streak_weeks)-week streak")
                }
            }
    }

    private var stats: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s2))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 0))
        return layout {
            if !post.hides(.volume) {
                stat(app.display.volumeKg(Decimal(post.volume_kg)), "volume")
            }
            if !post.hides(.duration), let seconds = post.duration_seconds, seconds >= 60 {
                stat(app.display.minutes(seconds), "time")
            }
            stat("\(post.set_count)", "sets")
        }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(label).slMeta().foregroundStyle(SL.Ink.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var kudosRow: some View {
        let given = social.hasKudos(post)
        return VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: SL.Space.s3) {
            if !isMine {
                Button {
                    if !given { bursts += 1 }
                    if !given { SLSound.pop.play() }
                    Task { await social.toggleKudos(post) }
                } label: {
                    HStack(spacing: 6) {
                        SLGlyph(name: given ? .kudosFill : .kudos, size: 18, fixed: true)
                            .keyframeAnimator(initialValue: 1.0, trigger: bursts) { glyph, scale in
                                glyph.scaleEffect(scale).rotationEffect(.degrees((scale - 1) * -60))
                            } keyframes: { _ in
                                SpringKeyframe(1.35, duration: 0.14)
                                SpringKeyframe(1.0, duration: 0.3, spring: .bouncy)
                            }
                        Text(given ? "Kudos given" : "Give kudos").slBody(SL.Weight.semibold).lineLimit(1).fixedSize()
                    }
                    .foregroundStyle(given ? SL.Signal.onAction : SL.Ink.primary)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(minHeight: 36)
                    .background(Capsule().fill(given ? SL.Signal.action : SL.Surface.raised2))
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Capsule())
                }
                .buttonStyle(SLPressStyle(scale: 0.9, bounces: true))
                .disabled(social.offlineSince != nil)
                .opacity(social.offlineSince != nil ? 0.45 : 1)
                .sensoryFeedback(.impact(weight: .medium), trigger: bursts)
                .accessibilityLabel(given ? "Take back kudos" : "Give kudos")
            }
            if !isDetail {
                Button { opened = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 15, weight: .semibold))
                        if post.commentCount > 0 { Text("\(post.commentCount)").slBody(SL.Weight.semibold).slNumerals() }
                    }
                    .foregroundStyle(SL.Ink.primary)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(minHeight: 36)
                    .background(Capsule().fill(SL.Surface.raised2))
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Capsule())
                }
                .buttonStyle(SLPressStyle(scale: 0.9))
                .accessibilityLabel(post.commentCount == 1 ? "1 comment" : "\(post.commentCount) comments")
            }
            if !typeSize.isAccessibilitySize {
                Text(kudosLine)
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        // At the largest sizes the line goes under the buttons, whole.
        if typeSize.isAccessibilitySize && !kudosLine.isEmpty {
            Text(kudosLine)
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, SL.Space.s1)
        }
        }
    }

    /// "Sam and Cleo", "Sam and 2 others", or nothing yet.
    private var kudosLine: String {
        let names = post.kudos.filter { $0.user_id != social.myID }.compactMap { $0.giver?.display_name.split(separator: " ").first.map(String.init) }
        let mine = post.kudos.contains { $0.user_id == social.myID }
        let all = (mine ? ["you"] : []) + names
        switch all.count {
        case 0: return isMine ? "No kudos yet" : ""
        case 1: return "Kudos from \(all[0])"
        case 2: return "Kudos from \(all[0]) and \(all[1])"
        default: return "Kudos from \(all[0]) and \(all.count - 1) others"
        }
    }

    private var menu: some View {
        Menu {
            if isMine {
                Button("Edit post", systemImage: "pencil") { editing = true }
                Button("Delete post", systemImage: "trash", role: .destructive) { confirmsDelete = true }
            } else {
                Button("Report post") { reporting = true }
                Button("Remove friend") { Task { try? await social.remove(post.user_id) } }
                Button("Block", role: .destructive) { confirmsBlock = true }
            }
        } label: {
            SLGlyph(name: .more, size: 20, fixed: true)
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("More")
    }

    /// "Just now", "25 min ago", "3 h ago", "Yesterday", "Mon 5 Oct".
    static func when(_ date: Date, now: Date = Date()) -> String {
        let seconds = now.timeIntervalSince(date)
        if seconds < 60 { return "Just now" }
        if seconds < 3600 { return "\(Int(seconds / 60)) min ago" }
        if Calendar.current.isDateInToday(date) { return "\(Int(seconds / 3600)) h ago" }
        if Calendar.current.isDateInYesterday(date) { return "Yesterday" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.dateFormat = "EEE d MMM"
        return formatter.string(from: date)
    }
}

// MARK: - People

/// Finding friends, answering requests, and the list of friends.
private struct PeopleSheet: View {
    @Environment(SocialStore.self) private var social
    let onClose: () -> Void

    @State private var query = ""
    @State private var found: SocialProfile?
    @State private var searched = false
    @State private var busy = false
    @State private var showsQR = false

    var body: some View {
        NavigationStack {
            List {
                if let me = social.me {
                    Section {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("@\(me.username)").slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                                Text("Friends find you by this").slMeta().foregroundStyle(SL.Ink.secondary)
                            }
                            Spacer()
                            ShareLink(item: social.inviteURL ?? URL(string: "https://setline.app")!, message: Text("Train with me on Setline. Add me: @\(me.username)")) {
                                HStack(spacing: 6) {
                                    SLGlyph(name: .share, size: 16)
                                    Text("Invite")
                                }
                                .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                            }
                        }
                    }
                }

                if let url = social.inviteURL, let me = social.me {
                    Section {
                        Button { showsQR = true } label: {
                            Label("Show my QR code", systemImage: "qrcode")
                                .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                                .foregroundStyle(SL.Ink.primary)
                        }
                        .sheet(isPresented: $showsQR) {
                            InviteQRSheet(url: url, username: me.username, onClose: { showsQR = false })
                        }
                    }
                }

                Section("Find a friend") {
                    HStack {
                        Text("@").foregroundStyle(SL.Ink.tertiary)
                        TextField("username", text: $query)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.search)
                            .onSubmit { Task { await search() } }
                        Button("Find") { Task { await search() } }
                            .disabled(query.count < 3 || busy)
                    }
                    if let found {
                        personRow(found) { requestButton(for: found) }
                    } else if searched {
                        Text("Nobody with that username.").slMeta().foregroundStyle(SL.Ink.secondary)
                    }
                }

                if !social.incoming.isEmpty {
                    Section("Requests") {
                        ForEach(social.incoming, id: \.requester_id) { friendship in
                            if let person = friendship.requester {
                                personRow(person) {
                                    HStack(spacing: SL.Space.s2) {
                                        Button("Decline") { Task { try? await social.remove(person.user_id) } }
                                            .buttonStyle(.borderless)
                                            .foregroundStyle(SL.Ink.secondary)
                                        Button("Accept") { Task { try? await social.accept(friendship) } }
                                            .buttonStyle(.borderless)
                                            .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                                            .foregroundStyle(SL.Signal.onAction)
                                            .padding(.horizontal, SL.Space.s3)
                                            .padding(.vertical, 6)
                                            .background(Capsule().fill(SL.Signal.action))
                                    }
                                }
                            }
                        }
                    }
                }

                if !social.outgoing.isEmpty {
                    Section("Sent") {
                        ForEach(social.outgoing, id: \.addressee_id) { friendship in
                            if let person = friendship.addressee {
                                personRow(person) {
                                    Button("Cancel") { Task { try? await social.remove(person.user_id) } }
                                        .buttonStyle(.borderless)
                                        .foregroundStyle(SL.Ink.secondary)
                                }
                            }
                        }
                    }
                }

                Section(social.friends.isEmpty ? "Friends" : "Friends · \(social.friends.count)") {
                    if social.friends.isEmpty {
                        Text("No friends yet. Find someone by username, or send them an invite.")
                            .slMeta().foregroundStyle(SL.Ink.secondary)
                    }
                    ForEach(social.friends) { friend in
                        personRow(friend) { EmptyView() }
                            .swipeActions {
                                Button("Remove", role: .destructive) { Task { try? await social.remove(friend.user_id) } }
                                Button("Block") { Task { try? await social.block(friend.user_id) } }
                                    .tint(SL.Signal.loss)
                            }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(SL.Surface.ground)
            .navigationTitle("Friends")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done", action: onClose) }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func personRow<Trailing: View>(_ person: SocialProfile, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(spacing: SL.Space.s3) {
            Text(person.initial)
                .font(.slFixed(14, SL.Weight.semibold))
                .foregroundStyle(SL.Signal.action)
                .frame(width: 36, height: 36)
                .background(Circle().fill(SL.Surface.raised2))
            VStack(alignment: .leading, spacing: 1) {
                Text(person.display_name).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                Text("@\(person.username)").slMeta().foregroundStyle(SL.Ink.secondary)
            }
            Spacer()
            trailing()
        }
    }

    @ViewBuilder
    private func requestButton(for person: SocialProfile) -> some View {
        if person.user_id == social.myID {
            Text("You").slMeta().foregroundStyle(SL.Ink.secondary)
        } else if social.friends.contains(where: { $0.user_id == person.user_id }) {
            Text("Friends").slMeta().foregroundStyle(SL.Ink.secondary)
        } else if social.outgoing.contains(where: { $0.addressee_id == person.user_id }) {
            Text("Requested").slMeta().foregroundStyle(SL.Ink.secondary)
        } else if let incoming = social.incoming.first(where: { $0.requester_id == person.user_id }) {
            Button("Accept") { Task { try? await social.accept(incoming) } }.buttonStyle(.borderless)
        } else {
            Button("Add") { Task { try? await social.request(person) } }
                .buttonStyle(.borderless)
                .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                .foregroundStyle(SL.Signal.onAction)
                .padding(.horizontal, SL.Space.s3)
                .padding(.vertical, 6)
                .background(Capsule().fill(SL.Signal.action))
        }
    }

    private func search() async {
        busy = true
        found = try? await social.find(username: query)
        searched = true
        busy = false
    }
}


/// A post card's shape while the feed loads.
private struct FeedSkeleton: View {
    var short = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dim = false

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            HStack(spacing: SL.Space.s3) {
                Circle().fill(SL.Surface.raised2).frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 6) {
                    bar(120, 12, SL.Surface.hairlineStrong)
                    bar(70, 10, SL.Surface.raised2)
                }
            }
            bar(160, 28, SL.Surface.hairlineStrong)
            if !short {
                HStack(spacing: SL.Space.s3) {
                    ForEach(0..<3, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 8).fill(SL.Surface.raised2).frame(height: 34)
                    }
                }
                RoundedRectangle(cornerRadius: SL.Radius.lg).fill(SL.Surface.raised2).frame(height: 150)
                bar(130, 40, SL.Surface.raised2, radius: 20)
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .slListCard(radius: SL.Radius.xl)
        .opacity(short ? 0.6 : 1)
        .opacity(dim ? 0.55 : 1)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { dim = true }
        }
        .accessibilityHidden(true)
    }

    private func bar(_ width: CGFloat, _ height: CGFloat, _ fill: Color, radius: CGFloat = 6) -> some View {
        RoundedRectangle(cornerRadius: radius).fill(fill).frame(width: width, height: height)
    }
}
