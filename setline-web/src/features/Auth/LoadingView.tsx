// LoadingView.swift — while the app finds out who is signed in and reads
// their training: at launch, and after signing in on a phone that holds no
// copy of the account yet (`AppState.isLoading`).
//
// SETLINE Loader v2 (SETLINE Redesign): the mark builds itself — three reps
// drop in, the bar slides through them, the whole mark lifts once — then the
// wordmark rises and the mark keeps doing small reps, counted by three ticks
// beside "Warming up…", until the training is there. The timings, curves and
// geometry are the design file's, in its 880 × 780 viewBox.
//
// It shows only after a moment, so a quick launch never flashes it, and the
// animation starts when it shows. With Reduce Motion the finished mark and
// wordmark stand still.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SL, slFont } from "../../design/tokens";
import { useReduceMotion } from "../../design/support";
import { colorHex, colorOpacity } from "../../design/SetlineTokens";

export function LoadingView({
  speed = 1,
  delay = 300,
  onIntroFinished,
}: {
  /** How fast the intro plays. The cold launch plays it at 1.6×, so the whole mark-and-wordmark moment lasts about two seconds. */
  speed?: number;
  /** Milliseconds to wait before showing anything: a moment after sign-in, so a quick load never flashes it; nothing at a cold launch. */
  delay?: number;
  /** Called once the wordmark has landed (or at once-ish with Reduce Motion), so the launch can hold the intro until it is complete. */
  onIntroFinished?: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const [start, setStart] = useState<number | undefined>(undefined);
  const finished = useRef(onIntroFinished);
  finished.current = onIntroFinished;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const begin = () => {
      setStart(performance.now());
      if (!finished.current) return;
      const seconds = reduceMotion ? 0.8 : LoadingView.introLength / speed;
      timers.push(setTimeout(() => finished.current?.(), seconds * 1000));
    };
    if (delay > 0) timers.push(setTimeout(begin, delay));
    else begin();
    return () => timers.forEach(clearTimeout);
    // `.task`: once, when the view appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="img"
      aria-label="Loading your training."
      style={{ position: "fixed", inset: 0, background: SL.Surface.ground, overflow: "hidden" }}
    >
      {start !== undefined &&
        (reduceMotion ? (
          <LoaderStage frame={new LoaderFrame(LoaderFrame.settled, false)} />
        ) : (
          <AnimatedStage start={start} speed={speed} />
        ))}
    </div>
  );
}

/** When, in design seconds, the wordmark, its line and the caption are in. */
LoadingView.introLength = 3.4;

/** `TimelineView(.animation)`: one frame per display refresh. */
function AnimatedStage({ start, speed }: { start: number; speed: number }) {
  const [now, setNow] = useState(start);
  useEffect(() => {
    let id = 0;
    const tick = (time: number) => {
      setNow(time);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  return <LoaderStage frame={new LoaderFrame(Math.max(0, (now - start) / 1000) * speed, true)} />;
}

// MARK: - One moment of the animation

interface Point { x: number; y: number }

/** A bar of the mark. */
interface LoaderFrame_Bar {
  points: Point[];
  /** Where its sparks fly from. */
  base: Point;
  /** The direction it drops along (it falls in against this). */
  direction: { dx: number; dy: number };
}

/** The bottom middle of its outline: what it squashes about. */
function anchor(bar: LoaderFrame_Bar): Point {
  const xs = bar.points.map((p) => p.x);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.max(...bar.points.map((p) => p.y)) };
}

/** A bar while it falls or settles. */
interface LoaderFrame_BarPose {
  visible: boolean;
  offset: number;
  scale: { width: number; height: number };
  /** Earlier positions drawn faintly behind a falling bar: (offset, opacity). */
  trails: [number, number][];
  /** 0…1 through its sparks on landing, if they are flying. */
  sparks?: number;
}

/** Everything the stage draws at time `t`, worked out once per frame. */
class LoaderFrame {
  /** A moment after the intro, when everything has landed. */
  static readonly settled = 3.0;

  static readonly bars: LoaderFrame_Bar[] = [
    { points: [{ x: 360, y: 500 }, { x: 485, y: 432 }, { x: 418, y: 918 }, { x: 293, y: 975 }], base: { x: 355, y: 946 }, direction: { dx: 0.138, dy: -0.99 } },
    { points: [{ x: 578, y: 415 }, { x: 707, y: 348 }, { x: 632, y: 898 }, { x: 500, y: 970 }], base: { x: 566, y: 934 }, direction: { dx: 0.15, dy: -0.989 } },
    { points: [{ x: 805, y: 345 }, { x: 935, y: 278 }, { x: 855, y: 870 }, { x: 720, y: 938 }], base: { x: 787, y: 904 }, direction: { dx: 0.15, dy: -0.989 } },
  ];
  static readonly crossbar: Point[] = [{ x: 232, y: 700 }, { x: 1012, y: 470 }, { x: 1005, y: 555 }, { x: 228, y: 782 }];

  constructor(readonly t: number, readonly idle: boolean) {}

  // Timings (seconds).
  private static readonly drop = 0.26;
  private static dropStart(i: number): number { return 0.35 + i * 0.24; }
  private static landing(i: number): number { return LoaderFrame.dropStart(i) + LoaderFrame.drop; }
  private static readonly slideStart = 1.12;
  private static readonly slideLength = 0.2;
  private static get slideEnd(): number { return LoaderFrame.slideStart + LoaderFrame.slideLength; }

  private static clamp(x: number): number { return Math.max(0, Math.min(1, x)); }
  private static outCubic(x: number): number { return 1 - Math.pow(1 - x, 3); }
  private static outQuint(x: number): number { return 1 - Math.pow(1 - x, 5); }
  private static inOutCubic(x: number): number { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  /** The camera shake: each landing knocks the stage, the bar hardest. */
  get shake(): number {
    let shake = 0;
    for (let i = 0; i < 3; i++) {
      const d = this.t - LoaderFrame.landing(i);
      if (d > 0) shake += 4 * Math.exp(-14 * d) * Math.sin(d * 70);
    }
    const d = this.t - LoaderFrame.slideEnd;
    if (d > 0) shake += 9 * Math.exp(-10 * d) * Math.sin(d * 62);
    return shake;
  }

  bar(i: number): LoaderFrame_BarPose {
    const p = LoaderFrame.clamp((this.t - LoaderFrame.dropStart(i)) / LoaderFrame.drop);
    const offset = (p: number) => (1 - p * p) * 900;
    const q = Math.max(0, this.t - LoaderFrame.landing(i));
    let sy = 1.0;
    if (p > 0 && p < 1) sy = 1 + 0.3 * (1 - p);
    else if (p >= 1) sy = 1 - 0.2 * Math.exp(-7 * q) * Math.cos(q * Math.PI * 4.5);
    const sx = 1 + (1 - sy) * 0.5;
    const falling = p > 0 && p < 1;
    return {
      visible: p > 0,
      offset: offset(p),
      scale: { width: sx, height: sy },
      trails: falling ? [0.16, 0.32].map((lag, k): [number, number] => [offset(Math.max(0, p - lag)), 0.22 - k * 0.1]) : [],
      sparks: q > 0 && q < 0.45 ? LoaderFrame.outCubic(q / 0.45) : undefined,
    };
  }

  /** 0…1: how far the bar has slid through the reps. */
  get slide(): number { return LoaderFrame.outQuint(LoaderFrame.clamp((this.t - LoaderFrame.slideStart) / LoaderFrame.slideLength)); }

  /** 1 → 0: the white flash when the bar locks in. */
  get flash(): number {
    const f = LoaderFrame.clamp((this.t - LoaderFrame.slideEnd) / 0.35);
    return f > 0 ? 1 - f : 0;
  }

  /** 0…1 through the ring that spreads from the lock-in, if it is spreading. */
  get ring(): number | undefined {
    const s = LoaderFrame.clamp((this.t - LoaderFrame.slideEnd) / 0.7);
    return s > 0 && s < 1 ? LoaderFrame.outCubic(s) : undefined;
  }

  /** The whole mark: its lift, then its reps. */
  get mark(): { y: number; scale: { width: number; height: number }; reps: number } {
    const l = LoaderFrame.clamp((this.t - 1.62) / 0.9);
    let ly = 0, sx = 1.0, sy = 1.0;
    if (l > 0 && l < 0.24) {
      const k = LoaderFrame.inOutCubic(l / 0.24);
      sy = 1 - 0.12 * k;
      sx = 1 + 0.07 * k;
    } else if (l >= 0.24 && l < 0.64) {
      const k = (l - 0.24) / 0.4;
      ly = -96 * Math.sin(k * Math.PI);
      const stretch = Math.cos(k * Math.PI);
      sy = 1 + 0.1 * Math.abs(stretch) * (k < 0.5 ? 1 : 0.6) - 0.12 * (k < 0.12 ? 1 - k / 0.12 : 0);
      sx = 2 - sy;
    } else if (l >= 0.64 && l < 1) {
      const k = (l - 0.64) / 0.36;
      const d = Math.exp(-4.5 * k) * Math.cos(k * Math.PI * 2.6);
      sy = 1 - 0.09 * d;
      sx = 1 + 0.05 * d;
    }

    const it = this.t - 3.1;
    let iy = 0, squash = 1.0, reps = 0;
    if (this.idle && it > 0) {
      const ph = (it % 1.5) / 1.5;
      reps = Math.trunc(it / 1.5) % 4;
      if (ph < 0.16) squash = 1 - 0.06 * Math.sin((ph / 0.16) * Math.PI);
      else if (ph < 0.6) iy = -22 * Math.sin(((ph - 0.16) / 0.44) * Math.PI);
      else if (ph < 0.72) squash = 1 - 0.04 * Math.sin(((ph - 0.6) / 0.12) * Math.PI);
      if (ph >= 0.38) reps += 1;
      reps %= 4;
    }
    return { y: ly + iy, scale: { width: sx * (2 - squash), height: sy * squash }, reps };
  }

  get shadowVisible(): boolean { return this.t > LoaderFrame.landing(0); }

  letter(i: number): number { return LoaderFrame.outQuint(LoaderFrame.clamp((this.t - 2.5 - i * 0.045) / 0.55)); }
  get underline(): number { return LoaderFrame.outQuint(LoaderFrame.clamp((this.t - 2.75) / 0.6)); }
  get caption(): number { return LoaderFrame.clamp((this.t - 2.95) / 0.45); }
}

// MARK: - The stage

const markSize = { width: 226, height: 200 };
const wordSize = 24;
const wordLine = 24 * 1.15;
const tracking = 24 * 0.3;
const lime = SL.Signal.action;
const hot = colorHex(0xf4ffe0);

/**
 * Laid out as the design's 390 × 844 artboard: the mark and wordmark a little
 * above the middle, the caption 64 pt from the bottom.
 */
function LoaderStage({ frame }: { frame: LoaderFrame }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const mark = frame.mark;
  const shake = frame.shake;
  // The design's column (mark, 8 gap, shadow, 36, wordmark) is centred with
  // a −40 top margin: its top sits 168.8 above centre.
  const markTop = size.height / 2 - 168.8;

  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || size.width === 0) return;
    const ratio = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size.width * ratio) || c.height !== Math.round(size.height * ratio)) {
      c.width = Math.round(size.width * ratio);
      c.height = Math.round(size.height * ratio);
    }
    const context = c.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, c.width, c.height);
    context.scale(ratio, ratio);
    draw(context, frame, { x: size.width / 2 - markSize.width / 2, y: markTop }, mark);
  });

  const placed = (x: number, y: number): React.CSSProperties => ({ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)" });

  return (
    <div ref={host} style={{ position: "absolute", inset: 0, transform: `translate(${shake * 0.4}px, ${shake}px)` }}>
      <canvas ref={canvas} style={{ position: "absolute", left: 0, top: 0, width: size.width, height: size.height }} />

      <div style={placed(size.width / 2, markTop + markSize.height + 8 + 6)}>
        <Shadow frame={frame} lift={mark.y} />
      </div>

      <div style={placed(size.width / 2, markTop + 220 + 36 + (wordLine + 12 + 2) / 2)}>
        <Wordmark frame={frame} />
      </div>

      <div style={placed(size.width / 2, size.height - 64 - 10)}>
        <Caption frame={frame} reps={mark.reps} />
      </div>
    </div>
  );
}

// MARK: Mark

function draw(context: CanvasRenderingContext2D, frame: LoaderFrame, origin: Point, mark: { y: number; scale: { width: number; height: number } }) {
  // The svg box, squashed and lifted about its bottom middle…
  const box = markSize;
  context.translate(origin.x + box.width / 2, origin.y + box.height + mark.y);
  context.scale(mark.scale.width, mark.scale.height);
  context.translate(-box.width / 2, -box.height);
  // …and the 880 × 780 viewBox fitted into it.
  const unit = box.height / 780;
  context.translate((box.width - 880 * unit) / 2, 0);
  context.scale(unit, unit);
  context.translate(-180, -240);

  const poses = [0, 1, 2].map((i) => frame.bar(i));

  // Behind the bars: trails, sparks, speed lines, the ring.
  poses.forEach((pose, i) => {
    const bar = LoaderFrame.bars[i];
    for (const [offset, opacity] of pose.trails) {
      context.save();
      context.globalAlpha = opacity;
      place(bar, offset, pose.scale, context);
      fill(bar.points, lime, context);
      context.restore();
    }
    if (pose.sparks !== undefined) {
      const k = pose.sparks;
      for (const degrees of [-168.0, -140, -112, -68, -40, -12]) {
        const r = (degrees * Math.PI) / 180;
        const r1 = 30 + 150 * k;
        const r2 = r1 + 60 * (1 - k) + 8;
        context.beginPath();
        context.moveTo(bar.base.x + Math.cos(r) * r1, bar.base.y + 20 + Math.sin(r) * r1 * 0.6);
        context.lineTo(bar.base.x + Math.cos(r) * r2, bar.base.y + 20 + Math.sin(r) * r2 * 0.6);
        context.strokeStyle = colorOpacity(lime, 1 - k);
        context.lineWidth = 10;
        context.lineCap = "round";
        context.stroke();
      }
    }
  });
  const slide = frame.slide;
  if (slide > 0 && slide < 1) {
    const x = 200 + 840 * slide;
    for (let k = 0; k < 3; k++) {
      context.beginPath();
      context.moveTo(x - 260 - k * 40, 760 - (x - 260 - 228) * 0.295 - 40 + k * 40);
      context.lineTo(x - 40, 760 - (x - 40 - 228) * 0.295 - 40 + k * 40);
      context.strokeStyle = colorOpacity(hot, 0.5 - k * 0.12);
      context.lineWidth = 6 - k * 1.5;
      context.lineCap = "round";
      context.stroke();
    }
  }
  const ring = frame.ring;
  if (ring !== undefined) {
    const k = ring;
    context.beginPath();
    context.ellipse(620, 640, 120 + 820 * k, 100 + 700 * k, 0, 0, Math.PI * 2);
    context.strokeStyle = colorOpacity(lime, (1 - k) * 0.55);
    context.lineWidth = 14 * (1 - k) + 1;
    context.lineCap = "butt";
    context.stroke();
  }

  // The reps.
  poses.forEach((pose, i) => {
    if (!pose.visible) return;
    context.save();
    place(LoaderFrame.bars[i], pose.offset, pose.scale, context);
    fill(LoaderFrame.bars[i].points, lime, context);
    context.restore();
  });

  // The bar, revealed as it slides in.
  context.save();
  context.beginPath();
  context.rect(180, 380, 860 * slide + 20, 460);
  context.clip();
  fill(LoaderFrame.crossbar, lime, context);
  context.restore();

  const flash = frame.flash;
  if (flash > 0) {
    context.save();
    context.globalAlpha = flash * 0.85;
    fill(LoaderFrame.crossbar, hot, context);
    for (const bar of LoaderFrame.bars) fill(bar.points, colorOpacity(hot, 0.5), context);
    context.restore();
  }
}

/** Moves a bar along its drop line and squashes it about its foot. */
function place(bar: LoaderFrame_Bar, offset: number, scale: { width: number; height: number }, context: CanvasRenderingContext2D) {
  const a = anchor(bar);
  context.translate(a.x + bar.direction.dx * offset, a.y + bar.direction.dy * offset);
  context.scale(scale.width, scale.height);
  context.translate(-a.x, -a.y);
}

/** A shape of the mark: filled, with the 16-unit round outline that softens its corners. */
function fill(points: Point[], color: string, context: CanvasRenderingContext2D) {
  context.beginPath();
  points.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 16;
  context.lineJoin = "round";
  context.stroke();
}

// MARK: Shadow, wordmark, caption

function Shadow({ frame, lift }: { frame: LoaderFrame; lift: number }) {
  const scale = 1 + lift / 200;
  // CSS `radial-gradient(closest-side, …)`: an ellipse touching the box's sides.
  return (
    <div
      style={{
        width: 170,
        height: 12,
        background: `radial-gradient(closest-side, ${colorOpacity(SL.Signal.action, 0.22)}, ${colorOpacity(SL.Signal.action, 0)})`,
        transform: `scaleX(${Math.max(0.45, scale)})`,
        opacity: frame.shadowVisible ? Math.min(1, Math.max(0.3, scale)) : 0,
      }}
    />
  );
}

function Wordmark({ frame }: { frame: LoaderFrame }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "max-content" }}>
      <div style={{ display: "flex", flexDirection: "row", gap: tracking, height: wordLine, overflow: "hidden" }}>
        {[..."SETLINE"].map((letter, i) => (
          <span
            key={i}
            style={{
              ...slFont(wordSize, 700),
              fontStretch: "125%",
              color: SL.Ink.primary,
              height: wordLine,
              lineHeight: `${wordLine}px`,
              display: "block",
              transform: `translateY(${(1 - frame.letter(i)) * wordLine * 1.1}px)`,
            }}
          >
            {letter}
          </span>
        ))}
      </div>
      <div
        style={{
          width: 132,
          height: 2,
          borderRadius: 1,
          background: SL.Signal.action,
          transform: `scaleX(${frame.underline})`,
          transformOrigin: "left center",
        }}
      />
    </div>
  );
}

function Caption({ frame, reps }: { frame: LoaderFrame; reps: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        width: "max-content",
        opacity: frame.caption,
        transform: `translateY(${(1 - frame.caption) * 8}px)`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 5 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 5,
              height: 18,
              borderRadius: 2,
              background: reps > i ? SL.Signal.action : SL.Surface.hairlineStrong,
              // CSS `skewX(-9deg)` about the tick's centre (5 × 18).
              transform: `skewX(-9deg) scaleY(${reps === i + 1 ? 1.15 : 1})`,
            }}
          />
        ))}
      </div>
      <span style={{ ...slFont(SL.TypeSize.body, SL.Weight.regular), color: SL.Ink.secondary, whiteSpace: "nowrap" }}>Warming up…</span>
    </div>
  );
}
