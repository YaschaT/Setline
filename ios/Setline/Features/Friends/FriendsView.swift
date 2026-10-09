import SwiftUI
import SetlineCore

/// Friends: the workouts of the people you train alongside, and kudos for
/// theirs. Only accepted friends see a post, and a post is a summary — the
/// name of the day, its numbers and its medals — never the log behind it.
struct FriendsView: View {
    @Environment(AppState.self) private var app
    @Environment(SocialStore.self) private var social
    @State private var showsPeople = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                header
                switch social.phase {
                case .loading:
                    ProgressView()
                        .tint(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.top, SL.Space.s12)
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
                    if !social.incoming.isEmpty { requestsBanner }
                    if social.feed.isEmpty {
                        emptyFeed
                    } else {
                        ForEach(social.feed) { post in
                            PostCard(post: post)
                        }
                    }
                }
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)
            .padding(.bottom, SL.Space.s6)
        }
        .refreshable { await social.load() }
        .task(id: app.userID) { await social.load() }
        .sheet(isPresented: $showsPeople) {
            PeopleSheet(onClose: { showsPeople = false })
        }
        .slRespondsToTextSize()
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Friends")
                    .font(.sl(SL.TypeSize.display, SL.Weight.bold))
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                if let me = social.me {
                    Text("@\(me.username) · \(social.friends.count == 1 ? "1 friend" : "\(social.friends.count) friends")")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            Spacer()
            if social.phase == .ready {
                Button { showsPeople = true } label: {
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(SL.Ink.primary)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(SL.Surface.raised))
                        .overlay(Circle().strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border))
                        .overlay(alignment: .topTrailing) {
                            if !social.incoming.isEmpty {
                                Circle().fill(SL.Signal.attention).frame(width: 10, height: 10).offset(x: 1, y: -1)
                            }
                        }
                        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                        .contentShape(Circle())
                }
                .buttonStyle(SLPressStyle(scale: 0.9, bounces: true))
                .accessibilityLabel(social.incoming.isEmpty ? "Add friends" : "Friends, \(social.incoming.count) requests")
            }
        }
    }

    private var requestsBanner: some View {
        Button { showsPeople = true } label: {
            HStack(spacing: SL.Space.s3) {
                Image(systemName: "person.2")
                    .font(.system(size: 15, weight: .semibold))
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

    private var emptyFeed: some View {
        VStack(spacing: SL.Space.s3) {
            Image(systemName: "person.2")
                .font(.system(size: 36, weight: .light))
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
    let post: FeedPost

    @State private var confirmsBlock = false
    @State private var reporting = false
    @State private var bursts = 0

    private var isMine: Bool { post.user_id == social.myID }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
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
                Spacer()
                menu
            }

            Text(post.title)
                .font(.sl(SL.TypeSize.display, SL.Weight.bold))
                .tracking(-0.02 * SL.TypeSize.display)
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, SL.Space.s4)

            stats.padding(.top, SL.Space.s3)

            if !post.medals.isEmpty {
                VStack(alignment: .leading, spacing: SL.Space.s2) {
                    ForEach(Array(post.medals.prefix(3).enumerated()), id: \.offset) { _, medal in
                        HStack(spacing: SL.Space.s2) {
                            if let place = LiftMedal.Place(rawValue: medal.place) {
                                SLMedal(place: place, size: 24)
                                Text(medal.name)
                                    .slBody(SL.Weight.medium)
                                    .foregroundStyle(SL.Ink.primary)
                                    .lineLimit(1)
                                Text("\(place.title) · \(app.display.kg(Decimal(medal.weight_kg))) × \(medal.reps)")
                                    .slMeta()
                                    .slNumerals()
                                    .foregroundStyle(SL.Ink.secondary)
                                    .lineLimit(1)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
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
            Text("Setline reviews every report.")
        }
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
        HStack(alignment: .top, spacing: 0) {
            stat(app.display.volumeKg(Decimal(post.volume_kg)), "volume")
            if let seconds = post.duration_seconds, seconds > 0 {
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
        return HStack(spacing: SL.Space.s3) {
            if !isMine {
                Button {
                    if !given { bursts += 1 }
                    Task { await social.toggleKudos(post) }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: given ? "hands.clap.fill" : "hands.clap")
                            .font(.system(size: 16, weight: .semibold))
                            .symbolEffect(.bounce, value: bursts)
                        Text(given ? "Kudos given" : "Give kudos").slBody(SL.Weight.semibold)
                    }
                    .foregroundStyle(given ? SL.Signal.onAction : SL.Ink.primary)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(minHeight: 36)
                    .background(Capsule().fill(given ? SL.Signal.action : SL.Surface.raised2))
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Capsule())
                }
                .buttonStyle(SLPressStyle(scale: 0.9, bounces: true))
                .sensoryFeedback(.impact(weight: .medium), trigger: bursts)
                .accessibilityLabel(given ? "Take back kudos" : "Give kudos")
            }
            Text(kudosLine)
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .lineLimit(1)
            Spacer(minLength: 0)
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
                Button("Delete post", role: .destructive) { Task { try? await social.delete(post) } }
            } else {
                Button("Report post") { reporting = true }
                Button("Remove friend") { Task { try? await social.remove(post.user_id) } }
                Button("Block", role: .destructive) { confirmsBlock = true }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .semibold))
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
                            ShareLink(item: "Train with me on Setline. Add me: @\(me.username)") {
                                Label("Invite", systemImage: "square.and.arrow.up")
                                    .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                            }
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
