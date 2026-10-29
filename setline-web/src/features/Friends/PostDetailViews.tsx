// PostDetailViews.swift — the small pieces of a post, the full post with its
// comments, and someone's profile.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TogetherSection } from "./TrainedTogetherViews";
import { Medals, LiftMedal_Place } from "../../core/Progress/Medals";
import { Milestones, Milestone } from "../../core/Progress/Milestones";
import { trimmingWhitespacesAndNewlines } from "../../core/Support/nutrition";
import { ConfirmationDialog, FullScreenCover, HStack, Menu, ScrollView, Spacer, Text, VStack, type MenuEntry } from "../../design/swiftui";
import { SL, slFont, slNumerals } from "../../design/tokens";
import { slFixed } from "../../design/SLDynamicType";
import { SFSymbol } from "../../design/SFSymbol";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLMedal } from "../../design/components/SLMedal";
import { SLAvatar } from "../../design/components/SLAvatar";
import { SLBadge } from "../../design/components/SLBadge";
import { SLRowButton } from "../../design/components/SLPieces";
import { SLHairline, slBody, slLead, slMeta } from "../../design/components/SLText";
import { DashedBorder, PressButton } from "../../design/support";
import { useApp } from "../../data/AppState";
import {
  FeedPost, Friendship, PostComment, PostTrack, PostVisibility, SocialProfile, useSocial, type PostMedia,
} from "../../data/SocialStore";
import { TrackRow } from "../../data/MusicLookup";
import { ProgressView } from "./InviteViews";
import { PostCard } from "./FriendsView";

const firstWord = (name: string | undefined) => name?.split(" ").filter((s) => s !== "")[0];

// MARK: - Small pieces of a post

/** Who sees your own post, on its card. */
export function VisibilityBadge({ visibility }: { visibility: PostVisibility }) {
  return (
    <HStack
      spacing={5}
      aria-label={`Visible to: ${PostVisibility.label(visibility)}`}
      style={{
        color: SL.Ink.secondary,
        paddingLeft: SL.Space.s2 + 2,
        paddingRight: SL.Space.s2 + 2,
        paddingTop: 5,
        paddingBottom: 5,
        borderRadius: 999,
        background: SL.Surface.raised2,
        boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
        flexShrink: 0,
      }}
    >
      <SFSymbol name={visibility === "private" ? "lock.fill" : "person.2.fill"} size={10} weight={700} />
      <span style={{ ...slFont(SL.TypeSize.micro, SL.Weight.semibold), lineHeight: 1.25 }}>{PostVisibility.label(visibility)}</span>
    </HStack>
  );
}

/** A post's photos: one wide, two side by side, three or four in a grid; in the full post, a carousel. */
export function PostPhotos({ photos, carousel = false }: { photos: PostMedia[]; carousel?: boolean }) {
  const [page, setPage] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  if (carousel) {
    const dots = photos.length > 1;
    return (
      <div style={{ position: "relative", alignSelf: "stretch", aspectRatio: "4 / 5" }}>
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
          }}
          style={{ position: "absolute", inset: 0, display: "flex", overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
        >
          {photos.map((photo) => (
            <div key={photo.id} style={{ flex: "0 0 100%", height: "100%", scrollSnapAlign: "start", paddingBottom: dots ? 28 : 0, boxSizing: "border-box" }}>
              <div style={{ width: "100%", height: "100%", borderRadius: SL.Radius.lg, overflow: "hidden" }}>
                <PostPhoto path={photo.path} />
              </div>
            </div>
          ))}
        </div>
        {dots && (
          <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 8, display: "flex", justifyContent: "center", gap: 9 }}>
            {photos.map((photo, i) => (
              <div key={photo.id} style={{ width: 7, height: 7, borderRadius: "50%", background: i === page ? "#fff" : "rgba(255,255,255,0.3)" }} />
            ))}
          </div>
        )}
      </div>
    );
  }
  const shape: CSSProperties = { borderRadius: SL.Radius.lg, overflow: "hidden", alignSelf: "stretch" };
  switch (photos.length) {
    case 1:
      return (
        <div style={{ ...shape, aspectRatio: "4 / 3" }}>
          <PostPhoto path={photos[0].path} />
        </div>
      );
    case 2:
      return (
        <div style={{ ...shape, display: "flex", gap: 4 }}>
          {photos.map((p) => (
            <div key={p.id} style={{ flex: "1 1 0", minWidth: 0, aspectRatio: "4 / 5" }}>
              <PostPhoto path={p.path} />
            </div>
          ))}
        </div>
      );
    default:
      return (
        <div style={{ ...shape, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4 }}>
          {photos.slice(0, 4).map((p) => (
            <div key={p.id} style={{ aspectRatio: "1 / 1" }}>
              <PostPhoto path={p.path} />
            </div>
          ))}
        </div>
      );
  }
}

/** One photo from the private bucket, read with the account's token. */
export function PostPhoto({ path, style }: { path: string; style?: CSSProperties }) {
  const social = useSocial();
  const [image, setImage] = useState<string | undefined>(() => social.cachedImage(path));
  useEffect(() => {
    let live = true;
    void social.image(path).then((url) => {
      if (live) setImage(url);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return (
    <div role="img" aria-label="Photo" style={{ position: "relative", width: "100%", height: "100%", background: SL.Surface.hairline, overflow: "hidden", display: "grid", placeItems: "center", ...style }}>
      {image ? (
        <img src={image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <ProgressView color={SL.Ink.secondary} />
      )}
    </div>
  );
}

/** Music on a post: the cover with a preview to play in Setline, and the way to the full song. */
export function PostMusic({ tracks, full = false }: { tracks: PostTrack[]; full?: boolean }) {
  const row = (track: PostTrack, size = 48) => (
    <TrackRow id={track.id} title={track.title} artist={track.artist} url={track.url} isPlaylist={PostTrack.isPlaylist(track)} size={size} />
  );
  if (full) {
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>Music</Text>
        <div style={{ alignSelf: "stretch", background: SL.Surface.raised2, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
          {tracks.map((track, index) => (
            <div key={track.id} style={{ position: "relative", paddingLeft: SL.Space.s3, minHeight: 64, display: "flex", alignItems: "center" }}>
              {row(track)}
              {index > 0 && (
                <div style={{ position: "absolute", top: 0, left: 68, right: 0 }}>
                  <SLHairline />
                </div>
              )}
            </div>
          ))}
        </div>
      </VStack>
    );
  }
  const first = tracks[0];
  if (!first) return null;
  return (
    <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingLeft: 6, paddingTop: 6, paddingBottom: 6, background: SL.Surface.raised2, borderRadius: SL.Radius.md }}>
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex" }}>{row(first, 40)}</div>
      {tracks.length > 1 && (
        <span style={{ ...slFont(SL.TypeSize.meta, SL.Weight.semibold), color: SL.Ink.secondary, paddingRight: SL.Space.s2, flexShrink: 0 }}>{`+${tracks.length - 1}`}</span>
      )}
    </HStack>
  );
}

export interface ProfileTarget {
  id: string;
}

function BackToFriends({ onClose, label }: { onClose: () => void; label?: string }) {
  return (
    <HStack style={{ flexShrink: 0, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4 }}>
      <PressButton onPress={onClose} aria-label={label} style={{ background: "transparent", color: SL.Ink.secondary, minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", gap: 2 }}>
        <SLGlyph name="chevronLeft" size={18} />
        <Text {...slBody()} color={SL.Ink.secondary}>Friends</Text>
      </PressButton>
      <Spacer />
    </HStack>
  );
}

// MARK: - The full post

/** A post on its own, with its comments (SETLINE Social 7). */
export function PostDetailView({ postID, onClose }: { postID: string; onClose: () => void }) {
  const social = useSocial();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reportingComment, setReportingComment] = useState<PostComment | undefined>(undefined);
  const field = useRef<HTMLTextAreaElement>(null);

  const post = social.feed.find((p) => p.id === postID);

  const reload = async (post: FeedPost) => {
    setLoading(true);
    try {
      setComments(await social.comments({ for: post }));
    } catch {
      setComments([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (post) void reload(post);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  // `lineLimit(1...4)`: the field grows to four lines.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    const line = SL.TypeSize.body * 1.25;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, line), line * 4)}px`;
  }, [draft]);

  const commentRow = (comment: PostComment, post: FeedPost) => {
    const mine = comment.user_id === social.myID;
    const canDelete = mine || post.user_id === social.myID;
    const entries: MenuEntry[] = [];
    if (canDelete) {
      entries.push({
        kind: "button",
        title: "Delete comment",
        systemImage: "trash",
        role: "destructive",
        action: () => {
          void (async () => {
            try {
              await social.deleteComment(comment);
            } catch {
              /* `try?` */
            }
            setComments((list) => list.filter((c) => c.id !== comment.id));
          })();
        },
      });
    }
    if (!mine) entries.push({ kind: "button", title: "Report or block", systemImage: "exclamationmark.bubble", action: () => setReportingComment(comment) });
    return (
      <HStack key={comment.id} alignment="top" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Text color={SL.Signal.action} lineHeight={1} style={slFixed(13, SL.Weight.semibold)}>{comment.author ? SocialProfile.initial(comment.author) : "?"}</Text>
        </div>
        <VStack alignment="leading" spacing={3} style={{ flex: "1 1 0", minWidth: 0 }}>
          <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} color={SL.Ink.primary}>
            {mine ? "You" : (firstWord(comment.author?.display_name) ?? "Friend")}
            <span style={{ fontWeight: SL.Weight.regular, color: SL.Ink.secondary }}>{` · ${PostCard.when(PostComment.date(comment))}`}</span>
          </Text>
          <Text {...slBody()} color={SL.Ink.primary}>{comment.body}</Text>
        </VStack>
        <Menu
          entries={entries}
          aria-label={mine ? "Your comment options" : "Comment options"}
          style={{ width: 36, height: 36, display: "grid", placeItems: "center", flexShrink: 0 }}
          label={<SLGlyph name="more" size={16} fixed color={SL.Ink.tertiary} />}
        />
      </HStack>
    );
  };

  const commentsSection = (post: FeedPost) => (
    <VStack alignment="leading" spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
      <Text as="h3" {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{comments.length === 0 ? "Comments" : `Comments · ${comments.length}`}</Text>
      {loading ? (
        <div style={{ alignSelf: "stretch", display: "flex", justifyContent: "center" }}>
          <ProgressView color={SL.Ink.secondary} />
        </div>
      ) : comments.length === 0 ? (
        <VStack spacing={SL.Space.s2} style={{ position: "relative", alignSelf: "stretch", padding: SL.Space.s5 }}>
          <DashedBorder color={SL.Surface.hairlineStrong} radius={SL.Radius.lg} dash="4 4" />
          <SFSymbol name="bubble.left" size={22} color={SL.Ink.tertiary} />
          <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>No comments yet</Text>
          <Text {...slMeta()} color={SL.Ink.secondary}>Be the first to say well done.</Text>
        </VStack>
      ) : (
        comments.map((c) => commentRow(c, post))
      )}
    </VStack>
  );

  const composer = (post: FeedPost) => {
    const empty = trimmingWhitespacesAndNewlines(draft) === "";
    const send = () => {
      void (async () => {
        setSending(true);
        const text = draft;
        setDraft("");
        try {
          await social.addComment(text, { to: post });
          try {
            setComments(await social.comments({ for: post }));
          } catch {
            /* keep what is shown */
          }
        } catch {
          setDraft(text);
        }
        setSending(false);
      })();
    };
    return (
      <div style={{ position: "relative", flexShrink: 0, background: SL.Surface.ground }}>
        <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2 }}>
          <div style={{ flex: "1 1 0", minWidth: 0, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: 11, paddingBottom: 11, borderRadius: 22, background: SL.Surface.raised, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}` }}>
            <textarea
              ref={field}
              rows={1}
              value={draft}
              placeholder={social.offlineSince === undefined ? "Add a comment…" : "Comments wait for a connection"}
              onChange={(e) => setDraft(e.target.value)}
              style={{ ...slFont(SL.TypeSize.body, SL.Weight.regular), color: SL.Ink.primary, caretColor: SL.Signal.action, background: "transparent", border: "none", outline: "none", padding: 0, margin: 0, width: "100%", resize: "none", lineHeight: 1.25, display: "block" }}
            />
          </div>
          <PressButton
            aria-label="Send comment"
            disabled={sending || social.offlineSince !== undefined || empty}
            onPress={send}
            style={{ width: 44, height: 44, borderRadius: "50%", background: empty ? SL.Surface.hairlineStrong : SL.Signal.action, display: "grid", placeItems: "center", flexShrink: 0 }}
          >
            <SFSymbol name="arrow.up" size={16} weight={700} color={SL.Signal.onAction} />
          </PressButton>
        </HStack>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <SLHairline />
        </div>
      </div>
    );
  };

  const reportingName = firstWord(reportingComment?.author?.display_name);
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", height: "100%", minHeight: 0, background: SL.Surface.ground }}>
      <BackToFriends onClose={onClose} label="Back to Friends" />
      {post ? (
        <>
          <ScrollView style={{ flex: "1 1 0" }}>
            <VStack alignment="leading" spacing={SL.Space.s6} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s6 }}>
              <PostCard post={post} isDetail />
              {FeedPost.trainedWith(post).length > 0 && <TogetherSection post={post} />}
              {commentsSection(post)}
            </VStack>
          </ScrollView>
          {composer(post)}
        </>
      ) : (
        <div style={{ flex: "1 1 0", display: "grid", placeItems: "center" }}>
          <Text {...slBody()} color={SL.Ink.secondary}>This post is no longer here.</Text>
        </div>
      )}
      <ConfirmationDialog
        isPresented={reportingComment !== undefined}
        onDismiss={() => setReportingComment(undefined)}
        title={`${reportingName ?? "Their"}'s comment`}
        message="Setline reviews every report within 24 hours."
        actions={
          reportingComment
            ? [
                {
                  title: "Report comment",
                  role: "destructive",
                  action: () => {
                    const comment = reportingComment;
                    void social.reportComment({ comment, reason: "Reported from the app" }).catch(() => {});
                  },
                },
                {
                  title: `Block ${reportingName ?? "them"}`,
                  role: "destructive",
                  action: () => {
                    const comment = reportingComment;
                    void social.block(comment.user_id).catch(() => {});
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

// MARK: - Profile

/**
 * Someone's profile (SETLINE Social 9): who they are, their streak, their
 * medals, and the posts you can see. Someone who isn't a friend yet shows no
 * workouts — only the way to ask.
 */
export function FriendProfileView({ userID, onClose }: { userID: string; onClose: () => void }) {
  const app = useApp();
  const social = useSocial();
  const [opened, setOpened] = useState<ProfileTarget | undefined>(undefined);
  const [shownOpened, setShownOpened] = useState<ProfileTarget | undefined>(undefined);
  useEffect(() => {
    if (opened) setShownOpened(opened);
  }, [opened]);

  const isMe = userID === social.myID;
  const person: SocialProfile | undefined = isMe
    ? social.me
    : (social.friends.find((f) => f.user_id === userID) ??
      social.feed.find((p) => p.user_id === userID)?.author ??
      [...social.incoming, ...social.outgoing]
        .map((f) => Friendship.other(f, { than: social.myID }))
        .find((p): p is SocialProfile => p !== undefined && p.user_id === userID));
  const isFriend = social.friends.some((f) => f.user_id === userID);
  const isRequested = social.outgoing.some((f) => f.addressee_id === userID);
  const posts = social.feed.filter((p) => p.user_id === userID);

  const streak = isMe ? app.streak.weeks : posts.length === 0 ? 0 : Math.max(...posts.map((p) => p.streak_weeks));

  /** PRs this year: your own gold medals across every workout logged this year; for a friend, the golds on the posts you can see. */
  const [prsThisYear, setPRsThisYear] = useState(0);
  useEffect(() => {
    const year = new Date().getFullYear();
    if (isMe) {
      const thisYear = app.sessions.filter((s) => s.kind === "workout" && s.date.getFullYear() === year);
      setPRsThisYear(thisYear.reduce((n, s) => n + Medals.medals({ for: s, in: app.sessions }).filter((m) => m.place === LiftMedal_Place.gold).length, 0));
    } else {
      setPRsThisYear(posts.filter((p) => FeedPost.date(p).getFullYear() === year).flatMap((p) => p.medals).filter((m) => m.place === 1).length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length]);

  const reachedBadges = Milestones.make({ sessions: app.sessions, bestStreak: app.streak.best }).filter(Milestone.isReached);

  const friendButton = (() => {
    if (isFriend) {
      return (
        <HStack spacing={6} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 40, borderRadius: 999, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}` }}>
          <SFSymbol name="checkmark" size={13} weight={700} color={SL.Signal.action} />
          <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>Friends</Text>
        </HStack>
      );
    }
    if (isRequested) {
      return (
        <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 40, display: "flex", alignItems: "center", borderRadius: 999, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}` }}>
          Requested
        </Text>
      );
    }
    if (person) {
      return (
        <SLPrimaryButton onPress={() => void social.request(person).catch(() => {})}>Add friend</SLPrimaryButton>
      );
    }
    return null;
  })();

  const identity = (
    <VStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      <div style={{ position: "relative" }}>
        {isMe ? (
          <SLAvatar photo={app.profilePhoto} initial={app.avatarInitial} size={88} />
        ) : (
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
            <Text color={SL.Signal.action} lineHeight={1} style={slFixed(34, SL.Weight.semibold)}>{person ? SocialProfile.initial(person) : "?"}</Text>
          </div>
        )}
        {streak > 0 && (isMe || isFriend) && (
          <div
            aria-label={`${streak}-week streak`}
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              minWidth: 28,
              minHeight: 28,
              paddingLeft: 6,
              paddingRight: 6,
              borderRadius: 999,
              background: SL.Signal.action,
              boxShadow: `inset 0 0 0 3px ${SL.Surface.ground}`,
              display: "grid",
              placeItems: "center",
              boxSizing: "border-box",
            }}
          >
            <Text color={SL.Signal.onAction} lineHeight={1} style={slFixed(13, SL.Weight.bold)}>{`${streak}`}</Text>
          </div>
        )}
      </div>
      <VStack spacing={2}>
        <Text as="h2" size={26} weight={SL.Weight.bold} color={SL.Ink.primary} align="center">
          {isMe ? (person?.display_name ?? "You") : (person?.display_name ?? "Someone")}
        </Text>
        {person?.username !== undefined && <Text {...slBody()} color={SL.Ink.secondary}>{`@${person.username}`}</Text>}
      </VStack>
      {!isMe && friendButton}
    </VStack>
  );

  const statTile = (value: string, label: string) => (
    <VStack alignment="leading" spacing={4} style={{ flex: "1 1 0", minWidth: 0, padding: 14, background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
      <Text size={24} weight={SL.Weight.semibold} numerals color={SL.Ink.primary}>{value}</Text>
      <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={2}>{label}</Text>
    </VStack>
  );

  const workouts = isMe ? app.sessions.filter((s) => s.kind === "workout").length : posts.length;
  const stats = (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
      {statTile(`${streak}`, "week streak")}
      {statTile(`${workouts}`, isMe ? (workouts === 1 ? "workout" : "workouts") : workouts === 1 ? "post" : "posts")}
      {statTile(prsThisYear === 0 ? "—" : `${prsThisYear}`, "PRs this year")}
    </HStack>
  );

  /** Your badges, earned first; friends' badges are not shared. */
  const badges =
    isMe && reachedBadges.length > 0 ? (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <Text as="h3" {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>Badges</Text>
        <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
          {reachedBadges.slice(-4).map((badge) => (
            <SLBadge key={badge.id} milestone={badge} size={64} />
          ))}
          <Spacer minLength={0} />
        </HStack>
      </VStack>
    ) : null;

  const kudosAndComments = (post: FeedPost): string => {
    const k = post.kudos.length;
    const c = FeedPost.commentCount(post);
    if (k === 0 && c === 0) return "No kudos yet";
    return `${k} kudos · ${c === 1 ? "1 comment" : `${c} comments`}`;
  };

  const postTile = (post: FeedPost): ReactNode => {
    const photo = FeedPost.photos(post)[0];
    const golds = post.medals.filter((m) => m.place === 1);
    const goldPlace = golds[0] ? LiftMedal_Place.fromRawValue(golds[0].place) : undefined;
    return (
      <VStack
        alignment="leading"
        spacing={SL.Space.s2}
        style={{ alignSelf: "stretch", minHeight: 128, height: "100%", padding: 14, background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden", boxSizing: "border-box" }}
      >
        <HStack spacing={6} style={{ alignSelf: "stretch" }}>
          <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.secondary} lineLimit={1}>{`${PostCard.when(FeedPost.date(post))} · ${post.title}`}</Text>
          {isMe && FeedPost.postVisibility(post) === "private" && (
            <span aria-label="Only you" style={{ display: "flex" }}>
              <SFSymbol name="lock.fill" size={10} color={SL.Ink.secondary} />
            </span>
          )}
        </HStack>
        <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={2}>{FeedPost.displayTitle(post)}</Text>
        <Spacer minLength={0} />
        {photo ? (
          <div style={{ alignSelf: "stretch", height: 44, borderRadius: SL.Radius.sm, overflow: "hidden" }}>
            <PostPhoto path={photo.path} />
          </div>
        ) : goldPlace !== undefined ? (
          <HStack spacing={6}>
            <SLMedal place={goldPlace} size={18} />
            <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} color={SLMedal.metal(goldPlace).face}>{golds.length === 1 ? "1 gold" : `${golds.length} gold`}</Text>
          </HStack>
        ) : (
          <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.secondary}>{kudosAndComments(post)}</Text>
        )}
      </VStack>
    );
  };

  const postList = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <Text as="h3" {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>Posts</Text>
      {posts.length === 0 ? (
        <Text {...slBody()} color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
          {isMe ? "No posts yet. Finish a workout and tap Create post." : "No posts yet."}
        </Text>
      ) : (
        <div style={{ alignSelf: "stretch", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: SL.Space.s3 }}>
          {posts.map((post) => (
            <SLRowButton key={post.id} onPress={() => setOpened({ id: post.id })} style={{ borderRadius: SL.Radius.lg }}>
              {postTile(post)}
            </SLRowButton>
          ))}
        </div>
      )}
    </VStack>
  );

  const locked = (
    <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", padding: SL.Space.s5, background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.xl, overflow: "hidden" }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: SL.Signal.recoveryTint, display: "grid", placeItems: "center" }}>
        <SFSymbol name="lock.fill" size={18} weight={600} color={SL.Signal.recovery} />
      </div>
      <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>Workouts are for friends</Text>
      <Text {...slBody()} color={SL.Ink.secondary} align="center">
        {`Once ${firstWord(person?.display_name) ?? "they"} accept, you'll see each other's Friends posts, earlier ones included.`}
      </Text>
    </VStack>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", height: "100%", minHeight: 0, background: SL.Surface.ground }}>
      <BackToFriends onClose={onClose} />
      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack spacing={SL.Space.s6} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s8 }}>
          {identity}
          {isMe || isFriend ? (
            <>
              {stats}
              {badges}
              {postList}
            </>
          ) : (
            locked
          )}
        </VStack>
      </ScrollView>
      <FullScreenCover isPresented={opened !== undefined}>
        {shownOpened && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
            <PostDetailView postID={shownOpened.id} onClose={() => setOpened(undefined)} />
          </div>
        )}
      </FullScreenCover>
    </div>
  );
}

void slNumerals;
