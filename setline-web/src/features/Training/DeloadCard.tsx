// DeloadCard.swift — Redesign 1a · "Recovery": the one place the app asks
// something.
//
// SETLINE's recovery proposal comes from the sets that were logged, and
// appears only when two of its signals agree inside one week. The card keeps
// the design's shape — what is proposed, the evidence under a hairline, take
// it or leave it — and states the evidence this account actually has.
//
// It changes nothing by itself. `Accept` starts the lighter days, `Ignore`
// leaves the plan as it is, and afterwards the card says which.
import { SL } from "../../design/tokens";
import { HStack, Spacer, Text, VStack } from "../../design/swiftui";
import { colorHex, colorOpacity } from "../../design/SetlineTokens";
import { slLineHeight } from "../../design/SLDynamicType";
import { SLHairline, slBody, slLead, slMeta, slTitle } from "../../design/components";
import { slUnbroken } from "../../design/components/SLPieces";
import { addDays, formatEnUS } from "../../core/Support/calendar";
import { Deload, type Fatigue_Reading } from "../../core/Engine/Fatigue";

/** `DeloadCard.Status`. */
export type DeloadCard_Status =
  /** Proposed and unanswered. */
  | "open"
  /** The lighter days are running. */
  | "applied"
  /** Waved away; the plan stays as it was. */
  | "ignored";
export const DeloadCard_Status = {
  open: "open" as DeloadCard_Status,
  applied: "applied" as DeloadCard_Status,
  ignored: "ignored" as DeloadCard_Status,
  allCases: ["open", "applied", "ignored"] as DeloadCard_Status[],
};

export function DeloadCard({
  reading,
  proposal,
  status,
  onApply,
  onDismiss,
}: {
  reading: Fatigue_Reading;
  proposal: Deload;
  status: DeloadCard_Status;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const statusLabel = status === "open" ? "Not applied" : status === "applied" ? "✓ Applied" : "Ignored";
  const applied = status === "applied";

  const statusChip = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        whiteSpace: "nowrap",
        paddingLeft: 10,
        paddingRight: 10,
        minHeight: 24 + 2 * SL.Metric.border,
        borderRadius: SL.Radius.pill,
        // The chip's own grey sits between the two hairlines.
        border: `1px solid ${applied ? colorOpacity(SL.Signal.recovery, 0.5) : colorHex(0x2a3330)}`,
      }}
    >
      <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} color={applied ? SL.Signal.recovery : SL.Ink.secondary}>
        {statusLabel}
      </Text>
    </span>
  );

  const lead = reading.signals.has("performanceRegression")
    ? "Your reps are dropping at the same weight."
    : reading.signals.has("effortDrift")
      ? "The same work costs you more."
      : "You're not finishing your sessions anymore.";

  /** What the signals say, in the reading's own words, and the sets that said it. */
  const evidence = (
    <div style={{ position: "relative", alignSelf: "stretch" }}>
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ paddingTop: SL.Space.s3 }}>
        <Text {...slBody()} color={SL.Ink.primary}>
          {lead}
        </Text>
        {reading.evidence.map((line, i) => (
          <HStack key={i} alignment="firstTextBaseline" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
            <Text {...slMeta()} color={SL.Ink.secondary}>
              {line.exerciseName}
            </Text>
            <Spacer minLength={SL.Space.s2} />
            <Text {...slBody(SL.Weight.semibold)} numerals align="trailing" color={line.exerciseName === "RIR" ? SL.Signal.attention : SL.Ink.primary}>
              {slUnbroken(line.detail)}
            </Text>
          </HStack>
        ))}
      </VStack>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <SLHairline />
      </div>
    </div>
  );

  const actionStyle = {
    flex: "1 1 0",
    minWidth: 0,
    minHeight: SL.Space.hitMin + 2 * SL.Metric.border,
    borderRadius: SL.Radius.md,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;

  const actions = (
    <HStack alignment="top" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <button
        type="button"
        className="sl-pressable"
        onClick={onApply}
        style={{ ...actionStyle, background: colorOpacity(SL.Signal.recovery, 0.1), border: `1px solid ${colorOpacity(SL.Signal.recovery, 0.5)}` }}
      >
        <Text {...slBody(SL.Weight.semibold)} color={SL.Signal.recovery}>
          Accept
        </Text>
      </button>
      <button
        type="button"
        className="sl-pressable"
        onClick={onDismiss}
        style={{ ...actionStyle, background: "transparent", border: `1px solid ${SL.Surface.hairlineStrong}` }}
      >
        <Text {...slBody()} color={SL.Ink.primary}>
          Ignore
        </Text>
      </button>
    </HStack>
  );

  const outcome = (text: string) => (
    <Text {...slBody()} numerals color={SL.Ink.primary} style={slLineHeight(1.4, { size: SL.TypeSize.body })}>
      {text}
    </Text>
  );

  return (
    <VStack
      alignment="leading"
      spacing={SL.Space.s3}
      style={{ padding: SL.Space.s4, alignSelf: "stretch", background: SL.Surface.raised, borderRadius: SL.Radius.lg }}
    >
      <HStack alignment="center" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        <Text {...slMeta()} numerals color={SL.Ink.secondary}>
          {`Suggestion for the next ${proposal.days} days`}
        </Text>
        <Spacer minLength={SL.Space.s2} />
        {statusChip}
      </HStack>

      <VStack alignment="leading" spacing={2}>
        <Text {...slTitle()} numerals color={SL.Ink.primary} style={slLineHeight(1.3, { size: SL.TypeSize.title })}>
          {`${proposal.days} lighter days`}
        </Text>
        <Text {...slLead(SL.Weight.regular)} numerals color={SL.Ink.primary} style={slLineHeight(1.3, { size: SL.TypeSize.lead })}>
          {slUnbroken(Deload.detail(proposal))}
        </Text>
      </VStack>

      {reading.evidence.length > 0 && evidence}

      {status === "open" && (
        <>
          {actions}
          <Text {...slMeta()} color={SL.Ink.secondary}>
            {Deload.footnote}
          </Text>
        </>
      )}
      {status === "applied" && outcome(`Accepted: ${proposal.days} lighter days, up to and including ${DeloadCard.lastDay(proposal)}.`)}
      {status === "ignored" && outcome("Ignored. Your plan stays as planned.")}
    </VStack>
  );
}

/** "Su 4 Oct" — the last day the lighter prescription covers. */
DeloadCard.lastDay = (proposal: Deload): string => {
  const last = addDays(proposal.startedAt, Math.max(0, proposal.days - 1));
  return formatEnUS(last, "EEEEEE d MMM").replaceAll(".", "");
};
