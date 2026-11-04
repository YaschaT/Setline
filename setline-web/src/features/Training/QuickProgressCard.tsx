// QuickProgressCard.swift — the last things on Training: one line of
// progress, and the way into every workout. Both read what the account
// logged and nothing else.
import { useMemo } from "react";
import { SL } from "../../design/tokens";
import { HStack, Spacer, Text, VStack } from "../../design/swiftui";
import { Presentation } from "../../design/support";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLPress } from "../../design/components/SLPress";
import { SLHairline, slMeta, slBody, slTitle } from "../../design/components";
import { SLOverline } from "../../design/components/SLPieces";
import { useApp } from "../../data/AppState";
import { addDays } from "../../core/Support/calendar";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Estimates } from "../../core/Engine/Estimates";
import { ProgressOverview, type ProgressOverview_DayProgress_Lift } from "../../core/Progress/ProgressOverview";
import { ExercisePicker } from "../../core/Progress/ExercisePicker";
import { StrengthHeadline } from "../../core/Progress/StrengthHeadline";
import { StrengthProgress } from "../../core/Progress/StrengthProgress";
import { StrengthArea } from "../Progress/ProgressHomeView";
import { HistoriekSegmentView } from "../Progress/HistoriekSegmentView";

// MARK: - Quick progress

interface Pick {
  name: string;
  progress: StrengthProgress;
}

/**
 * One strength story, not the Progress tab: the lift that gained most in the
 * last eight weeks, its estimated max, what it moved, and its line — then at
 * most three numbers, each shown only when there is something to show.
 * "See all" is the Progress tab.
 */
export function QuickProgressCard({ onSeeAll }: { onSeeAll: () => void }) {
  const app = useApp();
  const display = app.display;

  // `.task(id: app.revision) { reload() }`
  const { pick, stats } = useMemo(() => {
    const since = addDays(new Date(), -56);
    const days = ProgressOverview.progressByDay({ in: app.sessions, since });
    // Every lift once, at its latest best.
    const latest = new Map<string, ProgressOverview_DayProgress_Lift>();
    for (const lift of days.flatMap((d) => d.lifts)) {
      const kept = latest.get(lift.exerciseID);
      if (kept !== undefined && kept.date.getTime() >= lift.date.getTime()) continue;
      latest.set(lift.exerciseID, lift);
    }
    const lifts = [...latest.values()];
    // A main lift only, ranked by percent: an estimated max on a machine
    // fly is a number nobody lifts (`StrengthHeadline`).
    const rows = ExercisePicker.rowsSessions({ sessions: app.sessions, favorites: app.favoriteExercises, custom: app.customExercises });
    const picked = StrengthHeadline.pick({ rows, sessions: app.sessions, plan: app.plan });
    const pick: Pick | undefined = picked === undefined ? undefined : { name: picked.name, progress: picked };

    // Training already counts workouts; these are the lift's own numbers.
    const next: { value: string; label: string }[] = [];
    const source = pick?.progress.source;
    if (source !== undefined) {
      next.push({ value: `${NumberDisplay.number(display, source.weightKg)} × ${source.reps}`, label: "best set" });
    }
    const weeks = ProgressOverview.weeklyVolume({ in: app.sessions });
    const week = weeks[weeks.length - 1];
    if (week !== undefined && week.volumeKg > 0) {
      next.push({ value: `${NumberDisplay.number(display, Estimates.round(week.volumeKg / 1000, { toIncrement: 0.1 }))} t`, label: "volume this week" });
    }
    const up = lifts.filter((l) => (l.deltaKg ?? 0) > 0).length;
    if (up > 0) next.push({ value: `${up}`, label: up === 1 ? "lift up · 8 wk" : "lifts up · 8 wk" });
    return { pick, stats: next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.revision, app.sessions]);

  /** " · +4.8 %", or nothing. */
  const percentText = (progress: StrengthProgress): string => {
    const percent = StrengthHeadline.percentChange(progress);
    if (percent === undefined) return "";
    return ` · ${NumberDisplay.signedDelta(display, Estimates.round(percent, { toIncrement: 1 }))} %`;
  };

  const estimate = pick?.progress.estimate;
  const change = pick?.progress.change;
  const shown = pick ? StrengthProgress.shownChange(pick.progress) : undefined;

  const spoken = (() => {
    const parts: string[] = [];
    if (pick !== undefined && estimate !== undefined) {
      parts.push(`${pick.name}, estimated max ${NumberDisplay.kg(display, Estimates.round(estimate, { toIncrement: 0.5 }))}`);
      if (change !== undefined && shown !== undefined && shown !== 0) {
        parts.push(`${NumberDisplay.signedDelta(display, shown)} kilos since ${NumberDisplay.shortDate(display, change.since)}`);
      }
    } else {
      parts.push("No strength trend yet");
    }
    return [...parts, ...stats.map((s) => `${s.value} ${s.label}`)].join(", ");
  })();

  const card = (
    <VStack
      alignment="leading"
      spacing={SL.Space.s4}
      aria-label={spoken}
      style={{
        padding: SL.Space.s4,
        alignSelf: "stretch",
        background: SL.Surface.raised,
        borderRadius: SL.Radius.xl,
        boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairline}`,
        textAlign: "left",
      }}
    >
      {pick !== undefined && estimate !== undefined ? (
        // Beside the numbers at normal sizes.
        <HStack alignment="center" spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
          <VStack alignment="leading" spacing={4} style={{ flex: "0 1 auto", minWidth: 0 }}>
            <Text {...slMeta(SL.Weight.medium)} color={SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
              {pick.name}
            </Text>
            <HStack alignment="firstTextBaseline" spacing={4} style={{ whiteSpace: "nowrap", maxWidth: "100%" }}>
              <Text size={28} weight={SL.Weight.semibold} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.8}>
                {NumberDisplay.number(display, Estimates.round(estimate, { toIncrement: 0.5 }))}
              </Text>
              <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8}>
                kg est. 1RM
              </Text>
            </HStack>
            {change !== undefined && shown !== undefined && shown !== 0 && (
              // The pill holds the gain; the date sits beside it.
              <HStack spacing={6} style={{ maxWidth: "100%" }}>
                <Text
                  size={SL.TypeSize.micro}
                  weight={SL.Weight.semibold}
                  numerals
                  color={shown > 0 ? SL.Signal.action : SL.Ink.secondary}
                  lineLimit={1}
                  minimumScaleFactor={0.75}
                  style={{
                    paddingLeft: SL.Space.s2,
                    paddingRight: SL.Space.s2,
                    paddingTop: 4,
                    paddingBottom: 4,
                    borderRadius: SL.Radius.pill,
                    background: shown > 0 ? SL.Signal.actionTint : SL.Surface.raised2,
                    flexShrink: 0,
                  }}
                >
                  {`${NumberDisplay.signedDelta(display, shown)} kg${percentText(pick.progress)}`}
                </Text>
                <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.75}>
                  {`since ${NumberDisplay.shortDate(display, change.since)}`}
                </Text>
              </HStack>
            )}
          </VStack>
          <Spacer minLength={0} />
          {pick.progress.points.length > 1 && (
            <div aria-hidden style={{ flex: "0 1 128px", minWidth: 88, maxWidth: 128, height: 64 }}>
              <StrengthArea
                values={pick.progress.points.map((p) => p.estimate)}
                dates={pick.progress.points.map((p) => p.date)}
                ink={SL.Signal.action}
              />
            </div>
          )}
        </HStack>
      ) : (
        <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <SLGlyph name="trendUp" size={16} fixed color={SL.Ink.secondary} />
          </div>
          <Text {...slMeta()} color={SL.Ink.secondary}>
            Log a lift in two sessions and its trend shows here.
          </Text>
          <Spacer minLength={0} />
        </HStack>
      )}
      {stats.length > 0 && (
        <>
          <SLHairline />
          <HStack alignment="top" spacing={0} style={{ alignSelf: "stretch" }}>
            {stats.map((stat, i) => (
              <VStack key={i} alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
                <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.8} style={{ maxWidth: "100%" }}>
                  {stat.value}
                </Text>
                <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
                  {stat.label}
                </Text>
              </VStack>
            ))}
          </HStack>
        </>
      )}
    </VStack>
  );

  return (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <HStack alignment="firstTextBaseline" style={{ paddingLeft: SL.Space.s1, alignSelf: "stretch" }}>
        <SLOverline text="Quick progress" />
        <Spacer />
        <SLPlainLink title="See all" onPress={onSeeAll} />
      </HStack>
      <SLPress scale={0.98} onPress={onSeeAll} style={{ alignSelf: "stretch" }}>
        {card}
      </SLPress>
    </VStack>
  );
}

/** "See all ›" — a plain button: 13/600 and a chevron in the secondary ink, a 44 target. */
export function SLPlainLink({ title, onPress, "aria-label": label }: { title: string; onPress: () => void; "aria-label"?: string }) {
  return (
    <button
      type="button"
      className="sl-pressable"
      onClick={onPress}
      aria-label={label}
      style={{ display: "flex", alignItems: "center", gap: 4, minHeight: SL.Space.hitMin, color: SL.Ink.secondary, background: "transparent", flexShrink: 0 }}
    >
      <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>
        {title}
      </Text>
      <SLGlyph name="chevronRight" size={12} />
    </button>
  );
}

// MARK: - Every workout

/**
 * The log, reached from Training's All workouts row: the same list Progress
 * opens, in a sheet so Training stays where it was.
 */
export function HistorySheet({ onClose }: { onClose: () => void }) {
  return (
    <VStack alignment="leading" spacing={0} style={{ flex: "1 1 0", minHeight: 0, alignSelf: "stretch", background: SL.Surface.ground, justifyContent: "flex-start" }}>
      <Presentation detents={["large"]} background={SL.Surface.ground} />
      <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s4, paddingBottom: SL.Space.s2, alignSelf: "stretch" }}>
        <Text as="h2" {...slTitle()} color={SL.Ink.primary} style={{ flex: "1 1 0" }}>
          All workouts
        </Text>
        <button
          type="button"
          className="sl-pressable"
          onClick={onClose}
          aria-label="Close"
          style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", color: SL.Ink.primary, flexShrink: 0 }}
        >
          <SLGlyph name="close" size={16} fixed />
        </button>
      </HStack>
      <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column", alignSelf: "stretch" }}>
        <HistoriekSegmentView />
      </div>
    </VStack>
  );
}
