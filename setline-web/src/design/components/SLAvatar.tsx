// SLAvatar.swift — the account's picture in a circle or, without one, the
// initial of its name in lime on the raised surface, ringed by the strong
// hairline either way. A fixed size: it is a mark, not text.
import type { CSSProperties } from "react";
import { SL } from "../tokens";
import { Text } from "../swiftui";
import { slFixed } from "../SLDynamicType";

export function SLAvatar({
  photo,
  initial,
  size = 48,
  style,
}: {
  /** An image URL (the web's `UIImage`: an object or data URL). */
  photo?: string;
  initial?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        background: SL.Surface.raised2,
        display: "grid",
        placeItems: "center",
        ...style,
      }}
    >
      {photo !== undefined ? (
        <img src={photo} alt="" draggable={false} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }} />
      ) : initial !== undefined ? (
        // 1a: 19 on a 48 circle.
        <Text color={SL.Signal.action} lineHeight={1} style={slFixed((size * 19) / 48, SL.Weight.semibold)}>
          {initial}
        </Text>
      ) : null}
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `${SL.Metric.border}px solid ${SL.Surface.hairlineStrong}`, pointerEvents: "none" }} />
    </div>
  );
}
