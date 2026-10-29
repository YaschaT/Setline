// PlateSheet.swift — Redesign 1b · "Plates per side".
//
// Reached from the input card, and it answers one question: what goes on
// each side. One side of the bar is drawn from the answer, the same answer is
// written out under it, and where the asked-for weight is not something these
// plates can make, it says the closest they can — being right is the entire
// point of the screen.
//
// The plates are the account's own rack. The bar can be tried at another
// weight here; that changes the reckoning on this sheet and nothing else.
import { useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../../data/AppState";
import { HStack, Pressable, Spacer, Text, VStack } from "../../design/swiftui";
import { SL, slFont, slNumerals } from "../../design/tokens";
import { Presentation } from "../../design/support";
import { slBody, slLead, slMeta } from "../../design/components/SLText";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { PlateMath } from "../../core/Engine/PlateMath";

const display = NumberDisplay.english;

/**
 * A plate's size and colour follow its weight: the heavy ones lime and
 * full height, the middle ones mint, the change plates grey and short.
 */
function look(plate: number): { width: number; height: number; color: string } {
  if (plate >= 25) return { width: 28, height: 96, color: SL.Signal.action };
  if (plate >= 20) return { width: 26, height: 96, color: SL.Signal.action };
  if (plate >= 15) return { width: 24, height: 84, color: SL.Signal.recovery };
  if (plate >= 10) return { width: 22, height: 70, color: SL.Signal.recovery };
  if (plate >= 5) return { width: 20, height: 60, color: SL.Ink.meta };
  if (plate >= 2.5) return { width: 18, height: 56, color: SL.Ink.secondary };
  return { width: 18, height: 52, color: SL.Ink.secondary };
}

export function PlateSheet(p: {
  exercise: string;
  setNumber: number;
  reps: number;
  target: number;
  onChoose: (load: number) => void;
  onClose: () => void;
}) {
  const { target } = p;
  const app = useApp();
  /** The sheet hugs its content; the detent follows what was laid out. */
  const [contentHeight, setContentHeight] = useState(400);
  /** The bar the plates are reckoned against. Opens on the account's own. */
  const [chosenBar, setChosenBar] = useState<number | undefined>(undefined);
  const content = useRef<HTMLDivElement>(null);

  const rack = app.plateInventory;
  const bar = chosenBar ?? rack.barKg;
  const solution = PlateMath.solve({ target, bar, plates: rack.plates });

  /** The account's bar, and the other one a gym usually has. */
  const bars = (() => {
    const options = [rack.barKg];
    for (const common of [20, 15]) if (!options.includes(common) && options.length < 2) options.push(common);
    return options;
  })();

  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const measure = () => setContentHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /** "1 × 20 + 1 × 10 + 1 × 1,25 per kant" */
  const perSide = (() => {
    if (target < bar) return `Lighter than the ${NumberDisplay.kg(display, bar)} bar`;
    if (solution.perSide.length === 0) return "Just the bar";
    const counts: { plate: number; count: number }[] = [];
    for (const plate of solution.perSide) {
      const last = counts[counts.length - 1];
      if (last && last.plate === plate) last.count += 1;
      else counts.push({ plate, count: 1 });
    }
    return counts.map((c) => `${c.count} × ${NumberDisplay.number(display, c.plate)}`).join(" + ") + " per side";
  })();

  const footnote = (() => {
    if (target < bar) return `The bar alone already weighs ${NumberDisplay.kg(display, bar)}.`;
    if (solution.isExact) return "Possible with your plates.";
    return `${NumberDisplay.kg(display, target)} isn't possible with your plates; this is ${NumberDisplay.kg(display, solution.total)}, the closest that is.`;
  })();

  const option = (key: string | number, selected: boolean, label: string, weight: 400 | 600, onPress: () => void, extra: { fill?: string; ink?: string; ariaLabel?: string; minimumScaleFactor?: number } = {}) => (
    <Pressable
      key={key}
      aria-label={extra.ariaLabel}
      onPress={onPress}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        minHeight: 48 + 2 * SL.Metric.border,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: SL.Radius.md,
        background: extra.fill ?? (selected ? SL.Signal.actionTint : "transparent"),
        border: `1px solid ${selected ? SL.Signal.action : SL.Surface.hairlineStrong}`,
      }}
    >
      <Text {...slBody(weight)} numerals lineLimit={1} minimumScaleFactor={extra.minimumScaleFactor} color={extra.ink ?? (selected ? SL.Signal.action : SL.Ink.primary)}>{label}</Text>
    </Pressable>
  );

  /**
   * Drawn from the answer rather than decorating it: the collar, the
   * plates heaviest first, and the sleeve running out.
   */
  const stack = (
    <HStack alignment="bottom" spacing={6} aria-hidden style={{ height: 96, alignSelf: "stretch", marginTop: SL.Space.s4 }}>
      <span style={{ width: 14, height: 24, borderRadius: 4, background: SL.Surface.mute, flexShrink: 0 }} />
      {solution.perSide.map((plate, i) => {
        const l = look(plate);
        return (
          <span key={i} style={{ position: "relative", width: l.width, height: l.height, borderRadius: SL.Radius.sm, background: l.color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ ...slFont(plate < 2.5 ? 12 : 13, SL.Weight.bold), ...slNumerals, color: SL.Signal.onAction, whiteSpace: "nowrap", transform: "rotate(-90deg)" }}>
              {NumberDisplay.number(display, plate)}
            </span>
          </span>
        );
      })}
      <span style={{ flex: "1 1 0", height: 24, borderRadius: 4, background: SL.Surface.mute }} />
    </HStack>
  );

  return (
    <>
      <Presentation detents={[{ height: contentHeight }, "large"]} background={SL.Surface.raised} cornerRadius={SL.Radius.xl} dragIndicator="hidden" />
      <div ref={content} style={{ background: SL.Surface.raised }}>
        <VStack
          alignment="leading"
          spacing={0}
          style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s4, paddingBottom: `calc(${SL.Space.s2}px + env(safe-area-inset-bottom))` }}
        >
          {/* Which set this is stays on the session behind the sheet. VoiceOver still hears it first. */}
          <HStack
            alignment="firstTextBaseline"
            spacing={SL.Space.s3}
            aria-label={`${p.exercise}, set ${p.setNumber}, ${NumberDisplay.kg(display, target)} × ${p.reps}. Plates per side, bar ${NumberDisplay.kg(display, bar)}`}
            style={{ alignSelf: "stretch" }}
          >
            <Text {...slLead()} color={SL.Ink.primary} as="h2">Plates per side</Text>
            <Spacer minLength={SL.Space.s2} />
            <Text {...slMeta()} numerals color={SL.Ink.secondary} align="trailing">
              {`bar ${NumberDisplay.kg(display, bar)} · ${NumberDisplay.kg(display, target)} total`}
            </Text>
          </HStack>

          {stack}

          <Text {...slBody()} numerals color={SL.Ink.primary} style={{ paddingTop: SL.Space.s3 }}>{perSide}</Text>

          {(!solution.isExact || target <= bar) && (
            <Text {...slMeta()} numerals color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s1 }}>{footnote}</Text>
          )}

          {/* The loads around this one that the same plates can make. Choosing one sets the weight of the set. */}
          <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingTop: 14 }}>
            <Text {...slMeta()} color={SL.Ink.secondary}>Possible weights</Text>
            <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
              {PlateMath.nearby({ target, bar, plates: rack.plates }).map((load) =>
                // The edge marks the load that is drawn above.
                option(load, load === solution.total, NumberDisplay.number(display, load), 600, () => p.onChoose(load), { ariaLabel: NumberDisplay.kg(display, load), minimumScaleFactor: 0.7 }),
              )}
            </HStack>
          </VStack>

          <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingTop: SL.Space.s2 }}>
            {bars.map((b) => option(`bar${b}`, b === bar, `bar ${NumberDisplay.kg(display, b)}`, b === bar ? 600 : 400, () => setChosenBar(b), { minimumScaleFactor: 0.7 }))}
            {option("close", false, "Close", 600, p.onClose, { fill: SL.Surface.raised2, ink: SL.Ink.primary })}
          </HStack>
        </VStack>
      </div>
    </>
  );
}
