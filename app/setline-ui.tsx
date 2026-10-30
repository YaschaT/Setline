"use client";

/**
 * The SETLINE redesign's building blocks: its icon set, the bottom sheet, the
 * weight and rep steppers, the rest timer and the two charts.
 *
 * Icons are the design's own paths, stroked in `currentColor` so a control's
 * colour is set once, in CSS. Everything that ticks (the rest timer, the
 * session clock) owns its own clock, so a running timer re-renders a pill
 * rather than the whole app every second.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { describePlates, formatClock, formatKg, platesPerSide } from "@/lib/setline-log";

/* ------------------------------------------------------------------ icons */

type IconProps = { size?: number; className?: string };

function Svg({ size, viewBox, children, className, strokeWidth = 1.7, fill = "none" }: IconProps & {
  viewBox: string;
  children: ReactNode;
  strokeWidth?: number;
  fill?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={fill}
      stroke={fill === "none" ? "currentColor" : "none"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconCalendar({ size = 22, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 22 22" className={className}>
      <rect x="3" y="4.5" width="16" height="14" rx="3" />
      <path d="M3 9h16M7.5 2.5v3M14.5 2.5v3" />
    </Svg>
  );
}

export function IconBarbell({ size = 22, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 22 22" className={className}>
      <path d="M3 11h16M5.5 7.5v7M16.5 7.5v7M2.5 9.5v3M19.5 9.5v3" />
    </Svg>
  );
}

export function IconFork({ size = 22, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 22 22" className={className}>
      <path d="M6 3v7a2.5 2.5 0 0 0 5 0V3M8.5 10v9M16 3c1.6 1.2 2 3.2 2 5s-.6 3-2 3.4V19" />
    </Svg>
  );
}

export function IconChart({ size = 22, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 22 22" className={className}>
      <path d="M3 17l5-6 4 3 6-8" />
      <path d="M3 19.5h16" />
    </Svg>
  );
}

export function IconCamera({ size = 22, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 22 22" className={className}>
      <rect x="2.5" y="6" width="17" height="12.5" rx="3" />
      <circle cx="11" cy="12.2" r="3.2" />
      <path d="M8 6l1.2-2.2h3.6L14 6" />
    </Svg>
  );
}

export function IconCameraSmall({ size = 20, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 20 20" className={className}>
      <rect x="2.5" y="5.5" width="15" height="11" rx="3" />
      <circle cx="10" cy="11" r="2.8" />
      <path d="M7.5 5.5l1-2h3l1 2" />
    </Svg>
  );
}

export function IconChevronRight({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 14 14" className={className}>
      <path d="M5 3l4 4-4 4" />
    </Svg>
  );
}

export function IconChevronLeft({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 14 14" className={className}>
      <path d="M9 3L5 7l4 4" />
    </Svg>
  );
}

export function IconChevronDown({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 14 14" className={className}>
      <path d="M3 5l4 4 4-4" />
    </Svg>
  );
}

export function IconClock({ size = 15, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 16 16" strokeWidth={1.6} className={className}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.6V8l2.4 1.6" />
    </Svg>
  );
}

export function IconMoon({ size = 16, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 16 16" strokeWidth={1.6} className={className}>
      <path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6z" />
    </Svg>
  );
}

export function IconPlay({ size = 16, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M4 2.8v10.4L13 8z" />
    </Svg>
  );
}

export function IconClose({ size = 16, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 16 16" strokeWidth={1.8} className={className}>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </Svg>
  );
}

export function IconPlus({ size = 16, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 16 16" strokeWidth={2} className={className}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  );
}

export function IconCheck({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 14 14" strokeWidth={2} className={className}>
      <path d="M3 7.5l3 3 5-6" />
    </Svg>
  );
}

/** The lime tick in a tinted disc that marks a finished day. */
export function IconDone({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="8" fill="rgba(200,255,102,.15)" />
      <path d="M5.5 9.2l2.4 2.4 4.6-5" stroke="#c8ff66" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSkip({ size = 18, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 18 18" strokeWidth={1.8} className={className}>
      <path d="M4 4l7 5-7 5M14 4v10" />
    </Svg>
  );
}

export function IconPlates({ size = 16, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 14 14" strokeWidth={1.8} className={className}>
      <path d="M2 7h10M4 4.5v5M10 4.5v5" />
    </Svg>
  );
}

export function IconImage({ size = 22, className }: IconProps) {
  return (
    <Svg size={size} viewBox="0 0 16 16" strokeWidth={1.4} className={className}>
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <path d="M2 11l3.5-3.5 3 3 2-2L14 12" />
    </Svg>
  );
}

/* ------------------------------------------------------ category glyphs */

export type CategoryKind = "push" | "pull" | "legs" | "upper" | "lower" | "full" | "rest";

/**
 * One glyph set; the label names the type. Full body has no glyph of its own
 * in the design, so it borrows the upper-body one — the label tells them apart.
 */
export function CategoryGlyph({ kind, size = 26 }: { kind: CategoryKind; size?: number }) {
  if (kind === "rest") return <IconMoon size={Math.round(size * 0.8)} />;
  const paths: Record<Exclude<CategoryKind, "rest">, ReactNode> = {
    push: <><path d="M3 12h18" /><path d="M6 8v8M8.5 9.5v5M18 8v8M15.5 9.5v5" /></>,
    pull: <><path d="M12 3v7" /><path d="M7 16l5-6 5 6z" /><path d="M5 20h14" /></>,
    legs: <><path d="M6 3v18M18 3v18" /><path d="M3 8h18" /><path d="M9 21v-5l3-3 3 3v5" /></>,
    upper: <><path d="M5 17L17 5" /><path d="M3.5 15.5l5 5M6 13l5 5M13 6l5 5M15.5 3.5l5 5" /></>,
    full: <><path d="M5 17L17 5" /><path d="M3.5 15.5l5 5M6 13l5 5M13 6l5 5M15.5 3.5l5 5" /></>,
    lower: <><path d="M3 19h18" /><path d="M6 16v6M18 16v6" /><path d="M12 3v4M10 7h4l1 6H9z" /></>,
  };
  return (
    <Svg size={size} viewBox="0 0 24 24" className="sl-glyph">
      {paths[kind]}
    </Svg>
  );
}

/* ------------------------------------------------------------------ sheet */

/**
 * The design's bottom sheet, on the shared dialog primitive so focus is
 * trapped, Escape closes it and the title labels it.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="sl-sheet-overlay" />
        <DialogPrimitive.Content className="sl-sheet" {...(subtitle ? {} : { "aria-describedby": undefined })}>
          <div className="sl-sheet-head">
            <div>
              <DialogPrimitive.Title className="sl-sheet-title">{title}</DialogPrimitive.Title>
              {subtitle ? <DialogPrimitive.Description className="sl-sheet-sub">{subtitle}</DialogPrimitive.Description> : null}
            </div>
            <DialogPrimitive.Close className="sl-sheet-close" aria-label="Sluiten">
              <IconClose />
            </DialogPrimitive.Close>
          </div>
          <div className="sl-sheet-body">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------------------------------------------------------------- clocks */

/**
 * The wall clock, sampled while `active`. `null` until the first sample, so a
 * render never reads the clock itself.
 */
function useNow(active: boolean, intervalMs: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    // A timeout, not a frame: frames stall in a background tab.
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [active, intervalMs]);
  return now;
}

/**
 * The clock for one countdown: sampled four times a second until `endsAt`,
 * then left alone. A new `endsAt` starts it again.
 */
function useCountdown(endsAt: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current < endsAt) timer = window.setTimeout(tick, Math.min(250, endsAt - current));
    };
    // A timeout, not a frame: frames stall in a background tab.
    let timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, [endsAt]);
  return now;
}

/** "sessie 17 min" — minutes since the session started. */
export function SessionClock({ startedAt }: { startedAt: number }) {
  const now = useNow(true, 20_000);
  if (now === null) return null;
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000));
  return <span className="sl-log-clock sl-num">sessie {minutes} min</span>;
}

export type RestTimerState = {
  endsAt: number;
  total: number;
  planned: number;
};

/**
 * The rest timer: the only floating element. It starts when a set is saved,
 * +30 s lengthens the running rest instead of restarting it, and tapping the
 * time opens the full controls.
 */
export function RestPill({
  timer,
  onAdjust,
  onReset,
  onSkip,
  onDismiss,
  onOpenLog,
}: {
  timer: RestTimerState;
  onAdjust: (seconds: number) => void;
  onReset: () => void;
  onSkip: () => void;
  onDismiss: () => void;
  /** From another tab the pill leads back to the logging screen. */
  onOpenLog?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const now = useCountdown(timer.endsAt);
  // Until the first sample there is no time to show, rather than a wrong one.
  const remaining = now === null ? null : Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  const done = remaining === 0;
  const percent = remaining === null ? 100 : timer.total > 0 ? Math.min(100, Math.round((remaining / timer.total) * 100)) : 0;
  const clock = remaining === null ? "" : formatClock(remaining);
  const plannedLabel = formatClock(timer.planned);

  const announcement = <span className="sl-sr-only" role="status" aria-live="polite">{done ? "Rust afgelopen" : ""}</span>;

  if (expanded && !onOpenLog) {
    return (
      <div className="sl-rest-expanded" data-done={done || undefined}>
        {announcement}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="sl-rest-open"
            onClick={() => setExpanded(false)}
            aria-expanded="true"
            aria-label={`Rust ${done ? "afgelopen" : `${clock} over`} — bediening sluiten`}
          >
            <span className="sl-rest-big sl-num">{done ? "0:00" : clock}</span>
            <span className="sl-rest-track" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
          </button>
        </div>
        <div className="sl-rest-controls">
          <button type="button" className="sl-num" onClick={() => onAdjust(-30)} disabled={done} aria-label="Rust 30 seconden korter">−30s</button>
          <button type="button" className="sl-num" onClick={() => onAdjust(30)} aria-label="Rust 30 seconden langer">+30s</button>
          <button type="button" className="sl-num" data-kind="plan" onClick={onReset} aria-label={`Rust terugzetten naar het plan: ${plannedLabel}`}>{plannedLabel} vast</button>
          <button type="button" data-kind="skip" onClick={done ? onDismiss : onSkip} aria-label={done ? "Timer sluiten" : "Rust overslaan"}><IconSkip /></button>
        </div>
        <p className="sl-rest-note">Bijstellen verlengt de lopende timer · de sessie loopt door</p>
      </div>
    );
  }

  return (
    <div className="sl-rest" data-done={done || undefined}>
      {announcement}
      <button
        type="button"
        className="sl-rest-open"
        onClick={() => (onOpenLog ? onOpenLog() : setExpanded(true))}
        aria-expanded={onOpenLog ? undefined : false}
        aria-label={
          onOpenLog
            ? `Rust ${done ? "afgelopen" : `${clock} over`} — naar loggen`
            : `Rust ${done ? "afgelopen" : `${clock} over`} — bijstellen`
        }
      >
        <span className="sl-rest-title">{done ? "Rust afgelopen" : "Rust"}</span>
        {!done && <span className="sl-rest-time sl-num">{clock}</span>}
        <span className="sl-rest-track" aria-hidden="true" style={done ? { background: "transparent" } : undefined}>
          <i style={{ width: `${percent}%` }} />
        </span>
      </button>
      <button type="button" className="sl-rest-add sl-num" onClick={() => onAdjust(30)} aria-label="Rust 30 seconden langer">+30s</button>
      <button type="button" className="sl-rest-skip" onClick={done ? onDismiss : onSkip} aria-label={done ? "Timer sluiten" : "Rust overslaan"}>
        {done ? <IconClose /> : <IconSkip />}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- stepper */

/** How wide a number reads, in digits: a comma is narrow. */
function charWeight(text: string) {
  let weight = 0;
  for (const character of text) weight += character === "," || character === "." ? 0.4 : 1;
  return Math.max(1, weight);
}

/**
 * −/+ around a big number. One tap is one step; a long press on either
 * button, or a tap on the number, opens a field for a value off the step.
 */
export function Stepper({
  label,
  kind = "weight",
  value,
  step,
  min,
  max = 999,
  unit,
  decimals = false,
  onChange,
}: {
  label: string;
  kind?: "weight" | "reps" | "small";
  value: number | null;
  step: number;
  min: number;
  max?: number;
  unit: string;
  decimals?: boolean;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const display = value === null ? "—" : decimals ? formatKg(value) : String(Math.round(value));
  const current = value ?? 0;

  const openEditor = () => {
    setText(value === null ? "" : decimals ? formatKg(value) : String(Math.round(value)));
    setEditing(true);
  };
  const commit = () => {
    const parsed = Number(text.trim().replace(",", "."));
    if (text.trim() !== "" && Number.isFinite(parsed)) {
      const bounded = Math.min(max, Math.max(min, decimals ? Math.round(parsed * 100) / 100 : Math.round(parsed)));
      onChange(bounded);
    }
    setEditing(false);
  };
  const startPress = () => {
    longPressed.current = false;
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      pressTimer.current = null;
      openEditor();
    }, 550);
  };
  const endPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const stepBy = (direction: 1 | -1) => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    const next = Math.min(max, Math.max(min, Math.round((current + direction * step) * 100) / 100));
    onChange(next);
  };
  const pressHandlers = {
    onPointerDown: startPress,
    onPointerUp: endPress,
    onPointerLeave: endPress,
    onPointerCancel: endPress,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  };
  const stepLabel = decimals ? formatKg(step) : String(step);

  return (
    <div className="sl-stepper" data-kind={kind}>
      <div className="sl-stepper-label">{label}</div>
      <div className="sl-stepper-row">
        <button
          type="button"
          className="sl-stepper-btn"
          onClick={() => stepBy(-1)}
          disabled={value !== null && current <= min}
          aria-label={`${label} ${stepLabel} ${unit} lager`}
          {...pressHandlers}
        >
          −
        </button>
        {editing ? (
          <input
            ref={(element) => element?.focus()}
            className="sl-stepper-value sl-num"
            inputMode={decimals ? "decimal" : "numeric"}
            enterKeyHint="done"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setEditing(false);
            }}
            aria-label={`${label} in ${unit}`}
          />
        ) : (
          <button
            type="button"
            className="sl-stepper-value sl-num"
            data-empty={value === null || undefined}
            style={{ "--sl-chars": charWeight(display) } as CSSProperties}
            onClick={openEditor}
            aria-label={`${label}: ${value === null ? "nog niet ingevuld" : `${display} ${unit}`}. Tik om te typen.`}
          >
            {display}
          </button>
        )}
        <button
          type="button"
          className="sl-stepper-btn"
          onClick={() => stepBy(1)}
          disabled={current >= max}
          aria-label={`${label} ${stepLabel} ${unit} hoger`}
          {...pressHandlers}
        >
          +
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- plates */

const PLATE_LOOK: Record<string, { width: number; height: number; color: string }> = {
  "20": { width: 26, height: 96, color: "#c8ff66" },
  "10": { width: 22, height: 70, color: "#72efd0" },
  "5": { width: 20, height: 60, color: "#b3bdb8" },
  "2.5": { width: 18, height: 56, color: "#9aa6a1" },
  "1.25": { width: 18, height: 52, color: "#9aa6a1" },
};

/** One side of the bar, drawn as the design draws it, with the words below. */
export function PlateStack({ total, bar }: { total: number; bar: number }) {
  const { plates } = platesPerSide(total, bar);
  return (
    <>
      <div className="sl-plates" aria-hidden="true">
        <i />
        {plates.map((plate, index) => {
          const look = PLATE_LOOK[String(plate)] ?? PLATE_LOOK["1.25"];
          return (
            <span key={`${plate}-${index}`} className="sl-plate" style={{ width: look.width, height: look.height, background: look.color }}>
              <span className="sl-num">{formatKg(plate)}</span>
            </span>
          );
        })}
        <i />
      </div>
      <p className="sl-plates-text sl-num">{describePlates(total, bar)}</p>
    </>
  );
}

/* ---------------------------------------------------------------- charts */

/**
 * Body weight: every measurement in grey, the trailing average in lime, the
 * latest average marked. The line is drawn in a fixed box and stretched to
 * the card; the marker is placed in HTML so it stays round.
 */
export function WeightChart({ points }: { points: Array<{ date: string; value: number; average: number }> }) {
  if (points.length < 2) return null;
  const width = 318;
  const height = 108;
  const values = points.flatMap((point) => [point.value, point.average]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const first = new Date(`${points[0].date}T12:00:00`).getTime();
  const last = new Date(`${points[points.length - 1].date}T12:00:00`).getTime();
  const span = last - first || 1;
  const x = (date: string) => 2 + ((new Date(`${date}T12:00:00`).getTime() - first) / span) * (width - 4);
  const y = (value: number) => 14 + (1 - (value - min) / range) * (height - 28);
  const daily = points.map((point) => `${x(point.date).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const average = points.map((point) => `${x(point.date).toFixed(1)},${y(point.average).toFixed(1)}`).join(" ");
  const end = points[points.length - 1];

  const months: string[] = [];
  const cursor = new Date(first);
  cursor.setDate(1);
  while (cursor.getTime() <= last) {
    months.push(cursor.toLocaleDateString("nl-BE", { month: "short" }).replace(".", ""));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="sl-chart">
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Lichaamsgewicht per meting en het 14-daagse gemiddelde">
          <path d={`M0 ${height * 0.37} L${width} ${height * 0.37}`} stroke="#1c2422" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={`M0 ${height * 0.69} L${width} ${height * 0.69}`} stroke="#1c2422" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polyline points={daily} fill="none" stroke="rgba(242,245,243,.35)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <polyline points={average} fill="none" stroke="#c8ff66" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `calc(${(x(end.date) / width) * 100}% - 4px)`,
            top: `calc(${(y(end.average) / height) * 100}% - 4px)`,
            width: 8,
            height: 8,
            borderRadius: 999,
            background: "#c8ff66",
          }}
        />
      </div>
      {months.length > 1 && (
        <div className="sl-chart-axis sl-num" aria-hidden="true">
          {months.map((month, index) => <span key={`${month}-${index}`}>{month}</span>)}
        </div>
      )}
      <div className="sl-legend">
        <span><i />dagwaarde</span>
        <span><i data-tone="action" />14-daags gemiddelde</span>
      </div>
    </div>
  );
}

/** Tonnage per week as bars, this week in full lime. */
export function VolumeBars({ weeks }: { weeks: Array<{ key: string; week: number; kg: number; current: boolean }> }) {
  const max = Math.max(...weeks.map((week) => week.kg), 1);
  const labelled = weeks.filter((_, index) => index % 2 === 0 || index === weeks.length - 1);
  return (
    <div className="sl-list sl-volume">
      <div className="sl-volume-bars" role="img" aria-label={weeks.map((week) => `week ${week.week}: ${formatKg(Math.round(week.kg / 100) / 10)} ton`).join(", ")}>
        {weeks.map((week) => (
          <i key={week.key} data-current={week.current || undefined} style={{ height: `${Math.max(2, (week.kg / max) * 100)}%` }} />
        ))}
      </div>
      <div className="sl-volume-axis sl-num" aria-hidden="true">
        {labelled.map((week) => (
          <span key={week.key} data-current={week.current || undefined}>
            w{week.week}{week.current ? " · deze week" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The rendered height of an element, kept current. The logging screen pads
 * its reading area by the height of the fixed controls under it, so nothing
 * scrolls out of reach behind them.
 */
export function useElementHeight<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const size = entry.borderBoxSize?.[0]?.blockSize ?? element.getBoundingClientRect().height;
      setHeight(Math.ceil(size));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, height] as const;
}
