// SLPieces.swift — the pieces the redesign repeats from screen to screen: the
// head above a list, the date column of a row, the marks a row ends on, the
// amber card that asks for attention, and every tab's head.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { SL } from "../tokens";
import { HStack, Text, VStack } from "../swiftui";
import { SFSymbol } from "../SFSymbol";
import { colorOpacity, spring } from "../SetlineTokens";
import { slLineHeight } from "../SLDynamicType";
import { PressButton, useFillWidth, useReduceMotion } from "../support";
import { slBody, slLead, slMeta, slTitle } from "./SLText";
import { SLGlyph, type SLGlyph_Name, type SLGlyph_NameCase } from "./SLGlyph";
import { SLAvatar } from "./SLAvatar";
import { SLPress } from "./SLPress";
import { formatEnUS } from "../../core/Support/calendar";
import { useApp } from "../../data/AppState";

/** The head of a screen: its name at 21/600 over one line of 15, and whatever the screen puts beside it. */
export function SLScreenTitle({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: ReactNode }) {
  return (
    <HStack alignment="center" spacing={SL.Space.s3} style={{ paddingTop: SL.Space.s1, paddingBottom: SL.Space.s1, alignSelf: "stretch" }}>
      <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
        <Text as="h2" {...slTitle()} color={SL.Ink.primary} style={slLineHeight(SL.LineHeight.title, { size: SL.TypeSize.title })}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text {...slBody()} numerals color={SL.Ink.secondary}>
            {subtitle}
          </Text>
        )}
      </VStack>
      {trailing !== undefined && <div style={{ flexShrink: 0, display: "flex" }}>{trailing}</div>}
    </HStack>
  );
}

/** "Woensdag 9 september" — a date the way every screen head writes it. */
export const SLDateText = {
  long(date: Date): string {
    const text = formatEnUS(date, "EEEE d MMMM");
    return text.slice(0, 1).toUpperCase() + text.slice(1);
  },
};

/** The section head above a list: the title at 17/600 and what it covers at 13 on the same baseline. */
export function SLSectionHead({ title, meta }: { title: string; meta?: string }) {
  const [ref, fill] = useFillWidth<HTMLDivElement>();
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "row", alignItems: "baseline", gap: SL.Space.s3, paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1, minWidth: 0, ...fill }}>
      <Text as="h3" {...slLead()} color={SL.Ink.primary}>
        {title}
      </Text>
      <div aria-hidden style={{ flex: "1 1 0", minWidth: SL.Space.s2 }} />
      {meta !== undefined && (
        <Text {...slMeta()} numerals color={SL.Ink.secondary} align="trailing">
          {meta}
        </Text>
      )}
    </div>
  );
}

/** The date column of an agenda row: the weekday at 13 over the day at 17/600, 40 wide. */
export function SLDateColumn({
  weekday,
  day,
  weekdayInk = SL.Ink.secondary,
  dayInk = SL.Ink.primary,
}: {
  weekday: string;
  day: number;
  weekdayInk?: string;
  dayInk?: string;
}) {
  return (
    <VStack alignment="leading" spacing={0} style={{ width: 40, flexShrink: 0 }}>
      <Text {...slMeta()} color={weekdayInk} lineLimit={1}>
        {weekday}
      </Text>
      <Text {...slLead()} numerals color={dayInk} lineLimit={1} style={slLineHeight(1.2, { size: SL.TypeSize.lead })}>
        {`${day}`}
      </Text>
    </VStack>
  );
}

/** A list row's three parts — what it is filed under, what it says, and how it ends — side by side. */
export function SLAdaptiveRow({
  spacing = 14,
  leading,
  main,
  trailing,
  style,
}: {
  spacing?: number;
  leading?: ReactNode;
  main?: ReactNode;
  trailing?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <HStack alignment="center" spacing={spacing} style={style}>
      {leading}
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>{main}</div>
      {trailing}
    </HStack>
  );
}

/** The lime tick on its tinted disc: a session that was saved. */
export function SLDoneMark() {
  return (
    <div aria-hidden style={{ width: 18, height: 18, flexShrink: 0, display: "grid", placeItems: "center" }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: colorOpacity(SL.Signal.action, 0.15), display: "grid", placeItems: "center" }}>
        <SLGlyph name="IconCheck" size={11} fixed color={SL.Signal.action} />
      </div>
    </div>
  );
}

/** "Today", as the design badges it: lime on the ground, 12/600, tracked. */
export function SLTodayBadge({ height = 28 }: { height?: number }) {
  return (
    <span
      aria-label="Today"
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        minHeight: height,
        paddingLeft: height >= 28 ? 10 : 8,
        paddingRight: height >= 28 ? 10 : 8,
        borderRadius: SL.Radius.pill,
        background: SL.Surface.ground,
        whiteSpace: "nowrap",
      }}
    >
      <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} tracking={SL.TypeSize.micro * 0.06} color={SL.Signal.action}>
        TODAY
      </Text>
    </span>
  );
}

/** The amber card: a dot, an overline in the attention colour, and what needs looking at in plain words. */
export function SLAttentionCard({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <HStack
      alignment="top"
      spacing={SL.Space.s3}
      style={{
        padding: `14px ${SL.Space.s4}px`,
        background: SL.Surface.raised,
        border: `${SL.Metric.border}px solid ${colorOpacity(SL.Signal.attention, 0.35)}`,
        borderRadius: SL.Radius.lg,
      }}
    >
      <div aria-hidden style={{ width: 8, height: 8, marginTop: 5, flexShrink: 0, borderRadius: "50%", background: SL.Signal.attention }} />
      <VStack alignment="leading" spacing={SL.Space.s1} style={{ flex: "1 1 0", minWidth: 0 }}>
        <Text as="h3" size={SL.TypeSize.meta} weight={SL.Weight.semibold} tracking={SL.TypeSize.meta * 0.06} color={SL.Signal.attention}>
          {title.toUpperCase()}
        </Text>
        {children}
      </VStack>
    </HStack>
  );
}

/** The overline above a block: 13/600, tracked, in capitals — "DEZE WEEK". */
export function SLOverline({ text, color = SL.Ink.secondary, style }: { text: string; color?: string; style?: CSSProperties }) {
  return (
    <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} tracking={SL.TypeSize.meta * 0.06} color={color} style={style}>
      {text.toUpperCase()}
    </Text>
  );
}

/** `SLRowButtonStyle` — a row of a list card that can be tapped: the fill steps up while pressed. */
export function SLRowButton(p: { onPress?: () => void; disabled?: boolean; style?: CSSProperties; "aria-label"?: string; children?: ReactNode }) {
  const [ref, fill] = useFillWidth<HTMLButtonElement>();
  return (
    <PressButton
      innerRef={ref}
      onPress={p.onPress}
      disabled={p.disabled}
      aria-label={p["aria-label"]}
      style={(pressed) => ({ display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", background: pressed ? SL.Surface.hairline : "transparent", ...fill, ...p.style })}
    >
      {p.children}
    </PressButton>
  );
}

/** A progress bar as the redesign draws it: a quiet track and a fill that stops at full. Fills from empty as it appears. */
export function SLBar({ fraction, height = 6, fill = SL.Signal.action, style }: { fraction: number; height?: number; fill?: string; style?: CSSProperties }) {
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(false);
  const [ref, fillWidth] = useFillWidth<HTMLDivElement>();
  useEffect(() => {
    if (shown) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const width = Math.min(1, Math.max(0, shown || reduceMotion ? fraction : 0));
  return (
    <div ref={ref} role="progressbar" aria-valuemin={0} aria-valuemax={1} aria-valuenow={fraction} style={{ position: "relative", height, flexShrink: 0, ...fillWidth, ...style }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: height / 2, background: "rgba(255, 255, 255, 0.07)" }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${width * 100}%`,
          borderRadius: height / 2,
          background: fill,
          transition: reduceMotion ? "none" : `width ${spring(0.7, 0.85)} 0.15s`,
        }}
      />
    </div>
  );
}

/**
 * `String.slUnbroken` — keeps on one line what reads as one thing: a number
 * with its unit, "×" with what is on either side of it, and a "·" with the
 * words before it.
 */
export function slUnbroken(text: string): string {
  const nbsp = " ";
  return text
    .split(" · ")
    .join(`${nbsp}· `)
    .split(" × ")
    .join(`${nbsp}×${nbsp}`)
    .replace(/(\d) (kg|g|kcal|min|sets|set|reps|rep|weeks|week|days|day|tonnes|ton)\b/g, `$1${nbsp}$2`);
}

/**
 * Every tab's head: the avatar to Account, the tab's name over one line of
 * context, the tab's own round buttons and the settings gear.
 */
export function SLTabHeader({
  title,
  subtitle,
  ring = "transparent",
  onAccount,
  trailing,
}: {
  title: string;
  subtitle?: string;
  /** Training's streak tier around the avatar: a CSS colour or gradient. Clear elsewhere, the same room kept. */
  ring?: string;
  onAccount: () => void;
  trailing?: ReactNode;
}) {
  const app = useApp();
  return (
    <HStack alignment="center" spacing={SL.Space.s3} style={{ height: SL.Metric.tabHeaderHeight, alignSelf: "stretch" }}>
      <SLPress scale={0.92} onPress={onAccount} aria-label="Profile and settings" style={{ borderRadius: "50%", flexShrink: 0 }}>
        <div style={{ position: "relative", padding: 3 }}>
          <SLAvatar photo={app.profilePhoto} initial={app.avatarInitial} size={40} />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              padding: 2,
              background: ring,
              WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
              pointerEvents: "none",
            }}
          />
        </div>
      </SLPress>

      <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
        <Text as="h1" size={SL.TypeSize.lead} weight={SL.Weight.semibold} color={SL.Ink.primary} lineLimit={1} style={{ maxWidth: "100%" }}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
            {subtitle}
          </Text>
        )}
      </VStack>

      <HStack spacing={SL.Space.s1} style={{ flexShrink: 0 }}>
        {trailing}
        {/* Settings, where people look for them, on every tab. */}
        <SLPress scale={0.9} bounces onPress={onAccount} aria-label="Settings" style={{ borderRadius: "50%" }}>
          <RoundHeaderFace>
            <SFSymbol name="gearshape" size={17} weight={600} color={SL.Ink.primary} />
          </RoundHeaderFace>
        </SLPress>
      </HStack>
    </HStack>
  );
}

/** 38 across on the raised surface inside the hairline, in a 44 target. */
function RoundHeaderFace({ children }: { children?: ReactNode }) {
  return (
    <div style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "grid", placeItems: "center" }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: SL.Surface.raised,
          boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairline}`,
          display: "grid",
          placeItems: "center",
          color: SL.Ink.primary,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The round button a tab's head carries: 38 across in a 44 target. */
export function SLHeaderButton({ glyph, label, action }: { glyph: SLGlyph_Name | SLGlyph_NameCase; label: string; action: () => void }) {
  return (
    <SLPress scale={0.9} bounces onPress={action} aria-label={label} style={{ borderRadius: "50%" }}>
      <RoundHeaderFace>
        <SLGlyph name={glyph} size={18} fixed color={SL.Ink.primary} />
      </RoundHeaderFace>
    </SLPress>
  );
}

/**
 * `.slTabHeader { header }` — pins a tab's head above its scroll: same place
 * on every tab, the content passing under it on the ground colour.
 * Give it the tab's scroll view as children.
 */
export function SLTabHeaderPinned({ header, children, style }: { header: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", alignSelf: "stretch", ...style }}>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingLeft: SL.Space.gutterSession,
          paddingRight: SL.Space.gutterSession,
          paddingTop: SL.Space.s3,
          paddingBottom: SL.Space.s3,
          background: SL.Surface.ground,
          position: "relative",
          zIndex: 1,
        }}
      >
        {header}
      </div>
      <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

