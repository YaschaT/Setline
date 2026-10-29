// SidewaysDrag.swift — a drag that is only ever sideways. It starts when the
// finger sets off sideways by half as much again as up or down; a pull that
// sets off up or down never becomes it, and the page scrolls instead
// (`touch-action: pan-y` hands vertical pans to the browser).
//
// `.gesture(SidewaysDrag(onChanged:onEnded:))` → spread `useSidewaysDrag({ onChanged, onEnded })`
// onto the element, or wrap it in `<SidewaysDrag onChanged onEnded>`.
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

/** How far the finger moves before the pan decides (UIKit's hysteresis). */
const slop = 10;

export function useSidewaysDrag(p: { onChanged: (dx: number) => void; onEnded: (dx: number) => void }) {
  const state = useRef<{ id: number; x: number; y: number; active: boolean; decided: boolean } | null>(null);
  const dragged = useRef(false);
  const latest = useRef(p);
  latest.current = p;
  return {
    style: { touchAction: "pan-y" } as CSSProperties,
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      state.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, decided: false };
      dragged.current = false;
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const s = state.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.decided) {
        if (Math.hypot(dx, dy) < slop) return;
        s.decided = true;
        // gestureRecognizerShouldBegin: abs(move.x) > abs(move.y) * 1.5
        s.active = Math.abs(dx) > Math.abs(dy) * 1.5;
        if (!s.active) return;
        dragged.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }
      if (s.active) latest.current.onChanged(dx);
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const s = state.current;
      if (!s || s.id !== e.pointerId) return;
      state.current = null;
      if (s.active) latest.current.onEnded(e.clientX - s.x);
    },
    onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
      const s = state.current;
      if (!s || s.id !== e.pointerId) return;
      state.current = null;
      if (s.active) latest.current.onEnded(0);
    },
    /** A drag is not a tap: the click that follows it is swallowed. */
    onClickCapture(e: ReactMouseEvent<HTMLElement>) {
      if (dragged.current) {
        dragged.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    },
  };
}

export function SidewaysDrag({
  onChanged,
  onEnded,
  style,
  children,
}: {
  onChanged: (dx: number) => void;
  onEnded: (dx: number) => void;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const { style: dragStyle, ...handlers } = useSidewaysDrag({ onChanged, onEnded });
  return (
    <div {...handlers} style={{ ...dragStyle, ...style }}>
      {children}
    </div>
  );
}
