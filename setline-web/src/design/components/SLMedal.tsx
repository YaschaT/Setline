// SLMedal.swift — a lift medal: a round disc in its metal with the place
// struck in, hung from two short ribbon tails. A light passes once across
// the disc as it appears — kept for gold.
import { useEffect, useState, type CSSProperties } from "react";
import { SL } from "../tokens";
import { HStack, Spacer, Text, VStack } from "../swiftui";
import { colorHex, colorOpacity } from "../SetlineTokens";
import { slFixed } from "../SLDynamicType";
import { useReduceMotion } from "../support";
import { slBody, slMeta } from "./SLText";
import { LiftMedal_Place, type LiftMedal } from "../../core/Progress/Medals";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";

export function SLMedal({ place, size = 36, shines = false, style }: { place: LiftMedal_Place; size?: number; shines?: boolean; style?: CSSProperties }) {
  const reduceMotion = useReduceMotion();
  const [sweep, setSweep] = useState(-1);
  useEffect(() => {
    if (!shines || reduceMotion) return;
    setSweep(-1);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSweep(1)));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const metal = SLMedal.metal(place);
  const disc = size * 0.82;
  const ribbon = (fill: string) => (
    <div style={{ width: size * 0.26, height: size * 0.42, background: fill, clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)" }} />
  );
  return (
    <div role="img" aria-label={LiftMedal_Place.title(place)} style={{ position: "relative", flexShrink: 0, width: size, height: size * 1.06, ...style }}>
      {/* Ribbon tails, behind the disc. */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "center", gap: size * 0.04 }}>
        {ribbon(metal.edge)}
        {ribbon(colorOpacity(metal.edge, 0.75))}
      </div>
      <div style={{ position: "absolute", top: size * 0.24, left: (size - disc) / 2, width: disc, height: disc }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: metal.edge }} />
        <div style={{ position: "absolute", inset: size * 0.07, borderRadius: "50%", background: metal.face }} />
        <div style={{ position: "absolute", inset: size * 0.17, borderRadius: "50%", boxShadow: `inset 0 0 0 ${Math.max(1, size * 0.035)}px ${colorOpacity(metal.edge, 0.55)}` }} />
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <Text color={metal.edge} lineHeight={1} style={slFixed(size * 0.36, SL.Weight.bold)}>
            {`${place}`}
          </Text>
        </div>
        {shines && (
          <div style={{ position: "absolute", inset: size * 0.07, borderRadius: "50%", overflow: "hidden", pointerEvents: "none" }}>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: size * 0.18,
                height: disc,
                background: "rgba(255, 255, 255, 0.55)",
                mixBlendMode: "plus-lighter",
                transform: `translate(-50%, -50%) translateX(${sweep * size}px) rotate(25deg)`,
                transition: sweep === 1 ? "transform 0.7s ease-in-out 0.35s" : "none",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

SLMedal.metal = (place: LiftMedal_Place): { face: string; edge: string } => {
  switch (place) {
    case LiftMedal_Place.gold:
      return { face: colorHex(0xffd166), edge: colorHex(0xb07d12) };
    case LiftMedal_Place.silver:
      return { face: colorHex(0xdde3e7), edge: colorHex(0x7d8a92) };
    default:
      return { face: colorHex(0xe2a576), edge: colorHex(0x7a4526) };
  }
};

/** One medal as a row: the medal, the lift, and what earned it. */
export function SLMedalRow({ medal, display }: { medal: LiftMedal; display: NumberDisplay }) {
  const title = LiftMedal_Place.title(medal.place);
  const kg = NumberDisplay.kg(display, medal.weightKg);
  return (
    <HStack spacing={SL.Space.s3} aria-label={`${title} on ${medal.name}: ${kg} times ${medal.reps}`} role="group">
      <SLMedal place={medal.place} size={34} shines={medal.place === LiftMedal_Place.gold} />
      <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
        <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={1}>
          {medal.name}
        </Text>
        <Text {...slMeta()} numerals color={SL.Ink.secondary}>
          {`${title} · ${kg} × ${medal.reps}`}
        </Text>
      </VStack>
      <Spacer minLength={0} />
    </HStack>
  );
}
