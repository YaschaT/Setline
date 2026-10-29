// PhotoCaptureView.swift — the check-in camera: the same frame every time,
// wherever the photo is taken.
//
// Comparing two photos only works when they were taken alike, so the camera
// gives three things to line up against:
// - Ghost — the last check-in, faint over the live picture: stand where you
//   stood.
// - Guide — a body outline with head and feet lines and a centre line, for
//   the first photo or a new place.
// - Level — the phone upright and straight; the line turns lime when it is,
//   so the angle is the same at any height or in any room.
//
// A self-timer lets the phone stand on a shelf. The photo is taken at 3:4, the
// shape every photo on the Photos tab is shown in, and never leaves the phone.
//
// Web: the live camera is `getUserMedia` in a <video>, the photo a 3:4 crop
// of its frame drawn on a canvas (mirrored for the front camera, as iOS keeps
// it); the level reads `devicemotion` gravity. "Open Settings" cannot open
// the browser's site settings, so it asks for the camera again. Haptics are
// left out.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HStack, Spacer, Text, VStack, useAppStorage } from "../../design/swiftui";
import { SL, slFont } from "../../design/tokens";
import { SFSymbol } from "../../design/SFSymbol";
import { SLSound } from "../../design/SLSound";
import { SLOutlineButton, SLPrimaryButton, colorOpacity } from "../../design/SetlineTokens";
import { SLGlyph, type SLGlyph_NameCase } from "../../design/components/SLGlyph";
import { SLPress } from "../../design/components/SLPress";
import { MuscleFigure } from "../../design/components/MuscleFigure";
import { slBody, slLead, slMeta } from "../../design/components/SLText";
import { PressButton } from "../../design/support";

export type PhotoCaptureView_Guide = "ghost" | "outline" | "off";

export const PhotoCaptureView_Guide = {
  allCases: ["ghost", "outline", "off"] as PhotoCaptureView_Guide[],
  title(self: PhotoCaptureView_Guide): string {
    switch (self) {
      case "ghost":
        return "Last photo";
      case "outline":
        return "Guide";
      case "off":
        return "Off";
    }
  },
};

/** Observation for the two device models below. */
class Observed {
  private listeners = new Set<() => void>();
  private version = 0;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  protected changed() {
    this.version++;
    for (const l of this.listeners) l();
  }
}

function useModel<T extends Observed>(make: () => T): T {
  const ref = useRef<T | null>(null);
  ref.current ??= make();
  useSyncExternalStore(ref.current.subscribe, ref.current.getVersion);
  return ref.current;
}

export function PhotoCaptureView({ ghost, onTaken, onClose }: { ghost?: string; onTaken: (data: Uint8Array) => void; onClose: () => void }) {
  const camera = useModel(() => new CheckInCamera());
  const level = useModel(() => new PhoneLevel());
  const [guideRaw, setGuide] = useAppStorage<string>("setline.photos.guide", "ghost");
  const guide: PhotoCaptureView_Guide = guideRaw === "outline" || guideRaw === "off" ? guideRaw : "ghost";
  const [timer, setTimer] = useAppStorage<number>("setline.photos.timer", 0);
  const [countdown, setCountdown] = useState<number | undefined>(undefined);
  const countdownTask = useRef<{ cancelled: boolean } | undefined>(undefined);
  const [taken, setTaken] = useState<{ data: Uint8Array; url: string } | undefined>(undefined);
  const video = useRef<HTMLVideoElement>(null);

  /** Without a last photo there is nothing to ghost: the outline instead. */
  const shownGuide: PhotoCaptureView_Guide = guide === "ghost" && ghost === undefined ? "outline" : guide;

  useEffect(() => {
    void camera.start();
    level.start();
    return () => {
      if (countdownTask.current) countdownTask.current.cancelled = true;
      camera.stop();
      level.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (video.current) camera.attach(video.current);
  });

  useEffect(() => () => {
    if (taken) URL.revokeObjectURL(taken.url);
  }, [taken]);

  const hint = (() => {
    if (taken) return "Same spot, same light next time";
    if (!level.isAvailable) return shownGuide === "ghost" ? "Stand where you stood last time" : "Head and feet on the lines";
    if (level.isLevel) return shownGuide === "ghost" ? "Level · line up with last time" : "Level · head and feet on the lines";
    return level.advice;
  })();

  const roundButton = (glyph: SLGlyph_NameCase, label: string, action: () => void) => (
    <PressButton onPress={action} aria-label={label} style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0 }}>
      <SLGlyph name={glyph} size={16} fixed color={SL.Ink.primary} />
    </PressButton>
  );

  const capture = () => {
    SLSound.shutter();
    void (async () => {
      const data = await camera.capture();
      if (!data) return;
      setTaken({ data, url: URL.createObjectURL(new Blob([data as BlobPart], { type: "image/jpeg" })) });
      camera.stop();
    })();
  };

  const shutter = () => {
    if (countdown !== undefined) {
      if (countdownTask.current) countdownTask.current.cancelled = true;
      setCountdown(undefined);
      return;
    }
    if (timer <= 0) {
      capture();
      return;
    }
    const task = { cancelled: false };
    countdownTask.current = task;
    void (async () => {
      for (let left = timer; left >= 1; left--) {
        setCountdown(left);
        await new Promise((r) => setTimeout(r, 1000));
        if (task.cancelled) return;
      }
      setCountdown(undefined);
      capture();
    })();
  };

  // MARK: - Top

  const topBar = (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", flexShrink: 0 }}>
      {roundButton("close", "Close", onClose)}
      <Spacer minLength={0} />
      <VStack spacing={2} style={{ textAlign: "center" }}>
        <Text {...slLead()} color={SL.Ink.primary} align="center">Check-in photo</Text>
        <Text {...slMeta()} color={level.isLevel ? SL.Signal.action : SL.Ink.secondary} align="center" style={{ transition: `color ${SL.Motion.base}s ease-out` }}>
          {hint}
        </Text>
      </VStack>
      <Spacer minLength={0} />
      <SLPress
        scale={0.9}
        onPress={() => void camera.flip()}
        disabled={taken !== undefined || !camera.canFlip}
        aria-label={camera.position === "front" ? "Use the back camera" : "Use the front camera"}
        style={{ opacity: taken !== undefined || !camera.canFlip ? 0 : 1, borderRadius: "50%", flexShrink: 0 }}
      >
        <div style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
          <SFSymbol name="arrow.triangle.2.circlepath.camera" size={17} weight={600} color={SL.Ink.primary} />
        </div>
      </SLPress>
    </HStack>
  );

  // MARK: - The frame

  const guideLayer = (() => {
    switch (shownGuide) {
      case "ghost":
        return (
          <>
            {ghost && <img src={ghost} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35, pointerEvents: "none" }} />}
            <BodyGuide showsFigure={false} />
          </>
        );
      case "outline":
        return <BodyGuide showsFigure />;
      case "off":
        return null;
    }
  })();

  const unavailable = (
    <div style={{ position: "absolute", inset: 0, background: SL.Surface.raised, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <VStack spacing={SL.Space.s2} style={{ padding: SL.Space.s5 }}>
        <SFSymbol name={camera.state === "denied" ? "camera.badge.ellipsis" : "camera"} size={28} color={SL.Surface.mute} />
        {camera.state === "denied" && (
          <>
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>Setline can't use the camera</Text>
            <Text {...slMeta()} color={SL.Ink.secondary} align="center">Allow it in Settings, or pick a photo from your library.</Text>
            <PressButton onPress={() => void camera.start()} style={{ ...slFont(SL.TypeSize.body, SL.Weight.semibold), color: SL.Signal.action, minHeight: SL.Space.hitMin, background: "transparent" }}>
              Open Settings
            </PressButton>
          </>
        )}
        {camera.state === "missing" && <Text {...slMeta()} color={SL.Ink.secondary}>No camera on this device</Text>}
      </VStack>
    </div>
  );

  const frame = (
    <div style={{ flex: "1 1 0", minHeight: 0, alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center", containerType: "size" }}>
      <div style={{ position: "relative", aspectRatio: "3 / 4", width: "min(100cqw, 75cqh)", borderRadius: SL.Radius.xl, overflow: "hidden", background: "#000" }}>
        {taken ? (
          <img src={taken.url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <>
            <video
              ref={video}
              playsInline
              muted
              autoPlay
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: camera.position === "front" ? "scaleX(-1)" : undefined, display: camera.state === "running" ? "block" : "none" }}
            />
            {camera.state !== "running" && unavailable}
          </>
        )}

        {(taken === undefined || shownGuide !== "off") && <div style={{ position: "absolute", inset: 0, opacity: taken === undefined ? 1 : 0.6 }}>{guideLayer}</div>}
        {taken === undefined && level.isAvailable && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
            <LevelLine roll={level.roll} isLevel={level.isLevel} />
          </div>
        )}
        {countdown !== undefined && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <span aria-label={`${countdown} seconds`} style={{ ...slFont(96, SL.Weight.bold), fontVariantNumeric: "tabular-nums", color: SL.Signal.action, textShadow: "0 0 12px rgba(0,0,0,0.6)", lineHeight: 1 }}>
              {countdown}
            </span>
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, borderRadius: SL.Radius.xl, boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairlineStrong}`, pointerEvents: "none" }} />
      </div>
    </div>
  );

  // MARK: - Below the frame

  const guidePicker = (
    <div role="group" aria-label="Guide" style={{ alignSelf: "stretch", minHeight: SL.Space.hitMin, display: "flex", gap: SL.Space.s1, padding: SL.Space.s1, borderRadius: 999, background: SL.Surface.raised, flexShrink: 0 }}>
      {PhotoCaptureView_Guide.allCases.map((option) => {
        const disabled = option === "ghost" && ghost === undefined;
        const on = shownGuide === option;
        return (
          <PressButton
            key={option}
            aria-pressed={on}
            disabled={disabled}
            onPress={() => setGuide(option)}
            style={{
              ...slFont(SL.TypeSize.meta, on ? SL.Weight.semibold : SL.Weight.regular),
              color: on ? SL.Ink.primary : SL.Ink.secondary,
              flex: "1 1 0",
              minHeight: 36,
              borderRadius: 999,
              background: on ? SL.Surface.raised2 : "transparent",
              opacity: disabled ? 0.4 : 1,
              transition: `background ${SL.Motion.base}s ease-out`,
            }}
          >
            {PhotoCaptureView_Guide.title(option)}
          </PressButton>
        );
      })}
    </div>
  );

  const controls = (
    <HStack style={{ alignSelf: "stretch", paddingTop: SL.Space.s1, flexShrink: 0 }}>
      <SLPress scale={0.92} onPress={() => setTimer(timer === 0 ? 3 : timer === 3 ? 10 : 0)} aria-label={`Self-timer, ${timer === 0 ? "Off" : `${timer} seconds`}`} style={{ borderRadius: 999, flexShrink: 0 }}>
        <HStack spacing={4} style={{ justifyContent: "center", width: 72, height: SL.Space.hitMin, borderRadius: 999, background: SL.Surface.raised2, color: timer === 0 ? SL.Ink.secondary : SL.Signal.action }}>
          <SFSymbol name="timer" size={16} weight={600} />
          <span style={{ ...slFont(SL.TypeSize.meta, SL.Weight.semibold), fontVariantNumeric: "tabular-nums" }}>{timer === 0 ? "Off" : `${timer}s`}</span>
        </HStack>
      </SLPress>

      <Spacer minLength={0} />

      <SLPress
        scale={0.9}
        bounces
        onPress={shutter}
        disabled={camera.state !== "running" || camera.isCapturing}
        aria-label={countdown !== undefined ? "Stop the timer" : "Take photo"}
        style={{ opacity: camera.state === "running" || camera.state === "idle" ? 1 : 0.35, borderRadius: "50%", flexShrink: 0 }}
      >
        <div style={{ position: "relative", width: 76, height: 76, borderRadius: "50%", boxShadow: `inset 0 0 0 3px ${SL.Ink.primary}` }}>
          <div style={{ position: "absolute", inset: 7, borderRadius: "50%", background: countdown !== undefined ? SL.Signal.loss : SL.Signal.action }} />
          {countdown !== undefined && <div style={{ position: "absolute", left: 28, top: 28, width: 20, height: 20, borderRadius: 4, background: SL.Ink.primary }} />}
        </div>
      </SLPress>

      <Spacer minLength={0} />

      {/* Balances the timer, so the shutter sits in the middle. */}
      <div style={{ width: 72, height: SL.Space.hitMin, flexShrink: 0 }} />
    </HStack>
  );

  const review = (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", paddingTop: SL.Space.s2, flexShrink: 0 }}>
      <SLOutlineButton
        onPress={() => {
          setTaken(undefined);
          void camera.start();
        }}
      >
        Retake
      </SLOutlineButton>
      <SLPrimaryButton
        onPress={() => {
          if (taken) onTaken(taken.data);
        }}
      >
        Use photo
      </SLPrimaryButton>
    </HStack>
  );

  return (
    <VStack spacing={SL.Space.s3} style={{ flex: "1 1 0", height: "100%", minHeight: 0, paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3, background: "#000", boxSizing: "border-box" }}>
      {topBar}
      {frame}
      {taken === undefined ? (
        <>
          {guidePicker}
          {controls}
        </>
      ) : (
        review
      )}
    </VStack>
  );
}

// MARK: - The guide

const HEAD = 0.07;
const FEET = 0.95;

/**
 * Where the body goes: head and feet lines a set distance from the frame's
 * edges and a line down the middle, so a body fills the frame the same way at
 * any distance. With `showsFigure`, an outline to stand in.
 */
function BodyGuide({ showsFigure }: { showsFigure: boolean }) {
  const mark = (title: string, y: number) => (
    <div style={{ position: "absolute", left: 0, right: 0, top: `calc(${y * 100}% - 9px)`, height: 18, display: "flex", alignItems: "center" }}>
      <svg width="100%" height="2" style={{ position: "absolute", left: 0, right: 0, top: 8, overflow: "visible" }} aria-hidden>
        <line x1="0" y1="1" x2="100%" y2="1" stroke={colorOpacity(SL.Signal.action, 0.8)} strokeWidth={1.5} strokeDasharray="8 5" />
      </svg>
      <span
        style={{
          position: "relative",
          marginLeft: SL.Space.s2,
          ...slFont(10, SL.Weight.bold),
          letterSpacing: 0.8,
          color: SL.Signal.onAction,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 2,
          paddingBottom: 2,
          borderRadius: 999,
          background: colorOpacity(SL.Signal.action, 0.9),
          lineHeight: 1.2,
        }}
      >
        {title.toUpperCase()}
      </span>
    </div>
  );
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* Thirds, faint, for the arms and hips; the middle, dashed. */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        {[1, 2].map((i) => (
          <g key={i} stroke="rgba(255,255,255,0.14)" strokeWidth={1}>
            <line x1={`${(i * 100) / 3}%`} y1="0" x2={`${(i * 100) / 3}%`} y2="100%" />
            <line x1="0" y1={`${(i * 100) / 3}%`} x2="100%" y2={`${(i * 100) / 3}%`} />
          </g>
        ))}
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.33)" strokeWidth={1} strokeDasharray="4 6" />
      </svg>
      {showsFigure && (
        <div style={{ position: "absolute", left: 0, right: 0, top: `${HEAD * 100}%`, height: `${(FEET - HEAD) * 100}%`, display: "flex", justifyContent: "center" }}>
          <MuscleFigure highlight="transparent" outline="rgba(255,255,255,0.6)" lineWidth={2.5} style={{ height: "100%", width: "100%" }} />
        </div>
      )}
      {mark("Head", HEAD)}
      {mark("Feet", FEET)}
    </div>
  );
}

/** The horizon: a line through the middle that tips with the phone and turns lime once it is upright and straight. */
function LevelLine({ roll, isLevel }: { roll: number; isLevel: boolean }) {
  const color = isLevel ? SL.Signal.action : "rgba(255,255,255,0.8)";
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        alignItems: "center",
        filter: "drop-shadow(0 0 3px rgba(0,0,0,0.5))",
        transform: `rotate(${isLevel ? 0 : -roll}deg)`,
        transition: `transform ${SL.Motion.fast}s ease-out`,
      }}
    >
      <div style={{ width: 40, height: 2, borderRadius: 1, background: color }} />
      <div style={{ width: 14, height: 14, borderRadius: "50%", boxShadow: `inset 0 0 0 2px ${color}`, marginLeft: 6, marginRight: 6 }} />
      <div style={{ width: 40, height: 2, borderRadius: 1, background: color }} />
    </div>
  );
}

// MARK: - The level

/** How the phone is held, from gravity: tipped sideways (roll) and leaning towards or away from the subject (tilt), both in degrees. */
export class PhoneLevel extends Observed {
  roll = 0;
  tilt = 0;
  isAvailable = false;
  private handler: ((e: DeviceMotionEvent) => void) | undefined;
  private last = 0;

  /** Within 2° both ways counts as level. */
  get isLevel(): boolean {
    return this.isAvailable && Math.abs(this.roll) < 2 && Math.abs(this.tilt) < 3;
  }

  get advice(): string {
    if (Math.abs(this.tilt) >= 3) return this.tilt > 0 ? "Tilt the top of the phone back" : "Tilt the top of the phone forward";
    if (Math.abs(this.roll) >= 2) return "Straighten the phone";
    return "Level";
  }

  start(): void {
    if (this.handler || typeof window === "undefined" || !("DeviceMotionEvent" in window)) return;
    this.handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      // 30 a second, as iOS reads it.
      const now = performance.now();
      if (now - this.last < 1000 / 30) return;
      this.last = now;
      // The browser reports the push against gravity; gravity itself is the
      // opposite, in g. Upright in portrait, it points straight down the
      // screen (y = -1). Sideways tips it into x; leaning tips it into z.
      const gx = -a.x / 9.81;
      const gy = -a.y / 9.81;
      const gz = -a.z / 9.81;
      this.isAvailable = true;
      this.roll = (Math.atan2(gx, -gy) * 180) / Math.PI;
      this.tilt = (Math.atan2(gz, -gy) * 180) / Math.PI;
      this.changed();
    };
    window.addEventListener("devicemotion", this.handler);
  }

  stop(): void {
    if (this.handler) window.removeEventListener("devicemotion", this.handler);
    this.handler = undefined;
  }
}

// MARK: - The camera

export type CheckInCamera_State = "idle" | "running" | "denied" | "missing";

/**
 * The camera stream, taking 3:4 portrait photos. The front camera's photo is
 * kept as the preview showed it, mirrored, so the next ghost lines up with
 * what is on the screen.
 */
export class CheckInCamera extends Observed {
  state: CheckInCamera_State = "idle";
  position: "back" | "front" = "back";
  isCapturing = false;
  canFlip = false;
  private stream: MediaStream | undefined;
  private video: HTMLVideoElement | undefined;
  private generation = 0;

  attach(video: HTMLVideoElement): void {
    if (this.video === video) return;
    this.video = video;
    if (this.stream && video.srcObject !== this.stream) {
      video.srcObject = this.stream;
      void video.play().catch(() => {});
    }
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state = "missing";
      this.changed();
      return;
    }
    const generation = ++this.generation;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: this.position === "front" ? "user" : "environment", width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
    } catch (error) {
      if (generation !== this.generation) return;
      const name = (error as DOMException)?.name;
      this.state = name === "NotAllowedError" || name === "SecurityError" ? "denied" : "missing";
      this.changed();
      return;
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = stream;
    if (this.video) {
      this.video.srcObject = stream;
      void this.video.play().catch(() => {});
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.canFlip = devices.filter((d) => d.kind === "videoinput").length >= 2;
    } catch {
      this.canFlip = false;
    }
    this.state = "running";
    this.changed();
  }

  stop(): void {
    this.generation++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    if (this.video) this.video.srcObject = null;
  }

  async flip(): Promise<void> {
    this.position = this.position === "back" ? "front" : "back";
    this.changed();
    await this.start();
  }

  /** The frame on screen, cropped to 3:4 as the preview fills it, as JPEG. */
  async capture(): Promise<Uint8Array | undefined> {
    const video = this.video;
    if (this.state !== "running" || this.isCapturing || !video || video.videoWidth === 0) return undefined;
    this.isCapturing = true;
    this.changed();
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const target = 3 / 4;
      let sw = vw;
      let sh = vh;
      if (vw / vh > target) sw = vh * target;
      else sh = vw / target;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      if (this.position === "front") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) return undefined;
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      this.isCapturing = false;
      this.changed();
    }
  }
}
