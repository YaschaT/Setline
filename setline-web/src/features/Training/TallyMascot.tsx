// TallyMascot.swift — Tally: the SETLINE mark as a small character that
// counts the week.
//
// The logo is three slanted bars struck through by a fourth — a tally. Here
// there is one bar for each workout the week asks for: lime once done,
// dashed while still to come, each a little higher than the last, as the
// mark rises. When the week is met the crossbar strikes through them. The
// face sits on the newest bar — the workout you just did — and on the
// crossbar once the week is struck.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SL } from "../../design/tokens";
import { colorOpacity } from "../../design/SetlineTokens";
import { useReduceMotion } from "../../design/support";

/** `TallyMascot.Mood`. */
export type TallyMascot_Mood =
  /** A workout planned today, not done yet. */
  | "ready"
  /** A lift can go up today. */
  | "focused"
  /** Trained today. */
  | "proud"
  /** A rest day. */
  | "resting"
  /** The week's goal is met. */
  | "struck";
export const TallyMascot_Mood = {
  ready: "ready" as TallyMascot_Mood,
  focused: "focused" as TallyMascot_Mood,
  proud: "proud" as TallyMascot_Mood,
  resting: "resting" as TallyMascot_Mood,
  struck: "struck" as TallyMascot_Mood,
  allCases: ["ready", "focused", "proud", "resting", "struck"] as TallyMascot_Mood[],
};

// The mark, in bar widths, from the loader's artwork (bar 1 at the origin).
const barPoints = [
  { x: 0.349, y: 0.354 },
  { x: 1, y: 0 },
  { x: 0.651, y: 2.531 },
  { x: 0, y: 2.828 },
];
const step = { width: 1.112, height: -0.401 };
const slope = -0.295;

export function TallyMascot({
  done,
  goal,
  mood,
  unit = 13,
  jumps = 0,
}: {
  done: number;
  goal: number;
  mood: TallyMascot_Mood;
  /** Bar width in points; the whole mark scales from it. */
  unit?: number;
  /** Bumped by the caller to make it jump (a tap, a finished workout). */
  jumps?: number;
}) {
  const reduceMotion = useReduceMotion();
  const [bobbing, setBobbing] = useState(false);
  const [blink, setBlink] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const firstJump = useRef(true);

  const count = Math.min(Math.max(goal, 1), 7);
  const filled = Math.min(done, count);
  const size = {
    width: ((count - 1) * step.width + 1.6) * unit,
    height: (2.828 + (count - 1) * -step.height + 0.4) * unit,
  };
  /** Where bar `i` starts, in points, inside the frame. */
  const origin = (i: number) => {
    const top = (count - 1) * -step.height;
    return { x: (0.34 + i * step.width) * unit, y: (top + i * step.height + 0.2) * unit };
  };
  const lime = mood === "resting" ? SL.Signal.recovery : SL.Signal.action;

  // Only once the screen has settled; then the bars do reps and Tally blinks now and then.
  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setBobbing(true);
        const loop = () => {
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              setBlink(true);
              timers.push(
                setTimeout(() => {
                  if (cancelled) return;
                  setBlink(false);
                  loop();
                }, 120),
              );
            }, (2.6 + Math.random() * 1.6) * 1000),
          );
        };
        loop();
      }, 600),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduceMotion]);

  // `.keyframeAnimator(trigger: jumps)`: up by 0.9 of a bar, then a bouncy landing.
  useEffect(() => {
    if (firstJump.current) {
      firstJump.current = false;
      return;
    }
    root.current?.animate(
      [
        { transform: "translateY(0)", easing: "cubic-bezier(.3,1.2,.5,1)" },
        { transform: `translateY(${-unit * 0.9}px)`, offset: 0.16 / 0.51, easing: "cubic-bezier(.3,1.6,.5,1)" },
        { transform: "translateY(0)" },
      ],
      { duration: 510 },
    );
  }, [jumps, unit]);

  const bob = (i: number): React.CSSProperties =>
    bobbing && !reduceMotion
      ? { animation: `sl-tally-bob 0.55s ease-in-out ${i * 0.12}s infinite alternate`, ["--sl-tally-lift" as string]: `${-unit * 0.22}px` }
      : {};

  const stroke = unit * 0.14;
  const bar = (fill: string, i: number) => {
    const o = origin(i);
    const pts = barPoints.map((p) => `${o.x + p.x * unit},${o.y + p.y * unit}`).join(" ");
    return <polygon points={pts} fill={fill} stroke={fill} strokeWidth={stroke} strokeLinejoin="round" />;
  };

  // The fourth stroke, across every bar, rising as the mark does.
  const crossbar = (() => {
    const first = origin(0);
    const left = { x: first.x - 0.33 * unit, y: first.y + 1.4 * unit };
    const span = ((count - 1) * step.width + 1.85) * unit;
    const rise = slope * span;
    const pts = [
      [left.x, left.y],
      [left.x + span, left.y + rise],
      [left.x + span - 0.04 * unit, left.y + rise + 0.44 * unit],
      [left.x - 0.02 * unit, left.y + 0.44 * unit],
    ];
    return <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={SL.Signal.action} />;
  })();

  // Two eyes on the newest bar — or on the crossbar once the week is struck.
  const anchor = (() => {
    if (mood === "struck") {
      const first = origin(0);
      const mid = ((count - 1) * step.width + 1.85) / 2;
      return { x: first.x + (mid - 0.33) * unit, y: first.y + (1.4 + slope * mid + 0.22) * unit };
    }
    const o = origin(Math.max(filled - 1, 0));
    return { x: o.x + 0.6 * unit, y: o.y + 0.82 * unit };
  })();
  const ink = filled === 0 && mood !== "struck" ? lime : SL.Signal.onAction;
  const eye = unit * 0.25;
  const gap = unit * 0.13;

  const row = (spacing: number, children: ReactNode) => (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: spacing }}>{children}</div>
  );
  const capsule = (w: number, h: number, key: number, extra?: React.CSSProperties) => (
    <div key={key} style={{ width: w, height: h, borderRadius: Math.min(w, h) / 2, background: ink, flexShrink: 0, transition: "height 0.08s ease-out", ...extra }} />
  );
  const arch = (key: number) => {
    const w = eye * 1.35;
    const h = eye * 0.9;
    return (
      <svg key={key} width={w} height={h} style={{ overflow: "visible", display: "block" }}>
        <path d={`M0 ${h} Q${w / 2} ${-h * 0.6} ${w} ${h}`} fill="none" stroke={ink} strokeWidth={eye * 0.8} strokeLinecap="round" />
      </svg>
    );
  };

  let faceContent: ReactNode;
  switch (mood) {
    case "proud":
    case "struck":
      faceContent = row(gap * 0.6, [0, 1].map((k) => arch(k)));
      break;
    case "resting":
      faceContent = row(gap * 0.6, [0, 1].map((k) => capsule(eye * 1.15, eye * 0.6, k)));
      break;
    case "ready":
    case "focused":
      faceContent = (
        <div style={{ position: "relative" }}>
          {row(gap, [0, 1].map((k) => capsule(eye * 1.05, blink ? eye * 0.3 : eye * 1.45, k)))}
          {mood === "focused" && (
            // Brows down: today there is a weight to beat.
            <div style={{ position: "absolute", top: 0, left: "50%", transform: `translate(-50%, ${-eye * 1.4}px)`, display: "flex", gap: gap * 1.2 }}>
              {capsule(eye * 1.8, eye * 0.5, 0, { transform: "rotate(18deg)", transition: "none" })}
              {capsule(eye * 1.8, eye * 0.5, 1, { transform: "rotate(-18deg)", transition: "none" })}
            </div>
          )}
        </div>
      );
      break;
  }

  return (
    <div
      ref={root}
      role="img"
      aria-label={`${filled} of ${count} workouts this week`}
      style={{ position: "relative", width: size.width, height: size.height, flexShrink: 0 }}
    >
      <style>{"@keyframes sl-tally-bob { from { transform: translateY(0); } to { transform: translateY(var(--sl-tally-lift)); } }"}</style>
      <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0, overflow: "visible" }} aria-hidden>
        {Array.from({ length: count }, (_, i) => {
          const isDone = i < filled;
          return (
            <g key={i} style={isDone && mood !== "resting" ? bob(i) : undefined}>
              {/* Still to come: the bar's place, faintly lit. */}
              {bar(isDone ? lime : colorOpacity(lime, 0.13), i)}
            </g>
          );
        })}
        {mood === "struck" && crossbar}
      </svg>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: anchor.x,
          top: anchor.y,
          ...(mood !== "resting" && filled > 0 ? bob(Math.max(filled - 1, 0)) : {}),
        }}
      >
        {/* The bar leans, so the face does too. */}
        <div style={{ transform: "translate(-50%, -50%) rotate(-8deg)" }}>{faceContent}</div>
      </div>
    </div>
  );
}
