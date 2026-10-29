// SwiftUI's building blocks, on the web — so each iOS view can be ported line
// by line. Defaults follow SwiftUI: stacks centre their children, Spacer has a
// minimum length of 8, Text wraps unless given a line limit.
import {
  createContext, useContext, useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { SL, slFont, slNumerals, type Weight } from "./tokens";

type Axis = "vertical" | "horizontal" | "z";
const AxisContext = createContext<Axis>("vertical");

export type HAlign = "leading" | "center" | "trailing";
export type VAlign = "top" | "center" | "bottom" | "firstTextBaseline" | "lastTextBaseline";

const hAlign = (a: HAlign) => (a === "leading" ? "flex-start" : a === "trailing" ? "flex-end" : "center");
const vAlign = (a: VAlign) =>
  a === "top" ? "flex-start" : a === "bottom" ? "flex-end" : a === "firstTextBaseline" ? "baseline" : a === "lastTextBaseline" ? "last baseline" : "center";

interface StackProps {
  spacing?: number;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
  role?: string;
  "aria-label"?: string;
}

/** `VStack(alignment:spacing:)`. */
export function VStack({ alignment = "center", spacing = 8, style, children, ...rest }: StackProps & { alignment?: HAlign }) {
  return (
    <AxisContext.Provider value="vertical">
      <div {...rest} style={{ display: "flex", flexDirection: "column", alignItems: hAlign(alignment), gap: spacing, minWidth: 0, ...style }}>
        {children}
      </div>
    </AxisContext.Provider>
  );
}

/** `HStack(alignment:spacing:)`. */
export function HStack({ alignment = "center", spacing = 8, style, children, ...rest }: StackProps & { alignment?: VAlign }) {
  return (
    <AxisContext.Provider value="horizontal">
      <div {...rest} style={{ display: "flex", flexDirection: "row", alignItems: vAlign(alignment), gap: spacing, minWidth: 0, ...style }}>
        {children}
      </div>
    </AxisContext.Provider>
  );
}

/** `ZStack(alignment:)` — children share one cell. */
export function ZStack({ alignment = "center", style, children, ...rest }: Omit<StackProps, "spacing"> & { alignment?: "center" | "top" | "bottom" | "leading" | "trailing" | "topLeading" | "topTrailing" | "bottomLeading" | "bottomTrailing" }) {
  const justify = alignment.toLowerCase().includes("leading") ? "start" : alignment.toLowerCase().includes("trailing") ? "end" : "center";
  const align = alignment.startsWith("top") ? "start" : alignment.startsWith("bottom") ? "end" : "center";
  return (
    <AxisContext.Provider value="z">
      <div {...rest} className={`sl-zstack ${rest.className ?? ""}`} style={{ display: "grid", justifyItems: justify, alignItems: align, ...style }}>
        {children}
      </div>
    </AxisContext.Provider>
  );
}

/** `Spacer(minLength:)` along its stack's axis. */
export function Spacer({ minLength = 8 }: { minLength?: number }) {
  const axis = useContext(AxisContext);
  return <div aria-hidden style={{ flex: "1 1 0", ...(axis === "horizontal" ? { minWidth: minLength } : { minHeight: minLength }) }} />;
}

/** `Text` with `.font(.sl(size, weight))`, `.foregroundStyle`, `.lineLimit`, `.multilineTextAlignment`. */
export function Text(p: {
  children?: ReactNode;
  size?: number;
  weight?: Weight;
  color?: string;
  lineLimit?: number;
  /** `.minimumScaleFactor(f)`: on one line, shrink down to `f` of the size before cutting the text short. */
  minimumScaleFactor?: number;
  align?: "leading" | "center" | "trailing";
  numerals?: boolean;
  tracking?: number;
  lineHeight?: number;
  style?: CSSProperties;
  as?: "span" | "h1" | "h2" | "h3" | "p" | "label";
}) {
  const Tag = p.as ?? "span";
  const ref = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const fits = p.minimumScaleFactor !== undefined && p.lineLimit === 1;
  const baseSize = typeof p.style?.fontSize === "number" ? p.style.fontSize : (p.size ?? SL.TypeSize.body);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!fits || !el) return;
    const measure = () => {
      // The text's own width at the current scale, whatever the box clips.
      const range = document.createRange();
      range.selectNodeContents(el);
      const content = range.getBoundingClientRect().width;
      if (content <= 0 || el.clientWidth <= 0) return;
      setScale((current) => {
        const natural = content / current;
        const next = Math.min(1, Math.max(p.minimumScaleFactor!, el.clientWidth / natural));
        return Math.abs(next - current) > 0.005 ? next : current;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fits, p.minimumScaleFactor, p.children, baseSize]);
  const clamp: CSSProperties =
    p.lineLimit === 1
      ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
      : p.lineLimit
        ? { display: "-webkit-box", WebkitLineClamp: p.lineLimit, WebkitBoxOrient: "vertical", overflow: "hidden" }
        : {};
  return (
    <Tag
      ref={ref as never}
      style={{
        ...slFont(p.size ?? SL.TypeSize.body, p.weight ?? 400),
        color: p.color ?? SL.Ink.primary,
        textAlign: p.align === "trailing" ? "right" : p.align === "center" ? "center" : undefined,
        letterSpacing: p.tracking,
        lineHeight: p.lineHeight ?? 1.25,
        margin: 0,
        minWidth: 0,
        overflowWrap: "anywhere",
        ...(p.numerals ? slNumerals : {}),
        ...clamp,
        ...p.style,
        ...(fits && scale < 1 ? { fontSize: baseSize * scale } : {}),
      }}
    >
      {p.children}
    </Tag>
  );
}

/** `ScrollView`. */
export function ScrollView({ children, style, axis = "vertical", innerRef }: { children?: ReactNode; style?: CSSProperties; axis?: "vertical" | "horizontal"; innerRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={innerRef}
      className="sl-scroll"
      style={{
        overflowY: axis === "vertical" ? "auto" : "hidden",
        overflowX: axis === "horizontal" ? "auto" : "hidden",
        WebkitOverflowScrolling: "touch",
        minHeight: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A `Button` with a press state, for ButtonStyles that change while held. */
export function Pressable(p: {
  onPress?: () => void;
  disabled?: boolean;
  style?: CSSProperties | ((pressed: boolean) => CSSProperties);
  children?: ReactNode | ((pressed: boolean) => ReactNode);
  "aria-label"?: string;
  role?: string;
  type?: "button" | "submit";
  className?: string;
}) {
  const [pressed, setPressed] = useState(false);
  const up = () => setPressed(false);
  return (
    <button
      type={p.type ?? "button"}
      className={`sl-pressable ${p.className ?? ""}`}
      disabled={p.disabled}
      aria-label={p["aria-label"]}
      role={p.role}
      onPointerDown={(e: ReactPointerEvent) => {
        if (e.button === 0) setPressed(true);
      }}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onClick={() => !p.disabled && p.onPress?.()}
      style={typeof p.style === "function" ? p.style(pressed) : p.style}
    >
      {typeof p.children === "function" ? p.children(pressed) : p.children}
    </button>
  );
}

/** `Toggle` with `.tint(SL.Signal.action)` — the iOS switch. */
export function Toggle(p: { isOn: boolean; onChange: (on: boolean) => void; label?: ReactNode; disabled?: boolean; style?: CSSProperties; "aria-label"?: string }) {
  const sw = (
    <span
      role="switch"
      aria-checked={p.isOn}
      aria-label={p["aria-label"]}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (!p.disabled) p.onChange(!p.isOn);
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (!p.disabled) p.onChange(!p.isOn);
        }
      }}
      style={{
        position: "relative",
        flexShrink: 0,
        width: 51,
        height: 31,
        borderRadius: 999,
        background: p.isOn ? SL.Signal.action : "rgba(120, 120, 128, 0.36)",
        transition: "background 0.2s",
        cursor: p.disabled ? "default" : "pointer",
        opacity: p.disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: p.isOn ? 22 : 2,
          width: 27,
          height: 27,
          borderRadius: 999,
          background: "#fff",
          boxShadow: "0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)",
          transition: "left 0.2s",
        }}
      />
    </span>
  );
  if (!p.label) return sw;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", ...p.style }} onClick={(e) => e.preventDefault()}>
      <div style={{ flex: "1 1 0", minWidth: 0 }} onClick={() => !p.disabled && p.onChange(!p.isOn)}>
        {p.label}
      </div>
      {sw}
    </label>
  );
}

// MARK: - Presentations

const Portal = ({ children }: { children: ReactNode }) => createPortal(children, document.body);

/** Keeps a presentation mounted through its exit animation. */
function usePresence(isPresented: boolean, exitMs: number) {
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

/** `.sheet(isPresented:)` — the large detent: slides up, the screen behind dims. */
export function Sheet(p: { isPresented: boolean; onDismiss: () => void; children?: ReactNode; dragIndicator?: boolean; background?: string; interactiveDismissDisabled?: boolean }) {
  const { mounted, shown } = usePresence(p.isPresented, SL.Motion.sheetOut * 1000 + 60);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);
  if (!mounted) return null;
  const close = () => !p.interactiveDismissDisabled && p.onDismiss();
  return (
    <Portal>
      <div className="sl-overlay" style={{ position: "fixed", inset: 0, zIndex: 50 }}>
        <div onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", opacity: shown ? 1 : 0, transition: `opacity ${SL.Motion.sheetIn}s` }} />
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            top: "max(env(safe-area-inset-top), 12px)",
            marginTop: 8,
            background: p.background ?? SL.Surface.ground,
            borderTopLeftRadius: SL.Radius.device - 8,
            borderTopRightRadius: SL.Radius.device - 8,
            boxShadow: `0 ${SL.Elevation.sheetY}px ${SL.Elevation.sheetRadius}px ${SL.Elevation.sheetColor}`,
            transform: shown ? `translateY(${dy}px)` : "translateY(100%)",
            transition: drag.current ? "none" : `transform ${shown ? SL.Motion.sheetIn : SL.Motion.sheetOut}s cubic-bezier(0,0,.2,1)`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            maxWidth: 640,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {p.dragIndicator !== false && (
            <div
              onPointerDown={(e) => {
                drag.current = { y: e.clientY, dy: 0 };
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                drag.current.dy = Math.max(0, e.clientY - drag.current.y);
                setDy(drag.current.dy);
              }}
              onPointerUp={() => {
                const moved = drag.current?.dy ?? 0;
                drag.current = null;
                setDy(0);
                if (moved > 120) close();
              }}
              style={{ position: "absolute", top: 0, left: 0, right: 0, height: 24, zIndex: 2, touchAction: "none", display: "flex", justifyContent: "center", paddingTop: 5 }}
            >
              <div style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(235,235,245,0.3)" }} />
            </div>
          )}
          {p.children}
        </div>
      </div>
    </Portal>
  );
}

/** `.fullScreenCover(isPresented:)`. */
export function FullScreenCover(p: { isPresented: boolean; children?: ReactNode; background?: string }) {
  const { mounted, shown } = usePresence(p.isPresented, SL.Motion.sheetOut * 1000 + 60);
  if (!mounted) return null;
  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        className="sl-overlay"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 60,
          background: p.background ?? SL.Surface.ground,
          transform: shown ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${shown ? SL.Motion.sheetIn : SL.Motion.sheetOut}s cubic-bezier(0,0,.2,1)`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {p.children}
      </div>
    </Portal>
  );
}

export interface DialogAction {
  title: string;
  role?: "cancel" | "destructive";
  action?: () => void;
  disabled?: boolean;
}

/** `.alert(title, isPresented:) { buttons } message: { … }`, optionally with one text field. */
export function Alert(p: {
  isPresented: boolean;
  onDismiss: () => void;
  title: string;
  message?: string;
  actions: DialogAction[];
  textField?: { value: string; onChange: (v: string) => void; placeholder?: string; autoCapitalize?: "words" | "none"; inputMode?: "text" | "decimal" | "numeric" };
}) {
  const { mounted, shown } = usePresence(p.isPresented, 150);
  if (!mounted) return null;
  const actions = p.actions.length ? p.actions : [{ title: "OK", role: "cancel" as const }];
  const row = actions.length === 2;
  return (
    <Portal>
      <div className="sl-overlay" style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", background: shown ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0)", transition: "background 0.15s" }}>
        <div role="alertdialog" aria-modal="true" style={{ width: 300, maxWidth: "calc(100vw - 48px)", background: "rgba(38,40,40,0.98)", borderRadius: 30, padding: "22px 18px 18px", transform: shown ? "scale(1)" : "scale(1.08)", opacity: shown ? 1 : 0, transition: "transform 0.15s, opacity 0.15s", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          <Text size={17} weight={600} style={{ display: "block", padding: "0 6px" }}>{p.title}</Text>
          {p.message && <Text size={15} color="rgba(235,235,245,0.75)" style={{ display: "block", marginTop: 8, padding: "0 6px" }}>{p.message}</Text>}
          {p.textField && (
            <input
              autoFocus
              value={p.textField.value}
              placeholder={p.textField.placeholder}
              inputMode={p.textField.inputMode}
              autoCapitalize={p.textField.autoCapitalize}
              onChange={(e) => p.textField!.onChange(e.target.value)}
              style={{ ...slFont(17), width: "100%", marginTop: 16, padding: "12px 16px", borderRadius: 999, border: "none", background: "rgba(118,118,128,0.24)", color: SL.Ink.primary, outline: "none" }}
            />
          )}
          <div style={{ display: "flex", flexDirection: row ? "row" : "column", gap: 10, marginTop: 20 }}>
            {(row ? actions : [...actions.filter((a) => a.role !== "cancel"), ...actions.filter((a) => a.role === "cancel")]).map((a) => (
              <button
                key={a.title}
                type="button"
                disabled={a.disabled}
                className="sl-pressable"
                onClick={() => {
                  p.onDismiss();
                  a.action?.();
                }}
                style={{
                  ...slFont(17, a.role === "cancel" && !row ? 400 : 500),
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 999,
                  background: "rgba(118,118,128,0.24)",
                  color: a.role === "destructive" ? SL.Signal.loss : SL.Signal.action,
                  opacity: a.disabled ? 0.4 : 1,
                }}
              >
                {a.title}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** `.confirmationDialog(title, isPresented:titleVisibility:) { buttons } message: { … }` — the action sheet. */
export function ConfirmationDialog(p: { isPresented: boolean; onDismiss: () => void; title?: string; message?: string; actions: DialogAction[] }) {
  const { mounted, shown } = usePresence(p.isPresented, 200);
  if (!mounted) return null;
  const main = p.actions.filter((a) => a.role !== "cancel");
  const cancel = p.actions.find((a) => a.role === "cancel") ?? { title: "Cancel", role: "cancel" as const };
  const button = (a: DialogAction, i: number, list: DialogAction[]) => (
    <button
      key={a.title}
      type="button"
      disabled={a.disabled}
      className="sl-pressable"
      onClick={() => {
        p.onDismiss();
        a.action?.();
      }}
      style={{
        ...slFont(17, a.role === "cancel" ? 600 : 400),
        width: "100%",
        minHeight: 56,
        background: "transparent",
        color: a.role === "destructive" ? SL.Signal.loss : SL.Signal.action,
        borderTop: i === 0 && list === main && !(p.title || p.message) ? "none" : "0.5px solid rgba(84,84,88,0.6)",
        opacity: a.disabled ? 0.4 : 1,
      }}
    >
      {a.title}
    </button>
  );
  return (
    <Portal>
      <div className="sl-overlay" onClick={p.onDismiss} style={{ position: "fixed", inset: 0, zIndex: 80, background: shown ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)", transition: "background 0.2s", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, padding: "0 8px calc(8px + env(safe-area-inset-bottom))", transform: shown ? "translateY(0)" : "translateY(110%)", transition: "transform 0.2s cubic-bezier(0,0,.2,1)" }}>
          <div style={{ background: "rgba(44,44,46,0.98)", borderRadius: 14, overflow: "hidden" }}>
            {(p.title || p.message) && (
              <div style={{ padding: "14px 16px", textAlign: "center" }}>
                {p.title && <Text size={13} weight={600} color="rgba(235,235,245,0.6)" style={{ display: "block" }}>{p.title}</Text>}
                {p.message && <Text size={13} color="rgba(235,235,245,0.6)" style={{ display: "block", marginTop: p.title ? 4 : 0 }}>{p.message}</Text>}
              </div>
            )}
            {main.map((a, i) => button(a, i, main))}
          </div>
          <div style={{ background: "rgba(44,44,46,0.98)", borderRadius: 14, overflow: "hidden", marginTop: 8 }}>{button({ ...cancel, title: cancel.title }, 0, [])}</div>
        </div>
      </div>
    </Portal>
  );
}

export type MenuEntry =
  | { kind: "button"; title: string; systemImage?: string; role?: "destructive"; action: () => void; disabled?: boolean; checked?: boolean }
  | { kind: "section"; title?: string; entries: MenuEntry[] }
  | { kind: "divider" };

/** `Menu { … } label: { … }` — opens a list next to its label. `Picker` in a menu = buttons with `checked`. */
export function Menu(p: { label: ReactNode; entries: MenuEntry[]; style?: CSSProperties; "aria-label"?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number }>({});
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const below = r.bottom + 8;
    const fitsBelow = window.innerHeight - below > 280;
    const alignRight = r.left + r.width / 2 > window.innerWidth / 2;
    setPos({
      ...(fitsBelow ? { top: below } : { bottom: window.innerHeight - r.top + 8 }),
      ...(alignRight ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, r.left) }),
    });
  }, [open]);
  const render = (entries: MenuEntry[], depth = 0): ReactNode =>
    entries.map((e, i) => {
      if (e.kind === "divider") return <div key={`d${i}`} style={{ height: 8, background: "rgba(0,0,0,0.25)" }} />;
      if (e.kind === "section")
        return (
          <div key={`s${i}`} style={{ borderTop: i > 0 || depth > 0 ? "8px solid rgba(0,0,0,0.25)" : undefined }}>
            {e.title && <Text size={13} color="rgba(235,235,245,0.6)" style={{ display: "block", padding: "10px 16px 4px" }}>{e.title}</Text>}
            {render(e.entries, depth + 1)}
          </div>
        );
      return (
        <button
          key={`b${i}${e.title}`}
          type="button"
          disabled={e.disabled}
          className="sl-pressable sl-menu-item"
          onClick={() => {
            setOpen(false);
            e.action();
          }}
          style={{ ...slFont(17), display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 44, padding: "10px 16px", background: "transparent", textAlign: "left", color: e.role === "destructive" ? SL.Signal.loss : SL.Ink.primary, opacity: e.disabled ? 0.4 : 1, borderTop: i > 0 ? "0.5px solid rgba(84,84,88,0.5)" : undefined }}
        >
          <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>{e.checked ? "✓" : null}</span>
          <span style={{ flex: 1 }}>{e.title}</span>
          {e.systemImage && <MenuIcon name={e.systemImage} />}
        </button>
      );
    });
  return (
    <>
      <button ref={anchor} type="button" className="sl-pressable" aria-haspopup="menu" aria-expanded={open} aria-label={p["aria-label"]} disabled={p.disabled} onClick={() => setOpen(true)} style={{ background: "transparent", ...p.style }}>
        {p.label}
      </button>
      {open && (
        <Portal>
          <div className="sl-overlay" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }}>
            <div role="menu" onClick={(e) => e.stopPropagation()} style={{ position: "fixed", ...pos, minWidth: 250, maxWidth: "calc(100vw - 16px)", maxHeight: "70vh", overflowY: "auto", background: "rgba(44,44,46,0.97)", backdropFilter: "blur(20px)", borderRadius: 14, boxShadow: "0 10px 40px rgba(0,0,0,0.5)", animation: "sl-menu-in 0.18s cubic-bezier(0,0,.2,1)" }}>
              {render(p.entries)}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

import { SFSymbol } from "./SFSymbol";
const MenuIcon = ({ name }: { name: string }) => <SFSymbol name={name} size={16} />;

/** `.onChange(of: scenePhase)` — `active` while the page is visible. */
export function useScenePhase(): "active" | "background" {
  const [phase, setPhase] = useState<"active" | "background">(document.visibilityState === "visible" ? "active" : "background");
  useEffect(() => {
    const on = () => setPhase(document.visibilityState === "visible" ? "active" : "background");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return phase;
}

/** `@AppStorage(key)` — a value kept in localStorage, shared by every view that reads the key. */
export function useAppStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const read = (): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  };
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === key) setValue(read());
    };
    window.addEventListener("sl-appstorage", on);
    return () => window.removeEventListener("sl-appstorage", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = (v: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private mode: keep it in memory */
    }
    setValue(v);
    window.dispatchEvent(new CustomEvent("sl-appstorage", { detail: key }));
  };
  return [value, set];
}

/** `UserDefaults.standard` reads and writes outside a view. */
export const UserDefaults = {
  get<T>(key: string): T | undefined {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  },
  set(key: string, value: unknown): void {
    try {
      if (value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("sl-appstorage", { detail: key }));
  },
};

/** `@Binding var x: T`. */
export type Binding<T> = { value: T; set: (v: T) => void };
/** `.constant(v)`. */
export const constant = <T,>(value: T): Binding<T> => ({ value, set: () => {} });
