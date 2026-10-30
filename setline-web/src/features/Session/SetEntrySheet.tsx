// SetEntrySheet.swift — everything one set can carry, for the times the
// input card is not enough.
//
// The default path never comes here: a set is saved from the card under the
// exercise in one tap. This sheet opens from `Meer`, from the weight itself,
// or from a row — to correct a set already written, to type a weight off the
// step, or to say what the set was: reps in reserve, failed, paused, partial,
// to failure, a drop set, and on a one-sided exercise the side.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RIRPreference } from "../../data/RIRPreference";
import { Alert, HStack, Pressable, ScrollView, Sheet, Spacer, Text, VStack } from "../../design/swiftui";
import { SL, slFont, slNumerals } from "../../design/tokens";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { Presentation, useReduceMotion } from "../../design/support";
import { SLStepper } from "../../design/components/SLStepper";
import { SLFlexPair } from "../../design/components/SLFlexPair";
import { SLEyebrow, slBody, slLead, slMeta } from "../../design/components/SLText";
import { type DropStep, Exercise, LoggedSet, type SetSide } from "../../core/Domain/Model";
import { SessionSlot } from "../../core/Domain/SessionSlot";
import { SetFlags } from "../../core/Domain/Vocabulary";
import { Calibration } from "../../core/Engine/Calibration";
import { ExerciseHistory } from "../../core/Engine/ExerciseHistory";
import { NumberDisplay, NumberInput } from "../../core/Engine/NumberDisplay";
import { dec } from "../../core/Support/swift";
import { DropSetEditor, SetSidePicker } from "./DropSetEditor";
import { PlateSheet } from "./PlateSheet";
import { SessionRunner_ExerciseSlot, type SessionRunner_SetEntry } from "./SessionRunner";

const S = SessionRunner_ExerciseSlot;
const display = NumberDisplay.english;

function rirCaption(value: number): string {
  switch (value) {
    case 0:
      return "0 · nothing left";
    case 1:
      return "1 · one more in the tank";
    case 2:
      return "2 · two more in the tank";
    case 3:
      return "3 · well short of failure";
    default:
      return "4+ · far from failure";
  }
}

export function SetEntrySheet(p: {
  slot: SessionRunner_ExerciseSlot;
  setIndex: number;
  /** The first set of an exercise with no history (artboard 28). */
  isCalibration?: boolean;
  /** What SETLINE proposed for *this* row, from its own range. */
  proposedReps?: number;
  startsPartial?: boolean;
  startsOnKeypad?: boolean;
  proposedRIR?: number;
  onLog: (entry: SessionRunner_SetEntry) => void;
  onClose: () => void;
  /**
   * Takes the row out of the session. Only a set added during the session
   * has one — a prescribed set is skipped by leaving it open.
   */
  onRemove?: () => void;
}) {
  const { slot, setIndex, onLog, onRemove } = p;
  const isCalibration = p.isCalibration ?? false;
  const reduceMotion = useReduceMotion();
  const sets = S.sets(slot);

  // The opening values, once — `init` in Swift.
  const [opening] = useState(() => {
    const draft = sets[setIndex];
    const reference = ExerciseHistory.mostRecent(slot.history)?.sets.find((s) => s.index === setIndex);
    const planned = S.planned(slot);
    // A row added during the session has no range of its own.
    const plannedTop =
      setIndex >= 0 && setIndex < planned.sets.length
        ? planned.sets[setIndex].repRange.upperBound
        : (planned.sets[planned.sets.length - 1]?.repRange.upperBound ?? 8);
    const openingReps = isCalibration ? Calibration.targetReps : draft.reps > 0 ? draft.reps : (p.proposedReps ?? reference?.reps ?? plannedTop);
    const previousSide = sets.slice(0, setIndex).findLast(LoggedSet.isLogged)?.side;
    const logged = LoggedSet.isLogged(draft);
    return {
      weight: draft.weightKg ?? reference?.weightKg ?? 0,
      reps: openingReps,
      // Stepping to a first weight from zero is 30-odd taps. A calibration
      // set opens on the keypad instead.
      showsKeypad: isCalibration || (p.startsOnKeypad ?? false),
      // A set being corrected opens on what it holds; one still open, on the
      // reserve already picked in the card.
      rir: logged ? draft.rirReported : p.proposedRIR,
      failed: logged && SetFlags.contains(draft.flags, SetFlags.failed),
      // A two-sided exercise is both sides until one is picked.
      side: draft.side ?? (slot.exercise.unilateral ? SetSidePicker.defaultSide({ after: previousSide }) : "both"),
      drops: draft.drops,
      ...(logged
        ? {
            // A correction changes what it is asked to change. Opening a
            // written set on the plan's defaults would quietly strip the pause
            // or the partial reps it was logged with.
            pausedReps: draft.modifiers.pauseEnabled ? (draft.pausedReps ?? draft.reps) : undefined,
            partialReps: (draft.partialReps ?? 0) > 0 ? draft.partialReps : undefined,
          }
        : {
            // Off until asked for, on every exercise alike.
            pausedReps: undefined,
            // The pain flow's "Beperk de beweging" opens the set with partial
            // on, because that is what it promised.
            partialReps: p.startsPartial ? 1 : undefined,
          }),
    };
  });

  const [weight, setWeight] = useState<number>(opening.weight);
  const [reps, setReps] = useState<number>(opening.reps);
  const [rir, setRir] = useState<number | undefined>(opening.rir);
  const [failed, setFailed] = useState(opening.failed);
  /**
   * How many of this set's reps were paused. `nil` is none; the chip
   * opens it on every rep, which is what the pause chip always meant.
   */
  const [pausedReps, setPausedReps] = useState<number | undefined>(opening.pausedReps);
  const [partialReps, setPartialReps] = useState<number | undefined>(opening.partialReps);
  /** One-sided exercises only; always one picked. */
  const [side, setSide] = useState<SetSide>(opening.side);
  /** A drop set's lighter rounds. */
  const [drops, setDrops] = useState<DropStep[]>(opening.drops);
  const [showsKeypad, setShowsKeypad] = useState(opening.showsKeypad);
  const [keypadText, setKeypadText] = useState("");
  const [showsPlates, setShowsPlates] = useState(false);
  const [confirmsRemoval, setConfirmsRemoval] = useState(false);
  /**
   * The sheet's height, measured once as it opens and then held: 11R's
   * sheet hugs its content, and a detent must never grow while the
   * keyboard is up.
   */
  const [openingHeight, setOpeningHeight] = useState<number | undefined>(undefined);
  const keypadField = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const logControlsRef = useRef<HTMLDivElement>(null);

  /**
   * RIR is the third, optional tap. By default an exercise asks it on its
   * last prescribed set (addendum 11R) and on any set added after it.
   * Per-set entry is an Account setting.
   */
  const asksForRIR = isCalibration || RIRPreference.everySet || SessionSlot.asksForRIR(slot.model, { at: setIndex });

  /**
   * 12R: once RIR is set on the one set that asks, the footnote says where
   * to have it asked on every set.
   */
  const pointsToAccount = asksForRIR && rir !== undefined && !RIRPreference.everySet;

  /** 11R while the reserve is still empty; 12R once it is set. */
  const footnote = (() => {
    if (!asksForRIR) return "Weight and reps make a complete set.";
    if (pointsToAccount) return "Turn on asking for every set in Account.";
    return "Weight and reps make a complete set. RIR can stay empty.";
  })();

  /** The row already holds a written set: this is a correction. */
  const isCorrection = setIndex >= 0 && setIndex < sets.length && LoggedSet.isLogged(sets[setIndex]);

  /** A set added during this session rather than prescribed. */
  const isAddedSet = setIndex >= 0 && setIndex < sets.length && sets[setIndex].origin === "sessionAdded";

  const canRemove = onRemove !== undefined;

  /**
   * The first frame's estimate, until the content has been measured.
   * Either way the height is fixed for as long as the sheet is open.
   */
  const sheetHeight = (() => {
    let height = 391; // grabber, head, steppers, chips, pill, footnote
    if (asksForRIR) height += 86;
    if (showsKeypad) height += 56; // the keypad it opens on
    if (canRemove) height += 52; // the quiet way back out
    return height;
  })();

  const increment = Exercise.incrementKg(slot.exercise);

  useLayoutEffect(() => {
    if (openingHeight === undefined && content.current) setOpeningHeight(content.current.offsetHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The keyboard comes up once the sheet has settled on its measured
    // height, never while that height is still being decided.
    if (!showsKeypad) return;
    const t = window.setTimeout(() => keypadField.current?.focus(), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The sheet's height is fixed once it opens, so a pause or partial row
   * opened afterwards lands below its edge, taking the commit with it.
   * Bring them back into view: the set stays one tap from saved.
   */
  const reveal = () => {
    requestAnimationFrame(() => logControlsRef.current?.scrollIntoView({ block: "end", behavior: reduceMotion ? "auto" : "smooth" }));
  };
  const opened = useRef({ paused: pausedReps !== undefined, partial: partialReps !== undefined, drops: drops.length });
  useEffect(() => {
    const was = opened.current;
    if (pausedReps !== undefined && !was.paused) reveal();
    if (partialReps !== undefined && !was.partial) reveal();
    if (drops.length > was.drops) reveal();
    opened.current = { paused: pausedReps !== undefined, partial: partialReps !== undefined, drops: drops.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausedReps !== undefined, partialReps !== undefined, drops.length]);

  const setLabel = (() => {
    if (isCalibration) return "Set 1 · calibration";
    if (isAddedSet) return `Set ${setIndex + 1} · extra`;
    // Once a set is added, the last prescribed set is no longer the last.
    const last = setIndex === sets.length - 1;
    return last ? `Set ${setIndex + 1} · last set` : `Set ${setIndex + 1}`;
  })();

  const referenceLabel = (() => {
    if (isCalibration) return `aim for ${Calibration.targetReps} · RIR ${Calibration.targetRIR}`;
    const reference = ExerciseHistory.mostRecent(slot.history)?.sets.find((s) => s.index === setIndex);
    if (!reference || reference.weightKg === undefined) return undefined;
    return `last ${NumberDisplay.setReference(display, { weightKg: reference.weightKg, reps: reference.reps })}`;
  })();

  /** What a confirmed removal takes out, in the set's logged numbers. */
  const removalMessage = (() => {
    const w = setIndex >= 0 && setIndex < sets.length ? sets[setIndex].weightKg : undefined;
    if (w === undefined) return "This set disappears from this session. Your plan doesn't change.";
    return `${NumberDisplay.kg(display, w)} × ${sets[setIndex].reps} disappears from this session. Your plan doesn't change.`;
  })();

  /** An empty row simply goes. A written set is real work, so it asks first. */
  const requestRemoval = () => {
    if (setIndex >= 0 && setIndex < sets.length && LoggedSet.isLogged(sets[setIndex])) {
      setConfirmsRemoval(true);
    } else {
      onRemove?.();
    }
  };

  const grabber = (
    <HStack style={{ paddingTop: SL.Space.s3, alignSelf: "stretch" }}>
      <Spacer />
      <span style={{ width: 36, height: 5, borderRadius: 3, background: SL.Surface.hairlineStrong }} />
      <Spacer />
    </HStack>
  );

  const steppers = [
    <SLStepper
      key="weight"
      label="Weight"
      display={NumberDisplay.number(display, weight)}
      onTapValue={() => setShowsPlates(true)}
      onDecrement={() => setWeight((w) => Math.max(0, dec(w - increment)))}
      onIncrement={() => setWeight((w) => dec(w + increment))}
    />,
    <SLStepper key="reps" label="Reps" display={`${reps}`} onDecrement={() => setReps((r) => Math.max(0, r - 1))} onIncrement={() => setReps((r) => r + 1)} />,
  ];

  /** Surface-2 at 13 in ink-2; on, the lime tint inside a lime edge. */
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
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: SL.Radius.md,
        background: isOn ? SL.Signal.actionTint : SL.Surface.raised2,
        boxShadow: isOn ? `inset 0 0 0 1px ${SL.Signal.action}` : undefined,
      }}
    >
      <Text {...slMeta(SL.Weight.medium)} lineLimit={1} minimumScaleFactor={0.8} color={isOn ? SL.Signal.action : SL.Ink.secondary}>{title}</Text>
    </Pressable>
  );

  const selectRow = (values: number[], selected: number | undefined, label: (v: number) => string, onPick: (v: number) => void) => (
    <HStack spacing={6} style={{ alignSelf: "stretch" }}>
      {values.map((value) => {
        const on = selected === value;
        return (
          <Pressable
            key={value}
            aria-label={label(value)}
            onPress={() => onPick(value)}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              minHeight: SL.Metric.chipHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: SL.Radius.md,
              background: on ? SL.Signal.actionTint : SL.Surface.raised2,
              boxShadow: on ? `inset 0 0 0 1px ${SL.Signal.action}` : undefined,
            }}
          >
            <Text {...slLead()} numerals color={on ? SL.Signal.action : SL.Ink.primary}>{value === 4 ? "4+" : `${value}`}</Text>
          </Pressable>
        );
      })}
    </HStack>
  );

  const rirRow = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
      <HStack alignment="firstTextBaseline" style={{ alignSelf: "stretch", paddingBottom: SL.Space.s2 }}>
        <SLEyebrow text="Reps in reserve" />
        <Spacer />
        <Text {...slMeta()} color={SL.Ink.tertiary}>{rir !== undefined ? rirCaption(rir) : "optional"}</Text>
      </HStack>
      {selectRow([0, 1, 2, 3, 4], rir, (v) => `RIR ${v === 4 ? "4 or more" : `${v}`}`, (v) => setRir(rir === v ? undefined : v))}
    </VStack>
  );

  /**
   * The sheet's tools as 12 and 11–13 draw them: one row of equal 44pt
   * buttons, 6 apart — `Toetsenblok`, `Mislukt`, `Pauze-reps`, and 16R's
   * `Partieel`.
   */
  const chips = (
    <VStack spacing={6} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
      <HStack spacing={6} style={{ alignSelf: "stretch" }}>
        {chip("Keypad", showsKeypad, () => {
          const next = !showsKeypad;
          setShowsKeypad(next);
          setKeypadText(weight > 0 ? NumberDisplay.number(display, weight) : "");
          if (next) requestAnimationFrame(() => keypadField.current?.focus());
          else keypadField.current?.blur();
        })}
        {chip("Failed", failed, () => setFailed(!failed))}
        {/* On, it opens at every rep — the whole-set pause the chip used to be — and the row below narrows it to the reps that were paused. */}
        {chip("Paused reps", pausedReps !== undefined, () => setPausedReps(pausedReps === undefined ? Math.max(1, reps) : undefined))}
      </HStack>
      <HStack spacing={6} style={{ alignSelf: "stretch" }}>
        {chip("Partial", partialReps !== undefined, () => setPartialReps(partialReps === undefined ? 1 : undefined))}
        {/* Where the reserve row shows, its 0 is "to failure"; elsewhere a chip. */}
        {!asksForRIR && chip("To failure", rir === 0, () => setRir(rir === 0 ? undefined : 0))}
        {chip("Drop set", drops.length > 0, () => setDrops(drops.length === 0 ? [DropSetEditor.next(weight, { reps, step: increment })] : []))}
      </HStack>
    </VStack>
  );

  /**
   * Paused reps are a count *inside* the reps: six reps with the last two
   * paused is one set of six. The stepper therefore never passes the reps
   * performed, and every rep paused simply makes it a paused set.
   */
  const pausedRow = (count: number) => (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
      <HStack alignment="firstTextBaseline" style={{ alignSelf: "stretch", paddingBottom: SL.Space.s2 }}>
        <SLEyebrow text="Paused reps" />
        <Spacer />
        <Text {...slMeta()} numerals color={SL.Ink.tertiary} lineLimit={1} minimumScaleFactor={0.8}>{count >= reps ? "every rep paused" : `of ${reps} reps`}</Text>
      </HStack>
      <SLStepper
        label="Paused"
        display={`${Math.min(count, Math.max(1, reps))}`}
        onDecrement={() => setPausedReps(Math.max(1, Math.min(count, reps) - 1))}
        onIncrement={() => setPausedReps(Math.min(Math.max(1, reps), count + 1))}
      />
    </VStack>
  );

  /**
   * Partial reps are a count, not a rep type — they are recorded beside the
   * rep number, never inside it.
   */
  const partialRow = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
      <HStack alignment="firstTextBaseline" style={{ alignSelf: "stretch", paddingBottom: SL.Space.s2 }}>
        <SLEyebrow text="Partial reps" />
        <Spacer />
        <Text {...slMeta()} color={SL.Ink.tertiary} lineLimit={1} minimumScaleFactor={0.8}>don't count toward your progress</Text>
      </HStack>
      {selectRow([1, 2, 3, 4], partialReps, (v) => `${v === 4 ? "Four or more" : `${v}`} partial reps`, (v) => setPartialReps(v))}
    </VStack>
  );

  /** One tap away, for the rare jump. Never the default input. */
  const keypad = (
    <HStack
      spacing={SL.Space.s3}
      style={{ alignSelf: "stretch", paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: SL.Space.hitMin, borderRadius: SL.Radius.md, background: SL.Surface.raised2, marginBottom: SL.Space.s3 }}
    >
      <SLEyebrow text="Weight" />
      <input
        ref={keypadField}
        value={keypadText}
        inputMode="decimal"
        onChange={(e) => {
          // Keep the field to digits and one separator so nothing else can land in it.
          const filtered = NumberInput.numericOnly(e.target.value);
          setKeypadText(filtered);
          const value = Number(filtered.replace(/,/g, "."));
          setWeight(Number.isFinite(value) ? value : 0);
        }}
        style={{ ...slFont(16, SL.Weight.semibold), ...slNumerals, color: SL.Ink.primary, caretColor: SL.Signal.action, background: "transparent", border: "none", outline: "none", flex: "1 1 0", minWidth: 0, minHeight: SL.Space.hitMin }}
      />
    </HStack>
  );

  const logControls = (
    <div ref={logControlsRef} style={{ alignSelf: "stretch" }}>
      <VStack spacing={0}>
        <SLPrimaryButton
          disabled={weight < 0 || reps <= 0}
          onPress={() =>
            onLog({
              weightKg: weight,
              reps,
              rir,
              failed,
              pausedReps,
              partialReps,
              side: slot.exercise.unilateral || side !== "both" ? side : undefined,
              drops,
            })
          }
        >
          {isCorrection ? `Update set ${setIndex + 1}` : "Save set"}
        </SLPrimaryButton>
        <Text
          {...slMeta()}
          // 11R sets its footnote in `text2`; 12R's pointer to Account steps back to `text3`.
          color={pointsToAccount ? SL.Ink.tertiary : SL.Ink.secondary}
          align="center"
          style={{ alignSelf: "stretch", paddingTop: SL.Space.s3 }}
        >
          {footnote}
        </Text>
        {canRemove && (
          <Pressable onPress={requestRemoval} style={{ alignSelf: "stretch", minHeight: SL.Space.hitMin, marginTop: SL.Space.s2, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>{`Remove set ${setIndex + 1}`}</Text>
          </Pressable>
        )}
      </VStack>
    </div>
  );

  return (
    <>
      <Presentation detents={[{ height: openingHeight ?? sheetHeight }]} background={SL.Surface.raised} dragIndicator="hidden" />
      <ScrollView style={{ flex: "1 1 0", background: SL.Surface.raised }}>
        <div ref={content}>
          <VStack
            alignment="leading"
            spacing={0}
            style={{
              paddingLeft: SL.Space.gutterSession,
              paddingRight: SL.Space.gutterSession,
              paddingTop: SL.Space.s4,
              // 11R ends the sheet 42 above the frame's edge, home band included.
              paddingBottom: `calc(${SL.Space.sessionBlockBottom}px + env(safe-area-inset-bottom))`,
            }}
          >
            {grabber}
            <HStack alignment="firstTextBaseline" style={{ alignSelf: "stretch", paddingBottom: 14 }}>
              <SLEyebrow text={setLabel} />
              <Spacer />
              {referenceLabel !== undefined && <Text {...slMeta()} numerals color={SL.Ink.secondary}>{referenceLabel}</Text>}
            </HStack>
            <div style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
              <SLFlexPair>{steppers}</SLFlexPair>
            </div>
            {asksForRIR && rirRow}
            {chips}
            {/* Every exercise can be done one side at a time. */}
            {(
              <HStack style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
                <SLEyebrow text="Side" />
                <Spacer />
                <SetSidePicker side={{ value: side, set: setSide }} />
              </HStack>
            )}
            {drops.length > 0 && (
              <div style={{ alignSelf: "stretch", paddingBottom: SL.Space.s4 }}>
                <DropSetEditor drops={{ value: drops, set: setDrops }} step={increment} display={display} />
              </div>
            )}
            {pausedReps !== undefined && pausedRow(pausedReps)}
            {partialReps !== undefined && partialRow}
            {showsKeypad && keypad}
            {logControls}
          </VStack>
        </div>
      </ScrollView>

      <Sheet isPresented={showsPlates} onDismiss={() => setShowsPlates(false)}>
        {showsPlates && (
          <PlateSheet
            exercise={slot.exercise.name}
            setNumber={setIndex + 1}
            reps={reps}
            target={weight}
            onChoose={(load) => {
              setWeight(load);
              setShowsPlates(false);
            }}
            onClose={() => setShowsPlates(false)}
          />
        )}
      </Sheet>

      <Alert
        isPresented={confirmsRemoval}
        onDismiss={() => setConfirmsRemoval(false)}
        title={`Remove set ${setIndex + 1}?`}
        message={removalMessage}
        actions={[
          { title: "Cancel", role: "cancel" },
          { title: "Remove", role: "destructive", action: () => onRemove?.() },
        ]}
      />
    </>
  );
}
