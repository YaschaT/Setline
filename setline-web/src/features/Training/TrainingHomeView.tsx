// TrainingHomeView.swift — Training, in the order a lifter looks: the streak
// and its week as one slim card, today's workout as its own card, the next
// session under it, then the quieter things — every workout, the next badge,
// and one line of progress. A day in the week opens that day. Looking never
// writes: a session starts from `Start training` on today's card and nowhere
// else, and `Exercises` opens the preview, which starts nothing.
//
// Planning and results live one tap away in the Agenda. "Wijzig deze dag" —
// the only thing here that changes the schedule — is reached from a day's
// preview, from a rest day's row in the Agenda, or by holding a day.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SL, slFont } from "../../design/tokens";
import { Alert, FullScreenCover, HStack, Menu, ScrollView, Sheet, Spacer, Text, VStack, useAppStorage } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, SLPrimaryButton, SLQuietButton, colorHex, colorOpacity, spring } from "../../design/SetlineTokens";
import { Presentation, useReduceMotion } from "../../design/support";
import { slCapped, slFixed, slLineHeight } from "../../design/SLDynamicType";
import { SLGlyph, SLWorkoutSymbol } from "../../design/components/SLGlyph";
import { SLPress } from "../../design/components/SLPress";
import { SLHairline, slBody, slLead, slMeta } from "../../design/components/SLText";
import {
  SLAttentionCard, SLOverline, SLRowButton, SLSectionHead, SLTabHeader, SLTabHeaderPinned, slUnbroken,
} from "../../design/components/SLPieces";
import { StreakSheet, MilestonesView, BadgeDetail } from "../../design/components/SLStreak";
import { useApp } from "../../data/AppState";
import type { ReadyLift } from "../../data/AppState";
import { addDays, isSameDay, startOfDay } from "../../core/Support/calendar";
import { Agenda, AgendaDay } from "../../core/Engine/Agenda";
import { DayPlan } from "../../core/Engine/DayPlan";
import { Schedule } from "../../core/Engine/Schedule";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Deload, SessionPrescription } from "../../core/Engine/Fatigue";
import { SyncQueue } from "../../core/Sync/SyncQueue";
import { StateChange } from "../../core/Sync/StateChange";
import { TrainingStreak, type TrainingStreak_Risk } from "../../core/Progress/TrainingStreak";
import { Milestone, Milestones } from "../../core/Progress/Milestones";
import { ProgramCatalog } from "../../core/Catalog/Program";
import { ActiveSessionSnapshot } from "../../core/Domain/ActiveSession";
import type { TrainingSession, WorkoutDay } from "../../core/Domain/Model";
import { AgendaSheet } from "./AgendaSheet";
import { AlertCenterSheet, Alerts } from "./AlertCenterSheet";
import { DayPlanSheet } from "./DayPlanSheet";
import { DeloadCard, type DeloadCard_Status } from "./DeloadCard";
import { HistorySheet, QuickProgressCard } from "./QuickProgressCard";
import { EarnedBadgeRow, NextBadgeCard } from "./StreakHero";
import { TallyMascot, type TallyMascot_Mood } from "./TallyMascot";
import { CustomWorkoutBuilder, OwnWeekSheet, WorkoutChooserSheet, ownWeekSummary } from "./WorkoutChooser";
import { CustomWorkout } from "../../core/Domain/CustomWorkout";
import { WorkoutPreviewView } from "./WorkoutPreviewView";
import { StripDay } from "./WeekStrip";
import { SessionDetailView } from "../Progress/SessionDetailView";
import { ProgramSheet } from "../Account/ProgramSheet";

/** What has played once since launch, so a tab switch does not replay it. */
export const TrainingIntro = { played: false };

/** One sheet at a time, as the design has it: a preview takes the agenda's place rather than stacking on it. */
type Presented =
  | { kind: "agenda" }
  | { kind: "alerts" }
  | { kind: "streak" }
  | { kind: "milestones" }
  | { kind: "badge"; value: Milestone }
  | { kind: "preview"; value: AgendaDay }
  | { kind: "plan"; value: Date }
  | { kind: "history" }
  | { kind: "chooser" }
  | { kind: "ownWeek" }
  | { kind: "newWorkout" };

const presentedID = (p: Presented): string => {
  switch (p.kind) {
    case "badge":
      return `badge-${p.value.id}`;
    case "preview":
      return `preview-${p.value.key}`;
    case "plan":
      return `plan-${Schedule.dateKey(p.value)}`;
    default:
      return p.kind;
  }
};

interface Card {
  title: string;
  focus?: string;
  isRest: boolean;
  meta?: { text: string; timed: boolean };
}

type Stat = { value: string; label: string };

const insideTopic = SL.Space.s3;
const betweenTopics = SL.Space.s8;

/** `.overlay(RoundedRectangle(cornerRadius:).strokeBorder(color, lineWidth:))` — drawn over the content, inside the edge. */
function StrokeBorder({ radius, color, width = SL.Metric.border }: { radius: number | string; color: string; width?: number }) {
  return <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: radius, border: `${width}px solid ${color}`, pointerEvents: "none" }} />;
}

export function TrainingHomeView({
  onStart,
  onResume,
  onLogPast,
  onAccount,
  onProgress = () => {},
  onNutrition = () => {},
}: {
  onStart: (day: WorkoutDay) => void;
  onResume: (day: WorkoutDay, snapshot: ActiveSessionSnapshot) => void;
  /** A workout that was done on a date that has passed and never written down. Same session screen, that date on the result. */
  onLogPast: (day: WorkoutDay, date: Date) => void;
  /** The avatar's way to Account, which stays a tab of its own. */
  onAccount: () => void;
  /** Quick Progress's "See all": the Progress tab. */
  onProgress?: () => void;
  /** The alerts' "Log food": the Nutrition tab. */
  onNutrition?: () => void;
}) {
  const app = useApp();
  const reduceMotion = useReduceMotion();

  const [confirmsEnd, setConfirmsEnd] = useState(false);
  /** The plan shape, chosen from the workout chooser. */
  const [choosingProgram, setChoosingProgram] = useState(false);
  /** The date the screen is on. `undefined` is today, which is where every visit starts. */
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [sheet, setSheet] = useState<Presented | undefined>(undefined);
  const [openedSession, setOpenedSession] = useState<string | undefined>(undefined);
  /** The recovery proposal was waved away on this visit; the card says so. */
  const [ignoredProposal, setIgnoredProposal] = useState(false);
  /** The return moment: the number shown one lower while it rolls up, today's mark small while it lands. */
  const [rolledWeeks, setRolledWeeks] = useState<number | undefined>(undefined);
  const [popsToday, setPopsToday] = useState(false);
  const [celebrates, setCelebrates] = useState(0);
  /** The week's marks have popped in; until then they wait small. */
  const [dotsIn, setDotsIn] = useState(TrainingIntro.played);
  /** Today's ring breathes, so the eye lands on the next step. */
  const [breathes, setBreathes] = useState(false);
  /** The date key of the last week-secured moment played, so it plays once. */
  const [celebratedWeek, setCelebratedWeek] = useAppStorage("setline.training.celebratedWeek", "");

  // Kept through a presentation's exit, so its content does not vanish while it slides away.
  const lastSheet = useRef<Presented | undefined>(undefined);
  if (sheet !== undefined) lastSheet.current = sheet;
  const shownSheet = sheet ?? lastSheet.current;
  const lastSession = useRef<string | undefined>(undefined);
  if (openedSession !== undefined) lastSession.current = openedSession;

  // MARK: - What the screen reads

  const days = (containing: Date): AgendaDay[] =>
    Agenda.week({
      containing,
      plan: app.schedulePlan,
      overrides: app.scheduleOverrides,
      sessions: app.sessions,
      deload: app.activeDeload,
    });

  /** The week the strip shows: the one the selected date falls in. */
  const week = days(selectedDate ?? new Date());
  const selectedDay = (() => {
    const key = Schedule.dateKey(selectedDate ?? new Date());
    return week.find((d) => d.key === key);
  })();
  const isOffline = app.sync.kind === "offline";
  const queue = SyncQueue.rows({ from: app.pendingChanges, display: app.display });
  const thisWeek = days(new Date());
  const today = thisWeek.find((d) => d.isToday);

  /** Closes whatever sheet is up, and acts once it has gone. */
  const after = (action: () => void) => {
    setSheet(undefined);
    setTimeout(action, 350);
  };

  /** One date, read the way the strip and the agenda read it. */
  const dayPlan = (date: Date): DayPlan =>
    DayPlan.make({
      for: date,
      plan: app.schedulePlan,
      overrides: app.scheduleOverrides,
      sessions: app.sessions,
      deload: app.activeDeload,
    });

  const nextTraining = (date: Date): AgendaDay | undefined =>
    Agenda.nextTraining({
      after: date,
      plan: app.schedulePlan,
      overrides: app.scheduleOverrides,
      sessions: app.sessions,
      deload: app.activeDeload,
    });

  // MARK: - The game's state

  /** Every badge, earned or not, as Training and its sheets read them. */
  const milestones = Milestones.make({ sessions: app.sessions, bestStreak: app.streak.best });

  /** Today's workout was the one that met the week. */
  const securedToday = (day: AgendaDay, streak: TrainingStreak): boolean =>
    AgendaDay.isLogged(day) && TrainingStreak.thisWeekMet(streak) && streak.thisWeekDone === streak.thisWeekGoal;

  /**
   * Every badge won since midnight — the finish of today's workout. Streak
   * badges carry the last workout's date rather than the day they were won,
   * so one counts only when today's workout secured exactly its number of
   * weeks for the first time.
   */
  const earnedToday = (() => {
    const streak = app.streak;
    const secured = today !== undefined ? securedToday(today, streak) : false;
    return Milestones.reached({ in: milestones, since: startOfDay(new Date()) }).filter((badge) => {
      if (badge.kind !== "streak") return true;
      return secured && streak.weeks === streak.best && Math.trunc(badge.target) === streak.weeks;
    });
  })();

  /** The badge of the same kind after one just won. */
  const nextMilestone = (badge: Milestone): Milestone | undefined =>
    milestones.find((m) => m.kind === badge.kind && !Milestone.isReached(m));

  /** The badge today counts toward. */
  const badgeGoal = (day: AgendaDay, isDone: boolean): { milestone: Milestone; unlocks: boolean } | undefined => {
    const streak = app.streak;
    const nextSessions = milestones.find((m) => m.kind === "sessions" && !Milestone.isReached(m));
    const firstStreak = milestones.find((m) => m.kind === "streak" && !Milestone.isReached(m));
    if (streak.weeks === 0 && streak.best === 0 && firstStreak !== undefined) {
      return { milestone: firstStreak, unlocks: false };
    }
    const resumable = app.resumableSession;
    const workout = AgendaDay.plannedDay(day) ?? (resumable ? app.day({ for: resumable }) : undefined);
    if (isDone || AgendaDay.isRest(day) || workout === undefined) {
      return nextSessions ? { milestone: nextSessions, unlocks: false } : undefined;
    }
    const afterStreak = app.streakAdding({ adding: new Date(), day: workout });
    if (afterStreak.weeks > streak.weeks) {
      const badge = milestones.find((m) => m.kind === "streak" && !Milestone.isReached(m) && Math.trunc(m.target) === afterStreak.weeks);
      if (badge !== undefined) return { milestone: badge, unlocks: true };
    }
    return nextSessions ? { milestone: nextSessions, unlocks: nextSessions.target - nextSessions.current <= 1 } : undefined;
  };

  // MARK: - Small motion (`.onAppear` of the streak card)

  useEffect(() => {
    if (today === undefined) return;
    const streak = app.streak;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let frame = 0;

    // The return moment, once per secured week: today's mark lands, the number rolls up by one.
    const key = today.key;
    if (securedToday(today, streak) && celebratedWeek !== key) {
      setCelebratedWeek(key);
      if (!reduceMotion) {
        setRolledWeeks(Math.max(streak.weeks - 1, 0));
        setPopsToday(true);
        timers.push(
          setTimeout(() => {
            setPopsToday(false);
            timers.push(
              setTimeout(() => {
                setRolledWeeks(undefined);
                setCelebrates((c) => c + 1);
              }, 250),
            );
          }, 450),
        );
      }
    }

    // Once per launch: the streak counts up to itself and the week's marks pop in.
    if (reduceMotion) {
      setDotsIn(true);
    } else {
      if (!breathes) setBreathes(true);
      if (!TrainingIntro.played) {
        // Marked played only once the marks are in: React may run this setup
        // twice and cancel the first frame, and the second run must still show them.
        frame = requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            TrainingIntro.played = true;
            setDotsIn(true);
          }),
        );
        if (streak.weeks > 1 && rolledWeeks === undefined) {
          setRolledWeeks(0);
          timers.push(setTimeout(() => setRolledWeeks(undefined), 250));
        }
      }
    }
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MARK: - Opening a day

  /** Remembered for the agenda, so it opens where it was left. */
  const select = (day: AgendaDay) => setSelectedDate(day.isToday ? undefined : day.date);

  /** A day from the week or Up next: its results once logged, its workout's preview while planned, and on a rest day what it can become. */
  const open = (day: AgendaDay) => {
    const session = AgendaDay.session(day);
    if (session !== undefined) setOpenedSession(session.id);
    else if (AgendaDay.plannedDay(day) !== undefined) setSheet({ kind: "preview", value: day });
    else setSheet({ kind: "plan", value: day.date });
  };
  const pick = (day: AgendaDay) => open(day);
  const isPicked = (day: AgendaDay) => day.isToday;

  // MARK: - The head

  /** The avatar's ring in the metal of the best badge earned. */
  const tierRing = (() => {
    const tiers = milestones.filter((m) => Milestone.isReached(m)).map((m) => m.tier);
    if (tiers.length === 0) return SL.Surface.hairlineStrong;
    const top = Math.max(...tiers);
    switch (top) {
      case 0:
        return `linear-gradient(to bottom, ${colorHex(0xe2a576)}, ${colorHex(0x7a4526)})`;
      case 1:
        return `linear-gradient(to bottom, ${colorHex(0xeef2f4)}, ${colorHex(0x7d8a92)})`;
      case 2:
        return `linear-gradient(to bottom, ${colorHex(0xffe08a)}, ${colorHex(0xb07d12)})`;
      default:
        return SL.Signal.action;
    }
  })();

  /** "Good evening, Yascha", or the greeting alone until a name is given in Account. */
  const greeting = (() => {
    const hour = new Date().getHours();
    const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const name = app.greetingName;
    return name !== undefined ? `${part}, ${name}` : part;
  })();

  /** The way to Alerts: a bell, with the number of things to do on it. Amber, and only while there is something to answer. */
  const alertsBell = (() => {
    const count = Alerts.todos(app).length;
    const newWins = count === 0 && Alerts.hasNewWins(app);
    return (
      <button
        type="button"
        className="sl-pressable"
        onClick={() => setSheet({ kind: "alerts" })}
        aria-label={count === 0 ? (newWins ? "Alerts, new wins" : "Alerts") : `Alerts, ${count} to do`}
        style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, borderRadius: "50%", display: "grid", placeItems: "center", background: "transparent", flexShrink: 0 }}
      >
        <div style={{ position: "relative", width: 38, height: 38, borderRadius: "50%", background: SL.Surface.raised, display: "grid", placeItems: "center" }}>
          <SLGlyph name="bell" size={18} fixed color={SL.Ink.primary} />
          <StrokeBorder radius="50%" color={SL.Surface.hairline} />
          {count > 0 ? (
            <span
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                transform: "translate(4px, -4px)",
                minWidth: 18,
                minHeight: 18,
                borderRadius: "50%",
                background: SL.Signal.attention,
                display: "grid",
                placeItems: "center",
                ...slFixed(11, SL.Weight.bold),
                color: SL.Signal.onAction,
                lineHeight: 1,
              }}
            >
              {`${Math.min(count, 9)}`}
            </span>
          ) : newWins ? (
            // Good news waiting: a lime dot, never a number.
            <span style={{ position: "absolute", top: 0, right: 0, transform: "translate(1px, -1px)", width: 10, height: 10, borderRadius: "50%", background: SL.Signal.action }} />
          ) : null}
        </div>
      </button>
    );
  })();

  const header = <SLTabHeader title={greeting} ring={tierRing} onAccount={onAccount} trailing={alertsBell} />;

  /** The one way to planning and results: a small calendar in the streak card, beside the week it plans. */
  const agendaButton = (
    <button
      type="button"
      className="sl-pressable"
      onClick={() => setSheet({ kind: "agenda" })}
      aria-label="Agenda"
      style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, borderRadius: "50%", display: "grid", placeItems: "center", background: "transparent", flexShrink: 0 }}
    >
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
        <SLGlyph name="calendar" size={15} color={SL.Ink.secondary} />
      </div>
    </button>
  );

  // MARK: - The hero

  /** Days still open for a workout this week: today while nothing is logged, and every day after it. */
  const streakRisk = (streak: TrainingStreak): TrainingStreak_Risk => {
    const openDays = thisWeek.filter((d) => (d.isToday && !AgendaDay.isLogged(d)) || (!d.isToday && !d.isPast));
    return TrainingStreak.risk(streak, { daysLeft: openDays.length });
  };

  /** The latest planned day this week that went by unlogged. */
  const lastMissed = (() => {
    for (const day of [...thisWeek].reverse()) {
      if (day.content.kind === "missed" && !day.isToday) return { day, workout: day.content.value };
    }
    return undefined;
  })();

  const mascotMood = (day: AgendaDay, streak: TrainingStreak): TallyMascot_Mood => {
    if (TrainingStreak.thisWeekMet(streak)) return "struck";
    if (AgendaDay.isLogged(day)) return "proud";
    if (AgendaDay.isRest(day)) return "resting";
    const workout = AgendaDay.plannedDay(day);
    if (workout !== undefined && app.liftsReady({ in: workout }).length > 0) return "focused";
    return "ready";
  };

  const streakRow = (streak: TrainingStreak, secured: boolean, risk: TrainingStreak_Risk) => {
    const left = Math.max(streak.thisWeekGoal - streak.thisWeekDone, 0);
    const lit = streak.weeks > 0;
    const done = Math.min(streak.thisWeekDone, streak.thisWeekGoal);
    const met = TrainingStreak.thisWeekMet(streak);
    const nudge = (() => {
      if (met) return "Week secured";
      switch (risk) {
        case "breaks":
          return "Out of reach this week · streak resets Monday";
        case "freezeCovers":
          return "Out of reach · your freeze keeps the streak";
        case "tight":
          return left === 1 ? "Last chance: 1 more this week" : `Every day left counts: ${left} to go`;
        case "none":
          break;
      }
      return !lit
        ? left === 1
          ? "1 more workout this week does it"
          : `${left} workouts this week do it`
        : left === 1
          ? "1 more keeps it going"
          : `${left} more keep it going`;
    })();
    // Lime is earned; amber says the streak needs you now.
    const nudgeInk = met ? SL.Signal.action : risk === "tight" || risk === "breaks" ? SL.Signal.attention : SL.Ink.secondary;
    const shown = rolledWeeks ?? streak.weeks;
    return (
      <SLPress
        onPress={() => setSheet({ kind: "streak" })}
        aria-label={`${streak.weeks === 1 ? "1-week streak" : `${streak.weeks}-week streak`}. ${done} of ${streak.thisWeekGoal} workouts this week. ${nudge}.`}
        style={{ flex: "1 1 0", minWidth: 0, textAlign: "left" }}
      >
        <VStack alignment="leading" spacing={2}>
          <HStack alignment="firstTextBaseline" spacing={6} style={{ maxWidth: "100%" }}>
            {streak.weeks === 0 && rolledWeeks === undefined ? (
              // A zero isn't a streak; it's an invitation.
              <Text size={SL.TypeSize.title} weight={SL.Weight.bold} color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.8}>
                {streak.best === 0 ? "Start your streak" : "Start a new streak"}
              </Text>
            ) : (
              <>
                <Text
                  numerals
                  lineLimit={1}
                  tracking={-1}
                  color={risk === "breaks" ? SL.Signal.attention : lit ? SL.Signal.action : SL.Ink.primary}
                  style={{ ...slCapped(34, SL.Weight.bold, { maxScale: 1.3, relativeTo: "title1" }), flexShrink: 0, overflow: "visible" }}
                >
                  {`${shown}`}
                </Text>
                <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={1}>
                  week streak
                </Text>
              </>
            )}
            {secured && (
              <span
                style={{
                  ...slFixed(11, SL.Weight.bold),
                  color: SL.Signal.onAction,
                  padding: "2px 5px",
                  borderRadius: SL.Radius.pill,
                  background: SL.Signal.action,
                  lineHeight: 1.25,
                  flexShrink: 0,
                }}
              >
                +1
              </span>
            )}
          </HStack>
          <HStack spacing={4} style={{ color: nudgeInk, maxWidth: "100%" }}>
            {met && <SLGlyph name="check" size={11} />}
            <Text {...slMeta(SL.Weight.medium)} color={nudgeInk} lineLimit={1} minimumScaleFactor={0.85}>
              {nudge}
            </Text>
          </HStack>
        </VStack>
      </SLPress>
    );
  };

  /** "Monday wasn't logged · Log it": the missed day, answered where it shows. */
  const missedLine = (missed: { day: AgendaDay; workout: WorkoutDay }) => (
    <button
      type="button"
      className="sl-pressable"
      onClick={() => onLogPast(missed.workout, missed.day.date)}
      aria-label={`${WeekPlan.fullWeekday(missed.day.date)} wasn't logged. Log ${missed.workout.short}`}
      style={{ display: "flex", alignItems: "center", gap: SL.Space.s2, minHeight: SL.Space.hitMin, alignSelf: "stretch", background: "transparent", marginTop: SL.Space.s2 }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: SL.Signal.attention, flexShrink: 0 }} />
      <Text {...slMeta()} color={SL.Ink.secondary}>
        {`${WeekPlan.fullWeekday(missed.day.date)} wasn't logged`}
      </Text>
      <Spacer minLength={SL.Space.s2} />
      <Text {...slMeta(SL.Weight.semibold)} color={SL.Signal.attention}>
        Log it
      </Text>
      <SLGlyph name="chevronRight" size={11} color={SL.Signal.attention} />
    </button>
  );

  /** "THIS WEEK · 2 of 4 workouts", over its seven days. */
  const weekHeader = (streak: TrainingStreak) => {
    const done = Math.min(streak.thisWeekDone, streak.thisWeekGoal);
    return (
      <HStack alignment="firstTextBaseline" spacing={8} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s2 }}>
        <SLOverline text="This week" />
        <Spacer minLength={SL.Space.s2} />
        <Text {...slMeta(SL.Weight.semibold)} numerals color={TrainingStreak.thisWeekMet(streak) ? SL.Signal.action : SL.Ink.primary}>
          {`${done} of ${streak.thisWeekGoal} workouts`}
        </Text>
      </HStack>
    );
  };

  const dayMark = (day: AgendaDay): ReactNode => {
    const size = 28;
    const circle = (style: CSSProperties, children?: ReactNode) => (
      <div style={{ position: "relative", width: size, height: size, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0, ...style }}>{children}</div>
    );
    if (AgendaDay.isLogged(day)) {
      return (
        <div
          style={{
            position: "relative",
            width: size,
            height: size,
            transform: `scale(${day.isToday && popsToday ? 0.4 : 1})`,
            transition: popsToday ? "none" : `transform ${spring(0.5, 0.55)}`,
          }}
        >
          <div style={{ position: "absolute", inset: -5, borderRadius: "50%", background: colorOpacity(SL.Signal.action, day.isToday ? 0.2 : 0) }} />
          {circle({ background: SL.Signal.action }, <SLGlyph name="check" size={13} color={SL.Signal.onAction} />)}
        </div>
      );
    }
    if (day.isToday) {
      return (
        <div style={{ position: "relative", width: size, height: size }}>
          {/* A ring that leaves it and fades: the next step, waiting. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `1.5px solid ${colorOpacity(SL.Signal.action, 0.5)}`,
              opacity: breathes ? undefined : 1,
              animation: breathes ? "sl-training-breathe 1.6s ease-out 0.8s infinite both" : undefined,
            }}
          />
          <div style={{ position: "absolute", inset: -4, borderRadius: "50%", background: colorOpacity(SL.Signal.action, 0.12) }} />
          {circle({ boxShadow: `inset 0 0 0 2px ${SL.Signal.action}` }, <div style={{ width: 8, height: 8, borderRadius: "50%", background: SL.Signal.action }} />)}
        </div>
      );
    }
    if (AgendaDay.isRest(day)) {
      return circle({ boxShadow: `inset 0 0 0 1.5px ${colorOpacity(SL.Signal.recovery, 0.25)}` }, <div style={{ width: 5, height: 5, borderRadius: "50%", background: SL.Signal.recovery }} />);
    }
    if (day.isPast && day.content.kind === "missed") {
      // A planned day that went by: amber, so it reads apart from the days still to come.
      return circle({ boxShadow: `inset 0 0 0 1.5px ${colorOpacity(SL.Signal.attention, 0.7)}` }, <SFSymbol name="xmark" size={9} weight={700} color={SL.Signal.attention} />);
    }
    if (day.isPast) {
      return circle({ boxShadow: `inset 0 0 0 1.5px ${SL.Surface.mute}` });
    }
    return (
      <svg width={size} height={size} style={{ display: "block", flexShrink: 0 }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 0.75} fill="none" stroke={SL.Surface.mute} strokeWidth={1.5} strokeDasharray="3 3" />
      </svg>
    );
  };

  /** This week as seven marks: trained days filled, today ringed, rest days mint, days still to come dashed. A tap opens that day. */
  const weekDots = (
    <HStack spacing={0} style={{ marginLeft: -SL.Space.s1, marginRight: -SL.Space.s1, alignSelf: "stretch" }}>
      {thisWeek.map((day, index) => (
        <SLPress
          key={AgendaDay.id(day)}
          scale={0.82}
          bounces
          onPress={() => pick(day)}
          aria-label={StripDay.spokenLabel(day)}
          style={{ flex: "1 1 0", minWidth: 0 }}
        >
          <div style={{ position: "relative" }}>
            <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 3, right: 3, borderRadius: SL.Radius.md, background: isPicked(day) ? SL.Surface.raised2 : "transparent" }} />
            <VStack spacing={6} style={{ position: "relative", paddingTop: SL.Space.s1, paddingBottom: SL.Space.s1, minHeight: SL.Space.hitMin, justifyContent: "center" }}>
              <Text size={SL.TypeSize.micro} weight={day.isToday ? SL.Weight.bold : SL.Weight.regular} color={day.isToday ? SL.Ink.primary : SL.Ink.secondary}>
                {day.weekday.slice(0, 1)}
              </Text>
              {/* Seven coins dropping in, left to right. */}
              <div
                style={{
                  transform: `scale(${dotsIn ? 1 : 0.3})`,
                  opacity: dotsIn ? 1 : 0,
                  transition: `transform ${spring(0.38, 0.55)} ${0.12 + index * 0.045}s, opacity 0.3s ease-out ${0.12 + index * 0.045}s`,
                }}
              >
                {dayMark(day)}
              </div>
            </VStack>
          </div>
        </SLPress>
      ))}
    </HStack>
  );

  const heroBackground = (lit: boolean, streak: TrainingStreak): string => {
    const base = `linear-gradient(${SL.Surface.raised}, ${SL.Surface.raised})`;
    if (lit) {
      return `radial-gradient(circle 380px at 50% 0%, ${colorOpacity(SL.Signal.action, 0.28)} 0px, ${colorOpacity(SL.Signal.action, 0.06)} 190px, transparent 380px), ${base}`;
    }
    if (streak.weeks > 0) {
      return `radial-gradient(circle 300px at 100% 0%, ${colorOpacity(SL.Signal.action, 0.16)} 0px, transparent 300px), ${base}`;
    }
    return base;
  };

  /**
   * The streak as one slim card: Tally, the count of weeks in a row, this
   * week's workouts as a fraction, the seven days, and the Agenda.
   */
  const streakCard = (day: AgendaDay) => {
    const streak = app.streak;
    const secured = securedToday(day, streak);
    return (
      <div
        style={{
          position: "relative",
          alignSelf: "stretch",
          borderRadius: SL.Radius.xl,
          background: heroBackground(secured, streak),
          boxShadow: secured ? `0 0 18px ${colorOpacity(SL.Signal.action, 0.12)}` : "none",
        }}
      >
        <div style={{ borderRadius: SL.Radius.xl, overflow: "hidden" }}>
          <VStack alignment="leading" spacing={0} style={{ paddingLeft: SL.Space.s5, paddingRight: SL.Space.s5, paddingTop: SL.Space.s5, paddingBottom: SL.Space.s4 }}>
            <HStack alignment="center" spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
              <div aria-hidden>
                {/* Tally shows how the day feels, not how many. */}
                <TallyMascot done={3} goal={3} mood={mascotMood(day, streak)} unit={9} jumps={celebrates} />
              </div>
              {streakRow(streak, secured, streakRisk(streak))}
              {agendaButton}
            </HStack>
            <div
              aria-hidden
              style={{
                height: SL.Metric.border,
                alignSelf: "stretch",
                marginLeft: -SL.Space.s5,
                marginRight: -SL.Space.s5,
                marginTop: SL.Space.s5,
                marginBottom: SL.Space.s5,
                background: secured ? colorOpacity(SL.Signal.action, 0.18) : SL.Surface.hairline,
              }}
            />
            {weekHeader(streak)}
            {weekDots}
            {lastMissed !== undefined && missedLine(lastMissed)}
          </VStack>
        </div>
        <StrokeBorder radius={SL.Radius.xl} color={secured ? colorOpacity(SL.Signal.action, 0.45) : SL.Surface.hairline} />
      </div>
    );
  };

  // MARK: - What the card says

  /** "16 of 19 sets", from the counts stored with the session; an older session without them says how much of it was finished. */
  const doneLine = (session: TrainingSession): string => {
    if (session.plannedSetCount !== undefined && session.completedSetCount !== undefined && session.plannedSetCount > 0) {
      return `${session.completedSetCount} of ${session.plannedSetCount} sets`;
    }
    return `${session.completion}% done`;
  };

  /** What each date puts in 1a's slots. */
  const card = (day: AgendaDay): Card => {
    // A session that was started and paused is the one you are in the middle of, whatever today's plan says.
    const paused = app.resumableSession;
    const resumed = paused ? app.day({ for: paused }) : undefined;
    if (day.isToday && paused !== undefined && resumed !== undefined) {
      const planned = SessionPrescription.setCount({ of: resumed, deload: app.activeDeload });
      return {
        title: resumed.short,
        focus: resumed.focus === "" ? undefined : resumed.focus,
        isRest: false,
        meta: {
          text: `${ActiveSessionSnapshot.loggedSetCount(paused)} of ${Math.max(planned, ActiveSessionSnapshot.plannedSetCount(paused))} sets · paused`,
          timed: false,
        },
      };
    }
    const content = day.content;
    switch (content.kind) {
      case "planned": {
        const workout = content.value;
        const exercises = workout.exercises.length === 1 ? "1 exercise" : `${workout.exercises.length} exercises`;
        return {
          title: workout.short,
          focus: workout.focus === "" ? undefined : workout.focus,
          isRest: false,
          meta: day.isToday
            ? { text: `${exercises} · ~${WeekPlan.minutes({ of: workout })} min`, timed: true }
            : { text: `${WeekPlan.sets({ of: workout })} sets`, timed: false },
        };
      }
      case "missed": {
        const workout = content.value;
        return {
          title: workout.short,
          focus: workout.focus === "" ? undefined : workout.focus,
          isRest: false,
          meta: { text: `${WeekPlan.sets({ of: workout })} sets · not logged`, timed: false },
        };
      }
      case "session":
        return { title: "Done", focus: content.value.dayLabel, isRest: false, meta: { text: doneLine(content.value), timed: false } };
      case "rest": {
        const result: Card = { title: "Rest", focus: "Recovery is part of the plan", isRest: true };
        // Today's next session has its own card right below.
        if (!day.isToday) {
          const next = nextTraining(day.date);
          const workout = next ? AgendaDay.plannedDay(next) : undefined;
          if (next !== undefined && workout !== undefined) {
            result.meta = { text: `${Agenda.restLine({ next })} · ${workout.short}`, timed: false };
          }
        }
        return result;
      }
    }
  };

  /** The workout's size as numbers to scan rather than a sentence to read. */
  const stats = (day: AgendaDay, workout: WorkoutDay | undefined, isDone: boolean): Stat[] | undefined => {
    const paused = app.resumableSession;
    const resumed = paused ? app.day({ for: paused }) : undefined;
    if (paused !== undefined && day.isToday && resumed !== undefined) {
      const planned = Math.max(SessionPrescription.setCount({ of: resumed, deload: app.activeDeload }), ActiveSessionSnapshot.plannedSetCount(paused));
      return [
        { value: `${ActiveSessionSnapshot.loggedSetCount(paused)}/${planned}`, label: "sets done" },
        { value: "Paused", label: app.pausedWhenLabel({ for: paused }) },
      ];
    }
    const session = AgendaDay.session(day);
    if (isDone && session !== undefined && session.plannedSetCount !== undefined && session.completedSetCount !== undefined && session.plannedSetCount > 0) {
      // The sets already say how much was done; the time is the new fact.
      const items: Stat[] = [{ value: `${session.completedSetCount}/${session.plannedSetCount}`, label: "sets" }];
      if (session.durationSeconds !== undefined && session.durationSeconds >= 60) {
        items.push({ value: `${Math.trunc(session.durationSeconds / 60)}`, label: "min" });
      }
      return items;
    }
    if (isDone || workout === undefined || AgendaDay.plannedDay(day) === undefined) return undefined;
    return [
      { value: `${workout.exercises.length}`, label: workout.exercises.length === 1 ? "exercise" : "exercises" },
      { value: `~${WeekPlan.minutes({ of: workout })}`, label: "min" },
      { value: `${WeekPlan.sets({ of: workout })}`, label: "sets" },
    ];
  };

  /** Big number over a small word, columns split by hairlines. */
  const statRow = (items: Stat[]) => (
    <HStack alignment="top" spacing={0} aria-label={items.map((s) => `${s.value} ${s.label}`).join(", ")} style={{ alignSelf: "stretch", paddingTop: SL.Space.s4 }}>
      {items.map((item, index) => (
        <HStack key={index} spacing={0} style={{ flex: "1 1 0", minWidth: 0 }}>
          {index > 0 && <div style={{ width: SL.Metric.border, height: 34, background: SL.Surface.hairline, marginRight: SL.Space.s4, flexShrink: 0 }} />}
          <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
            <Text size={SL.TypeSize.title} weight={SL.Weight.semibold} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.8} style={{ maxWidth: "100%" }}>
              {item.value}
            </Text>
            <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.6} style={{ maxWidth: "100%" }}>
              {item.label}
            </Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
        </HStack>
      ))}
    </HStack>
  );

  /** One line, not a card: the lifts the engine says can go up today. "↑ 7 lifts can go up today · Flat bench 102.5 kg". */
  const readyLine = (lifts: ReadyLift[]) => (
    <HStack
      spacing={SL.Space.s2}
      style={{
        alignSelf: "stretch",
        color: SL.Signal.action,
        padding: `${SL.Space.s2}px ${SL.Space.s3}px`,
        borderRadius: SL.Radius.md,
        background: SL.Signal.actionTint,
        marginTop: SL.Space.s4,
      }}
    >
      <SLGlyph name="trendUp" size={14} fixed />
      <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals color={SL.Signal.action} lineLimit={1} minimumScaleFactor={0.8}>
        {lifts.length === 1 ? "1 lift can go up today" : `${lifts.length} lifts can go up today`}
        <span style={{ fontWeight: SL.Weight.regular }}>{` · ${lifts[0].name} ${NumberDisplay.kg(app.display, lifts[0].toKg)}`}</span>
      </Text>
      <Spacer minLength={0} />
    </HStack>
  );

  // MARK: - What the card offers

  const startLabel = (title: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <SLGlyph name="play" size={16} />
      <span>{title}</span>
    </span>
  );

  const chevroned = (title: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span>{title}</span>
      <SLGlyph name="chevronRight" size={14} color={SL.Ink.secondary} />
    </span>
  );

  const resumeLabel = (paused: ActiveSessionSnapshot): string => {
    const when = app.pausedWhenLabel({ for: paused });
    return when === "today" ? "Resume training" : `Resume training ${when}`;
  };

  const endMessage = (() => {
    const paused = app.resumableSession;
    if (paused === undefined) return "";
    const logged = ActiveSessionSnapshot.loggedSetCount(paused);
    return ActiveSessionSnapshot.hasProgress(paused)
      ? logged === 1
        ? "The set you logged is kept. The rest counts as not trained."
        : `The ${logged} sets you logged are kept. The rest counts as not trained.`
      : "You haven't logged anything, so nothing is kept.";
  })();

  /** One commit per date. Today starts or resumes — the only lime action on this screen; every other date opens what it holds. */
  const cardActions = (day: AgendaDay): ReactNode => {
    const paused = app.resumableSession;
    const resumed = paused ? app.day({ for: paused }) : undefined;
    const planned = AgendaDay.plannedDay(day);
    const session = AgendaDay.session(day);
    const wrap = (children: ReactNode) => <VStack spacing={SL.Space.s1} style={{ alignSelf: "stretch", alignItems: "stretch", marginTop: SL.Space.s5 }}>{children}</VStack>;
    if (day.isToday && paused !== undefined && resumed !== undefined) {
      return wrap(<SLPrimaryButton onPress={() => onResume(resumed, paused)}>{startLabel(resumeLabel(paused))}</SLPrimaryButton>);
    }
    if (day.isToday && planned !== undefined) {
      return wrap(<SLPrimaryButton onPress={() => onStart(planned)}>{startLabel("Start training")}</SLPrimaryButton>);
    }
    if (session !== undefined) {
      return wrap(<SLOutlineButton onPress={() => setOpenedSession(session.id)}>{chevroned("View workout")}</SLOutlineButton>);
    }
    if (day.isPast && planned !== undefined) {
      // A day that has gone by with nothing logged: this is where it gets written down, on the date it happened.
      return wrap(
        <>
          <SLOutlineButton onPress={() => onLogPast(planned, day.date)}>{chevroned("Log afterwards")}</SLOutlineButton>
          <SLQuietButton onPress={() => setSheet({ kind: "agenda" })}>{chevroned("Details in agenda")}</SLQuietButton>
        </>,
      );
    }
    if (planned !== undefined) {
      return wrap(<SLOutlineButton onPress={() => setSheet({ kind: "agenda" })}>{chevroned("Details in agenda")}</SLOutlineButton>);
    }
    // A rest day: 1a's own label for it.
    return wrap(<SLOutlineButton onPress={() => setSheet({ kind: "agenda" })}>{chevroned("Go to agenda")}</SLOutlineButton>);
  };

  /** The paused session's quieter way out, off the card's face. */
  const moreMenu = (
    <div style={{ marginTop: -SL.Space.s3, marginBottom: -SL.Space.s3, marginRight: -SL.Space.s2, flexShrink: 0 }}>
      <Menu
        aria-label="More"
        entries={[{ kind: "button", title: "End session", role: "destructive", action: () => setConfirmsEnd(true) }]}
        label={
          <div style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "grid", placeItems: "center" }}>
            <SLGlyph name="more" size={20} fixed color={SL.Ink.secondary} />
          </div>
        }
      />
    </div>
  );

  /** "hamstrings · glutes · core" → "Hamstrings · glutes · core". */
  const sentenceCase = (text: string) => text.slice(0, 1).toUpperCase() + text.slice(1);

  /**
   * Today: the word, the workout, one line of what it holds, the record
   * chance, the action, and under it the badge it counts toward.
   */
  const todayBlock = (day: AgendaDay) => {
    const content = card(day);
    const paused = app.resumableSession;
    const workout = AgendaDay.plannedDay(day) ?? (paused ? app.day({ for: paused }) : undefined);
    const session = AgendaDay.session(day);
    const isDone = session !== undefined && (!day.isToday || paused === undefined);
    const name = day.isToday ? "TODAY" : WeekPlan.fullWeekday(day.date).toUpperCase();
    const state = isDone ? " · DONE" : day.isPast && AgendaDay.plannedDay(day) !== undefined && !day.isToday ? " · NOT LOGGED" : "";
    const headInk = content.isRest ? SL.Signal.recovery : isDone || day.isToday ? SL.Signal.action : SL.Ink.secondary;
    const focus = isDone ? undefined : content.focus;
    const statItems = stats(day, workout, isDone);
    const lifts = day.isToday && !isDone && workout !== undefined && !content.isRest ? app.liftsReady({ in: workout }) : [];
    return (
      <VStack alignment="leading" spacing={0}>
        <HStack spacing={4} style={{ alignSelf: "stretch", color: headInk }}>
          {isDone && <SLGlyph name="check" size={11} />}
          <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={1} color={headInk}>
            {name + state}
          </Text>
          <Spacer minLength={0} />
          {day.isToday ? (
            paused !== undefined ? (
              moreMenu
            ) : workout !== undefined && !isDone && !content.isRest ? (
              // Looking first is its own, named way in; the title is only a title, and the button only starts.
              <button
                type="button"
                className="sl-pressable"
                onClick={() => setSheet({ kind: "preview", value: day })}
                style={{ display: "flex", alignItems: "center", gap: 4, minHeight: SL.Space.hitMin, marginTop: -SL.Space.s3, marginBottom: -SL.Space.s3, color: SL.Ink.secondary, background: "transparent", flexShrink: 0 }}
              >
                <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>
                  Exercises
                </Text>
                <SLGlyph name="chevronRight" size={11} />
              </button>
            ) : null
          ) : (
            <button
              type="button"
              className="sl-pressable"
              onClick={() => setSelectedDate(undefined)}
              aria-label="Back to today"
              style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", background: "transparent", flexShrink: 0 }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", minHeight: 30, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, borderRadius: SL.Radius.pill, background: SL.Surface.raised2 }}>
                <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} color={SL.Ink.secondary}>
                  Today
                </Text>
              </span>
            </button>
          )}
        </HStack>
        <Text
          as="h2"
          size={SL.TypeSize.display}
          weight={SL.Weight.bold}
          tracking={-0.02 * SL.TypeSize.display}
          color={content.isRest ? SL.Signal.recovery : SL.Ink.primary}
          lineLimit={1}
          minimumScaleFactor={0.7}
          style={{ paddingTop: 2, maxWidth: "100%" }}
        >
          {isDone ? (session?.dayLabel ?? content.title) : content.title}
        </Text>

        {focus !== undefined && (
          <Text {...slLead(SL.Weight.regular)} color={colorOpacity(SL.Ink.primary, 0.85)} style={{ paddingTop: SL.Space.s2 }}>
            {slUnbroken(sentenceCase(focus))}
          </Text>
        )}
        {statItems !== undefined && statItems.length > 0
          ? statRow(statItems)
          : content.meta !== undefined && (
              <Text {...slBody()} numerals color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s2 }}>
                {slUnbroken(content.meta.text)}
              </Text>
            )}

        {lifts.length > 0 && readyLine(lifts)}
        {/* A rest day holds no start: the next session is the card below. */}
        {!(day.isToday && content.isRest && !isDone) && cardActions(day)}
        {/* Another plan day, a workout of your own, or a new plan shape — quiet under the start, and the card's one action on a rest day. */}
        {day.isToday && !isDone && paused === undefined &&
          (content.isRest ? (
            <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", marginTop: SL.Space.s5 }}>
              <SLOutlineButton onPress={() => setSheet({ kind: "chooser" })}>{chevroned("Train anyway")}</SLOutlineButton>
            </div>
          ) : (
            <button
              type="button"
              className="sl-pressable"
              onClick={() => setSheet({ kind: "chooser" })}
              style={{ alignSelf: "stretch", minHeight: SL.Space.hitMin, marginTop: SL.Space.s1, marginBottom: -SL.Space.s3, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}
            >
              <Text {...slMeta(SL.Weight.medium)} color={SL.Ink.secondary}>
                or choose a different workout
              </Text>
            </button>
          ))}
      </VStack>
    );
  };

  /** Today's workout, on its own card: the workout as it was, one action. */
  const todayCard = (day: AgendaDay) => (
    <div style={{ position: "relative", alignSelf: "stretch", padding: SL.Space.s5, borderRadius: 28, background: SL.Surface.raised }}>
      {todayBlock(day)}
      <StrokeBorder radius={28} color={colorOpacity(SL.Surface.hairlineStrong, 0.6)} />
    </div>
  );

  // MARK: - The plan card

  /** "Tomorrow", "Tue 13". */
  const whenLabel = (day: AgendaDay): string => {
    if (isSameDay(day.date, addDays(new Date(), 1))) return "Tomorrow";
    return `${WeekPlan.fullWeekday(day.date).slice(0, 3)} ${day.date.getDate()}`;
  };

  const nextSessionRow = (day: AgendaDay) => {
    const workout = AgendaDay.plannedDay(day)!;
    const sets = WeekPlan.sets({ of: workout });
    const minutes = WeekPlan.minutes({ of: workout });
    return (
      <SLRowButton
        onPress={() => open(day)}
        aria-label={`Next session: ${workout.short}, ${whenLabel(day)}, ${sets} sets, about ${minutes} minutes`}
      >
        <HStack spacing={SL.Space.s3} style={{ padding: SL.Space.s4 }}>
          <div style={{ width: 44, height: 44, borderRadius: SL.Radius.md, background: SL.Signal.actionTint, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <SLWorkoutSymbol dayName={workout.short} size={20} color={SL.Signal.action} />
          </div>
          <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
            <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={0.8} color={SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
              {`NEXT · ${whenLabel(day).toUpperCase()}`}
            </Text>
            <Text size={SL.TypeSize.title} weight={SL.Weight.bold} color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.8} style={{ maxWidth: "100%" }}>
              {workout.short}
            </Text>
            <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
              {`${sets} sets · ~${minutes} min`}
            </Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
          <SLGlyph name="chevronRight" size={13} color={SL.Ink.tertiary} />
        </HStack>
      </SLRowButton>
    );
  };

  /** The row's action, said on the row so it reads as one. */
  const ctaPill = (text: string) => (
    <span
      style={{
        ...slFont(SL.TypeSize.meta, SL.Weight.semibold),
        color: SL.Signal.action,
        background: SL.Signal.actionTint,
        borderRadius: 999,
        padding: `0 ${SL.Space.s3}px`,
        minHeight: 30,
        display: "inline-flex",
        alignItems: "center",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {text}
    </span>
  );

  const ownRow = (symbol: string, title: string, detail: string, trailing: ReactNode) => (
    <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 60 }}>
      <div style={{ width: 44, display: "flex", justifyContent: "center", flexShrink: 0 }}>
        <SFSymbol name={symbol} size={15} weight={600} color={SL.Signal.action} />
      </div>
      <VStack alignment="leading" spacing={1} style={{ minWidth: 0, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary}>
          {title}
        </Text>
        <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={2}>
          {detail}
        </Text>
      </VStack>
      <Spacer minLength={SL.Space.s2} />
      {trailing}
    </HStack>
  );

  /** Your own week, right under the next workout it decides. User tests looked for it here and didn't find it inside "Plan & workouts". */
  const ownWeekRow = (() => {
    const summary = app.ownWeek ? ownWeekSummary(app.ownWeek, app.schedulePlan) : undefined;
    return (
      <SLRowButton
        onPress={() => setSheet({ kind: "ownWeek" })}
        aria-label={summary ? `Your week: ${summary}` : "Set up your week"}
      >
        {ownRow("calendar", "Your week", summary ?? "A workout for each day", ctaPill(summary ? "Edit" : "Set up"))}
      </SLRowButton>
    );
  })();

  /** Your own workouts. With none yet, the row builds the first one straight away; after that it opens them, with every other workout. */
  const ownWorkoutsRow = (() => {
    const own = app.customWorkouts.length;
    const detail = own === 0 ? "Build one from any exercises" : `${own === 1 ? "1 of your own" : `${own} of your own`} · start any workout`;
    return (
      <SLRowButton onPress={() => setSheet({ kind: own === 0 ? "newWorkout" : "chooser" })}>
        {ownRow("square.stack.3d.up", "Your workouts", detail, own === 0 ? ctaPill("Create") : <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />)}
      </SLRowButton>
    );
  })();

  /** Every logged workout: the card's quiet second row. */
  const allWorkoutsRow = (() => {
    const count = app.sessions.filter((s) => s.kind === "workout").length;
    return (
      <SLRowButton onPress={() => setSheet({ kind: "history" })} aria-label={`All workouts, ${count}`}>
        <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 52 }}>
          <div style={{ width: 44, display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <SLGlyph name="list" size={16} color={SL.Ink.secondary} />
          </div>
          <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary}>
            All workouts
          </Text>
          <Spacer minLength={SL.Space.s2} />
          <Text {...slBody()} numerals color={SL.Ink.secondary}>
            {`${count}`}
          </Text>
          <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
        </HStack>
      </SLRowButton>
    );
  })();

  const rowHairline = <SLHairline style={{ marginLeft: SL.Space.s4 + 44 + SL.Space.s3 }} />;

  /** What's next and what's yours: one card. The next workout after today, your week, your workouts, and every logged workout. */
  const planCard = (day: AgendaDay) => {
    const next = nextTraining(day.date);
    return (
      <div style={{ position: "relative", alignSelf: "stretch", borderRadius: SL.Radius.xl, background: SL.Surface.raised }}>
        <VStack spacing={0} style={{ alignItems: "stretch", borderRadius: SL.Radius.xl, overflow: "hidden" }}>
          {next !== undefined && AgendaDay.plannedDay(next) !== undefined && (
            <>
              {nextSessionRow(next)}
              {rowHairline}
            </>
          )}
          {ownWeekRow}
          {rowHairline}
          {ownWorkoutsRow}
          {rowHairline}
          {allWorkoutsRow}
        </VStack>
        <StrokeBorder radius={SL.Radius.xl} color={SL.Surface.hairline} />
      </div>
    );
  };

  // MARK: - Badges

  /** A topic's name over its card, with its one way further — the same head Quick progress wears. */
  const topicHead = (title: string, link: string, action: () => void, lit = false) => (
    <HStack alignment="firstTextBaseline" style={{ paddingLeft: SL.Space.s1, alignSelf: "stretch" }}>
      <SLOverline text={title} color={lit ? SL.Signal.action : SL.Ink.secondary} />
      <Spacer />
      <button
        type="button"
        className="sl-pressable"
        onClick={action}
        style={{ display: "flex", alignItems: "center", gap: 4, minHeight: SL.Space.hitMin, color: SL.Ink.secondary, background: "transparent", flexShrink: 0 }}
      >
        <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>
          {link}
        </Text>
        <SLGlyph name="chevronRight" size={12} />
      </button>
    </HStack>
  );

  /** A badge won today, or the next one to win: compact and secondary. */
  const badgeSection = (day: AgendaDay): ReactNode => {
    const isDone = AgendaDay.session(day) !== undefined && app.resumableSession === undefined;
    const badge = earnedToday[0];
    if (badge !== undefined) {
      return (
        <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          {topicHead("New badge", "All badges", () => setSheet({ kind: "milestones" }))}
          <SLPress onPress={() => setSheet({ kind: "badge", value: badge })} style={{ alignSelf: "stretch" }}>
            <div style={{ position: "relative", padding: SL.Space.s4, borderRadius: SL.Radius.xl, background: SL.Surface.raised }}>
              <EarnedBadgeRow milestone={badge} next={nextMilestone(badge)} />
              <StrokeBorder radius={SL.Radius.xl} color={colorOpacity(SL.Signal.action, 0.35)} />
            </div>
          </SLPress>
        </VStack>
      );
    }
    const goal = badgeGoal(day, isDone);
    if (goal === undefined) return null;
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        {topicHead(goal.unlocks ? "Unlocks today" : "Next badge", "All badges", () => setSheet({ kind: "milestones" }), goal.unlocks)}
        <NextBadgeCard milestone={goal.milestone} unlocks={goal.unlocks} onOpen={() => setSheet({ kind: "badge", value: goal.milestone })} />
      </VStack>
    );
  };

  // MARK: - Herstel

  /** Shown while there is something to say: a proposal waiting for an answer, the lighter days it led to, or that it was just waved away. */
  const recoveryStatus: DeloadCard_Status | undefined = (() => {
    const ignored = ignoredProposal;
    if (app.activeDeload !== undefined) return "applied";
    if (ignored) return "ignored";
    return app.proposesDeload ? "open" : undefined;
  })();

  const recoverySection = (status: DeloadCard_Status) => (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      {/* Headed like the page's other sections, the moon kept beside it. */}
      <HStack spacing={6} style={{ paddingLeft: SL.Space.s1 }}>
        <SLGlyph name="moon" size={14} color={SL.Signal.recovery} />
        <SLOverline text="Herstel" />
      </HStack>
      <DeloadCard
        reading={app.fatigue}
        proposal={app.activeDeload ?? Deload.make({ startedAt: new Date() })}
        status={status}
        onApply={() => void app.applyDeload()}
        onDismiss={() => {
          setIgnoredProposal(true);
          app.dismissDeload();
        }}
      />
    </VStack>
  );

  // MARK: - Offline

  const offlineText = (() => {
    const count = queue.length;
    const waiting = count === 0 ? "" : count === 1 ? " 1 change waiting to sync." : ` ${count} changes waiting to sync.`;
    return `Nothing lost: everything is saved on this phone.${waiting} Logging works offline; syncing happens as soon as you're connected.`;
  })();

  /** Sync failure is a state of the data, not a red box: amber says so, the reassurance is in plain words. */
  const offlineCard = (
    <div style={{ alignSelf: "stretch" }}>
      <SLAttentionCard title="Offline">
        <Text {...slBody()} numerals color={SL.Ink.primary} style={slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.body })}>
          {slUnbroken(offlineText)}
        </Text>
        <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", paddingTop: SL.Space.s2 }}>
          <SLOutlineButton onPress={() => void app.syncNow()} disabled={app.sync.kind === "syncing"}>
            {app.sync.kind === "syncing" ? "Syncing…" : "Try again now"}
          </SLOutlineButton>
        </div>
      </SLAttentionCard>
    </div>
  );

  const queueSection = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <SLSectionHead title="Waiting to sync" />
      <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch", background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
        {queue.map((row, index) => (
          <div key={index} style={{ position: "relative" }}>
            <HStack alignment="center" spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3, minHeight: 72 }}>
              <VStack alignment="leading" spacing={3} style={{ flex: "1 1 0" }}>
                <Text {...slLead()} color={SL.Ink.primary}>
                  {row.title}
                </Text>
                <Text {...slBody()} numerals color={SL.Ink.secondary}>
                  {row.detail}
                </Text>
              </VStack>
              <Text {...slMeta(SL.Weight.semibold)} color={SL.Signal.attention}>
                Wacht
              </Text>
            </HStack>
            {index > 0 && (
              <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
                <SLHairline />
              </div>
            )}
          </div>
        ))}
      </VStack>
      <Text {...slMeta()} color={SL.Ink.secondary} style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.meta }), paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
        SETLINE saves on your phone first and syncs after. Export works offline too.
      </Text>
    </VStack>
  );

  // MARK: - The sheets

  const preview = (day: AgendaDay): ReactNode => {
    const workout = AgendaDay.plannedDay(day);
    if (workout === undefined) return null;
    const isMissed = day.content.kind === "missed";
    return (
      <WorkoutPreviewView
        day={day}
        workout={workout}
        // A paused session is resumed from the card, never started over from here.
        onStart={day.isToday && app.resumableSession === undefined ? () => after(() => onStart(workout)) : undefined}
        onLogPast={isMissed ? () => after(() => onLogPast(workout, day.date)) : undefined}
        onChangeDay={() => setSheet({ kind: "plan", value: day.date })}
        onClose={() => setSheet(undefined)}
      />
    );
  };

  const renderSheet = (presented: Presented): ReactNode => {
    switch (presented.kind) {
      case "agenda":
        return (
          <AgendaSheet
            initialDate={selectedDate ?? new Date()}
            selectedKey={selectedDay?.key ?? ""}
            onSelect={(d) => select(d)}
            onPreview={(d) => {
              select(d);
              setSheet({ kind: "preview", value: d });
            }}
            onClose={() => setSheet(undefined)}
          />
        );
      case "alerts":
        return (
          <AlertCenterSheet
            onLogPast={(workout, date) => after(() => onLogPast(workout, date))}
            onResume={() => {
              const paused = app.resumableSession;
              const day = paused ? app.day({ for: paused }) : undefined;
              if (paused === undefined || day === undefined) return;
              after(() => onResume(day, paused));
            }}
            onNutrition={() => after(onNutrition)}
            onProgress={() => after(onProgress)}
            onClose={() => setSheet(undefined)}
          />
        );
      case "streak":
        return (
          <>
            <Presentation detents={["large"]} />
            <StreakSheet streak={app.streak} onClose={() => setSheet(undefined)} />
          </>
        );
      case "milestones":
        return <MilestonesView milestones={milestones} onClose={() => setSheet(undefined)} />;
      case "badge":
        return (
          <>
            <Presentation detents={["medium"]} />
            <BadgeDetail milestone={presented.value} />
          </>
        );
      case "preview":
        return preview(presented.value);
      case "history":
        return <HistorySheet onClose={() => setSheet(undefined)} />;
      case "chooser":
        return (
          <WorkoutChooserSheet
            onStart={(day) => after(() => onStart(day))}
            onChangePlan={() => after(() => setChoosingProgram(true))}
            onClose={() => setSheet(undefined)}
          />
        );
      case "ownWeek":
        return <OwnWeekSheet onClose={() => setSheet(undefined)} />;
      case "newWorkout":
        return (
          <CustomWorkoutBuilder
            workout={undefined}
            onSave={(saved, start) => {
              setSheet(undefined);
              void app.saveCustomWorkout(saved).then(() => {
                if (start && app.resumableSession === undefined) after(() => onStart(CustomWorkout.workoutDay(saved)));
              });
            }}
            onDelete={undefined}
            onClose={() => setSheet(undefined)}
          />
        );
      case "plan": {
        const date = presented.value;
        return (
          <DayPlanSheet
            plan={dayPlan(date)}
            onApply={(option) => {
              const plan = dayPlan(date);
              setSheet(undefined);
              const change = DayPlan.change(plan, { for: option, programKey: app.programKey });
              if (change === undefined) return;
              void app.record([change]);
            }}
            onOpenSession={(session) => after(() => setOpenedSession(session.id))}
            onClose={() => setSheet(undefined)}
          />
        );
      }
    }
  };

  // MARK: - Body

  return (
    <>
      <style>{"@keyframes sl-training-breathe { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(1.7); } }"}</style>
      <SLTabHeaderPinned header={header}>
        <ScrollView style={{ flex: "1 1 0" }}>
          {/* Three topics, each its own block: 12 inside a block, 32 between blocks. */}
          <VStack
            alignment="leading"
            spacing={betweenTopics}
            style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s6 }}
          >
            {isOffline && offlineCard}
            {today !== undefined && (
              <>
                <VStack alignment="leading" spacing={insideTopic} style={{ alignSelf: "stretch" }}>
                  {streakCard(today)}
                  {todayCard(today)}
                  {planCard(today)}
                  {recoveryStatus !== undefined && recoverySection(recoveryStatus)}
                </VStack>
                {badgeSection(today)}
                {/* Day one has nothing to chart: no empty card. */}
                {app.sessions.some((s) => s.kind === "workout") && <QuickProgressCard onSeeAll={onProgress} />}
              </>
            )}
            {isOffline && queue.length > 0 && queueSection}
          </VStack>
        </ScrollView>
      </SLTabHeaderPinned>

      <Sheet isPresented={sheet !== undefined} onDismiss={() => setSheet(undefined)}>
        {shownSheet !== undefined && (
          <div key={presentedID(shownSheet)} style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
            {renderSheet(shownSheet)}
          </div>
        )}
      </Sheet>

      <FullScreenCover isPresented={openedSession !== undefined}>
        {lastSession.current !== undefined && <SessionDetailView sessionID={lastSession.current} onClose={() => setOpenedSession(undefined)} />}
      </FullScreenCover>

      <FullScreenCover isPresented={choosingProgram}>
        <ProgramSheet
          programs={ProgramCatalog.all({ personalPlan: app.plan })}
          current={ProgramCatalog.current({ in: app.state ?? { raw: {} }, plan: app.plan })}
          onSave={(program) => {
            setChoosingProgram(false);
            void app.record([StateChange.make({ kind: "setProgram", mode: program.mode, sciencePlanID: program.sciencePlanID })]);
          }}
          onClose={() => setChoosingProgram(false)}
        />
      </FullScreenCover>

      <Alert
        isPresented={confirmsEnd}
        onDismiss={() => setConfirmsEnd(false)}
        title="End the session?"
        message={endMessage}
        actions={[
          { title: "Cancel", role: "cancel" },
          { title: "End", action: () => void app.endActiveSession() },
        ]}
      />
    </>
  );
}
