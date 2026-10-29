// Building blocks the design components need that swiftui.tsx does not have.
// Kept out of swiftui.tsx (which other ports share) on purpose:
//   - PressButton: a Button with a press state that can also take a ref.
//   - useFillWidth: `.frame(maxWidth: .infinity)` for a control that cannot
//     know whether it sits in a VStack or an HStack.
//   - usePresence: keeps a view mounted through its exit transition.
//   - Presentation: `.presentationDetents` / `.presentationDragIndicator` /
//     `.presentationBackground` / `.presentationCornerRadius` for the content
//     of a swiftui.tsx `Sheet`.
//   - useReduceMotion: `@Environment(\.accessibilityReduceMotion)`.
import {
  useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type ReactNode, type Ref, type RefObject, type PointerEvent as ReactPointerEvent,
} from "react";
import "./design.css";

/** `import.meta.env.BASE_URL`, safe outside Vite. */
export function assetURL(path: string): string {
  let base = "/";
  try {
    base = import.meta.env?.BASE_URL ?? "/";
  } catch {
    /* not under Vite */
  }
  return `${base}${path}`;
}

/** A `Button` whose style and label can follow the press, and which takes a ref. */
export function PressButton(p: {
  onPress?: () => void;
  disabled?: boolean;
  style?: CSSProperties | ((pressed: boolean) => CSSProperties);
  children?: ReactNode | ((pressed: boolean) => ReactNode);
  className?: string;
  innerRef?: Ref<HTMLButtonElement>;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  "aria-current"?: "page" | "true";
  "aria-hidden"?: boolean;
  role?: string;
  title?: string;
}) {
  const [pressed, setPressed] = useState(false);
  const up = () => setPressed(false);
  return (
    <button
      ref={p.innerRef}
      type="button"
      className={`sl-pressable ${p.className ?? ""}`}
      disabled={p.disabled}
      aria-label={p["aria-label"]}
      aria-pressed={p["aria-pressed"]}
      aria-current={p["aria-current"]}
      aria-hidden={p["aria-hidden"]}
      role={p.role}
      title={p.title}
      onPointerDown={(e: ReactPointerEvent) => {
        if (e.button === 0 && !p.disabled) setPressed(true);
      }}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onClick={() => !p.disabled && p.onPress?.()}
      style={{ background: "transparent", ...(typeof p.style === "function" ? p.style(pressed) : p.style) }}
    >
      {typeof p.children === "function" ? p.children(pressed) : p.children}
    </button>
  );
}

/**
 * `.frame(maxWidth: .infinity)` on a view that may be placed in either axis:
 * `alignSelf: stretch` in a column, `flex: 1 1 0` in a row, `width: 100%`
 * anywhere else. Reads the parent's layout once it is on screen.
 */
export function useFillWidth<T extends HTMLElement>(): [RefObject<T | null>, CSSProperties] {
  const ref = useRef<T>(null);
  const [axis, setAxis] = useState<"column" | "row" | "other">("column");
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const cs = getComputedStyle(parent);
    const next = cs.display.includes("flex") ? (cs.flexDirection.startsWith("row") ? "row" : "column") : "other";
    if (next !== axis) setAxis(next);
  });
  const style: CSSProperties =
    axis === "row" ? { flex: "1 1 0", minWidth: 0 } : axis === "column" ? { alignSelf: "stretch" } : { width: "100%" };
  return [ref, style];
}

/** Keeps a view mounted through its exit transition: `shown` drives the CSS. */
export function usePresence(isPresented: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(isPresented);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (isPresented) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [isPresented, exitMs]);
  return { mounted, shown };
}

/** `@Environment(\.accessibilityReduceMotion)`. */
export function useReduceMotion(): boolean {
  const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : undefined;
  const [reduce, setReduce] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = () => setReduce(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return reduce;
}

export type PresentationDetent = "medium" | "large" | { fraction: number } | { height: number };

/**
 * The presentation modifiers of a sheet's content, applied to the swiftui.tsx
 * `Sheet` it is shown in. Render it anywhere inside the sheet's content:
 *
 *   <Sheet isPresented={x} onDismiss={…}>
 *     <Presentation detents={[{ fraction: 0.86 }]} dragIndicator="hidden" background={SL.Surface.raised} cornerRadius={SL.Radius.xl} />
 *     …
 *   </Sheet>
 *
 * With several detents the sheet opens at the smallest, as iOS does. Outside
 * a `Sheet` it does nothing.
 */
export function Presentation(p: {
  detents?: PresentationDetent[];
  dragIndicator?: "automatic" | "visible" | "hidden";
  background?: string;
  cornerRadius?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const key = JSON.stringify(p);
  useLayoutEffect(() => {
    const dialog = ref.current?.closest('[role="dialog"]') as HTMLElement | null;
    // Only the swiftui.tsx Sheet: its dialog sits inside an overlay beside the dim layer.
    if (!dialog || dialog.classList.contains("sl-overlay") || !dialog.parentElement?.classList.contains("sl-overlay")) return;
    const saved = {
      top: dialog.style.top,
      marginTop: dialog.style.marginTop,
      background: dialog.style.background,
      tl: dialog.style.borderTopLeftRadius,
      tr: dialog.style.borderTopRightRadius,
    };
    const handle = dialog.firstElementChild as HTMLElement | null;
    const isHandle = !!handle && handle.style.position === "absolute" && handle.style.touchAction === "none";
    const savedHandle = isHandle ? { height: handle!.style.height, visibility: (handle!.firstElementChild as HTMLElement | null)?.style.visibility ?? "" } : undefined;

    if (p.detents && p.detents.length > 0) {
      const vh = window.innerHeight;
      const px = (d: PresentationDetent) =>
        d === "large" ? Infinity : d === "medium" ? vh * 0.5 : "fraction" in d ? vh * d.fraction : d.height;
      const smallest = [...p.detents].sort((a, b) => px(a) - px(b))[0];
      if (smallest !== "large") {
        dialog.style.top =
          smallest === "medium" ? "50%" : "fraction" in smallest ? `${(1 - smallest.fraction) * 100}%` : `calc(100% - ${smallest.height}px)`;
        dialog.style.marginTop = "0px";
      }
    }
    if (p.background) dialog.style.background = p.background;
    if (p.cornerRadius !== undefined) {
      dialog.style.borderTopLeftRadius = `${p.cornerRadius}px`;
      dialog.style.borderTopRightRadius = `${p.cornerRadius}px`;
    }
    if (isHandle && p.dragIndicator === "hidden") {
      // Still swipes down, as iOS does; only the grabber goes, and the drag
      // strip no longer reaches over the head's controls.
      handle!.style.height = "16px";
      const bar = handle!.firstElementChild as HTMLElement | null;
      if (bar) bar.style.visibility = "hidden";
    }
    return () => {
      dialog.style.top = saved.top;
      dialog.style.marginTop = saved.marginTop;
      dialog.style.background = saved.background;
      dialog.style.borderTopLeftRadius = saved.tl;
      dialog.style.borderTopRightRadius = saved.tr;
      if (isHandle && savedHandle) {
        handle!.style.height = savedHandle.height;
        const bar = handle!.firstElementChild as HTMLElement | null;
        if (bar) bar.style.visibility = savedHandle.visibility;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <span ref={ref} aria-hidden style={{ display: "none" }} />;
}

/** A `strokeBorder` with a dash pattern, drawn inside its box (SVG, so the dash lengths are exact). */
export function DashedBorder({ color, radius, dash, lineWidth = 1 }: { color: string; radius: number; dash: string; lineWidth?: number }) {
  const inset = lineWidth / 2;
  return (
    <svg aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
      <rect
        x={inset}
        y={inset}
        rx={Math.max(0, radius - inset)}
        style={{ width: `calc(100% - ${lineWidth}px)`, height: `calc(100% - ${lineWidth}px)` }}
        fill="none"
        stroke={color}
        strokeWidth={lineWidth}
        strokeDasharray={dash}
      />
    </svg>
  );
}
