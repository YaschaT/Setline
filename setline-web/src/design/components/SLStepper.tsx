// SLStepper.swift — Redesign 1b · − value +, one tap per step.
//
// A tile on surface-2 with its label centred above: two 44pt buttons and the
// number between them at 34. A value moved off what was proposed turns lime
// inside a lime edge, so a correction is visible before it is saved. Where
// `onTyped` is given, tapping the number turns it into a field right where
// it is (✓ takes the place of +).
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { SL, slFont, slNumerals } from "../tokens";
import { Text } from "../swiftui";
import { SFSymbol } from "../SFSymbol";
import { PressButton, useFillWidth } from "../support";
import { slLineHeight } from "../SLDynamicType";
import { slMeta } from "./SLText";

/** `SLStepper.Level`. */
export type SLStepper_Level = "onRaised" | "onRaised2";
export const SLStepper_Level = {
  /** The input card and the set sheet: the value at 34. */
  onRaised: "onRaised" as SLStepper_Level,
  /** A supporting control inside a card: the value at 21. */
  onRaised2: "onRaised2" as SLStepper_Level,
  allCases: ["onRaised", "onRaised2"] as SLStepper_Level[],
};

/** `UIKeyboardType`, the ones that matter for a number field. */
export type UIKeyboardType = "decimalPad" | "numberPad" | "numbersAndPunctuation" | "default";
const inputMode = (k: UIKeyboardType) => (k === "decimalPad" ? "decimal" : k === "numberPad" ? "numeric" : "text");

/** The steps ViewThatFits tries, largest first. */
const factors = [1, 0.82, 0.68, 0.55];

/** `Decimal(string:)` reads a leading number and ignores what follows. */
const isDecimal = (s: string) => /^[+-]?(\d+(\.\d*)?|\.\d+)/.test(s);

export function SLStepper({
  label,
  display,
  level = "onRaised",
  disabledNote,
  isChanged = false,
  onTapValue,
  valueHint,
  onTyped,
  keyboard = "decimalPad",
  startsTyping = false,
  onDecrement,
  onIncrement,
}: {
  label: string;
  display: string;
  level?: SLStepper_Level;
  /** Set when no plate can produce the next increment: "gewicht · uit (geen schijven)". */
  disabledNote?: string;
  /** The value was changed by hand and not saved yet. */
  isChanged?: boolean;
  /** Tapping the value itself, where the design gives it a destination. */
  onTapValue?: () => void;
  valueHint?: string;
  /** Typing the value in place; called with what was typed when it is confirmed (✓, or tapping elsewhere), and as it is typed. */
  onTyped?: (typed: string) => void;
  keyboard?: UIKeyboardType;
  /** Opens with the field already typing — a first set with no weight yet. */
  startsTyping?: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const [typing, setTyping] = useState(() => startsTyping && onTyped !== undefined);
  const [typed, setTyped] = useState("");
  const [rootRef, fill] = useFillWidth<HTMLDivElement>();
  const state = useRef({ typing, typed, onTyped });
  state.current = { typing, typed, onTyped };

  const valueSize = level === "onRaised" ? SL.TypeSize.display : SL.TypeSize.title;
  const ink = disabledNote !== undefined ? SL.Ink.tertiary : isChanged ? SL.Signal.action : SL.Ink.primary;
  const disabled = disabledNote !== undefined;

  // ViewThatFits(in: .horizontal): the number steps down a size before it would run under the + button.
  const boxRef = useRef<HTMLElement | null>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [step, setStep] = useState(0);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      const text = textRef.current;
      if (!text) return;
      const current = parseFloat(getComputedStyle(text).fontSize) || valueSize;
      const perPoint = text.getBoundingClientRect().width / current;
      const room = box.clientWidth;
      let chosen = factors.findIndex((f) => perPoint * valueSize * f <= room + 0.5);
      if (chosen < 0) chosen = factors.length - 1;
      setStep((s) => (s === chosen ? s : chosen));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [display, valueSize, typing]);

  const startTyping = () => {
    setTyped("");
    setTyping(true);
  };

  /** Takes what was typed — nothing typed keeps the value — and puts the number back. */
  const confirm = () => {
    const s = state.current;
    if (!s.typing) return;
    state.current = { ...s, typing: false };
    setTyping(false);
    const value = s.typed.trim();
    if (value.length > 0) s.onTyped?.(value);
  };

  const size = valueSize * factors[step];
  const number = (
    <span
      ref={textRef}
      style={{ ...slFont(size, SL.Weight.semibold), ...slNumerals, ...slLineHeight(1, { size }), color: ink, whiteSpace: "nowrap", display: "inline-block", flexShrink: 0 }}
    >
      {display}
    </span>
  );
  const boxStyle: CSSProperties = {
    flex: "1 1 0",
    minWidth: 0,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  let value;
  if (onTyped !== undefined && typing) {
    value = (
      <input
        ref={(n) => {
          boxRef.current = n;
        }}
        className="sl-stepper-field"
        autoFocus
        value={typed}
        placeholder={display === "—" ? "kg" : display}
        inputMode={inputMode(keyboard)}
        enterKeyHint="done"
        aria-label={`${label}, type a value`}
        onChange={(e) => {
          const now = e.target.value;
          setTyped(now);
          state.current = { ...state.current, typed: now };
          // Applied as it is typed, so Save works without tapping ✓.
          const v = now.trim();
          if (v.length > 0 && isDecimal(v.replace(/,/g, "."))) onTyped?.(v);
        }}
        onBlur={confirm}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirm();
        }}
        style={{
          ...boxStyle,
          ...slFont(valueSize * 0.82, SL.Weight.semibold),
          ...slNumerals,
          textAlign: "center",
          color: SL.Signal.action,
          minHeight: SL.Space.hitMin,
          width: "100%",
          padding: 0,
          border: "none",
          background: "transparent",
          appearance: "none",
        }}
      />
    );
  } else if (onTyped !== undefined || onTapValue !== undefined) {
    value = (
      <PressButton
        innerRef={(n) => {
          boxRef.current = n;
        }}
        onPress={onTyped !== undefined ? startTyping : onTapValue}
        aria-label={valueHint ?? "Type a value"}
        style={{ ...boxStyle, minHeight: SL.Space.hitMin }}
      >
        {number}
      </PressButton>
    );
  } else {
    value = (
      <div
        ref={(n) => {
          boxRef.current = n;
        }}
        style={boxStyle}
      >
        {number}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`${label}, ${display}${isChanged ? ", changed" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: `${SL.Space.s2}px ${SL.Space.s2}px 10px`,
        background: SL.Surface.raised2,
        borderRadius: SL.Radius.md,
        // Drawn inside, so the tile keeps its size when the edge appears.
        boxShadow: `inset 0 0 0 1px ${isChanged ? SL.Signal.action : "transparent"}`,
        minWidth: 0,
        ...fill,
      }}
    >
      <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8} align="center" style={{ alignSelf: "stretch" }}>
        {(disabledNote !== undefined ? `${label} · ${disabledNote}` : label).toLowerCase()}
      </Text>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", alignSelf: "stretch", minWidth: 0 }}>
        <StepButton glyph="−" disabled={disabled || typing} dimmed={typing} inkDisabled={disabled} onPress={onDecrement} />
        {value}
        {typing ? (
          // The number pad has no return key: this is it.
          <button
            type="button"
            className="sl-pressable"
            aria-label="Done"
            onMouseDown={(e) => e.preventDefault()}
            onClick={confirm}
            style={{
              flexShrink: 0,
              minWidth: SL.Space.hitMin,
              minHeight: SL.Space.hitMin,
              borderRadius: SL.Radius.md,
              background: SL.Signal.action,
              display: "grid",
              placeItems: "center",
            }}
          >
            <SFSymbol name="checkmark" size={17} weight={700} color={SL.Signal.onAction} />
          </button>
        ) : (
          <StepButton glyph="+" disabled={disabled} inkDisabled={disabled} onPress={onIncrement} />
        )}
      </div>
    </div>
  );
}

/** A stepper's − and +: the hairline grey at rest, one step lighter while it is held (`SLStepButtonStyle`). */
function StepButton({ glyph, disabled, dimmed = false, inkDisabled, onPress }: { glyph: string; disabled: boolean; dimmed?: boolean; inkDisabled: boolean; onPress: () => void }) {
  return (
    <PressButton
      onPress={onPress}
      disabled={disabled}
      style={(pressed) => ({
        flexShrink: 0,
        minWidth: SL.Space.hitMin,
        minHeight: SL.Space.hitMin,
        display: "grid",
        placeItems: "center",
        borderRadius: SL.Radius.md,
        background: pressed ? SL.Surface.hairlineStrong : SL.Surface.hairline,
        opacity: dimmed ? 0.3 : 1,
        ...slFont(SL.TypeSize.title, SL.Weight.semibold),
        lineHeight: 1.25,
        color: inkDisabled ? SL.Ink.tertiary : SL.Ink.primary,
      })}
    >
      {glyph}
    </PressButton>
  );
}
