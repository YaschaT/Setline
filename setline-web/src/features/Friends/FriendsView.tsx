// FriendsView.swift — Friends: the workouts of the people you train
// alongside, and kudos for theirs. Only accepted friends see a post, and a
// post is a summary — the name of the day, its numbers and its medals — never
// the log behind it.
//
// Web: `.refreshable` (pull to refresh) is left out — the tab loads on open
// and the offline banner has Retry; the kudos haptic is left out; the list's
// swipe actions are a sideways drag on the row; `ShareLink` is
// `navigator.share`, else the text is copied.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TrainedWithLine } from "./TrainedTogetherViews";
import type { TrainingSession } from "../../core/Domain/Model";
import { LoggedSet } from "../../core/Domain/Model";
import { Medals, LiftMedal_Place } from "../../core/Progress/Medals";
import { RecordsEngine } from "../../core/Engine/RecordsEngine";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { addDays, isSameDay } from "../../core/Support/calendar";
import { charCount, graphemes, isLetterChar, isNumberChar, prefixChars, trimmingWhitespaces } from "../../core/Support/nutrition";
import { maxBy } from "../../core/Support/swift";
import {
  Alert, ConfirmationDialog, FullScreenCover, HStack, Menu, ScrollView, Sheet, Spacer, Text, VStack, useAppStorage, type MenuEntry,
} from "../../design/swiftui";
import { SL, slFont } from "../../design/tokens";
import { slFixed } from "../../design/SLDynamicType";
import { SFSymbol } from "../../design/SFSymbol";
import { SLSound } from "../../design/SLSound";
import { SLOutlineButton, SLPrimaryButton, colorOpacity } from "../../design/SetlineTokens";
import { SLGlyph, SLWorkoutSymbol } from "../../design/components/SLGlyph";
import { SLMedal } from "../../design/components/SLMedal";
import { SLPress } from "../../design/components/SLPress";
import { SLHeaderButton, SLTabHeader, SLTabHeaderPinned } from "../../design/components/SLPieces";
import { slBody, slLead, slMeta } from "../../design/components/SLText";
import { useSidewaysDrag } from "../../design/components/SidewaysDrag";
import { PressButton, useReduceMotion } from "../../design/support";
import { useApp } from "../../data/AppState";
import { FeedPost, HiddenStat, SocialProfile, SocialStore, useSocial, type Friendship } from "../../data/SocialStore";
import { PostComposerView, RestReason } from "./PostComposerView";
import { ChatReadMarker, ChatView } from "./ChatView";
import { FriendProfileView, PostDetailView, PostMusic, PostPhotos, VisibilityBadge, type ProfileTarget } from "./PostDetailViews";
import { PostPlaceView } from "./WorkoutPlaceViews";
import { InviteQRSheet } from "./InviteViews";

/** A cover inside the screen's safe area, as the iPhone lays a full-screen cover out. */
function CoverBody({ children }: { children?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
      {children}
    </div>
  );
}

/** Keeps the last presented item while a cover slides away. */
function useLast<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState(value);
  useEffect(() => {
    if (value !== undefined) setLast(value);
  }, [value]);
  return value ?? last;
}

const listCard = (radius: number = SL.Radius.lg): CSSProperties => ({ background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: radius, overflow: "hidden" });

type ComposeTarget = { kind: "workout"; value: TrainingSession } | { kind: "rest"; value: Date };

export function FriendsView({ onAccount }: { onAccount: () => void }) {
  const app = useApp();
  const social = useSocial();
  const [showsPeople, setShowsPeople] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [composing, setComposing] = useState<ComposeTarget | undefined>(undefined);
  const shownComposing = useLast(composing);
  /** Workouts the lifter said not to post, so the prompt moves on. */
  const [skippedPrompts, setSkippedPrompts] = useAppStorage<string>("setline.social.skippedPrompts", "");

  useEffect(() => {
    void social.load().then(() => social.refreshChatLatest());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.userID]);

  const header = (
    <SLTabHeader
      title="Friends"
      subtitle={social.me ? `@${social.me.username} · ${social.friends.length === 1 ? "1 friend" : `${social.friends.length} friends`}` : undefined}
      onAccount={onAccount}
      trailing={
        social.phase.kind === "ready" ? (
          <SLHeaderButton glyph="personAdd" label={social.incoming.length === 0 ? "Add friends" : `Friends, ${social.incoming.length} requests`} action={() => setShowsPeople(true)} />
        ) : undefined
      }
    />
  );

  /**
   * The way into the chat, at the top of the feed: the latest message, and a
   * lime dot while a friend's message is newer than your last look.
   */
  const chatRow = (() => {
    const latest = social.chatLatest;
    const unread = latest !== undefined && latest.user_id !== social.myID && latest.created_at > ChatReadMarker.get();
    const who = latest ? (latest.user_id === social.myID ? "You" : (latest.author?.display_name.split(" ")[0] ?? "Friend")) : undefined;
    return (
      <SLPress scale={0.98} onPress={() => setChatting(true)} aria-label={unread ? "Chat, new message" : "Chat"} style={{ alignSelf: "stretch" }}>
        <HStack spacing={SL.Space.s3} style={{ padding: SL.Space.s3, ...listCard() }}>
          <div style={{ width: 40, height: 40, borderRadius: SL.Radius.md, background: SL.Signal.actionTint, display: "grid", placeItems: "center", flexShrink: 0, position: "relative" }}>
            <SFSymbol name="bubble.left" size={18} weight={600} color={SL.Signal.action} />
            {unread && <span aria-hidden style={{ position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: 999, background: SL.Signal.action, boxShadow: `0 0 0 2px ${SL.Surface.ground}` }} />}
          </div>
          <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>Chat</Text>
            <Text {...slMeta(unread ? SL.Weight.semibold : SL.Weight.regular)} color={unread ? SL.Ink.primary : SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
              {latest ? `${who}: ${latest.body}` : "Ask about training or food, or cheer each other on"}
            </Text>
          </VStack>
          <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
        </HStack>
      </SLPress>
    );
  })();

  const requestsBanner = (
    <SLPress scale={0.98} onPress={() => setShowsPeople(true)} style={{ alignSelf: "stretch" }}>
      <HStack spacing={SL.Space.s3} style={{ padding: SL.Space.s3, ...listCard() }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: SL.Signal.attention, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <SLGlyph name="people" size={18} fixed color={SL.Signal.onAction} />
        </div>
        <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
          {social.incoming.length === 1 ? `${social.incoming[0].requester?.display_name ?? "Someone"} wants to be friends` : `${social.incoming.length} friend requests`}
        </Text>
        <Spacer />
        <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
      </HStack>
    </SLPress>
  );

  /** The latest workout of the last three days that has no post yet and wasn't waved away. */
  const unpostedWorkout = (() => {
    const skipped = new Set(skippedPrompts.split(",").filter((s) => s !== ""));
    const since = new Date(Date.now() - 3 * 86_400_000);
    return maxBy(
      app.sessions.filter((s) => s.kind === "workout" && s.date >= since && !skipped.has(s.id) && !social.hasPost({ sessionID: s.id })),
      (a, b) => a.date.getTime() < b.date.getTime(),
    );
  })();

  /** "Your latest workout — post it?", with a preview of the post. */
  const latestWorkoutPrompt = (session: TrainingSession) => {
    const golds = Medals.medals({ for: session, in: app.sessions }).filter((m) => m.place === LiftMedal_Place.gold);
    const all = session.results.flatMap((r) => r.sets);
    const volume = RecordsEngine.volumeLoad(all);
    const sets = all.filter(LoggedSet.countsTowardVolume).length;
    const gold = golds[0];
    return (
      <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s4, ...listCard(SL.Radius.xl) }}>
        <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} tracking={1.2} color={SL.Ink.secondary}>YOUR LATEST WORKOUT</Text>
        {/* A small preview of the post it becomes. */}
        <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
          <div style={{ width: 44, height: 44, borderRadius: SL.Radius.md, background: SL.Signal.actionTint, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <SLWorkoutSymbol dayName={session.dayLabel} size={20} color={SL.Signal.action} />
          </div>
          <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
            <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{session.dayLabel}</Text>
            <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.85} style={{ maxWidth: "100%" }}>
              {`${PostCard.when(session.date)} · ${NumberDisplay.volumeKg(app.display, volume)} · ${sets} sets`}
            </Text>
          </VStack>
          <Spacer minLength={0} />
        </HStack>
        {gold && (
          <HStack spacing={SL.Space.s2} style={{ minWidth: 0, maxWidth: "100%" }}>
            <SLMedal place={LiftMedal_Place.gold} size={22} />
            <Text {...slMeta(SL.Weight.semibold)} color={SLMedal.metal(LiftMedal_Place.gold).face} lineLimit={1}>
              {golds.length === 1 ? `Best ever · ${gold.name}` : `${golds.length} bests ever · ${gold.name} and more`}
            </Text>
          </HStack>
        )}
        <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          <SLPrimaryButton onPress={() => setComposing({ kind: "workout", value: session })}>Post it</SLPrimaryButton>
          <PressButton
            onPress={() => setSkippedPrompts([...skippedPrompts.split(",").filter((s) => s !== ""), session.id].slice(-30).join(","))}
            style={{ ...slFont(SL.TypeSize.body, SL.Weight.medium), color: SL.Ink.secondary, minHeight: SL.Space.hitMin, paddingLeft: SL.Space.s2, paddingRight: SL.Space.s2, background: "transparent", flexShrink: 0 }}
          >
            Not this one
          </PressButton>
        </HStack>
      </VStack>
    );
  };

  /** Resting today: share why, in one tap. */
  const restDayRow = (
    <SLPress scale={0.98} onPress={() => setComposing({ kind: "rest", value: new Date() })} style={{ alignSelf: "stretch" }}>
      <HStack spacing={SL.Space.s3} style={{ padding: SL.Space.s3, ...listCard() }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: SL.Signal.recoveryTint, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <SFSymbol name="moon.zzz.fill" size={16} weight={600} color={SL.Signal.recovery} />
        </div>
        <VStack alignment="leading" spacing={2}>
          <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>{app.todayDay === undefined ? "Rest day today?" : "Not training today?"}</Text>
          <Text {...slMeta()} color={SL.Ink.secondary}>Post a rest day and say why</Text>
        </VStack>
        <Spacer minLength={SL.Space.s2} />
        <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
      </HStack>
    </SLPress>
  );

  const offlineDetail = (() => {
    const loaded = social.lastLoaded;
    if (!loaded) return "Kudos and comments wait for a connection.";
    const time = isSameDay(loaded, new Date())
      ? new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(loaded)
      : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(loaded);
    return `Showing what loaded at ${time}. Kudos and comments wait for a connection.`;
  })();

  /** No connection: the feed below is what loaded last (S3). */
  const offlineBanner = (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s3, ...listCard() }}>
      <div style={{ width: 34, height: 34, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <SFSymbol name="wifi.slash" size={16} weight={600} color={SL.Signal.attention} />
      </div>
      <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
        <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>You're offline</Text>
        <Text {...slMeta()} color={SL.Ink.secondary}>{offlineDetail}</Text>
      </VStack>
      <Spacer minLength={SL.Space.s2} />
      <PressButton onPress={() => void social.load()} style={{ minHeight: SL.Space.hitMin, display: "grid", placeItems: "center", background: "transparent", flexShrink: 0 }}>
        <span style={{ ...slFont(SL.TypeSize.body, SL.Weight.semibold), color: SL.Ink.primary, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 36, display: "flex", alignItems: "center", borderRadius: 999, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}` }}>
          Retry
        </span>
      </PressButton>
    </HStack>
  );

  /** Posts made without a connection, waiting on this device. */
  const pendingBanner = (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s3, ...listCard() }}>
      <div style={{ width: 34, height: 34, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <SFSymbol name="icloud.and.arrow.up" size={16} weight={600} color={SL.Signal.attention} />
      </div>
      <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
        <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>{social.pending.length === 1 ? "1 post waiting to go out" : `${social.pending.length} posts waiting to go out`}</Text>
        <Text {...slMeta()} color={SL.Ink.secondary}>It's saved on this phone and posts when you're back online.</Text>
      </VStack>
      <Spacer minLength={SL.Space.s2} />
      <PressButton onPress={() => void social.load()} style={{ ...slFont(SL.TypeSize.body, SL.Weight.semibold), color: SL.Signal.action, minHeight: SL.Space.hitMin, background: "transparent", flexShrink: 0 }}>
        Retry
      </PressButton>
    </HStack>
  );

  /** No friends yet: Friends posts are visible to you alone, and the way out of that is one tap. */
  const onlyYouCard = (
    <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s4, ...listCard(SL.Radius.xl) }}>
      <HStack alignment="top" spacing={SL.Space.s3}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: SL.Signal.recoveryTint, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <SFSymbol name="lock.fill" size={16} weight={600} color={SL.Signal.recovery} />
        </div>
        <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
          <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>Only you can see this — for now</Text>
          <Text {...slMeta()} color={SL.Ink.secondary}>Friends you add later see your Friends posts, old ones too. Private posts stay private.</Text>
        </VStack>
      </HStack>
      <SLPrimaryButton onPress={() => setShowsPeople(true)}>Invite a gym friend</SLPrimaryButton>
    </VStack>
  );

  const firstPostHint = (
    <Text {...slBody()} color={SL.Ink.secondary} align="center" style={{ alignSelf: "stretch", paddingTop: SL.Space.s6, paddingBottom: SL.Space.s6 }}>
      Finish a workout and tap Create post to share it here.
    </Text>
  );

  const emptyFeed = (
    <VStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s5, ...listCard() }}>
      <SLGlyph name="people" size={36} fixed color={SL.Ink.tertiary} />
      <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>No workouts from friends yet</Text>
      <Text {...slBody()} color={SL.Ink.secondary} align="center">Add the people you train with. Their workouts show up here, and yours show up for them.</Text>
      <SLPrimaryButton onPress={() => setShowsPeople(true)} style={{ marginTop: SL.Space.s2 }}>Add friends</SLPrimaryButton>
    </VStack>
  );

  const notice = (title: string, text: string, retry = false) => (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch", padding: SL.Space.s4, ...listCard() }}>
      <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{title}</Text>
      <Text {...slBody()} color={SL.Ink.secondary}>{text}</Text>
      {retry && (
        <SLOutlineButton onPress={() => void social.load()} style={{ marginTop: SL.Space.s2 }}>Try again</SLOutlineButton>
      )}
    </VStack>
  );

  let content: ReactNode;
  switch (social.phase.kind) {
    case "loading":
      // Cards in the shape of the posts on their way (S2).
      content = (
        <>
          <FeedSkeleton />
          <FeedSkeleton short />
        </>
      );
      break;
    case "notSetUp":
      content = notice("Friends is almost ready", "The server still needs its one setup step. Once that's done, this tab fills in by itself.");
      break;
    case "failed":
      content = notice("Couldn't load your friends", social.phase.value, true);
      break;
    case "needsProfile":
      content = <ProfileSetupCard />;
      break;
    case "ready": {
      const today = new Date();
      content = (
        <>
          {social.offlineSince !== undefined && offlineBanner}
          {social.incoming.length > 0 && requestsBanner}
          {social.friends.length > 0 && social.chatAvailable && chatRow}
          {social.pending.length > 0 && pendingBanner}
          {unpostedWorkout && latestWorkoutPrompt(unpostedWorkout)}
          {!social.hasPost({ sessionID: SocialStore.restID(today) }) && !app.sessions.some((s) => s.kind === "workout" && isSameDay(s.date, today)) && restDayRow}
          {social.friends.length === 0 && onlyYouCard}
          {social.feed.length === 0 ? (social.friends.length === 0 ? firstPostHint : emptyFeed) : social.feed.map((post) => <PostCard key={post.id} post={post} />)}
        </>
      );
      break;
    }
  }

  return (
    <SLTabHeaderPinned header={header}>
      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack alignment="leading" spacing={SL.Space.s4} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Metric.tabContentTop, paddingBottom: SL.Space.s6 }}>
          {content}
        </VStack>
      </ScrollView>
      <FullScreenCover isPresented={composing !== undefined}>
        {shownComposing && (
          <CoverBody>
            <PostComposerView
              mode={shownComposing.kind === "workout" ? { kind: "create", value: shownComposing.value } : { kind: "rest", value: shownComposing.value }}
              onClose={() => setComposing(undefined)}
            />
          </CoverBody>
        )}
      </FullScreenCover>
      <Sheet isPresented={showsPeople} onDismiss={() => setShowsPeople(false)} dragIndicator={false}>
        <PeopleSheet onClose={() => setShowsPeople(false)} />
      </Sheet>
      <FullScreenCover isPresented={chatting}>
        {chatting && (
          <CoverBody>
            <ChatView
              onClose={() => {
                setChatting(false);
                void social.refreshChatLatest();
              }}
            />
          </CoverBody>
        )}
      </FullScreenCover>
    </SLTabHeaderPinned>
  );
}

// MARK: - Profile

/** The first visit: a username friends can find you by, and the name they see. Says plainly what is shared and what never is. */
function ProfileSetupCard() {
  const app = useApp();
  const social = useSocial();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setName((n) => (n === "" ? (app.greetingName ?? "") : n));
    setUsername((u) => (u === "" ? SocialStore.suggestedUsername({ from: app.greetingName }) : u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canCreate = SocialStore.isValidUsername(username) && trimmingWhitespaces(name) !== "";
  const usernameHint = charCount(username) < 3 ? "3 to 20 letters, numbers or _" : "Friends find you by this";

  const field = (label: string, prefix: string | undefined, value: string, onChange: (v: string) => void, hint: string | undefined, plain: boolean) => (
    <VStack alignment="leading" spacing={SL.Space.s1} style={{ alignSelf: "stretch" }}>
      <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>{label}</Text>
      <HStack spacing={2} style={{ alignSelf: "stretch", paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 48, background: SL.Surface.raised2, borderRadius: SL.Radius.md }}>
        {prefix !== undefined && <Text {...slLead(SL.Weight.regular)} color={SL.Ink.tertiary}>{prefix}</Text>}
        <input
          value={value}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          autoCapitalize={plain ? "none" : undefined}
          autoCorrect={plain ? "off" : undefined}
          spellCheck={plain ? false : undefined}
          style={{ ...slFont(SL.TypeSize.lead, SL.Weight.regular), color: SL.Ink.primary, caretColor: SL.Signal.action, background: "transparent", border: "none", outline: "none", padding: 0, flex: "1 1 0", minWidth: 0, lineHeight: 1.25 }}
        />
      </HStack>
      {hint !== undefined && <Text {...slMeta()} color={SL.Ink.tertiary}>{hint}</Text>}
    </VStack>
  );

  const create = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await social.createProfile({ username, displayName: trimmingWhitespaces(name) });
    } catch (e) {
      setError(e instanceof Error && e.message !== "" ? e.message : "Couldn't create your profile. Try again.");
    }
    setSaving(false);
  };

  return (
    <VStack alignment="leading" spacing={SL.Space.s4} style={{ alignSelf: "stretch", padding: SL.Space.s5, ...listCard() }}>
      <VStack alignment="leading" spacing={SL.Space.s2}>
        <Text size={SL.TypeSize.title} weight={SL.Weight.bold} color={SL.Ink.primary}>Train with friends</Text>
        <Text {...slBody()} color={SL.Ink.secondary}>
          See each other's workouts, medals and streaks, and give kudos. Only friends you accept see your workouts — never your log, body weight or photos.
        </Text>
      </VStack>

      {field(
        "Username",
        "@",
        username,
        (value) => {
          const cleaned = graphemes(value.toLowerCase())
            .filter((c) => isLetterChar(c) || isNumberChar(c) || c === "_")
            .join("");
          setUsername(cleaned !== value ? prefixChars(cleaned, 20) : value);
        },
        usernameHint,
        true,
      )}
      {field("Name friends see", undefined, name, setName, undefined, false)}

      {error !== undefined && <Text {...slMeta()} color={SL.Signal.loss}>{error}</Text>}

      <SLPrimaryButton onPress={() => void create()} disabled={!canCreate || saving}>{saving ? "Creating…" : "Create profile"}</SLPrimaryButton>
    </VStack>
  );
}

// MARK: - A post

/** One workout in the feed: who, when, the day's numbers, its medals and streak, and kudos. */
export function PostCard({ post, isDetail = false }: { post: FeedPost; isDetail?: boolean }) {
  const app = useApp();
  const social = useSocial();
  const reduceMotion = useReduceMotion();
  const [confirmsBlock, setConfirmsBlock] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmsDelete, setConfirmsDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [opened, setOpened] = useState(false);
  const [profile, setProfile] = useState<ProfileTarget | undefined>(undefined);
  const shownProfile = useLast(profile);
  const [bursts, setBursts] = useState(0);
  const glyph = useRef<HTMLSpanElement>(null);

  // The kudos glyph: up to 1.35 and tipped, then a bouncy settle.
  useEffect(() => {
    if (bursts === 0 || reduceMotion) return;
    glyph.current?.animate(
      [
        { transform: "scale(1) rotate(0deg)", offset: 0 },
        { transform: `scale(1.35) rotate(${0.35 * -60}deg)`, offset: 0.32 },
        { transform: "scale(0.94) rotate(3.6deg)", offset: 0.7 },
        { transform: "scale(1) rotate(0deg)", offset: 1 },
      ],
      { duration: 440, easing: "ease-out" },
    );
  }, [bursts, reduceMotion]);

  const isMine = post.user_id === social.myID;
  const photos = FeedPost.photos(post);
  const tracks = FeedPost.tracks(post);
  const place = FeedPost.place(post);

  /** A rest day's why, in the recovery mint. */
  const restChip = (
    <HStack spacing={6} style={{ color: SL.Signal.recovery, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 32, borderRadius: 999, background: SL.Signal.recoveryTint, alignSelf: "flex-start" }}>
      <SFSymbol name={RestReason.symbol({ for: post.rest_reason })} size={13} weight={600} />
      <span style={slFont(SL.TypeSize.meta, SL.Weight.semibold)}>{post.rest_reason ?? "Resting"}</span>
    </HStack>
  );

  /** The numbers the lifter kept off this post. */
  const hiddenNumbers = HiddenStat.allCases.filter((s) => FeedPost.hides(post, s));

  /** "Numbers hidden on this post" — or which, when only some are. */
  const quietLine = (() => {
    if (hiddenNumbers.length === HiddenStat.allCases.length) return "Numbers hidden on this post";
    const joined = hiddenNumbers.map((s) => (s === "weights" ? "weights" : HiddenStat.label(s).toLowerCase())).join(" and ");
    return `${prefixChars(joined, 1).toUpperCase()}${graphemes(joined).slice(1).join("")} hidden on this post`;
  })();

  /** The title and notes: a way into the post on the feed, plain text in it. */
  const titleBlock = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch", textAlign: "left" }}>
      <Text size={SL.TypeSize.display} weight={SL.Weight.bold} tracking={-0.02 * SL.TypeSize.display} color={SL.Ink.primary} lineHeight={1.1}>
        {FeedPost.displayTitle(post)}
      </Text>
      {TrainedWithLine.text(FeedPost.trainedWith(post)) !== undefined && (
        <Text {...slBody(SL.Weight.medium)} color={SL.Signal.action}>{TrainedWithLine.text(FeedPost.trainedWith(post))}</Text>
      )}
      {post.notes !== undefined && post.notes !== "" && (
        <Text {...slBody()} color={colorOpacity(SL.Ink.primary, 0.82)} lineLimit={isDetail ? undefined : 3} style={{ whiteSpace: "pre-wrap" }}>
          {post.notes}
        </Text>
      )}
    </VStack>
  );

  const avatar = (
    <div style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
        <Text color={SL.Signal.action} lineHeight={1} style={slFixed(15, SL.Weight.semibold)}>{post.author ? SocialProfile.initial(post.author) : "?"}</Text>
      </div>
      {post.streak_weeks > 0 && (
        <div
          aria-label={`${post.streak_weeks}-week streak`}
          style={{
            position: "absolute",
            right: -4,
            bottom: -4,
            minWidth: 18,
            minHeight: 18,
            paddingLeft: 4,
            paddingRight: 4,
            borderRadius: 999,
            background: SL.Signal.action,
            boxShadow: `inset 0 0 0 2px ${SL.Surface.raised}`,
            display: "grid",
            placeItems: "center",
            boxSizing: "border-box",
          }}
        >
          <Text color={SL.Signal.onAction} lineHeight={1} style={slFixed(10, SL.Weight.bold)}>{`${post.streak_weeks}`}</Text>
        </div>
      )}
    </div>
  );

  const stat = (value: string, label: string) => (
    <VStack alignment="leading" spacing={1} style={{ flex: "1 1 0", minWidth: 0 }}>
      <Text size={SL.TypeSize.lead} weight={SL.Weight.semibold} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.8} style={{ maxWidth: "100%" }}>{value}</Text>
      <Text {...slMeta()} color={SL.Ink.secondary}>{label}</Text>
    </VStack>
  );

  const stats = (
    <HStack alignment="top" spacing={0} style={{ alignSelf: "stretch" }}>
      {!FeedPost.hides(post, "volume") && stat(NumberDisplay.volumeKg(app.display, post.volume_kg), "volume")}
      {!FeedPost.hides(post, "duration") && post.duration_seconds !== undefined && post.duration_seconds >= 60 && stat(NumberDisplay.minutes(app.display, post.duration_seconds), "time")}
      {stat(`${post.set_count}`, "sets")}
    </HStack>
  );

  /** "Sam and Cleo", "Sam and 2 others", or nothing yet. */
  const kudosLine = (() => {
    const names = post.kudos
      .filter((k) => k.user_id !== social.myID)
      .map((k) => k.giver?.display_name.split(" ").filter((s) => s !== "")[0])
      .filter((n): n is string => n !== undefined);
    const mine = post.kudos.some((k) => k.user_id === social.myID);
    const all = [...(mine ? ["you"] : []), ...names];
    switch (all.length) {
      case 0:
        return isMine ? "No kudos yet" : "";
      case 1:
        return `Kudos from ${all[0]}`;
      case 2:
        return `Kudos from ${all[0]} and ${all[1]}`;
      default:
        return `Kudos from ${all[0]} and ${all.length - 1} others`;
    }
  })();

  const given = social.hasKudos(post);
  const offline = social.offlineSince !== undefined;
  const kudosRow = (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      {!isMine && (
        <SLPress
          scale={0.9}
          bounces
          disabled={offline}
          aria-label={given ? "Take back kudos" : "Give kudos"}
          onPress={() => {
            if (!given) setBursts((b) => b + 1);
            if (!given) SLSound.play("pop");
            void social.toggleKudos(post);
          }}
          style={{ opacity: offline ? 0.45 : 1, flexShrink: 0 }}
        >
          <div style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
            <HStack spacing={6} style={{ color: given ? SL.Signal.onAction : SL.Ink.primary, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 36, borderRadius: 999, background: given ? SL.Signal.action : SL.Surface.raised2 }}>
              <span ref={glyph} style={{ display: "flex" }}>
                <SLGlyph name={given ? "kudosFill" : "kudos"} size={18} fixed />
              </span>
              <span style={{ ...slFont(SL.TypeSize.body, SL.Weight.semibold), whiteSpace: "nowrap", lineHeight: 1.25 }}>{given ? "Kudos given" : "Give kudos"}</span>
            </HStack>
          </div>
        </SLPress>
      )}
      {!isDetail && (
        <SLPress scale={0.9} aria-label={FeedPost.commentCount(post) === 1 ? "1 comment" : `${FeedPost.commentCount(post)} comments`} onPress={() => setOpened(true)} style={{ flexShrink: 0 }}>
          <div style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
            <HStack spacing={6} style={{ color: SL.Ink.primary, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 36, borderRadius: 999, background: SL.Surface.raised2 }}>
              <SFSymbol name="bubble.left" size={15} weight={600} />
              {FeedPost.commentCount(post) > 0 && <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary}>{`${FeedPost.commentCount(post)}`}</Text>}
            </HStack>
          </div>
        </SLPress>
      )}
      <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1}>{kudosLine}</Text>
      <Spacer minLength={0} />
    </HStack>
  );

  const menuEntries: MenuEntry[] = isMine
    ? [
        { kind: "button", title: "Edit post", systemImage: "pencil", action: () => setEditing(true) },
        { kind: "button", title: "Delete post", systemImage: "trash", role: "destructive", action: () => setConfirmsDelete(true) },
      ]
    : [
        { kind: "button", title: "Report post", action: () => setReporting(true) },
        { kind: "button", title: "Remove friend", action: () => void social.remove(post.user_id).catch(() => {}) },
        { kind: "button", title: "Block", role: "destructive", action: () => setConfirmsBlock(true) },
      ];

  return (
    <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", alignItems: "flex-start", padding: SL.Space.s4, background: SL.Surface.raised, borderRadius: SL.Radius.xl, boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairline}` }}>
      <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        <PressButton onPress={() => setProfile({ id: post.user_id })} title="Opens their profile" style={{ background: "transparent", textAlign: "left", minWidth: 0 }}>
          <HStack spacing={SL.Space.s3}>
            {avatar}
            <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
              <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>{isMine ? "You" : (post.author?.display_name ?? "A friend")}</Text>
              <Text {...slMeta()} color={SL.Ink.secondary}>{PostCard.when(FeedPost.date(post))}</Text>
            </VStack>
          </HStack>
        </PressButton>
        <Spacer />
        {isMine && <VisibilityBadge visibility={FeedPost.postVisibility(post)} />}
        <Menu
          entries={menuEntries}
          aria-label="More"
          style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "grid", placeItems: "center", flexShrink: 0 }}
          label={<SLGlyph name="more" size={20} fixed color={SL.Ink.secondary} />}
        />
      </HStack>

      <div style={{ alignSelf: "stretch", marginTop: SL.Space.s4, display: "flex", flexDirection: "column" }}>
        {isDetail ? (
          titleBlock
        ) : (
          <PressButton onPress={() => setOpened(true)} title="Opens the post and its comments" style={{ background: "transparent", textAlign: "left", display: "flex", flexDirection: "column", alignSelf: "stretch" }}>
            {titleBlock}
          </PressButton>
        )}
      </div>

      {photos.length > 0 && (
        <div style={{ alignSelf: "stretch", marginTop: SL.Space.s4, display: "flex", flexDirection: "column" }}>
          <PostPhotos photos={photos} carousel={isDetail} />
        </div>
      )}

      <div style={{ alignSelf: "stretch", marginTop: SL.Space.s4, display: "flex", flexDirection: "column" }}>{FeedPost.isRest(post) ? restChip : stats}</div>

      {!FeedPost.isRest(post) && hiddenNumbers.length > 0 && (
        <Text {...slMeta()} color={SL.Ink.secondary} style={{ marginTop: SL.Space.s2 }}>{quietLine}</Text>
      )}

      {place && (
        <div style={{ alignSelf: "stretch", marginTop: SL.Space.s4, display: "flex", flexDirection: "column" }}>
          <PostPlaceView place={place} />
        </div>
      )}

      {post.medals.length > 0 && (
        <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch", marginTop: SL.Space.s4 }}>
          {post.medals.slice(0, isDetail ? 20 : 3).map((medal, offset) => {
            const medalPlace = LiftMedal_Place.fromRawValue(medal.place);
            return (
              <HStack key={offset} spacing={SL.Space.s2} style={{ alignSelf: "stretch", minHeight: medalPlace === undefined ? 0 : undefined }}>
                {medalPlace !== undefined && (
                  <>
                    <SLMedal place={medalPlace} size={24} shines={medalPlace === LiftMedal_Place.gold} />
                    <HStack spacing={SL.Space.s2} style={{ minWidth: 0 }}>
                      <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary} lineLimit={1}>{medal.name}</Text>
                      <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} style={{ flexShrink: 0 }}>
                        {FeedPost.hides(post, "weights")
                          ? LiftMedal_Place.title(medalPlace)
                          : `${LiftMedal_Place.title(medalPlace)} · ${NumberDisplay.kg(app.display, medal.weight_kg)} × ${medal.reps}`}
                      </Text>
                    </HStack>
                  </>
                )}
              </HStack>
            );
          })}
        </VStack>
      )}

      {tracks.length > 0 && (
        <div style={{ alignSelf: "stretch", marginTop: SL.Space.s4, display: "flex", flexDirection: "column" }}>
          <PostMusic tracks={tracks} full={isDetail} />
        </div>
      )}

      <div aria-hidden style={{ height: SL.Metric.border, background: SL.Surface.hairline, marginLeft: -SL.Space.s4, marginRight: -SL.Space.s4, marginTop: SL.Space.s4, alignSelf: "stretch" }} />

      <div style={{ alignSelf: "stretch", marginTop: SL.Space.s3, display: "flex", flexDirection: "column" }}>{kudosRow}</div>

      <ConfirmationDialog
        isPresented={confirmsBlock}
        onDismiss={() => setConfirmsBlock(false)}
        title={`Block ${post.author?.display_name ?? "them"}?`}
        message="You stop being friends and neither of you can send a new request."
        actions={[{ title: "Block", role: "destructive", action: () => void social.block(post.user_id).catch(() => {}) }]}
      />
      <ConfirmationDialog
        isPresented={reporting}
        onDismiss={() => setReporting(false)}
        title="Report this post"
        message="Setline reviews every report within 24 hours."
        actions={["Spam", "Inappropriate", "Not a real workout", "Something else"].map((reason) => ({
          title: reason,
          action: () => void social.reportPost({ post, reason }).catch(() => {}),
        }))}
      />
      <Alert
        isPresented={confirmsDelete}
        onDismiss={() => setConfirmsDelete(false)}
        title="Delete this post?"
        message="Its photos, comments and kudos are removed for everyone. Your workout stays in your log."
        actions={[
          { title: "Cancel", role: "cancel" },
          { title: "Delete", role: "destructive", action: () => void social.delete(post).catch(() => {}) },
        ]}
      />
      <FullScreenCover isPresented={editing}>
        {editing && (
          <CoverBody>
            <PostComposerView mode={{ kind: "edit", value: post }} onClose={() => setEditing(false)} />
          </CoverBody>
        )}
      </FullScreenCover>
      <FullScreenCover isPresented={opened}>
        <CoverBody>
          <PostDetailView postID={post.id} onClose={() => setOpened(false)} />
        </CoverBody>
      </FullScreenCover>
      <FullScreenCover isPresented={profile !== undefined}>
        {shownProfile && (
          <CoverBody>
            <FriendProfileView userID={shownProfile.id} onClose={() => setProfile(undefined)} />
          </CoverBody>
        )}
      </FullScreenCover>
    </div>
  );
}

/** "Just now", "25 min ago", "3 h ago", "Yesterday", "Mon 5 Oct". */
PostCard.when = (date: Date, now: Date = new Date()): string => {
  const seconds = (now.getTime() - date.getTime()) / 1000;
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.trunc(seconds / 60)} min ago`;
  if (isSameDay(date, new Date())) return `${Math.trunc(seconds / 3600)} h ago`;
  if (isSameDay(date, addDays(new Date(), -1))) return "Yesterday";
  // DateFormatter, en_GB, "EEE d MMM".
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
};

// MARK: - People

// The grouped list as iOS draws it in dark mode.
const ListStyle = {
  cell: "rgb(28, 28, 30)",
  separator: "rgba(84, 84, 88, 0.6)",
  header: "rgba(235, 235, 245, 0.6)",
  margin: 16,
};

function ListSection({ header, children }: { header?: string; children?: ReactNode }) {
  const rows = (Array.isArray(children) ? children.flat() : [children]).filter((c) => c !== null && c !== undefined && c !== false);
  return (
    <div style={{ marginLeft: ListStyle.margin, marginRight: ListStyle.margin, marginTop: header ? 22 : 20 }}>
      {header !== undefined && (
        <div style={{ ...slFont(13), color: ListStyle.header, textTransform: "uppercase", paddingLeft: 16, paddingBottom: 7, lineHeight: 1.3 }}>{header}</div>
      )}
      <div style={{ background: ListStyle.cell, borderRadius: 10, overflow: "hidden" }}>
        {rows.map((row, i) => (
          <div key={i} style={{ position: "relative" }}>
            {i > 0 && <div style={{ position: "absolute", top: 0, left: 16, right: 0, height: 0.5, background: ListStyle.separator }} />}
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}

const cellPadding: CSSProperties = { paddingLeft: 16, paddingRight: 16, minHeight: 44, paddingTop: 8, paddingBottom: 8, boxSizing: "border-box" };

/** A friend's row, with Remove and Block behind a swipe to the left. */
function SwipeRow({ children, actions }: { children: ReactNode; actions: { title: string; color: string; action: () => void }[] }) {
  const width = 74 * actions.length;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const base = useRef(0);
  const drag = useSidewaysDrag({
    onChanged: (dx) => {
      setDragging(true);
      setOffset(Math.min(0, Math.max(-width - 40, base.current + dx)));
    },
    onEnded: (dx) => {
      setDragging(false);
      const end = base.current + dx;
      const next = end < -width / 2 ? -width : 0;
      base.current = next;
      setOffset(next);
    },
  });
  const close = () => {
    base.current = 0;
    setOffset(0);
  };
  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, display: "flex", width: Math.max(width, -offset) }}>
        {[...actions].reverse().map((a) => (
          <button
            key={a.title}
            type="button"
            className="sl-pressable"
            onClick={() => {
              close();
              a.action();
            }}
            style={{ flex: "1 1 0", background: a.color, color: "#fff", ...slFont(15, SL.Weight.medium) }}
          >
            {a.title}
          </button>
        ))}
      </div>
      <div {...drag} style={{ ...drag.style, position: "relative", background: ListStyle.cell, transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)" }}>
        {children}
      </div>
    </div>
  );
}

/** Finding friends, answering requests, and the list of friends. */
function PeopleSheet({ onClose }: { onClose: () => void }) {
  const social = useSocial();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<SocialProfile | undefined>(undefined);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showsQR, setShowsQR] = useState(false);

  const search = async () => {
    setBusy(true);
    try {
      setFound(await social.find({ username: query }));
    } catch {
      setFound(undefined);
    }
    setSearched(true);
    setBusy(false);
  };

  const share = async (text: string, url: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
    } catch {
      /* nothing to hand over */
    }
  };

  const textButton = (title: string, onPress: () => void, style: CSSProperties = {}, disabled = false) => (
    <PressButton onPress={onPress} disabled={disabled} style={{ ...slFont(17), color: disabled ? "rgba(235,235,245,0.3)" : SL.Signal.action, background: "transparent", flexShrink: 0, ...style }}>
      {title}
    </PressButton>
  );
  const pill = (title: string, onPress: () => void) => (
    <PressButton
      onPress={onPress}
      style={{ ...slFont(SL.TypeSize.body, SL.Weight.semibold), color: SL.Signal.onAction, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, paddingTop: 6, paddingBottom: 6, borderRadius: 999, background: SL.Signal.action, flexShrink: 0 }}
    >
      {title}
    </PressButton>
  );

  const personRow = (person: SocialProfile, trailing: ReactNode) => (
    <HStack spacing={SL.Space.s3} style={cellPadding}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Text color={SL.Signal.action} lineHeight={1} style={slFixed(14, SL.Weight.semibold)}>{SocialProfile.initial(person)}</Text>
      </div>
      <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
        <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>{person.display_name}</Text>
        <Text {...slMeta()} color={SL.Ink.secondary}>{`@${person.username}`}</Text>
      </VStack>
      <Spacer />
      {trailing}
    </HStack>
  );

  const requestButton = (person: SocialProfile): ReactNode => {
    if (person.user_id === social.myID) return <Text {...slMeta()} color={SL.Ink.secondary}>You</Text>;
    if (social.friends.some((f) => f.user_id === person.user_id)) return <Text {...slMeta()} color={SL.Ink.secondary}>Friends</Text>;
    if (social.outgoing.some((f) => f.addressee_id === person.user_id)) return <Text {...slMeta()} color={SL.Ink.secondary}>Requested</Text>;
    const incoming = social.incoming.find((f) => f.requester_id === person.user_id);
    if (incoming) return textButton("Accept", () => void social.accept(incoming).catch(() => {}));
    return pill("Add", () => void social.request(person).catch(() => {}));
  };

  const me = social.me;
  const url = social.inviteURL;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: SL.Surface.ground }}>
      {/* The inline navigation bar. */}
      <div style={{ position: "relative", flexShrink: 0, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Text size={17} weight={SL.Weight.semibold} color={SL.Ink.primary}>Friends</Text>
        <div style={{ position: "absolute", right: 16, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
          {textButton("Done", onClose, { fontWeight: SL.Weight.semibold, minHeight: SL.Space.hitMin })}
        </div>
      </div>
      <ScrollView style={{ flex: "1 1 0" }}>
        <div style={{ paddingBottom: 34 }}>
          {me && (
            <ListSection>
              <HStack style={cellPadding}>
                <VStack alignment="leading" spacing={2}>
                  <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{`@${me.username}`}</Text>
                  <Text {...slMeta()} color={SL.Ink.secondary}>Friends find you by this</Text>
                </VStack>
                <Spacer />
                <PressButton
                  onPress={() => void share(`Train with me on Setline. Add me: @${me.username}`, social.inviteURL ?? "https://setline.app")}
                  style={{ ...slFont(SL.TypeSize.body, SL.Weight.semibold), color: SL.Signal.action, background: "transparent", display: "flex", alignItems: "center", gap: 6, minHeight: SL.Space.hitMin }}
                >
                  <SLGlyph name="share" size={16} />
                  <span>Invite</span>
                </PressButton>
              </HStack>
            </ListSection>
          )}

          {url !== undefined && me && (
            <ListSection>
              <PressButton onPress={() => setShowsQR(true)} style={{ ...cellPadding, width: "100%", background: "transparent", display: "flex", alignItems: "center", gap: 16, color: SL.Ink.primary, ...slFont(SL.TypeSize.body, SL.Weight.medium), textAlign: "left" }}>
                <SFSymbol name="qrcode" size={17} />
                <span>Show my QR code</span>
              </PressButton>
            </ListSection>
          )}

          <ListSection header="Find a friend">
            <HStack style={cellPadding}>
              <span style={{ ...slFont(17), color: "rgba(235,235,245,0.3)" }}>@</span>
              <input
                value={query}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void search();
                }}
                style={{ ...slFont(17), color: SL.Ink.primary, caretColor: SL.Signal.action, background: "transparent", border: "none", outline: "none", padding: 0, flex: "1 1 0", minWidth: 0 }}
              />
              {textButton("Find", () => void search(), {}, query.length < 3 || busy)}
            </HStack>
            {found ? personRow(found, requestButton(found)) : searched ? (
              <div style={{ ...cellPadding, display: "flex", alignItems: "center" }}>
                <Text {...slMeta()} color={SL.Ink.secondary}>Nobody with that username.</Text>
              </div>
            ) : null}
          </ListSection>

          {social.incoming.length > 0 && (
            <ListSection header="Requests">
              {social.incoming.map((friendship: Friendship) => {
                const person = friendship.requester;
                if (!person) return null;
                return (
                  <div key={friendship.requester_id}>
                    {personRow(
                      person,
                      <HStack spacing={SL.Space.s2}>
                        {textButton("Decline", () => void social.remove(person.user_id).catch(() => {}), { color: SL.Ink.secondary })}
                        {pill("Accept", () => void social.accept(friendship).catch(() => {}))}
                      </HStack>,
                    )}
                  </div>
                );
              })}
            </ListSection>
          )}

          {social.outgoing.length > 0 && (
            <ListSection header="Sent">
              {social.outgoing.map((friendship: Friendship) => {
                const person = friendship.addressee;
                if (!person) return null;
                return <div key={friendship.addressee_id}>{personRow(person, textButton("Cancel", () => void social.remove(person.user_id).catch(() => {}), { color: SL.Ink.secondary }))}</div>;
              })}
            </ListSection>
          )}

          <ListSection header={social.friends.length === 0 ? "Friends" : `Friends · ${social.friends.length}`}>
            {social.friends.length === 0 && (
              <div style={{ ...cellPadding, display: "flex", alignItems: "center" }}>
                <Text {...slMeta()} color={SL.Ink.secondary}>No friends yet. Find someone by username, or send them an invite.</Text>
              </div>
            )}
            {social.friends.map((friend) => (
              <SwipeRow
                key={friend.user_id}
                actions={[
                  { title: "Remove", color: "rgb(255, 69, 58)", action: () => void social.remove(friend.user_id).catch(() => {}) },
                  { title: "Block", color: SL.Signal.loss, action: () => void social.block(friend.user_id).catch(() => {}) },
                ]}
              >
                {personRow(friend, null)}
              </SwipeRow>
            ))}
          </ListSection>
        </div>
      </ScrollView>
      <Sheet isPresented={showsQR} onDismiss={() => setShowsQR(false)}>
        {url !== undefined && me && <InviteQRSheet url={url} username={me.username} onClose={() => setShowsQR(false)} />}
      </Sheet>
    </div>
  );
}

/** A post card's shape while the feed loads. */
function FeedSkeleton({ short = false }: { short?: boolean }) {
  const reduceMotion = useReduceMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduceMotion) return;
    const animation = ref.current?.animate([{ opacity: 1 }, { opacity: 0.55 }], { duration: 900, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
    return () => animation?.cancel();
  }, [reduceMotion]);
  const bar = (width: number, height: number, fill: string, radius = 6) => <div style={{ width, height, borderRadius: radius, background: fill, flexShrink: 0 }} />;
  return (
    <div aria-hidden style={{ alignSelf: "stretch", opacity: short ? 0.6 : 1 }}>
      <div ref={ref}>
        <VStack alignment="leading" spacing={SL.Space.s4} style={{ padding: SL.Space.s4, ...listCard(SL.Radius.xl) }}>
          <HStack spacing={SL.Space.s3}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: SL.Surface.raised2 }} />
            <VStack alignment="leading" spacing={6}>
              {bar(120, 12, SL.Surface.hairlineStrong)}
              {bar(70, 10, SL.Surface.raised2)}
            </VStack>
          </HStack>
          {bar(160, 28, SL.Surface.hairlineStrong)}
          {!short && (
            <>
              <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ flex: "1 1 0", height: 34, borderRadius: 8, background: SL.Surface.raised2 }} />
                ))}
              </HStack>
              <div style={{ alignSelf: "stretch", height: 150, borderRadius: SL.Radius.lg, background: SL.Surface.raised2 }} />
              {bar(130, 40, SL.Surface.raised2, 20)}
            </>
          )}
        </VStack>
      </div>
    </div>
  );
}
