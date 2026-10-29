// PhotoTimelapse.swift — every picture, oldest first, one after the other:
// the change the comparison shows in two steps, in all of them. Played slow
// or fast, over every picture or the last stretch of them, and stopped
// anywhere on the way — each picture says how long after the first one it
// was taken.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CheckInGallery, type CheckIn, type CheckInGallery_Frame, type CheckInGallery_Period } from "../../core/Photos/CheckIn";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { rounded } from "../../core/Support/swift";
import { HStack, Spacer, Text, VStack } from "../../design/swiftui";
import { SL } from "../../design/tokens";
import { slFixed } from "../../design/SLDynamicType";
import { SFSymbol } from "../../design/SFSymbol";
import { SLChip } from "../../design/components/SLChip";
import { SLGlyph } from "../../design/components/SLGlyph";
import { slMeta, slTitle } from "../../design/components/SLText";
import { PressButton, useReduceMotion } from "../../design/support";
import { PhotoThumbnail } from "./PhotoThumbnail";

/** `Slider(value:in:step:)` with `.tint(SL.Signal.action)`: the iOS track and its white knob. */
export function IOSSlider({ value, onChange, min, max, step, "aria-label": label, "aria-valuetext": valueText }: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  "aria-label"?: string;
  "aria-valuetext"?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const span = Math.max(max - min, 1e-9);
  const fraction = Math.min(Math.max((value - min) / span, 0), 1);
  const set = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return;
    const knob = 27;
    const f = Math.min(Math.max((clientX - rect.left - knob / 2) / Math.max(rect.width - knob, 1), 0), 1);
    let v = min + f * span;
    if (step) v = min + Math.round((v - min) / step) * step;
    onChange(v);
  };
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e.clientX);
      }}
      onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientX);
      }}
      onKeyDown={(e: KeyboardEvent) => {
        const delta = step ?? span / 10;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(max, value + delta));
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(min, value - delta));
      }}
      style={{ position: "relative", flex: "1 1 0", minWidth: 0, alignSelf: "stretch", height: 34, touchAction: "none", cursor: "pointer" }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: 15, height: 4, borderRadius: 2, background: "rgba(120,120,128,0.32)" }} />
      <div style={{ position: "absolute", left: 0, top: 15, height: 4, borderRadius: 2, background: SL.Signal.action, width: `calc(13.5px + (100% - 27px) * ${fraction})` }} />
      <div
        style={{
          position: "absolute",
          top: 3.5,
          left: `calc((100% - 27px) * ${fraction})`,
          width: 27,
          height: 27,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16), 0 3px 1px rgba(0,0,0,0.1)",
        }}
      />
    </div>
  );
}

/** The player's pictures, read small and kept only for a while — a year of weekly photos never sits decoded all at once. */
export class TimelapseImages {
  private cache = new Map<string, string>();

  /** The picture, read now if it is not already at hand. */
  async load(checkIn: CheckIn, a: { from?: string }): Promise<string | undefined> {
    const known = this.cache.get(checkIn.id);
    if (known) return known;
    if (a.from === undefined) return undefined;
    const image = await PhotoThumbnail.load(a.from, { maxPixels: 1200 });
    if (image) {
      this.cache.set(checkIn.id, image);
      if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value as string);
    }
    return image;
  }
}

export function PhotoTimelapse({ gallery, display, url, onClose }: { gallery: CheckInGallery; display: NumberDisplay; url: (checkIn: CheckIn) => string | undefined; onClose: () => void }) {
  const reduceMotion = useReduceMotion();
  const [period, setPeriod] = useState<CheckInGallery_Period>("all");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** 0 is slow, 1 is fast. */
  const [speed, setSpeed] = useState(0.35);
  /** The picture on screen, kept until the next one is ready, so stepping faster than pictures can be read never flashes an empty frame. */
  const [shown, setShown] = useState<{ id: string; image: string } | undefined>(undefined);
  const [previous, setPrevious] = useState<{ id: string; image: string } | undefined>(undefined);
  const images = useRef(new TimelapseImages()).current;

  const frames = CheckInGallery.frames(gallery, { in: period });
  const periods = CheckInGallery.periods(gallery);
  const frame: CheckInGallery_Frame | undefined = index >= 0 && index < frames.length ? frames[index] : frames[frames.length - 1];

  /** From 1,6 s a picture at its slowest to 0,12 s at its fastest, each step along the slider the same felt change. */
  const interval = 1.6 * Math.pow(0.12 / 1.6, speed);

  const latest = useRef({ frames, index, playing, interval });
  latest.current = { frames, index, playing, interval };

  const firstPeriod = useRef(true);
  useEffect(() => {
    if (firstPeriod.current) {
      firstPeriod.current = false;
      return;
    }
    setIndex(0);
  }, [period]);

  // `.task(id: frame?.shown.checkIn.id)`: the current picture, faded in.
  const frameID = frame?.shown.checkIn.id;
  useEffect(() => {
    let cancelled = false;
    if (!frame) {
      setShown(undefined);
      return;
    }
    const checkIn = frame.shown.checkIn;
    void images.load(checkIn, { from: url(checkIn) }).then((image) => {
      if (cancelled || !image) return;
      setShown((current) => {
        setPrevious(current);
        return { id: checkIn.id, image };
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameID]);

  /**
   * Steps on while playing: the next picture read before it is due, then
   * shown when its time comes. At the last picture it stops there — the
   * latest is what it was played to see — and plays from the start again
   * when asked.
   */
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    void (async () => {
      while (!cancelled && latest.current.playing) {
        const { frames: list, index: at } = latest.current;
        const next = at + 1;
        if (next >= list.length) {
          setPlaying(false);
          return;
        }
        const started = Date.now();
        await images.load(list[next].shown.checkIn, { from: url(list[next].shown.checkIn) });
        // And the one after, while this one is on screen.
        if (next + 1 < list.length) {
          const after = list[next + 1].shown.checkIn;
          void images.load(after, { from: url(after) });
        }
        const wait = latest.current.interval - (Date.now() - started) / 1000;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait * 1000));
        if (cancelled || !latest.current.playing) return;
        latest.current = { ...latest.current, index: next };
        setIndex(next);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, period]);

  /** "12 opnames over 14 weken" */
  const summary = (() => {
    const count = frames.length === 1 ? "1 photo" : `${frames.length} photos`;
    const last = frames[frames.length - 1];
    if (!last) return count;
    switch (last.since.kind) {
      case "sameDay":
        return `${count} on one day`;
      case "days":
        return `${count} over ${last.since.value === 1 ? "1 day" : `${last.since.value} days`}`;
      case "weeks":
        return `${count} over ${last.since.value === 1 ? "1 week" : `${last.since.value} weeks`}`;
    }
  })();

  const name = (p: CheckInGallery_Period): string => {
    switch (p) {
      case "all":
        return "All";
      case "year":
        return "1 year";
      case "halfYear":
        return "6 months";
      case "quarter":
        return "3 months";
      case "month":
        return "1 month";
    }
  };

  /** "6 okt 2026" */
  const date = (d: Date) => `${NumberDisplay.shortDate(display, d)} ${d.getFullYear()}`;

  /** "start · 84,2 kg", "na 14 weken · 81,6 kg" */
  const detail = (f: CheckInGallery_Frame): string => {
    let when: string;
    switch (f.since.kind) {
      case "sameDay":
        when = f.shown.checkIn.id === frames[0]?.shown.checkIn.id ? "start" : "same day";
        break;
      case "days":
        when = f.since.value === 1 ? "after 1 day" : `after ${f.since.value} days`;
        break;
      case "weeks":
        when = f.since.value === 1 ? "after 1 week" : `after ${f.since.value} weeks`;
        break;
    }
    return [when, f.shown.weightKg === undefined ? undefined : NumberDisplay.kg(display, f.shown.weightKg)].filter((s) => s !== undefined).join(" · ");
  };

  const spoken = (f: CheckInGallery_Frame) => `${index + 1} of ${frames.length}, ${date(f.shown.date)}, ${detail(f)}`;

  const fade = reduceMotion ? 0 : Math.min(0.3, interval * 0.6);

  return (
    <VStack
      alignment="leading"
      spacing={SL.Space.s4}
      style={{ flex: "1 1 0", minHeight: 0, height: "100%", paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s4, background: SL.Surface.ground, boxSizing: "border-box" }}
    >
      {/* Head */}
      <HStack alignment="top" spacing={SL.Space.s3} style={{ alignSelf: "stretch", flexShrink: 0 }}>
        <VStack alignment="leading" spacing={2}>
          <Text as="h2" {...slTitle()} color={SL.Ink.primary}>Timeline</Text>
          <Text {...slMeta()} numerals color={SL.Ink.secondary}>{summary}</Text>
        </VStack>
        <Spacer minLength={SL.Space.s2} />
        <PressButton onPress={onClose} aria-label="Close" style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <SLGlyph name="close" size={16} fixed color={SL.Ink.primary} />
        </PressButton>
      </HStack>

      {periods.length > 1 && (
        <div role="group" aria-label="Period" style={{ alignSelf: "stretch", overflowX: "auto", scrollbarWidth: "none", flexShrink: 0 }}>
          <HStack spacing={SL.Space.s2} style={{ width: "max-content" }}>
            {periods.map((option) => (
              <SLChip
                key={option}
                title={name(option)}
                look={option === period ? "selected" : "unselected"}
                action={() => {
                  setPlaying(false);
                  setPeriod(option);
                }}
              />
            ))}
          </HStack>
        </div>
      )}

      {/* The picture */}
      <div style={{ flex: "1 1 0", minHeight: 0, alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center", containerType: "size" }}>
        <div
          role="img"
          aria-label={frame ? `Photo ${spoken(frame)}` : "No photo"}
          style={{ position: "relative", aspectRatio: "3 / 4", width: "min(100cqw, 75cqh)", borderRadius: SL.Radius.lg, overflow: "hidden", background: SL.Surface.raised2 }}
        >
          {previous && previous.id !== shown?.id && (
            <img key={`p${previous.id}`} src={previous.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          {shown && (
            <img
              key={shown.id}
              src={shown.image}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", animation: fade > 0 ? `sl-timelapse-in ${fade}s ease-in-out` : undefined }}
            />
          )}
          <style>{"@keyframes sl-timelapse-in { from { opacity: 0; } to { opacity: 1; } }"}</style>
          {/* The date large, and under it how long after the first picture it was taken, with the day's weigh-in when there is one. */}
          <div
            aria-hidden
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: SL.Space.s4, paddingTop: SL.Space.s4 + SL.Space.s6, background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.65))", color: "#fff", display: "flex", flexDirection: "column", gap: 2 }}
          >
            {frame && (
              <>
                <span style={{ ...slFixed(SL.TypeSize.title, SL.Weight.semibold), fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{date(frame.shown.date)}</span>
                <span style={{ ...slFixed(SL.TypeSize.body, SL.Weight.regular), fontVariantNumeric: "tabular-nums", opacity: 0.85, lineHeight: 1.25 }}>{detail(frame)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Where it is */}
      <VStack spacing={2} style={{ alignSelf: "stretch", flexShrink: 0 }}>
        <div style={{ alignSelf: "stretch", display: "flex" }}>
          <IOSSlider
            value={Math.min(index, Math.max(frames.length - 1, 0))}
            min={0}
            max={Math.max(frames.length - 1, 1)}
            step={1}
            aria-label="Photo"
            aria-valuetext={frame ? spoken(frame) : ""}
            onChange={(value) => {
              setPlaying(false);
              setIndex(Math.trunc(rounded(value)));
            }}
          />
        </div>
        <HStack aria-hidden style={{ alignSelf: "stretch" }}>
          <Text {...slMeta()} numerals color={SL.Ink.secondary}>{frames[0] ? date(frames[0].shown.date) : ""}</Text>
          <Spacer minLength={SL.Space.s2} />
          <Text {...slMeta()} numerals color={SL.Ink.secondary}>{`${Math.min(index + 1, frames.length)} / ${frames.length}`}</Text>
          <Spacer minLength={SL.Space.s2} />
          <Text {...slMeta()} numerals color={SL.Ink.secondary}>{frames[frames.length - 1] ? date(frames[frames.length - 1].shown.date) : ""}</Text>
        </HStack>
      </VStack>

      {/* How fast */}
      <HStack spacing={SL.Space.s4} style={{ alignSelf: "stretch", flexShrink: 0 }}>
        <PressButton
          aria-label={playing ? "Pause" : "Play"}
          onPress={() => {
            if (!playing && index >= frames.length - 1) setIndex(0);
            if (!playing && index >= frames.length - 1) latest.current = { ...latest.current, index: 0 };
            setPlaying(!playing);
          }}
          style={{ width: 64, height: 64, borderRadius: "50%", background: SL.Signal.action, display: "grid", placeItems: "center", flexShrink: 0 }}
        >
          <SFSymbol name={playing ? "pause.fill" : "play.fill"} size={22} weight={600} color={SL.Signal.onAction} />
        </PressButton>
        <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
          <Text {...slMeta()} color={SL.Ink.secondary}>Speed</Text>
          <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
            <Text {...slMeta()} color={SL.Ink.secondary}>Slow</Text>
            <IOSSlider value={speed} min={0} max={1} onChange={setSpeed} aria-label="Speed" aria-valuetext={`${interval.toFixed(1)} seconds per photo`} />
            <Text {...slMeta()} color={SL.Ink.secondary}>Fast</Text>
          </HStack>
        </VStack>
      </HStack>
    </VStack>
  );
}
