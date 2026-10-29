// WeighInSheet.swift — writing today's weight.
//
// The handoff draws artboard 20 reading weigh-ins but never one being
// entered, so this is assembled from the components it does define — sheet,
// field, primary pill — and asks for the one number the account stores. A
// day holds one weigh-in: opening this on a day already weighed shows that
// number and replaces it, rather than adding a second row.
import { useEffect, useRef, useState } from "react";
import { SL, slFont, slNumerals } from "../../design/tokens";
import { HStack, Pressable, Spacer, Text, VStack } from "../../design/swiftui";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { Presentation } from "../../design/support";
import { SLEyebrow, SLHairline, slBody, slLead, slMeta, slHitTarget, slTitle } from "../../design/components/SLText";
import { slLineHeight } from "../../design/SLDynamicType";
import { useApp } from "../../data/AppState";
import type { BodyMetric } from "../../core/Domain/Model";
import { NumberDisplay, NumberInput } from "../../core/Engine/NumberDisplay";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { roundPlaces } from "../../core/Support/swift";
import { decimalDescription } from "../../core/Support/sync";

/** A weight as the field shows it: one decimal (`NSDecimalRound(…, 1, .plain)`), as `Decimal` prints it. */
function weightText(value: number): string {
  return decimalDescription(roundPlaces(value, 1));
}

export function WeighInSheet({
  date,
  existing,
  latest,
  onSave,
  onClose,
}: {
  /** The day being weighed, and the weigh-in it already holds. */
  date: Date;
  existing: BodyMetric | undefined;
  latest: number | undefined;
  onSave: (weight: number) => void;
  onClose: () => void;
}) {
  const app = useApp();
  // The day's own number where there is one, the last weigh-in as a
  // starting point where there is not, and an empty field otherwise —
  // this app never guesses a body weight.
  const [text, setText] = useState(() => {
    const opening = existing !== undefined ? existing.weight : latest;
    return opening === undefined ? "" : weightText(opening);
  });
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);

  const weight = (() => {
    const value = NumberInput.decimal(text);
    return value !== undefined && value > 0 ? value : undefined;
  })();

  /** Says which day is being written, and what happens to the day's number when it already has one. */
  const day = `${WeekPlan.fullWeekday(date)} ${NumberDisplay.shortDate(app.display, date)}`;
  const footnote = existing === undefined ? `Saved on ${day}. One weigh-in per day.` : `Replaces your weigh-in of ${day}. Earlier weigh-ins stay.`;

  return (
    <VStack
      alignment="leading"
      spacing={0}
      style={{
        flex: "1 1 0",
        minHeight: 0,
        alignSelf: "stretch",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        paddingLeft: SL.Space.gutterSession,
        paddingRight: SL.Space.gutterSession,
        paddingTop: SL.Space.s4,
        paddingBottom: SL.Space.sessionBlockBottom,
        background: SL.Surface.raised,
      }}
    >
      <Presentation detents={[{ height: 320 }]} dragIndicator="hidden" background={SL.Surface.raised} />
      <HStack alignment="firstTextBaseline" style={{ alignSelf: "stretch" }}>
        <Text as="h2" {...slTitle()} color={SL.Ink.primary}>
          {existing === undefined ? "Weigh in" : "Edit weigh-in"}
        </Text>
        <Spacer minLength={SL.Space.s3} />
        <Pressable onPress={onClose} style={{ background: "transparent", padding: 0 }}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary} style={{ ...slHitTarget(), display: "block" }}>
            Close
          </Text>
        </Pressable>
      </HStack>

      <SLEyebrow text="Weight" style={{ paddingTop: SL.Space.s5 }} />

      <HStack alignment="firstTextBaseline" spacing={SL.Space.s2} style={{ paddingTop: 6, alignSelf: "stretch" }}>
        <style>{`.sl-weigh-field::placeholder { color: ${SL.Ink.tertiary}; opacity: 1; }`}</style>
        <input
          ref={field}
          className="sl-weigh-field"
          value={text}
          onChange={(e) => {
            const filtered = NumberInput.numericOnly(e.target.value);
            setText(filtered);
          }}
          placeholder="0.0"
          inputMode="decimal"
          aria-label="Weight in kilograms"
          style={{
            ...slFont(SL.TypeSize.displayL, SL.Weight.semibold),
            ...slNumerals,
            flex: "1 1 0",
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            color: SL.Ink.primary,
            caretColor: SL.Signal.action,
            padding: 0,
          }}
        />
        <Text {...slLead()} color={SL.Ink.tertiary}>
          kg
        </Text>
      </HStack>

      <SLHairline style={{ marginTop: SL.Space.s3 }} />

      <Text {...slMeta()} color={SL.Ink.tertiary} style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.meta }), paddingTop: SL.Space.s3 }}>
        {footnote}
      </Text>

      <Spacer minLength={SL.Space.s5} />

      <SLPrimaryButton
        disabled={weight === undefined}
        onPress={() => {
          if (weight !== undefined) onSave(weight);
        }}
        style={{ alignSelf: "stretch" }}
      >
        {existing === undefined ? "Save weigh-in" : "Update weigh-in"}
      </SLPrimaryButton>
    </VStack>
  );
}
