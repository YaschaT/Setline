// SLDynamicType.swift — the web renders the default text size, so Dynamic
// Type scaling is the identity: `UIFontMetrics.scaledValue(for: x)` is `x`.
// What Features use from this file, as styles to spread or pass as `style`.
import type { CSSProperties } from "react";
import { slFont, type Weight } from "./tokens";

/** `Font.slFixed(size, weight)` — Archivo at a fixed size. */
export function slFixed(size: number, weight: Weight): CSSProperties {
  return slFont(size, weight);
}

/** `Font.slCapped(size, weight, maxScale:relativeTo:)` — at the default size, the size itself. */
export function slCapped(size: number, weight: Weight, _a: { maxScale: number; relativeTo?: string }): CSSProperties {
  return slFont(size, weight);
}

/**
 * `.slMeasure(characters, fontSize:alignment:)` — `max-width: Nch` as the
 * design renders it (one ch = 0.5565 of the font size), giving way to the
 * full width once that is narrower.
 */
export function slMeasure(
  characters: number,
  a: { fontSize: number; alignment?: "leading" | "center" | "trailing" },
): CSSProperties {
  // `alignment` places the text inside the measure; the text fills it here,
  // so it is the `Text`'s own `align` that matters.
  const max = characters * a.fontSize * 0.5565;
  return { width: "100%", maxWidth: Number.isFinite(max) ? max : "none" };
}

/**
 * `.slLineHeight(factor, size:maxScale:)` — the design's CSS line-height, a
 * line box of `factor × size`. Pass it as the `style` of the `Text` it is on
 * (Text sets its own line height, so it does not inherit).
 */
export function slLineHeight(factor: number, a: { size: number; maxScale?: number }): CSSProperties {
  return { lineHeight: `${factor * a.size}px` };
}

/** `.slRespondsToTextSize()` — nothing to do on the web. */
export function slRespondsToTextSize(): CSSProperties {
  return {};
}

/** `@ScaledMetric(relativeTo:) var x = v` — at the default size, `v`. */
export function scaledMetric(value: number): number {
  return value;
}
