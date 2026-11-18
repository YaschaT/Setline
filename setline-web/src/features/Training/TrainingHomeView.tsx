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
import { scaledMetric, slFixed, slLineHeight } from "../../design/SLDynamicType";
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
import { ActiveSessionSnapshot } from "../../core/Domain/ActiveSession";
import type { TrainingSession, WorkoutDay } from "../../core/Domain/Model";
import { AgendaSheet } from "./AgendaSheet";
import { AlertCenterSheet, Alerts } from "./AlertCenterSheet";
import { DayPlanSheet } from "./DayPlanSheet";
import { DeloadCard, type DeloadCard_Status } from "./DeloadCard";
import { HistorySheet, QuickProgressCard } from "./QuickProgressCard";
import { NextBadgeCard } from "./StreakHero";
import { CustomWorkoutBuilder, Freestyle, WorkoutChooserSheet } from "./WorkoutChooser";
import { ExercisePickerSheet } from "../Progress/ExercisePickerSheet";
import { ExercisePicker, type ExercisePicker_Row } from "../../core/Progress/ExercisePicker";
import { PlansSheet } from "./PlansSheet";
import { CustomWorkout, CustomWorkout_Item } from "../../core/Domain/CustomWorkout";
import { WorkoutPreviewView } from "./WorkoutPreviewView";
import { StripDay } from "./WeekStrip";
import { SessionDetailView } from "../Progress/SessionDetailView";

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
  | { kind: "plans" }
  | { kind: "newWorkout" }
  | { kind: "editWorkout"; value: CustomWorkout }
  | { kind: "freestyle" };

const presentedID = (p: Presented): string => {
  switch (p.kind) {
    case "badge":
      return `badge-${p.value.id}`;
    case "preview":
      return `preview-${p.value.key}`;
    case "plan":
      return `plan-${Schedule.dateKey(p.value)}`;
    case "editWorkout":
      return `edit-${p.value.id}`;
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
  const [confirmsEndForFreestyle, setConfirmsEndForFreestyle] = useState(false);
  const [deleting, setDeleting] = useState<CustomWorkout | undefined>(undefined);
  /** The plan shape, chosen from the workout chooser. */
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
  /** The first-time question was answered (or put off): it never comes back. */
  const [startChosen, setStartChosen] = useAppStorage("setline.training.startChosen", false);

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

  /** "Monday wasn't logged · Log it": the missed day, answered where it shows. */
  const missedLine = (missed: { day: AgendaDay; workout: WorkoutDay }) => (
    <button
      type="button"
      className="sl-pressable"
      onClick={() => onLogPast(missed.workout, missed.day.date)}
      aria-label={`${WeekPlan.fullWeekday(missed.day.date)} wasn't logged. Log ${missed.workout.short}`}
      style={{ display: "flex", alignItems: "center", gap: SL.Space.s2, minHeight: SL.Space.hitMin, alignSelf: "stretch", background: "transparent", textAlign: "left" }}
    >
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: SL.Ink.tertiary, flexShrink: 0 }} />
      <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={2}>
        {`Trained ${WeekPlan.fullWeekday(missed.day.date)}? You can still log it`}
      </Text>
      <Spacer minLength={SL.Space.s2} />
      <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.primary} style={{ flexShrink: 0 }}>
        Log it
      </Text>
      <SLGlyph name="chevronRight" size={11} color={SL.Ink.tertiary} />
    </button>
  );

  /** The plan the week follows, on the week, saying it can be changed. */
  const planPill = (
    <SLPress
      scale={0.94}
      onPress={() => setSheet({ kind: "plans" })}
      aria-label={`Your plan: ${app.planName}. Change it, or make your own plan`}
      style={{
        ...slFont(SL.TypeSize.meta, SL.Weight.semibold),
        color: SL.Signal.action,
        background: SL.Signal.actionTint,
        borderRadius: 999,
        minHeight: 32,
        padding: `0 ${SL.Space.s3}px`,
        display: "flex",
        alignItems: "center",
        gap: 5,
        alignSelf: "flex-start",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <SFSymbol name="calendar" size={12} weight={700} color={SL.Signal.action} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{app.planName}</span>
      <span style={{ ...slFont(SL.TypeSize.meta, SL.Weight.medium), opacity: 0.75, flexShrink: 0 }}>· Change</span>
    </SLPress>
  );

  const hasTrained = app.sessions.some((s) => s.kind === "workout");

  /** The streak, small: weeks in a row in lime once there is one. Opens the streak sheet. */
  const streakChip = (streak: TrainingStreak) => {
    const lit = streak.weeks > 0;
    const shown = rolledWeeks ?? streak.weeks;
    const ink = lit ? SL.Signal.action : SL.Ink.secondary;
    return (
      <SLPress
        scale={0.94}
        onPress={() => setSheet({ kind: "streak" })}
        aria-label={lit ? `${streak.weeks}-week streak. Shows your streak and badges` : "No streak yet. Shows your streak and badges"}
        style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", background: "transparent", flexShrink: 0 }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 30, padding: `0 ${SL.Space.s3}px`, borderRadius: 999, background: lit ? SL.Signal.actionTint : SL.Surface.raised2, color: ink }}>
          <SFSymbol name="flame.fill" size={11} weight={700} color={ink} />
          <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals color={ink} lineLimit={1}>
            {lit ? `${shown}-week streak` : "Streak"}
          </Text>
        </span>
      </SLPress>
    );
  };

  /** One line, only when the week has something to say: done, or the streak needs you. Never before a first workout. */
  const weekNudge = (streak: TrainingStreak): { text: string; ink: string } | undefined => {
    if (!hasTrained) return undefined;
    if (TrainingStreak.thisWeekMet(streak)) return { text: "Week done · your streak is safe", ink: SL.Signal.action };
    if (streak.weeks === 0) return undefined;
    const left = Math.max(streak.thisWeekGoal - streak.thisWeekDone, 0);
    switch (streakRisk(streak)) {
      case "tight":
        return { text: left === 1 ? "Last chance: 1 more this week keeps your streak" : `${left} more this week keep your streak`, ink: SL.Signal.attention };
      case "breaks":
        return { text: "Out of reach this week · your streak starts again Monday", ink: SL.Ink.secondary };
      case "freezeCovers":
        return { text: "Out of reach · your freeze keeps the streak", ink: SL.Ink.secondary };
      default:
        return undefined;
    }
  };

  const weekLink = (title: string, glyph: "calendar" | "clock", action: () => void) => (
    <button
      type="button"
      className="sl-pressable"
      onClick={action}
      style={{ display: "flex", alignItems: "center", gap: 6, minHeight: SL.Space.hitMin, color: SL.Ink.secondary, background: "transparent" }}
    >
      <SLGlyph name={glyph} size={13} />
      <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>
        {title}
      </Text>
      <SLGlyph name="chevronRight" size={11} />
    </button>
  );

  /** "Push", "Rest", or what was done. */
  const dayLabel = (day: AgendaDay): string => {
    const session = AgendaDay.session(day);
    if (session !== undefined) return session.dayLabel;
    if (AgendaDay.isRest(day)) return "Rest";
    return AgendaDay.plannedDay(day)?.short ?? "";
  };

  const dayLabelInk = (day: AgendaDay): string => {
    if (AgendaDay.isLogged(day)) return SL.Signal.action;
    if (day.isToday) return SL.Ink.primary;
    if (AgendaDay.isRest(day)) return colorOpacity(SL.Signal.recovery, 0.8);
    if (day.isPast) return SL.Ink.tertiary;
    return SL.Ink.secondary;
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
      // A planned day that went by: muted, apart from the days still to come, but not a warning.
      return circle({ boxShadow: `inset 0 0 0 1.5px ${SL.Surface.mute}` }, <SFSymbol name="xmark" size={8} weight={700} color={SL.Ink.tertiary} />);
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
              {/* What the day holds, in words: no legend to learn. */}
              <span
                style={{
                  ...slFixed(10, day.isToday ? SL.Weight.bold : SL.Weight.medium),
                  color: dayLabelInk(day),
                  maxWidth: "100%",
                  padding: "0 1px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {dayLabel(day)}
              </span>
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
   * This week in plain words: how many of the week's workouts are done, the streak as a small chip, the plan the week
   * follows with a way to change it, the seven days each saying what they hold, and the agenda and history one tap away.
   */
  const weekCard = (day: AgendaDay) => {
    const streak = app.streak;
    const secured = securedToday(day, streak);
    const done = Math.min(streak.thisWeekDone, streak.thisWeekGoal);
    const nudge = weekNudge(streak);
    const met = TrainingStreak.thisWeekMet(streak);
    return (
      <div style={{ position: "relative", alignSelf: "stretch", borderRadius: SL.Radius.xl, background: heroBackground(secured, streak) }}>
        <div style={{ borderRadius: SL.Radius.xl, overflow: "hidden" }}>
          <VStack alignment="leading" spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s5, paddingRight: SL.Space.s5, paddingTop: SL.Space.s4, paddingBottom: SL.Space.s3 }}>
            <HStack alignment="center" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
              <span aria-label={`This week: ${done} of ${streak.thisWeekGoal} workouts`} style={{ whiteSpace: "nowrap" }}>
                <SLOverline text={`This week · ${done} of ${streak.thisWeekGoal}`} color={met ? SL.Signal.action : SL.Ink.secondary} />
              </span>
              <Spacer minLength={SL.Space.s2} />
              {streakChip(streak)}
            </HStack>
            {planPill}
            {weekDots}
            {nudge !== undefined && (
              <HStack spacing={4} style={{ color: nudge.ink, alignSelf: "stretch" }}>
                {met && <SLGlyph name="check" size={11} />}
                <Text {...slMeta(SL.Weight.medium)} color={nudge.ink}>
                  {nudge.text}
                </Text>
              </HStack>
            )}
            {/* New here: nothing to have missed yet. */}
            {hasTrained && lastMissed !== undefined && missedLine(lastMissed)}
            <div aria-hidden style={{ height: SL.Metric.border, alignSelf: "stretch", marginLeft: -SL.Space.s5, marginRight: -SL.Space.s5, background: SL.Surface.hairline }} />
            <HStack spacing={0} style={{ alignSelf: "stretch", marginTop: -SL.Space.s2, marginBottom: -SL.Space.s2 }}>
              {weekLink("Agenda", "calendar", () => setSheet({ kind: "agenda" }))}
              <Spacer minLength={SL.Space.s2} />
              {weekLink("History", "clock", () => setSheet({ kind: "history" }))}
            </HStack>
          </VStack>
        </div>
        <StrokeBorder radius={SL.Radius.xl} color={secured ? colorOpacity(SL.Signal.action, 0.45) : SL.Surface.hairline} />
      </div>
    );
  };

  // MARK: - Day one

  /** Nothing trained, nothing made, no week of your own: ask once how this person wants to train. */
  const asksHowToTrain =
    !startChosen && app.resumableSession === undefined && app.ownWeek === undefined && app.customWorkouts.length === 0 && !hasTrained;

  const choose = (next: Presented) => {
    setStartChosen(true);
    setSheet(next);
  };

  const startOption = (symbol: string, title: string, detail: string, action: () => void) => (
    <SLPress
      scale={0.98}
      onPress={action}
      aria-label={`${title}. ${detail}`}
      style={{ alignSelf: "stretch", display: "flex", alignItems: "center", gap: SL.Space.s3, padding: SL.Space.s3, borderRadius: SL.Radius.lg, background: SL.Surface.raised, textAlign: "left" }}
    >
      <span style={{ width: 40, height: 40, borderRadius: SL.Radius.md, background: SL.Signal.actionTint, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <SFSymbol name={symbol} size={16} weight={600} color={SL.Signal.action} />
      </span>
      <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
        <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
          {title}
        </Text>
        <Text {...slMeta()} color={SL.Ink.secondary}>
          {detail}
        </Text>
      </VStack>
      <SLGlyph name="chevronRight" size={12} color={SL.Ink.tertiary} />
    </SLPress>
  );

  const startQuestion = (
    <div style={{ position: "relative", alignSelf: "stretch", padding: SL.Space.s5, borderRadius: SL.Radius.xl, background: SL.Signal.actionTint }}>
      <VStack alignment="leading" spacing={SL.Space.s3}>
        <HStack alignment="firstTextBaseline" style={{ alignSelf: "stretch" }}>
          <SLOverline text="Welcome" color={SL.Signal.action} />
          <Spacer />
          <button
            type="button"
            className="sl-pressable"
            onClick={() => setStartChosen(true)}
            style={{ minHeight: SL.Space.hitMin, marginTop: -SL.Space.s3, marginBottom: -SL.Space.s3, background: "transparent" }}
          >
            <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>
              Not now
            </Text>
          </button>
        </HStack>
        <Text as="h2" size={SL.TypeSize.title} weight={SL.Weight.bold} color={SL.Ink.primary}>
          How do you want to train?
        </Text>
        <VStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          {startOption("calendar", "Follow a plan", "One of ours, like Push / Pull / Legs. It fills your week.", () => choose({ kind: "plans" }))}
          {startOption("square.stack.3d.up.fill", "Build my own", "Your exercises, sets and reps.", () => choose({ kind: "newWorkout" }))}
          {startOption("figure.strengthtraining.traditional", "Freestyle", "Pick each machine as you go. Nothing to set up.", () => choose({ kind: "freestyle" }))}
        </VStack>
      </VStack>
      <StrokeBorder radius={SL.Radius.xl} color={colorOpacity(SL.Signal.action, 0.35)} />
    </div>
  );

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
      <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals color={SL.Signal.action} lineLimit={2}>
        {lifts.length === 1 ? "Heavier today: " : `Heavier today on ${lifts.length} lifts, like `}
        <span style={{ fontWeight: SL.Weight.regular }}>{`${lifts[0].name} ${NumberDisplay.kg(app.display, lifts[0].toKg)}`}</span>
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
        {/* Today's workout, still to do: the name is the way into its exercises, with a chevron to say so. Nothing starts. */}
        {day.isToday && AgendaDay.plannedDay(day) !== undefined && !isDone && !content.isRest && paused === undefined ? (
          <SLPress
            scale={0.98}
            onPress={() => setSheet({ kind: "preview", value: day })}
            aria-label={`${content.title}. Shows today's exercises. Nothing starts.`}
            style={{ alignSelf: "stretch", display: "flex", alignItems: "center", gap: SL.Space.s2, paddingTop: 2, textAlign: "left", background: "transparent" }}
          >
            <Text as="h2" size={SL.TypeSize.display} weight={SL.Weight.bold} tracking={-0.02 * SL.TypeSize.display} color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.7} style={{ minWidth: 0 }}>
              {content.title}
            </Text>
            <SLGlyph name="chevronRight" size={16} color={SL.Ink.tertiary} />
          </SLPress>
        ) : (
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
        )}

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
        {/* Always there today — paused or done included: Freestyle with a paused workout asks to end it first (its sets stay logged). */}
        {day.isToday &&
          (content.isRest && !isDone ? (
            <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SL.Space.s2, marginTop: SL.Space.s5 }}>
              <SLOutlineButton onPress={() => setSheet({ kind: "chooser" })}>{chevroned("Train anyway")}</SLOutlineButton>
              {freestyleButton}
            </div>
          ) : (
            // Another workout, or none at all: pick machines as you go.
            <div style={{ alignSelf: "stretch", display: "flex", gap: SL.Space.s2, marginTop: SL.Space.s3 }}>
              <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column" }}>
                <SLOutlineButton emphasis="tertiary" onPress={() => setSheet({ kind: "chooser" })}>Choose another</SLOutlineButton>
              </div>
              <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column" }}>{freestyleButton}</div>
            </div>
          ))}
      </VStack>
    );
  };

  /** Today's workout, on its own card: the workout as it was, one action. */
  /** Today, and under a hairline what comes after it: one story, one card. */
  const todayCard = (day: AgendaDay) => {
    const next = nextTraining(day.date);
    return (
      <div style={{ position: "relative", alignSelf: "stretch", borderRadius: 28, background: SL.Surface.raised, overflow: "hidden" }}>
        <div style={{ padding: SL.Space.s5 }}>{todayBlock(day)}</div>
        {next !== undefined && AgendaDay.plannedDay(next) !== undefined && (
          <>
            <SLHairline />
            {nextSessionRow(next)}
          </>
        )}
        <StrokeBorder radius={28} color={colorOpacity(SL.Surface.hairlineStrong, 0.6)} />
      </div>
    );
  };

  // MARK: - The plan card

  /** No plan, no workout made beforehand: the first machine, then the next. */
  const freestyleButton = (
    <SLOutlineButton
      emphasis="tertiary"
      onPress={() => (app.resumableSession !== undefined ? setConfirmsEndForFreestyle(true) : setSheet({ kind: "freestyle" }))}
      aria-label="Freestyle. Pick each machine as you go"
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <SFSymbol name="figure.strengthtraining.traditional" size={15} weight={600} />
        Freestyle
      </span>
    </SLOutlineButton>
  );

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
        <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s5, paddingRight: SL.Space.s5, paddingTop: SL.Space.s4, paddingBottom: SL.Space.s4 }}>
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

  // MARK: - Your workouts

  const tileWidth = scaledMetric(164);

  /** Before there are any: what it is, said once, and the one way in. */
  const firstWorkoutCard = (
    <SLPress
      scale={0.98}
      onPress={() => setSheet({ kind: "newWorkout" })}
      style={{
        alignSelf: "stretch",
        display: "flex",
        alignItems: "center",
        gap: SL.Space.s4,
        padding: SL.Space.s4,
        borderRadius: SL.Radius.xl,
        background: SL.Surface.raised,
        border: `1px dashed ${colorOpacity(SL.Signal.action, 0.35)}`,
        textAlign: "left",
      }}
    >
      <span style={{ width: 52, height: 52, borderRadius: "50%", background: SL.Signal.action, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <SFSymbol name="plus" size={20} weight={700} color={SL.Signal.onAction} />
      </span>
      <VStack alignment="leading" spacing={2} style={{ minWidth: 0, flex: "1 1 0" }}>
        <Text size={SL.TypeSize.lead} weight={SL.Weight.bold} color={SL.Ink.primary}>
          Create your own workout
        </Text>
        <Text {...slMeta()} color={SL.Ink.secondary}>
          Pick the exercises, sets and reps. Start it any time, or put it on a day in your week.
        </Text>
      </VStack>
    </SLPress>
  );

  const tileStyle: CSSProperties = {
    width: tileWidth,
    minHeight: 156,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: SL.Space.s2,
    padding: SL.Space.s4,
    borderRadius: SL.Radius.xl,
    textAlign: "left",
    scrollSnapAlign: "start",
    scrollMarginLeft: SL.Space.gutterSession,
  };

  const workoutTile = (workout: CustomWorkout) => {
    const day = CustomWorkout.workoutDay(workout);
    const count = day.exercises.length === 1 ? "1 exercise" : `${day.exercises.length} exercises`;
    const minutes = WeekPlan.minutes({ of: day });
    return (
      <div key={workout.id} style={{ position: "relative", flexShrink: 0, scrollSnapAlign: "start", scrollMarginLeft: SL.Space.gutterSession }}>
        <SLPress
          scale={0.96}
          onPress={() => setSheet({ kind: "editWorkout", value: workout })}
          aria-label={`${workout.name}, ${count}, about ${minutes} minutes`}
          style={{ ...tileStyle, background: SL.Surface.raised, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}` }}
        >
          <span style={{ width: 40, height: 40, borderRadius: SL.Radius.md, background: SL.Signal.actionTint, display: "grid", placeItems: "center" }}>
            <SFSymbol name="square.stack.3d.up.fill" size={16} weight={600} color={SL.Signal.action} />
          </span>
          <Spacer minLength={SL.Space.s2} />
          <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={2}>{workout.name}</Text>
          <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1}>{`${count} · ~${minutes} min`}</Text>
        </SLPress>
        <div style={{ position: "absolute", top: SL.Space.s2, right: SL.Space.s2, display: "flex" }}>
          {/* Edit and delete, one quiet tap away. */}
          <Menu
            aria-label={`More for ${workout.name}`}
            style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "grid", placeItems: "center" }}
            entries={[
              ...(app.resumableSession === undefined
                ? [{ kind: "button" as const, title: "Start", systemImage: "play.fill", action: () => onStart(day) }]
                : []),
              { kind: "button" as const, title: "Edit", systemImage: "pencil", action: () => setSheet({ kind: "editWorkout", value: workout }) },
              { kind: "button" as const, title: "Delete", systemImage: "trash", role: "destructive" as const, action: () => setDeleting(workout) },
            ]}
            label={
              <span style={{ width: 32, height: 32, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
                <SFSymbol name="ellipsis" size={14} weight={700} color={SL.Ink.secondary} />
              </span>
            }
          />
          {/* A paused workout is finished or ended first, so nothing is overwritten. */}
          {app.resumableSession === undefined && (
            <SLPress
              scale={0.88}
              bounces
              onPress={() => onStart(day)}
              aria-label={`Start ${workout.name}`}
              style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "grid", placeItems: "center", background: "transparent" }}
            >
              <span style={{ width: 36, height: 36, borderRadius: "50%", background: SL.Signal.action, display: "grid", placeItems: "center" }}>
                <SFSymbol name="play.fill" size={13} weight={700} color={SL.Signal.onAction} />
              </span>
            </SLPress>
          )}
        </div>
      </div>
    );
  };

  /**
   * Workouts you put together yourself, as a shelf: making one comes first, then a tile per workout. Names get two
   * lines, so "Leg day + abs" fits; ▶ starts it, the tile opens it. Logged workouts are the head's History.
   */
  const workoutsShelf = () => {
    const own = app.customWorkouts;
    return (
      <VStack alignment="leading" spacing={insideTopic} style={{ alignSelf: "stretch" }}>
        {own.length === 0 ? (
          <>
            <div style={{ paddingLeft: SL.Space.s1 }}>
              <SLOverline text="Your workouts" />
            </div>
            {firstWorkoutCard}
          </>
        ) : (
          <>
          <HStack alignment="firstTextBaseline" style={{ paddingLeft: SL.Space.s1, alignSelf: "stretch" }}>
            <SLOverline text="Your workouts" />
            <Spacer />
            <button
              type="button"
              className="sl-pressable"
              onClick={() => setSheet({ kind: "newWorkout" })}
              aria-label="New workout"
              style={{ display: "flex", alignItems: "center", gap: 4, minHeight: SL.Space.hitMin, color: SL.Signal.action, background: "transparent", flexShrink: 0 }}
            >
              <SFSymbol name="plus" size={12} weight={700} color={SL.Signal.action} />
              <Text {...slMeta(SL.Weight.semibold)} color={SL.Signal.action}>
                New
              </Text>
            </button>
          </HStack>
          <div
            style={{
              alignSelf: "stretch",
              display: "flex",
              gap: SL.Space.s3,
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              scrollbarWidth: "none",
              marginLeft: -SL.Space.gutterSession,
              marginRight: -SL.Space.gutterSession,
              paddingLeft: SL.Space.gutterSession,
              paddingRight: SL.Space.gutterSession,
            }}
          >
            {own.map(workoutTile)}
          </div>
          </>
        )}
      </VStack>
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

  /** How it's going, as one block: the lift chart once there is one, and the badge — won today, or the next — as one row under it. */
  const progressSection = (day: AgendaDay): ReactNode => {
    const isDone = AgendaDay.session(day) !== undefined && app.resumableSession === undefined;
    const badge = earnedToday[0];
    const goal = badge === undefined ? badgeGoal(day, isDone) : undefined;
    return (
      <VStack alignment="leading" spacing={insideTopic} style={{ alignSelf: "stretch" }}>
        {hasTrained ? <QuickProgressCard onSeeAll={onProgress} /> : topicHead("Progress", "All badges", () => setSheet({ kind: "milestones" }))}
        {badge !== undefined && <NextBadgeCard milestone={badge} unlocks={false} onOpen={() => setSheet({ kind: "badge", value: badge })} compact won />}
        {goal !== undefined && <NextBadgeCard milestone={goal.milestone} unlocks={goal.unlocks} onOpen={() => setSheet({ kind: "badge", value: goal.milestone })} compact />}
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
            onClose={() => setSheet(undefined)}
          />
        );
      case "plans":
        return <PlansSheet onClose={() => setSheet(undefined)} />;
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
      case "freestyle":
        // The first machine you walk up to; the rest are added in the session.
        return (
          <ExercisePickerSheet
            rows={ExercisePicker.rowsSessions({ sessions: app.sessions, favorites: app.favoriteExercises, custom: app.customExercises })}
            selected={undefined}
            onPick={(row: ExercisePicker_Row) => {
              const first = CustomWorkout.make({ id: Freestyle.dayID, name: "Freestyle", items: [CustomWorkout_Item.make({ exerciseID: row.exerciseID })] });
              after(() => onStart(CustomWorkout.workoutDay(first)));
            }}
            onStar={(row: ExercisePicker_Row) => void app.setFavorite({ exerciseID: row.exerciseID, isFavorite: !row.isFavorite })}
            onClose={() => setSheet(undefined)}
            adds
          />
        );
      case "editWorkout": {
        const workout = presented.value;
        return (
          <CustomWorkoutBuilder
            workout={workout}
            onSave={(saved, start) => {
              setSheet(undefined);
              void app.saveCustomWorkout(saved).then(() => {
                if (start && app.resumableSession === undefined) after(() => onStart(CustomWorkout.workoutDay(saved)));
              });
            }}
            onDelete={() => {
              setSheet(undefined);
              void app.removeCustomWorkout({ id: workout.id });
            }}
            onClose={() => setSheet(undefined)}
          />
        );
      }
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
                {/* One question per block: what now, what's planned this week, what I've made, how it's going. */}
                {asksHowToTrain && startQuestion}
                <VStack alignment="leading" spacing={insideTopic} style={{ alignSelf: "stretch" }}>
                  {todayCard(today)}
                  {recoveryStatus !== undefined && recoverySection(recoveryStatus)}
                </VStack>
                {weekCard(today)}
                {workoutsShelf()}
                {progressSection(today)}
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

      <Alert
        isPresented={confirmsEndForFreestyle}
        onDismiss={() => setConfirmsEndForFreestyle(false)}
        title="End your paused workout?"
        message="What you logged in it stays. Freestyle starts once it's ended."
        actions={[
          { title: "Cancel", role: "cancel" },
          {
            title: "End it and go freestyle",
            action: () => {
              void app.endActiveSession().then(() => setSheet({ kind: "freestyle" }));
            },
          },
        ]}
      />

      <Alert
        isPresented={deleting !== undefined}
        onDismiss={() => setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? "this workout"}?`}
        message={deleting ? app.deleteNote({ forWorkout: deleting.id }) : ""}
        actions={[
          { title: "Cancel", role: "cancel" },
          {
            title: "Delete",
            role: "destructive",
            action: () => {
              if (deleting) void app.removeCustomWorkout({ id: deleting.id });
            },
          },
        ]}
      />
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
