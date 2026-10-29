// SLBadge.swift — a milestone as a badge: a hexagon in its tier's metal —
// bronze, silver, gold, and lime for the top of each kind — with a dark face
// carrying the icon and the number. Locked, it is a grey outline with the
// progress drawn round its edge in lime.
import { useId, type CSSProperties } from "react";
import { SL } from "../tokens";
import { SFSymbol } from "../SFSymbol";
import { Text } from "../swiftui";
import { colorHex, colorOpacity } from "../SetlineTokens";
import { Milestone, type Milestone_Kind } from "../../core/Progress/Milestones";

function palette(tier: number): { light: string; dark: string } {
  switch (tier) {
    case 0:
      return { light: colorHex(0xe2a576), dark: colorHex(0x7a4526) }; // bronze
    case 1:
      return { light: colorHex(0xeef2f4), dark: colorHex(0x7d8a92) }; // silver
    case 2:
      return { light: colorHex(0xffe08a), dark: colorHex(0xb07d12) }; // gold
    default:
      return { light: SL.Signal.action, dark: colorHex(0x5f8f1e) }; // top tier
  }
}

function symbol(kind: Milestone_Kind): string {
  switch (kind) {
    case "sessions":
      return "figure.strengthtraining.traditional";
    case "streak":
      return "flame.fill";
    case "heaviest":
      return "dumbbell.fill";
    case "volume":
      return "mountain.2.fill";
    case "logging":
      return "fork.knife";
    case "protein":
      return "bolt.heart.fill";
    case "fullDay":
      return "sun.horizon.fill";
    case "onTrack":
      return "scope";
    case "weighIns":
      return "scalemass.fill";
    case "photos":
      return "camera.fill";
  }
}

export function SLBadge({ milestone, size = 84, style }: { milestone: Milestone; size?: number; style?: CSSProperties }) {
  const won = Milestone.isReached(milestone);
  const colors = palette(milestone.tier);
  const uid = useId().replace(/:/g, "");
  const w = size;
  const h = size * 1.08;
  const rect = (inset: number) => ({ x: inset, y: inset, width: w - 2 * inset, height: h - 2 * inset });
  const lockedLine = Math.max(1.5, size * 0.03);
  const fraction = Milestone.fraction(milestone);
  return (
    <div
      role="img"
      aria-label={won ? `${milestone.title}, earned` : `${milestone.title}, locked`}
      style={{ position: "relative", flexShrink: 0, width: w, height: h, display: "grid", placeItems: "center", ...style }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {won ? (
          <>
            <defs>
              <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={colors.light} />
                <stop offset="1" stopColor={colors.dark} />
              </linearGradient>
              <filter id={`s${uid}`} x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy={size * 0.04} stdDeviation={(size * 0.08) / 2} floodColor={colorOpacity(colors.dark, 0.5)} />
              </filter>
            </defs>
            <path d={RoundedHexagon.path(rect(0))} fill={`url(#g${uid})`} filter={`url(#s${uid})`} />
            <path d={RoundedHexagon.path(rect(size * 0.11))} fill={SL.Surface.raised} />
            <path d={RoundedHexagon.path(rect(size * 0.11))} fill="none" stroke={colorOpacity(colors.light, 0.6)} strokeWidth={Math.max(1, size * 0.015)} />
          </>
        ) : (
          <>
            <path d={RoundedHexagon.path(rect(0))} fill={SL.Surface.raised} />
            <path d={RoundedHexagon.path(rect(size * 0.02))} fill="none" stroke={SL.Surface.hairlineStrong} strokeWidth={lockedLine} />
            {fraction > 0 && (
              <path
                d={RoundedHexagon.path(rect(size * 0.02))}
                fill="none"
                stroke={SL.Signal.action}
                strokeWidth={lockedLine}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${fraction} 2`}
              />
            )}
          </>
        )}
      </svg>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.03, maxWidth: "100%" }}>
        <SFSymbol name={symbol(milestone.kind)} size={size * 0.24} weight={600} color={won ? colors.light : SL.Ink.tertiary} />
        <div style={{ maxWidth: "100%", boxSizing: "border-box", padding: `0 ${size * 0.18}px` }}>
          <Text
            numerals
            lineHeight={1.2}
            color={won ? SL.Ink.primary : SL.Ink.tertiary}
            lineLimit={1}
            minimumScaleFactor={0.6}
            style={{
              display: "block",
              fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
              fontSize: size * 0.15,
              fontWeight: 700,
            }}
          >
            {milestone.badgeLabel}
          </Text>
        </div>
      </div>
    </div>
  );
}

/** A pointy-top hexagon with softened corners, as an SVG path in `rect`. */
export const RoundedHexagon = {
  path(rect: { x: number; y: number; width: number; height: number }): string {
    const corner = Math.min(rect.width, rect.height) * 0.12;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const rx = rect.width / 2;
    const ry = rect.height / 2;
    const points = [0, 1, 2, 3, 4, 5].map((index) => {
      const angle = ((index * 60 - 90) * Math.PI) / 180;
      return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    });
    const unit = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
      return { x: dx / length, y: dy / length };
    };
    let d = "";
    for (let index = 0; index < 6; index++) {
      const previous = points[(index + 5) % 6];
      const point = points[index];
      const next = points[(index + 1) % 6];
      const into = unit(point, previous);
      const out = unit(point, next);
      const start = { x: point.x + into.x * corner, y: point.y + into.y * corner };
      const end = { x: point.x + out.x * corner, y: point.y + out.y * corner };
      d += `${index === 0 ? "M" : "L"}${start.x} ${start.y} Q${point.x} ${point.y} ${end.x} ${end.y} `;
    }
    return `${d}Z`;
  },
};
