// DayPlanSheet.swift — Artboards 41e–41g · "Wijzig deze dag".
//
// One date, one assignment. The sheet says what the date holds now, offers
// the sessions of the active programme, rest, and the programme's own
// standard, and names what the button will do before it does it. It changes
// which session belongs to this date — never the exercises inside a session,
// and never another date.
//
// A date whose session is logged cannot be assigned at all (41g): it belongs
// to what was done on it, and the sheet points at the session instead.
import { useState } from "react";
import { SL } from "../../design/tokens";
import { HStack, Spacer, Text, VStack } from "../../design/swiftui";
import { SLOutlineButton, SLPrimaryButton } from "../../design/SetlineTokens";
import { Presentation } from "../../design/support";
import { slLineHeight, slMeasure } from "../../design/SLDynamicType";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slLead, slMeta } from "../../design/components/SLText";
import { useApp } from "../../data/AppState";
import { DayPlan, DayPlan_Option } from "../../core/Engine/DayPlan";
import { CustomWorkout } from "../../core/Domain/CustomWorkout";
import type { TrainingSession } from "../../core/Domain/Model";

export function DayPlanSheet({
  plan,
  onApply,
  onOpenSession,
  onClose,
}: {
  plan: DayPlan;
  onApply: (option: DayPlan_Option) => void;
  onOpenSession: (session: TrainingSession) => void;
  onClose: () => void;
}) {
  const app = useApp();
  const [chosen, setChosen] = useState<DayPlan_Option | undefined>(undefined);

  const standard = plan.options.find((o) => o.kind.kind === "standard");

  /** 41f opens on the way back, because undoing a change is the likeliest reason to open a date you set yourself; 41e opens on what it holds. */
  const selection: DayPlan_Option = (() => {
    if (chosen !== undefined) return chosen;
    if (plan.isOverridden && standard !== undefined) return standard;
    return plan.options.find((o) => o.isCurrent) ?? plan.options[0];
  })();

  // MARK: - Chrome

  const grip = (
    <div aria-hidden style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", paddingBottom: 18, flexShrink: 0 }}>
      <div style={{ width: 36, height: 5, borderRadius: SL.Radius.pill, background: SL.Surface.hairlineStrong }} />
    </div>
  );

  const head = (
    <VStack alignment="leading" spacing={0} style={{ flexShrink: 0 }}>
      <Text as="h2" size={28} weight={SL.Weight.semibold} numerals color={SL.Ink.primary}>
        {plan.title}
      </Text>
      <HStack spacing={SL.Space.s2} style={{ paddingTop: plan.isLocked || plan.isOverridden ? 6 : 4 }}>
        {/* The same mark the rail draws for this date, so the sheet and the rail never describe it differently. */}
        {plan.isLocked ? (
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: SL.Ink.primary, flexShrink: 0 }} />
        ) : plan.isOverridden ? (
          <svg width={8} height={8} style={{ display: "block", flexShrink: 0 }} aria-hidden>
            <circle cx={4} cy={4} r={3.5} fill="none" stroke={SL.Ink.secondary} strokeWidth={1} strokeDasharray="2 1.6" />
          </svg>
        ) : null}
        <Text {...slBody()} numerals color={SL.Ink.secondary}>
          {plan.state}
        </Text>
      </HStack>
    </VStack>
  );

  // MARK: - 41g · a logged day

  const locked = (
    <VStack alignment="leading" spacing={0} style={{ flex: "1 1 0", alignSelf: "stretch" }}>
      <Text
        {...slBody()}
        color={SL.Ink.secondary}
        style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.body }), ...slMeasure(32, { fontSize: SL.TypeSize.body }), paddingTop: SL.Space.s4 }}
      >
        A logged day can't be changed. The date belongs to what you did.
      </Text>
      <Spacer minLength={SL.Space.s3} />
      {plan.session !== undefined && (
        <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
          <SLOutlineButton onPress={() => onOpenSession(plan.session!)}>View session</SLOutlineButton>
        </div>
      )}
      <button type="button" className="sl-pressable" onClick={onClose} style={{ alignSelf: "stretch", height: SL.Space.hitMin, background: "transparent" }}>
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>
          Close
        </Text>
      </button>
    </VStack>
  );

  // MARK: - 41e/41f · what this date can hold

  const sessionsTitle = (() => {
    const names = app.plan.map((d) => d.short);
    if (names.length === 0) return "SESSION FROM YOUR PLAN";
    return `SESSION FROM ${names.slice(0, 3).join(" / ").toUpperCase()}`;
  })();

  const isOwn = (option: DayPlan_Option) => option.kind.kind === "session" && CustomWorkout.isCustom({ dayID: option.kind.id });
  const isSession = (option: DayPlan_Option) => option.kind.kind === "session";

  const eyebrow = (text: string, paddingTop: number) => (
    <Text
      size={SL.TypeSize.micro}
      weight={SL.Weight.medium}
      tracking={SL.TypeSize.micro * 0.06}
      color={SL.Ink.tertiary}
      style={{ paddingTop, paddingBottom: 6, display: "block" }}
    >
      {text}
    </Text>
  );

  const row = (option: DayPlan_Option, paddingTop = 0) => {
    const isChosen = DayPlan_Option.id(option) === DayPlan_Option.id(selection);
    return (
      <div key={DayPlan_Option.id(option)} style={{ paddingTop, alignSelf: "stretch" }}>
        <button
          type="button"
          className="sl-pressable"
          onClick={() => setChosen(option)}
          aria-label={[option.title, option.hint].filter((x): x is string => x !== undefined).join(", ")}
          aria-pressed={isChosen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: SL.Space.s3,
            width: "calc(100% + 24px)",
            marginLeft: -12,
            marginRight: -12,
            paddingLeft: 12,
            paddingRight: 12,
            minHeight: 50,
            textAlign: "left",
            borderRadius: SL.Radius.md,
            background: isChosen ? SL.Surface.raised2 : "transparent",
            boxShadow: `inset 0 0 0 1px ${isChosen ? SL.Surface.selection : "transparent"}`,
            transition: `background ${SL.Motion.fast}s ease-out, box-shadow ${SL.Motion.fast}s ease-out`,
          }}
        >
          <Text {...slLead()} color={option.kind.kind === "standard" && !plan.isOverridden ? SL.Ink.tertiary : SL.Ink.primary}>
            {option.title}
          </Text>
          <Spacer minLength={SL.Space.s2} />
          {option.hint !== undefined && (
            <Text {...slMeta()} numerals color={SL.Ink.tertiary} lineLimit={1} style={{ flexShrink: 0 }}>
              {option.hint}
            </Text>
          )}
          {/* 20pt of room whether the tick is there or not, so nothing shifts when the choice moves. */}
          <div style={{ width: 20, display: "flex", justifyContent: "center", opacity: isChosen ? 1 : 0, transition: `opacity ${SL.Motion.fast}s ease-out`, flexShrink: 0 }}>
            <SLGlyph name="check" size={16} color={SL.Ink.primary} />
          </div>
        </button>
      </div>
    );
  };

  const own = plan.options.filter((o) => isOwn(o));
  const options = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
      {/* 41f puts the way back first, because undoing a change is the likeliest reason to open a changed day. */}
      {plan.isOverridden && standard !== undefined ? (
        <>
          {row(standard, 18)}
          {eyebrow("OR PICK ANOTHER", 18)}
        </>
      ) : (
        eyebrow(sessionsTitle, 22)
      )}
      {plan.options.filter((o) => isSession(o) && !isOwn(o)).map((o) => row(o))}
      {/* The lifter's own workouts, under their own name. */}
      {own.length > 0 && (
        <>
          {eyebrow("YOUR WORKOUTS", 18)}
          {own.map((o) => row(o))}
        </>
      )}
      <SLHairline style={{ marginTop: 10, marginBottom: 10 }} />
      {plan.options.filter((o) => !isSession(o) && !(o.kind.kind === "standard" && plan.isOverridden)).map((o) => row(o))}
    </VStack>
  );

  return (
    <VStack
      alignment="leading"
      spacing={0}
      style={{
        flex: "1 1 0",
        minHeight: 0,
        alignSelf: "stretch",
        overflowY: "auto",
        paddingLeft: SL.Space.gutterSession,
        paddingRight: SL.Space.gutterSession,
        paddingTop: 10,
        paddingBottom: 34,
        background: SL.Surface.raised,
      }}
    >
      {/* 41e opens tall enough to hold the programme; 41g has three lines to say and opens at the height of them. */}
      <Presentation detents={[plan.isLocked ? { height: 374 } : { fraction: 0.82 }]} dragIndicator="hidden" background={SL.Surface.raised} />
      {grip}
      {head}
      {plan.isLocked ? (
        locked
      ) : (
        <>
          {options}
          <Text {...slMeta()} color={SL.Ink.tertiary} style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.meta }), paddingTop: 14 }}>
            {DayPlan.note(plan, { for: selection })}
          </Text>
          <Spacer minLength={SL.Space.s3} />
          <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <SLPrimaryButton onPress={() => onApply(selection)} disabled={DayPlan.change(plan, { for: selection, programKey: app.programKey }) === undefined}>
              {DayPlan.confirmTitle(plan, { for: selection })}
            </SLPrimaryButton>
          </div>
        </>
      )}
    </VStack>
  );
}
