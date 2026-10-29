// SetCorrectionSheet.swift — one logged set, corrected after the fact.
//
// The vocabulary is the set sheet's (11R/12R) — two steppers, RIR as optional
// chips, pause and partials as chips — because correcting a set is the same
// decision as logging it, made later. What it is not is a second place to
// log: the set keeps its exercise, its place and its origin, and a correction
// can never empty it. Weight and reps therefore have a floor.
import { useLayoutEffect, useRef, useState } from "react";
import { SL } from "../../design/tokens";
import { HStack, Pressable, ScrollView, Spacer, Text, VStack } from "../../design/swiftui";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { Presentation } from "../../design/support";
import { SLEyebrow, slBody, slLead, slMeta } from "../../design/components/SLText";
import { SLFlexPair } from "../../design/components/SLFlexPair";
import { SLStepper } from "../../design/components/SLStepper";
import { slLineHeight } from "../../design/SLDynamicType";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { LoggedSet } from "../../core/Domain/Model";
import { dec } from "../../core/Support/swift";

export function SetCorrectionSheet({
  exerciseName,
  setNumber,
  increment,
  display,
  original,
  onApply,
  onDelete,
  onClose,
}: {
  exerciseName: string;
  setNumber: number;
  increment: number;
  display: NumberDisplay;
  original: LoggedSet;
  onApply: (set: LoggedSet) => void;
  /** Taking the set out of the session altogether. `undefined` where that is not offered. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  void onClose;
  const [weight, setWeight] = useState(original.weightKg ?? 0);
  const [reps, setReps] = useState(original.reps);
  const [rir, setRir] = useState<number | undefined>(original.rirReported);
  // A stored set that was paused throughout carries no count, and opens
  // on every rep — the same reading the entry sheet gives it.
  const [pausedReps, setPausedReps] = useState<number | undefined>(original.pausedReps ?? (original.modifiers.pauseEnabled ? original.reps : undefined));
  const [partialReps, setPartialReps] = useState<number | undefined>(original.partialReps);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (height === undefined && content.current) setHeight(content.current.getBoundingClientRect().height);
  }, [height]);

  /**
   * The set as corrected. Everything the sheet does not ask about — origin,
   * warm-up, what it stood in for — is carried over from the set as it was logged.
   */
  const corrected = (): LoggedSet => {
    const isPaused = (pausedReps ?? 0) > 0;
    return {
      ...original,
      weightKg: weight,
      reps,
      rirReported: rir,
      modifiers: {
        pauseEnabled: isPaused,
        pauseSeconds: isPaused ? (original.modifiers.pauseSeconds ?? 2) : undefined,
        restrictedROM: original.modifiers.restrictedROM,
      },
      pausedReps: LoggedSet.pausedRepsWithin(pausedReps, { reps }),
      partialReps: (partialReps ?? 0) > 0 ? partialReps : undefined,
    };
  };

  const isLogged = weight > 0 && reps > 0;

  const optionChip = (title: string, isOn: boolean, label: string, action: () => void) => (
    <Pressable
      key={title}
      onPress={action}
      aria-label={label}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        minHeight: SL.Metric.chipHeight,
        background: SL.Surface.raised2,
        borderRadius: SL.Radius.md,
        boxShadow: isOn ? `inset 0 0 0 1px ${SL.Surface.selection}` : undefined,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
      }}
    >
      <Text {...slLead()} numerals color={isOn ? SL.Ink.primary : SL.Ink.secondary}>
        {title}
      </Text>
    </Pressable>
  );

  const steppers = [
    <SLStepper
      key="weight"
      label="Weight"
      display={NumberDisplay.number(display, weight)}
      onDecrement={() => setWeight(Math.max(increment, dec(weight - increment)))}
      onIncrement={() => setWeight(dec(weight + increment))}
    />,
    <SLStepper key="reps" label="Reps" display={`${reps}`} onDecrement={() => setReps(Math.max(1, reps - 1))} onIncrement={() => setReps(reps + 1)} />,
  ];

  const rowHead = (eyebrow: string, note: string, numerals = false) => (
    <HStack alignment="firstTextBaseline" style={{ paddingBottom: SL.Space.s2, alignSelf: "stretch" }}>
      <SLEyebrow text={eyebrow} />
      <Spacer />
      <Text {...slMeta()} numerals={numerals} color={SL.Ink.tertiary} lineLimit={1} minimumScaleFactor={0.8}>
        {note}
      </Text>
    </HStack>
  );

  const rirRow = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
      {rowHead("Reps in reserve", rir === undefined ? "not logged" : "tap again to clear")}
      <HStack spacing={6} style={{ alignSelf: "stretch" }}>
        {[0, 1, 2, 3, 4].map((value) =>
          optionChip(value === 4 ? "4+" : `${value}`, rir === value, value === 4 ? "RIR four or more" : `RIR ${value}`, () => setRir(rir === value ? undefined : value)),
        )}
      </HStack>
    </VStack>
  );

  const chip = (title: string, isOn: boolean, action: () => void) => (
    <Pressable
      key={title}
      onPress={action}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        minHeight: SL.Metric.chipHeight,
        paddingLeft: 6,
        paddingRight: 6,
        background: SL.Surface.raised2,
        borderRadius: SL.Radius.md,
        boxShadow: isOn ? `inset 0 0 0 1px ${SL.Surface.selection}` : undefined,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text size={SL.TypeSize.meta} weight={SL.Weight.medium} color={isOn ? SL.Ink.primary : SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8}>
        {title}
      </Text>
    </Pressable>
  );

  const tools = (
    <HStack spacing={6} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
      {chip("Paused reps", pausedReps !== undefined, () => setPausedReps(pausedReps === undefined ? Math.max(1, reps) : undefined))}
      {chip("Partial", partialReps !== undefined, () => setPartialReps(partialReps === undefined ? 1 : undefined))}
    </HStack>
  );

  /** Paused reps are some of the reps performed, so the count stops at the rep number. */
  const pausedRow = (count: number) => (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
      {rowHead("Paused reps", count >= reps ? "every rep paused" : `of ${reps} reps`, true)}
      <SLStepper
        label="Paused"
        display={`${Math.min(count, Math.max(1, reps))}`}
        onDecrement={() => setPausedReps(Math.max(1, Math.min(count, reps) - 1))}
        onIncrement={() => setPausedReps(Math.min(Math.max(1, reps), count + 1))}
      />
    </VStack>
  );

  const partialRow = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
      {rowHead("Partial reps", "don't count toward your progress")}
      <HStack spacing={6} style={{ alignSelf: "stretch" }}>
        {[1, 2, 3, 4].map((value) =>
          optionChip(value === 4 ? "4+" : `${value}`, partialReps === value, `${value === 4 ? "Four or more" : `${value}`} partial reps`, () => setPartialReps(value)),
        )}
      </HStack>
    </VStack>
  );

  return (
    <ScrollView style={{ flex: "1 1 0", minHeight: 0, alignSelf: "stretch", width: "100%", height: "100%", background: SL.Surface.raised }}>
      <Presentation detents={[{ height: height ?? 420 }]} dragIndicator="hidden" background={SL.Surface.raised} />
      <div ref={content}>
        <VStack
          alignment="leading"
          spacing={0}
          style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s4, paddingBottom: SL.Space.sessionBlockBottom }}
        >
          <div aria-hidden style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", paddingBottom: SL.Space.s4 }}>
            <div style={{ width: 36, height: 5, borderRadius: 3, background: SL.Surface.hairlineStrong }} />
          </div>

          <HStack alignment="firstTextBaseline" style={{ paddingBottom: 14, alignSelf: "stretch" }}>
            <SLEyebrow text={`Set ${setNumber}`} style={{ flexShrink: 0 }} />
            <Spacer minLength={SL.Space.s3} />
            <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1}>
              {exerciseName}
            </Text>
          </HStack>

          <div style={{ paddingBottom: SL.Space.s4, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
            <SLFlexPair>{steppers}</SLFlexPair>
          </div>

          {rirRow}
          {tools}
          {pausedReps !== undefined && pausedRow(pausedReps)}
          {partialReps !== undefined && partialRow}

          <SLPrimaryButton disabled={!isLogged} onPress={() => onApply(corrected())} style={{ alignSelf: "stretch" }}>
            Done
          </SLPrimaryButton>

          {onDelete !== undefined && (
            // A set that was never performed is not a set to correct. It leaves the session.
            <Pressable onPress={onDelete} style={{ alignSelf: "stretch", minHeight: SL.Space.hitMin, marginTop: SL.Space.s2, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Text {...slBody(SL.Weight.medium)} color={SL.Signal.loss}>
                Remove this set
              </Text>
            </Pressable>
          )}

          <Text
            {...slMeta()}
            color={SL.Ink.tertiary}
            align="center"
            style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.meta }), alignSelf: "stretch", paddingTop: SL.Space.s3 }}
          >
            {onDelete === undefined ? "Only this set changes." : "Only this set changes. Removing takes it out of the session."}
          </Text>
        </VStack>
      </div>
    </ScrollView>
  );
}
