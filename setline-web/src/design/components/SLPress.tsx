// SLPress.swift — `SLPressStyle` as a button: a press you can feel. The
// element sinks a little under the finger and springs back on release.
// Reduce Motion drops the movement. (The haptic is left out on the web.)
import type { CSSProperties, ReactNode } from "react";
import { PressButton, useReduceMotion } from "../support";
import { spring } from "../SetlineTokens";

export function SLPress({
  scale = 0.96,
  bounces = false,
  ...p
}: {
  /** How far it sinks: 0.96 for rows and cards, lower for small targets. */
  scale?: number;
  /** Small targets also tilt up a little as they come back, like a token. */
  bounces?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  "aria-label"?: string;
  children?: ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  return (
    <PressButton
      onPress={p.onPress}
      disabled={p.disabled}
      aria-label={p["aria-label"]}
      style={(isPressed) => {
        const pressed = isPressed && !reduceMotion;
        return {
          display: "block",
          transform: `scale(${pressed ? scale : 1})`,
          filter: isPressed ? "brightness(0.96)" : "brightness(1)",
          transition: reduceMotion
            ? "none"
            : pressed
              ? "transform 0.1s ease-out, filter 0.1s ease-out"
              : bounces
                ? `transform ${spring(0.35, 0.45)}, filter 0.35s ease-out`
                : `transform ${spring(0.3, 0.6)}, filter 0.3s ease-out`,
          ...p.style,
        };
      }}
    >
      {p.children}
    </PressButton>
  );
}
