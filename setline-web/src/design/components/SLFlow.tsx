// SLFlow.swift — chips that wrap (a row until the line is full, then the
// next line), and SLWeightedRow: controls side by side in stated proportions.
import type { CSSProperties, ReactNode } from "react";
import { SL } from "../tokens";
import { useFillWidth } from "../support";

export function SLFlow({
  spacing = SL.Space.s2,
  lineSpacing,
  children,
  style,
}: {
  spacing?: number;
  /** Between the lines, where that differs from between the items. */
  lineSpacing?: number;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const [ref, fill] = useFillWidth<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="sl-flow"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "flex-start",
        columnGap: spacing,
        rowGap: lineSpacing ?? spacing,
        minWidth: 0,
        ...fill,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Controls side by side the way the design's CSS `flex` sets them: "−30s"
 * and "+30s" at 1, "3:00 vast" at 1.4, the skip button at its own width.
 * Give a child its share with `style={slWeight(1.4)}`; 0 keeps its own width.
 */
export function SLWeightedRow({ spacing = 6, children, style }: { spacing?: number; children?: ReactNode; style?: CSSProperties }) {
  const [ref, fill] = useFillWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="sl-weighted" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: spacing, minWidth: 0, ...fill, ...style }}>
      {children}
    </div>
  );
}

/** `.slWeight(_:)` — this control's share of an `SLWeightedRow`; 0 keeps its own width. */
export function slWeight(weight: number): CSSProperties {
  return weight === 0 ? { flex: "0 0 auto" } : { flex: `${weight} 1 0px`, minWidth: 0 };
}
