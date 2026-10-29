// DropSetEditor.swift — a drop set's lighter rounds, L / R / Both, and the
// per-side reps tile. Used by the set card and by the set sheet.
import { HStack, Pressable, Spacer, Text, VStack, type Binding } from "../../design/swiftui";
import { SL, slNumerals } from "../../design/tokens";
import { colorOpacity } from "../../design/SetlineTokens";
import { SFSymbol } from "../../design/SFSymbol";
import { slMeta } from "../../design/components/SLText";
import { DropStep, SetSide, type SideReps } from "../../core/Domain/Model";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Estimates } from "../../core/Engine/Estimates";
import { dec } from "../../core/Support/swift";

/**
 * A drop set's lighter rounds, inside the set they follow: "then − 80 + kg
 * × − 6 +", one line per drop, up to three. Used by the set card and by the
 * set sheet, so both read and behave the same.
 */
export function DropSetEditor({ drops, step, display }: { drops: Binding<DropStep[]>; step: number; display: NumberDisplay }) {
  const change = (index: number, edit: (d: DropStep) => DropStep) => {
    if (!(index >= 0 && index < drops.value.length)) return;
    const next = [...drops.value];
    next[index] = edit(next[index]);
    drops.set(next);
  };
  const last = drops.value[drops.value.length - 1];
  return (
    <VStack
      alignment="leading"
      spacing={2}
      style={{
        paddingLeft: SL.Space.s3,
        paddingRight: SL.Space.s3,
        paddingTop: SL.Space.s1,
        paddingBottom: SL.Space.s1,
        background: colorOpacity(SL.Signal.attention, 0.08),
        borderRadius: SL.Radius.md,
        alignSelf: "stretch",
      }}
    >
      {drops.value.map((drop, index) => (
        <HStack key={index} spacing={0} style={{ alignSelf: "stretch" }}>
          <Text {...slMeta()} color={SL.Ink.secondary} style={{ width: 36, flexShrink: 0 }}>then</Text>
          {stepper({
            value: NumberDisplay.number(display, drop.weightKg),
            unit: "kg",
            label: `drop ${index + 1} weight`,
            minus: () => change(index, (d) => ({ ...d, weightKg: Math.max(step, dec(d.weightKg - step)) })),
            plus: () => change(index, (d) => ({ ...d, weightKg: dec(d.weightKg + step) })),
          })}
          <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingLeft: 4, paddingRight: 4 }}>×</Text>
          {stepper({
            value: `${drop.reps}`,
            unit: undefined,
            label: `drop ${index + 1} reps`,
            minus: () => change(index, (d) => ({ ...d, reps: Math.max(1, d.reps - 1) })),
            plus: () => change(index, (d) => ({ ...d, reps: d.reps + 1 })),
          })}
          <Spacer minLength={0} />
          <Pressable
            aria-label={`Remove drop ${index + 1}`}
            onPress={() => {
              const next = [...drops.value];
              next.splice(index, 1);
              drops.set(next);
            }}
            style={{ width: 36, height: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}
          >
            <SFSymbol name="xmark" size={11} weight={700} color={SL.Ink.secondary} />
          </Pressable>
        </HStack>
      ))}
      {drops.value.length < DropSetEditor.maxDrops && last && (
        <Pressable
          onPress={() => drops.set([...drops.value, DropSetEditor.next(last.weightKg, { reps: last.reps, step })])}
          style={{ marginLeft: 36, minHeight: 36, display: "flex", alignItems: "center", gap: 6, background: "transparent", color: SL.Signal.attention }}
        >
          <SFSymbol name="plus" size={SL.TypeSize.meta} weight={500} />
          <Text size={SL.TypeSize.meta} weight={SL.Weight.medium} color={SL.Signal.attention}>Add a drop</Text>
        </Pressable>
      )}
    </VStack>
  );
}

DropSetEditor.maxDrops = 3;

/** About a fifth lighter than `weight`, on the step, never below it. */
DropSetEditor.next = (weight: number, a: { reps: number; step: number }): DropStep => {
  const lighter = Estimates.round(weight * 0.8, { toIncrement: a.step });
  return DropStep.make({ weightKg: Math.max(lighter, a.step), reps: Math.max(1, a.reps) });
};

function stepper(p: { value: string; unit: string | undefined; label: string; minus: () => void; plus: () => void }) {
  const button = (symbol: string, label: string, action: () => void) => (
    <Pressable
      aria-label={label}
      onPress={action}
      style={{ width: 32, height: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: SL.Ink.primary }}
    >
      <SFSymbol name={symbol} size={11} weight={700} />
    </Pressable>
  );
  return (
    <HStack spacing={0}>
      {button("minus", `Less ${p.label}`, p.minus)}
      <HStack alignment="firstTextBaseline" spacing={2} style={{ minWidth: 30, justifyContent: "center", whiteSpace: "nowrap" }}>
        <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} numerals lineLimit={1}>{p.value}</Text>
        {p.unit && <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.secondary} lineLimit={1}>{p.unit}</Text>}
      </HStack>
      {button("plus", `More ${p.label}`, p.plus)}
    </HStack>
  );
}

/** L / R / Both for a one-sided exercise: one is always picked. */
export function SetSidePicker({ side }: { side: Binding<SetSide> }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", paddingLeft: 2, paddingRight: 2 }}>
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 34, transform: "translateY(-50%)", borderRadius: SL.Radius.pill, background: SL.Surface.raised2 }} />
      <HStack spacing={2} style={{ position: "relative" }}>
        {SetSide.allCases.map((option) => {
          const on = side.value === option;
          return (
            <Pressable
              key={option}
              aria-label={option === "both" ? "Both sides" : option === "L" ? "Left side" : "Right side"}
              onPress={() => side.set(option)}
              style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", background: "transparent" }}
            >
              <span
                aria-pressed={on}
                style={{
                  fontFamily: "Archivo, system-ui, sans-serif",
                  fontSize: SL.TypeSize.meta,
                  fontWeight: on ? SL.Weight.semibold : SL.Weight.medium,
                  color: on ? SL.Signal.onAction : SL.Ink.secondary,
                  paddingLeft: option === "both" ? SL.Space.s3 : 0,
                  paddingRight: option === "both" ? SL.Space.s3 : 0,
                  minWidth: 34,
                  minHeight: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: SL.Radius.pill,
                  background: on ? SL.Signal.action : "transparent",
                }}
              >
                {SetSide.label(option)}
              </span>
            </Pressable>
          );
        })}
      </HStack>
    </div>
  );
}

/** Both by default; after a left set the right, after a right set the left. */
SetSidePicker.defaultSide = (a: { after?: SetSide }): SetSide => {
  switch (a.after) {
    case "L":
      return "R";
    case "R":
      return "L";
    default:
      return "both";
  }
};

/**
 * The reps tile when the two sides of a set differ: "L − 8 +" over
 * "R − 7 +", in the reps tile's own place and size.
 */
export function PerSideRepsTile({ reps, style }: { reps: Binding<SideReps>; style?: React.CSSProperties }) {
  const row = (side: string, value: number, spoken: string, change: (d: number) => void) => (
    <HStack spacing={0} aria-label={`${spoken} side, ${value} reps`}>
      <Text size={SL.TypeSize.meta} weight={SL.Weight.bold} color={SL.Ink.secondary} style={{ width: 18, flexShrink: 0 }}>{side}</Text>
      {step("minus", () => change(-1))}
      <Text size={SL.TypeSize.title} weight={SL.Weight.semibold} color={SL.Ink.primary} align="center" style={{ minWidth: 30, ...slNumerals }}>{`${value}`}</Text>
      {step("plus", () => change(1))}
    </HStack>
  );
  return (
    <VStack
      spacing={2}
      style={{
        paddingLeft: SL.Space.s2,
        paddingRight: SL.Space.s2,
        paddingTop: SL.Space.s2,
        paddingBottom: SL.Space.s1,
        background: SL.Surface.raised2,
        borderRadius: SL.Radius.md,
        boxShadow: `inset 0 0 0 1px ${SL.Signal.action}`,
        ...style,
      }}
    >
      <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8} style={{ maxWidth: "100%" }}>reps per side</Text>
      {row("L", reps.value.left, "Left", (d) => reps.set({ ...reps.value, left: Math.max(1, Math.min(100, reps.value.left + d)) }))}
      {row("R", reps.value.right, "Right", (d) => reps.set({ ...reps.value, right: Math.max(1, Math.min(100, reps.value.right + d)) }))}
    </VStack>
  );
}

function step(symbol: string, action: () => void) {
  return (
    <Pressable
      onPress={action}
      style={{ width: 32, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: SL.Radius.sm, background: SL.Surface.hairline, color: SL.Ink.primary }}
    >
      <SFSymbol name={symbol} size={12} weight={700} />
    </Pressable>
  );
}
