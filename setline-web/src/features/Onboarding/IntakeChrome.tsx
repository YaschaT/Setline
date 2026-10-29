// IntakeChrome.swift — the frame every intake step sits in (artboards 03–06).
//
// Step row, a 2px track that fills a quarter at a time, the question, and one
// commit pill. Every step can be skipped, and skipping the lot leaves the
// account on the plan it already has.
import type { CSSProperties, ReactNode } from "react";
import { SL } from "../../design/tokens";
import { HStack, Spacer, Text, VStack } from "../../design/swiftui";
import { PressButton } from "../../design/support";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { slBody, slDisplay, slHitTarget, slLead, slMeta } from "../../design/components/SLText";
import { SLAnchoredScroll } from "../../design/components/SLAnchoredScroll";
import { slLineHeight, slMeasure } from "../../design/SLDynamicType";

/** `.font(.system(size:weight:design: .monospaced))`. */
export const monospaced = (size: number, weight: number): CSSProperties => ({
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: size,
  fontWeight: weight,
});

/** The ground behind an entry screen, with the safe area on every side but the bottom (the commit block takes that). */
export const entryScreen: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  height: "100%",
  background: SL.Surface.ground,
  paddingTop: "env(safe-area-inset-top)",
  paddingLeft: "env(safe-area-inset-left)",
  paddingRight: "env(safe-area-inset-right)",
};

/** `.safeAreaInset(edge: .bottom)`'s commit block: above the bottom safe area, the entry block's 77 under it. */
export function entryBottom(top: number = 0): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    flexShrink: 0,
    paddingLeft: SL.Space.gutterEntry,
    paddingRight: SL.Space.gutterEntry,
    paddingTop: top,
    paddingBottom: `calc(env(safe-area-inset-bottom) + ${SL.Space.entryBlockBottom}px)`,
    background: SL.Surface.ground,
  };
}

export function IntakeStep(p: {
  step: number;
  total: number;
  title: string;
  subtitle: string;
  /** 06 sets its subtitle to a 32ch measure; the other steps do not. */
  subtitleMeasure?: number;
  /** What this answer produces, restated. Load-bearing copy, not decoration. */
  consequence: string;
  commit: string;
  onSkip: () => void;
  onCommit: () => void;
  children?: ReactNode;
}) {
  return (
    <div style={entryScreen}>
      <HStack style={{ paddingLeft: SL.Space.gutterEntry, paddingRight: SL.Space.gutterEntry, paddingTop: SL.Space.s3 }}>
        <span style={{ ...monospaced(SL.TypeSize.meta, SL.Weight.semibold), color: SL.Ink.tertiary }}>
          {p.step}/{p.total}
        </span>
        <Spacer />
        <PressButton onPress={p.onSkip}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary} style={{ ...slHitTarget(), display: "inline-block" }}>
            Skip
          </Text>
        </PressButton>
      </HStack>

      <div style={{ paddingLeft: SL.Space.gutterEntry, paddingRight: SL.Space.gutterEntry, paddingTop: SL.Space.s2 }}>
        <Track step={p.step} total={p.total} />
      </div>

      {/* 03–06: the question at the top, the answer and what it produces
          down by the pill, the room between them flexible (min 28). */}
      <SLAnchoredScroll>
        <VStack alignment="leading" spacing={0} style={{ flex: "1 0 auto", paddingLeft: SL.Space.gutterEntry, paddingRight: SL.Space.gutterEntry, paddingTop: 36 }}>
          <Text as="h1" {...slDisplay()} color={SL.Ink.primary} style={slLineHeight(SL.LineHeight.display, { size: SL.TypeSize.display })}>
            {p.title}
          </Text>

          <Text
            {...slBody()}
            color={SL.Ink.secondary}
            style={{ ...slLineHeight(1.5, { size: SL.TypeSize.body }), ...slMeasure(p.subtitleMeasure ?? Infinity, { fontSize: SL.TypeSize.body }), paddingTop: 10 }}
          >
            {p.subtitle}
          </Text>

          <Spacer minLength={28} />

          <div style={{ alignSelf: "stretch" }}>{p.children}</div>

          {p.consequence !== "" && (
            <Text {...slBody()} color={SL.Ink.secondary} style={{ ...slLineHeight(1.45, { size: SL.TypeSize.body }), paddingTop: SL.Space.s5 }}>
              {p.consequence}
            </Text>
          )}
        </VStack>
      </SLAnchoredScroll>

      <div style={entryBottom()}>
        <SLPrimaryButton onPress={p.onCommit}>{p.commit}</SLPrimaryButton>
      </div>
    </div>
  );
}

function Track({ step, total }: { step: number; total: number }) {
  return (
    <div role="img" aria-label={`Step ${step} of ${total}`} style={{ position: "relative", height: 2 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 1, background: SL.Surface.hairline }} />
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(step / total) * 100}%`, borderRadius: 1, background: SL.Signal.action }} />
    </div>
  );
}

/**
 * The option card artboards 04 and 05 share: a title, what it means, and a
 * filled circle on the trailing edge when it is the one chosen.
 */
export function IntakeOption({ title, detail, selected, onTap }: { title: string; detail: string; selected: boolean; onTap: () => void }) {
  return (
    <PressButton
      onPress={onTap}
      aria-label={`${title}, ${detail}`}
      aria-pressed={selected}
      style={{
        alignSelf: "stretch",
        width: "100%",
        display: "flex",
        textAlign: "left",
        borderRadius: SL.Radius.option,
        background: selected ? SL.Surface.raised2 : SL.Surface.raised,
        boxShadow: `inset 0 0 0 1px ${selected ? SL.Surface.selection : SL.Surface.hairline}`,
        // `.padding(.vertical, 16).padding(.horizontal, 18).slBorderBox()`.
        padding: `${SL.Space.s4 + 1}px ${18 + 1}px`,
      }}
    >
      {/* 04 and 05: only the chosen card carries the 22pt filled circle,
          centred on the trailing edge; the others carry nothing. */}
      <HStack alignment="center" spacing={SL.Space.s4} style={{ flex: "1 1 0" }}>
        <VStack alignment="leading" spacing={SL.Space.s1} style={{ flex: "1 1 0", minWidth: 0 }}>
          <Text {...slLead()} color={SL.Ink.primary}>{title}</Text>
          <Text {...slMeta()} color={selected ? SL.Ink.secondary : SL.Ink.tertiary}>{detail}</Text>
        </VStack>
        {selected && <div style={{ width: 22, height: 22, borderRadius: 11, background: SL.Ink.primary, flexShrink: 0 }} />}
      </HStack>
    </PressButton>
  );
}
