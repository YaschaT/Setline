// SLSetRow.swift — Redesign 1b · one set of the exercise on screen, plus the
// warm-up row, the note card and the pill button.
//
// A row 52 high, the whole width a tap target: a ring that says where the
// set stands, its name, what the same set was last time, and its value. The
// set that is up is tinted lime, its value inside a dashed edge.
import type { CSSProperties, ReactNode } from "react";
import { SL, slFont, slNumerals } from "../tokens";
import { HStack, Spacer, Text, VStack } from "../swiftui";
import { colorOpacity } from "../SetlineTokens";
import { DashedBorder, PressButton } from "../support";
import { slBody, slMeta } from "./SLText";
import { SLGlyph } from "./SLGlyph";
import { SLRowButton } from "./SLPieces";

/** `SLSetRow.Phase`. */
export type SLSetRow_Phase = "done" | "open" | "pending";
export const SLSetRow_Phase = {
  /** Written. */
  done: "done" as SLSetRow_Phase,
  /** The set that is up next. */
  open: "open" as SLSetRow_Phase,
  /** Still to come. */
  pending: "pending" as SLSetRow_Phase,
  allCases: ["done", "open", "pending"] as SLSetRow_Phase[],
};

/** `SLSetRow.Note` — what the set *was*, in a word and a colour. */
export interface SLSetRow_Note {
  text: string;
  tone: string;
}

export function SLSetRow({
  label,
  phase,
  note,
  previous,
  value,
  valueIsSentence = false,
  spoken,
  onTap,
}: {
  /** "Set 2", "Set 2 · open", "Set 4 · extra". */
  label: string;
  phase: SLSetRow_Phase;
  note?: SLSetRow_Note;
  /** "vorige 82,5 × 8" */
  previous?: string;
  /** "82,5 × 8", or "—" while the set waits. */
  value: string;
  /** "volgt uit set 1" is a sentence rather than a value, and is set as one. */
  valueIsSentence?: boolean;
  spoken: string;
  onTap: () => void;
}) {
  const valueFont = valueIsSentence
    ? slFont(SL.TypeSize.meta, SL.Weight.regular)
    : slFont(SL.TypeSize.lead, phase === "pending" ? SL.Weight.regular : SL.Weight.semibold);
  const valueInk = valueIsSentence
    ? SL.Ink.secondary
    : phase === "done"
      ? SL.Ink.primary
      : phase === "open"
        ? SL.Signal.action
        : colorOpacity(SL.Ink.primary, 0.62);
  return (
    <SLRowButton onPress={onTap} aria-label={spoken}>
      <HStack
        alignment="center"
        spacing={SL.Space.s3}
        style={{
          padding: `${SL.Space.s1}px ${SL.Space.s4}px`,
          minHeight: SL.Metric.setRowHeight,
          background: phase === "open" ? SL.Signal.actionTint : "transparent",
        }}
      >
        {/* ring */}
        <div aria-hidden style={{ position: "relative", width: 26, height: 26, flexShrink: 0, display: "grid", placeItems: "center" }}>
          {phase === "done" && (
            <>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: colorOpacity(SL.Signal.action, 0.15) }} />
              <SLGlyph name="IconCheck" size={14} fixed color={SL.Signal.action} style={{ position: "relative" }} />
            </>
          )}
          {phase === "open" && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `inset 0 0 0 2px ${SL.Signal.action}` }} />}
          {phase === "pending" && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `inset 0 0 0 1px ${SL.Surface.mute}` }} />}
        </div>
        {/* labels */}
        <VStack alignment="leading" spacing={1} style={{ flex: "1 1 auto", minWidth: 0 }}>
          <Text
            size={SL.TypeSize.body}
            weight={phase === "open" ? SL.Weight.semibold : SL.Weight.regular}
            numerals
            color={phase === "open" ? SL.Signal.action : SL.Ink.secondary}
            lineLimit={1}
            minimumScaleFactor={0.85}
            style={{ maxWidth: "100%" }}
          >
            {label}
          </Text>
          {note !== undefined && (
            <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} numerals color={note.tone}>
              {note.text}
            </Text>
          )}
        </VStack>
        {previous !== undefined && (
          <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.75} style={{ flexShrink: 100 }}>
            {previous}
          </Text>
        )}
        {/* value */}
        <span
          style={{
            position: "relative",
            // Shrinks with the row, so the value scales down to fit (`.minimumScaleFactor(0.7)`).
            flexShrink: 1,
            display: "flex",
            justifyContent: "flex-end",
            minWidth: valueIsSentence ? 0 : 84,
            padding: `${SL.Space.s1}px ${SL.Space.s2}px`,
            ...valueFont,
            ...slNumerals,
            lineHeight: 1.25,
            color: valueInk,
            whiteSpace: "nowrap",
          }}
        >
          <Text numerals color={valueInk} lineLimit={1} minimumScaleFactor={0.7} style={valueFont}>
            {value}
          </Text>
          {phase === "open" && <DashedBorder color={colorOpacity(SL.Signal.action, 0.7)} radius={SL.Radius.sm} dash="4 3" />}
        </span>
      </HStack>
    </SLRowButton>
  );
}

/** A warm-up step: a reference line, not a control. */
export function SLWarmupRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack
      alignment="center"
      spacing={SL.Space.s3}
      aria-label={`Opwarmset ${label}, ${value}`}
      role="group"
      style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: SL.Space.hitMin, alignSelf: "stretch" }}
    >
      <Text {...slBody()} numerals color={SL.Ink.secondary}>
        {label}
      </Text>
      <Spacer minLength={SL.Space.s2} />
      <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.secondary}>
        {value}
      </Text>
    </HStack>
  );
}

/** What a note is about, which decides its dot and its edge. */
export type SLNoteTone = "action" | "attention" | "recovery" | "quiet";
export const SLNoteTone = {
  action: "action" as SLNoteTone,
  attention: "attention" as SLNoteTone,
  recovery: "recovery" as SLNoteTone,
  quiet: "quiet" as SLNoteTone,
  allCases: ["action", "attention", "recovery", "quiet"] as SLNoteTone[],
  color(self: SLNoteTone): string {
    switch (self) {
      case "action":
        return SL.Signal.action;
      case "attention":
        return SL.Signal.attention;
      case "recovery":
        return SL.Signal.recovery;
      case "quiet":
        return SL.Ink.secondary;
    }
  },
  edge(self: SLNoteTone): string {
    return self === "quiet" ? SL.Surface.hairline : colorOpacity(SLNoteTone.color(self), 0.35);
  },
};

/** One thing worth reading, set apart: a dot in the colour of what it means and the words beside it. */
export function SLNoteCard({ tone = "quiet", children, style }: { tone?: SLNoteTone; children?: ReactNode; style?: CSSProperties }) {
  return (
    <HStack
      alignment="top"
      spacing={10}
      style={{
        padding: `${SL.Space.s3}px 14px`,
        background: SL.Surface.raised,
        border: `${SL.Metric.border}px solid ${SLNoteTone.edge(tone)}`,
        borderRadius: SL.Radius.lg,
        ...style,
      }}
    >
      <div aria-hidden style={{ width: 8, height: 8, marginTop: 6, flexShrink: 0, borderRadius: "50%", background: SLNoteTone.color(tone) }} />
      <VStack alignment="leading" spacing={SL.Space.s1} style={{ flex: "1 1 0", minWidth: 0 }}>
        {children}
      </VStack>
    </HStack>
  );
}

/** `SLPillButtonStyle(quiet:)` — a pill-shaped control: 44 high inside the strong hairline — `Wissel`, `Schijven`, `Meer`. */
export function SLPillButton({
  quiet = false,
  ...p
}: {
  /** The quiet variant sets its label in ink-2. */
  quiet?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  "aria-label"?: string;
  children?: ReactNode;
}) {
  return (
    <PressButton
      onPress={p.onPress}
      disabled={p.disabled}
      aria-label={p["aria-label"]}
      style={(pressed) => ({
        ...slFont(SL.TypeSize.body, SL.Weight.regular),
        lineHeight: 1.25,
        color: quiet ? SL.Ink.secondary : SL.Ink.primary,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        paddingLeft: 14,
        paddingRight: 14,
        minHeight: SL.Space.hitMin + 2 * SL.Metric.border,
        border: `${SL.Metric.border}px solid ${SL.Surface.hairlineStrong}`,
        borderRadius: SL.Radius.pill,
        background: pressed ? SL.Surface.raised2 : "transparent",
        ...p.style,
      })}
    >
      {p.children}
    </PressButton>
  );
}

