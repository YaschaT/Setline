// PostComposerView.swift — turning a saved workout into a post, or editing
// one (SETLINE Social 2 and 8). Everything but the summary is optional: a
// good post is one tap.
//
// Web: `PhotosPicker` is a file input (images, several at once); each photo is
// resized and re-encoded in the browser (`SocialStore.preparePhoto`), which
// drops its location data as on iOS.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TrainedWithCard } from "./TrainedTogetherViews";
import type { TrainingSession } from "../../core/Domain/Model";
import { LoggedSet } from "../../core/Domain/Model";
import { Medals, LiftMedal_Place } from "../../core/Progress/Medals";
import { RecordsEngine } from "../../core/Engine/RecordsEngine";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { MusicLinks } from "../../core/Social/MusicLinks";
import { prefixChars, trimmingWhitespaces } from "../../core/Support/nutrition";
import { HStack, ScrollView, Sheet, Spacer, Text, Toggle, VStack, Alert, type Binding } from "../../design/swiftui";
import { SL, slFont, slNumerals } from "../../design/tokens";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, SLPrimaryButton, colorOpacity } from "../../design/SetlineTokens";
import { SLSheet } from "../../design/components/SLSheet";
import { SLGlyph, SLWorkoutSymbol } from "../../design/components/SLGlyph";
import { SLMedal } from "../../design/components/SLMedal";
import { SLRowButton } from "../../design/components/SLPieces";
import { SLHairline, slBody, slLead, slMeta } from "../../design/components/SLText";
import { DashedBorder, PressButton } from "../../design/support";
import { useApp } from "../../data/AppState";
import {
  DraftTrack, FeedPost, HiddenStat, PostDraft, PostVisibility, SocialStore, SocialStore_Queued, useSocial,
  type DraftPhoto, type PostMedal, type SocialStore_UploadState,
} from "../../data/SocialStore";
import { SupabaseFailure } from "../../data/SupabaseClient";
import { MusicLookup, TrackRow } from "../../data/MusicLookup";
import { ProgressView } from "./InviteViews";
import { WorkoutPlaceCard } from "./WorkoutPlaceViews";

export type PostComposerView_Mode =
  | { kind: "create"; value: TrainingSession }
  | { kind: "edit"; value: FeedPost }
  /** A rest day, with why. */
  | { kind: "rest"; value: Date };

interface Summary {
  day: string;
  date: Date;
  volumeKg: number;
  seconds?: number;
  sets: number;
  medals: PostMedal[];
  streak: number;
}

const fieldStyle: CSSProperties = {
  ...slFont(SL.TypeSize.body, SL.Weight.medium),
  color: SL.Ink.primary,
  caretColor: SL.Signal.action,
  background: "transparent",
  border: "none",
  outline: "none",
  padding: 0,
  margin: 0,
  width: "100%",
  lineHeight: 1.25,
  resize: "none",
};

/** `TextField(axis: .vertical).lineLimit(3...8)`: grows from three lines to eight, then scrolls. */
function GrowingField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const line = SL.TypeSize.body * 1.25;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, line * 3), line * 8)}px`;
  }, [value, line]);
  return <textarea ref={ref} value={value} placeholder={placeholder} rows={3} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle, display: "block", overflowY: "auto" }} />;
}

export function PostComposerView({ mode, onClose }: { mode: PostComposerView_Mode; onClose: () => void }) {
  const app = useApp();
  const social = useSocial();
  const [draft, setDraft] = useState<PostDraft>(() => {
    switch (mode.kind) {
      case "create":
        return PostDraft.make();
      case "edit":
        return PostDraft.makePost(mode.value);
      case "rest":
        return { ...PostDraft.make(), restReason: RestReason.all[0]?.label };
    }
  });
  const [choosingVisibility, setChoosingVisibility] = useState(false);
  const [addingMusic, setAddingMusic] = useState(false);
  const [posting, setPosting] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [confirmsDelete, setConfirmsDelete] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const isEditing = mode.kind === "edit";
  /** A rest-day post, new or being edited. */
  const isRest = mode.kind === "rest" ? true : mode.kind === "edit" ? FeedPost.isRest(mode.value) : false;

  useEffect(() => {
    social.clearUploads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (change: (d: PostDraft) => PostDraft) => setDraft((d) => change(d));

  // MARK: - The summary, written for you

  const summaryData = ((): Summary => {
    switch (mode.kind) {
      case "create": {
        const session = mode.value;
        const medals = Medals.medals({ for: session, in: app.sessions }).map((m) => ({ place: m.place, name: m.name, weight_kg: m.weightKg, reps: m.reps }));
        const sets = session.results.flatMap((r) => r.sets);
        return {
          day: session.dayLabel,
          date: session.date,
          volumeKg: RecordsEngine.volumeLoad(sets),
          seconds: session.durationSeconds,
          sets: sets.filter(LoggedSet.countsTowardVolume).length,
          medals,
          streak: app.streak.weeks,
        };
      }
      case "edit": {
        const post = mode.value;
        return { day: post.title, date: FeedPost.date(post), volumeKg: post.volume_kg, seconds: post.duration_seconds, sets: post.set_count, medals: post.medals, streak: post.streak_weeks };
      }
      case "rest":
        return { day: "Rest day", date: mode.value, volumeKg: 0, seconds: undefined, sets: 0, medals: [], streak: app.streak.weeks };
    }
  })();

  const defaultTitle = summaryData.day;

  // MARK: - Writing

  const post = async () => {
    setPosting(true);
    setFailure(undefined);
    const current = draftRef.current;
    try {
      switch (mode.kind) {
        case "create": {
          const medals = Medals.medals({ for: mode.value, in: app.sessions });
          await social.createPost({ from: mode.value, medals, streakWeeks: app.streak.weeks, draft: current });
          break;
        }
        case "edit":
          await social.update(mode.value, { draft: current });
          break;
        case "rest":
          await social.createRestPost({ on: mode.value, streakWeeks: app.streak.weeks, draft: current });
          break;
      }
      onClose();
    } catch (error) {
      if (error instanceof SocialStore_Queued) {
        // Offline: kept on this device and sent once the connection is back;
        // the Friends tab says so.
        onClose();
      } else if (error instanceof SupabaseFailure && error.kind === "network" && isRest) {
        setFailure("No connection. Your rest day is still here — post it when you're back online.");
      } else {
        setFailure(isEditing ? "Couldn't save your changes. Check your connection and try again — nothing was lost." : "Couldn't post just now. Try again — nothing was lost.");
      }
    } finally {
      setPosting(false);
    }
  };

  const deletePost = async () => {
    if (mode.kind !== "edit") return;
    try {
      await social.delete(mode.value);
      onClose();
    } catch {
      setFailure("Couldn't delete the post. Try again.");
    }
  };

  const addPhotos = async (files: File[]) => {
    if (files.length === 0) return;
    for (const file of files) {
      if (draftRef.current.photos.length >= PostDraft.maxPhotos) break;
      const photo = await SocialStore.preparePhoto(file);
      if (!photo) continue;
      setDraft((d) => {
        const next = d.photos.length < PostDraft.maxPhotos ? { ...d, photos: [...d.photos, photo] } : d;
        draftRef.current = next;
        return next;
      });
    }
  };

  // MARK: - Head and foot

  const header = (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <HStack style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s1, paddingBottom: SL.Space.s1 }}>
        <PressButton
          onPress={onClose}
          style={{ ...slFont(SL.TypeSize.body, SL.Weight.regular), color: SL.Ink.secondary, minWidth: 64, minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "flex-start", background: "transparent" }}
        >
          Cancel
        </PressButton>
        <Spacer />
        <Text as="h2" {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{isEditing ? "Edit post" : "New post"}</Text>
        <Spacer />
        <div style={{ width: 64, height: 1, flexShrink: 0 }} />
      </HStack>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <SLHairline />
      </div>
    </div>
  );

  const actions = (
    <VStack spacing={SL.Space.s2} style={{ flexShrink: 0, paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s2, background: SL.Surface.ground }}>
      {failure !== undefined && <Text {...slMeta()} color={SL.Signal.attention} align="center">{failure}</Text>}
      <SLPrimaryButton onPress={() => void post()} disabled={posting}>
        <HStack spacing={SL.Space.s2}>
          {posting && <ProgressView color={SL.Signal.onAction} />}
          <span>{posting ? (isEditing ? "Saving…" : "Posting…") : isEditing ? "Save changes" : "Post"}</span>
        </HStack>
      </SLPrimaryButton>
      {!isEditing && (
        <PressButton onPress={onClose} style={{ ...slFont(SL.TypeSize.body, SL.Weight.regular), color: SL.Ink.secondary, minHeight: SL.Space.hitMin, background: "transparent" }}>
          {isRest ? "Cancel" : "Save without posting"}
        </PressButton>
      )}
    </VStack>
  );

  /** A rest day: the date and why, as chips. No numbers. */
  const restSummary = (
    <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s4, background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.xl, overflow: "hidden" }}>
      <HStack spacing={SL.Space.s3}>
        <div style={{ width: 44, height: 44, borderRadius: SL.Radius.md, background: SL.Signal.recoveryTint, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <SFSymbol name="moon.zzz.fill" size={18} weight={600} color={SL.Signal.recovery} />
        </div>
        <VStack alignment="leading" spacing={2}>
          <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>Rest day</Text>
          <Text {...slMeta()} color={SL.Ink.secondary}>{NumberDisplay.shortDate(app.display, summaryData.date)}</Text>
        </VStack>
      </HStack>
      <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>Why</Text>
      <FlowLayout spacing={SL.Space.s2}>
        {RestReason.all.map((reason) => {
          const isOn = draft.restReason === reason.label;
          return (
            <PressButton
              key={reason.label}
              aria-pressed={isOn}
              onPress={() => update((d) => ({ ...d, restReason: reason.label }))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: isOn ? SL.Signal.onAction : SL.Ink.primary,
                paddingLeft: SL.Space.s3,
                paddingRight: SL.Space.s3,
                minHeight: 36,
                borderRadius: 999,
                background: isOn ? SL.Signal.recovery : SL.Surface.raised2,
              }}
            >
              <SFSymbol name={reason.symbol} size={13} weight={600} />
              <span style={slFont(SL.TypeSize.meta, SL.Weight.semibold)}>{reason.label}</span>
            </PressButton>
          );
        })}
      </FlowLayout>
      <Text {...slMeta()} color={SL.Ink.secondary}>A rest day doesn't count as a workout or for your streak.</Text>
    </VStack>
  );

  const summaryStat = (value: string, label: string, hidden: boolean) => (
    <VStack alignment="leading" spacing={1} style={{ flex: "1 1 0", minWidth: 0 }}>
      <Text size={SL.TypeSize.lead} weight={SL.Weight.semibold} numerals color={hidden ? SL.Ink.tertiary : SL.Ink.primary}>{hidden ? "Hidden" : value}</Text>
      <Text {...slMeta()} color={SL.Ink.secondary}>{label}</Text>
    </VStack>
  );

  const summary = (() => {
    const data = summaryData;
    return (
      <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s4, background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.xl, overflow: "hidden" }}>
        <HStack spacing={SL.Space.s3}>
          <div style={{ width: 44, height: 44, borderRadius: SL.Radius.md, background: SL.Signal.actionTint, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <SLWorkoutSymbol dayName={data.day} size={20} color={SL.Signal.action} />
          </div>
          <VStack alignment="leading" spacing={2}>
            <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{data.day}</Text>
            <Text {...slMeta()} color={SL.Ink.secondary}>{NumberDisplay.shortDate(app.display, data.date)}</Text>
          </VStack>
        </HStack>
        <HStack alignment="top" spacing={0} style={{ alignSelf: "stretch" }}>
          {summaryStat(NumberDisplay.volumeKg(app.display, data.volumeKg), "volume", draft.hidden.has("volume"))}
          {data.seconds !== undefined && data.seconds >= 60 && summaryStat(NumberDisplay.minutes(app.display, data.seconds), "time", draft.hidden.has("duration"))}
          {summaryStat(`${data.sets}`, "sets", false)}
        </HStack>
        {(data.medals.length > 0 || data.streak > 0) && (
          <FlowChips medals={data.medals} streak={data.streak} hideWeights={draft.hidden.has("weights")} display={app.display} />
        )}
      </VStack>
    );
  })();

  // MARK: - Fields

  const field = (label: string, content: ReactNode) => (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>{label}</Text>
      <div
        style={{
          alignSelf: "stretch",
          paddingLeft: 14,
          paddingRight: 14,
          paddingTop: 13,
          paddingBottom: 13,
          background: SL.Surface.raised,
          borderRadius: SL.Radius.md,
          boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
        }}
      >
        {content}
      </div>
    </VStack>
  );

  // MARK: - Photos

  const photos = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <HStack style={{ alignSelf: "stretch" }}>
        <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>Photos</Text>
        <Spacer />
        <Text {...slMeta()} numerals color={SL.Ink.secondary}>{`${draft.photos.length} of ${PostDraft.maxPhotos}`}</Text>
      </HStack>
      <div style={{ alignSelf: "stretch", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: SL.Space.s2 }}>
        {draft.photos.map((photo) => (
          <DraftPhotoTile
            key={photo.id}
            photo={photo}
            state={social.uploads[photo.id]}
            onRetry={() => void post()}
            onRemove={() => update((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== photo.id) }))}
          />
        ))}
        {draft.photos.length < PostDraft.maxPhotos && (
          <PressButton aria-label="Add photos" onPress={() => picker.current?.click()} style={{ position: "relative", aspectRatio: "4 / 5", width: "100%", background: "transparent", display: "grid", placeItems: "center" }}>
            <DashedBorder color={colorOpacity(SL.Ink.secondary, 0.4)} radius={SL.Radius.md} dash="4 4" />
            <SLGlyph name="plus" size={20} fixed color={SL.Ink.secondary} />
          </PressButton>
        )}
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].slice(0, PostDraft.maxPhotos - draft.photos.length);
          e.target.value = "";
          void addPhotos(files);
        }}
      />
      {draft.photos.some((p) => social.uploads[p.id] === "failed") ? (
        <Text {...slMeta()} color={SL.Signal.attention}>A photo didn't upload. Tap it to try again, or remove it and post without it.</Text>
      ) : (
        <Text {...slMeta()} color={SL.Ink.secondary}>Location data is removed from photos before they leave your phone.</Text>
      )}
    </VStack>
  );

  // MARK: - Music

  const musicLine = (() => {
    const songs = draft.tracks.filter((t) => t.kind === "song").length;
    const playlist = draft.tracks.find((t) => t.kind === "playlist");
    const parts: string[] = [];
    if (songs > 0) parts.push(songs === 1 ? "1 song" : `${songs} songs`);
    if (playlist) parts.push(playlist.title);
    return parts.join(" · ");
  })();

  const listCard: CSSProperties = { alignSelf: "stretch", background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" };

  const attachments = (
    <div style={{ ...listCard, display: "flex", flexDirection: "column" }}>
      <SLRowButton onPress={() => setAddingMusic(true)}>
        <RowLabel symbol="music.note" lit={draft.tracks.length > 0} title="Music" detail={draft.tracks.length === 0 ? "Optional · what kept you going" : musicLine} />
      </SLRowButton>
    </div>
  );

  // MARK: - Hidden numbers, visibility

  const hiddenStats = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>Hide from this post</Text>
      <div style={{ ...listCard, display: "flex", flexDirection: "column" }}>
        {HiddenStat.allCases.map((stat, index) => (
          <div key={stat} style={{ position: "relative" }}>
            <Toggle
              isOn={draft.hidden.has(stat)}
              onChange={(on) =>
                update((d) => {
                  const hidden = new Set(d.hidden);
                  if (on) hidden.add(stat);
                  else hidden.delete(stat);
                  return { ...d, hidden };
                })
              }
              label={<Text {...slBody()} color={SL.Ink.primary}>{HiddenStat.label(stat)}</Text>}
              style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 52 }}
            />
            {index > 0 && (
              <div style={{ position: "absolute", top: 0, left: SL.Space.s4, right: 0 }}>
                <SLHairline />
              </div>
            )}
          </div>
        ))}
      </div>
    </VStack>
  );

  const visibilityRow = (
    <div style={{ ...listCard, display: "flex", flexDirection: "column" }}>
      <SLRowButton onPress={() => setChoosingVisibility(true)}>
        <RowLabel
          symbol={draft.visibility === "private" ? "lock.fill" : "person.2.fill"}
          lit={false}
          title="Who can see this"
          detail={draft.visibility === "friends" && social.friends.length === 0 ? "Friends · only you for now" : PostVisibility.label(draft.visibility)}
        />
      </SLRowButton>
    </div>
  );

  const deleteButton = (
    <SLOutlineButton edge={colorOpacity(SL.Signal.loss, 0.5)} onPress={() => setConfirmsDelete(true)} style={{ color: SL.Signal.loss }}>
      Delete post
    </SLOutlineButton>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", background: SL.Surface.ground }}>
      {header}
      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack
          alignment="leading"
          spacing={SL.Space.s6}
          style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s5, paddingBottom: SL.Space.s8 }}
        >
          {isRest ? (
            restSummary
          ) : (
            <>
              {summary}
              <WorkoutPlaceCard place={{ value: draft.place, set: (place) => update((d) => ({ ...d, place })) }} />
              <TrainedWithCard participants={{ value: draft.participants, set: (participants) => update((d) => ({ ...d, participants })) }} />
            </>
          )}
          {field(
            "Title",
            <input
              value={draft.title}
              placeholder={defaultTitle}
              autoCapitalize="sentences"
              enterKeyHint="done"
              onChange={(e) => {
                const title = e.target.value;
                update((d) => ({ ...d, title }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              style={fieldStyle}
            />,
          )}
          {field(
            "Notes",
            <GrowingField
              value={draft.notes}
              placeholder={isRest ? "Why are you resting today?" : "How did it go?"}
              onChange={(notes) => update((d) => ({ ...d, notes }))}
            />,
          )}
          {photos}
          {!isRest && (
            <>
              {attachments}
              {hiddenStats}
            </>
          )}
          {visibilityRow}
          {isEditing && deleteButton}
        </VStack>
      </ScrollView>
      {actions}

      <Sheet isPresented={choosingVisibility} onDismiss={() => setChoosingVisibility(false)}>
        <VisibilitySheet
          selection={{ value: draft.visibility, set: (visibility) => update((d) => ({ ...d, visibility })) }}
          friendCount={social.friends.length}
          onClose={() => setChoosingVisibility(false)}
        />
      </Sheet>
      <Sheet isPresented={addingMusic} onDismiss={() => setAddingMusic(false)}>
        <MusicSheet tracks={{ value: draft.tracks, set: (tracks) => update((d) => ({ ...d, tracks })) }} onClose={() => setAddingMusic(false)} />
      </Sheet>
      <Alert
        isPresented={confirmsDelete}
        onDismiss={() => setConfirmsDelete(false)}
        title="Delete this post?"
        message="Its photos, comments and kudos are removed for everyone. Your workout stays in your log."
        actions={[
          { title: "Cancel", role: "cancel" },
          { title: "Delete", role: "destructive", action: () => void deletePost() },
        ]}
      />
    </div>
  );
}

function RowLabel({ symbol, lit, title, detail }: { symbol: string; lit: boolean; title: string; detail: string }) {
  return (
    <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 60 }}>
      <div style={{ width: 24, display: "flex", justifyContent: "center", flexShrink: 0 }}>
        <SFSymbol name={symbol} size={16} weight={600} color={lit ? SL.Signal.action : SL.Ink.secondary} />
      </div>
      <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary}>{title}</Text>
        <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1}>{detail}</Text>
      </VStack>
      <Spacer minLength={SL.Space.s2} />
      <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
    </HStack>
  );
}

// MARK: - Pieces

/** Medal and streak chips under the summary. */
function FlowChips({ medals, streak, hideWeights, display }: { medals: PostMedal[]; streak: number; hideWeights: boolean; display: NumberDisplay }) {
  return (
    <VStack alignment="leading" spacing={SL.Space.s2}>
      {medals.slice(0, 3).map((medal, offset) => {
        const place = LiftMedal_Place.fromRawValue(medal.place);
        if (place === undefined) return null;
        const title = LiftMedal_Place.title(place);
        return (
          <HStack key={offset} spacing={SL.Space.s2} style={{ minWidth: 0 }}>
            <SLMedal place={place} size={22} />
            <Text {...slMeta(SL.Weight.semibold)} numerals color={SLMedal.metal(place).face} lineLimit={1}>
              {hideWeights ? `${title} · ${medal.name}` : `${title} · ${medal.name} ${NumberDisplay.kg(display, medal.weight_kg)} × ${medal.reps}`}
            </Text>
          </HStack>
        );
      })}
      {streak > 0 && (
        <Text
          {...slMeta(SL.Weight.semibold)}
          color={SL.Signal.action}
          style={{ paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, paddingTop: 5, paddingBottom: 5, background: SL.Signal.actionTint, borderRadius: 999 }}
        >
          {streak === 1 ? "1-week streak" : `${streak}-week streak`}
        </Text>
      )}
    </VStack>
  );
}

/** A photo on the draft, new or already posted, with its remove button. */
function DraftPhotoTile({ photo, state, onRetry = () => {}, onRemove }: { photo: DraftPhoto; state?: SocialStore_UploadState; onRetry?: () => void; onRemove: () => void }) {
  const social = useSocial();
  const [loaded, setLoaded] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    let made: string | undefined;
    if (photo.jpeg) {
      made = URL.createObjectURL(photo.jpeg);
      setLoaded(made);
    } else if (photo.existing?.path) {
      void social.image(photo.existing.path).then((url) => {
        if (live) setLoaded(url);
      });
    }
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id]);
  const cover: CSSProperties = { position: "absolute", inset: 0, borderRadius: SL.Radius.md };
  return (
    <div style={{ position: "relative", aspectRatio: "4 / 5", width: "100%" }}>
      <div style={{ ...cover, background: SL.Surface.hairline, overflow: "hidden" }}>
        {loaded && <img src={loaded} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      </div>
      {(state === "waiting" || state === "uploading") && (
        <div aria-label="Uploading photo" style={{ ...cover, background: colorOpacity(SL.Surface.ground, 0.55), display: "grid", placeItems: "center" }}>
          <ProgressView color={SL.Ink.primary} />
        </div>
      )}
      {state === "failed" && (
        <PressButton aria-label="Photo didn't upload, retry" onPress={onRetry} style={{ ...cover, background: colorOpacity(SL.Surface.ground, 0.6), boxShadow: `inset 0 0 0 1.5px ${colorOpacity(SL.Signal.attention, 0.7)}`, display: "grid", placeItems: "center", color: SL.Signal.attention }}>
          <VStack spacing={4}>
            <SFSymbol name="arrow.clockwise" size={16} weight={700} />
            <span style={slFont(SL.TypeSize.micro, SL.Weight.semibold)}>Retry</span>
          </VStack>
        </PressButton>
      )}
      <PressButton aria-label="Remove photo" onPress={onRemove} style={{ position: "absolute", top: 0, right: 0, width: 36, height: 36, display: "grid", placeItems: "center", background: "transparent" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: colorOpacity(SL.Surface.ground, 0.8), display: "grid", placeItems: "center" }}>
          <SFSymbol name="xmark" size={11} weight={700} color={SL.Ink.primary} />
        </div>
      </PressButton>
    </div>
  );
}

// MARK: - Who can see this

export function VisibilitySheet({ selection, friendCount, onClose }: { selection: Binding<PostVisibility>; friendCount: number; onClose: () => void }) {
  const option = (value: PostVisibility, symbol: string, detail: string) => {
    const isOn = selection.value === value;
    return (
      <PressButton
        aria-pressed={isOn}
        onPress={() => selection.set(value)}
        style={{
          alignSelf: "stretch",
          width: "100%",
          textAlign: "left",
          padding: SL.Space.s3,
          background: SL.Surface.raised2,
          borderRadius: SL.Radius.lg,
          boxShadow: `inset 0 0 0 1px ${isOn ? SL.Surface.selection : SL.Surface.hairline}`,
        }}
      >
        <HStack spacing={SL.Space.s3}>
          <div style={{ width: 40, height: 40, borderRadius: SL.Radius.md, background: isOn ? SL.Signal.actionTint : SL.Surface.raised, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <SFSymbol name={symbol} size={16} weight={600} color={isOn ? SL.Signal.action : SL.Ink.secondary} />
          </div>
          <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
            <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{PostVisibility.label(value)}</Text>
            <Text {...slMeta()} color={SL.Ink.secondary}>{detail}</Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
          <SFSymbol name={isOn ? "checkmark.circle.fill" : "circle"} size={22} color={isOn ? SL.Signal.action : SL.Ink.tertiary} />
        </HStack>
      </PressButton>
    );
  };
  return (
    <SLSheet title="Who can see this?" subtitle="You can change it after posting" onClose={onClose}>
      <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        {option("private", "lock.fill", "A private diary entry. Never shown to anyone.")}
        {option("friends", "person.2.fill", "You and friends you accept — including friends you add later.")}
        <div role="img" aria-label="Public, coming later" style={{ position: "relative", alignSelf: "stretch", padding: SL.Space.s3 }}>
          <DashedBorder color={SL.Surface.hairlineStrong} radius={SL.Radius.lg} dash="4 4" />
          <HStack spacing={SL.Space.s3}>
            <div style={{ width: 40, height: 40, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <SFSymbol name="globe" size={16} weight={600} color={SL.Ink.tertiary} />
            </div>
            <VStack alignment="leading" spacing={2}>
              <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.tertiary}>Public</Text>
              <Text {...slMeta()} color={SL.Ink.tertiary}>Coming later</Text>
            </VStack>
            <Spacer />
          </HStack>
        </div>

        {selection.value === "friends" && friendCount === 0 && (
          <HStack alignment="top" spacing={SL.Space.s2} style={{ alignSelf: "stretch", padding: SL.Space.s3, background: SL.Signal.recoveryTint, borderRadius: SL.Radius.md }}>
            <SFSymbol name="info.circle" size={17} color={SL.Signal.recovery} />
            <Text {...slMeta()} color={colorOpacity(SL.Ink.primary, 0.85)}>
              You have no friends on Setline yet, so for now only you will see this. Invite someone and they'll see your Friends posts too.
            </Text>
          </HStack>
        )}

        <SLPrimaryButton onPress={onClose} style={{ marginTop: SL.Space.s2 }}>Done</SLPrimaryButton>
      </VStack>
    </SLSheet>
  );
}

// MARK: - Music

const urlHostOf = (text: string): string | undefined => {
  try {
    return new URL(text).host || undefined;
  } catch {
    return undefined;
  }
};

/**
 * Songs by hand or as a Spotify link, or one playlist link from any service.
 * A link fills in the title, artist and cover; a preview plays right here.
 * No account connection.
 */
export function MusicSheet({ tracks, onClose }: { tracks: Binding<DraftTrack[]>; onClose: () => void }) {
  const [song, setSong] = useState("");
  const [link, setLink] = useState("");
  const [reading, setReading] = useState(false);
  const [linkNote, setLinkNote] = useState<string | undefined>(undefined);
  // The binding's latest list, for work that finishes after a render.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const setTracks = (change: (list: DraftTrack[]) => DraftTrack[]) => {
    const next = change(tracksRef.current.value);
    tracksRef.current = { ...tracksRef.current, value: next };
    tracks.set(next);
  };

  const songs = tracks.value.filter((t) => t.kind === "song");
  const playlist = tracks.value.find((t) => t.kind === "playlist");

  // `.onAppear { link = playlist?.url ?? "" }`, which `.onChange(of: link)` answers like any edit.
  useEffect(() => {
    const url = playlist?.url ?? "";
    setLink(url);
    if (url !== "") setPlaylist(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canAddSong = trimmingWhitespaces(song) !== "" && songs.length < PostDraft.maxSongs;

  /** "Till I Collapse – Eminem" → title and artist; a Spotify link is read for its title, artist and cover. */
  const addSong = () => {
    if (!canAddSong) return;
    const typed = trimmingWhitespaces(song);
    if (MusicLinks.spotify(typed) !== undefined) {
      setReading(true);
      setLinkNote(undefined);
      void (async () => {
        const info = await MusicLookup.shared.link(typed);
        setReading(false);
        if (!info) {
          setLinkNote("Couldn't read that link. Type the song as Song – Artist instead.");
          return;
        }
        if (info.kind === "playlist" || info.kind === "artist") {
          setLink(info.url);
          setPlaylist(info.url);
          setSong("");
          return;
        }
        setTracks((list) => {
          const index = list.findIndex((t) => t.kind === "playlist");
          const insertAt = index >= 0 ? index : list.length;
          const next = [...list];
          next.splice(insertAt, 0, DraftTrack.make({ kind: "song", title: prefixChars(info.title, 120), artist: info.artist === undefined ? undefined : prefixChars(info.artist, 120), url: info.url }));
          return next;
        });
        setSong("");
      })();
      return;
    }
    const parts = song
      .split(/[–-]/)
      .filter((s) => s !== "")
      .map(trimmingWhitespaces);
    const title = parts[0] ?? song;
    const artist = parts.length > 1 ? parts.slice(1).join(" – ") : undefined;
    setTracks((list) => {
      const index = list.findIndex((t) => t.kind === "playlist");
      const insertAt = index >= 0 ? index : list.length;
      const next = [...list];
      next.splice(insertAt, 0, DraftTrack.make({ kind: "song", title: prefixChars(title, 120), artist }));
      return next;
    });
    setSong("");
  };

  /** A pasted link becomes the post's one playlist, named by its service. */
  const setPlaylist = (value: string) => {
    setTracks((list) => list.filter((t) => t.kind !== "playlist"));
    let text = trimmingWhitespaces(value);
    if (text === "") return;
    if (!text.startsWith("http")) text = "https://" + text;
    const host = text.startsWith("https://") ? urlHostOf(text) : undefined;
    if (host === undefined) return;
    if (MusicLinks.spotify(text) !== undefined) {
      // The playlist's own name, once Spotify says it.
      const draft = DraftTrack.make({ kind: "playlist", title: "Spotify playlist", artist: undefined, url: text });
      setTracks((list) => [...list, draft]);
      void (async () => {
        const info = await MusicLookup.shared.link(text);
        if (!info) return;
        setTracks((list) => {
          if (!list.some((t) => t.id === draft.id)) return list;
          return list.map((t) => (t.id === draft.id ? { ...t, title: prefixChars(info.title, 120), url: info.url } : t));
        });
      })();
      return;
    }
    const service = host.includes("spotify")
      ? "Spotify playlist"
      : host.includes("music.apple")
        ? "Apple Music playlist"
        : host.includes("youtube")
          ? "YouTube playlist"
          : host.includes("soundcloud")
            ? "SoundCloud playlist"
            : "Playlist";
    setTracks((list) => [...list, DraftTrack.make({ kind: "playlist", title: service, artist: undefined, url: text })]);
  };

  const inputStyle: CSSProperties = {
    ...slFont(SL.TypeSize.body, SL.Weight.medium),
    color: SL.Ink.primary,
    caretColor: SL.Signal.action,
    paddingLeft: 14,
    paddingRight: 14,
    minHeight: 48,
    background: SL.Surface.ground,
    border: "none",
    borderRadius: SL.Radius.md,
    boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
    outline: "none",
    width: "100%",
    minWidth: 0,
  };

  return (
    <SLSheet title="Add music" subtitle={`What kept you going? Up to ${PostDraft.maxSongs} songs.`} onClose={onClose}>
      <VStack alignment="leading" spacing={SL.Space.s5} style={{ alignSelf: "stretch" }}>
        {songs.length > 0 && (
          <div style={{ alignSelf: "stretch", background: SL.Surface.raised2, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
            {songs.map((track, index) => (
              <div key={track.id} style={{ position: "relative" }}>
                <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s3, minHeight: 60 }}>
                  <div style={{ flex: "1 1 0", minWidth: 0, display: "flex" }}>
                    <TrackRow id={track.id} title={track.title} artist={track.artist} url={track.url} isPlaylist={false} size={44} showsLink={false} />
                  </div>
                  <PressButton
                    aria-label={`Remove ${track.title}`}
                    onPress={() => setTracks((list) => list.filter((t) => t.id !== track.id))}
                    style={{ width: 44, height: 44, display: "grid", placeItems: "center", background: "transparent", flexShrink: 0 }}
                  >
                    <SFSymbol name="xmark" color={SL.Ink.secondary} />
                  </PressButton>
                </HStack>
                {index > 0 && (
                  <div style={{ position: "absolute", top: 0, left: 68, right: 0 }}>
                    <SLHairline />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>Add a song</Text>
          <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
            <input
              value={song}
              placeholder="Paste a Spotify link, or Song – Artist"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              onChange={(e) => setSong(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSong();
              }}
              style={{ ...inputStyle, flex: "1 1 0" }}
            />
            <PressButton
              onPress={addSong}
              disabled={!canAddSong}
              style={{
                ...slFont(SL.TypeSize.body, SL.Weight.semibold),
                color: canAddSong ? SL.Ink.primary : SL.Ink.tertiary,
                minWidth: 60,
                minHeight: 48,
                borderRadius: SL.Radius.md,
                boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
                background: "transparent",
                flexShrink: 0,
              }}
            >
              Add
            </PressButton>
          </HStack>
          {reading ? (
            <HStack spacing={SL.Space.s2}>
              <ProgressView color={SL.Ink.secondary} />
              <Text {...slMeta()} color={SL.Ink.secondary}>Reading the link…</Text>
            </HStack>
          ) : (
            linkNote !== undefined && <Text {...slMeta()} color={SL.Signal.attention}>{linkNote}</Text>
          )}
          {songs.length >= PostDraft.maxSongs && <Text {...slMeta()} color={SL.Ink.secondary}>That's 5 — the post shows the first ones.</Text>}
        </VStack>

        <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>Or share a playlist link</Text>
          <input
            value={link}
            placeholder="https://…"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setLink(e.target.value);
              setPlaylist(e.target.value);
            }}
            style={inputStyle}
          />
          {playlist && <TrackRow id={playlist.id} title={playlist.title} url={playlist.url} isPlaylist size={44} showsLink={false} />}
        </VStack>

        <Text {...slMeta()} color={SL.Ink.secondary}>
          Friends see the cover and can play a 30-second preview in Setline, or open the song in Spotify. Setline doesn't connect to your Spotify or Apple Music account.
        </Text>

        <SLPrimaryButton onPress={onClose}>Done</SLPrimaryButton>
      </VStack>
    </SLSheet>
  );
}

/** Why a rest day happened. */
export interface RestReason {
  label: string;
  symbol: string;
}

export const RestReason = {
  all: [
    { label: "Planned rest", symbol: "calendar" },
    { label: "Sore", symbol: "bandage" },
    { label: "Sick", symbol: "thermometer.medium" },
    { label: "Busy", symbol: "briefcase" },
    { label: "Travelling", symbol: "airplane" },
    { label: "Active recovery", symbol: "figure.walk" },
  ] as RestReason[],

  symbol(a: { for?: string }): string {
    return RestReason.all.find((r) => r.label === a.for)?.symbol ?? "moon.zzz.fill";
  },
};

/** Lays chips out in rows, wrapping when the row is full. */
export function FlowLayout({ spacing = 8, children, style }: { spacing?: number; children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: spacing, ...style }}>{children}</div>;
}

void slNumerals;
