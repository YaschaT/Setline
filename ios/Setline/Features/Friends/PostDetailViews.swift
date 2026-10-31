import SwiftUI
import SetlineCore

// MARK: - Small pieces of a post

/// Who sees your own post, on its card.
struct VisibilityBadge: View {
    let visibility: PostVisibility

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: visibility == .private ? "lock.fill" : "person.2.fill")
                .font(.system(size: 10, weight: .bold))
            Text(visibility.label)
                .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
        }
        .foregroundStyle(SL.Ink.secondary)
        .padding(.horizontal, SL.Space.s2 + 2)
        .padding(.vertical, 5)
        .background(Capsule().fill(SL.Surface.raised2))
        .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Visible to: \(visibility.label)")
    }
}

/// A post's photos: one wide, two side by side, three or four in a grid;
/// in the full post, a carousel.
struct PostPhotos: View {
    let photos: [PostMedia]
    var carousel = false

    var body: some View {
        if carousel {
            TabView {
                ForEach(photos) { photo in
                    PostPhoto(path: photo.path)
                        .clipShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
                        .padding(.bottom, photos.count > 1 ? 28 : 0)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: photos.count > 1 ? .always : .never))
            .aspectRatio(4 / 5, contentMode: .fit)
        } else {
            let shape = RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
            Group {
                switch photos.count {
                case 1:
                    PostPhoto(path: photos[0].path).aspectRatio(4 / 3, contentMode: .fit)
                case 2:
                    HStack(spacing: 4) {
                        ForEach(photos) { PostPhoto(path: $0.path).aspectRatio(4 / 5, contentMode: .fit) }
                    }
                default:
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)], spacing: 4) {
                        ForEach(photos.prefix(4)) { PostPhoto(path: $0.path).aspectRatio(1, contentMode: .fit) }
                    }
                }
            }
            .clipShape(shape)
        }
    }
}

/// One photo from the private bucket, read with the account's token.
struct PostPhoto: View {
    @Environment(SocialStore.self) private var social
    let path: String
    @State private var image: UIImage?

    var body: some View {
        Rectangle()
            .fill(SL.Surface.hairline)
            .overlay {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    ProgressView().tint(SL.Ink.secondary)
                }
            }
            .clipped()
            .task(id: path) { image = await social.image(path) }
            .accessibilityLabel("Photo")
    }
}

/// Music on a post: the cover with a preview to play in Setline, and the
/// way to the full song.
struct PostMusic: View {
    let tracks: [PostTrack]
    var full = false

    var body: some View {
        if full {
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                Text("Music").slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                VStack(spacing: 0) {
                    ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                        row(track)
                            .padding(.leading, SL.Space.s3)
                            .frame(minHeight: 64)
                            .overlay(alignment: .top) { if index > 0 { SLHairline().padding(.leading, 68) } }
                    }
                }
                .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))
            }
        } else if let first = tracks.first {
            HStack(spacing: SL.Space.s2) {
                row(first, size: 40)
                if tracks.count > 1 {
                    Text("+\(tracks.count - 1)")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.trailing, SL.Space.s2)
                }
            }
            .padding(.leading, 6)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
        }
    }

    private func row(_ track: PostTrack, size: CGFloat = 48) -> some View {
        TrackRow(id: track.id, title: track.title, artist: track.artist, url: track.url,
                 isPlaylist: track.isPlaylist, size: size)
    }
}

struct ProfileTarget: Identifiable { let id: String }

/// A line through the values, scaled to fill the frame.
struct Sparkline: Shape {
    let values: [Double]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard values.count >= 2, let low = values.min(), let high = values.max() else { return path }
        let span = max(high - low, 0.1)
        for (index, value) in values.enumerated() {
            let point = CGPoint(x: rect.minX + rect.width * CGFloat(index) / CGFloat(values.count - 1),
                                y: rect.maxY - rect.height * CGFloat((value - low) / span))
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        return path
    }
}

// MARK: - The full post

/// A post on its own, with its comments (SETLINE Social 7).
struct PostDetailView: View {
    @Environment(SocialStore.self) private var social
    let postID: String
    let onClose: () -> Void

    @State private var comments: [PostComment] = []
    @State private var loading = true
    @State private var draft = ""
    @State private var sending = false
    @State private var reportingComment: PostComment?
    @FocusState private var typing: Bool

    private var post: FeedPost? { social.feed.first { $0.id == postID } }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onClose) {
                    HStack(spacing: 2) {
                        SLGlyph(name: .chevronLeft, size: 18)
                        Text("Friends").slBody()
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to Friends")
                Spacer()
            }
            .padding(.horizontal, SL.Space.s4)

            if let post {
                ScrollView {
                    VStack(alignment: .leading, spacing: SL.Space.s6) {
                        PostCard(post: post, isDetail: true)
                        if !post.isRest, !post.trainedWith.isEmpty || !(post.exercises ?? []).isEmpty {
                            TogetherSection(post: post)
                        }
                        commentsSection(post)
                    }
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.top, SL.Space.s2)
                    .padding(.bottom, SL.Space.s6)
                }
                .scrollDismissesKeyboard(.interactively)
                .safeAreaInset(edge: .bottom) { composer(post) }
                .task(id: post.id) { await reload(post) }
            } else {
                Text("This post is no longer here.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(SL.Surface.ground.ignoresSafeArea())
        .confirmationDialog(
            "\(reportingComment?.author?.display_name.split(separator: " ").first.map(String.init) ?? "Their")'s comment",
            isPresented: Binding(get: { reportingComment != nil }, set: { if !$0 { reportingComment = nil } }),
            titleVisibility: .visible
        ) {
            if let comment = reportingComment {
                Button("Report comment", role: .destructive) {
                    Task { try? await social.report(comment: comment, reason: "Reported from the app") }
                }
                Button("Block \(comment.author?.display_name.split(separator: " ").first.map(String.init) ?? "them")", role: .destructive) {
                    Task { try? await social.block(comment.user_id) }
                }
                Button("Cancel", role: .cancel) {}
            }
        } message: {
            Text("Setline reviews every report within 24 hours.")
        }
        .slRespondsToTextSize()
    }

    private func reload(_ post: FeedPost) async {
        loading = true
        comments = (try? await social.comments(for: post)) ?? []
        loading = false
    }

    @ViewBuilder
    private func commentsSection(_ post: FeedPost) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            Text(comments.isEmpty ? "Comments" : "Comments · \(comments.count)")
                .slLead(SL.Weight.semibold)
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)
            if loading {
                ProgressView().tint(SL.Ink.secondary).frame(maxWidth: .infinity)
            } else if comments.isEmpty {
                VStack(spacing: SL.Space.s2) {
                    Image(systemName: "bubble.left").font(.system(size: 22)).foregroundStyle(SL.Ink.tertiary)
                    Text("No comments yet").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    Text("Be the first to say well done.").slMeta().foregroundStyle(SL.Ink.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(SL.Space.s5)
                .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .strokeBorder(SL.Surface.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 4])))
            } else {
                ForEach(comments) { comment in
                    commentRow(comment, on: post)
                }
            }
        }
    }

    private func commentRow(_ comment: PostComment, on post: FeedPost) -> some View {
        let mine = comment.user_id == social.myID
        let canDelete = mine || post.user_id == social.myID
        return HStack(alignment: .top, spacing: SL.Space.s3) {
            Text(comment.author?.initial ?? "?")
                .font(.slFixed(13, SL.Weight.semibold))
                .foregroundStyle(SL.Signal.action)
                .frame(width: 32, height: 32)
                .background(Circle().fill(SL.Surface.raised2))
            VStack(alignment: .leading, spacing: 3) {
                (Text(mine ? "You" : (comment.author?.display_name.split(separator: " ").first.map(String.init) ?? "Friend"))
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold)).foregroundColor(SL.Ink.primary)
                    + Text(" · \(PostCard.when(comment.date))").font(.sl(SL.TypeSize.meta, SL.Weight.regular)).foregroundColor(SL.Ink.secondary))
                Text(comment.body)
                    .slBody()
                    .foregroundStyle(SL.Ink.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Menu {
                if canDelete {
                    Button("Delete comment", systemImage: "trash", role: .destructive) {
                        Task {
                            try? await social.deleteComment(comment)
                            comments.removeAll { $0.id == comment.id }
                        }
                    }
                }
                if !mine {
                    Button("Report or block", systemImage: "exclamationmark.bubble") { reportingComment = comment }
                }
            } label: {
                SLGlyph(name: .more, size: 16, fixed: true)
                    .foregroundStyle(SL.Ink.tertiary)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(mine ? "Your comment options" : "Comment options")
        }
        .accessibilityElement(children: .combine)
    }

    private func composer(_ post: FeedPost) -> some View {
        HStack(spacing: SL.Space.s2) {
            TextField(social.offlineSince == nil ? "Add a comment…" : "Comments wait for a connection", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .focused($typing)
                .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                .foregroundStyle(SL.Ink.primary)
                .tint(SL.Signal.action)
                .padding(.horizontal, SL.Space.s4)
                .padding(.vertical, 11)
                .background(Capsule().fill(SL.Surface.raised))
                .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
            Button {
                Task {
                    sending = true
                    let text = draft
                    draft = ""
                    do {
                        try await social.addComment(text, to: post)
                        comments = (try? await social.comments(for: post)) ?? comments
                    } catch {
                        draft = text
                    }
                    sending = false
                }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(SL.Signal.onAction)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? SL.Surface.hairlineStrong : SL.Signal.action))
            }
            .buttonStyle(.plain)
            .disabled(sending || social.offlineSince != nil || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel("Send comment")
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s2)
        .background(SL.Surface.ground.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { SLHairline() }
    }
}

// MARK: - Profile

/// Someone's profile (SETLINE Social 9): who they are, their streak, their
/// medals, and the posts you can see. Someone who isn't a friend yet shows
/// no workouts — only the way to ask.
struct FriendProfileView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(SocialStore.self) private var social
    let userID: String
    let onClose: () -> Void

    @State private var opened: ProfileTarget?

    private var isMe: Bool { userID == social.myID }
    private var person: SocialProfile? {
        if isMe { return social.me }
        return social.friends.first { $0.user_id == userID }
            ?? social.feed.first { $0.user_id == userID }?.author
            ?? (social.incoming + social.outgoing).compactMap { $0.other(than: social.myID) }.first { $0.user_id == userID }
    }
    private var isFriend: Bool { social.friends.contains { $0.user_id == userID } }
    private var isRequested: Bool { social.outgoing.contains { $0.addressee_id == userID } }
    private var posts: [FeedPost] { social.feed.filter { $0.user_id == userID } }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onClose) {
                    HStack(spacing: 2) {
                        SLGlyph(name: .chevronLeft, size: 18)
                        Text("Friends").slBody()
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Spacer()
            }
            .padding(.horizontal, SL.Space.s4)

            ScrollView {
                VStack(spacing: SL.Space.s6) {
                    identity
                    if isMe || isFriend {
                        stats
                        if isMe { nowCard }
                        badges
                        photoGrid
                        postList
                    } else {
                        locked
                    }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s3)
                .padding(.bottom, SL.Space.s8)
            }
        }
        .background(SL.Surface.ground.ignoresSafeArea())
        .fullScreenCover(item: $opened) { target in
            PostDetailView(postID: target.id, onClose: { opened = nil })
        }
        .slRespondsToTextSize()
    }

    private var streak: Int { isMe ? app.streak.weeks : (posts.map(\.streak_weeks).max() ?? 0) }

    private var identity: some View {
        VStack(spacing: SL.Space.s3) {
            Group {
                if isMe {
                    SLAvatar(photo: app.profilePhoto, initial: app.avatarInitial, size: 88)
                } else {
                    Text(person?.initial ?? "?")
                        .font(.slFixed(34, SL.Weight.semibold))
                        .foregroundStyle(SL.Signal.action)
                        .frame(width: 88, height: 88)
                        .background(Circle().fill(SL.Surface.raised2))
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if streak > 0 && (isMe || isFriend) {
                    Text("\(streak)")
                        .font(.slFixed(13, SL.Weight.bold))
                        .foregroundStyle(SL.Signal.onAction)
                        .padding(.horizontal, 6)
                        .frame(minWidth: 28, minHeight: 28)
                        .background(Capsule().fill(SL.Signal.action))
                        .overlay(Capsule().strokeBorder(SL.Surface.ground, lineWidth: 3))
                        .accessibilityLabel("\(streak)-week streak")
                }
            }
            VStack(spacing: 2) {
                Text(isMe ? (person?.display_name ?? "You") : (person?.display_name ?? "Someone"))
                    .font(.sl(26, SL.Weight.bold))
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                if let username = person?.username {
                    Text("@\(username)").slBody().foregroundStyle(SL.Ink.secondary)
                }
            }
            if isMe { statusChips }
            if !isMe {
                friendButton
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var friendButton: some View {
        if isFriend {
            HStack(spacing: 6) {
                Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(SL.Signal.action)
                Text("Friends").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
            }
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: 40)
            .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
        } else if isRequested {
            Text("Requested")
                .slBody(SL.Weight.semibold)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.horizontal, SL.Space.s4)
                .frame(minHeight: 40)
                .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
        } else if let person {
            Button { Task { try? await social.request(person) } } label: { Text("Add friend") }
                .buttonStyle(SLPrimaryButtonStyle())
        }
    }

    /// PRs this year: your own gold medals across every workout logged
    /// this year; for a friend, the golds on the posts you can see.
    @State private var prsThisYear = 0
    private var reachedBadges: [Milestone] {
        Milestones.make(sessions: app.sessions, bestStreak: app.streak.best).filter(\.isReached)
    }

    private func countPRs() {
        let year = Calendar.current.component(.year, from: Date())
        if isMe {
            let thisYear = app.sessions.filter { $0.kind == .workout && Calendar.current.component(.year, from: $0.date) == year }
            prsThisYear = thisYear.reduce(0) { $0 + Medals.medals(for: $1, in: app.sessions).filter { $0.place == .gold }.count }
        } else {
            prsThisYear = posts.filter { Calendar.current.component(.year, from: $0.date) == year }
                .flatMap(\.medals).filter { $0.place == 1 }.count
        }
    }

    private var stats: some View {
        let workouts = isMe ? app.sessions.filter { $0.kind == .workout }.count : posts.count
        return HStack(spacing: SL.Space.s3) {
            statTile("\(streak)", "week streak", icon: "flame.fill", ink: streak > 0 ? SL.Signal.action : SL.Ink.tertiary)
            statTile("\(workouts)", isMe ? (workouts == 1 ? "workout" : "workouts") : (workouts == 1 ? "post" : "posts"), icon: "dumbbell.fill", ink: SL.Ink.secondary)
            statTile(prsThisYear == 0 ? "—" : "\(prsThisYear)", "PRs this year", icon: "trophy.fill", ink: prsThisYear > 0 ? Color(hex: 0xE8C35A) : SL.Ink.tertiary)
        }
        .task(id: posts.count) { countPRs() }
    }

    private func statTile(_ value: String, _ label: String, icon: String, ink: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(ink).accessibilityHidden(true)
            Text(value).font(.sl(24, SL.Weight.semibold)).slNumerals().foregroundStyle(SL.Ink.primary)
            Text(label).slMeta().foregroundStyle(SL.Ink.secondary).lineLimit(2).fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .slListCard()
        .accessibilityElement(children: .combine)
    }

    /// Your whole collection: earned badges in colour, the ones ahead dimmed
    /// with how far along you are. Friends' badges are not shared.
    @ViewBuilder
    private var badges: some View {
        if isMe {
            let all = Milestones.make(sessions: app.sessions, bestStreak: app.streak.best) + app.habitMilestones()
            let earned = all.filter(\.isReached)
            // The next of each kind, so the collection reads as a path, not a wall.
            let ahead = Dictionary(grouping: all.filter { !$0.isReached }, by: \.kind).values
                .compactMap { $0.max { $0.fraction < $1.fraction } }
                .sorted { $0.fraction > $1.fraction }
            let shown = earned.reversed() + ahead
            VStack(alignment: .leading, spacing: SL.Space.s3) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Badges").slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary).accessibilityAddTraits(.isHeader)
                    Spacer()
                    Text("\(earned.count) of \(all.count) earned").slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
                }
                if let next = ahead.first {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Next: \(next.title)").slMeta(SL.Weight.semibold).foregroundStyle(SL.Ink.primary).lineLimit(1)
                            Spacer()
                            Text("\(Int((next.fraction * 100).rounded())) %").slMeta().slNumerals().foregroundStyle(SL.Signal.action)
                        }
                        GeometryReader { proxy in
                            ZStack(alignment: .leading) {
                                Capsule().fill(SL.Surface.raised2)
                                Capsule().fill(SL.Signal.action).frame(width: max(6, proxy.size.width * next.fraction))
                            }
                        }
                        .frame(height: 6)
                        if !next.howTo.isEmpty { Text(next.howTo).slMeta().foregroundStyle(SL.Ink.secondary).fixedSize(horizontal: false, vertical: true) }
                    }
                    .padding(SL.Space.s3)
                    .slListCard()
                    .accessibilityElement(children: .combine)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: SL.Space.s2), count: 4), spacing: SL.Space.s3) {
                    ForEach(Array(shown.prefix(12))) { badge in
                        VStack(spacing: 4) {
                            SLBadge(milestone: badge, size: 60)
                                .saturation(badge.isReached ? 1 : 0)
                                .opacity(badge.isReached ? 1 : 0.35)
                            Text(badge.title)
                                .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                                .foregroundStyle(badge.isReached ? SL.Ink.primary : SL.Ink.tertiary)
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(badge.title), \(badge.isReached ? "earned" : "\(Int((badge.fraction * 100).rounded())) percent of the way")")
                    }
                }
            }
        }
    }

    /// Where you stand today: the weight, its last month as a line, and the goal.
    @ViewBuilder
    private var nowCard: some View {
        let progress = BodyProgress.make(metrics: app.metrics)
        if let latest = progress.latest {
            let kg = NSDecimalNumber(decimal: latest.weightKg).doubleValue
            let month = progress.entries.filter { $0.date > Date().addingTimeInterval(-30 * 86_400) }
                .map { NSDecimalNumber(decimal: $0.weightKg).doubleValue }
            let goal = GoalPreference.goal
            let check = goal.map { GoalCheck.evaluate(goal: $0, weighIns: GoalCheck.weighIns(progress), startedAt: GoalPreference.since) }
            HStack(alignment: .center, spacing: SL.Space.s4) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("RIGHT NOW").font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).tracking(1.2).foregroundStyle(SL.Ink.secondary)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(String(format: "%.1f", kg)).font(.sl(30, SL.Weight.bold)).slNumerals().foregroundStyle(SL.Ink.primary)
                        Text("kg").slBody().foregroundStyle(SL.Ink.secondary)
                    }
                    if let check {
                        HStack(spacing: 4) {
                            Image(systemName: check.verdictSymbol).font(.system(size: 11, weight: .bold))
                            Text("\(check.goal.title) · \(check.headline)").font(.sl(SL.TypeSize.meta, SL.Weight.semibold)).lineLimit(1)
                        }
                        .foregroundStyle(check.verdictInk)
                    } else {
                        Text("No goal set").slMeta().foregroundStyle(SL.Ink.secondary)
                    }
                }
                Spacer(minLength: SL.Space.s2)
                if month.count >= 2 {
                    Sparkline(values: month)
                        .stroke(SL.Signal.action, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                        .frame(width: 120, height: 48)
                        .accessibilityLabel("Weight over the last month")
                }
            }
            .padding(SL.Space.s4)
            .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
            .overlay(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).strokeBorder(SL.Surface.hairline, lineWidth: 1))
        }
    }

    /// Goal, weight and this week, as chips under the name.
    private var statusChips: some View {
        let progress = BodyProgress.make(metrics: app.metrics)
        let thisWeek = app.sessions.filter { $0.kind == .workout && Calendar.current.isDate($0.date, equalTo: Date(), toGranularity: .weekOfYear) }.count
        return SLFlow(spacing: SL.Space.s2) {
            if let goal = GoalPreference.goal { chip("scope", goal.title) }
            if let latest = progress.latest { chip("scalemass.fill", "\(app.display.number(latest.weightKg)) kg") }
            chip("calendar", thisWeek == 1 ? "1 workout this week" : "\(thisWeek) workouts this week")
        }
    }

    private func chip(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold)).foregroundStyle(SL.Signal.action)
            Text(text).font(.sl(SL.TypeSize.meta, SL.Weight.medium)).slNumerals().foregroundStyle(SL.Ink.primary)
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 30)
        .background(Capsule().fill(SL.Surface.raised2))
    }

    /// Every photo from the posts you can see, newest first.
    @ViewBuilder
    private var photoGrid: some View {
        let photos = posts.flatMap { post in post.photos.map { (post.id, $0) } }
        if !photos.isEmpty {
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                Text("Photos").slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary).accessibilityAddTraits(.isHeader)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3), spacing: 4) {
                    ForEach(Array(photos.prefix(9).enumerated()), id: \.offset) { _, item in
                        Button { opened = ProfileTarget(id: item.0) } label: {
                            Color.clear
                                .aspectRatio(1, contentMode: .fit)
                                .overlay { PostPhoto(path: item.1.path) }
                                .clipShape(RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous))
                        }
                        .buttonStyle(SLPressStyle(scale: 0.97))
                        .accessibilityLabel("Photo, opens its post")
                    }
                }
            }
        }
    }

    private var postList: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text("Posts").slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary).accessibilityAddTraits(.isHeader)
            if posts.isEmpty {
                Text(isMe ? "No posts yet. Finish a workout and tap Create post." : "No posts yet.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.vertical, SL.Space.s3)
            } else {
                let columns = typeSize.isAccessibilitySize
                    ? [GridItem(.flexible())]
                    : [GridItem(.flexible(), spacing: SL.Space.s3), GridItem(.flexible(), spacing: SL.Space.s3)]
                LazyVGrid(columns: columns, spacing: SL.Space.s3) {
                    ForEach(posts) { post in
                        Button { opened = ProfileTarget(id: post.id) } label: { postTile(post) }
                            .buttonStyle(SLRowButtonStyle())
                    }
                }
            }
        }
    }

    private func postTile(_ post: FeedPost) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(spacing: 6) {
                Text("\(PostCard.when(post.date)) · \(post.title)")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.secondary)
                    .lineLimit(1)
                if isMe && post.postVisibility == .private {
                    Image(systemName: "lock.fill").font(.system(size: 10)).foregroundStyle(SL.Ink.secondary)
                        .accessibilityLabel("Only you")
                }
            }
            Text(post.displayTitle)
                .slBody(SL.Weight.semibold)
                .foregroundStyle(SL.Ink.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            if let photo = post.photos.first {
                PostPhoto(path: photo.path)
                    .frame(height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous))
            } else if let gold = post.medals.first(where: { $0.place == 1 }), let place = LiftMedal.Place(rawValue: gold.place) {
                HStack(spacing: 6) {
                    SLMedal(place: place, size: 18)
                    Text(post.medals.filter { $0.place == 1 }.count == 1 ? "1 gold" : "\(post.medals.filter { $0.place == 1 }.count) gold")
                        .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                        .foregroundStyle(SLMedal.metal(place).face)
                }
            } else {
                Text(kudosAndComments(post))
                    .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 128, alignment: .topLeading)
        .slBorderBox()
        .slListCard()
        .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func kudosAndComments(_ post: FeedPost) -> String {
        let k = post.kudos.count, c = post.commentCount
        if k == 0 && c == 0 { return "No kudos yet" }
        return "\(k) kudos · \(c == 1 ? "1 comment" : "\(c) comments")"
    }

    private var locked: some View {
        VStack(spacing: SL.Space.s2) {
            Image(systemName: "lock.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(SL.Signal.recovery)
                .frame(width: 48, height: 48)
                .background(Circle().fill(SL.Signal.recoveryTint))
            Text("Workouts are for friends").slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
            Text("Once \(person?.display_name.split(separator: " ").first.map(String.init) ?? "they") accept, you'll see each other's Friends posts, earlier ones included.")
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity)
        .slBorderBox()
        .slListCard(radius: SL.Radius.xl)
    }
}
