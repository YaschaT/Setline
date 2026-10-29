// PhotosHomeView.swift — Redesign 1e · Foto's.
//
// Two pictures the same size, far enough apart in time to show something, and
// what lies between them; under that, every picture in a grid. The first
// against the latest is what it opens on, and any two can be compared instead
// — over each other with a line to slide between them, or side by side.
// `Afspelen` steps through every picture, oldest first.
//
// The photos never leave the phone, which the screen says out loud rather
// than implying, and on the phone they are the signed-in account's alone
// (`AppState.photos`). On the web they live in this browser's IndexedDB
// (`PhotoFiles`), read through the core's `CheckInStore`.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CheckIn } from "../../core/Photos/CheckIn";
import { CheckInGallery, type CheckInGallery_Comparison, type CheckInGallery_Shown } from "../../core/Photos/CheckIn";
import { PhotoDate } from "../../core/Photos/PhotoDate";
import type { PhotoOwner } from "../../core/Photos/PhotoOwner";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { addDays, daysBetween } from "../../core/Support/calendar";
import { deepEqual } from "../../core/Support/swift";
import { ConfirmationDialog, FullScreenCover, HStack, ScrollView, Sheet, Spacer, Text, VStack, useAppStorage } from "../../design/swiftui";
import { SL, slFont } from "../../design/tokens";
import { slCapped } from "../../design/SLDynamicType";
import { SLOutlineButton, SLPrimaryButton, SLQuietButton, colorOpacity } from "../../design/SetlineTokens";
import { SLChip } from "../../design/components/SLChip";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLPress } from "../../design/components/SLPress";
import { SLSheet } from "../../design/components/SLSheet";
import { SLAttentionCard, SLHeaderButton, SLSectionHead, SLTabHeader, SLTabHeaderPinned } from "../../design/components/SLPieces";
import { slBody, slLead, slMeta } from "../../design/components/SLText";
import { DashedBorder, PressButton, useReduceMotion } from "../../design/support";
import { useApp } from "../../data/AppState";
import { PhotoFiles } from "../../data/PhotoFiles";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { PhotoCaptureView } from "./PhotoCaptureView";
import { PhotoThumbnail } from "./PhotoThumbnail";
import { PhotoTimelapse } from "./PhotoTimelapse";

/** A photo every two weeks: often enough to see a change, rare enough that a week's water and light do not drown it. */
const rhythmDays = 14;

type CompareMode = "overlay" | "sideBySide";

function coverBody(children: ReactNode) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
      {children}
    </div>
  );
}

/**
 * A rectangle takes the size it is offered and nothing more; the picture
 * fills it from the inside. Read small for its frame (`PhotoThumbnail`).
 */
function CheckInPicture({ url, maxPixels, style, fit = "cover" }: { url?: string; maxPixels: number; style?: CSSProperties; fit?: "cover" | "contain" }) {
  const [image, setImage] = useState<string | undefined>(undefined);
  const [looked, setLooked] = useState(false);
  useEffect(() => {
    let live = true;
    if (url === undefined) {
      setImage(undefined);
      setLooked(true);
      return;
    }
    void PhotoThumbnail.load(url, { maxPixels }).then((made) => {
      if (!live) return;
      setImage(made);
      setLooked(true);
    });
    return () => {
      live = false;
    };
  }, [url, maxPixels]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: SL.Surface.raised2, overflow: "hidden", display: "grid", placeItems: "center", ...style }}>
      {image ? (
        <img src={image} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit }} />
      ) : looked ? (
        <SLGlyph name="image" size={22} color={SL.Surface.mute} />
      ) : null}
    </div>
  );
}

export function PhotosHomeView({ onAccount = () => {} }: { onAccount?: () => void }) {
  const app = useApp();
  const reduceMotion = useReduceMotion();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  /** The check-in camera, with its guide and the last photo to line up to. */
  const [capturing, setCapturing] = useState(false);
  const [removing, setRemoving] = useState<CheckIn | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  /** Whose photos are on screen; another account signed in reads its own. */
  const shownOwner = useRef<PhotoOwner | undefined>(undefined);
  /** The two pictures chosen for the comparison, by id. Empty is the default pair: the first against the latest. */
  const [chosen, setChosen] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [viewing, setViewing] = useState<string | undefined>(undefined);
  const [lastViewed, setLastViewed] = useState<string | undefined>(undefined);
  const [playingTimeline, setPlayingTimeline] = useState(false);
  /** Over each other or side by side; remembered on this phone. */
  const [compareModeRaw, setCompareMode] = useAppStorage<string>("setline.photos.compareMode", "overlay");
  const compareMode: CompareMode = compareModeRaw === "sideBySide" ? "sideBySide" : "overlay";
  /** Holding a picture asks to remove it; the tap that ends the hold must not open it as well. */
  const heldTile = useRef(false);
  const [ghost, setGhost] = useState<string | undefined>(undefined);
  const library = useRef<HTMLInputElement>(null);

  const photos = app.photos;
  const gallery = CheckInGallery.makeCheckIns(checkIns, { metrics: app.metrics });
  const comparison = CheckInGallery.comparison(gallery, chosen[0], chosen.length > 1 ? chosen[1] : undefined);
  const url = (checkIn: CheckIn) => photos?.url({ for: checkIn });

  useEffect(() => {
    if (viewing !== undefined) setLastViewed(viewing);
  }, [viewing]);

  // `.task(id: app.photos?.owner)`.
  const ownerKey = photos ? JSON.stringify(photos.owner) : undefined;
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!photos) {
        setCheckIns([]);
        shownOwner.current = undefined;
        return;
      }
      if (shownOwner.current && deepEqual(shownOwner.current, photos.owner)) return;
      await PhotoFiles.install();
      setChosen([]);
      const loaded = await photos.load();
      if (!live) return;
      setCheckIns(loaded);
      shownOwner.current = photos.owner;
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey]);

  // The last picture, to line up against, ready when the camera opens.
  const latestURL = gallery.all.length > 0 ? url(gallery.all[gallery.all.length - 1].checkIn) : undefined;
  useEffect(() => {
    let live = true;
    if (!latestURL) {
      setGhost(undefined);
      return;
    }
    void PhotoThumbnail.load(latestURL, { maxPixels: 1400 }).then((made) => {
      if (live) setGhost(made);
    });
    return () => {
      live = false;
    };
  }, [latestURL]);

  /** "6 sep" */
  const label = (date: Date) => NumberDisplay.shortDate(app.display, date);
  /** "6 sep, 84,2 kg" */
  const caption = (shown: CheckInGallery_Shown) => [label(shown.date), shown.weightKg === undefined ? undefined : NumberDisplay.kg(app.display, shown.weightKg)].filter((s) => s !== undefined).join(", ");

  // MARK: - Adding and removing

  const keep = async (data: Uint8Array, on: Date) => {
    setFailure(undefined);
    if (!photos) return;
    await PhotoFiles.install();
    try {
      setCheckIns(await photos.add(data, { on }));
    } catch {
      setFailure("The photo couldn't be saved. Your phone may be out of space.");
    }
  };

  const add = async (file: File) => {
    setFailure(undefined);
    // Kept for the signed-in account only; nobody signed in, nowhere to keep it.
    if (!photos) return;
    let data: Uint8Array;
    try {
      data = new Uint8Array(await file.arrayBuffer());
    } catch {
      setFailure("That photo couldn't be read. Try another one.");
      return;
    }
    // Dated by when it was taken, which is what it is compared by; only a
    // picture that says nothing is dated today.
    await keep(data, PhotoDate.taken({ in: data }) ?? new Date());
  };

  const remove = async (checkIn: CheckIn) => {
    if (!photos) return;
    try {
      const target = photos.url({ for: checkIn });
      setCheckIns(await photos.remove(checkIn));
      PhotoThumbnail.forget(target);
      setChosen((list) => list.filter((id) => id !== checkIn.id));
    } catch {
      setFailure("The photo couldn't be deleted.");
    }
  };

  // MARK: - The head

  /** Training's head: the avatar to Account, the tab and how many photos, and one round button — the timelapse, once there is something to play. */
  const header = (
    <SLTabHeader
      title="Photos"
      subtitle={gallery.all.length === 1 ? "1 photo" : `${gallery.all.length} photos`}
      onAccount={onAccount}
      trailing={gallery.all.length > 1 ? <SLHeaderButton glyph="play" label="Play timelapse" action={() => setPlayingTimeline(true)} /> : undefined}
    />
  );

  // MARK: - The rhythm

  const latest = gallery.all[gallery.all.length - 1];
  const daysSinceLatest = latest ? daysBetween(latest.date, new Date()) : undefined;
  const isDue = daysSinceLatest === undefined ? true : daysSinceLatest >= rhythmDays;

  /** Weeks from the first photo to the latest — the progress on record. */
  const weeksTracked = (() => {
    const first = gallery.all[0];
    if (!first || !latest) return 0;
    return Math.trunc(daysBetween(first.date, latest.date) / 7);
  })();

  /** Photos taken on rhythm in a row, newest back: each no more than the rhythm and a few days' grace after the one before. */
  const onRhythm = (() => {
    const dates = gallery.all.map((s) => s.date);
    if (dates.length === 0) return 0;
    let count = 1;
    for (let i = dates.length - 1; i > 0; i--) {
      const gap = daysBetween(dates[i - 1], dates[i]);
      if (gap > rhythmDays + 4) break;
      count += 1;
    }
    if (daysSinceLatest !== undefined && daysSinceLatest > rhythmDays + 4) return 0;
    return count;
  })();

  const empty = gallery.all.length === 0;

  const nudge = (() => {
    const since = daysSinceLatest;
    if (since === undefined) return "Your first photo starts the record";
    if (isDue) return since === rhythmDays ? "Photo due today" : `Photo due — ${since - rhythmDays} days late`;
    const left = rhythmDays - since;
    return left === 1 ? "Next photo tomorrow" : `Next photo in ${left} days`;
  })();

  /**
   * The latest photos as Training's week marks: each one a small round
   * picture with its date, then the next check-in waiting — ringed and
   * breathing when due, dashed while not.
   */
  const photoMarks = (() => {
    const recent = gallery.all.slice(-5);
    const nextDate = latest ? addDays(latest.date, rhythmDays) : undefined;
    const due = isDue || recent.length === 0;
    return (
      <HStack spacing={0} style={{ alignSelf: "stretch", marginLeft: -SL.Space.s1, marginRight: -SL.Space.s1 }}>
        {recent.map((shown, index) => {
          const last = index === recent.length - 1;
          return (
            <SLPress key={shown.checkIn.id} scale={0.85} bounces onPress={() => setViewing(shown.checkIn.id)} aria-label={`Photo ${caption(shown)}`} style={{ flex: "1 1 0", minWidth: 0 }}>
              <VStack spacing={6} style={{ minHeight: SL.Space.hitMin, justifyContent: "center" }}>
                <div style={{ position: "relative", width: 40, height: 40, borderRadius: "50%", overflow: "hidden" }}>
                  <CheckInPicture url={url(shown.checkIn)} maxPixels={160} />
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `inset 0 0 0 ${last ? 2 : 1}px ${last ? SL.Signal.action : SL.Surface.hairlineStrong}` }} />
                </div>
                <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} numerals color={SL.Ink.secondary} lineLimit={1}>{label(shown.date)}</Text>
              </VStack>
            </SLPress>
          );
        })}
        <SLPress scale={0.85} bounces onPress={() => setCapturing(true)} aria-label={isDue ? "Add this check-in's photo" : "Add a photo"} style={{ flex: "1 1 0", minWidth: 0 }}>
          <VStack spacing={6} style={{ minHeight: SL.Space.hitMin, justifyContent: "center" }}>
            <div style={{ position: "relative", width: 40, height: 40 }}>
              {due ? (
                <>
                  <div style={{ position: "absolute", inset: -4, borderRadius: "50%", background: colorOpacity(SL.Signal.action, 0.12) }} />
                  {!reduceMotion && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        boxShadow: `inset 0 0 0 1.5px ${SL.Signal.action}`,
                        animation: "sl-photo-breathe 1.6s ease-out 0.8s infinite",
                        opacity: 0.5,
                      }}
                    />
                  )}
                  <style>{"@keyframes sl-photo-breathe { from { transform: scale(1); opacity: 0.5; } to { transform: scale(1.6); opacity: 0; } }"}</style>
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `inset 0 0 0 2px ${SL.Signal.action}`, display: "grid", placeItems: "center" }}>
                    <SLGlyph name="plus" size={14} color={SL.Signal.action} />
                  </div>
                </>
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                  <DashedBorder color={SL.Surface.mute} radius={20} dash="3 3" lineWidth={1.5} />
                  <SLGlyph name="plus" size={12} color={SL.Surface.mute} />
                </div>
              )}
            </div>
            <Text size={SL.TypeSize.micro} weight={isDue ? SL.Weight.bold : SL.Weight.regular} numerals color={isDue ? SL.Ink.primary : SL.Ink.secondary} lineLimit={1}>
              {due ? "Now" : nextDate ? label(nextDate) : "Next"}
            </Text>
          </VStack>
        </SLPress>
        {recent.length < 4 && Array.from({ length: 4 - recent.length }, (_, i) => <div key={`space${i}`} style={{ flex: "1 1 0", minHeight: 1 }} />)}
      </HStack>
    );
  })();

  /** Training's card, read for photos: the weeks on record as the number, the latest photos as its marks with the next one waiting, and the one action. */
  const hero = (
    <div
      style={{
        position: "relative",
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        padding: SL.Space.s5,
        borderRadius: 28,
        overflow: "hidden",
        background: `radial-gradient(280px circle at 100% 0%, ${colorOpacity(SL.Signal.action, empty ? 0.05 : 0.1)}, rgba(0,0,0,0)), ${SL.Surface.raised}`,
        boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${colorOpacity(SL.Surface.hairlineStrong, 0.6)}`,
      }}
    >
      <HStack alignment="bottom" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        <Text color={empty ? SL.Ink.primary : SL.Signal.action} numerals tracking={-5} lineLimit={1} lineHeight={1.2} style={{ ...slCapped(96, SL.Weight.bold, { maxScale: 1.2 }), marginTop: -13, marginBottom: -13, overflow: "visible" }}>
          {`${weeksTracked}`}
        </Text>
        <VStack alignment="leading" spacing={2} style={{ paddingBottom: 2, minWidth: 0 }}>
          <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{weeksTracked === 1 ? "week on record" : "weeks on record"}</Text>
          <Text {...slMeta(SL.Weight.semibold)} numerals color={isDue && !empty ? SL.Signal.attention : SL.Ink.secondary}>{nudge}</Text>
        </VStack>
        <Spacer minLength={0} />
      </HStack>

      <div style={{ marginTop: SL.Space.s5, display: "flex", flexDirection: "column" }}>{photoMarks}</div>

      <div aria-hidden style={{ height: SL.Metric.border, background: SL.Surface.hairline, marginLeft: -SL.Space.s5, marginRight: -SL.Space.s5, marginTop: SL.Space.s5, marginBottom: SL.Space.s5 }} />

      {onRhythm > 1 ? (
        <HStack spacing={SL.Space.s2} style={{ paddingBottom: SL.Space.s4 }}>
          <SLGlyph name="flame" size={16} color={SL.Signal.action} />
          <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>{`${onRhythm} photos on rhythm`}</Text>
          <Text {...slBody()} color={SL.Ink.secondary}>· every 2 weeks</Text>
        </HStack>
      ) : (
        <Text {...slBody()} color={SL.Ink.secondary} style={{ paddingBottom: SL.Space.s4 }}>
          Same pose, light and distance every two weeks. That's how you see what the scale doesn't.
        </Text>
      )}

      <SLPrimaryButton onPress={() => setCapturing(true)} aria-label={empty ? "Take your first photo. Opens the camera with a guide to stand in" : undefined}>
        <HStack spacing={10}>
          <SLGlyph name="camera" size={18} />
          <span>{empty ? "Take your first photo" : isDue ? "Take this check-in" : "Add a photo"}</span>
        </HStack>
      </SLPrimaryButton>

      <SLQuietButton onPress={() => library.current?.click()} style={{ marginTop: SL.Space.s1 }}>Choose from library</SLQuietButton>
      <input
        ref={library}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void add(file);
        }}
      />

      <Text {...slMeta()} color={SL.Ink.secondary} align="center" style={{ alignSelf: "stretch", marginTop: SL.Space.s1 }}>
        Photos stay on this phone. Never shared, never analysed.
      </Text>
    </div>
  );

  // MARK: - The two pictures

  /**
   * "14 weken verschil · −2,6 kg" — never more time than the two dates hold,
   * and the weight moves only where both days have a weigh-in; it is never
   * guessed. Two pictures of one day share that day's weigh-in, so there is
   * no change to state.
   */
  const between = (c: CheckInGallery_Comparison): string => {
    let span: string;
    switch (c.span.kind) {
      case "sameDay":
        return "same day";
      case "days":
        span = c.span.value === 1 ? "1 day apart" : `${c.span.value} days apart`;
        break;
      case "weeks":
        span = c.span.value === 1 ? "1 week apart" : `${c.span.value} weeks apart`;
        break;
    }
    if (c.change === undefined) return span;
    return `${span} · ${c.change === 0 ? "0" : NumberDisplay.signedDelta(app.display, c.change)} kg`;
  };

  /** Under the slider: each picture's day and weigh-in, at its own side, and the way to open it large. */
  const captionButton = (shown: CheckInGallery_Shown, tag: string, alignment: "leading" | "trailing") => (
    <PressButton
      onPress={() => setViewing(shown.checkIn.id)}
      aria-label={`Photo ${tag}, ${caption(shown)}`}
      style={{ flex: "1 1 0", minWidth: 0, minHeight: SL.Space.hitMin, background: "transparent", display: "flex", flexDirection: "column", alignItems: alignment === "leading" ? "flex-start" : "flex-end", textAlign: alignment === "leading" ? "left" : "right" }}
    >
      <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary} align={alignment}>{`${label(shown.date)} · ${tag}`}</Text>
      <Text {...slMeta()} numerals color={SL.Ink.secondary} align={alignment}>{shown.weightKg === undefined ? "no weigh-in" : NumberDisplay.kg(app.display, shown.weightKg)}</Text>
    </PressButton>
  );

  const slot = (shown: CheckInGallery_Shown, tag: string) => (
    <PressButton
      onPress={() => setViewing(shown.checkIn.id)}
      aria-label={`Photo ${tag}, ${caption(shown)}`}
      style={{ flex: "1 1 0", minWidth: 0, background: "transparent", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: SL.Space.s2, textAlign: "left" }}
    >
      <div style={{ alignSelf: "stretch", aspectRatio: "3 / 4", borderRadius: SL.Radius.lg, overflow: "hidden" }}>
        <CheckInPicture url={url(shown.checkIn)} maxPixels={900} />
      </div>
      <VStack alignment="leading" spacing={0}>
        <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary}>{`${label(shown.date)} · ${tag}`}</Text>
        <Text {...slMeta()} numerals color={SL.Ink.secondary}>{shown.weightKg === undefined ? "no weigh-in" : NumberDisplay.kg(app.display, shown.weightKg)}</Text>
      </VStack>
    </PressButton>
  );

  /** Over each other, or side by side. */
  const modeChoice = (
    <div role="group" aria-label="View" style={{ display: "flex", flexWrap: "wrap", gap: SL.Space.s2 }}>
      <SLChip title="Overlay" look={compareMode === "overlay" ? "selected" : "unselected"} action={() => setCompareMode("overlay")} />
      <SLChip title="Side by side" look={compareMode === "sideBySide" ? "selected" : "unselected"} action={() => setCompareMode("sideBySide")} />
    </div>
  );

  const comparisonSection = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <SLSectionHead title="Compare" meta={comparison ? between(comparison) : undefined} />

      {comparison ? (
        <>
          {modeChoice}
          {compareMode === "overlay" ? (
            <>
              <BeforeAfterSlider
                before={url(comparison.before.checkIn)}
                after={url(comparison.after.checkIn)}
                beforeTag={`before · ${label(comparison.before.date)}`}
                afterTag={`now · ${label(comparison.after.date)}`}
              />
              <HStack alignment="top" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
                {captionButton(comparison.before, "before", "leading")}
                {captionButton(comparison.after, "now", "trailing")}
              </HStack>
            </>
          ) : (
            <HStack alignment="top" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
              {slot(comparison.before, "before")}
              {slot(comparison.after, "now")}
            </HStack>
          )}
        </>
      ) : gallery.first ? (
        <HStack alignment="top" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          {slot(gallery.first, "before")}
          {/* The first picture keeps the shape of the pair it will be half of, rather than sprawling across the row on its own. */}
          <div style={{ flex: "1 1 0" }} />
        </HStack>
      ) : null}

      {gallery.all.length > 1 ? (
        <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingTop: SL.Space.s2 }}>
          <SLOutlineButton onPress={() => setPlayingTimeline(true)}>
            <HStack spacing={6}>
              <SLGlyph name="play" size={14} color={SL.Signal.action} />
              <span>Play</span>
            </HStack>
          </SLOutlineButton>
          {gallery.all.length > 2 && (
            <SLOutlineButton onPress={() => setChoosing(true)} aria-label="Choose other dates">
              <HStack spacing={6}>
                <span>Other dates</span>
                <SLGlyph name="chevronRight" size={14} color={SL.Ink.secondary} />
              </HStack>
            </SLOutlineButton>
          )}
        </HStack>
      ) : (
        <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>From two photos on, the comparison appears here.</Text>
      )}
    </VStack>
  );

  // MARK: - Every picture

  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const allSection = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <SLSectionHead title="All photos" meta={`${gallery.all.length}`} />
      <div style={{ alignSelf: "stretch", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: SL.Space.s2, alignItems: "start" }}>
        {/* Newest first: the one just added is the one looked for. */}
        {[...gallery.all].reverse().map((shown) => (
          <button
            key={shown.checkIn.id}
            type="button"
            className="sl-pressable"
            aria-label={`Photo ${caption(shown)}`}
            onPointerDown={() => {
              clearTimeout(holdTimer.current);
              holdTimer.current = setTimeout(() => {
                heldTile.current = true;
                setRemoving(shown.checkIn);
              }, 500);
            }}
            onPointerUp={() => clearTimeout(holdTimer.current)}
            onPointerLeave={() => clearTimeout(holdTimer.current)}
            onPointerCancel={() => clearTimeout(holdTimer.current)}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              if (heldTile.current) heldTile.current = false;
              else setViewing(shown.checkIn.id);
            }}
            style={{ background: "transparent", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, textAlign: "left", WebkitTouchCallout: "none", userSelect: "none" }}
          >
            <div style={{ alignSelf: "stretch", aspectRatio: "3 / 4", borderRadius: SL.Radius.md, overflow: "hidden" }}>
              <CheckInPicture url={url(shown.checkIn)} maxPixels={480} />
            </div>
            <Text {...slMeta()} numerals color={SL.Ink.meta}>{label(shown.date)}</Text>
          </button>
        ))}
      </div>
    </VStack>
  );

  const viewedID = viewing ?? lastViewed;
  const viewed = viewedID !== undefined ? gallery.all.find((s) => s.checkIn.id === viewedID) : undefined;

  return (
    <SLTabHeaderPinned header={header}>
      <ScrollView style={{ flex: "1 1 0" }}>
        {/* 24 between sections, 8 from a section's head to its card. */}
        <VStack alignment="leading" spacing={SL.Space.s6} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Metric.tabContentTop, paddingBottom: SL.Space.s6 }}>
          {hero}
          {failure !== undefined && (
            <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
              <SLAttentionCard title="Didn't work">
                <Text {...slBody()} lineHeight={SL.LineHeight.body} color={SL.Ink.primary}>{failure}</Text>
              </SLAttentionCard>
            </div>
          )}
          {gallery.all.length > 1 && comparisonSection}
          {gallery.all.length > 0 && allSection}
        </VStack>
      </ScrollView>

      <ConfirmationDialog
        isPresented={removing !== undefined}
        onDismiss={() => {
          setRemoving(undefined);
          heldTile.current = false;
        }}
        title="Delete this photo?"
        message="The photo is deleted from this phone."
        actions={[
          {
            title: "Delete",
            role: "destructive",
            action: () => {
              const checkIn = removing;
              if (checkIn) void remove(checkIn);
            },
          },
          { title: "Cancel", role: "cancel" },
        ]}
      />
      <Sheet isPresented={choosing} onDismiss={() => setChoosing(false)}>
        {choosing && (
          <ComparePicker
            all={gallery.all}
            initial={comparison ? [comparison.before.checkIn.id, comparison.after.checkIn.id] : []}
            url={url}
            label={label}
            onDone={(pair) => {
              setChosen(pair);
              setChoosing(false);
            }}
            onReset={() => {
              setChosen([]);
              setChoosing(false);
            }}
            onClose={() => setChoosing(false)}
          />
        )}
      </Sheet>
      <FullScreenCover isPresented={capturing} background="#000">
        {capturing &&
          coverBody(
            <PhotoCaptureView
              ghost={ghost}
              onTaken={(data) => {
                setCapturing(false);
                void keep(data, new Date());
              }}
              onClose={() => setCapturing(false)}
            />,
          )}
      </FullScreenCover>
      <FullScreenCover isPresented={playingTimeline}>
        {coverBody(<PhotoTimelapse gallery={gallery} display={app.display} url={url} onClose={() => setPlayingTimeline(false)} />)}
      </FullScreenCover>
      <FullScreenCover isPresented={viewing !== undefined}>
        {viewed &&
          coverBody(
            <PhotoViewer
              shown={viewed}
              url={url(viewed.checkIn)}
              caption={caption(viewed)}
              onRemove={() => {
                setViewing(undefined);
                void remove(viewed.checkIn);
              }}
              onClose={() => setViewing(undefined)}
            />,
          )}
      </FullScreenCover>
    </SLTabHeaderPinned>
  );
}

// MARK: - One picture, large

/** A picture at the size of the screen, with its date and weight and the one thing that can be done to it. */
function PhotoViewer({ url, caption, onRemove, onClose }: { shown: CheckInGallery_Shown; url?: string; caption: string; onRemove: () => void; onClose: () => void }) {
  const [confirms, setConfirms] = useState(false);
  const [image, setImage] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    if (url) void PhotoThumbnail.load(url, { maxPixels: 2400 }).then((made) => live && setImage(made));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <VStack spacing={SL.Space.s3} style={{ flex: "1 1 0", height: "100%", minHeight: 0, paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3, background: SL.Surface.ground, boxSizing: "border-box" }}>
      <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", flexShrink: 0 }}>
        <Text as="h2" {...slLead()} numerals color={SL.Ink.primary}>{caption}</Text>
        <Spacer minLength={SL.Space.s2} />
        <PressButton onPress={onClose} aria-label="Close" style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <SLGlyph name="close" size={16} fixed color={SL.Ink.primary} />
        </PressButton>
      </HStack>

      <div style={{ flex: "1 1 0", minHeight: 0, alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center", containerType: "size" }}>
        {image ? (
          <img src={image} alt={`Photo from ${caption}`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: SL.Radius.lg, display: "block" }} />
        ) : (
          <div style={{ aspectRatio: "3 / 4", width: "min(100cqw, 75cqh)", borderRadius: SL.Radius.lg, background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
            <SLGlyph name="image" size={22} color={SL.Surface.mute} />
          </div>
        )}
      </div>

      <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <SLOutlineButton edge={colorOpacity(SL.Signal.loss, 0.5)} onPress={() => setConfirms(true)}>Delete</SLOutlineButton>
      </div>
      <ConfirmationDialog
        isPresented={confirms}
        onDismiss={() => setConfirms(false)}
        title="Delete this photo?"
        message="The photo is deleted from this phone."
        actions={[
          { title: "Delete", role: "destructive", action: onRemove },
          { title: "Cancel", role: "cancel" },
        ]}
      />
    </VStack>
  );
}

// MARK: - Choosing the two to compare

/**
 * "Choose other dates": any two pictures, side by side. The earlier one is the
 * `voor` whichever was tapped first, so there is no wrong order to pick them in.
 */
function ComparePicker({ all, initial, url, label, onDone, onReset, onClose }: {
  all: CheckInGallery_Shown[];
  initial: string[];
  url: (checkIn: CheckIn) => string | undefined;
  label: (date: Date) => string;
  onDone: (pair: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial);

  /** Which of the two a picked picture is: the earlier one is `voor`. */
  const role = (shown: CheckInGallery_Shown): string | undefined => {
    if (!picked.includes(shown.checkIn.id)) return undefined;
    const dates = all.filter((s) => picked.includes(s.checkIn.id)).map((s) => s.date).sort((a, b) => a.getTime() - b.getTime());
    const first = dates[0];
    if (picked.length !== 2 || !first) return "chosen";
    return shown.date.getTime() === first.getTime() ? "before" : "now";
  };

  const tile = (shown: CheckInGallery_Shown) => {
    const tag = role(shown);
    return (
      <PressButton
        key={shown.checkIn.id}
        aria-pressed={tag !== undefined}
        aria-label={`Photo ${label(shown.date)}${tag === undefined ? "" : `, ${tag}`}`}
        onPress={() =>
          setPicked((list) => {
            const index = list.indexOf(shown.checkIn.id);
            if (index >= 0) return list.filter((_, i) => i !== index);
            // A third pick takes the place of the first: the newest two choices are the ones meant.
            const next = list.length === 2 ? list.slice(1) : [...list];
            next.push(shown.checkIn.id);
            return next;
          })
        }
        style={{ background: "transparent", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, textAlign: "left" }}
      >
        <div style={{ position: "relative", alignSelf: "stretch", aspectRatio: "3 / 4", borderRadius: SL.Radius.md, overflow: "hidden" }}>
          <CheckInPicture url={url(shown.checkIn)} maxPixels={480} />
          <div style={{ position: "absolute", inset: 0, borderRadius: SL.Radius.md, boxShadow: tag === undefined ? undefined : `inset 0 0 0 2px ${SL.Signal.action}` }} />
          {tag !== undefined && (
            <span
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                ...slFont(SL.TypeSize.micro, SL.Weight.semibold),
                letterSpacing: SL.TypeSize.micro * 0.06,
                color: SL.Signal.action,
                paddingLeft: SL.Space.s2,
                paddingRight: SL.Space.s2,
                minHeight: 24,
                display: "flex",
                alignItems: "center",
                borderRadius: 999,
                background: SL.Surface.ground,
              }}
            >
              {tag.toUpperCase()}
            </span>
          )}
        </div>
        <Text {...slMeta()} numerals color={tag === undefined ? SL.Ink.meta : SL.Signal.action}>{label(shown.date)}</Text>
      </PressButton>
    );
  };

  return (
    <SLSheet title="Choose comparison" subtitle={picked.length === 2 ? "2 photos chosen" : `Pick two photos · ${picked.length} chosen`} onClose={onClose}>
      <VStack alignment="leading" spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
        <div style={{ alignSelf: "stretch", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: SL.Space.s2, rowGap: SL.Space.s3, alignItems: "start" }}>
          {[...all].reverse().map(tile)}
        </div>
        <VStack spacing={SL.Space.s1} style={{ alignSelf: "stretch" }}>
          <SLPrimaryButton onPress={() => onDone(picked)} disabled={picked.length !== 2}>Compare these two</SLPrimaryButton>
          <SLQuietButton onPress={onReset}>First and latest photo</SLQuietButton>
        </VStack>
      </VStack>
    </SLSheet>
  );
}
