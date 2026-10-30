import SwiftUI

/// When the chat was last open on this phone, for the unread dot.
enum ChatReadMarker {
    private static let key = "setline.chat.lastRead"
    static var value: String { UserDefaults.standard.string(forKey: key) ?? "" }
    static func set(_ createdAt: String) { UserDefaults.standard.set(createdAt, forKey: key) }
}

/// The Friends chat: one conversation with your friends, to ask about a
/// workout or a meal, or to keep each other going. Messages are seen by their
/// author's friends only (row-level security), refresh every few seconds
/// while the chat is open, and can be tagged Training, Food or Motivation so
/// a question reads as one at a glance.
struct ChatView: View {
    @Environment(SocialStore.self) private var social
    let onClose: () -> Void

    @State private var messages: [ChatMessage] = []
    @State private var loading = true
    @State private var failed = false
    @State private var draft = ""
    @State private var topic: ChatTopic?
    @State private var sending = false
    @State private var reporting: ChatMessage?
    @FocusState private var typing: Bool

    static func tone(_ topic: ChatTopic) -> Color {
        switch topic {
        case .training: SL.Signal.action
        case .food: SL.Signal.recovery
        case .motivation: SL.Signal.attention
        }
    }

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
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to Friends")
                Spacer()
            }
            .padding(.horizontal, SL.Space.s4)

            VStack(alignment: .leading, spacing: 2) {
                Text("Chat").slTitle().foregroundStyle(SL.Ink.primary).accessibilityAddTraits(.isHeader)
                Text("You and your \(social.friends.count == 1 ? "friend" : "\(social.friends.count) friends") · only friends see this")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
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
        .task {
            while !Task.isCancelled {
                await reload()
                try? await Task.sleep(for: .seconds(6))
            }
        }
        .confirmationDialog(
            "\(firstName(reporting) ?? "Their")'s message",
            isPresented: Binding(get: { reporting != nil }, set: { if !$0 { reporting = nil } }),
            titleVisibility: .visible
        ) {
            if let message = reporting {
                Button("Report message", role: .destructive) {
                    Task { try? await social.report(message: message, reason: "Reported from the app") }
                }
                Button("Block \(firstName(message) ?? "them")", role: .destructive) {
                    Task { try? await social.block(message.user_id) }
                    messages.removeAll { $0.user_id == message.user_id }
                }
                Button("Cancel", role: .cancel) {}
            }
        } message: {
            Text("Setline reviews every report within 24 hours.")
        }
        .slRespondsToTextSize()
    }

    private func firstName(_ message: ChatMessage?) -> String? {
        message?.author?.display_name.split(separator: " ").first.map(String.init)
    }

    private func reload() async {
        do {
            let list = try await social.chatMessages()
            messages = list
            failed = false
            if let latest = list.last { ChatReadMarker.set(latest.created_at) }
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
            Text(failed ? "Check your connection; it tries again by itself." : "Ask about a workout or a meal, or cheer someone on.")
                .slMeta().foregroundStyle(SL.Ink.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(SL.Space.s5)
        .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
            .strokeBorder(SL.Surface.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 4])))
        .padding(.top, SL.Space.s5)
    }

    private func bubble(_ message: ChatMessage, index: Int) -> some View {
        let mine = message.user_id == social.myID
        let previous = index > 0 ? messages[index - 1] : nil
        // A run of messages from one person shows their name once.
        let continues = previous.map { $0.user_id == message.user_id && message.date.timeIntervalSince($0.date) < 600 } ?? false
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
                    Text("\(mine ? "You" : firstName(message) ?? "Friend") · \(PostCard.when(message.date))")
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
                    VStack(alignment: .leading, spacing: 2) {
                        if let topic = message.topic {
                            Text(topic.label.uppercased())
                                .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                                .tracking(0.6)
                                .foregroundStyle(Self.tone(topic))
                        }
                        Text(message.body)
                            .slBody()
                            .foregroundStyle(SL.Ink.primary)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .background(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 18, bottomLeadingRadius: mine ? 18 : 6,
                            bottomTrailingRadius: mine ? 6 : 18, topTrailingRadius: 18, style: .continuous
                        )
                        .fill(mine ? SL.Signal.actionTint : SL.Surface.raised)
                    )
                    .overlay(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 18, bottomLeadingRadius: mine ? 18 : 6,
                            bottomTrailingRadius: mine ? 6 : 18, topTrailingRadius: 18, style: .continuous
                        )
                        .strokeBorder(mine ? SL.Signal.action.opacity(0.25) : SL.Surface.hairline, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(mine ? "Your message" : "Message from \(firstName(message) ?? "a friend")"): \(message.body)")
            }
            if !mine { Spacer(minLength: 48) }
        }
        .padding(.top, continues ? 2 : SL.Space.s3)
    }

    private var composer: some View {
        let empty = draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return VStack(spacing: SL.Space.s2) {
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
                TextField(social.offlineSince == nil
                          ? (topic.map { "A \($0.label.lowercased()) message…" } ?? "Message your friends…")
                          : "Messages wait for a connection",
                          text: $draft, axis: .vertical)
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
                        draft = ""
                        do {
                            try await social.sendChat(text, topic: topic)
                            topic = nil
                            await reload()
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
