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

/// Music on a post: text and a link, never artwork.
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
                            .overlay(alignment: .top) { if index > 0 { SLHairline().padding(.leading, SL.Space.s4) } }
                    }
                }
                .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))
            }
        } else if let first = tracks.first {
            HStack(spacing: SL.Space.s2) {
                Image(systemName: "music.note").font(.system(size: 14, weight: .semibold)).foregroundStyle(SL.Signal.action)
                (Text(first.title).font(.sl(SL.TypeSize.meta, SL.Weight.semibold)).foregroundColor(SL.Ink.primary)
                    + Text(caption(first)).font(.sl(SL.TypeSize.meta, SL.Weight.regular)).foregroundColor(SL.Ink.secondary))
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, SL.Space.s3)
            .frame(minHeight: 40)
            .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
            .accessibilityElement(children: .combine)
        }
    }

    private func caption(_ first: PostTrack) -> String {
        var text = first.artist.map { " · \($0)" } ?? (first.isPlaylist ? "" : "")
        if tracks.count > 1 { text += " · +\(tracks.count - 1) more" }
        return text
    }

    @ViewBuilder
    private func row(_ track: PostTrack) -> some View {
        let label = HStack(spacing: SL.Space.s3) {
            Image(systemName: track.isPlaylist ? "music.note.list" : "music.note")
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 1) {
                Text(track.title).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                if let artist = track.artist { Text(artist).slMeta().foregroundStyle(SL.Ink.secondary) }
            }
            Spacer(minLength: SL.Space.s2)
            if track.url != nil {
                Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(SL.Ink.secondary)
            }
        }
        .padding(.horizontal, SL.Space.s4)
        .frame(minHeight: 52)
        .contentShape(Rectangle())

        if let url = track.url.flatMap(URL.init(string:)) {
            Link(destination: url) { label }.accessibilityHint("Opens the link")
        } else {
            label
        }
    }
}

struct ProfileTarget: Identifiable { let id: String }

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
                ForEach(["Spam", "Inappropriate", "Harassment", "Something else"], id: \.self) { reason in
                    Button("Report: \(reason)") { Task { try? await social.report(comment: comment, reason: reason) } }
                }
                Button("Block \(comment.author?.display_name ?? "them")", role: .destructive) {
                    Task { try? await social.block(comment.user_id) }
                }
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
            TextField("Add a comment…", text: $draft, axis: .vertical)
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
            .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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

    private var stats: some View {
        let golds = posts.flatMap(\.medals).filter { $0.place == 1 }.count
        return HStack(spacing: SL.Space.s3) {
            statTile("\(streak)", streak == 1 ? "week streak" : "week streak")
            statTile("\(posts.count)", posts.count == 1 ? "post" : "posts")
            statTile("\(golds)", golds == 1 ? "best ever" : "bests ever")
        }
    }

    private func statTile(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value).font(.sl(24, SL.Weight.semibold)).slNumerals().foregroundStyle(SL.Ink.primary)
            Text(label).slMeta().foregroundStyle(SL.Ink.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .slListCard()
        .accessibilityElement(children: .combine)
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
                VStack(spacing: 0) {
                    ForEach(Array(posts.enumerated()), id: \.element.id) { index, post in
                        Button { opened = ProfileTarget(id: post.id) } label: {
                            HStack(spacing: SL.Space.s3) {
                                SLWorkoutSymbol(dayName: post.title, size: 18)
                                    .foregroundStyle(SL.Ink.secondary)
                                    .frame(width: 36, height: 36)
                                    .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(post.displayTitle).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary).lineLimit(1)
                                    Text("\(PostCard.when(post.date)) · \(post.title)").slMeta().foregroundStyle(SL.Ink.secondary)
                                }
                                Spacer(minLength: SL.Space.s2)
                                if isMe && post.postVisibility == .private {
                                    Image(systemName: "lock.fill").font(.system(size: 12)).foregroundStyle(SL.Ink.secondary)
                                        .accessibilityLabel("Only you")
                                }
                                if let gold = post.medals.first(where: { $0.place == 1 }), let place = LiftMedal.Place(rawValue: gold.place) {
                                    SLMedal(place: place, size: 20)
                                }
                                SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
                            }
                            .padding(.horizontal, SL.Space.s4)
                            .frame(minHeight: 60)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(SLRowButtonStyle())
                        .overlay(alignment: .top) { if index > 0 { SLHairline().padding(.leading, 64) } }
                    }
                }
                .slBorderBox()
                .slListCard()
            }
        }
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
