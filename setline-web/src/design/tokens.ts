// SetlineTokens.swift, value for value. Dark appearance only.
import type { CSSProperties } from "react";

const rgba = (hex: number, opacity = 1) =>
  `rgba(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff}, ${opacity})`;

export const SL = {
  Surface: {
    ground: rgba(0x060908),
    raised: rgba(0x0d1210),
    raised2: rgba(0x141a18),
    hairline: rgba(0x1c2422),
    hairlineStrong: rgba(0x232b29),
    selection: "rgba(255, 255, 255, 0.28)",
    mute: rgba(0x5e6b67),
    floatFill: rgba(0x0d1210, 0.82),
    floatBlur: 18,
    heroStops: [
      { color: rgba(0x1d2723), location: 0 },
      { color: rgba(0x111815), location: 0.55 },
      { color: rgba(0x0d1210), location: 1 },
    ],
  },
  Ink: {
    primary: rgba(0xf2f5f3),
    secondary: rgba(0x9aa6a1),
    tertiary: rgba(0xf2f5f3, 0.55),
    meta: rgba(0xb3bdb8),
  },
  Signal: {
    action: rgba(0xc8ff66),
    actionPressed: rgba(0xdcffa0),
    actionTint: rgba(0xc8ff66, 0.12),
    onAction: rgba(0x060908),
    recovery: rgba(0x72efd0),
    recoveryTint: rgba(0x72efd0, 0.12),
    attention: rgba(0xffb84d),
    loss: rgba(0xff5c5c),
  },
  TypeSize: { displayXL: 44, displayL: 40, display: 34, title: 21, lead: 17, body: 15, meta: 13, micro: 12, tab: 11 },
  LineHeight: { display: 1.1, title: 1.2, body: 1.5 },
  Weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  Space: {
    s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32, s10: 40, s12: 48,
    gutterSession: 20, gutterEntry: 24, tabInset: 21, homeBand: 21,
    entryBlockBottom: 77, sessionBlockBottom: 21, hitMin: 44,
  },
  Radius: { sm: 8, md: 12, lg: 16, option: 20, xl: 22, device: 44, pill: 999 },
  Elevation: {
    floatColor: "rgba(0, 0, 0, 0.55)", floatRadius: 40, floatY: 16,
    sheetColor: "rgba(0, 0, 0, 0.5)", sheetRadius: 40, sheetY: -12,
  },
  Motion: { fast: 0.12, base: 0.18, slow: 0.25, sheetIn: 0.22, sheetOut: 0.16 },
  Breakpoint: { md: 640, lg: 1024, railCompact: 72, railWide: 224, detailColumn: 380, dialogWidth: 480 },
  Metric: {
    primaryPillHeight: 56, ctaHeight: 64, outlineHeight: 48, tertiaryHeight: 44, setRowHeight: 52,
    tabItemHeight: 56, tabBarHeight: 58, tabHeaderHeight: 52, tabContentTop: 20, segmentHeight: 44,
    chipHeight: 44, dayTileHeight: 64, border: 1, pressedScale: 0.97, focusRingWidth: 2, focusRingOffset: 2,
    undoWindow: 5, restAdjustStep: 30, restDefault: 120,
  },
} as const;

export type Weight = 400 | 500 | 600 | 700;

/** `Font.sl(size, weight)` — Archivo at a size and weight. */
export function slFont(size: number, weight: Weight = 400): CSSProperties {
  return { fontFamily: "Archivo, system-ui, sans-serif", fontSize: size, fontWeight: weight };
}

/** `.slNumerals()` — tabular figures. */
export const slNumerals: CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** The design's 155° hero gradient. */
export const heroGradient = `linear-gradient(155deg, ${SL.Surface.heroStops
  .map((s) => `${s.color} ${s.location * 100}%`)
  .join(", ")})`;

/** `.slCard(radius:loud:selected:)`: surface inside the hairline, border adds 1pt outside (slBorderBox). */
export function slCard(a: { radius?: number; loud?: boolean; selected?: boolean } = {}): CSSProperties {
  const { radius = SL.Radius.xl, loud = false, selected = false } = a;
  return {
    background: loud || selected ? SL.Surface.raised2 : SL.Surface.raised,
    border: `1px solid ${selected ? SL.Surface.selection : loud ? SL.Surface.hairlineStrong : SL.Surface.hairline}`,
    borderRadius: radius,
  };
}

/** `.slHeroCard(radius:)`. */
export function slHeroCard(radius: number = SL.Radius.xl): CSSProperties {
  return { background: heroGradient, border: `1px solid ${SL.Surface.hairlineStrong}`, borderRadius: radius };
}

/** `.slListCard(radius:raised:)`: rows clipped to the corner. */
export function slListCard(a: { radius?: number; raised?: boolean } = {}): CSSProperties {
  const { radius = SL.Radius.lg, raised = false } = a;
  return {
    background: raised ? SL.Surface.raised2 : SL.Surface.raised,
    border: `1px solid ${SL.Surface.hairline}`,
    borderRadius: radius,
    overflow: "hidden",
  };
}
