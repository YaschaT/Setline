// ChatView.swift — the Friends chat: one conversation with your friends, to
// ask about a workout or a meal, or to keep each other going. Messages are
// seen by their author's friends only (row-level security), refresh every
// few seconds while the chat is open, and can be tagged Training, Food or
// Motivation so a question reads as one at a glance.
import { useEffect, useRef, useState } from "react";
import { trimmingWhitespacesAndNewlines } from "../../core/Support/nutrition";
import { ConfirmationDialog, HStack, Menu, Spacer, Text, VStack, type MenuEntry } from "../../design/swiftui";
import { SL, slFont } from "../../design/tokens";
import { slFixed } from "../../design/SLDynamicType";
import { SFSymbol } from "../../design/SFSymbol";
import { colorOpacity } from "../../design/SetlineTokens";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slMeta, slTitle } from "../../design/components/SLText";
import { DashedBorder, PressButton } from "../../design/support";
import { ChatMessage, SocialProfile, useSocial, type ChatTopic } from "../../data/SocialStore";
import { PostCard } from "./FriendsView";

const firstWord = (name: string | undefined) => name?.split(" ").filter((s) => s !== "")[0];
const lastReadKey = "setline.chat.lastRead";

/** When the chat was last open on this device, for the unread dot. */
export const ChatReadMarker = {
  get(): string {
    try {
      return localStorage.getItem(lastReadKey) ?? "";
    } catch {
      return "";
    }
  },
  set(createdAt: string): void {
    try {
      localStorage.setItem(lastReadKey, createdAt);
    } catch {
      /* the dot simply stays */
    }
  },
};

const topicTone = (topic: ChatTopic): string => {
  switch (topic) {
    case "training": return SL.Signal.action;
    case "food": return SL.Signal.recovery;
    case "motivation": return SL.Signal.attention;
  }
};

export function ChatView({ onClose }: { onClose: () => void }) {
  const social = useSocial();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [topic, setTopic] = useState<ChatTopic | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<ChatMessage | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);
  const lastID = useRef<string | undefined>(undefined);

  const reload = async () => {
    try {
      const list = await social.chatMessages();
      setMessages(list);
      setFailed(false);
      const latest = list[list.length - 1];
      if (latest) ChatReadMarker.set(latest.created_at);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  };

  // Fresh every few seconds while open; nothing runs once it closes.
  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 6000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new message at the bottom scrolls into view.
  useEffect(() => {
    const latest = messages[messages.length - 1]?.id;
    if (latest !== undefined && latest !== lastID.current) {
      bottom.current?.scrollIntoView({ block: "end", behavior: lastID.current === undefined ? "auto" : "smooth" });
      lastID.current = latest;
    }
  }, [messages]);

  const empty = trimmingWhitespacesAndNewlines(draft) === "";
  const send = () => {
    if (empty || sending) return;
    void (async () => {
      setSending(true);
      const text = draft;
      setDraft("");
      try {
        await social.sendChat(text, { topic });
        setTopic(undefined);
        await reload();
      } catch {
        setDraft(text);
      }
      setSending(false);
    })();
  };

  const bubble = (message: ChatMessage, index: number) => {
    const mine = message.user_id === social.myID;
    const previous = messages[index - 1];
    // A run of messages from one person shows their name once.
    const continues = previous?.user_id === message.user_id && ChatMessage.date(message).getTime() - ChatMessage.date(previous).getTime() < 10 * 60_000;
    const entries: MenuEntry[] = mine
      ? [
          {
            kind: "button",
            title: "Delete message",
            systemImage: "trash",
            role: "destructive",
            action: () => {
              void social.deleteChat(message).catch(() => {});
              setMessages((list) => list.filter((m) => m.id !== message.id));
            },
          },
        ]
      : [{ kind: "button", title: "Report or block", systemImage: "exclamationmark.bubble", action: () => setReporting(message) }];
    return (
      <HStack key={message.id} alignment="bottom" spacing={SL.Space.s2} style={{ alignSelf: "stretch", justifyContent: mine ? "flex-end" : "flex-start", paddingTop: continues ? 2 : SL.Space.s3 }}>
        {!mine && (
          <div aria-hidden style={{ width: 30, height: 30, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0, visibility: continues ? "hidden" : "visible" }}>
            <Text color={SL.Signal.action} lineHeight={1} style={slFixed(12, SL.Weight.semibold)}>{message.author ? SocialProfile.initial(message.author) : "?"}</Text>
          </div>
        )}
        <VStack alignment={mine ? "trailing" : "leading"} spacing={3} style={{ maxWidth: "78%", minWidth: 0 }}>
          {!continues && (
            <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} color={SL.Ink.secondary} style={{ paddingLeft: 4, paddingRight: 4 }}>
              {`${mine ? "You" : (firstWord(message.author?.display_name) ?? "Friend")} · ${PostCard.when(ChatMessage.date(message))}`}
            </Text>
          )}
          <Menu
            entries={entries}
            aria-label={`${mine ? "Your message" : `Message from ${firstWord(message.author?.display_name) ?? "a friend"}`}: ${message.body}`}
            style={{ display: "block", textAlign: "left", maxWidth: "100%" }}
            label={
              <div
                style={{
                  padding: "9px 13px",
                  borderRadius: 18,
                  borderBottomRightRadius: mine ? 6 : 18,
                  borderBottomLeftRadius: mine ? 18 : 6,
                  background: mine ? SL.Signal.actionTint : SL.Surface.raised,
                  boxShadow: `inset 0 0 0 1px ${mine ? colorOpacity(SL.Signal.action, 0.25) : SL.Surface.hairline}`,
                }}
              >
                {message.topic && (
                  <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={0.6} color={topicTone(message.topic)} style={{ display: "block", paddingBottom: 2 }}>
                    {ChatMessage.topicLabel(message.topic).toUpperCase()}
                  </Text>
                )}
                <Text {...slBody()} color={SL.Ink.primary} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {message.body}
                </Text>
              </div>
            }
          />
        </VStack>
      </HStack>
    );
  };

  const topicChip = (value: ChatTopic) => {
    const on = topic === value;
    return (
      <PressButton
        key={value}
        aria-pressed={on}
        onPress={() => setTopic(on ? undefined : value)}
        style={{ minHeight: 32, padding: "0 12px", borderRadius: 999, background: on ? colorOpacity(topicTone(value), 0.14) : "transparent", boxShadow: `inset 0 0 0 1px ${on ? topicTone(value) : SL.Surface.hairlineStrong}`, display: "flex", alignItems: "center" }}
      >
        <Text size={SL.TypeSize.meta} weight={on ? SL.Weight.semibold : SL.Weight.medium} color={on ? topicTone(value) : SL.Ink.secondary}>
          {ChatMessage.topicLabel(value)}
        </Text>
      </PressButton>
    );
  };

  const reportingName = firstWord(reporting?.author?.display_name);
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", height: "100%", minHeight: 0, background: SL.Surface.ground }}>
      <HStack style={{ flexShrink: 0, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4 }}>
        <PressButton onPress={onClose} aria-label="Back to Friends" style={{ background: "transparent", color: SL.Ink.secondary, minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", gap: 2 }}>
          <SLGlyph name="chevronLeft" size={18} />
          <Text {...slBody()} color={SL.Ink.secondary}>Friends</Text>
        </PressButton>
        <Spacer />
      </HStack>
      <VStack alignment="leading" spacing={2} style={{ flexShrink: 0, paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: SL.Space.s2 }}>
        <Text as="h1" {...slTitle()} color={SL.Ink.primary}>Chat</Text>
        <Text {...slMeta()} color={SL.Ink.secondary}>
          {`You and your ${social.friends.length === 1 ? "friend" : `${social.friends.length} friends`} · only friends see this`}
        </Text>
      </VStack>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <SLHairline />
      </div>

      <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: SL.Space.s4 }}>
        {loading ? null : messages.length === 0 ? (
          <VStack spacing={SL.Space.s2} style={{ position: "relative", alignSelf: "stretch", padding: SL.Space.s5, marginTop: SL.Space.s5 }}>
            <DashedBorder color={SL.Surface.hairlineStrong} radius={SL.Radius.lg} dash="4 4" />
            <SFSymbol name="bubble.left" size={22} color={SL.Ink.tertiary} />
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>{failed ? "Couldn't load the chat" : "Start the conversation"}</Text>
            <Text {...slMeta()} color={SL.Ink.secondary} align="center">
              {failed ? "Check your connection; it tries again by itself." : "Ask about a workout or a meal, or cheer someone on."}
            </Text>
          </VStack>
        ) : (
          <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
            {messages.map(bubble)}
          </VStack>
        )}
        <div ref={bottom} />
      </div>

      <div style={{ position: "relative", flexShrink: 0, background: SL.Surface.ground, paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <SLHairline />
        </div>
        <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s2 }}>
          {ChatMessage.topics.map(topicChip)}
        </HStack>
        <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2 }}>
          <div style={{ flex: "1 1 0", minWidth: 0, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: 11, paddingBottom: 11, borderRadius: 22, background: SL.Surface.raised, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}` }}>
            <textarea
              rows={1}
              value={draft}
              maxLength={1000}
              aria-label="Message"
              placeholder={social.offlineSince === undefined ? (topic ? `A ${ChatMessage.topicLabel(topic).toLowerCase()} message…` : "Message your friends…") : "Messages wait for a connection"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              style={{ ...slFont(SL.TypeSize.body, SL.Weight.regular), color: SL.Ink.primary, caretColor: SL.Signal.action, background: "transparent", border: "none", outline: "none", padding: 0, margin: 0, width: "100%", resize: "none", lineHeight: 1.25, display: "block", maxHeight: 120 }}
            />
          </div>
          <PressButton
            aria-label="Send message"
            disabled={sending || social.offlineSince !== undefined || empty}
            onPress={send}
            style={{ width: 44, height: 44, borderRadius: "50%", background: empty ? SL.Surface.hairlineStrong : SL.Signal.action, display: "grid", placeItems: "center", flexShrink: 0 }}
          >
            <SFSymbol name="arrow.up" size={16} weight={700} color={SL.Signal.onAction} />
          </PressButton>
        </HStack>
      </div>

      <ConfirmationDialog
        isPresented={reporting !== undefined}
        onDismiss={() => setReporting(undefined)}
        title={`${reportingName ?? "Their"}'s message`}
        message="Setline reviews every report within 24 hours."
        actions={
          reporting
            ? [
                {
                  title: "Report message",
                  role: "destructive",
                  action: () => {
                    const message = reporting;
                    void social.reportChat({ message, reason: "Reported from the app" }).catch(() => {});
                  },
                },
                {
                  title: `Block ${reportingName ?? "them"}`,
                  role: "destructive",
                  action: () => {
                    const message = reporting;
                    void social.block(message.user_id).catch(() => {});
                    setMessages((list) => list.filter((m) => m.user_id !== message.user_id));
                  },
                },
                { title: "Cancel", role: "cancel" },
              ]
            : []
        }
      />
    </div>
  );
}
