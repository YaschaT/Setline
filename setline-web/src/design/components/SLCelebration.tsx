// SLCelebration.swift — a moment worth marking: a new PR, a week goal, a
// milestone. A short card springs in at the top and leaves by itself after
// a couple of seconds (or on a tap). With Reduce Motion it fades instead.
//
// `.slCelebration($item)` → `<SLCelebration item={binding}>…content…</SLCelebration>`
// (or `<SLCelebration item={binding} />` inside a `position: relative` box).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SL } from "../tokens";
import { HStack, Text, VStack, type Binding } from "../swiftui";
import { SFSymbol } from "../SFSymbol";
import { colorOpacity, spring } from "../SetlineTokens";
import { SLSound } from "../SLSound";
import { usePresence, useReduceMotion } from "../support";
import { slLead, slMeta } from "./SLText";
import { SLBadge } from "./SLBadge";
import { uuid } from "../../core/Support/swift";
import type { Milestone } from "../../core/Progress/Milestones";

/** A moment worth marking. */
export interface Celebration {
  id: string;
  symbol: string;
  title: string;
  detail: string;
  /** A milestone shows its badge instead of a symbol. */
  badge?: Milestone;
}
export const Celebration = {
  make(a: { symbol: string; title: string; detail: string; badge?: Milestone }): Celebration {
    return { id: uuid(), symbol: a.symbol, title: a.title, detail: a.detail, badge: a.badge };
  },
};

export function SLCelebration({ item, children, style }: { item: Binding<Celebration | undefined>; children?: ReactNode; style?: CSSProperties }) {
  const reduceMotion = useReduceMotion();
  const current = item.value;
  const { mounted, shown } = usePresence(current !== undefined, 450);
  // The card keeps showing the last item while it leaves.
  const [last, setLast] = useState<Celebration | undefined>(current);
  if (current !== undefined && current !== last) setLast(current);
  const shownItem = current ?? last;

  const latest = useRef(item);
  latest.current = item;
  const dismiss = () => latest.current.set(undefined);

  // `.task(id: item.id)`: the chime, then leave after 2.6 s if still the same.
  const id = current?.id;
  useEffect(() => {
    if (id === undefined) return;
    SLSound.play("chime");
    const t = setTimeout(() => {
      if (latest.current.value?.id === id) latest.current.set(undefined);
    }, 2600);
    return () => clearTimeout(t);
  }, [id]);

  const overlay =
    mounted && shownItem ? (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          paddingLeft: SL.Space.gutterSession,
          paddingRight: SL.Space.gutterSession,
          paddingTop: SL.Space.s2,
          pointerEvents: "none",
        }}
      >
        <div
          role="status"
          aria-live="polite"
          aria-label={`${shownItem.title}. ${shownItem.detail}`}
          onClick={dismiss}
          style={{
            pointerEvents: "auto",
            padding: SL.Space.s4,
            borderRadius: SL.Radius.xl,
            background: SL.Surface.raised,
            boxShadow: `0 10px 24px rgba(0, 0, 0, 0.5), inset 0 0 0 1px ${colorOpacity(SL.Signal.action, 0.5)}`,
            opacity: shown ? 1 : 0,
            transform: shown || reduceMotion ? "translateY(0)" : "translateY(calc(-100% - 8px))",
            transition: reduceMotion ? "opacity 0.2s ease-out" : `transform ${spring(0.42, 0.78)}, opacity 0.3s ease-out`,
            cursor: "pointer",
          }}
        >
          <HStack spacing={SL.Space.s3}>
            {shownItem.badge ? (
              <SLBadge milestone={shownItem.badge} size={52} />
            ) : (
              <div
                key={shownItem.id}
                style={{
                  width: 48,
                  height: 48,
                  flexShrink: 0,
                  borderRadius: "50%",
                  background: SL.Signal.action,
                  display: "grid",
                  placeItems: "center",
                  animation: reduceMotion ? undefined : "sl-symbol-bounce 0.5s ease-out 0.15s",
                }}
              >
                <SFSymbol name={shownItem.symbol} size={24} weight={600} color={SL.Signal.onAction} />
              </div>
            )}
            <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
              <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>
                {shownItem.title}
              </Text>
              <Text {...slMeta()} numerals color={SL.Ink.secondary}>
                {shownItem.detail}
              </Text>
            </VStack>
          </HStack>
        </div>
      </div>
    ) : null;

  if (children === undefined) return overlay;
  return (
    <div style={{ position: "relative", ...style }}>
      {children}
      {overlay}
    </div>
  );
}
