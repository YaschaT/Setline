// StreakHero.swift — the pieces of Training that carry the game around the
// hero card: the lifts that can go up today, and the badge a workout is
// working toward.
import { useState } from "react";
import { SL } from "../../design/tokens";
import { HStack, Spacer, Text, VStack } from "../../design/swiftui";
import { colorOpacity, spring } from "../../design/SetlineTokens";
import { useReduceMotion } from "../../design/support";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLPress } from "../../design/components/SLPress";
import { SLBar, SLHairline } from "../../design/components";
import { SLBadge } from "../../design/components/SLBadge";
import { slBody, slLead, slMeta } from "../../design/components/SLText";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Milestone } from "../../core/Progress/Milestones";
import type { ReadyLift } from "../../data/AppState";

// MARK: - Records within reach

/**
 * Under the hero, one line: how many lifts the engine says can go up
 * today, with the first of them. A tap opens the list in place — last
 * time's weight to today's — and closes it again.
 */
export function ReadyLiftsCard({ lifts, display }: { lifts: ReadyLift[]; display: NumberDisplay }) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReduceMotion();
  const title = lifts.length === 1 ? "1 lift can go up today" : `${lifts.length} lifts can go up today`;
  const first = lifts[0];
  return (
    <VStack
      alignment="leading"
      spacing={0}
      style={{
        background: SL.Surface.raised,
        borderRadius: SL.Radius.xl,
        boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairline}`,
        overflow: "hidden",
        alignSelf: "stretch",
      }}
    >
      <SLPress scale={0.98} onPress={() => setExpanded(!expanded)} aria-label={title} style={{ alignSelf: "stretch" }}>
        <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 60 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: colorOpacity(SL.Signal.action, 0.12), display: "grid", placeItems: "center", flexShrink: 0 }}>
            <SLGlyph name="trendUp" size={16} fixed color={SL.Signal.action} />
          </div>
          <VStack alignment="leading" spacing={1}>
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
              {title}
            </Text>
            {!expanded && first !== undefined && (
              <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1}>
                {`${first.name} ${NumberDisplay.kg(display, first.toKg)}${lifts.length > 1 ? " and more" : ""}`}
              </Text>
            )}
          </VStack>
          <Spacer minLength={0} />
          <SLGlyph
            name="chevronDown"
            size={12}
            color={SL.Ink.tertiary}
            style={{ transform: `rotate(${expanded ? 180 : 0}deg)`, transition: reduceMotion ? "none" : `transform ${spring(0.35, 0.85)}` }}
          />
        </HStack>
      </SLPress>

      {expanded && (
        <VStack spacing={0} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingBottom: SL.Space.s2, alignSelf: "stretch" }}>
          {lifts.map((lift, i) => (
            <div key={`${lift.name}-${i}`} style={{ position: "relative", alignSelf: "stretch" }}>
              <HStack alignment="firstTextBaseline" spacing={SL.Space.s2} style={{ paddingTop: 9, paddingBottom: 9 }}>
                <Text {...slBody()} color={SL.Ink.primary} lineLimit={1} style={{ flex: "1 1 0" }}>
                  {lift.name}
                </Text>
                {lift.fromKg !== undefined && (
                  <>
                    <Text {...slMeta()} numerals color={SL.Ink.tertiary}>
                      {NumberDisplay.kg(display, lift.fromKg)}
                    </Text>
                    <SLGlyph name="arrowRight" size={12} fixed color={SL.Ink.tertiary} />
                  </>
                )}
                <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Signal.action}>
                  {NumberDisplay.kg(display, lift.toKg)}
                </Text>
              </HStack>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
                <SLHairline />
              </div>
            </div>
          ))}
        </VStack>
      )}
    </VStack>
  );
}

// MARK: - The badge in reach

/** The last card: the next badge, what it takes and how far, and the way into the whole collection. */
export function NextBadgeCard({ milestone, unlocks, onOpen }: { milestone: Milestone; unlocks: boolean; onOpen: () => void }) {
  const progressLabel = NextBadgeCard.progressLabel(milestone);
  return (
    <VStack
      alignment="leading"
      spacing={0}
      style={{
        padding: SL.Space.s4,
        background: SL.Surface.raised,
        borderRadius: SL.Radius.xl,
        boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${unlocks ? colorOpacity(SL.Signal.action, 0.35) : SL.Surface.hairline}`,
        alignSelf: "stretch",
      }}
    >
      <SLPress
        onPress={onOpen}
        aria-label={unlocks ? `Finishing today unlocks ${milestone.title}` : `Next badge: ${milestone.title}, ${progressLabel}`}
        style={{ alignSelf: "stretch", textAlign: "left" }}
      >
        <HStack spacing={SL.Space.s3}>
          <SLBadge milestone={milestone} size={44} />
          <VStack alignment="leading" spacing={6} style={{ flex: "1 1 0" }}>
            <HStack alignment="firstTextBaseline" spacing={8} style={{ alignSelf: "stretch" }}>
              <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.85}>
                {milestone.title}
              </Text>
              <Spacer minLength={SL.Space.s2} />
              <Text {...slMeta()} numerals color={SL.Ink.secondary}>
                {progressLabel}
              </Text>
            </HStack>
            <SLBar fraction={Milestone.fraction(milestone)} height={5} fill={SL.Signal.action} style={{ alignSelf: "stretch" }} />
            <Text {...slMeta()} color={SL.Ink.secondary}>
              {unlocks ? "Finish today's workout to win it" : NextBadgeCard.nextStep(milestone)}
            </Text>
          </VStack>
        </HStack>
      </SLPress>
    </VStack>
  );
}

/**
 * What is left, where the title already says the goal: "25 sessions" needs
 * "4 more workouts", not "Log 25 workouts". A rule the title can't carry —
 * weeks in a row, a band to stay in — is still explained.
 */
NextBadgeCard.nextStep = (milestone: Milestone): string => {
  const left = Math.max(0, milestone.target - milestone.current);
  const whole = Math.ceil(left);
  switch (milestone.kind) {
    case "sessions":
      return whole === 1 ? "1 more workout" : `${whole} more workouts`;
    case "heaviest":
      return `${whole} kg to go, in any working set`;
    case "volume":
      return `${left.toFixed(1)} t to go`;
    case "logging":
      return whole === 1 ? "1 more day of logging" : `${whole} more days of logging`;
    default:
      return milestone.howTo;
  }
};

NextBadgeCard.progressLabel = (milestone: Milestone): string => {
  const current = Math.floor(milestone.current);
  const target = Math.trunc(milestone.target);
  switch (milestone.kind) {
    case "sessions":
    case "streak":
      return `${current}/${target}`;
    case "heaviest":
      return `${current}/${target} kg`;
    case "volume":
      return `${current}/${target} t`;
    default:
      return `${current}/${target}`;
  }
};

/** A badge won today, in its metal: the reward the week-secured card shows. */
export function EarnedBadgeRow({ milestone, next }: { milestone: Milestone; next: Milestone | undefined }) {
  const tierName = (() => {
    switch (milestone.tier) {
      case 0:
        return "BRONZE";
      case 1:
        return "SILVER";
      case 2:
        return "GOLD";
      default:
        return "TOP";
    }
  })();
  return (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", textAlign: "left" }}>
      <SLBadge milestone={milestone} size={64} />
      <VStack alignment="leading" spacing={2}>
        <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={0.8} color={SL.Ink.secondary}>
          {`BADGE EARNED · ${tierName}`}
        </Text>
        <Text size={SL.TypeSize.lead} weight={SL.Weight.bold} color={SL.Ink.primary}>
          {milestone.title}
        </Text>
        {next !== undefined && (
          <Text {...slMeta()} color={SL.Ink.secondary}>
            {`Next: ${next.title}`}
          </Text>
        )}
      </VStack>
      <Spacer minLength={0} />
    </HStack>
  );
}
