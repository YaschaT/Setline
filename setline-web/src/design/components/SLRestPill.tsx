// SLRestPill.swift — Redesign 1b · the rest timer.
//
// One row above the input card: `REST`, the time left, a thin track, `+30s`
// and skip. Tapping the row opens the larger version with `−30s`, `+30s`,
// the prescribed rest and skip. Neutral: the time in ink, the controls in
// grey, and mint only on the thin track that empties. The only translucent
// surface in the app.
import type { CSSProperties, ReactNode } from "react";
import { SL, slFont, slNumerals } from "../tokens";
import { Text } from "../swiftui";
import { colorOpacity } from "../SetlineTokens";
import { slLineHeight } from "../SLDynamicType";
import { PressButton, useFillWidth } from "../support";
import { slTitle } from "./SLText";
import { SLGlyph } from "./SLGlyph";
import { SLOverline } from "./SLPieces";
import { SLWeightedRow, slWeight } from "./SLFlow";

export function SLRestPill({
  title,
  remaining,
  total,
  planned,
  isExpanded,
  onAdjust,
  onReset,
  onToggleExpanded,
  onSkip,
}: {
  /** "Rust · primaire lift 3:00" — spoken, not drawn. */
  title: string;
  remaining: number;
  total: number;
  /** The rest the exercise's role prescribes, which reset returns to. */
  planned: number;
  isExpanded: boolean;
  onAdjust: (seconds: number) => void;
  onReset: () => void;
  onToggleExpanded: () => void;
  /** Skips a running rest, and clears away one that has run out. */
  onSkip: () => void;
}) {
  const [ref, fill] = useFillWidth<HTMLDivElement>();
  const isDone = remaining <= 0;
  const step = Math.trunc(SL.Metric.restAdjustStep);
  const clock = SLRestPill.clockLabel(remaining);
  const fraction = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const spoken = isDone ? "Rest done" : `${title}, ${Math.trunc(remaining / 60)} minutes ${remaining % 60} seconds left`;

  /** A 4pt track that empties as the rest runs; it steps once a second, no sweep. */
  const track = (style?: CSSProperties) => (
    <div aria-hidden style={{ position: "relative", height: 4, flex: "1 1 0", minWidth: 0, ...style }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 2, background: isDone ? "transparent" : SL.Surface.hairlineStrong }} />
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fraction * 100}%`, borderRadius: 2, background: SL.Signal.recovery }} />
    </div>
  );

  const skipButton = (width?: number, style?: CSSProperties) => (
    <PressButton
      onPress={onSkip}
      aria-label={isDone ? "Close timer" : "Skip rest"}
      style={{
        flexShrink: 0,
        width,
        height: width,
        minWidth: SL.Space.hitMin,
        minHeight: SL.Space.hitMin,
        display: "grid",
        placeItems: "center",
        borderRadius: SL.Radius.md,
        background: width === undefined ? "transparent" : "rgba(255, 255, 255, 0.06)",
        ...style,
      }}
    >
      <SLGlyph name={isDone ? "IconClose" : "IconSkip"} size={isDone ? 16 : 18} color={SL.Ink.secondary} />
    </PressButton>
  );

  const outlined = (children: ReactNode, a: { label: string; onPress: () => void; disabled?: boolean; ink?: string; weight?: 400 | 600; style?: CSSProperties }) => (
    <PressButton
      onPress={a.onPress}
      disabled={a.disabled}
      aria-label={a.label}
      style={{
        ...slFont(SL.TypeSize.body, a.weight ?? SL.Weight.semibold),
        ...slNumerals,
        lineHeight: 1.25,
        color: a.ink ?? SL.Ink.primary,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        minHeight: 48 + 2 * SL.Metric.border,
        border: `${SL.Metric.border}px solid ${SL.Surface.hairlineStrong}`,
        borderRadius: SL.Radius.md,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: a.disabled ? 0.4 : 1,
        ...a.style,
      }}
    >
      {children}
    </PressButton>
  );

  const compact = (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10, padding: `10px ${SL.Space.s1}px 10px ${SL.Space.s3}px` }}>
      <PressButton
        onPress={onToggleExpanded}
        aria-label={`${spoken}. Double-tap to adjust the rest`}
        style={{ flex: "1 1 0", minWidth: 0, minHeight: SL.Space.hitMin, display: "flex", flexDirection: "row", alignItems: "center", gap: 10, textAlign: "left" }}
      >
        <SLOverline text={isDone ? "Rest done" : "Rest"} color={isDone ? SL.Ink.primary : SL.Ink.secondary} style={{ whiteSpace: "nowrap", flexShrink: 0 }} />
        {!isDone && (
          <Text {...slTitle()} numerals color={SL.Ink.primary} lineLimit={1} style={{ minWidth: 62, flexShrink: 0, overflow: "visible" }}>
            {clock}
          </Text>
        )}
        {track({ minWidth: 24 })}
      </PressButton>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", flexShrink: 0 }}>
        {/* addButton */}
        <PressButton
          onPress={() => onAdjust(step)}
          aria-label={`Rest ${step} seconds longer`}
          style={{
            ...slFont(SL.TypeSize.body, SL.Weight.semibold),
            ...slNumerals,
            lineHeight: 1.25,
            color: SL.Ink.primary,
            whiteSpace: "nowrap",
            paddingLeft: SL.Space.s3 + SL.Metric.border,
            paddingRight: SL.Space.s3 + SL.Metric.border,
            minWidth: 52 + 2 * SL.Metric.border,
            minHeight: SL.Space.hitMin + 2 * SL.Metric.border,
            boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
            borderRadius: SL.Radius.pill,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {`+${step}s`}
        </PressButton>
        {skipButton(undefined)}
      </div>
    </div>
  );

  const expanded = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", padding: 14 }}>
      <PressButton
        onPress={onToggleExpanded}
        aria-label={`${spoken}. Double-tap to close the controls`}
        style={{ minHeight: SL.Space.hitMin, display: "flex", flexDirection: "row", alignItems: "center", gap: 10, textAlign: "left" }}
      >
        <Text
          size={SL.TypeSize.display}
          weight={SL.Weight.semibold}
          numerals
          color={SL.Ink.primary}
          lineLimit={1}
          style={{ ...slLineHeight(1, { size: SL.TypeSize.display }), flexShrink: 0, overflow: "visible" }}
        >
          {isDone ? "0:00" : clock}
        </Text>
        {track()}
      </PressButton>

      <SLWeightedRow spacing={6} style={{ paddingTop: SL.Space.s3 }}>
        {outlined(`−${step}s`, { label: `Rest ${step} seconds shorter`, disabled: isDone, onPress: () => onAdjust(-step) })}
        {outlined(`+${step}s`, { label: `Rest ${step} seconds longer`, onPress: () => onAdjust(step) })}
        {outlined(
          <Text size={SL.TypeSize.body} weight={SL.Weight.regular} numerals color={colorOpacity(SL.Ink.primary, 0.7)} lineLimit={1} minimumScaleFactor={0.8}>
            {`${SLRestPill.clockLabel(planned)} reset`}
          </Text>,
          {
          label: `Reset rest to ${Math.trunc(planned / 60)} minutes ${planned % 60} seconds`,
          onPress: onReset,
          ink: colorOpacity(SL.Ink.primary, 0.7),
          weight: SL.Weight.regular,
          style: slWeight(1.4),
          },
        )}
        {skipButton(48, slWeight(0))}
      </SLWeightedRow>

      <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.secondary} style={{ paddingTop: 10 }}>
        Adjusting changes the running timer · the session keeps going
      </Text>
    </div>
  );

  return (
    <div
      ref={ref}
      role="group"
      style={{
        border: `${SL.Metric.border}px solid ${SL.Surface.hairlineStrong}`,
        borderRadius: SL.Radius.xl,
        background: isDone ? SL.Surface.raised : SL.Surface.floatFill,
        backdropFilter: isDone ? undefined : `blur(${SL.Surface.floatBlur}px) saturate(1.6)`,
        WebkitBackdropFilter: isDone ? undefined : `blur(${SL.Surface.floatBlur}px) saturate(1.6)`,
        minWidth: 0,
        ...fill,
      }}
    >
      {isExpanded ? expanded : compact}
    </div>
  );
}

/** "2:28" — minutes without a leading zero, as the design writes them. */
SLRestPill.clockLabel = (seconds: number): string => {
  const s = Math.max(0, seconds);
  return `${Math.trunc(s / 60)}:${String(Math.trunc(s % 60)).padStart(2, "0")}`;
};

