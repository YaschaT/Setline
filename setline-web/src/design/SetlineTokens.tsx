// SetlineTokens.swift — the parts tokens.ts does not carry: the three button
// styles, `slBorderBox`, `slFocusRing`, `Color(hex:)`, `.opacity` on a colour,
// and the Motion curves. The token values themselves are in tokens.ts.
import type { CSSProperties, ReactNode } from "react";
import { SL, slFont } from "./tokens";
import { PressButton, useFillWidth, useReduceMotion } from "./support";

// MARK: - Colour

/** `Color(hex:)` (with `.opacity` folded in). */
export function colorHex(hex: number, opacity = 1): string {
  return `rgba(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff}, ${opacity})`;
}

/** `color.opacity(x)` on any colour tokens.ts writes (`rgba(…)`), or a `#rrggbb`. */
export function colorOpacity(color: string, opacity: number): string {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(color);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${(m[4] === undefined ? 1 : Number(m[4])) * opacity})`;
  const h = /^#([0-9a-f]{6})$/i.exec(color);
  if (h) return colorHex(parseInt(h[1], 16), opacity);
  if (color === "transparent" || color === "clear") return "transparent";
  return color;
}

/** `Color.white` / `Color.black` / `Color.clear`. */
export const SLColor = {
  white: "rgba(255, 255, 255, 1)",
  black: "rgba(0, 0, 0, 1)",
  clear: "transparent",
};

/** `SL.Motion.easeIn` / `.easeOut` / `.duration(_:reduceMotion:)`. */
export const SLMotion = {
  easeIn: "cubic-bezier(.4,0,1,1)",
  easeOut: "cubic-bezier(0,0,.2,1)",
  duration(d: number, a: { reduceMotion: boolean }): number {
    return a.reduceMotion ? 0.001 : d;
  },
};

/**
 * SwiftUI springs as CSS: `.spring(response: 0.3, dampingFraction: 0.55)` →
 * `spring(0.3, 0.55)`. A cubic-bezier with the spring's overshoot, over about
 * its settling time.
 */
export function spring(response: number, dampingFraction: number): string {
  const overshoot = dampingFraction >= 1 ? 0 : Math.exp((-dampingFraction * Math.PI) / Math.sqrt(1 - dampingFraction * dampingFraction));
  const y1 = 1 + overshoot * 5.5;
  return `${(response * 1.25).toFixed(2)}s cubic-bezier(.3,${y1.toFixed(2)},.5,1)`;
}

// MARK: - Primitives

interface ButtonProps {
  onPress?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  "aria-label"?: string;
  /** The label. Pass text (or spans), not `<Text>`: the style sets the font and ink, as a ButtonStyle does. */
  children?: ReactNode;
}

/**
 * `SLPrimaryButtonStyle(prominent:)` — the commit action: lime, radius 16,
 * 56 high, its label at 17/700. `prominent` is the logging screen's 64-high
 * "Set opslaan" at 21/700. Pressed: #DCFFA0 and it sinks to 0.97, springing
 * back. Disabled: raised2 fill, tertiary ink.
 */
export function SLPrimaryButton({ prominent = false, ...p }: ButtonProps & { prominent?: boolean }) {
  const [ref, fill] = useFillWidth<HTMLButtonElement>();
  const reduceMotion = useReduceMotion();
  const isEnabled = !p.disabled;
  return (
    <PressButton
      innerRef={ref}
      onPress={p.onPress}
      disabled={p.disabled}
      aria-label={p["aria-label"]}
      style={(pressed) => ({
        ...slFont(prominent ? SL.TypeSize.title : SL.TypeSize.lead, SL.Weight.bold),
        color: isEnabled ? SL.Signal.onAction : SL.Ink.tertiary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        lineHeight: 1.25,
        minHeight: prominent ? SL.Metric.ctaHeight : SL.Metric.primaryPillHeight,
        borderRadius: SL.Radius.lg,
        background: !isEnabled ? SL.Surface.raised2 : pressed ? SL.Signal.actionPressed : SL.Signal.action,
        transform: pressed && !reduceMotion ? "scale(0.97)" : "scale(1)",
        transition: reduceMotion
          ? "none"
          : pressed
            ? "transform 0.1s ease-out, background-color 0.1s ease-out"
            : `transform ${spring(0.3, 0.55)}, background-color 0.3s ease-out`,
        ...fill,
        ...p.style,
      })}
    >
      {p.children}
    </PressButton>
  );
}

/** `SLOutlineButtonStyle.Emphasis`. */
export type SLOutlineButtonStyle_Emphasis = "secondary" | "tertiary";
export const SLOutlineButtonStyle_Emphasis = {
  secondary: "secondary" as SLOutlineButtonStyle_Emphasis,
  tertiary: "tertiary" as SLOutlineButtonStyle_Emphasis,
  allCases: ["secondary", "tertiary"] as SLOutlineButtonStyle_Emphasis[],
};
export type SLOutlineButton_Emphasis = SLOutlineButtonStyle_Emphasis;
export const SLOutlineButton_Emphasis = SLOutlineButtonStyle_Emphasis;

/**
 * `SLOutlineButtonStyle(emphasis:edge:)` — the outlined secondary: 48 high
 * inside its border (50 across), radius 12, the strong hairline, label at
 * 15/400. Pressed it takes the raised2 fill. `tertiary` steps the ink back.
 */
export function SLOutlineButton({ emphasis = "secondary", edge, ...p }: ButtonProps & { emphasis?: SLOutlineButtonStyle_Emphasis; edge?: string }) {
  const [ref, fill] = useFillWidth<HTMLButtonElement>();
  return (
    <PressButton
      innerRef={ref}
      onPress={p.onPress}
      disabled={p.disabled}
      aria-label={p["aria-label"]}
      style={(pressed) => ({
        ...slFont(SL.TypeSize.body, SL.Weight.regular),
        color: emphasis === "secondary" ? SL.Ink.primary : SL.Ink.secondary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        lineHeight: 1.25,
        minHeight: SL.Metric.outlineHeight + 2 * SL.Metric.border,
        borderRadius: SL.Radius.md,
        background: pressed ? SL.Surface.raised2 : "transparent",
        border: `${SL.Metric.border}px solid ${edge ?? SL.Surface.hairlineStrong}`,
        ...fill,
        ...p.style,
      })}
    >
      {p.children}
    </PressButton>
  );
}

/** `SLQuietButtonStyle` — a text action with no edge: 44 high, 15/400. */
export function SLQuietButton(p: ButtonProps) {
  const [ref, fill] = useFillWidth<HTMLButtonElement>();
  return (
    <PressButton
      innerRef={ref}
      onPress={p.onPress}
      disabled={p.disabled}
      aria-label={p["aria-label"]}
      style={(pressed) => ({
        ...slFont(SL.TypeSize.body, SL.Weight.regular),
        color: SL.Ink.primary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        lineHeight: 1.25,
        minHeight: SL.Space.hitMin,
        borderRadius: SL.Radius.md,
        background: pressed ? SL.Surface.raised2 : "transparent",
        ...fill,
        ...p.style,
      })}
    >
      {p.children}
    </PressButton>
  );
}

/**
 * `.slBorderBox()` — steps a bordered surface out by its border. On the web
 * a CSS border already sits outside the padding, so this is only needed
 * where a SwiftUI `strokeBorder` is drawn as an overlay: 1pt of padding.
 */
export function slBorderBox(): CSSProperties {
  return { padding: SL.Metric.border };
}

/**
 * `.slFocusRing(shape)` — the 2pt lime ring 2pt outside, keyboard focus only.
 * Every button here carries `sl-pressable`, whose `:focus-visible` outline
 * (base.css) is that ring and follows the corner radius; nothing to add.
 */
export function slFocusRing(): CSSProperties {
  return {};
}
