import SwiftUI
import PhotosUI

/// When a chat was last open on this phone, for the unread dot. No room is
/// the friends' chat.
enum ChatReadMarker {
    private static let key = "setline.chat.lastRead"
    private static func key(_ room: String?) -> String { room.map { "\(key).\($0)" } ?? key }
    static func value(_ room: String? = nil) -> String { UserDefaults.standard.string(forKey: key(room)) ?? "" }
    static var value: String { value(nil) }
    static func set(_ createdAt: String, room: String? = nil) { UserDefaults.standard.set(createdAt, forKey: key(room)) }
}

private func firstWord(_ name: String?) -> String? {
    name?.split(separator: " ").first.map(String.init)
}

// MARK: - Notifications

/// Chat alerts on this iPhone: a notification when a friend writes, in
/// Friends, a private chat or one of your rooms (ChatAlerts).
private struct ChatNotifyRow: View {
    @State private var isOn = ChatAlerts.isEnabled
    @State private var denied = false

    var body: some View {
        HStack(spacing: SL.Space.s3) {
            Image(systemName: isOn ? "bell.badge.fill" : "bell.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SL.Signal.action)
                .frame(width: 36, height: 36)
                .background(SL.Signal.actionTint, in: RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("Notifications").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                Text(denied
                     ? "Notifications are off for Setline. Turn them on in Settings › Setline › Notifications."
                     : "When a friend writes to you, in Friends, a private chat or your rooms. iPhone checks in the background, so one can come a little later.")
                    .slMeta().foregroundStyle(SL.Ink.secondary).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Toggle("Chat notifications", isOn: Binding(get: { isOn }, set: { on in
                isOn = on
                Task {
                    let granted = await ChatAlerts.setEnabled(on)
                    isOn = granted
                    denied = on && !granted
                }
            }))
            .labelsHidden()
            .tint(SL.Signal.action)
        }
        .padding(SL.Space.s3)
        .background(SL.Surface.raised, in: RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).strokeBorder(SL.Surface.hairline, lineWidth: 1))
    }
}

// MARK: - The list of chats

/// Every conversation, newest first, with the way to start a private chat or
/// a room: the friends' chat, Everyone (every Setline lifter), private chats
/// and rooms. Opens straight into the friends' chat while the server has no
/// rooms.
struct ChatInbox: View {
    @Environment(SocialStore.self) private var social
    let onClose: () -> Void

    @State private var open: Open?
    @State private var newRoom = false
    @State private var newMessage = false

    enum Open: Hashable { case friends, room(ChatRoom) }

    private struct Row: Identifiable {
        enum Icon { case friends, everyone, room, direct }
        let id: String
        let title: String
        let subtitle: String
        let icon: Icon
        var person: SocialProfile?
        var latest: ChatMessage?
        var room: String?
        let open: Open
        let sort: String
    }

    var body: some View {
        Group {
            if !social.roomsAvailable {
                ChatView(onClose: onClose)
            } else if let open {
                switch open {
                case .friends:
                    ChatView(backLabel: "Chats", onClose: { close() })
                case .room(let room):
                    ChatView(room: room, backLabel: "Chats", onClose: { close() })
                }
            } else {
                list
            }
        }
        .task {
            while !Task.isCancelled {
                await social.loadRooms()
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    private func close() {
        open = nil
        Task { await social.loadRooms() }
    }

    private var rows: [Row] {
        let myID = social.myID
        var out: [Row] = []
        if !social.friends.isEmpty {
            let latest = social.latestByRoom[""]
            out.append(Row(id: "friends", title: "Friends", subtitle: "All your friends", icon: .friends,
                           latest: latest, room: nil, open: .friends, sort: latest?.created_at ?? ""))
        }
        for room in social.rooms {
            let latest = social.latestByRoom[room.id]
            let count = room.members.count
            out.append(Row(
                id: room.id,
                title: room.title(myID: myID),
                subtitle: room.kind == .everyone ? "Every Setline lifter"
                    : room.kind == .direct ? "Private · only you two" : "\(count) \(count == 1 ? "member" : "members")",
                icon: room.kind == .everyone ? .everyone : room.kind == .direct ? .direct : .room,
                person: room.other(myID: myID),
                latest: latest,
                room: room.id,
                open: .room(room),
                sort: latest?.created_at ?? room.created_at
            ))
        }
        // Everyone stays on top; the rest by their newest message.
        return out.sorted { a, b in
            if a.icon == .everyone { return true }
            if b.icon == .everyone { return false }
            return a.sort > b.sort
        }
    }

    private var list: some View {
        VStack(spacing: 0) {
            ChatBackBar(label: "Friends", onClose: onClose)
            VStack(alignment: .leading, spacing: 2) {
                Text("Chats").slTitle().foregroundStyle(SL.Ink.primary).accessibilityAddTraits(.isHeader)
                Text("Everyone, your friends, private chats and rooms").slMeta().foregroundStyle(SL.Ink.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.bottom, SL.Space.s3)

            ScrollView {
                VStack(alignment: .leading, spacing: SL.Space.s4) {
                    HStack(spacing: SL.Space.s2) {
                        action("paperplane.fill", "Message") { newMessage = true }
                        action("plus", "New room") { newRoom = true }
                    }
                    .disabled(social.friends.isEmpty)
                    .opacity(social.friends.isEmpty ? 0.5 : 1)
                    if social.friends.isEmpty {
                        Text("Add a friend to message them privately or start a room. Everyone is open to every Setline lifter.")
                            .slMeta().foregroundStyle(SL.Ink.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    ChatNotifyRow()
                    VStack(spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                            if index > 0 { SLHairline().padding(.leading, 72) }
                            rowView(row)
                        }
                    }
                    .slBorderBox()
                    .slListCard()
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.bottom, SL.Space.s6)
            }
        }
        .background(SL.Surface.ground.ignoresSafeArea())
        .sheet(isPresented: $newMessage) {
            NewMessageSheet(friends: social.friends, onPick: { friend in
                newMessage = false
                Task {
                    if let room = try? await social.directRoom(with: friend) { open = .room(room) }
                }
            }, onClose: { newMessage = false })
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $newRoom) {
            NewRoomSheet(friends: social.friends, onCreate: { name, ids in
                let room = try await social.createRoom(name: name, memberIDs: ids)
                newRoom = false
                open = .room(room)
            }, onClose: { newRoom = false })
            .presentationDragIndicator(.visible)
        }
        .slRespondsToTextSize()
    }

    private func action(_ icon: String, _ label: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            HStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(SL.Signal.action)
                Text(label).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
            }
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(Capsule().fill(SL.Surface.raised))
            .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
        }
        .buttonStyle(SLPressStyle(scale: 0.97))
    }

    private func unread(_ row: Row) -> Bool {
        guard let latest = row.latest else { return false }
        return latest.user_id != social.myID && latest.created_at > ChatReadMarker.value(row.room)
    }

    private func preview(_ message: ChatMessage?) -> String? {
        guard let message else { return nil }
        let who = message.user_id == social.myID ? "You" : (firstWord(message.author?.display_name) ?? "Someone")
        if message.body.isEmpty { return "\(who): Photo" }
        return "\(who): \(message.image_path == nil ? "" : "Photo · ")\(message.body)"
    }

    private func rowView(_ row: Row) -> some View {
        let isUnread = unread(row)
        return Button { open = row.open } label: {
            HStack(spacing: SL.Space.s3) {
                mark(row)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: SL.Space.s2) {
                        Text(row.title).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary).lineLimit(1)
                        Spacer(minLength: SL.Space.s2)
                        if let latest = row.latest {
                            Text(PostCard.when(latest.date))
                                .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                                .foregroundStyle(isUnread ? SL.Signal.action : SL.Ink.tertiary)
                        }
                    }
                    HStack(spacing: SL.Space.s2) {
                        Text(preview(row.latest) ?? row.subtitle)
                            .slMeta(isUnread ? SL.Weight.semibold : SL.Weight.regular)
                            .foregroundStyle(isUnread ? SL.Ink.primary : SL.Ink.secondary)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        if isUnread { Circle().fill(SL.Signal.action).frame(width: 9, height: 9) }
                    }
                }
            }
            .padding(SL.Space.s3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isUnread ? "\(row.title), new message" : row.title)
    }

    @ViewBuilder
    private func mark(_ row: Row) -> some View {
        switch row.icon {
        case .direct:
            Text(row.person?.initial ?? "?")
                .font(.slFixed(16, SL.Weight.semibold))
                .foregroundStyle(SL.Signal.action)
                .frame(width: 44, height: 44)
                .background(Circle().fill(SL.Surface.raised2))
        default:
            let (symbol, ink): (String, Color) = switch row.icon {
            case .everyone: ("globe", SL.Signal.recovery)
            case .friends: ("person.2.fill", SL.Signal.action)
            default: ("number", SL.Signal.attention)
            }
            Image(systemName: symbol)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(ink)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(ink.opacity(0.16)))
        }
    }
}

private struct ChatBackBar<Trailing: View>: View {
    let label: String
    let onClose: () -> Void
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack {
            Button(action: onClose) {
                HStack(spacing: 2) {
                    SLGlyph(name: .chevronLeft, size: 18)
                    Text(label).slBody()
                }
                .foregroundStyle(SL.Ink.secondary)
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back to \(label)")
            Spacer()
            trailing
        }
        .padding(.horizontal, SL.Space.s4)
    }
}

extension ChatBackBar where Trailing == EmptyView {
    init(label: String, onClose: @escaping () -> Void) {
        self.init(label: label, onClose: onClose) { EmptyView() }
    }
}

private struct FriendLine<Trailing: View>: View {
    let friend: SocialProfile
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: SL.Space.s3) {
            Text(friend.initial)
                .font(.slFixed(14, SL.Weight.semibold))
                .foregroundStyle(SL.Signal.action)
                .frame(width: 36, height: 36)
                .background(Circle().fill(SL.Surface.raised2))
            VStack(alignment: .leading, spacing: 1) {
                Text(friend.display_name).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                Text("@\(friend.username)").slMeta().foregroundStyle(SL.Ink.secondary)
            }
            Spacer(minLength: SL.Space.s2)
            trailing
        }
        .padding(.vertical, SL.Space.s2)
        .frame(minHeight: SL.Space.hitMin)
        .contentShape(Rectangle())
    }
}

/// Pick the friend to write to, privately.
struct NewMessageSheet: View {
    let friends: [SocialProfile]
    let onPick: (SocialProfile) -> Void
    let onClose: () -> Void

    var body: some View {
        SLSheet(title: "New message", subtitle: "Only the two of you see it", onClose: onClose) {
            VStack(spacing: 0) {
                ForEach(friends) { friend in
                    Button { onPick(friend) } label: {
                        FriendLine(friend: friend) {
                            Image(systemName: "paperplane.fill").font(.system(size: 15, weight: .semibold)).foregroundStyle(SL.Signal.action)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// A room on a topic: its name and the friends in it.
struct NewRoomSheet: View {
    let friends: [SocialProfile]
    let onCreate: (String, [String]) async throws -> Void
    let onClose: () -> Void

    @State private var name = ""
    @State private var picked: [String] = []
    @State private var saving = false
    @State private var failed = false

    private static let ideas = ["Leg day crew", "Cutting together", "Meal prep", "Morning lifters"]

    private var ready: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !picked.isEmpty && !saving
    }

    var body: some View {
        SLSheet(title: "New room", subtitle: "A chat on one topic, with the friends you pick", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                VStack(alignment: .leading, spacing: SL.Space.s2) {
                    SLOverline(text: "Name", color: SL.Ink.secondary)
                    TextField("Leg day crew", text: $name)
                        .font(.sl(SL.TypeSize.lead, SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.primary)
                        .tint(SL.Signal.action)
                        .padding(.horizontal, SL.Space.s4)
                        .frame(minHeight: 48)
                        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
                        .onChange(of: name) { _, now in if now.count > 40 { name = String(now.prefix(40)) } }
                    SLFlow(spacing: SL.Space.s2) {
                        ForEach(Self.ideas, id: \.self) { idea in
                            Button { name = idea } label: {
                                Text(idea)
                                    .font(.sl(SL.TypeSize.meta, SL.Weight.medium))
                                    .foregroundStyle(SL.Ink.secondary)
                                    .padding(.horizontal, 12)
                                    .frame(minHeight: 32)
                                    .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                VStack(alignment: .leading, spacing: SL.Space.s2) {
                    SLOverline(text: picked.isEmpty ? "Friends" : "Friends · \(picked.count)", color: SL.Ink.secondary)
                    ForEach(friends) { friend in
                        let on = picked.contains(friend.user_id)
                        Button {
                            picked = on ? picked.filter { $0 != friend.user_id } : picked + [friend.user_id]
                        } label: {
                            FriendLine(friend: friend) {
                                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 22, weight: .semibold))
                                    .foregroundStyle(on ? SL.Signal.action : SL.Ink.tertiary)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                    }
                }
                if failed {
                    Text("Couldn't start the room. Check your connection and try again.").slMeta().foregroundStyle(SL.Signal.attention)
                }
                Button(saving ? "Starting…" : "Start room") {
                    saving = true
                    failed = false
                    Task {
                        do {
                            try await onCreate(name, picked)
                        } catch {
                            failed = true
                            saving = false
                        }
                    }
                }
                .buttonStyle(SLPrimaryButtonStyle())
                .disabled(!ready)
            }
        }
    }
}

// MARK: - A photo in a message

private struct ChatPhoto: View {
    @Environment(SocialStore.self) private var social
    let path: String
    @State private var image: UIImage?

    var body: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(SL.Surface.raised2)
            .frame(width: 220, height: 275)
            .overlay {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .task(id: path) { image = await social.image(path) }
            .accessibilityLabel("Photo")
    }
}

// MARK: - One conversation

/// One chat: the friends' chat when there is no room, or a room's. Messages
/// refresh every few seconds while it is open, can carry a photo, and can be
/// tagged Training, Food or Motivation so a question reads as one at a glance.
struct ChatView: View {
    @Environment(SocialStore.self) private var social
    var room: ChatRoom? = nil
    var backLabel = "Friends"
    let onClose: () -> Void

    @State private var messages: [ChatMessage] = []
    @State private var loading = true
    @State private var failed = false
    @State private var draft = ""
    @State private var topic: ChatTopic?
    @State private var sending = false
    @State private var reporting: ChatMessage?
    @State private var leaving = false
    @State private var pickedItem: PhotosPickerItem?
    @State private var photo: (jpeg: Data, preview: UIImage)?
    @FocusState private var typing: Bool

    static func tone(_ topic: ChatTopic) -> Color {
        switch topic {
        case .training: SL.Signal.action
        case .food: SL.Signal.recovery
        case .motivation: SL.Signal.attention
        }
    }

    private var myID: String { social.myID }
    private var title: String { room?.title(myID: myID) ?? "Friends" }
    private var owns: Bool { room?.created_by == myID }

    private var subtitle: String {
        guard let room else {
            return "You and your \(social.friends.count == 1 ? "friend" : "\(social.friends.count) friends") · only friends see this"
        }
        switch room.kind {
        case .everyone: return "Every Setline lifter · be kind, report what isn't"
        case .direct: return "Private · only you two see this"
        case .room:
            let names = room.members.map { $0.user_id == myID ? "You" : (firstWord($0.display_name) ?? "") }
            return "\(names.joined(separator: ", ")) · only members see this"
        }
    }

    private var placeholder: String {
        if social.offlineSince != nil { return "Messages wait for a connection" }
        if let topic { return "A \(topic.label.lowercased()) message…" }
        guard let room else { return "Message your friends…" }
        switch room.kind {
        case .everyone: return "Message everyone…"
        case .direct: return "Message \(firstWord(room.other(myID: myID)?.display_name) ?? "your friend")…"
        case .room: return "Message \(title)…"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ChatBackBar(label: backLabel, onClose: onClose) {
                if let room, room.kind != .everyone {
                    Menu {
                        Button(owns ? (room.kind == .direct ? "Delete chat" : "Close room") : "Leave", systemImage: "trash", role: .destructive) {
                            leaving = true
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Chat options")
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title).slTitle().foregroundStyle(SL.Ink.primary).accessibilityAddTraits(.isHeader)
                Text(subtitle).slMeta().foregroundStyle(SL.Ink.secondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.bottom, SL.Space.s2)
            SLHairline()

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if !loading, messages.isEmpty { emptyState }
                        ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                            bubble(message, index: index)
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.bottom, SL.Space.s4)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: messages.last?.id) { _, _ in
                    withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) }
                }
            }

            composer
        }
        .background(SL.Surface.ground.ignoresSafeArea())
        // Fresh every few seconds while open; nothing runs once it closes.
        .task(id: room?.id) {
            while !Task.isCancelled {
                await reload()
                try? await Task.sleep(for: .seconds(6))
            }
        }
        .onChange(of: pickedItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let prepared = SocialStore.preparePhoto(data), let jpeg = prepared.jpeg,
                   let preview = UIImage(data: jpeg) {
                    photo = (jpeg, preview)
                }
                pickedItem = nil
            }
        }
        .confirmationDialog(
            "\(firstWord(reporting?.author?.display_name) ?? "Their")'s message",
            isPresented: Binding(get: { reporting != nil }, set: { if !$0 { reporting = nil } }),
            titleVisibility: .visible
        ) {
            if let message = reporting {
                Button("Report message", role: .destructive) {
                    Task { try? await social.report(message: message, reason: "Reported from the app") }
                }
                Button("Block \(firstWord(message.author?.display_name) ?? "them")", role: .destructive) {
                    Task { try? await social.block(message.user_id) }
                    messages.removeAll { $0.user_id == message.user_id }
                }
                Button("Cancel", role: .cancel) {}
            }
        } message: {
            Text("Setline reviews every report within 24 hours.")
        }
        .confirmationDialog(
            owns ? (room?.kind == .direct ? "Delete this chat?" : "Close \(title)?") : "Leave \(title)?",
            isPresented: $leaving,
            titleVisibility: .visible
        ) {
            Button(owns ? (room?.kind == .direct ? "Delete chat" : "Close room") : "Leave", role: .destructive) {
                guard let room else { return }
                Task {
                    try? await social.leaveRoom(room)
                    onClose()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(owns ? "Its messages are removed for everyone in it." : "You stop seeing its messages. The others keep talking.")
        }
        .slRespondsToTextSize()
    }

    private func reload() async {
        do {
            let list = try await social.chatMessages(room: room?.id)
            messages = list
            failed = false
            if let latest = list.last { ChatReadMarker.set(latest.created_at, room: room?.id) }
        } catch {
            failed = true
        }
        loading = false
    }

    private var emptyState: some View {
        VStack(spacing: SL.Space.s2) {
            Image(systemName: "bubble.left").font(.system(size: 22)).foregroundStyle(SL.Ink.tertiary)
            Text(failed ? "Couldn't load the chat" : "Start the conversation")
                .slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
            Text(failed ? "Check your connection; it tries again by itself."
                 : room?.kind == .everyone ? "Say hi to every Setline lifter, ask a question, share a win."
                 : "Ask about a workout or a meal, or cheer someone on.")
                .slMeta().foregroundStyle(SL.Ink.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(SL.Space.s5)
        .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
            .strokeBorder(SL.Surface.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 4])))
        .padding(.top, SL.Space.s5)
    }

    private func bubble(_ message: ChatMessage, index: Int) -> some View {
        let mine = message.user_id == myID
        let previous = index > 0 ? messages[index - 1] : nil
        // A run of messages from one person shows their name once.
        let continues = previous.map { $0.user_id == message.user_id && message.date.timeIntervalSince($0.date) < 600 } ?? false
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: 18, bottomLeadingRadius: mine ? 18 : 6,
            bottomTrailingRadius: mine ? 6 : 18, topTrailingRadius: 18, style: .continuous
        )
        return HStack(alignment: .bottom, spacing: SL.Space.s2) {
            if mine { Spacer(minLength: 48) }
            if !mine {
                Text(message.author?.initial ?? "?")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(SL.Signal.action)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(SL.Surface.raised2))
                    .opacity(continues ? 0 : 1)
                    .accessibilityHidden(true)
            }
            VStack(alignment: mine ? .trailing : .leading, spacing: 3) {
                if !continues {
                    Text("\(mine ? "You" : firstWord(message.author?.display_name) ?? "Someone") · \(PostCard.when(message.date))")
                        .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.horizontal, 4)
                }
                Menu {
                    if mine {
                        Button("Delete message", systemImage: "trash", role: .destructive) {
                            Task { try? await social.deleteChat(message) }
                            messages.removeAll { $0.id == message.id }
                        }
                    } else {
                        Button("Report or block", systemImage: "exclamationmark.bubble") { reporting = message }
                    }
                } label: {
                    VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
                        if let path = message.image_path { ChatPhoto(path: path) }
                        if !message.body.isEmpty || message.topic != nil {
                            VStack(alignment: .leading, spacing: 2) {
                                if let topic = message.topic {
                                    Text(topic.label.uppercased())
                                        .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                                        .tracking(0.6)
                                        .foregroundStyle(Self.tone(topic))
                                }
                                if !message.body.isEmpty {
                                    Text(message.body)
                                        .slBody()
                                        .foregroundStyle(SL.Ink.primary)
                                        .multilineTextAlignment(.leading)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            .padding(.horizontal, 13)
                            .padding(.vertical, 9)
                            .background(shape.fill(mine ? SL.Signal.actionTint : SL.Surface.raised))
                            .overlay(shape.strokeBorder(mine ? SL.Signal.action.opacity(0.25) : SL.Surface.hairline, lineWidth: 1))
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(mine ? "Your message" : "Message from \(firstWord(message.author?.display_name) ?? "someone")"): \(message.image_path == nil ? "" : "photo. ")\(message.body)")
            }
            if !mine { Spacer(minLength: 48) }
        }
        .padding(.top, continues ? 2 : SL.Space.s3)
    }

    private var composer: some View {
        let empty = draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && photo == nil
        return VStack(spacing: SL.Space.s2) {
            if let photo {
                HStack {
                    Image(uiImage: photo.preview)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 64, height: 64)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(alignment: .topTrailing) {
                            Button { self.photo = nil } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 22, height: 22)
                                    .background(Circle().fill(.black.opacity(0.6)))
                            }
                            .buttonStyle(.plain)
                            .padding(4)
                            .accessibilityLabel("Remove photo")
                        }
                    Spacer()
                }
            }
            HStack(spacing: SL.Space.s2) {
                ForEach(ChatTopic.allCases, id: \.self) { value in
                    let on = topic == value
                    Button { topic = on ? nil : value } label: {
                        Text(value.label)
                            .font(.sl(SL.TypeSize.meta, on ? SL.Weight.semibold : SL.Weight.medium))
                            .foregroundStyle(on ? Self.tone(value) : SL.Ink.secondary)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 32)
                            .background(Capsule().fill(on ? Self.tone(value).opacity(0.14) : .clear))
                            .overlay(Capsule().strokeBorder(on ? Self.tone(value) : SL.Surface.hairlineStrong, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                }
                Spacer()
            }
            HStack(spacing: SL.Space.s2) {
                if social.roomsAvailable {
                    PhotosPicker(selection: $pickedItem, matching: .images) {
                        Image(systemName: "photo.badge.plus")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(SL.Surface.raised))
                            .overlay(Circle().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                    }
                    .accessibilityLabel("Add a photo")
                }
                TextField(placeholder, text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($typing)
                    .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                    .foregroundStyle(SL.Ink.primary)
                    .tint(SL.Signal.action)
                    .padding(.horizontal, SL.Space.s4)
                    .padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(SL.Surface.raised))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                Button {
                    Task {
                        sending = true
                        let text = draft
                        let held = photo
                        draft = ""
                        photo = nil
                        do {
                            try await social.sendChat(text, topic: topic, room: room?.id, photo: held?.jpeg)
                            topic = nil
                            await reload()
                        } catch {
                            draft = text
                            photo = held
                        }
                        sending = false
                    }
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(SL.Signal.onAction)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(empty ? SL.Surface.hairlineStrong : SL.Signal.action))
                }
                .buttonStyle(.plain)
                .disabled(sending || social.offlineSince != nil || empty)
                .accessibilityLabel("Send message")
            }
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s2)
        .background(SL.Surface.ground.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { SLHairline() }
    }
}
