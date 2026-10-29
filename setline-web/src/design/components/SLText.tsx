// SLText.swift — the eyebrow, the Text style helpers, the hairline, the
// strong-edged card and the hit target.
import type { CSSProperties } from "react";
import { SL, type Weight } from "../tokens";
import { Text } from "../swiftui";

/**
 * The eyebrow above a card, a section or a value: 13pt / 500 / tertiary,
 * in capitals. 12pt is the narrower variant for column headers and labels.
 */
export function SLEyebrow({
  text,
  size = SL.TypeSize.meta,
  color = SL.Ink.tertiary,
  weight = SL.Weight.medium,
  style,
}: {
  text: string;
  size?: number;
  color?: string;
  /** Medium by default; a few artboards set their eyebrow at regular weight. */
  weight?: Weight;
  style?: CSSProperties;
}) {
  return (
    <Text size={size} weight={weight} color={color} style={style}>
      {text.toUpperCase()}
    </Text>
  );
}

/** Props for `Text` — spread them: `<Text {...slMeta(SL.Weight.semibold)}>`. */
export interface SLTextStyle {
  size: number;
  weight: Weight;
}

/** `.slDisplay(_ size = display)` — 600. */
export function slDisplay(size: number = SL.TypeSize.display): SLTextStyle {
  return { size, weight: SL.Weight.semibold };
}

/** `.slTitle()` — 21/600. */
export function slTitle(): SLTextStyle {
  return { size: SL.TypeSize.title, weight: SL.Weight.semibold };
}

/** `.slLead(_ weight = semibold)` — 17. */
export function slLead(weight: Weight = SL.Weight.semibold): SLTextStyle {
  return { size: SL.TypeSize.lead, weight };
}

/** `.slBody(_ weight = regular)` — 15. */
export function slBody(weight: Weight = SL.Weight.regular): SLTextStyle {
  return { size: SL.TypeSize.body, weight };
}

/** `.slMeta(_ weight = regular)` — 13. */
export function slMeta(weight: Weight = SL.Weight.regular): SLTextStyle {
  return { size: SL.TypeSize.meta, weight };
}

/** A 1px hairline. The system has exactly two border weights. */
export function SLHairline({ strong = false, style }: { strong?: boolean; style?: CSSProperties }) {
  return <div aria-hidden style={{ height: 1, alignSelf: "stretch", flexShrink: 0, background: strong ? SL.Surface.hairlineStrong : SL.Surface.hairline, ...style }} />;
}

/**
 * `.slCardStrong(radius:fill:)` — keeps the `raised` (or `raised2`) fill and
 * takes the stronger hairline as its border, 1pt outside the content.
 */
export function slCardStrong(a: { radius?: number; fill?: string } = {}): CSSProperties {
  const { radius = SL.Radius.xl, fill = SL.Surface.raised } = a;
  return { background: fill, border: `${SL.Metric.border}px solid ${SL.Surface.hairlineStrong}`, borderRadius: radius };
}

/**
 * `.slHitTarget()` — clears the 44pt floor without growing the layout: the
 * tap area reaches 14pt past the words. Put it on the text inside the button.
 */
export function slHitTarget(): CSSProperties {
  return { padding: 14, margin: -14 };
}
