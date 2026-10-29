// SLChip.swift — one chip, in the sizes and states the handoff draws.
// Always a rounded rectangle — never a capsule. Selected is a raised2 fill
// with a stronger edge; unselected keeps a solid edge on the raised surface;
// `check` is the unselected chip at regular weight; `quiet` recedes onto the
// card's fill; `off` is dashed and quieter.
import { SL, slNumerals, type Weight } from "../tokens";
import { DashedBorder, PressButton } from "../support";

/** `SLChip.Size`. */
export type SLChip_Size = "regular" | "large";
export const SLChip_Size = {
  /** 44 high, radius 12 — the component sheet and artboards 20, 31c. */
  regular: "regular" as SLChip_Size,
  /** 48 high, radius 16 — the region choices on 31a. */
  large: "large" as SLChip_Size,
  allCases: ["regular", "large"] as SLChip_Size[],
  height(self: SLChip_Size): number {
    return self === "regular" ? SL.Metric.chipHeight : 48;
  },
  radius(self: SLChip_Size): number {
    return self === "regular" ? SL.Radius.md : SL.Radius.lg;
  },
  padding(self: SLChip_Size): number {
    return self === "regular" ? SL.Space.s4 : 18;
  },
};

/** `SLChip.Look`. */
export type SLChip_Look = "selected" | "unselected" | "check" | "quiet" | "off";
export const SLChip_Look = {
  selected: "selected" as SLChip_Look,
  /** A choice that is available and not taken: solid edge, raised fill. */
  unselected: "unselected" as SLChip_Look,
  /** 31c's signals: the unselected chip at regular weight — a tick, not a pick. */
  check: "check" as SLChip_Look,
  /** 31c's "Geen daarvan": raised2 like the card it sits on, faint edge, tertiary ink. */
  quiet: "quiet" as SLChip_Look,
  /** Off, rather than merely unchosen: dashed edge, no fill. */
  off: "off" as SLChip_Look,
  allCases: ["selected", "unselected", "check", "quiet", "off"] as SLChip_Look[],
  weight(self: SLChip_Look): Weight {
    switch (self) {
      case "selected":
        return SL.Weight.semibold;
      case "unselected":
      case "off":
        return SL.Weight.medium;
      case "check":
      case "quiet":
        return SL.Weight.regular;
    }
  },
  ink(self: SLChip_Look): string {
    switch (self) {
      case "selected":
        return SL.Ink.primary;
      case "unselected":
      case "check":
        return SL.Ink.secondary;
      case "quiet":
      case "off":
        return SL.Ink.tertiary;
    }
  },
  fill(self: SLChip_Look): string {
    switch (self) {
      case "selected":
      case "quiet":
        return SL.Surface.raised2;
      case "unselected":
      case "check":
        return SL.Surface.raised;
      case "off":
        return "transparent";
    }
  },
};

export function SLChip({
  title,
  size = "regular",
  look = "unselected",
  horizontalPadding,
  action,
}: {
  title: string;
  size?: SLChip_Size;
  look?: SLChip_Look;
  /** An artboard's own side padding where it differs from the size's — 06's plate chips use 18. */
  horizontalPadding?: number;
  action: () => void;
}) {
  const radius = SLChip_Size.radius(size);
  // The component sheet's selected chip has a .16 edge; 31a's larger choice
  // chips take .28, and 31c's quiet chip the faint .08.
  const edge =
    look === "selected" ? (size === "large" ? SL.Surface.selection : SL.Surface.hairlineStrong) : look === "quiet" ? SL.Surface.hairline : SL.Surface.hairlineStrong;
  const pad = horizontalPadding ?? SLChip_Size.padding(size);
  return (
    <PressButton
      onPress={action}
      aria-pressed={look === "selected" ? true : undefined}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: "Archivo, system-ui, sans-serif",
        fontSize: SL.TypeSize.body,
        fontWeight: SLChip_Look.weight(look),
        lineHeight: 1.25,
        ...slNumerals,
        color: SLChip_Look.ink(look),
        // slBorderBox: the 1pt edge sits outside the padding and the 44.
        padding: `0 ${pad + SL.Metric.border}px`,
        minHeight: SLChip_Size.height(size) + 2 * SL.Metric.border,
        background: SLChip_Look.fill(look),
        borderRadius: radius,
        boxShadow: look === "off" ? undefined : `inset 0 0 0 1px ${edge}`,
      }}
    >
      {title}
      {look === "off" && <DashedBorder color={edge} radius={radius} dash="4 4" />}
    </PressButton>
  );
}
