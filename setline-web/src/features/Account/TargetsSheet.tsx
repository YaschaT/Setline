// TargetsSheet.swift — the day's targets, which both apps may write.
//
// Each field is its own change, so setting a protein target here does not
// reach across and rewrite a calorie target the web app set a minute ago.
import { useEffect, useRef, useState } from "react";
import { SL, slFont, slNumerals } from "../../design/tokens";
import { HStack, ScrollView, Spacer, Text, VStack } from "../../design/swiftui";
import { PressButton, Presentation } from "../../design/support";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { SLEyebrow, SLHairline, slBody, slHitTarget, slMeta, slTitle } from "../../design/components/SLText";
import type { NutritionTargets } from "../../core/Domain/Model";
import { StateChange } from "../../core/Sync/StateChange";

type Macro = "calories" | "protein" | "carbs" | "fat";

export function TargetsSheet({ targets, onSave, onClose }: { targets: NutritionTargets | undefined; onSave: (changes: StateChange[]) => void; onClose: () => void }) {
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [focused, setFocused] = useState<Macro | undefined>(undefined);

  const text = (value: number): string => (value > 0 ? `${value}` : "");

  useEffect(() => {
    if (!targets) return;
    setCalories(text(targets.calories));
    setProtein(text(targets.protein));
    setCarbs(text(targets.carbs));
    setFat(text(targets.fat));
    // `.task`: once, when the sheet appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** One change per field that actually moved. */
  const changes = (): StateChange[] => {
    const now = new Date();
    const fields: [string, string, number | undefined][] = [
      ["calories", calories, targets?.calories],
      ["protein", protein, targets?.protein],
      ["carbs", carbs, targets?.carbs],
      ["fat", fat, targets?.fat],
    ];
    return fields.flatMap(([field, typed, stored]) => {
      if (!/^[0-9]+$/.test(typed)) return [];
      const value = Number(typed);
      if (value === (stored ?? 0)) return [];
      return [StateChange.make({ kind: "setTarget", field, value }, { createdAt: now })];
    });
  };

  const save = () => {
    const list = changes();
    if (list.length === 0) return onClose();
    onSave(list);
  };

  const field = (label: string, value: string, set: (v: string) => void, macro: Macro, unit: string) => (
    <Field label={label} value={value} set={set} macro={macro} unit={unit} focused={focused} setFocused={setFocused} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", background: SL.Surface.raised }}>
      <Presentation detents={["medium", "large"]} dragIndicator="visible" background={SL.Surface.raised} />
      <HStack alignment="firstTextBaseline" style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s5, flexShrink: 0 }}>
        <Text as="h2" {...slTitle()} color={SL.Ink.primary}>Daily targets</Text>
        <Spacer />
        <PressButton onPress={onClose}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary} style={{ ...slHitTarget(), display: "inline-block" }}>Close</Text>
        </PressButton>
      </HStack>

      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack
          alignment="leading"
          spacing={0}
          style={{
            alignItems: "stretch",
            paddingLeft: SL.Space.gutterSession,
            paddingRight: SL.Space.gutterSession,
            paddingTop: SL.Space.s5,
            // Clears the commit pill at the half-height detent.
            paddingBottom: SL.Space.s12,
          }}
        >
          <Text {...slMeta()} color={SL.Ink.tertiary} style={{ paddingBottom: SL.Space.s4 }}>
            Nutrition uses these. The web app reads the same targets.
          </Text>

          <VStack
            spacing={0}
            style={{
              alignItems: "stretch",
              // `.padding(6).slBorderBox()`.
              padding: 6 + SL.Metric.border,
              borderRadius: SL.Radius.option,
              background: SL.Surface.ground,
              boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}`,
            }}
          >
            {field("Calories", calories, setCalories, "calories", "kcal")}
            <SLHairline style={{ marginLeft: 14, marginRight: 14 }} />
            {field("Protein", protein, setProtein, "protein", "g")}
            <SLHairline style={{ marginLeft: 14, marginRight: 14 }} />
            {field("Carbs", carbs, setCarbs, "carbs", "g")}
            <SLHairline style={{ marginLeft: 14, marginRight: 14 }} />
            {field("Fat", fat, setFat, "fat", "g")}
          </VStack>
        </VStack>
      </ScrollView>

      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: `calc(env(safe-area-inset-bottom) + ${SL.Space.s3}px)`, background: SL.Surface.raised }}>
        <SLPrimaryButton disabled={changes().length === 0} onPress={save}>Save</SLPrimaryButton>
      </div>
    </div>
  );
}

function Field(p: { label: string; value: string; set: (v: string) => void; macro: Macro; unit: string; focused: Macro | undefined; setFocused: (m: Macro | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const isFocused = p.focused === p.macro;
  return (
    <VStack
      alignment="leading"
      spacing={2}
      onClick={() => input.current?.focus()}
      style={{
        justifyContent: "center",
        paddingLeft: 14,
        paddingRight: 14,
        paddingTop: 10,
        paddingBottom: 10,
        minHeight: 60,
        borderRadius: 14,
        background: isFocused ? SL.Surface.raised2 : "transparent",
        boxShadow: `inset 0 0 0 1px ${isFocused ? SL.Signal.action : "transparent"}`,
      }}
    >
      <SLEyebrow text={p.label.toUpperCase()} size={SL.TypeSize.micro} />
      <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <input
          ref={input}
          aria-label={p.label}
          inputMode="numeric"
          pattern="[0-9]*"
          value={p.value}
          onChange={(e) => {
            const filtered = [...e.target.value].filter((c) => /[0-9]/.test(c)).slice(0, 5).join("");
            p.set(filtered);
          }}
          onFocus={() => p.setFocused(p.macro)}
          onBlur={() => p.setFocused(undefined)}
          style={{
            ...slFont(SL.TypeSize.lead, SL.Weight.medium),
            ...slNumerals,
            color: SL.Ink.primary,
            caretColor: SL.Signal.action,
            background: "transparent",
            border: "none",
            outline: "none",
            padding: 0,
            margin: 0,
            flex: "1 1 0",
            minWidth: 0,
            lineHeight: 1.25,
          }}
        />
        <Text {...slBody()} color={SL.Ink.tertiary}>{p.unit}</Text>
      </HStack>
    </VStack>
  );
}
