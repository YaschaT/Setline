// ChatView.swift — the chats in the Friends tab: the friends' chat, Everyone
// (every Setline lifter), private chats with one friend, and rooms someone
// started on a topic. Messages refresh every few seconds while a chat is
// open, can carry a photo, and can be tagged Training, Food or Motivation so
// a question reads as one at a glance. Who sees what is row-level security
// on the server, not this screen.
import { useEffect, useRef, useState } from "react";
import { trimmingWhitespacesAndNewlines } from "../../core/Support/nutrition";
import { ConfirmationDialog, HStack, Menu, Sheet, Spacer, Text, VStack, type MenuEntry } from "../../design/swiftui";
import { SL, slFont } from "../../design/tokens";
import { slFixed } from "../../design/SLDynamicType";
import { SFSymbol } from "../../design/SFSymbol";
import { SLPrimaryButton, colorOpacity } from "../../design/SetlineTokens";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLSheet } from "../../design/components/SLSheet";
import { SLOverline } from "../../design/components/SLPieces";
import { SLHairline, slBody, slMeta, slTitle } from "../../design/components/SLText";
import { DashedBorder, PressButton } from "../../design/support";
import { ChatMessage, ChatRoom, SocialProfile, SocialStore, useSocial, type ChatTopic } from "../../data/SocialStore";
import { PostCard } from "./FriendsView";

const firstWord = (name: string | undefined) => name?.split(" ").filter((s) => s !== "")[0];
const lastReadKey = "setline.chat.lastRead";

/** When a chat was last open on this device, for the unread dot. No room is the friends' chat. */
export const ChatReadMarker = {
  key(room?: string): string {
    return room ? `${lastReadKey}.${room}` : lastReadKey;
  },
  get(room?: string): string {
    try {
      return localStorage.getItem(ChatReadMarker.key(room)) ?? "";
    } catch {
      return "";
    }
  },
  set(createdAt: string, room?: string): void {
    try {
      localStorage.setItem(ChatReadMarker.key(room), createdAt);
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

/** A friend's or your own message newer than the last look. */
function isUnread(message: ChatMessage | undefined, myID: string, room?: string): boolean {
  return message !== undefined && message.user_id !== myID && message.created_at > ChatReadMarker.get(room);
}

/** "Sam: Leg day done", "You: 📷 Photo". */
function preview(message: ChatMessage | undefined, myID: string): string | undefined {
  if (!message) return undefined;
  const who = message.user_id === myID ? "You" : (firstWord(message.author?.display_name) ?? "Someone");
  const body = message.body !== "" ? message.body : message.image_path ? "Photo" : "";
  return `${who}: ${message.image_path && message.body !== "" ? "Photo · " : ""}${body}`;
}

// MARK: - The list of chats

type Open = { kind: "friends" } | { kind: "room"; room: ChatRoom };

/**
 * Every conversation, newest first, with the way to start a private chat or
 * a room. Opens straight into the friends' chat while the server has no rooms.
 */
export function ChatInbox({ onClose }: { onClose: () => void }) {
  const social = useSocial();
  const [open, setOpen] = useState<Open | undefined>(undefined);
  const [newRoom, setNewRoom] = useState(false);
  const [newMessage, setNewMessage] = useState(false);

  useEffect(() => {
    void social.loadRooms();
    const id = window.setInterval(() => void social.loadRooms(), 15000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!social.roomsAvailable) return <ChatView onClose={onClose} />;
  if (open) {
    return (
      <ChatView
        room={open.kind === "room" ? open.room : undefined}
        backLabel="Chats"
        onClose={() => {
          setOpen(undefined);
          void social.loadRooms();
        }}
      />
    );
  }

  const myID = social.myID;
  const time = (m: ChatMessage | undefined, fallback: string) => m?.created_at ?? fallback;
  type Row = { key: string; title: string; subtitle: string; icon: "friends" | "everyone" | "room" | "direct"; person?: SocialProfile; latest?: ChatMessage; room?: string; open: Open; sort: string };
  const rows: Row[] = [];
  if (social.friends.length > 0) {
    rows.push({
      key: "friends",
      title: "Friends",
      subtitle: "All your friends",
      icon: "friends",
      latest: social.latestByRoom[""],
      open: { kind: "friends" },
      sort: time(social.latestByRoom[""], ""),
    });
  }
  for (const room of social.rooms) {
    const latest = social.latestByRoom[room.id];
    rows.push({
      key: room.id,
      title: ChatRoom.title(room, myID),
      subtitle:
        room.kind === "everyone" ? "Every Setline lifter" : room.kind === "direct" ? "Private · only you two" : `${room.members.length} ${room.members.length === 1 ? "member" : "members"}`,
      icon: room.kind === "everyone" ? "everyone" : room.kind === "direct" ? "direct" : "room",
      person: ChatRoom.other(room, myID),
      latest,
      room: room.id,
      open: { kind: "room", room },
      sort: time(latest, room.created_at),
    });
  }
  // Everyone stays on top; the rest by their newest message.
  rows.sort((a, b) => (a.icon === "everyone" ? -1 : b.icon === "everyone" ? 1 : b.sort.localeCompare(a.sort)));

  const mark = (row: Row) => {
    const box = { width: 44, height: 44, borderRadius: row.icon === "direct" ? "50%" : SL.Radius.md, display: "grid", placeItems: "center", flexShrink: 0 } as const;
    if (row.icon === "direct") {
      return (
        <div style={{ ...box, background: SL.Surface.raised2 }}>
          <Text color={SL.Signal.action} lineHeight={1} style={slFixed(16, SL.Weight.semibold)}>{row.person ? SocialProfile.initial(row.person) : "?"}</Text>
        </div>
      );
    }
    const [symbol, tint, ink] =
      row.icon === "everyone"
        ? ["globe", colorOpacity(SL.Signal.recovery, 0.16), SL.Signal.recovery]
        : row.icon === "friends"
          ? ["person.2.fill", SL.Signal.actionTint, SL.Signal.action]
          : ["number", colorOpacity(SL.Signal.attention, 0.16), SL.Signal.attention];
    return (
      <div style={{ ...box, background: tint }}>
        <SFSymbol name={symbol} size={19} weight={600} color={ink} />
      </div>
    );
  };

  const action = (icon: string, label: string, perform: () => void, disabled: boolean) => (
    <PressButton
      onPress={perform}
      disabled={disabled}
      style={{
        flex: "1 1 0",
        minHeight: 46,
        borderRadius: 999,
        background: SL.Surface.raised,
        boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <SFSymbol name={icon} size={14} weight={600} color={SL.Signal.action} />
      <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} color={SL.Ink.primary}>{label}</Text>
    </PressButton>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", height: "100%", minHeight: 0, background: SL.Surface.ground }}>
      <BackBar label="Friends" onClose={onClose} />
      <VStack alignment="leading" spacing={2} style={{ flexShrink: 0, paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: SL.Space.s3 }}>
        <Text as="h1" {...slTitle()} color={SL.Ink.primary}>Chats</Text>
        <Text {...slMeta()} color={SL.Ink.secondary}>Everyone, your friends, private chats and rooms</Text>
      </VStack>
      <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: SL.Space.s6 }}>
        <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
          {action("paperplane.fill", "Message", () => setNewMessage(true), social.friends.length === 0)}
          {action("plus", "New room", () => setNewRoom(true), social.friends.length === 0)}
        </HStack>
        {social.friends.length === 0 && (
          <Text {...slMeta()} color={SL.Ink.secondary} style={{ display: "block", paddingBottom: SL.Space.s3 }}>
            Add a friend to message them privately or start a room. Everyone is open to every Setline lifter.
          </Text>
        )}
        <VStack spacing={0} style={{ alignSelf: "stretch", background: SL.Surface.raised, borderRadius: SL.Radius.lg, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}`, overflow: "hidden" }}>
          {rows.map((row, index) => {
            const unread = isUnread(row.latest, myID, row.room);
            return (
              <div key={row.key} style={{ alignSelf: "stretch" }}>
                {index > 0 && <SLHairline style={{ marginLeft: 72 }} />}
                <PressButton
                  onPress={() => setOpen(row.open)}
                  aria-label={`${row.title}${unread ? ", new message" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: SL.Space.s3, width: "100%", padding: SL.Space.s3, background: "transparent", textAlign: "left" }}
                >
                  {mark(row)}
                  <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
                    <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
                      <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={1}>{row.title}</Text>
                      <Spacer />
                      {row.latest && (
                        <Text size={SL.TypeSize.micro} weight={SL.Weight.medium} color={unread ? SL.Signal.action : SL.Ink.tertiary}>
                          {PostCard.when(ChatMessage.date(row.latest))}
                        </Text>
                      )}
                    </HStack>
                    <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
                      <Text {...slMeta(unread ? SL.Weight.semibold : SL.Weight.regular)} color={unread ? SL.Ink.primary : SL.Ink.secondary} lineLimit={1} style={{ flex: "1 1 0", minWidth: 0 }}>
                        {preview(row.latest, myID) ?? row.subtitle}
                      </Text>
                      {unread && <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: SL.Signal.action, flexShrink: 0 }} />}
                    </HStack>
                  </VStack>
                </PressButton>
              </div>
            );
          })}
        </VStack>
      </div>

      <Sheet isPresented={newMessage} onDismiss={() => setNewMessage(false)}>
        {newMessage && (
          <NewMessageSheet
            friends={social.friends}
            onPick={(friend) => {
              setNewMessage(false);
              void social
                .directRoom(friend)
                .then((room) => setOpen({ kind: "room", room }))
                .catch(() => {});
            }}
            onClose={() => setNewMessage(false)}
          />
        )}
      </Sheet>
      <Sheet isPresented={newRoom} onDismiss={() => setNewRoom(false)}>
        {newRoom && (
          <NewRoomSheet
            friends={social.friends}
            onCreate={async (name, ids) => {
              const room = await social.createRoom(name, ids);
              setNewRoom(false);
              setOpen({ kind: "room", room });
            }}
            onClose={() => setNewRoom(false)}
          />
        )}
      </Sheet>
    </div>
  );
}

function BackBar({ label, onClose, trailing }: { label: string; onClose: () => void; trailing?: React.ReactNode }) {
  return (
    <HStack style={{ flexShrink: 0, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4 }}>
      <PressButton onPress={onClose} aria-label={`Back to ${label}`} style={{ background: "transparent", color: SL.Ink.secondary, minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", gap: 2 }}>
        <SLGlyph name="chevronLeft" size={18} />
        <Text {...slBody()} color={SL.Ink.secondary}>{label}</Text>
      </PressButton>
      <Spacer />
      {trailing}
    </HStack>
  );
}

function FriendRow({ friend, trailing }: { friend: SocialProfile; trailing?: React.ReactNode }) {
  return (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", minHeight: SL.Space.hitMin, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2 }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Text color={SL.Signal.action} lineHeight={1} style={slFixed(14, SL.Weight.semibold)}>{SocialProfile.initial(friend)}</Text>
      </div>
      <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary}>{friend.display_name}</Text>
        <Text {...slMeta()} color={SL.Ink.secondary}>{`@${friend.username}`}</Text>
      </VStack>
      <Spacer minLength={SL.Space.s2} />
      {trailing}
    </HStack>
  );
}

/** Pick the friend to write to, privately. */
export function NewMessageSheet({ friends, onPick, onClose }: { friends: SocialProfile[]; onPick: (friend: SocialProfile) => void; onClose: () => void }) {
  return (
    <SLSheet title="New message" subtitle="Only the two of you see it" onClose={onClose}>
      <VStack spacing={0} style={{ alignSelf: "stretch" }}>
        {friends.map((friend) => (
          <PressButton key={friend.user_id} onPress={() => onPick(friend)} style={{ display: "block", width: "100%", background: "transparent", textAlign: "left" }}>
            <FriendRow friend={friend} trailing={<SFSymbol name="paperplane.fill" size={15} weight={600} color={SL.Signal.action} />} />
          </PressButton>
        ))}
      </VStack>
    </SLSheet>
  );
}

const roomIdeas = ["Leg day crew", "Cutting together", "Meal prep", "Morning lifters"];

/** A room on a topic: its name and the friends in it. */
export function NewRoomSheet({ friends, onCreate, onClose }: { friends: SocialProfile[]; onCreate: (name: string, ids: string[]) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const ready = trimmingWhitespacesAndNewlines(name) !== "" && picked.length > 0 && !saving;
  return (
    <SLSheet title="New room" subtitle="A chat on one topic, with the friends you pick" onClose={onClose}>
      <VStack alignment="leading" spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
        <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          <SLOverline text="Name" />
          <input
            value={name}
            maxLength={40}
            aria-label="Room name"
            placeholder="Leg day crew"
            onChange={(e) => setName(e.target.value)}
            style={{ ...slFont(SL.TypeSize.lead, SL.Weight.semibold), color: SL.Ink.primary, caretColor: SL.Signal.action, background: SL.Surface.raised2, border: "none", outline: "none", borderRadius: SL.Radius.md, minHeight: 48, padding: `0 ${SL.Space.s4}px`, width: "100%", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: SL.Space.s2 }}>
            {roomIdeas.map((idea) => (
              <PressButton
                key={idea}
                onPress={() => setName(idea)}
                style={{ minHeight: 32, padding: "0 12px", borderRadius: 999, background: "transparent", boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`, display: "flex", alignItems: "center" }}
              >
                <Text size={SL.TypeSize.meta} weight={SL.Weight.medium} color={SL.Ink.secondary}>{idea}</Text>
              </PressButton>
            ))}
          </div>
        </VStack>
        <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          <SLOverline text={picked.length === 0 ? "Friends" : `Friends · ${picked.length}`} />
          <VStack spacing={0} style={{ alignSelf: "stretch" }}>
            {friends.map((friend) => {
              const on = picked.includes(friend.user_id);
              return (
                <PressButton
                  key={friend.user_id}
                  aria-pressed={on}
                  onPress={() => setPicked((list) => (on ? list.filter((id) => id !== friend.user_id) : [...list, friend.user_id]))}
                  style={{ display: "block", width: "100%", background: "transparent", textAlign: "left" }}
                >
                  <FriendRow friend={friend} trailing={<SFSymbol name={on ? "checkmark.circle.fill" : "circle"} size={22} weight={600} color={on ? SL.Signal.action : SL.Ink.tertiary} />} />
                </PressButton>
              );
            })}
          </VStack>
        </VStack>
        {failed && <Text {...slMeta()} color={SL.Signal.attention}>Couldn't start the room. Check your connection and try again.</Text>}
        <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
          <SLPrimaryButton
            disabled={!ready}
            onPress={() => {
              setSaving(true);
              setFailed(false);
              void onCreate(name, picked).catch(() => {
                setFailed(true);
                setSaving(false);
              });
            }}
          >
            {saving ? "Starting…" : "Start room"}
          </SLPrimaryButton>
        </div>
      </VStack>
    </SLSheet>
  );
}

// MARK: - A photo in a message

function ChatPhoto({ path }: { path: string }) {
  const social = useSocial();
  const [url, setURL] = useState<string | undefined>(() => social.cachedImage(path));
  useEffect(() => {
    if (url) return;
    let live = true;
    void social.image(path).then((u) => live && setURL(u));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return (
    <div style={{ width: 220, maxWidth: "100%", aspectRatio: "4 / 5", borderRadius: 14, overflow: "hidden", background: SL.Surface.raised2 }}>
      {url && <img src={url} alt="Photo" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
    </div>
  );
}

// MARK: - One conversation

export function ChatView({ room, onClose, backLabel = "Friends" }: { room?: ChatRoom; onClose: () => void; backLabel?: string }) {
  const social = useSocial();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [topic, setTopic] = useState<ChatTopic | undefined>(undefined);
  const [photo, setPhoto] = useState<{ jpeg: Blob; url: string } | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<ChatMessage | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const lastID = useRef<string | undefined>(undefined);
  const roomID = room?.id;

  const reload = async () => {
    try {
      const list = await social.chatMessages({ room: roomID });
      setMessages(list);
      setFailed(false);
      const latest = list[list.length - 1];
      if (latest) ChatReadMarker.set(latest.created_at, roomID);
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
  }, [roomID]);

  // A new message at the bottom scrolls into view.
  useEffect(() => {
    const latest = messages[messages.length - 1]?.id;
    if (latest !== undefined && latest !== lastID.current) {
      bottom.current?.scrollIntoView({ block: "end", behavior: lastID.current === undefined ? "auto" : "smooth" });
      lastID.current = latest;
    }
  }, [messages]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const empty = trimmingWhitespacesAndNewlines(draft) === "" && !photo;
  const send = () => {
    if (empty || sending) return;
    void (async () => {
      setSending(true);
      const text = draft;
      const held = photo;
      setDraft("");
      setPhoto(undefined);
      try {
        await social.sendChat(text, { topic, room: roomID, photo: held?.jpeg });
        setTopic(undefined);
        await reload();
      } catch {
        setDraft(text);
        setPhoto(held);
      }
      setSending(false);
    })();
  };

  const myID = social.myID;
  const title = room ? ChatRoom.title(room, myID) : "Friends";
  const subtitle = !room
    ? `You and your ${social.friends.length === 1 ? "friend" : `${social.friends.length} friends`} · only friends see this`
    : room.kind === "everyone"
      ? "Every Setline lifter · be kind, report what isn't"
      : room.kind === "direct"
        ? "Private · only you two see this"
        : `${room.members.map((m) => (m.user_id === myID ? "You" : firstWord(m.display_name))).join(", ")} · only members see this`;
  const placeholder =
    social.offlineSince !== undefined
      ? "Messages wait for a connection"
      : topic
        ? `A ${ChatMessage.topicLabel(topic).toLowerCase()} message…`
        : room?.kind === "everyone"
          ? "Message everyone…"
          : room?.kind === "direct"
            ? `Message ${firstWord(ChatRoom.other(room, myID)?.display_name) ?? "your friend"}…`
            : room
              ? `Message ${title}…`
              : "Message your friends…";

  const bubble = (message: ChatMessage, index: number) => {
    const mine = message.user_id === myID;
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
              {`${mine ? "You" : (firstWord(message.author?.display_name) ?? "Someone")} · ${PostCard.when(ChatMessage.date(message))}`}
            </Text>
          )}
          <Menu
            entries={entries}
            aria-label={`${mine ? "Your message" : `Message from ${firstWord(message.author?.display_name) ?? "someone"}`}: ${message.image_path ? "photo. " : ""}${message.body}`}
            style={{ display: "block", textAlign: "left", maxWidth: "100%" }}
            label={
              <VStack alignment={mine ? "trailing" : "leading"} spacing={4}>
                {message.image_path && <ChatPhoto path={message.image_path} />}
                {(message.body !== "" || message.topic) && (
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
                      <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={0.6} color={topicTone(message.topic)} style={{ display: "block", paddingBottom: message.body !== "" ? 2 : 0 }}>
                        {ChatMessage.topicLabel(message.topic).toUpperCase()}
                      </Text>
                    )}
                    {message.body !== "" && (
                      <Text {...slBody()} color={SL.Ink.primary} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                        {message.body}
                      </Text>
                    )}
                  </div>
                )}
              </VStack>
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
  const canLeave = room !== undefined && room.kind !== "everyone";
  const owns = room?.created_by === myID;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", height: "100%", minHeight: 0, background: SL.Surface.ground }}>
      <BackBar
        label={backLabel}
        onClose={onClose}
        trailing={
          canLeave ? (
            <Menu
              aria-label="Chat options"
              entries={[{ kind: "button", title: owns ? (room!.kind === "direct" ? "Delete chat" : "Close room") : "Leave", systemImage: "trash", role: "destructive", action: () => setLeaving(true) }]}
              label={
                <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", color: SL.Ink.secondary }}>
                  <SFSymbol name="ellipsis" size={18} weight={600} color={SL.Ink.secondary} />
                </div>
              }
            />
          ) : undefined
        }
      />
      <VStack alignment="leading" spacing={2} style={{ flexShrink: 0, paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: SL.Space.s2 }}>
        <Text as="h1" {...slTitle()} color={SL.Ink.primary}>{title}</Text>
        <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1}>{subtitle}</Text>
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
              {failed ? "Check your connection; it tries again by itself." : room?.kind === "everyone" ? "Say hi to every Setline lifter, ask a question, share a win." : "Ask about a workout or a meal, or cheer someone on."}
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
        {photo && (
          <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s2 }}>
            <div style={{ position: "relative", width: 64, height: 64, borderRadius: 12, overflow: "hidden" }}>
              <img src={photo.url} alt="Photo to send" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <PressButton
                aria-label="Remove photo"
                onPress={() => setPhoto(undefined)}
                style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center" }}
              >
                <SFSymbol name="xmark" size={10} weight={700} color="#fff" />
              </PressButton>
            </div>
          </HStack>
        )}
        <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s2, overflowX: "auto" }}>
          {ChatMessage.topics.map(topicChip)}
        </HStack>
        <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2 }}>
          {social.roomsAvailable && (
            <>
              <input
                ref={picker}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  void SocialStore.preparePhoto(file).then((prepared) => {
                    if (prepared?.jpeg) setPhoto({ jpeg: prepared.jpeg, url: URL.createObjectURL(prepared.jpeg) });
                  });
                }}
              />
              <PressButton
                aria-label="Add a photo"
                onPress={() => picker.current?.click()}
                style={{ width: 44, height: 44, borderRadius: "50%", background: SL.Surface.raised, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`, display: "grid", placeItems: "center", flexShrink: 0 }}
              >
                <SFSymbol name="photo.badge.plus" size={17} weight={600} color={SL.Ink.secondary} />
              </PressButton>
            </>
          )}
          <div style={{ flex: "1 1 0", minWidth: 0, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: 11, paddingBottom: 11, borderRadius: 22, background: SL.Surface.raised, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}` }}>
            <textarea
              rows={1}
              value={draft}
              maxLength={1000}
              aria-label="Message"
              placeholder={placeholder}
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
      <ConfirmationDialog
        isPresented={leaving}
        onDismiss={() => setLeaving(false)}
        title={owns ? (room?.kind === "direct" ? "Delete this chat?" : `Close ${title}?`) : `Leave ${title}?`}
        message={owns ? "Its messages are removed for everyone in it." : "You stop seeing its messages. The others keep talking."}
        actions={[
          {
            title: owns ? (room?.kind === "direct" ? "Delete chat" : "Close room") : "Leave",
            role: "destructive",
            action: () => {
              if (!room) return;
              void social
                .leaveRoom(room)
                .then(onClose)
                .catch(() => {});
            },
          },
          { title: "Cancel", role: "cancel" },
        ]}
      />
    </div>
  );
}
