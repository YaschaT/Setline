// MuscleFigure.swift — a small front-view body with the muscle group an
// exercise trains filled in. Drawn on a 20 × 28 grid and scaled to fit.
import type { CSSProperties, ReactNode } from "react";
import { SL } from "../tokens";
import type { MuscleGroup } from "../../core/Domain/MuscleGroup";

const silhouette =
  "M8.6 5.4 L5.2 6.6 Q4.3 6.9 4.2 8.2 L3.2 14.6 L2.8 17.4 " +
  "M5.6 9.4 L6.6 16.2 L6.4 27.2 " +
  "M11.4 5.4 L14.8 6.6 Q15.7 6.9 15.8 8.2 L16.8 14.6 L17.2 17.4 " +
  "M14.4 9.4 L13.4 16.2 L13.6 27.2 " +
  // Inner legs.
  "M9.6 27.2 L10 18 L10.4 27.2";

export function MuscleFigure({
  group,
  highlight = SL.Ink.primary,
  outline = SL.Ink.secondary,
  lineWidth,
  style,
}: {
  group?: MuscleGroup;
  /** The filled muscle: lime for a lift that gained, ink otherwise. */
  highlight?: string;
  outline?: string;
  /** A set stroke in points; undefined scales it with the figure. */
  lineWidth?: number;
  style?: CSSProperties;
}) {
  // `1.1 * scale / 1.6` points is 1.1 / 1.6 grid units.
  const stroke = lineWidth === undefined ? { strokeWidth: 1.1 / 1.6 } : { strokeWidth: lineWidth, vectorEffect: "non-scaling-stroke" as const };
  return (
    <svg
      viewBox="0 0 20 28"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      style={{ display: "block", flexShrink: 0, aspectRatio: "20 / 28", maxWidth: "100%", maxHeight: "100%", ...style }}
    >
      {/* The muscle first, so the outline sits on top of it. */}
      {regions(group, highlight)}
      <g fill="none" stroke={outline} strokeLinecap="round" strokeLinejoin="round" {...stroke}>
        <ellipse cx={7.8 + 2.2} cy={0.6 + 2.3} rx={2.2} ry={2.3} />
        <path d={silhouette} />
      </g>
    </svg>
  );
}

function regions(group: MuscleGroup | undefined, fill: string): ReactNode {
  const ellipse = (x: number, y: number, w: number, h: number, k: string) => <ellipse key={k} cx={x} cy={y} rx={w / 2} ry={h / 2} fill={fill} />;
  const capsule = (a: [number, number], b: [number, number], width: number, k: string) => (
    <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={fill} strokeWidth={width} strokeLinecap="round" />
  );
  switch (group) {
    case "borst":
      return [ellipse(8.3, 9.0, 3.4, 2.6, "l"), ellipse(11.7, 9.0, 3.4, 2.6, "r")];
    case "schouders":
      return [ellipse(5.4, 7.6, 2.4, 2.2, "l"), ellipse(14.6, 7.6, 2.4, 2.2, "r")];
    case "armen":
      return [capsule([4.3, 9.2], [3.6, 13.6], 1.7, "l"), capsule([15.7, 9.2], [16.4, 13.6], 1.7, "r")];
    case "core":
      return <rect x={8.4} y={10.8} width={3.2} height={4.8} rx={1} fill={fill} />;
    case "benen":
      return [capsule([8.1, 18], [7.9, 23.5], 2.4, "l"), capsule([11.9, 18], [12.1, 23.5], 2.4, "r")];
    case "rug":
      // The lats, seen as the V of the torso's sides.
      return [
        <path key="l" d="M5.9 8.4 L7.9 9.2 L7.0 14.6 Z" fill={fill} />,
        <path key="r" d="M14.1 8.4 L12.1 9.2 L13.0 14.6 Z" fill={fill} />,
      ];
    case undefined:
      return null;
  }
}
