// ProgressHomeView.swift — Redesign 1d · Progressie.
//
// The tab opens on an overview, training first: how each kind of training
// day (Push, Pull, Legs, Upper, Lower) moved over the last eight weeks — each
// opening onto its lifts' best sets — the tonnage of the last seven weeks, and last, body
// weight as one compact card whose chart opens on request. All of it is read
// from what the account logged.
//
// Behind the overview sit the three subjects the app has always had, one at a
// time with the whole screen to itself: strength per exercise, every
// weigh-in, and every session. Each part of the overview leads to the one it
// summarises.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { SL, slListCard } from "../../design/tokens";
import { HStack, Pressable, ScrollView, Sheet, Spacer, Text, VStack, useAppStorage } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { colorOpacity, spring } from "../../design/SetlineTokens";
import { useReduceMotion } from "../../design/support";
import { SLGlyph, SLWorkoutSymbol } from "../../design/components/SLGlyph";
import { SLPress } from "../../design/components/SLPress";
import { SLMedal } from "../../design/components/SLMedal";
import { SLBadge } from "../../design/components/SLBadge";
import { MuscleFigure } from "../../design/components/MuscleFigure";
import { SLHairline, slBody, slHitTarget, slLead, slMeta, slTitle } from "../../design/components/SLText";
import { SLRowButton, SLTabHeader, SLTabHeaderPinned } from "../../design/components/SLPieces";
import { slLineHeight } from "../../design/SLDynamicType";
import { useApp } from "../../data/AppState";
import { BodyProgress } from "../../core/Progress/BodyProgress";
import {
  ProgressOverview,
  ProgressOverview_WeightPoint,
  type ProgressOverview_DayProgress,
  type ProgressOverview_DayProgress_Lift,
  type ProgressOverview_WeekVolume,
} from "../../core/Progress/ProgressOverview";
import { StrengthHeadline } from "../../core/Progress/StrengthHeadline";
import { StrengthProgress } from "../../core/Progress/StrengthProgress";
import { ExercisePicker, ExercisePicker_Row } from "../../core/Progress/ExercisePicker";
import { Estimates } from "../../core/Engine/Estimates";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Schedule } from "../../core/Engine/Schedule";
import { RecordsEngine } from "../../core/Engine/RecordsEngine";
import { Medals, LiftMedal_Place, type LiftMedal } from "../../core/Progress/Medals";
import { Milestones, type Milestone, type Milestone_Kind } from "../../core/Progress/Milestones";
import { TrainingStreak } from "../../core/Progress/TrainingStreak";
import { GoalBand, GoalCheck, WeightGoal } from "../../core/Progress/WeightGoal";
import { ExerciseCatalog } from "../../core/Catalog/ExerciseCatalog";
import { NutritionHistory } from "../../core/Nutrition/NutritionHistory";
import { Exercise, type TrainingSession } from "../../core/Domain/Model";
import { addDays, addingTimeInterval, startOfDay } from "../../core/Support/calendar";
import { dayComponent } from "../../core/Support/engine";
import { compare, dec, maxBy, rounded } from "../../core/Support/swift";
import { GoalCheckCard, GoalCheckExt, GoalPreference, GoalSheet, GoalSymbol, NutritionReminders } from "./GoalViews";
import { ExercisePickerSheet } from "./ExercisePickerSheet";
import { WeighInSheet } from "./WeighInSheet";
import { StrengthSegmentView } from "./StrengthSegmentView";
import { HistoriekSegmentView } from "./HistoriekSegmentView";
import { LichaamSegmentView } from "./LichaamSegmentView";

/** `ProgressHomeView.Segment`. */
export type ProgressHomeView_Segment = "Strength" | "Body" | "Log" | "Lifts" | "Volume";
export const ProgressHomeView_Segment = {
  kracht: "Strength" as ProgressHomeView_Segment,
  lichaam: "Body" as ProgressHomeView_Segment,
  historiek: "Log" as ProgressHomeView_Segment,
  lifts: "Lifts" as ProgressHomeView_Segment,
  volume: "Volume" as ProgressHomeView_Segment,
  allCases: ["Strength", "Body", "Log", "Lifts", "Volume"] as ProgressHomeView_Segment[],
};

/** `ProgressHomeView.WeightRange`. */
export type ProgressHomeView_WeightRange = 7 | 30 | 90;
export const ProgressHomeView_WeightRange = {
  week: 7 as ProgressHomeView_WeightRange,
  month: 30 as ProgressHomeView_WeightRange,
  quarter: 90 as ProgressHomeView_WeightRange,
  allCases: [7, 30, 90] as ProgressHomeView_WeightRange[],
  label(self: ProgressHomeView_WeightRange): string {
    return `${self}D`;
  },
};

/** "Laatste 8 weken". */
const bestWindowDays = 56;

/** One thing earned this week: a lift's medal, a new badge, or the week itself secured. */
type Win = { kind: "medal"; value: LiftMedal } | { kind: "badge"; value: Milestone } | { kind: "streak"; value: TrainingStreak };
const winID = (win: Win): string =>
  win.kind === "medal" ? `medal-${win.value.exerciseID}` : win.kind === "badge" ? `badge-${win.value.id}` : "streak";

/** `GeometryReader`: the size its box is given, measured once on screen and on every resize. */
export function useGeometry<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const r = element.getBoundingClientRect();
      setSize((s) => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/** Flips to true on the frame after the view appears: `.onAppear { drawn = true }`. */
function useAppeared(): boolean {
  const [appeared, setAppeared] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAppeared(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return appeared;
}

/**
 * `ScrollView(.horizontal, showsIndicators: false)` pulled out to the screen
 * edge by `inset` with `.contentMargins(.horizontal, inset)`.
 */
function EdgeScrollRow({ inset, spacing, children }: { inset: number; spacing: number; children?: ReactNode }) {
  return (
    <div className="sl-scroll" style={{ marginLeft: -inset, marginRight: -inset, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", alignSelf: "stretch" }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: spacing, paddingLeft: inset, paddingRight: inset, width: "max-content" }}>{children}</div>
    </div>
  );
}

interface ProgressData {
  bodyProgress: BodyProgress;
  trend: ProgressOverview_WeightPoint[];
  volume: ProgressOverview_WeekVolume[];
  days: ProgressOverview_DayProgress[];
  weekWins: Win[];
  exerciseRows: ExercisePicker_Row[];
  estimable: ExercisePicker_Row[];
  strengthID: string | undefined;
  strength: StrengthProgress | undefined;
}

export function ProgressHomeView({ onAccount = () => {} }: { onAccount?: () => void }) {
  const app = useApp();
  const display = app.display;

  /** The subject that is open. `undefined` is the overview. */
  const [segment, setSegment] = useState<ProgressHomeView_Segment | undefined>(undefined);
  /** The exercise Kracht opens on, when a best-set row led there. */
  const [openingExercise, setOpeningExercise] = useState<string | undefined>(undefined);
  const [weighing, setWeighing] = useState(false);
  const [choosingGoal, setChoosingGoal] = useState(false);
  const [goal, setGoal] = useState<WeightGoal | undefined>(() => GoalPreference.goal);
  const [choosingExercise, setChoosingExercise] = useState(false);
  /** The weight chart's span, remembered on this phone. */
  const [weightRange, setWeightRange] = useAppStorage<number>("setline.progress.weightRange", ProgressHomeView_WeightRange.month);

  /** The comparable series the account has for the lift on screen. */
  const strengthFor = (id: string | undefined, rows: ExercisePicker_Row[]): StrengthProgress | undefined => {
    const row = id === undefined ? undefined : rows.find((r) => r.exerciseID === id);
    if (id === undefined || row === undefined) return undefined;
    return StrengthHeadline.progress({ exerciseID: id, name: row.name, sessions: app.sessions, plan: app.plan });
  };

  /** Worked out once per change of the log, not on every redraw. */
  const computeWeekWins = (): Win[] => {
    const weekStart = Schedule.mondayFirstWeek({ containing: new Date() })[0] ?? new Date();
    const thisWeek = app.sessions.filter((s) => s.kind === "workout" && s.date.getTime() >= weekStart.getTime());
    const best = new Map<string, LiftMedal>();
    for (const session of thisWeek) {
      for (const medal of Medals.medals({ for: session, in: app.sessions })) {
        const kept = best.get(medal.exerciseID);
        if (kept !== undefined && kept.place <= medal.place) continue;
        best.set(medal.exerciseID, medal);
      }
    }
    const medals = [...best.values()].sort((a, b) => compare([a.place, a.name], [b.place, b.name]));
    const streak = app.streak;
    const badges = Milestones.reached({ in: Milestones.make({ sessions: app.sessions, bestStreak: streak.best }), since: weekStart });
    // Two steps of one ladder reached in the same week are one piece of news: the higher.
    const topBadge = new Map<Milestone_Kind, Milestone>();
    for (const badge of badges) {
      if (badge.tier >= (topBadge.get(badge.kind)?.tier ?? -1)) topBadge.set(badge.kind, badge);
    }
    const wins: Win[] = [...topBadge.values()].sort((a, b) => b.tier - a.tier).map((value) => ({ kind: "badge" as const, value }));
    wins.push(...medals.filter((m) => m.place === LiftMedal_Place.gold).map((value) => ({ kind: "medal" as const, value })));
    if (TrainingStreak.thisWeekMet(streak)) wins.push({ kind: "streak", value: streak });
    wins.push(...medals.filter((m) => m.place !== LiftMedal_Place.gold).map((value) => ({ kind: "medal" as const, value })));
    return wins;
  };

  const reload = (currentID: string | undefined): ProgressData => {
    const bodyProgress = BodyProgress.make({ metrics: app.metrics });
    const trend = ProgressOverview.weightTrend(bodyProgress);
    const since = addDays(new Date(), -bestWindowDays);
    // The headline percent speaks for the main lifts, as Quick progress does.
    const days = ProgressOverview.progressByDay({
      in: app.sessions,
      since,
      counts: (id) => StrengthHeadline.isMainLift(id, { plan: app.plan }),
    });
    const volume = ProgressOverview.weeklyVolume({ in: app.sessions });
    const weekWins = computeWeekWins();
    const exerciseRows = ExercisePicker.rowsSessions({ sessions: app.sessions, favorites: app.favoriteExercises });
    const estimable = ExercisePicker.recent({ in: exerciseRows, limit: 16 })
      .filter((row) => StrengthHeadline.progress({ exerciseID: row.exerciseID, name: row.name, sessions: app.sessions, plan: app.plan }).estimate !== undefined)
      .slice(0, 8);
    let strengthID = currentID;
    if (strengthID === undefined || !exerciseRows.some((r) => r.exerciseID === strengthID && ExercisePicker_Row.hasHistory(r))) {
      // The main lift that moved most — the same one Training leads
      // with — so the page opens on a gain, not on a dip.
      strengthID =
        StrengthHeadline.pick({ rows: exerciseRows, sessions: app.sessions, plan: app.plan })?.exerciseID ??
        estimable[0]?.exerciseID ??
        ExercisePicker.recent({ in: exerciseRows, limit: 1 })[0]?.exerciseID;
    }
    // The lift the page opens on leads the chips, so its lit chip is in
    // view; the order then holds while chips are tapped.
    const index = strengthID === undefined ? -1 : estimable.findIndex((r) => r.exerciseID === strengthID);
    if (index >= 0) estimable.unshift(...estimable.splice(index, 1));
    return { bodyProgress, trend, volume, days, weekWins, exerciseRows, estimable, strengthID, strength: strengthFor(strengthID, exerciseRows) };
  };

  const [data, setData] = useState<ProgressData>(() => reload(undefined));
  const { bodyProgress, trend, volume, days, weekWins, exerciseRows, estimable, strengthID, strength } = data;
  useEffect(() => {
    setData((d) => reload(d.strengthID));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.revision]);

  const selectStrength = (id: string) => setData((d) => ({ ...d, strengthID: id, strength: strengthFor(id, d.exerciseRows) }));

  /** The chips: what was trained lately, newest first, and the lift on screen even when it came from the selector. */
  const recentExercises = (() => {
    const recent = [...estimable];
    const row = strengthID === undefined ? undefined : exerciseRows.find((r) => r.exerciseID === strengthID);
    if (strengthID !== undefined && !recent.some((r) => r.exerciseID === strengthID) && row !== undefined) recent.unshift(row);
    return recent;
  })();

  const open = (target: ProgressHomeView_Segment, exercise?: string) => {
    setOpeningExercise(exercise);
    setSegment(target);
  };

  // MARK: - Shared pieces

  /** A section's name with its one way further, on the right — the App Store's and Health's "See All". */
  const sectionHead = (title: string, action?: string, perform: () => void = () => {}) => (
    <HStack alignment="firstTextBaseline" style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1, alignSelf: "stretch" }}>
      <Text as="h2" size={SL.TypeSize.title} weight={SL.Weight.semibold} color={SL.Ink.primary}>
        {title}
      </Text>
      <Spacer minLength={SL.Space.s2} />
      {action !== undefined && (
        <Pressable onPress={perform} style={{ background: "transparent", padding: 0, color: SL.Ink.secondary }}>
          <HStack spacing={2} style={{ ...slHitTarget(), color: SL.Ink.secondary }}>
            <Text {...slBody()} color={SL.Ink.secondary}>
              {action}
            </Text>
            <SLGlyph name="chevronRight" size={12} />
          </HStack>
        </Pressable>
      )}
    </HStack>
  );

  /**
   * The main lift that gained most, by percent of where it started — the
   * rule Quick progress and Strength use (`StrengthHeadline`), so a heavy
   * machine or an isolation lift never takes the headline.
   */
  const mainGainer = (lifts: ProgressOverview_DayProgress_Lift[]): ProgressOverview_DayProgress_Lift | undefined => {
    const percent = (lift: ProgressOverview_DayProgress_Lift): number => {
      const delta = lift.deltaKg;
      if (delta === undefined || !(delta > 0)) return 0;
      const estimate = Estimates.e1RM({ weightKg: lift.weightKg, reps: lift.reps });
      if (estimate === undefined || !(estimate > delta)) return 0;
      return delta / (estimate - delta);
    };
    return maxBy(
      lifts.filter((l) => (l.deltaKg ?? 0) > 0 && StrengthHeadline.isMainLift(l.exerciseID, { plan: app.plan })),
      (a, b) => compare([percent(a), a.name], [percent(b), b.name]) < 0,
    );
  };

  /** Every lift once, its latest best, biggest gain first. */
  const allLifts = (): ProgressOverview_DayProgress_Lift[] => {
    const seen = new Map<string, ProgressOverview_DayProgress_Lift>();
    for (const lift of days.flatMap((d) => d.lifts)) {
      const kept = seen.get(lift.exerciseID);
      if (kept !== undefined && kept.date.getTime() >= lift.date.getTime()) continue;
      seen.set(lift.exerciseID, lift);
    }
    return [...seen.values()].sort((a, b) => {
      const da = a.deltaKg ?? -999;
      const db = b.deltaKg ?? -999;
      if (da !== db) return da > db ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  };

  const changeInk = (change: number | undefined): string => {
    if (change === undefined) return SL.Ink.secondary;
    return change > 0 ? SL.Signal.action : change < 0 ? SL.Signal.loss : SL.Ink.secondary;
  };

  /** "+7 %", "Steady", or nothing while too early. */
  const changeText = (change: number | undefined): string | undefined =>
    change === undefined ? undefined : change === 0 ? "Steady" : `${NumberDisplay.signedDelta(display, change)} %`;

  const muscleChip = (exerciseID: string, lit: boolean, size = 40) => {
    const exercise = ExerciseCatalog.exercise(exerciseID);
    return (
      <div
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          padding: size * 0.09,
          boxSizing: "border-box",
          borderRadius: size * 0.3,
          background: lit ? SL.Signal.actionTint : SL.Surface.raised2,
          display: "grid",
          placeItems: "center",
        }}
      >
        <MuscleFigure
          group={exercise === undefined ? undefined : Exercise.group(exercise)}
          highlight={lit ? SL.Signal.action : SL.Ink.primary}
          outline={colorOpacity(SL.Ink.secondary, 0.8)}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    );
  };

  // MARK: - Overview

  /** "Last: Push · Mon 5 Oct" */
  const logLine = (workouts: TrainingSession[]): string => {
    const latest = workouts[0];
    if (latest === undefined) return "Your logged sessions show up here";
    return `Last: ${latest.dayLabel} · ${Schedule.weekdayLabel(latest.date)} ${NumberDisplay.shortDate(display, latest.date)}`;
  };

  /** Every logged workout, as a card right under the highlight: how many there are and the latest one. */
  const logCard = () => {
    const workouts = app.sessions.filter((s) => s.kind === "workout").sort((a, b) => b.date.getTime() - a.date.getTime());
    const latest = workouts[0];
    return (
      <div style={{ ...slListCard(), alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
        <SLRowButton onPress={() => open(ProgressHomeView_Segment.historiek)} aria-label={`All workouts, ${workouts.length}. ${logLine(workouts)}`}>
          <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 68, color: SL.Ink.primary }}>
            <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, background: SL.Signal.actionTint, display: "grid", placeItems: "center" }}>
              {latest !== undefined ? <SLWorkoutSymbol dayName={latest.dayLabel} size={20} /> : <SLGlyph name="list" size={20} color={SL.Signal.action} />}
            </div>
            <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
              <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
                All workouts
              </Text>
              <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
                {logLine(workouts)}
              </Text>
            </VStack>
            <Spacer minLength={SL.Space.s2} />
            <Text {...slLead(SL.Weight.semibold)} numerals color={SL.Ink.primary}>
              {`${workouts.length}`}
            </Text>
            <SLGlyph name="chevronRight" size={14} color={SL.Ink.tertiary} />
          </HStack>
        </SLRowButton>
      </div>
    );
  };

  // MARK: - Strength by exercise

  const exerciseChips = () => (
    <EdgeScrollRow inset={SL.Space.gutterSession} spacing={SL.Space.s2}>
      {recentExercises.map((row) => {
        const on = row.exerciseID === strengthID;
        return (
          <Pressable
            key={row.exerciseID}
            onPress={() => selectStrength(row.exerciseID)}
            aria-label={row.name}
            style={{ background: "transparent", padding: 0, minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            <span
              aria-pressed={on}
              style={{
                display: "flex",
                alignItems: "center",
                height: 34,
                paddingLeft: SL.Space.s3,
                paddingRight: SL.Space.s3,
                borderRadius: SL.Radius.pill,
                background: on ? SL.Signal.action : SL.Surface.raised,
                boxShadow: on ? "none" : `inset 0 0 0 1px ${SL.Surface.hairline}`,
              }}
            >
              <Text size={SL.TypeSize.meta} weight={on ? SL.Weight.semibold : SL.Weight.medium} color={on ? SL.Signal.onAction : SL.Ink.primary} lineLimit={1}>
                {row.name}
              </Text>
            </span>
          </Pressable>
        );
      })}
    </EdgeScrollRow>
  );

  const strengthSpoken = (progress: StrengthProgress): string => {
    if (progress.estimate === undefined) return `${progress.name}, no estimate yet`;
    let text = `${progress.name}, estimated max ${NumberDisplay.kg(display, Estimates.round(progress.estimate, { toIncrement: 0.5 }))}`;
    const shown = StrengthProgress.shownChange(progress);
    if (progress.change !== undefined && shown !== undefined) {
      text += `, ${NumberDisplay.signedDelta(display, shown)} kilos since ${NumberDisplay.shortDate(display, progress.change.since)}`;
    }
    return text;
  };

  const strengthCard = () => {
    const progress = strength;
    if (progress === undefined) return null;
    const shown = StrengthProgress.shownChange(progress);
    const change = progress.change;
    return (
      <SLPress scale={0.98} onPress={() => open(ProgressHomeView_Segment.kracht, progress.exerciseID)} aria-label={strengthSpoken(progress)} style={{ alignSelf: "stretch", textAlign: "left" }}>
        <VStack alignment="leading" spacing={SL.Space.s3} style={{ padding: SL.Space.s5, ...slListCard({ radius: SL.Radius.xl }) }}>
          <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} tracking={1.2} color={SL.Ink.secondary}>
            ESTIMATED 1RM
          </Text>
          {progress.estimate !== undefined ? (
            <>
              <HStack alignment="firstTextBaseline" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
                <Text size={34} weight={SL.Weight.semibold} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.7}>
                  {NumberDisplay.kg(display, Estimates.round(progress.estimate, { toIncrement: 0.5 }))}
                </Text>
                <Spacer minLength={SL.Space.s2} />
                {change !== undefined && shown !== undefined && (
                  <span
                    style={{
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                      paddingLeft: SL.Space.s3,
                      paddingRight: SL.Space.s3,
                      paddingTop: 5,
                      paddingBottom: 5,
                      borderRadius: SL.Radius.pill,
                      background: shown > 0 ? SL.Signal.actionTint : SL.Surface.raised2,
                    }}
                  >
                    <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals color={shown > 0 ? SL.Signal.action : SL.Ink.secondary}>
                      {shown === 0
                        ? `Steady since ${NumberDisplay.shortDate(display, change.since)}`
                        : `${NumberDisplay.signedDelta(display, shown)} kg since ${NumberDisplay.shortDate(display, change.since)}`}
                    </Text>
                  </span>
                )}
              </HStack>
              {progress.points.length > 1 ? (
                <>
                  <div aria-hidden style={{ height: 96, alignSelf: "stretch" }}>
                    <StrengthArea key={progress.exerciseID} values={progress.points.map((p) => p.estimate)} dates={progress.points.map((p) => p.date)} ink={SL.Signal.action} />
                  </div>
                  <HStack aria-hidden style={{ alignSelf: "stretch" }}>
                    <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} numerals color={SL.Ink.secondary}>
                      {progress.points.length > 0 ? NumberDisplay.shortDate(display, progress.points[0].date) : ""}
                    </Text>
                    <Spacer />
                    <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} numerals color={SL.Ink.secondary}>
                      {progress.points.length > 0 ? NumberDisplay.shortDate(display, progress.points[progress.points.length - 1].date) : ""}
                    </Text>
                  </HStack>
                </>
              ) : (
                <Text {...slMeta()} color={SL.Ink.secondary}>
                  {`One more session of ${progress.name} and its line appears.`}
                </Text>
              )}
              {progress.source !== undefined && (
                <Text {...slMeta()} numerals color={SL.Ink.secondary}>
                  {`From ${NumberDisplay.kg(display, progress.source.weightKg)} × ${progress.source.reps} on ${NumberDisplay.shortDate(display, progress.source.date)}`}
                </Text>
              )}
            </>
          ) : (
            <Text {...slBody()} color={SL.Ink.secondary}>
              {progress.rows.length === 0 ? `${progress.name} has no full-range sets to compare yet.` : "Above 10 reps, SETLINE makes no estimate."}
            </Text>
          )}
        </VStack>
      </SLPress>
    );
  };

  // MARK: - Volume

  /** "9.4 t" */
  const tonnes = (kg: number): string => `${NumberDisplay.number(display, Estimates.round(kg / 1000, { toIncrement: 0.1 }))} t`;

  /** What last week had lifted by this same moment of its week. */
  const volumeLastWeekByNow = (): number => {
    const first = Schedule.mondayFirstWeek({ containing: new Date() })[0];
    const weekStart = first !== undefined ? startOfDay(first) : new Date();
    const lastWeekStart = addingTimeInterval(weekStart, -7 * 86_400);
    const sameMoment = addingTimeInterval(new Date(), -7 * 86_400);
    return app.sessions
      .filter((s) => s.kind === "workout" && s.date.getTime() >= lastWeekStart.getTime() && s.date.getTime() <= sameMoment.getTime())
      .reduce((total, s) => dec(total + RecordsEngine.volumeLoad(s.results.flatMap((r) => r.sets))), 0);
  };

  /** "week 35: 4,2 ton, week 36: 0 ton, …" */
  const volumeSpoken = volume.map((week) => `week ${week.number}: ${NumberDisplay.number(display, Estimates.round(week.volumeKg / 1000, { toIncrement: 0.1 }))} ton`).join(", ");

  /** The work behind the lifts, as one line under them; the bars are a tap away. */
  const volumeLine = () => {
    const current = volume[volume.length - 1];
    if (current === undefined) return null;
    const byNow = volumeLastWeekByNow();
    return (
      <SLPress
        scale={0.98}
        onPress={() => open(ProgressHomeView_Segment.volume)}
        aria-label={`Volume this week ${tonnes(current.volumeKg)}, ${tonnes(byNow)} by this point last week`}
        style={{ alignSelf: "stretch", textAlign: "left" }}
      >
        <HStack spacing={SL.Space.s3} style={{ padding: SL.Space.s3, ...slListCard() }}>
          <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: SL.Radius.md, background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
            <SFSymbol name="chart.bar.fill" size={15} weight={600} color={SL.Ink.secondary} />
          </div>
          <VStack alignment="leading" spacing={1} style={{ minWidth: 0, flex: "0 1 auto" }}>
            <Text {...slMeta()} color={SL.Ink.secondary}>
              Volume this week
            </Text>
            {/* Against last week at this same point, not its whole total. */}
            <HStack alignment="firstTextBaseline" spacing={SL.Space.s2} style={{ maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden" }}>
              {current.volumeKg > 0 || byNow > 0 ? (
                <>
                  <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.8} style={{ flexShrink: 0 }}>
                    {tonnes(current.volumeKg)}
                  </Text>
                  <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8}>
                    {`${tonnes(byNow)} by now last week`}
                  </Text>
                </>
              ) : (
                <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8}>
                  Starts with this week's first workout
                </Text>
              )}
            </HStack>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
          <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
        </HStack>
      </SLPress>
    );
  };

  /** One lift at a time: chips for what was trained lately, its estimated max, what that moved, and its line. */
  const strengthSection = () => (
    <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      {sectionHead("Strength", exerciseRows.some((r) => ExercisePicker_Row.hasHistory(r)) ? "See all" : undefined, () => setChoosingExercise(true))}
      {recentExercises.length === 0 ? (
        <div style={{ padding: SL.Space.s5, alignSelf: "stretch", ...slListCard({ radius: SL.Radius.xl }) }}>
          <Text {...slBody()} color={SL.Ink.secondary}>
            Log a workout and each lift's strength shows here.
          </Text>
        </div>
      ) : (
        <>
          {exerciseChips()}
          {strengthCard()}
          {volumeLine()}
        </>
      )}
    </VStack>
  );

  // MARK: - Body weight

  /** The weigh-ins inside the chosen span, oldest first, plotted as they were weighed. */
  const windowed: ProgressOverview_WeightPoint[] = (() => {
    const start = addingTimeInterval(startOfDay(new Date()), -(weightRange - 1) * 86_400);
    return trend
      .filter((p) => p.date.getTime() >= start.getTime())
      .map((p) => ProgressOverview_WeightPoint.make({ date: p.date, weightKg: p.weightKg, average: p.weightKg }));
  })();

  /** "−0,4 kg", "+0,3 kg", "0 kg". */
  const signed = (value: number): string => (value === 0 ? "0 kg" : `${NumberDisplay.signedDelta(display, value)} kg`);

  /** How the weight moved inside the chosen span, first to last weigh-in. */
  const movement: { value: string; label: string; moved: boolean } | undefined = (() => {
    const first = windowed[0];
    const last = windowed[windowed.length - 1];
    if (first === undefined || last === undefined || windowed.length < 2) return undefined;
    const change = Estimates.round(dec(last.weightKg - first.weightKg), { toIncrement: 0.1 });
    return { value: signed(change), label: `in ${weightRange} days`, moved: change !== 0 };
  })();

  /** "Today", "Yesterday", "5 days ago". */
  const lastWeighed = (() => {
    const latest = BodyProgress.latest(bodyProgress);
    if (latest === undefined) return "";
    const n = dayComponent(startOfDay(latest.date), startOfDay(new Date()));
    if (n < 1) return "Weighed today";
    if (n === 1) return "Weighed yesterday";
    return `Weighed ${n} days ago`;
  })();

  /** "+1.1 kg in 14 days", or how to start. */
  const movementLine =
    movement !== undefined
      ? `${movement.value} ${movement.label}`
      : bodyProgress.entries.length === 0
        ? "Weigh yourself in the morning, before eating."
        : "One more weigh-in and your trend starts.";

  /** "↗ +1.1 kg · 14 days", in mint; flat when the trend held. */
  const movementPill = (m: { value: string; label: string; moved: boolean }) => {
    const falling = m.value.startsWith("−") || m.value.startsWith("-");
    const ink = m.moved ? SL.Signal.recovery : SL.Ink.secondary;
    return (
      <HStack
        spacing={SL.Space.s1}
        style={{
          color: ink,
          maxWidth: "100%",
          boxSizing: "border-box",
          paddingLeft: SL.Space.s2 + 2,
          paddingRight: SL.Space.s2 + 2,
          paddingTop: 5,
          paddingBottom: 5,
          borderRadius: SL.Radius.pill,
          background: m.moved ? SL.Signal.recoveryTint : SL.Surface.raised2,
        }}
      >
        {m.moved && <SLGlyph name="trendUp" size={13} fixed color={ink} style={{ transform: falling ? "scaleY(-1)" : undefined }} />}
        <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals color={ink} lineLimit={1} minimumScaleFactor={0.7}>
          {`${m.value} · ${m.label.replaceAll("in ", "")}`}
        </Text>
      </HStack>
    );
  };

  const latestEntry = BodyProgress.latest(bodyProgress);
  const weightSpoken =
    (latestEntry !== undefined ? `Body weight ${NumberDisplay.kg(display, latestEntry.weightKg)}` : "No weigh-in yet") +
    (movement !== undefined ? `, ${movement.value} ${movement.label}` : "") +
    (lastWeighed === "" ? "" : `, ${lastWeighed.toLowerCase()}`);

  const weightBody = () => (
    <VStack alignment="leading" spacing={SL.Space.s1}>
      <HStack alignment="firstTextBaseline" spacing={SL.Space.s1} style={{ maxWidth: "100%" }}>
        <Text size={SL.TypeSize.display} weight={SL.Weight.semibold} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.7}>
          {latestEntry !== undefined ? NumberDisplay.number(display, latestEntry.weightKg) : "—"}
        </Text>
        <Text {...slBody()} color={SL.Ink.secondary}>
          kg
        </Text>
      </HStack>
      {movement !== undefined ? (
        <>
          {movementPill(movement)}
          {lastWeighed !== "" && (
            <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1} style={{ paddingTop: 2 }}>
              {lastWeighed}
            </Text>
          )}
        </>
      ) : lastWeighed !== "" ? (
        // The span under the tabs says why there is no change.
        <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1}>
          {lastWeighed}
        </Text>
      ) : (
        <Text {...slMeta()} color={SL.Ink.secondary}>
          {movementLine}
        </Text>
      )}
    </VStack>
  );

  /** Weighing in. A day already weighed offers the correction rather than a second weigh-in. */
  const weighButton = () => {
    const weighed = app.weighIn() !== undefined;
    return (
      <SLPress scale={0.94} onPress={() => setWeighing(true)} aria-label={weighed ? "Edit today's weigh-in" : "Weigh in"} style={{ flexShrink: 0, borderRadius: SL.Radius.pill }}>
        <HStack
          spacing={6}
          style={{
            whiteSpace: "nowrap",
            paddingLeft: SL.Space.s4,
            paddingRight: SL.Space.s4,
            minHeight: SL.Space.hitMin,
            borderRadius: SL.Radius.pill,
            background: SL.Surface.raised2,
            boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairlineStrong}`,
          }}
        >
          <SLGlyph name={weighed ? "calculate" : "plus"} size={14} fixed color={weighed ? SL.Ink.secondary : SL.Signal.recovery} />
          <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} color={SL.Ink.primary} lineLimit={1}>
            {weighed ? "Edit" : "Weigh in"}
          </Text>
        </HStack>
      </SLPress>
    );
  };

  /** 7D · 30D · 90D, as a small segmented control. */
  const rangeTabs = () => (
    <div style={{ position: "relative", alignSelf: "stretch" }}>
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: (SL.Space.hitMin - 36) / 2, height: 36, borderRadius: SL.Radius.pill, background: SL.Surface.raised2 }} />
      <HStack spacing={2} style={{ position: "relative", paddingLeft: 3, paddingRight: 3 }}>
        {ProgressHomeView_WeightRange.allCases.map((range) => {
          const on = weightRange === range;
          return (
            <Pressable
              key={range}
              onPress={() => setWeightRange(range)}
              aria-label={`${range} days`}
              style={{ flex: "1 1 0", minWidth: 0, minHeight: SL.Space.hitMin, background: "transparent", padding: 0, display: "flex", alignItems: "center" }}
            >
              <span
                aria-pressed={on}
                style={{
                  flex: "1 1 0",
                  minHeight: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: SL.Radius.pill,
                  background: on ? SL.Surface.raised : "transparent",
                  transition: "background 0.2s",
                }}
              >
                <Text size={SL.TypeSize.meta} weight={on ? SL.Weight.semibold : SL.Weight.medium} numerals color={on ? SL.Ink.primary : SL.Ink.secondary}>
                  {ProgressHomeView_WeightRange.label(range)}
                </Text>
              </span>
            </Pressable>
          );
        })}
      </HStack>
    </div>
  );

  /** The span's two ends under the chart, and between them the range the line covers. */
  const rangeAxis = () => {
    const weights = windowed.map((p) => p.weightKg);
    const low = weights.length > 0 ? Math.min(...weights) : undefined;
    const high = weights.length > 0 ? Math.max(...weights) : undefined;
    const micro = { size: SL.TypeSize.micro, weight: SL.Weight.regular, numerals: true, color: SL.Ink.secondary } as const;
    return (
      <HStack aria-hidden style={{ alignSelf: "stretch" }}>
        <Text {...micro}>{windowed.length > 0 ? NumberDisplay.shortDate(display, windowed[0].date) : ""}</Text>
        <Spacer />
        {low !== undefined && high !== undefined && (
          <Text {...micro} color={SL.Ink.primary}>
            {low === high ? NumberDisplay.kg(display, low) : `${NumberDisplay.number(display, low)}–${NumberDisplay.number(display, high)} kg`}
          </Text>
        )}
        <Spacer />
        <Text {...micro}>{windowed.length > 0 ? NumberDisplay.shortDate(display, windowed[windowed.length - 1].date) : ""}</Text>
      </HStack>
    );
  };

  /** The goal's band from the day it was set, on the 14-day trend. */
  const goalBand: GoalBand | undefined = (() => {
    const since = GoalPreference.since;
    if (goal === undefined || since === undefined) return undefined;
    return GoalBand.make({ goal, since, trend: trend.map((p) => ({ date: p.date, kg: p.average })) });
  })();

  const goalSpoken = (check: GoalCheck, weeksOnTrack: number): string => {
    const said = check.verdict.kind === "onTrack" ? GoalCheckExt.headline(check) : GoalCheckExt.detail(check, display);
    const weeks = check.verdict.kind === "onTrack" && weeksOnTrack > 0 ? `, ${weeksOnTrack} weeks on track` : "";
    return `${WeightGoal.title(check.goal)}: ${said}${weeks}`;
  };

  /** The goal in one line while there is nothing to act on: "Lean bulk · On track · 🔥 3 wk". */
  const goalLine = (check: GoalCheck, weeksOnTrack: number) => {
    const ink = GoalCheckExt.verdictInk(check);
    return (
      <SLPress scale={0.98} onPress={() => setChoosingGoal(true)} aria-label={goalSpoken(check, weeksOnTrack)} style={{ alignSelf: "stretch", textAlign: "left" }}>
        <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: SL.Space.hitMin, background: SL.Surface.raised2, borderRadius: SL.Radius.md }}>
          <GoalSymbol name={GoalCheckExt.verdictSymbol(check)} size={13} weight={700} color={ink} />
          <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} color={SL.Ink.primary} style={{ flexShrink: 0 }}>
            {WeightGoal.title(check.goal)}
          </Text>
          <Text size={17} color={SL.Ink.tertiary} style={{ flexShrink: 0 }}>
            ·
          </Text>
          <Text size={SL.TypeSize.meta} weight={SL.Weight.medium} color={ink} lineLimit={1}>
            {GoalCheckExt.headline(check)}
          </Text>
          <Spacer minLength={SL.Space.s2} />
          {check.verdict.kind === "onTrack" && weeksOnTrack > 0 && (
            <HStack spacing={3} style={{ color: SL.Signal.action, flexShrink: 0 }}>
              <SLGlyph name="flameFill" size={12} fixed color={SL.Signal.action} />
              <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals color={SL.Signal.action}>
                {`${weeksOnTrack} wk`}
              </Text>
            </HStack>
          )}
          <SLGlyph name="chevronRight" size={11} color={SL.Ink.tertiary} />
        </HStack>
      </SLPress>
    );
  };

  const insightRow = (symbol: string, title: string, value: string) => (
    <HStack key={title} alignment="top" spacing={SL.Space.s3}>
      <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
        <SFSymbol name={symbol} size={12} weight={600} color={SL.Ink.secondary} />
      </div>
      <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
        <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} color={SL.Ink.secondary}>
          {title}
        </Text>
        <Text {...slMeta()} numerals color={SL.Ink.primary}>
          {value}
        </Text>
      </VStack>
    </HStack>
  );

  /** Why the scale moves the way it does: what was eaten against the target, and whether the lifts climb too. */
  const goalInsights = (g: WeightGoal) => {
    const history = app.nutritionHistory();
    const loggedDays = NutritionHistoryLogged(history);
    const average = NutritionHistoryAverage(history);
    let foodLine: string | undefined;
    if (loggedDays >= 3 && average !== undefined) {
      foodLine = `Avg ${NumberDisplay.whole(display, average)} kcal`;
      if (history.calorieTarget !== undefined) foodLine += ` of ${NumberDisplay.whole(display, history.calorieTarget)}`;
      if (history.calorieTarget !== undefined) foodLine += ` · protein hit ${NutritionHistoryProteinHit(history)} of ${loggedDays} days`;
    }
    const lift = mainGainer(allLifts());
    if (foodLine === undefined && lift === undefined) return null;
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        {foodLine !== undefined && insightRow("fork.knife", "Food, last 2 weeks", foodLine)}
        {lift !== undefined &&
          lift.deltaKg !== undefined &&
          insightRow("dumbbell.fill", g === "cut" ? "Strength kept" : "Strength with it", `${lift.name} +${NumberDisplay.number(display, lift.deltaKg)} kg estimated max`)}
      </VStack>
    );
  };

  /** The goal check, or the way to set one. */
  const goalBlock = () => {
    if (goal !== undefined) {
      const weighIns = GoalCheckExt.weighIns(bodyProgress);
      const check = GoalCheck.evaluate({ goal, weighIns, startedAt: GoalPreference.since });
      const weeks = GoalCheckExt.weeksOnTrack({ goal, weighIns });
      return (
        <>
          {!GoalCheckExt.needsAction(check) ? (
            goalLine(check, weeks)
          ) : (
            // Off track says why and what to do, in full.
            <GoalCheckCard check={check} weeksOnTrack={weeks} onChangeGoal={() => setChoosingGoal(true)} />
          )}
          {goalInsights(goal)}
        </>
      );
    }
    return (
      <SLPress scale={0.98} onPress={() => setChoosingGoal(true)} style={{ alignSelf: "stretch", textAlign: "left" }}>
        <HStack spacing={SL.Space.s3} style={{ padding: SL.Space.s3, background: SL.Surface.raised2, borderRadius: SL.Radius.lg }}>
          <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", background: SL.Signal.actionTint, display: "grid", placeItems: "center" }}>
            <SFSymbol name="scope" size={16} weight={600} color={SL.Signal.action} />
          </div>
          <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
              Set a goal
            </Text>
            <Text {...slMeta()} color={SL.Ink.secondary}>
              Cut, lean bulk or bulk — Setline tells you if you're on track
            </Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
          <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
        </HStack>
      </SLPress>
    );
  };

  /**
   * Body weight as a status beside the training: the number large, how the
   * trend moved as a mint pill, the trend itself as one quiet line, and the
   * one action. A weigh-in is not a training win, so nothing here is lime.
   */
  const weightSection = () => (
    <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      {sectionHead("Body weight", "See all", () => open(ProgressHomeView_Segment.lichaam))}
      <VStack alignment="leading" spacing={SL.Space.s4} style={{ alignSelf: "stretch", padding: SL.Space.s5, ...slListCard({ radius: SL.Radius.xl }) }}>
        <HStack alignment="center" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
          <Pressable
            onPress={() => open(ProgressHomeView_Segment.lichaam)}
            disabled={bodyProgress.entries.length === 0}
            aria-label={weightSpoken}
            style={{ background: "transparent", padding: 0, textAlign: "left", minWidth: 0 }}
          >
            {weightBody()}
          </Pressable>
          <Spacer minLength={0} />
          {weighButton()}
        </HStack>
        {bodyProgress.entries.length > 0 && rangeTabs()}
        {windowed.length >= 2 ? (
          <>
            {goalBand !== undefined ? (
              <>
                <div style={{ height: 96, alignSelf: "stretch" }}>
                  <GoalBandChart points={windowed} band={goalBand} />
                </div>
                <HStack spacing={6} style={{ alignSelf: "stretch" }}>
                  <div style={{ width: 14, height: 8, borderRadius: 2, background: colorOpacity(SL.Signal.action, 0.25), flexShrink: 0 }} />
                  <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.secondary}>
                    {`${WeightGoal.title(goalBand.goal)} target`}
                  </Text>
                  <Spacer minLength={0} />
                  <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Signal.recovery}>
                    Your trend
                  </Text>
                </HStack>
              </>
            ) : (
              <div aria-hidden style={{ height: 72, alignSelf: "stretch" }}>
                <WeightTrendLine points={windowed} />
              </div>
            )}
            {rangeAxis()}
          </>
        ) : bodyProgress.entries.length > 0 ? (
          <Text {...slMeta()} color={SL.Ink.secondary}>
            {windowed.length === 0 ? `No weigh-ins in the last ${weightRange} days.` : `One weigh-in in the last ${weightRange} days — one more draws the line.`}
          </Text>
        ) : null}
        {goalBlock()}
      </VStack>
    </VStack>
  );

  // MARK: - Highlight

  /**
   * The screen's one headline, said as a sentence: the training day that
   * moved most, its running best as a full-width line, and the lift that led it.
   */
  const highlight = maxBy(
    days.filter((d) => d.changePercent !== undefined),
    (a, b) => compare([a.changePercent ?? 0, a.sessions], [b.changePercent ?? 0, b.sessions]) < 0,
  );

  /** "You're 7 % stronger on Push days", the number in lime. */
  const headline = (day: ProgressOverview_DayProgress, change: number): ReactNode => {
    if (change > 0) {
      return (
        <>
          <span style={{ color: SL.Ink.primary }}>You're </span>
          <span style={{ color: SL.Signal.action }}>{`${NumberDisplay.number(display, change)} % stronger`}</span>
          <span style={{ color: SL.Ink.primary }}>{` on ${day.label} days`}</span>
        </>
      );
    }
    if (change < 0) {
      return <span style={{ color: SL.Ink.primary }}>{`${day.label} is ${NumberDisplay.number(display, -change)} % below its best — a lighter block shows here too.`}</span>;
    }
    return <span style={{ color: SL.Ink.primary }}>{`Holding steady on ${day.label} days`}</span>;
  };

  const chipFrame = (title: string, detail: string, art: ReactNode) => (
    <HStack
      spacing={SL.Space.s2}
      style={{ paddingLeft: SL.Space.s2, paddingRight: SL.Space.s3, minHeight: SL.Space.hitMin, borderRadius: SL.Radius.pill, background: SL.Surface.raised2, flexShrink: 0 }}
    >
      {art}
      <VStack alignment="leading" spacing={0}>
        <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} color={SL.Ink.primary} lineLimit={1}>
          {title}
        </Text>
        <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} numerals color={SL.Ink.secondary} lineLimit={1}>
          {detail}
        </Text>
      </VStack>
    </HStack>
  );

  const winChip = (win: Win) => {
    switch (win.kind) {
      case "medal": {
        const medal = win.value;
        return (
          <SLPress
            key={winID(win)}
            scale={0.96}
            onPress={() => open(ProgressHomeView_Segment.kracht, medal.exerciseID)}
            aria-label={`${LiftMedal_Place.title(medal.place)} on ${medal.name}, ${NumberDisplay.kg(display, medal.weightKg)} × ${medal.reps}`}
            style={{ flexShrink: 0, borderRadius: SL.Radius.pill }}
          >
            {chipFrame(medal.name, `${NumberDisplay.kg(display, medal.weightKg)} × ${medal.reps}`, <SLMedal place={medal.place} size={26} shines={medal.place === LiftMedal_Place.gold} />)}
          </SLPress>
        );
      }
      case "badge":
        return (
          <div key={winID(win)} role="img" aria-label={`New badge: ${win.value.title}`} style={{ flexShrink: 0 }}>
            {chipFrame(win.value.title, "New badge", <SLBadge milestone={win.value} size={28} />)}
          </div>
        );
      case "streak": {
        const streak = win.value;
        return (
          <div key={winID(win)} role="img" aria-label={`Week secured, ${streak.weeks} week streak`} style={{ flexShrink: 0 }}>
            {chipFrame(
              "Week secured",
              streak.weeks === 1 ? "1-week streak" : `${streak.weeks}-week streak`,
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: SL.Signal.action, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <SLGlyph name="flameFill" size={14} fixed color={SL.Signal.onAction} />
              </div>,
            )}
          </div>
        );
      }
    }
  };

  /** This week's medals as the highlight card's last line. */
  const weekStrip = () => {
    const wins = weekWins;
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <HStack alignment="firstTextBaseline" style={{ alignSelf: "stretch" }}>
          <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} tracking={1.2} color={SL.Ink.secondary}>
            THIS WEEK
          </Text>
          <Spacer minLength={SL.Space.s2} />
          {wins.length > 0 && (
            <Text {...slMeta()} numerals color={SL.Ink.secondary}>
              {wins.length === 1 ? "1 win" : `${wins.length} wins`}
            </Text>
          )}
        </HStack>
        {wins.length === 0 ? (
          <HStack spacing={SL.Space.s3}>
            <HStack aria-hidden spacing={-8} style={{ flexShrink: 0 }}>
              {[LiftMedal_Place.bronze, LiftMedal_Place.silver, LiftMedal_Place.gold].map((place) => (
                <SLMedal key={place} place={place} size={22} style={{ filter: "saturate(0)", opacity: 0.35 }} />
              ))}
            </HStack>
            <Text {...slMeta()} color={SL.Ink.secondary}>
              No medals yet. A lift's best day earns gold.
            </Text>
          </HStack>
        ) : (
          <EdgeScrollRow inset={SL.Space.s5} spacing={SL.Space.s2}>
            {wins.map((win) => winChip(win))}
          </EdgeScrollRow>
        )}
      </VStack>
    );
  };

  const weekAgo = Schedule.dateKey(new Date(Date.now() - 7 * 86_400_000));
  const weightFirst = goal !== undefined || app.metrics.some((metric) => metric.date >= weekAgo);

  const highlightCard = () => {
    const day = highlight;
    const change = day?.changePercent;
    if (day !== undefined && change !== undefined) {
      const gained = change > 0;
      const leader = mainGainer(day.lifts);
      const leaderDelta = leader?.deltaKg;
      return (
        <VStack
          alignment="leading"
          spacing={SL.Space.s4}
          style={{ alignSelf: "stretch", padding: SL.Space.s5, background: SL.Surface.raised, borderRadius: SL.Radius.xl, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}` }}
        >
          <HStack spacing={SL.Space.s2} style={{ color: SL.Ink.secondary }}>
            <SLWorkoutSymbol dayName={day.label} size={14} color={SL.Ink.secondary} />
            <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} tracking={1.2} color={SL.Ink.secondary}>
              {`HIGHLIGHT · ${day.label.toUpperCase()}`}
            </Text>
          </HStack>

          <Text size={26} weight={SL.Weight.semibold} numerals style={slLineHeight(1.15, { size: 26 })}>
            {headline(day, change)}
          </Text>

          {day.strength.length >= 2 && (
            <VStack aria-hidden spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
              <div style={{ height: 88, alignSelf: "stretch" }}>
                <StrengthArea values={day.strength} dates={day.strengthDates} ink={gained ? SL.Signal.action : SL.Ink.primary} />
              </div>
              <HStack style={{ alignSelf: "stretch" }}>
                <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} numerals color={SL.Ink.secondary}>
                  {day.strengthDates.length > 0 ? NumberDisplay.shortDate(display, day.strengthDates[0]) : "First session"}
                </Text>
                <Spacer />
                <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} numerals color={SL.Ink.secondary}>
                  {day.strengthDates.length > 0 ? NumberDisplay.shortDate(display, day.strengthDates[day.strengthDates.length - 1]) : "Latest"}
                </Text>
              </HStack>
            </VStack>
          )}

          {leader !== undefined && leaderDelta !== undefined && (
            <>
              <SLHairline />
              <Pressable
                onPress={() => open(ProgressHomeView_Segment.kracht, leader.exerciseID)}
                aria-label={`Biggest gain: ${leader.name}, plus ${NumberDisplay.number(display, leaderDelta)} kilos estimated`}
                style={{ alignSelf: "stretch", background: "transparent", padding: 0, textAlign: "left" }}
              >
                <HStack spacing={SL.Space.s3}>
                  {muscleChip(leader.exerciseID, true, 36)}
                  <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
                    <Text {...slMeta()} color={SL.Ink.secondary}>
                      Biggest gain
                    </Text>
                    <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary} lineLimit={1} style={{ maxWidth: "100%" }}>
                      {leader.name}
                    </Text>
                  </VStack>
                  <Spacer minLength={SL.Space.s2} />
                  <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Signal.action} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                    {`+${NumberDisplay.number(display, leaderDelta)} kg`}
                  </Text>
                  <SLGlyph name="chevronRight" size={13} color={SL.Ink.tertiary} />
                </HStack>
              </Pressable>
            </>
          )}

          <SLHairline />
          {weekStrip()}
        </VStack>
      );
    }
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch", padding: SL.Space.s5, ...slListCard({ radius: SL.Radius.xl }) }}>
        <Text size={SL.TypeSize.title} weight={SL.Weight.semibold} color={SL.Ink.primary}>
          {days.length === 0 ? "Your progress starts with one workout" : "Two sessions of a day, and your trend appears"}
        </Text>
        <Text {...slBody()} color={SL.Ink.secondary}>
          Save your sets; Setline compares every lift with its own best.
        </Text>
        {days.length > 0 && (
          <>
            <SLHairline style={{ marginTop: SL.Space.s2, marginBottom: SL.Space.s2 }} />
            {weekStrip()}
          </>
        )}
      </VStack>
    );
  };

  const overview = () => (
    <SLTabHeaderPinned header={<SLTabHeader title="Progress" subtitle="Last 8 weeks" onAccount={onAccount} />}>
      <ScrollView style={{ flex: "1 1 0" }}>
        {/* 24 between sections, 8 from a section's head to its card. Four things, most looked-at first. */}
        <VStack
          alignment="leading"
          spacing={SL.Space.s8}
          style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Metric.tabContentTop, paddingBottom: SL.Space.s6 }}
        >
          {/* Most looked-at first. For whoever is watching the scale (a weight goal, or a weigh-in this week) that is the weight; for everyone else the win, then each lift's strength. */}
          {weightFirst ? (
            <>
              {weightSection()}
              {highlightCard()}
              {strengthSection()}
            </>
          ) : (
            <>
              {highlightCard()}
              {strengthSection()}
              {weightSection()}
            </>
          )}
          {logCard()}
        </VStack>
      </ScrollView>
    </SLTabHeaderPinned>
  );

  // MARK: - All lifts

  /** "+5 kg" in lime, a loss in red, "New" in grey. */
  const liftBadge = (lift: ProgressOverview_DayProgress_Lift) => {
    const pill = (text: string, ink: string, fill: string) => (
      <span style={{ flexShrink: 0, whiteSpace: "nowrap", paddingLeft: SL.Space.s2, paddingRight: SL.Space.s2, paddingTop: 4, paddingBottom: 4, borderRadius: SL.Radius.pill, background: fill }}>
        <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} numerals color={ink}>
          {text}
        </Text>
      </span>
    );
    const delta = lift.deltaKg;
    if (delta !== undefined) {
      const ink = delta > 0 ? SL.Signal.action : delta < 0 ? SL.Signal.loss : SL.Ink.secondary;
      return pill(
        delta === 0 ? "±0" : `${NumberDisplay.signedDelta(display, delta)} kg`,
        ink,
        delta > 0 ? SL.Signal.actionTint : delta < 0 ? colorOpacity(SL.Signal.loss, 0.12) : SL.Surface.raised2,
      );
    }
    if (lift.isNew) return pill("New", SL.Ink.secondary, SL.Surface.raised2);
    return null;
  };

  const liftRow = (lift: ProgressOverview_DayProgress_Lift) => (
    <SLRowButton
      onPress={() => open(ProgressHomeView_Segment.kracht, lift.exerciseID)}
      aria-label={
        `${lift.name}, best set ${NumberDisplay.kg(display, lift.weightKg)} × ${lift.reps}` +
        (lift.deltaKg !== undefined ? (lift.deltaKg === 0 ? ", no change" : `, ${NumberDisplay.signedDelta(display, lift.deltaKg)} kilos estimated`) : lift.isNew ? ", new" : "")
      }
    >
      <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 60 }}>
        {muscleChip(lift.exerciseID, (lift.deltaKg ?? 0) > 0, 32)}
        <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary} lineLimit={1} style={{ maxWidth: "100%" }}>
            {lift.name}
          </Text>
          <Text {...slMeta()} numerals color={SL.Ink.secondary}>
            {`${NumberDisplay.kg(display, lift.weightKg)} × ${lift.reps}`}
          </Text>
        </VStack>
        <Spacer minLength={SL.Space.s2} />
        {liftBadge(lift)}
        <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
      </HStack>
    </SLRowButton>
  );

  /** Every lift as one quiet list, grouped by the day that trains it. */
  const allLiftsPage = () => (
    <ScrollView style={{ flex: "1 1 0" }}>
      <VStack alignment="leading" spacing={SL.Space.s6} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s4, paddingBottom: SL.Space.s8 }}>
        {days
          .filter((d) => d.lifts.length > 0)
          .map((day) => {
            const changeLabel = changeText(day.changePercent);
            return (
              <VStack key={day.dayID} alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
                <HStack spacing={SL.Space.s2} role="heading" style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1, alignSelf: "stretch" }}>
                  <SLWorkoutSymbol dayName={day.label} size={14} color={SL.Ink.secondary} />
                  <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>
                    {day.label}
                  </Text>
                  <Spacer minLength={SL.Space.s2} />
                  {changeLabel !== undefined && (
                    <Text {...slMeta(SL.Weight.semibold)} numerals color={changeInk(day.changePercent)}>
                      {changeLabel}
                    </Text>
                  )}
                </HStack>
                <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch", ...slListCard() }}>
                  {day.lifts.map((lift, index) => (
                    <div key={lift.exerciseID} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
                      {liftRow(lift)}
                      {index > 0 && <SLHairline style={{ position: "absolute", top: 0, left: 60, right: 0 }} />}
                    </div>
                  ))}
                </VStack>
              </VStack>
            );
          })}
      </VStack>
    </ScrollView>
  );

  // MARK: - Volume page

  const stat = (label: string, value: string, lead = false) => (
    <VStack key={label} alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
      <Text {...slMeta()} color={SL.Ink.secondary}>
        {label}
      </Text>
      <Text size={lead ? 28 : SL.TypeSize.title} weight={SL.Weight.semibold} numerals color={lead ? SL.Ink.primary : SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.7} style={{ maxWidth: "100%" }}>
        {value}
      </Text>
    </VStack>
  );

  /** Three numbers side by side, as Strava's weekly snapshot. */
  const volumeStats = () => {
    const current = volume[volume.length - 1];
    if (current === undefined) return null;
    const finished = volume.slice(0, -1);
    const previous = finished[finished.length - 1];
    const trained = finished.filter((w) => w.volumeKg > 0);
    const average = trained.length === 0 ? undefined : dec(trained.reduce((s, w) => dec(s + w.volumeKg), 0) / trained.length);
    return (
      <HStack alignment="top" spacing={0} style={{ alignSelf: "stretch" }}>
        {stat("This week", tonnes(current.volumeKg), true)}
        {previous !== undefined && stat("Last week", tonnes(previous.volumeKg))}
        {average !== undefined && stat("Average", tonnes(average))}
      </HStack>
    );
  };

  /** "That's about 2 city buses moved": the tonnage made tangible. */
  const volumeEquivalent = ((): string | undefined => {
    const week = [...volume].reverse().find((w) => w.volumeKg > 0);
    if (week === undefined) return undefined;
    const t = week.volumeKg / 1000;
    const things = [
      { one: "city bus", many: "city buses", tonnes: 12 },
      { one: "elephant", many: "elephants", tonnes: 6 },
      { one: "car", many: "cars", tonnes: 1.5 },
      { one: "grand piano", many: "grand pianos", tonnes: 0.5 },
    ];
    const thing = things.find((x) => t >= x.tonnes);
    if (thing === undefined) return undefined;
    const count = Math.trunc(rounded(t / thing.tonnes));
    const when = week.isCurrent ? "this week" : "last time";
    return count === 1 ? `About one ${thing.one} moved ${when}` : `About ${count} ${thing.many} moved ${when}`;
  })();

  const volumeCard = () => (
    <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      <VStack alignment="leading" spacing={SL.Space.s5} style={{ alignSelf: "stretch", padding: SL.Space.s5, ...slListCard({ radius: SL.Radius.xl }) }}>
        {volumeStats()}
        <VolumeBars weeks={volume} spoken={volumeSpoken} label={tonnes} />
        {volumeEquivalent !== undefined && (
          <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2, background: SL.Surface.raised2, borderRadius: SL.Radius.md }}>
            <SLGlyph name="trendUp" size={14} fixed color={SL.Ink.secondary} />
            <Text {...slMeta()} color={SL.Ink.secondary}>
              {volumeEquivalent}
            </Text>
          </HStack>
        )}
      </VStack>
    </VStack>
  );

  // MARK: - One subject

  const detail = (current: ProgressHomeView_Segment) => (
    <VStack alignment="leading" spacing={0} style={{ flex: "1 1 0", minHeight: 0, alignSelf: "stretch", alignItems: "stretch" }}>
      <div style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s2, display: "flex" }}>
        <Pressable onPress={() => setSegment(undefined)} aria-label="Back to Progress" style={{ background: "transparent", padding: 0, color: SL.Ink.secondary }}>
          <HStack spacing={2} style={{ minHeight: SL.Space.hitMin, color: SL.Ink.secondary }}>
            <SLGlyph name="chevronLeft" size={18} />
            <Text {...slBody()} color={SL.Ink.secondary}>
              Progress
            </Text>
          </HStack>
        </Pressable>
      </div>

      {/* One page per subject: the lift page names itself in its header card; the others take a title. */}
      {current !== ProgressHomeView_Segment.kracht && (
        <Text as="h2" {...slTitle()} color={SL.Ink.primary} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s1 }}>
          {current === "Body" ? "Body weight" : current === "Lifts" ? "All lifts" : current === "Volume" ? "Volume" : "Log"}
        </Text>
      )}

      <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {current === "Strength" && <StrengthSegmentView opening={openingExercise} />}
        {current === "Log" && <HistoriekSegmentView />}
        {current === "Body" && <LichaamSegmentView />}
        {current === "Lifts" && allLiftsPage()}
        {current === "Volume" && (
          <ScrollView style={{ flex: "1 1 0" }}>
            <div style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s4, paddingBottom: SL.Space.s4, display: "flex", flexDirection: "column" }}>
              {volumeCard()}
            </div>
          </ScrollView>
        )}
      </div>
    </VStack>
  );

  const sheetBody: CSSProperties = { display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", alignSelf: "stretch", width: "100%" }}>
      {segment !== undefined ? detail(segment) : overview()}

      <Sheet isPresented={choosingGoal} onDismiss={() => setChoosingGoal(false)}>
        {choosingGoal && (
          <div style={sheetBody}>
            <GoalSheet
              latestKg={latestEntry?.weightKg}
              onPick={(picked) => {
                GoalPreference.goal = picked;
                setGoal(picked);
                setChoosingGoal(false);
                void NutritionReminders.update(app);
              }}
              onClose={() => setChoosingGoal(false)}
            />
          </div>
        )}
      </Sheet>
      <Sheet isPresented={choosingExercise} onDismiss={() => setChoosingExercise(false)}>
        {choosingExercise && (
          <div style={sheetBody}>
            <ExercisePickerSheet
              rows={exerciseRows}
              selected={strengthID}
              onPick={(row) => {
                setChoosingExercise(false);
                selectStrength(row.exerciseID);
              }}
              onStar={(row) => void app.setFavorite({ exerciseID: row.exerciseID, isFavorite: !row.isFavorite })}
              onClose={() => setChoosingExercise(false)}
            />
          </div>
        )}
      </Sheet>
      <Sheet isPresented={weighing} onDismiss={() => setWeighing(false)}>
        {weighing && (
          <div style={sheetBody}>
            <WeighInSheet
              date={new Date()}
              existing={app.weighIn()}
              latest={latestEntry?.weightKg}
              onSave={(weight) => {
                setWeighing(false);
                void app.saveWeighIn(weight);
              }}
              onClose={() => setWeighing(false)}
            />
          </div>
        )}
      </Sheet>
    </div>
  );
}

// `NutritionHistory`'s computed properties, read the way the goal insights use them.
const NutritionHistoryLogged = (h: NutritionHistory) => NutritionHistory.logged(h).length;
const NutritionHistoryAverage = (h: NutritionHistory) => NutritionHistory.averageCalories(h);
const NutritionHistoryProteinHit = (h: NutritionHistory) => NutritionHistory.daysProteinHit(h);

// MARK: - Charts

/**
 * Tonnage per week as bars. Finished weeks are quiet, this week is lime,
 * and last week's height waits as a dashed outline on this week's bar — the
 * bar to beat. A dashed line marks the average of the weeks trained.
 */
export function VolumeBars({ weeks, spoken, label }: { weeks: ProgressOverview_WeekVolume[]; spoken: string; label: (kg: number) => string }) {
  void label;
  const reduceMotion = useReduceMotion();
  /** The bars rise from the baseline one after another as the card appears. */
  const grown = useAppeared();
  const [ref, size] = useGeometry<HTMLDivElement>();

  const trained = weeks.filter((w) => !w.isCurrent && w.volumeKg > 0).map((w) => w.volumeKg);
  const average = trained.length === 0 ? undefined : trained.reduce((s, v) => s + v, 0) / trained.length;
  const previous = weeks.length >= 2 ? weeks[weeks.length - 2].volumeKg : 0;
  const highest = Math.max(weeks.length > 0 ? Math.max(...weeks.map((w) => w.volumeKg)) : 0, 1);
  const height = 112;
  const n = weeks.length;
  const barWidth = n > 0 ? (size.width - 8 * (n - 1)) / n : 0;
  const r = SL.Radius.sm;

  /** `UnevenRoundedRectangle(topLeadingRadius: 8, topTrailingRadius: 8)` from the baseline up to `h`. */
  const topRounded = (x: number, w: number, h: number) => {
    const rr = Math.max(0, Math.min(r, w / 2, h));
    const top = height - h;
    return `M${x},${height} L${x},${top + rr} Q${x},${top} ${x + rr},${top} L${x + w - rr},${top} Q${x + w},${top} ${x + w},${top + rr} L${x + w},${height} Z`;
  };

  return (
    <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <div ref={ref} role="img" aria-label={spoken} style={{ height, alignSelf: "stretch", position: "relative" }}>
        {size.width > 0 && (
          <svg width={size.width} height={height} style={{ display: "block", overflow: "visible" }}>
            {weeks.map((week, index) => {
              const x = index * (barWidth + 8);
              const h = Math.max(3, (height * week.volumeKg) / highest);
              return (
                <g key={week.start.getTime()}>
                  {week.isCurrent && previous > 0 && (
                    <path d={topRounded(x, barWidth, (height * previous) / highest)} fill="none" stroke={colorOpacity(SL.Signal.action, 0.55)} strokeWidth={1.2} strokeDasharray="3 3" />
                  )}
                  <path
                    d={topRounded(x, barWidth, h)}
                    fill={week.isCurrent ? SL.Signal.action : colorOpacity(SL.Ink.primary, week.volumeKg > 0 ? 0.16 : 0.08)}
                    style={{
                      transformBox: "fill-box",
                      transformOrigin: "bottom",
                      transform: `scaleY(${grown || reduceMotion ? 1 : 0.02})`,
                      transition: reduceMotion ? "none" : `transform ${spring(0.5, 0.75)} ${0.1 + index * 0.05}s`,
                    }}
                  />
                </g>
              );
            })}
            {average !== undefined && (
              <line
                x1={0}
                x2={size.width}
                y1={height * (1 - average / highest)}
                y2={height * (1 - average / highest)}
                stroke={colorOpacity(SL.Ink.secondary, 0.6)}
                strokeWidth={1}
                strokeDasharray="2 4"
              />
            )}
          </svg>
        )}
      </div>

      <HStack aria-hidden spacing={8} style={{ alignSelf: "stretch" }}>
        {weeks.map((week) => (
          <div key={week.start.getTime()} style={{ flex: "1 1 0", minWidth: 0, display: "flex", justifyContent: "center" }}>
            <Text
              size={SL.TypeSize.micro}
              weight={week.isCurrent ? SL.Weight.semibold : SL.Weight.regular}
              numerals
              color={week.isCurrent ? SL.Signal.action : SL.Ink.secondary}
              lineLimit={1}
              minimumScaleFactor={0.7}
            >
              {week.isCurrent ? "Now" : `w${week.number}`}
            </Text>
          </div>
        ))}
      </HStack>
    </VStack>
  );
}

/**
 * A training day's running best as a full-width line over a faint fill,
 * drawing itself in on appear and ending on a ringed dot. Fills the box it
 * is given (`.frame(height:)` on the caller's side).
 */
export function StrengthArea({ values, dates = [], ink }: { values: number[]; dates?: Date[]; ink: string }) {
  const reduceMotion = useReduceMotion();
  const drawn = useAppeared();
  const [ref, size] = useGeometry<HTMLDivElement>();
  const on = drawn || reduceMotion;

  const plotted = (): { x: number; y: number }[] => {
    if (!(values.length > 1)) return [];
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = Math.max(high - low, 1);
    const inset = 8;
    const first = dates[0];
    const last = dates[dates.length - 1];
    const onTime = dates.length === values.length && (last?.getTime() ?? -Infinity) - (first?.getTime() ?? -Infinity) > 0;
    const start = first !== undefined ? first.getTime() / 1000 : 0;
    const length = Math.max((last !== undefined ? last.getTime() / 1000 : 1) - start, 1);
    return values.map((value, index) => {
      const fraction = onTime ? (dates[index].getTime() / 1000 - start) / length : index / (values.length - 1);
      return {
        x: inset + (size.width - 2 * inset) * fraction,
        y: inset + (size.height - 2 * inset) * (1 - (value - low) / span),
      };
    });
  };

  const points = size.width > 0 ? plotted() : [];
  const first = points[0];
  const last = points[points.length - 1];
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = first && last ? `M${first.x},${size.height} ${points.map((p) => `L${p.x},${p.y}`).join(" ")} L${last.x},${size.height} Z` : "";

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      {size.width > 0 && first && last && (
        <svg width={size.width} height={size.height} style={{ display: "block", overflow: "visible", position: "absolute", inset: 0 }}>
          {/* Quiet guides at the start and the end height. */}
          {[first.y, last.y].map((y, i) => (
            <line key={i} x1={0} x2={size.width} y1={y} y2={y} stroke={SL.Surface.hairlineStrong} strokeWidth={1} strokeDasharray="2 4" />
          ))}
          <path d={area} fill={colorOpacity(ink, 0.08)} style={{ opacity: on ? 1 : 0, transition: reduceMotion ? "none" : "opacity 0.6s ease-out 0.5s" }} />
          <path
            d={line}
            fill="none"
            stroke={ink}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
            style={{ strokeDashoffset: on ? 0 : 1, transition: reduceMotion ? "none" : "stroke-dashoffset 0.9s ease-in-out" }}
          />
          <circle cx={first.x} cy={first.y} r={4.5 - 0.75} fill={SL.Surface.raised} stroke={SL.Ink.secondary} strokeWidth={1.5} />
          <g
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              transform: `scale(${on ? 1 : 0.01})`,
              transition: reduceMotion ? "none" : `transform ${spring(0.4, 0.6)} 0.85s`,
            }}
          >
            <circle cx={last.x} cy={last.y} r={5.5} fill={ink} />
            <circle cx={last.x} cy={last.y} r={5.5} fill="none" stroke={SL.Surface.raised} strokeWidth={2.5} />
          </g>
        </svg>
      )}
    </div>
  );
}

/**
 * The 14-day trend over the goal's band: the band in faint lime from the
 * day the goal was set, the trend in mint, and the latest point.
 */
export function GoalBandChart({ points: allPoints, band }: { points: ProgressOverview_WeightPoint[]; band: GoalBand }) {
  const [ref, size] = useGeometry<HTMLDivElement>();
  /** Half the band's least width: a day's water and salt. */
  const margin = 0.25;

  /** From a week before the goal was set; all of it when that is too little. */
  const recent = allPoints.filter((p) => p.date.getTime() >= addingTimeInterval(band.start, -7 * 86_400).getTime());
  const points = recent.length >= 2 ? recent : allPoints;

  const values = points.map((p) => p.average);
  const first = points[0]?.date ?? band.start;
  const now = new Date();
  // A young goal gets the week ahead drawn in.
  const last = new Date(Math.max((points[points.length - 1]?.date ?? now).getTime(), now.getTime(), addingTimeInterval(band.start, 7 * 86_400).getTime()));
  const bandDays: Date[] = [];
  for (let t = Math.max(first.getTime(), band.start.getTime()) / 1000; t <= last.getTime() / 1000; t += 86_400) bandDays.push(new Date(t * 1000));
  const ranges = bandDays.map((day) => {
    const range = GoalBand.range(band, { on: day });
    return { lower: range.lowerBound - margin, upper: range.upperBound + margin };
  });
  const low = Math.min(values.length > 0 ? Math.min(...values) : 0, ranges.length > 0 ? Math.min(...ranges.map((r) => r.lower)) : Infinity) - 0.2;
  const high = Math.max(values.length > 0 ? Math.max(...values) : 0, ranges.length > 0 ? Math.max(...ranges.map((r) => r.upper)) : -Infinity) + 0.2;
  const span = Math.max(high - low, 0.6);
  const total = Math.max((last.getTime() - first.getTime()) / 1000, 1);
  const x = (date: Date) => ((date.getTime() - first.getTime()) / 1000 / total) * size.width;
  const y = (kg: number) => size.height - ((kg - low) / span) * size.height;

  const bandPath =
    bandDays.length === 0
      ? ""
      : `M${x(bandDays[0])},${y(ranges[0].upper)} ` +
        bandDays.map((d, i) => `L${x(d)},${y(ranges[i].upper)}`).join(" ") +
        " " +
        [...bandDays.keys()].reverse().map((i) => `L${x(bandDays[i])},${y(ranges[i].lower)}`).join(" ") +
        " Z";
  const trendPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date)},${y(values[i])}`).join(" ");
  const lastPoint = points[points.length - 1];
  const lastValue = values[values.length - 1];

  return (
    <div ref={ref} role="img" aria-label={`Weight trend against your ${WeightGoal.title(band.goal).toLowerCase()} band`} style={{ width: "100%", height: "100%", position: "relative" }}>
      {size.width > 0 && (
        <svg width={size.width} height={size.height} style={{ display: "block", overflow: "visible", position: "absolute", inset: 0 }}>
          <path d={bandPath} fill={colorOpacity(SL.Signal.action, 0.16)} />
          {bandDays.length > 0 && (
            <line x1={x(bandDays[0])} x2={x(bandDays[0])} y1={0} y2={size.height} stroke={colorOpacity(SL.Signal.action, 0.4)} strokeWidth={1} strokeDasharray="3 3" />
          )}
          <path d={trendPath} fill="none" stroke={SL.Signal.recovery} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {lastPoint !== undefined && lastValue !== undefined && (
            <>
              <circle cx={x(lastPoint.date)} cy={y(lastValue)} r={5} fill={SL.Signal.recovery} />
              <circle cx={x(lastPoint.date)} cy={y(lastValue)} r={5} fill="none" stroke={SL.Surface.raised} strokeWidth={2} />
            </>
          )}
        </svg>
      )}
    </div>
  );
}

/** The 14-day average weight as a soft mint line over a faint fill, the latest point marked. */
export function WeightTrendLine({ points }: { points: ProgressOverview_WeightPoint[] }) {
  const [ref, size] = useGeometry<HTMLDivElement>();

  const plot = (): { x: number; y: number }[] => {
    const values = points.map((p) => p.average);
    if (!(values.length > 1)) return [];
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = Math.max(high - low, 0.6);
    const mid = (high + low) / 2;
    const inset = 6;
    const start = points[0].date.getTime() / 1000;
    const length = points[points.length - 1].date.getTime() / 1000 - start;
    return values.map((value, index) => {
      // On time, so days without a weigh-in keep their width.
      const fraction = length > 0 ? (points[index].date.getTime() / 1000 - start) / length : index / (values.length - 1);
      return {
        x: inset + (size.width - 2 * inset) * fraction,
        y: size.height / 2 - (size.height - 2 * inset) * ((value - mid) / span),
      };
    });
  };

  const plotted = size.width > 0 ? plot() : [];
  const first = plotted[0];
  const last = plotted[plotted.length - 1];

  return (
    <div ref={ref} aria-hidden style={{ width: "100%", height: "100%", position: "relative" }}>
      {size.width > 0 && first && last && (
        <svg width={size.width} height={size.height} style={{ display: "block", overflow: "visible", position: "absolute", inset: 0 }}>
          <path d={`M${first.x},${size.height} ${plotted.map((p) => `L${p.x},${p.y}`).join(" ")} L${last.x},${size.height} Z`} fill={colorOpacity(SL.Signal.recovery, 0.07)} />
          <path d={plotted.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")} fill="none" stroke={SL.Signal.recovery} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={last.x} cy={last.y} r={4.5} fill={SL.Signal.recovery} />
          <circle cx={last.x} cy={last.y} r={4.5} fill="none" stroke={SL.Surface.raised} strokeWidth={2} />
        </svg>
      )}
    </div>
  );
}
