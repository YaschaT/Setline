// SwapFlow.swift — the swap sheet (artboard 15R), its program-change scope
// (15Rb), and the pain pages (31a / 31b / 31c).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useApp } from "../../data/AppState";
import { HStack, Pressable, ScrollView, Spacer, Text, VStack } from "../../design/swiftui";
import { SL, slCard, slFont } from "../../design/tokens";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { Presentation } from "../../design/support";
import { slMeasure } from "../../design/SLDynamicType";
import { SLChip } from "../../design/components/SLChip";
import { SLGlyph, type SLGlyph_NameCase } from "../../design/components/SLGlyph";
import { SLEyebrow, SLHairline, slBody, slCardStrong, slDisplay, slHitTarget, slLead, slMeta, slTitle } from "../../design/components/SLText";
import { Exercise as ExerciseModel, type Exercise } from "../../core/Domain/Model";
import { MuscleGroup } from "../../core/Domain/MuscleGroup";
import { MuscleFigure } from "../../design/components/MuscleFigure";
import { colorOpacity } from "../../design/SetlineTokens";
import { CustomExercise, ReplacementScope } from "../../core/Domain/Substitution";
import type { Equipment } from "../../core/Domain/Vocabulary";
import { PainFlag, PainRegion, PainTiming } from "../../core/Domain/PainFlag";
import type { ReorderPlan } from "../../core/Engine/ReorderPlan";
import { RankedAlternative, SwapContext, type SwapReason } from "../../core/Engine/SubstitutionRanking";
import { SubstitutionCopy } from "../../core/Engine/SubstitutionCopy";

/**
 * What the swap sheet hands back to the session.
 *
 * Every case is something the user chose explicitly. Nothing in this flow
 * applies itself, and the two scopes — today, and the program — are
 * deliberately different cases rather than one with a flag.
 */
export type SwapOutcome =
  /** Do a later exercise now and come back. Changes nothing. */
  | { kind: "reorder"; value: ReorderPlan }
  /** Stand in for this exercise, for today only. */
  | { kind: "substitute"; _0: Exercise; _1: SwapReason }
  /** Write the change into the program, and use it today as well. */
  | { kind: "replaceInProgram"; _0: Exercise; _1: ReplacementScope }
  /** A typed-in exercise, which goes straight to calibration. */
  | { kind: "custom"; value: CustomExercise }
  /** Keep the exercise, take some load off. */
  | { kind: "reduceLoad" }
  /** Keep the exercise, shorten the range — the next set opens as partial. */
  | { kind: "limitRange" }
  /** Leave this one for today. No penalty anywhere. */
  | { kind: "skipExercise" };

/**
 * The steps the sheet moves through.
 *
 * One sheet, several screens. Stacking real sheets for the scope picker and
 * the pain questions means three presentations deep over a session that is
 * already presented full-screen.
 */
export type SwapStep =
  | { kind: "alternatives" }
  | { kind: "browse" }
  | { kind: "custom" }
  /** Choosing what goes into the program, before 15Rb asks how far. */
  | { kind: "replacePick" }
  /** 15Rb, with the substitute chosen. */
  | { kind: "scope"; value: string }
  /** 31a: where and when, on one page. Both optional. */
  | { kind: "painQuestions" }
  /** A `nil` region: the user preferred not to say, and nothing is stored. */
  | { kind: "painOptions"; _0: PainRegion | undefined; _1: PainTiming | undefined };

export const SwapStep = {
  /** 31a and 31b are pages of their own on the ground, not sheet steps. */
  isPainPage(self: SwapStep): boolean {
    return self.kind === "painQuestions" || self.kind === "painOptions";
  },
  /** Each step opens at its own top. */
  key(self: SwapStep): string {
    switch (self.kind) {
      case "alternatives":
        return "alternatives";
      case "browse":
        return "browse";
      case "custom":
        return "custom";
      case "replacePick":
        return "replace-pick";
      case "scope":
        return `scope-${self.value}`;
      case "painQuestions":
        return "pain-questions";
      case "painOptions":
        return "pain-options";
    }
  },
};

/**
 * Chips that wrap. Anything chip-shaped wraps instead of scrolling, so the
 * last chip is always reachable.
 */
export function FlowRow({ spacing = 8, children, style }: { spacing?: number; children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: spacing, alignItems: "flex-start", alignSelf: "stretch", ...style }}>{children}</div>;
}

const noneOfThese = "None of these";
const escalationSignals = ["Sharp or sudden", "Tingling", "Loss of strength", "Swelling", "For more than 2 weeks", noneOfThese];

/**
 * Artboard 15R. Fixed order: reorder first, then up to three alternatives,
 * then the ways out, then — below a hairline, never beside them — the
 * program change and `Ik voel iets`.
 */
/** How close a result is, as three bars: lime for a strong match. */
export function MatchMeter({ strength }: { strength: 1 | 2 | 3 }) {
  const tone = MatchMeter.tone(strength);
  return (
    <HStack spacing={3} aria-hidden style={{ alignItems: "flex-end", height: 14 }}>
      {[1, 2, 3].map((bar) => (
        <span key={bar} style={{ width: 5, height: 5 + bar * 3, borderRadius: 2, background: bar <= strength ? tone : SL.Surface.hairlineStrong }} />
      ))}
    </HStack>
  );
}
MatchMeter.tone = (strength: 1 | 2 | 3): string => (strength === 3 ? SL.Signal.action : strength === 2 ? SL.Ink.primary : SL.Ink.secondary);

/**
 * The same kind of exercises, right under the exercise in the session: the
 * swap list's best few as cards to swipe through, so another machine or
 * another bar is one tap away (and one tap back, in the undo). Shown until
 * the first set is logged; the Swap button keeps the rest — pain, the
 * plan, your own exercise.
 */
export function SwapSuggestionStrip(p: { exercise: Exercise; sessionExerciseIDs: Set<string>; onPick: (exercise: Exercise, reason: SwapReason) => void }) {
  const app = useApp();
  const alternatives = app.alternatives({ for: p.exercise.id, occupied: false, excluding: p.sessionExerciseIDs }).slice(0, 5);
  if (alternatives.length === 0) return null;
  const reason = SwapContext.reason(
    SwapContext.make({ currentExerciseID: p.exercise.id, role: "accessory", isOccupied: false, painfulLoadTags: app.painfulLoadTags }),
  );
  return (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>Similar exercises · tap one to switch</Text>
      <div
        role="list"
        aria-label={`Exercises like ${p.exercise.name}`}
        style={{ display: "flex", gap: SL.Space.s2, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", alignSelf: "stretch", marginRight: -SL.Space.gutterSession, paddingRight: SL.Space.gutterSession }}
      >
        {alternatives.map((alternative) => {
          const strength = SubstitutionCopy.strength(alternative);
          const group = ExerciseModel.group(alternative.exercise);
          return (
            <Pressable
              key={RankedAlternative.id(alternative)}
              role="listitem"
              aria-label={`Switch to ${alternative.exercise.name}, ${SubstitutionCopy.fit(alternative)}`}
              onPress={() => p.onPick(alternative.exercise, reason)}
              style={{ flex: "0 0 148px", scrollSnapAlign: "start", textAlign: "left", padding: SL.Space.s3, borderRadius: SL.Radius.lg, background: SL.Surface.raised, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}`, display: "flex", flexDirection: "column", gap: SL.Space.s2 }}
            >
              <HStack alignment="top" style={{ alignSelf: "stretch" }}>
                <div aria-hidden style={{ width: 34, height: 34, padding: 5, boxSizing: "border-box", borderRadius: 10, background: strength === 3 ? SL.Signal.actionTint : SL.Surface.raised2, display: "grid", placeItems: "center" }}>
                  <MuscleFigure group={group} highlight={strength === 3 ? SL.Signal.action : SL.Ink.primary} outline={colorOpacity(SL.Ink.secondary, 0.8)} style={{ width: "100%", height: "100%" }} />
                </div>
                <Spacer />
                <MatchMeter strength={strength} />
              </HStack>
              <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={2} style={{ minHeight: 40 }}>
                {alternative.exercise.name}
              </Text>
              <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} color={MatchMeter.tone(strength)} lineLimit={1}>
                {SubstitutionCopy.fit(alternative)}
              </Text>
            </Pressable>
          );
        })}
      </div>
    </VStack>
  );
}

export function SwapSheet(p: {
  exercise: Exercise;
  origin: Exercise | undefined;
  reorder: ReorderPlan | undefined;
  hasLoggedSets: boolean;
  /**
   * False once every set of this exercise is written. A swap only ever
   * moves open rows, so there is nothing left for one to change today.
   */
  hasOpenSets: boolean;
  /** Exercises already in today's session, never offered as substitutes. */
  sessionExerciseIDs: Set<string>;
  /** Today's training day, as 15Rb names it ("Push"). */
  dayLabel: string;
  onOutcome: (outcome: SwapOutcome) => void;
  onRecordPain: (flag: PainFlag) => void;
  onClose: () => void;
}) {
  const { exercise, origin, reorder, hasLoggedSets, hasOpenSets, sessionExerciseIDs, dayLabel, onOutcome, onRecordPain, onClose } = p;
  const app = useApp();
  const [step, setStep] = useState<SwapStep>({ kind: "alternatives" });
  /** 31c's self-check. Deliberately not stored: SETLINE keeps nothing you did not enter yourself. */
  const [signals, setSignals] = useState<Set<string>>(new Set());
  /** 31a's answers, kept while moving between its page and 31b's. */
  const [painRegion, setPainRegion] = useState<PainRegion | undefined>(undefined);
  const [painTiming, setPainTiming] = useState<PainTiming | undefined>(undefined);
  /** "The machine is taken." Independent of pain: both can be true at once. */
  const [occupied, setOccupied] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customEquipment, setCustomEquipment] = useState<Equipment>("machineSelectorised");
  const [customIsCompound, setCustomIsCompound] = useState(false);
  /**
   * 15Rb opens on the narrowest reach. A program change still waits for an
   * explicit yes — `Vervangen` — because it is the one action here that
   * outlives the session (TRAINING_LOGIC §12.4).
   */
  const [scope, setScope] = useState<ReplacementScope>("thisDay");
  const nameField = useRef<HTMLInputElement>(null);

  const alternatives = app.alternatives({ for: exercise.id, occupied, excluding: sessionExerciseIDs });
  const isPainPage = SwapStep.isPainPage(step);

  useEffect(() => {
    if (step.kind !== "custom") return;
    const t = window.setTimeout(() => nameField.current?.focus(), 400);
    return () => window.clearTimeout(t);
  }, [step.kind]);

  /** Fixed for the life of each step. */
  const height = (() => {
    switch (step.kind) {
      case "alternatives": {
        let value = 360; // head + toggle + tools + footer
        value += app.activePainRegions.length * 56;
        if (hasLoggedSets) value += 40;
        if (reorder) value += 116;
        if (hasOpenSets) {
          value += alternatives.length * 104;
          if (alternatives.length === 0) value += 104;
        } else {
          value += 64;
        }
        return Math.min(value, 720);
      }
      case "browse":
        return 680;
      case "custom":
        return 520;
      case "replacePick":
        return Math.min(260 + Math.max(alternatives.length, 1) * 64, 640);
      case "scope":
        return 640;
      case "painQuestions":
      case "painOptions":
        return 720;
    }
  })();

  const grabber = (
    <HStack style={{ alignSelf: "stretch", paddingTop: SL.Space.s3, paddingBottom: SL.Space.s5 }}>
      <Spacer />
      <span style={{ width: 36, height: 5, borderRadius: 3, background: SL.Surface.hairlineStrong }} />
      <Spacer />
    </HStack>
  );

  // MARK: - 15R

  /**
   * 15R: one raised2 container, radius 20 with 8 of padding, the rows
   * inside it split by hairlines. The first answer's fit label is the only
   * one in full ink.
   */
  const alternativesList = (items: RankedAlternative[]) => (
    <VStack spacing={0} style={{ alignSelf: "stretch", padding: 8, borderRadius: SL.Radius.option, background: SL.Surface.raised2 }}>
      {items.flatMap((alternative, index) => {
        const row = alternativeRow(alternative, items, index === 0);
        return index < items.length - 1 ? [row, <SLHairline key={`h${index}`} />] : [row];
      })}
    </VStack>
  );

  /**
   * Whether the station is taken, in the component sheet's chip: selected
   * when on, the dashed "not on" chip when off.
   */
  const occupiedToggle = (
    <div style={{ paddingTop: SL.Space.s2 }}>
      <SLChip title="Machine or rack is taken" look={occupied ? "selected" : "off"} action={() => setOccupied(!occupied)} />
    </div>
  );

  /** "Rekening gehouden met je schouder." only when the shoulder changed the list. */
  const painLine = (region: PainRegion, changesList: boolean): string => {
    const name = PainRegion.sentenceName(region);
    if (changesList && name !== undefined) return `Your ${name} is taken into account.`;
    return `${PainRegion.label(region)} · Noted. This doesn't change this list.`;
  };

  const painRow = (region: PainRegion) => {
    const changesList = app.painChangesList({ region, for: exercise.id, occupied, excluding: sessionExerciseIDs });
    return (
      <HStack key={region} alignment="center" spacing={SL.Space.s2} style={{ alignSelf: "stretch", minHeight: SL.Space.hitMin }}>
        <Text {...slBody()} color={SL.Ink.secondary}>{painLine(region, changesList)}</Text>
        <Spacer minLength={SL.Space.s2} />
        <Pressable
          onPress={() => void app.forgetPain({ region })}
          aria-label={`Remove ${PainRegion.label(region).toLowerCase()}`}
          style={{ background: "transparent", flexShrink: 0 }}
        >
          <Text {...slMeta(SL.Weight.medium)} color={SL.Ink.tertiary} style={slHitTarget()}>Remove</Text>
        </Pressable>
      </HStack>
    );
  };

  /** Every active region, each with its own `Verwijder`. */
  const painRows = () => {
    const regions = app.activePainRegions;
    if (regions.length === 0) return null;
    return (
      <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
        {regions.map(painRow)}
      </VStack>
    );
  };

  /**
   * 15R: "Doe hack squat nu" over "Kom terug voor bankdrukken." Radius 16,
   * raised2 and the .16 edge, the swap glyph in front — no eyebrow, and no
   * lime: the card is an option, not a signal.
   */
  const reorderCard = (plan: ReorderPlan) => (
    <Pressable
      onPress={() => onOutcome({ kind: "reorder", value: plan })}
      aria-label={`Do ${plan.candidate.name} now, come back for ${plan.current.name}`}
      style={{ alignSelf: "stretch", textAlign: "left", marginTop: SL.Space.s3, ...slCardStrong({ radius: SL.Radius.lg, fill: SL.Surface.raised2 }) }}
    >
      <HStack spacing={SL.Space.s3} style={{ paddingTop: 14, paddingBottom: 14, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4 }}>
        <SLGlyph name="swapVert" size={20} color={SL.Ink.secondary} />
        <VStack alignment="leading" spacing={2}>
          <Text {...slLead()} color={SL.Ink.primary}>{`Do ${plan.candidate.name.toLowerCase()} now`}</Text>
          <Text {...slMeta()} color={SL.Ink.secondary}>{`Come back for ${plan.current.name.toLowerCase()}.`}</Text>
        </VStack>
        <Spacer minLength={0} />
      </HStack>
    </Pressable>
  );

  /**
   * One result, readable at a glance: the muscle it works (as on Progress ›
   * Strength), the name, the setup, and how close it is as a three-bar
   * meter. The reasoning sits under the best match only; one tap swaps.
   */
  const alternativeRow = (alternative: RankedAlternative, peers: RankedAlternative[], leads = false) => (
    <Pressable
      key={RankedAlternative.id(alternative)}
      aria-label={`${alternative.exercise.name}, ${SubstitutionCopy.fit(alternative)}`}
      onPress={() => {
        const reason = SwapContext.reason(
          SwapContext.make({ currentExerciseID: exercise.id, role: "accessory", isOccupied: occupied, painfulLoadTags: app.painfulLoadTags }),
        );
        onOutcome({ kind: "substitute", _0: alternative.exercise, _1: reason });
      }}
      style={{ alignSelf: "stretch", textAlign: "left", background: "transparent", borderRadius: SL.Radius.md }}
    >
      {alternativeFace(alternative, peers, leads)}
    </Pressable>
  );

  const alternativeFace = (alternative: RankedAlternative, peers: RankedAlternative[], leads: boolean) => {
    const strength = SubstitutionCopy.strength(alternative);
    const tone = MatchMeter.tone(strength);
    const group = ExerciseModel.group(alternative.exercise);
    return (
      <HStack alignment="center" spacing={SL.Space.s3} style={{ paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3, paddingLeft: 10, paddingRight: 10 }}>
        <div aria-hidden style={{ width: 44, height: 44, flexShrink: 0, padding: 6, boxSizing: "border-box", borderRadius: 12, background: strength === 3 ? SL.Signal.actionTint : SL.Surface.raised, display: "grid", placeItems: "center" }}>
          <MuscleFigure group={group} highlight={strength === 3 ? SL.Signal.action : SL.Ink.primary} outline={colorOpacity(SL.Ink.secondary, 0.8)} style={{ width: "100%", height: "100%" }} />
        </div>
        <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
          <Text {...slLead()} color={SL.Ink.primary} lineLimit={2}>{alternative.exercise.name}</Text>
          <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
            {[SubstitutionCopy.equipmentLabel(alternative.exercise.equipment), group ? MuscleGroup.title(group) : undefined].filter(Boolean).join(" · ")}
          </Text>
          {leads && (
            <Text {...slMeta()} lineHeight={1.4} color={SL.Ink.tertiary} style={{ paddingTop: 2 }}>
              {SubstitutionCopy.why(alternative, { origin: exercise, alongside: peers })}
            </Text>
          )}
        </VStack>
        <VStack alignment="trailing" spacing={4} style={{ flexShrink: 0 }}>
          <MatchMeter strength={strength} />
          <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} color={tone} lineLimit={1}>
            {SubstitutionCopy.fit(alternative)}
          </Text>
        </VStack>
      </HStack>
    );
  };

  /**
   * Zero results is a real answer, not a failure. Say what is true and
   * leave the honest doors open.
   */
  const emptyState = () => {
    const isCustom = exercise.attributes === undefined;
    const painEmptied = !isCustom && app.painEmptiesList({ for: exercise.id, occupied, excluding: sessionExerciseIDs });
    return (
      <VStack alignment="leading" spacing={0} style={{ ...slCard({ radius: SL.Radius.lg }), alignSelf: "stretch", padding: SL.Space.s4, marginTop: 10 }}>
        <Text {...slLead()} color={SL.Ink.primary}>
          {isCustom ? "No alternatives for a custom exercise." : "No alternative that truly replaces this exercise."}
        </Text>
        <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingTop: 8 }}>
          {isCustom
            ? "SETLINE has no data on this exercise to compare with."
            : painEmptied
              ? "Everything that trains the same movement also loads what you reported. Look at the other options or pick your own exercise."
              : `What's left trains something other than ${exercise.name.toLowerCase()}. We'd rather suggest nothing than something weak.`}
        </Text>
      </VStack>
    );
  };

  /** 15R: 44 high, radius 12, raised2, 15/500 in `text2`. */
  const toolButton = (title: string, action: () => void, glyph?: SLGlyph_NameCase) => (
    <Pressable
      key={title}
      onPress={action}
      style={{ flex: "1 1 0", minWidth: 0, minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: SL.Radius.md, background: SL.Surface.raised2, color: SL.Ink.secondary }}
    >
      {glyph && <SLGlyph name={glyph} size={18} />}
      <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>{title}</Text>
    </Pressable>
  );

  /**
   * 15R's lower links: 15/500 in `text2` over a 12pt line saying what the
   * link reaches, with the chevron in `text3`.
   */
  const footerLink = (title: string, detail: string, action: () => void) => (
    <Pressable onPress={action} style={{ alignSelf: "stretch", textAlign: "left", background: "transparent" }}>
      <HStack spacing={SL.Space.s3} style={{ paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2, minHeight: SL.Space.hitMin }}>
        <VStack alignment="leading" spacing={2}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>{title}</Text>
          <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.tertiary}>{detail}</Text>
        </VStack>
        <Spacer minLength={0} />
        <SLGlyph name="chevronRight" size={20} color={SL.Ink.tertiary} />
      </HStack>
    </Pressable>
  );

  const secondaryLink = (title: string, action: () => void, muted = false) => (
    <Pressable onPress={action} style={{ alignSelf: "stretch", background: "transparent", paddingTop: SL.Space.s3 }}>
      <HStack style={{ minHeight: SL.Space.hitMin }}>
        <Text {...slBody(muted ? SL.Weight.regular : SL.Weight.medium)} color={muted ? SL.Ink.tertiary : SL.Ink.secondary}>{title}</Text>
        <Spacer />
        <SLGlyph name="chevronRight" size={20} color={SL.Ink.tertiary} />
      </HStack>
    </Pressable>
  );

  const footer = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch", paddingTop: 10 }}>
      {/* Both of these swap today's open sets, so they only appear while there are any. */}
      {hasOpenSets && (
        <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          {toolButton("Bladeren", () => setStep({ kind: "browse" }), "search")}
          {toolButton("Your own exercise", () => setStep({ kind: "custom" }))}
        </HStack>
      )}
      {/* Below the hairline on purpose. A permanent program change must never share a surface or a shape with the temporary swap above. */}
      <SLHairline style={{ marginTop: SL.Space.s4, marginBottom: SL.Space.s1 }} />
      {footerLink("Replace in plan", "Changes your plan, not just today", () => setStep({ kind: "replacePick" }))}
      <SLHairline style={{ marginTop: SL.Space.s1, marginBottom: SL.Space.s1 }} />
      {footerLink("Something hurts", "Pain or discomfort with this movement", () => {
        setPainRegion(undefined);
        setPainTiming(undefined);
        setSignals(new Set());
        setStep({ kind: "painQuestions" });
      })}
    </VStack>
  );

  const alternativesStep = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
      {/* 15R: the name at 34 with the way out on its first line. */}
      <HStack alignment="firstTextBaseline" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        <Text {...slDisplay()} lineHeight={SL.LineHeight.display} color={SL.Ink.primary} as="h2">{`Change ${exercise.name}`}</Text>
        <Spacer minLength={SL.Space.s2} />
        <Pressable onPress={onClose} style={{ background: "transparent", flexShrink: 0 }}>
          <Text {...slBody()} color={SL.Ink.secondary} style={slHitTarget()}>Close</Text>
        </Pressable>
      </HStack>

      <Text {...slMeta()} lineHeight={SL.LineHeight.body} color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s1 }}>
        Tap one to switch to it. Your sets, reps and RIR stay; the weight starts fresh.
      </Text>

      {/* Both contexts, always. "The machine is taken" is the reason this sheet exists, and a pain flag never switches it off. */}
      {occupiedToggle}
      {painRows()}

      {hasLoggedSets && (
        <Text {...slMeta()} color={SL.Ink.tertiary} style={{ paddingTop: 6 }}>
          {`What you already logged for ${exercise.name.toLowerCase()} stays under that exercise.`}
        </Text>
      )}

      {origin && (
        <Text {...slMeta()} color={SL.Ink.tertiary} style={{ paddingTop: 6 }}>{`Currently swapped from ${origin.name.toLowerCase()}.`}</Text>
      )}

      {/* Reorder comes first, because it is the only option that costs the user nothing. */}
      {reorder && reorderCard(reorder)}

      {!hasOpenSets ? (
        <Text {...slBody()} color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s5 }}>
          {`All sets of ${exercise.name.toLowerCase()} are logged. A swap only applies to sets still open.`}
        </Text>
      ) : alternatives.length === 0 ? (
        emptyState()
      ) : (
        <div style={{ alignSelf: "stretch", paddingTop: 10 }}>{alternativesList(alternatives)}</div>
      )}

      {footer}
    </VStack>
  );

  /** `Terug` as every artboard sets it: 15/500 `text2`, no chevron. */
  const backLink = (action: () => void) => (
    <Pressable onPress={action} style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
      <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>Back</Text>
    </Pressable>
  );

  // MARK: - Andere opties

  const browseStep = () => {
    const options = app.browsableAlternatives({ for: exercise.id, occupied, excluding: sessionExerciseIDs });
    return (
      <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
        {backLink(() => setStep({ kind: "alternatives" }))}
        <Text {...slTitle()} color={SL.Ink.primary} style={{ paddingTop: SL.Space.s3 }}>Other options</Text>
        <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingTop: 6 }}>
          Broader than the recommendations. At the bottom are exercises that train the same muscle but change how the workout is set up.
        </Text>
        {options.length === 0 && (
          <Text {...slBody()} color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s5 }}>Nothing fits here either. Pick your own exercise.</Text>
        )}
        {options.length > 0 && <div style={{ alignSelf: "stretch", paddingTop: SL.Space.s4 }}>{alternativesList(options)}</div>}
        {secondaryLink("Your own exercise", () => setStep({ kind: "custom" }))}
      </VStack>
    );
  };

  // MARK: - Eigen oefening

  const trimmedCustomName = customName.trim();

  const addCustomExercise = () => {
    if (trimmedCustomName === "") return;
    nameField.current?.blur();
    onOutcome({ kind: "custom", value: CustomExercise.make({ name: trimmedCustomName, equipment: customEquipment, isCompound: customIsCompound }) });
  };

  const equipmentChips = () => {
    const options: [Equipment, string][] = [
      ["barbell", "Barbell"],
      ["dumbbell", "Dumbbell"],
      ["machineSelectorised", "Machine"],
      ["cable", "Cable"],
      ["bodyweight", "Bodyweight"],
    ];
    return (
      <FlowRow spacing={SL.Space.s2}>
        {options.map(([value, title]) => {
          const isSelected = customEquipment === value;
          return (
            <Pressable key={value} onPress={() => setCustomEquipment(value)} style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
              {/* Visually 38 high; the tappable area is 44. */}
              <span
                aria-pressed={isSelected}
                style={{
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: SL.Space.s3,
                  paddingRight: SL.Space.s3,
                  minHeight: 38,
                  borderRadius: 999,
                  background: isSelected ? SL.Surface.raised2 : "transparent",
                  boxShadow: `inset 0 0 0 1px ${isSelected ? SL.Surface.selection : SL.Surface.hairline}`,
                }}
              >
                <Text {...slMeta(isSelected ? SL.Weight.semibold : SL.Weight.regular)} color={isSelected ? SL.Ink.primary : SL.Ink.secondary}>{title}</Text>
              </span>
            </Pressable>
          );
        })}
      </FlowRow>
    );
  };

  const customStep = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
      {backLink(() => {
        nameField.current?.blur();
        setStep({ kind: "alternatives" });
      })}
      <Text {...slTitle()} color={SL.Ink.primary} style={{ paddingTop: SL.Space.s3 }}>Your own exercise</Text>
      <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingTop: 6 }}>A name is enough. SETLINE asks for the rest with a calibration set.</Text>

      <input
        ref={nameField}
        value={customName}
        placeholder="Exercise name"
        autoCapitalize="sentences"
        autoCorrect="off"
        enterKeyHint="done"
        onChange={(e) => setCustomName(e.target.value)}
        // The keyboard's own button adds the exercise, so the action is reachable even when the keyboard covers everything below.
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addCustomExercise();
          }
        }}
        className="sl-swap-name"
        style={{
          ...slFont(SL.TypeSize.body, SL.Weight.medium),
          ...slCard({ radius: SL.Radius.md }),
          color: SL.Ink.primary,
          padding: SL.Space.s4,
          marginTop: SL.Space.s4,
          alignSelf: "stretch",
          outline: "none",
        }}
      />
      <style>{`.sl-swap-name::placeholder { color: ${SL.Ink.tertiary}; }`}</style>

      <div style={{ alignSelf: "stretch", paddingTop: SL.Space.s4 }}>
        <SLPrimaryButton onPress={addCustomExercise} disabled={trimmedCustomName === ""}>Add and calibrate</SLPrimaryButton>
      </div>

      <SLEyebrow text="Equipment · optional" style={{ paddingTop: SL.Space.s6, paddingBottom: SL.Space.s2 }} />
      {equipmentChips()}

      {/* The component sheet's chip rather than a system switch: on is selected, off is the dashed "not on" chip. */}
      <div style={{ paddingTop: SL.Space.s4 }}>
        <SLChip title="Compound exercise" look={customIsCompound ? "selected" : "off"} action={() => setCustomIsCompound(!customIsCompound)} />
      </div>
    </VStack>
  );

  // MARK: - 15Rb

  /**
   * Choosing what goes into the program. 15Rb opens with the choice
   * already made, so this step borrows the list's shape and says plainly
   * that it reaches past today.
   */
  const replacePickStep = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
      {backLink(() => setStep({ kind: "alternatives" }))}
      <Text {...slTitle()} color={SL.Ink.primary} style={{ paddingTop: SL.Space.s3 }}>Replace in plan</Text>
      <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingTop: 6 }}>
        {`This changes your plan, not just today. Pick what replaces ${exercise.name.toLowerCase()}.`}
      </Text>
      <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingTop: SL.Space.s5 }}>
        {alternatives.map((alternative, index) => (
          <Pressable
            key={RankedAlternative.id(alternative)}
            aria-label={`${alternative.exercise.name}, ${SubstitutionCopy.fit(alternative)}`}
            onPress={() => {
              setScope("thisDay");
              setStep({ kind: "scope", value: alternative.exercise.id });
            }}
            style={{ alignSelf: "stretch", textAlign: "left", ...slCard({ radius: SL.Radius.md }) }}
          >
            {alternativeFace(alternative, alternatives, index === 0)}
          </Pressable>
        ))}
        {alternatives.length === 0 && (
          <Text {...slBody()} color={SL.Ink.secondary} style={{ alignSelf: "stretch" }}>No alternative to put in your plan.</Text>
        )}
      </VStack>
    </VStack>
  );

  /** `OptionSurface`: picked takes the selected card; otherwise the strong-edged one. */
  const optionSurface = (picked: boolean): CSSProperties =>
    picked ? slCard({ radius: SL.Radius.option, selected: true }) : slCardStrong({ radius: SL.Radius.option });

  /**
   * What each reach covers here, in this plan's own names: "Push, vanaf
   * vandaag", "Push en Push B, tot je het plan wijzigt".
   */
  const scopeDetail = (option: ReplacementScope): string => {
    switch (option) {
      case "thisDay":
        return `${dayLabel}, from today`;
      case "thisPlan": {
        const days = app.plan.filter((d) => d.exercises.some((e) => e.exerciseID === exercise.id)).map((d) => d.short);
        return `${SwapSheet.dutchList(days.length === 0 ? [dayLabel] : days)}, until you change the plan`;
      }
      case "always":
        return `Everywhere ${exercise.name.toLowerCase()} appears, including future plans`;
    }
  };

  /**
   * 15Rb's scope card: radius 20, a 17pt name over a 13pt line. The picked
   * one takes raised2, the .28 edge and the filled dot.
   */
  const scopeRow = (option: ReplacementScope) => {
    const picked = scope === option;
    return (
      <Pressable key={option} onPress={() => setScope(option)} style={{ alignSelf: "stretch", textAlign: "left", ...optionSurface(picked) }}>
        <HStack spacing={SL.Space.s3} style={{ paddingTop: SL.Space.s4, paddingBottom: SL.Space.s4, paddingLeft: 18, paddingRight: 18 }}>
          <VStack alignment="leading" spacing={SL.Space.s1}>
            <Text {...slLead()} color={SL.Ink.primary}>{ReplacementScope.label(option)}</Text>
            <Text {...slMeta()} color={picked ? SL.Ink.secondary : SL.Ink.tertiary}>{scopeDetail(option)}</Text>
          </VStack>
          <Spacer minLength={0} />
          {picked && <span style={{ width: 22, height: 22, borderRadius: 999, background: SL.Ink.primary, flexShrink: 0 }} />}
        </HStack>
      </Pressable>
    );
  };

  /**
   * Artboard 15Rb. The substitute is chosen; what is left is how far the
   * change reaches and the one explicit yes.
   */
  const scopeStep = (substituteID: string) => {
    const substitute = app.exercise(substituteID);
    return (
      <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
        <Text {...slDisplay()} lineHeight={SL.LineHeight.display} color={SL.Ink.primary} as="h2">{`Replace with ${substitute.name.toLowerCase()}`}</Text>
        <Text {...slBody()} lineHeight={SL.LineHeight.body} color={SL.Ink.secondary} style={{ paddingTop: 10 }}>
          {`Choose where this applies. Your history for ${exercise.name.toLowerCase()} is kept.`}
        </Text>
        <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingTop: SL.Space.s5 }}>
          {ReplacementScope.allCases.map(scopeRow)}
        </VStack>
        <div style={{ alignSelf: "stretch", paddingTop: SL.Space.s5 }}>
          <SLPrimaryButton
            onPress={() => {
              // Close the sheet first, then change the session under it.
              const chosen = scope;
              onClose();
              window.setTimeout(() => onOutcome({ kind: "replaceInProgram", _0: substitute, _1: chosen }), 50);
            }}
          >
            Vervangen
          </SLPrimaryButton>
        </div>
        <Pressable
          onPress={() => setStep({ kind: "alternatives" })}
          style={{ alignSelf: "stretch", marginTop: SL.Space.s2, minHeight: SL.Metric.tertiaryHeight, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>Cancel</Text>
        </Pressable>
      </VStack>
    );
  };

  // MARK: - 31a / 31b / 31c

  /** 31a and 31b: plain text actions in `text2`, no chevron. */
  const painHeader = (back: () => void, skip?: () => void) => (
    <HStack style={{ alignSelf: "stretch", paddingTop: SL.Space.s3 }}>
      <Pressable onPress={back} style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>Back</Text>
      </Pressable>
      <Spacer minLength={SL.Space.s4} />
      {skip && (
        <Pressable onPress={skip} style={{ background: "transparent", minHeight: SL.Space.hitMin, display: "flex", alignItems: "center" }}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>Skip</Text>
        </Pressable>
      )}
    </HStack>
  );

  /**
   * 31a's answer card: radius 20, 17pt. Picked, it takes the raised2 fill,
   * the .28 edge and the filled dot; otherwise it stays on `raised`.
   */
  const timingCard = (timing: PainTiming) => {
    const picked = painTiming === timing;
    return (
      <Pressable key={timing} onPress={() => setPainTiming(picked ? undefined : timing)} style={{ alignSelf: "stretch", textAlign: "left", ...optionSurface(picked) }}>
        <HStack spacing={SL.Space.s3} style={{ paddingTop: SL.Space.s4, paddingBottom: SL.Space.s4, paddingLeft: 18, paddingRight: 18 }}>
          <Text {...slLead(picked ? SL.Weight.semibold : SL.Weight.medium)} color={picked ? SL.Ink.primary : SL.Ink.secondary}>{PainTiming.label(timing)}</Text>
          <Spacer minLength={0} />
          {picked && <span style={{ width: 22, height: 22, borderRadius: 999, background: SL.Ink.primary, flexShrink: 0 }} />}
        </HStack>
      </Pressable>
    );
  };

  /**
   * 31a · both questions on one page, both optional. `Verder` goes on with
   * whatever is picked, `Overslaan` with nothing; neither stores anything
   * until one of 31b's options is chosen.
   */
  const painQuestionsStep = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
      {painHeader(() => setStep({ kind: "alternatives" }), () => setStep({ kind: "painOptions", _0: undefined, _1: undefined }))}
      <Text {...slDisplay()} lineHeight={SL.LineHeight.display} color={SL.Ink.primary} as="h2" style={{ paddingTop: SL.Space.s5 }}>Where do you feel it?</Text>
      <Text {...slBody()} lineHeight={SL.LineHeight.body} color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s2 }}>
        Both questions are optional. SETLINE doesn't diagnose and keeps nothing you don't fill in yourself.
      </Text>
      <FlowRow spacing={SL.Space.s2} style={{ paddingTop: SL.Space.s5 }}>
        {PainRegion.allCases.map((region) => (
          <SLChip
            key={region}
            title={PainRegion.label(region)}
            size="large"
            look={painRegion === region ? "selected" : "unselected"}
            action={() => setPainRegion(painRegion === region ? undefined : region)}
          />
        ))}
      </FlowRow>
      <Text {...slTitle()} color={SL.Ink.primary} as="h3" style={{ paddingTop: SL.Space.s8 }}>When?</Text>
      <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingTop: SL.Space.s4 }}>
        {PainTiming.allCases.map(timingCard)}
      </VStack>
    </VStack>
  );

  /** A flag is only ever stored for a region the user actually named. */
  const record = (region: PainRegion | undefined, timing: PainTiming | undefined) => {
    if (region === undefined) return;
    onRecordPain(PainFlag.make({ region, timing, exerciseID: exercise.id }));
  };

  /** 31b's option card: radius 20, raised2, the .16 edge; 17pt title over a 13pt line. */
  const painOption = (title: string, detail: string, action: () => void) => (
    <Pressable key={title} onPress={action} style={{ alignSelf: "stretch", textAlign: "left", ...slCard({ radius: SL.Radius.option, loud: true }) }}>
      <VStack alignment="leading" spacing={SL.Space.s1} style={{ paddingTop: SL.Space.s4, paddingBottom: SL.Space.s4, paddingLeft: 18, paddingRight: 18 }}>
        <Text {...slLead()} color={SL.Ink.primary}>{title}</Text>
        <Text {...slMeta()} lineHeight={1.4} color={SL.Ink.secondary}>{detail}</Text>
      </VStack>
    </Pressable>
  );

  /** 31b · stated once, below a hairline, as a guideline — never as personal advice. */
  const guideline = (
    <div style={{ position: "relative", alignSelf: "stretch", marginTop: SL.Space.s6, paddingTop: SL.Space.s4 }}>
      <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />
      <VStack alignment="leading" spacing={SL.Space.s2}>
        <SLEyebrow text="GENERAL GUIDELINE" />
        <Text {...slBody()} lineHeight={SL.LineHeight.body} color={SL.Ink.secondary} style={slMeasure(34, { fontSize: SL.TypeSize.body })}>
          Mild pain during an exercise doesn't have to mean you stop, as long as it has faded by the next morning and doesn't increase week to week. In doubt, or getting worse? Have it checked.
        </Text>
      </VStack>
    </div>
  );

  /**
   * 31c · a self-check, not a question, in the same card shape as every
   * other proposal. Nothing here is stored, and the guidance card appears
   * only once a signal is ticked.
   */
  const escalation = (
    <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch", paddingTop: SL.Space.s6 }}>
      <VStack alignment="leading" spacing={0} style={{ ...slCardStrong({ fill: SL.Surface.raised2 }), alignSelf: "stretch", padding: SL.Space.s5 }}>
        <SLEyebrow text="NOT A QUESTION, A CHOICE" />
        <Text {...slLead()} color={SL.Ink.primary} style={{ paddingTop: 10, paddingBottom: SL.Space.s3 }}>Does one of these apply?</Text>
        <FlowRow spacing={6}>
          {escalationSignals.map((signal) => {
            const picked = signals.has(signal);
            return (
              <SLChip
                key={signal}
                title={signal}
                look={picked ? "selected" : signal === noneOfThese ? "quiet" : "check"}
                action={() => {
                  if (signal === noneOfThese) {
                    setSignals(picked ? new Set() : new Set([signal]));
                  } else {
                    const next = new Set(signals);
                    next.delete(noneOfThese);
                    if (picked) next.delete(signal);
                    else next.add(signal);
                    setSignals(next);
                  }
                }}
              />
            );
          })}
        </FlowRow>
      </VStack>
      {[...signals].some((s) => s !== noneOfThese) && (
        <VStack alignment="leading" spacing={0} style={{ ...slCardStrong(), alignSelf: "stretch", padding: SL.Space.s5 }}>
          <SLEyebrow text="ONLY AFTER A CHECKED SIGNAL" />
          <Text {...slLead()} lineHeight={1.4} color={SL.Ink.primary} style={{ paddingTop: 10 }}>Have this checked by a doctor or physiotherapist.</Text>
          <Text {...slBody()} lineHeight={SL.LineHeight.body} color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s2 }}>
            The four training options stay. SETLINE decides nothing for you and names no condition.
          </Text>
        </VStack>
      )}
    </VStack>
  );

  /**
   * 31b · four ways to keep training. None of them is framed as giving up,
   * and the guideline is stated once — as a guideline.
   */
  const painOptionsStep = (region: PainRegion | undefined, timing: PainTiming | undefined) => {
    const narrows = region !== undefined ? app.painWouldChangeList({ region, for: exercise.id, occupied, excluding: sessionExerciseIDs }) : false;
    return (
      <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
        {painHeader(() => setStep({ kind: "painQuestions" }))}
        {/* 31b heads the page with what was answered, so the four options read as a reply to it. */}
        <Text {...slDisplay()} lineHeight={SL.LineHeight.display} color={SL.Ink.primary} as="h2" style={{ paddingTop: SL.Space.s4 }}>
          {SwapSheet.painHeading(region, timing)}
        </Text>
        <Text {...slBody()} lineHeight={SL.LineHeight.body} color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s2 }}>
          Four ways to keep training. Pick what suits today.
        </Text>
        <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingTop: 14 }}>
          {painOption("Limit the movement to where it's pain-free", "Same weight, shorter range. Logged as partial reps.", () => {
            record(region, timing);
            onOutcome({ kind: "limitRange" });
          })}
          {painOption("Less weight, same reps", "You choose how much less. No increase this session.", () => {
            record(region, timing);
            onOutcome({ kind: "reduceLoad" });
          })}
          {/* The artboard's promise holds exactly when the region removes something from this list. */}
          {painOption(
            "Replace this exercise",
            narrows ? "Back to the swap sheet, with more stable variants at the top." : "Back to the swap sheet. This list doesn't change because of it.",
            () => {
              record(region, timing);
              setStep({ kind: "alternatives" });
            },
          )}
          {painOption("Skip this exercise", "The rest of the session stays.", () => {
            record(region, timing);
            onOutcome({ kind: "skipExercise" });
          })}
        </VStack>
        {guideline}
        {escalation}
      </VStack>
    );
  };

  const body = (() => {
    switch (step.kind) {
      case "alternatives":
        return alternativesStep;
      case "browse":
        return browseStep();
      case "custom":
        return customStep;
      case "replacePick":
        return replacePickStep;
      case "scope":
        return scopeStep(step.value);
      case "painQuestions":
        return painQuestionsStep;
      case "painOptions":
        return painOptionsStep(step._0, step._1);
    }
  })();

  const background = isPainPage ? SL.Surface.ground : SL.Surface.raised;
  return (
    <>
      <Presentation
        // The custom step takes the full height before the keyboard arrives; 31a and 31b are drawn as full pages on the ground.
        detents={step.kind === "custom" || isPainPage ? ["large"] : [{ height }]}
        background={background}
        dragIndicator="hidden"
      />
      <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, background }}>
        <ScrollView key={SwapStep.key(step)} style={{ flex: "1 1 0" }}>
          <VStack
            alignment="leading"
            spacing={0}
            style={{
              paddingLeft: isPainPage ? SL.Space.gutterSession : SL.Space.gutterEntry,
              paddingRight: isPainPage ? SL.Space.gutterSession : SL.Space.gutterEntry,
              paddingBottom: `calc(${SL.Space.s8}px + env(safe-area-inset-bottom))`,
            }}
          >
            {!isPainPage && grabber}
            {body}
          </VStack>
        </ScrollView>
        {step.kind === "painQuestions" && (
          <div
            style={{
              paddingLeft: SL.Space.gutterSession,
              paddingRight: SL.Space.gutterSession,
              paddingTop: SL.Space.s3,
              paddingBottom: `calc(${SL.Space.s2}px + env(safe-area-inset-bottom))`,
              background: SL.Surface.ground,
              flexShrink: 0,
            }}
          >
            <SLPrimaryButton onPress={() => setStep({ kind: "painOptions", _0: painRegion, _1: painTiming })}>Continue</SLPrimaryButton>
          </div>
        )}
      </div>
    </>
  );
}

/** "Push", "Push en Pull", "Push, Pull en Benen". */
SwapSheet.dutchList = (items: string[]): string => {
  const last = items[items.length - 1];
  if (last === undefined) return "";
  if (items.length <= 1) return last;
  return items.slice(0, -1).join(", ") + " and " + last;
};

/**
 * "Schouder, tijdens de beweging" when both were answered, one of the two
 * when only one was, and a plain heading when neither was.
 */
SwapSheet.painHeading = (region: PainRegion | undefined, timing: PainTiming | undefined): string => {
  if (region !== undefined && timing !== undefined) return `${PainRegion.label(region)}, ${PainTiming.label(timing).toLowerCase()}`;
  if (region !== undefined) return PainRegion.label(region);
  if (timing !== undefined) return PainTiming.label(timing);
  return "Keep training";
};

