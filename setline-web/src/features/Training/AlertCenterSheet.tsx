// AlertCenterSheet.swift — what the bell holds, and the sheet it opens.
import { useEffect, type ReactNode } from "react";
import { SL } from "../../design/tokens";
import { HStack, ScrollView, Spacer, Text, UserDefaults, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { colorOpacity } from "../../design/SetlineTokens";
import { SLGlyph, SLWorkoutSymbol } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slHitTarget, slMeta, slTitle } from "../../design/components";
import { SLOverline } from "../../design/components/SLPieces";
import { SLBadge } from "../../design/components/SLBadge";
import { SLMedal } from "../../design/components/SLMedal";
import { useApp, type AppState } from "../../data/AppState";
import { addingTimeInterval, components, daysBetween, startOfDay } from "../../core/Support/calendar";
import { compare } from "../../core/Support/swift";
import { Agenda, AgendaDay } from "../../core/Engine/Agenda";
import { Schedule } from "../../core/Engine/Schedule";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Milestones, type Milestone, type Milestone_Kind } from "../../core/Progress/Milestones";
import { Medals, LiftMedal_Place, type LiftMedal } from "../../core/Progress/Medals";
import { BodyProgress } from "../../core/Progress/BodyProgress";
import { MealWindow } from "../../core/Progress/WeightGoal";
import { TrainingStreak } from "../../core/Progress/TrainingStreak";
import type { WorkoutDay } from "../../core/Domain/Model";
import { ActiveSessionSnapshot } from "../../core/Domain/ActiveSession";
import { habitMilestones } from "../Progress/GoalViews";

/** `Alerts.Todo.Kind`. */
export type Alerts_Todo_Kind =
  | { kind: "paused" }
  | { kind: "missed"; _0: AgendaDay; _1: WorkoutDay }
  | { kind: "meals"; value: string[] }
  | { kind: "weighIn"; days: number };

/** `Alerts.Todo`. */
export interface Alerts_Todo {
  readonly id: string;
  readonly kind: Alerts_Todo_Kind;
}

/** `Alerts.Win.Kind`. */
export type Alerts_Win_Kind =
  | { kind: "badge"; value: Milestone }
  | { kind: "medal"; value: LiftMedal }
  | { kind: "week"; value: TrainingStreak };

/** `Alerts.Win`. */
export interface Alerts_Win {
  readonly id: string;
  readonly kind: Alerts_Win_Kind;
}

/** `NutritionReminders.mealsKey` (GoalViews.swift). */
const mealsKey = "setline.reminders.meals";
const seenWinsKey = "setline.alerts.seenWins";

/**
 * What the bell holds, read from the account: things to do, and this week's
 * wins. Only the to-dos count on the bell — wins are good news, never a chore.
 */
export const Alerts = {
  todos(app: AppState, a: { now?: Date } = {}): Alerts_Todo[] {
    const now = a.now ?? new Date();
    const list: Alerts_Todo[] = [];
    const paused = app.resumableSession;
    if (paused !== undefined) {
      list.push({ id: `paused-${paused.dayID}`, kind: { kind: "paused" } });
    }
    for (const day of app.missedDays) {
      const workout = AgendaDay.plannedDay(day);
      if (workout !== undefined) list.push({ id: `missed-${day.key}`, kind: { kind: "missed", _0: day, _1: workout } });
    }
    // Meals: only for someone who logs food — logged in the last week,
    // or meal reminders on — and only windows whose reminder time passed.
    const weekAgo = Schedule.dateKey(addingTimeInterval(now, -7 * 86_400));
    const mealsOn = UserDefaults.get<boolean>(mealsKey) === true;
    const tracksFood = mealsOn || app.nutritionEntries.some((e) => e.date >= weekAgo);
    if (tracksFood) {
      const c = components(now);
      const open = MealWindow.all.filter(
        (window) =>
          compare([c.hour, c.minute], [window.remindAt.hour, window.remindAt.minute]) >= 0 &&
          !MealWindow.isLogged(window, { in: app.nutritionEntries, on: now }),
      );
      if (open.length > 0) list.push({ id: `meals-${Schedule.dateKey(now)}`, kind: { kind: "meals", value: open.map((w) => w.label) } });
    }
    // A weigh-in: for someone who weighs in, after three days without one.
    const last = BodyProgress.latest(BodyProgress.make({ metrics: app.metrics }))?.date;
    if (last !== undefined) {
      const days = daysBetween(startOfDay(last), startOfDay(now));
      if (days >= 3 && days <= 30) list.push({ id: `weigh-${Schedule.dateKey(now)}`, kind: { kind: "weighIn", days } });
    }
    return list;
  },

  wins(app: AppState, a: { now?: Date } = {}): Alerts_Win[] {
    const now = a.now ?? new Date();
    const first = Schedule.mondayFirstWeek({ containing: now })[0];
    const weekStart = first !== undefined ? startOfDay(first) : now;
    const list: Alerts_Win[] = [];
    const badges = Milestones.reached({
      in: [...Milestones.make({ sessions: app.sessions, bestStreak: app.streak.best }), ...habitMilestones(app)],
      since: weekStart,
    });
    // Two steps of one ladder in a week are one piece of news: the higher.
    const top = new Map<Milestone_Kind, Milestone>();
    for (const badge of badges) {
      if (badge.target >= (top.get(badge.kind)?.target ?? -1)) top.set(badge.kind, badge);
    }
    list.push(...[...top.values()].sort((x, y) => y.tier - x.tier).map((m): Alerts_Win => ({ id: `badge-${m.id}`, kind: { kind: "badge", value: m } })));
    const streak = app.streak;
    if (TrainingStreak.thisWeekMet(streak)) list.push({ id: `week-${Schedule.dateKey(weekStart)}`, kind: { kind: "week", value: streak } });
    const golds = new Map<string, LiftMedal>();
    for (const session of app.sessions) {
      if (!(session.kind === "workout" && session.date.getTime() >= weekStart.getTime())) continue;
      for (const medal of Medals.medals({ for: session, in: app.sessions })) {
        if (medal.place === LiftMedal_Place.gold) golds.set(medal.exerciseID, medal);
      }
    }
    list.push(
      ...[...golds.values()]
        .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
        .map((m): Alerts_Win => ({ id: `gold-${m.exerciseID}-${Schedule.dateKey(weekStart)}`, kind: { kind: "medal", value: m } })),
    );
    return list;
  },

  /** A win not yet seen in the sheet: the bell's lime dot. */
  hasNewWins(app: AppState): boolean {
    const seen = new Set(UserDefaults.get<string[]>(seenWinsKey) ?? []);
    return Alerts.wins(app).some((w) => !seen.has(w.id));
  },

  markWinsSeen(app: AppState): void {
    const seen = new Set(UserDefaults.get<string[]>(seenWinsKey) ?? []);
    for (const w of Alerts.wins(app)) seen.add(w.id);
    UserDefaults.set(seenWinsKey, [...seen].slice(-200));
  },
};

/**
 * Alerts: what needs you, then what you earned this week. Opened from the
 * bell on Training.
 *
 * A missed workout asks one question with two answers: `Log it` writes it
 * down for that date; `Didn't train` closes the question on this phone and
 * changes nothing in the account — SETLINE never moves or marks a day itself.
 */
export function AlertCenterSheet({
  onLogPast,
  onResume = () => {},
  onNutrition = () => {},
  onProgress = () => {},
  onClose,
}: {
  onLogPast: (workout: WorkoutDay, date: Date) => void;
  onResume?: () => void;
  onNutrition?: () => void;
  onProgress?: () => void;
  onClose: () => void;
}) {
  const app = useApp();
  const todos = Alerts.todos(app);
  const wins = Alerts.wins(app);

  useEffect(() => {
    Alerts.markWinsSeen(app);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const section = (title: string, content: ReactNode) => (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <SLOverline text={title} style={{ paddingLeft: SL.Space.s1 }} />
      <VStack
        spacing={0}
        style={{ alignSelf: "stretch", alignItems: "stretch", background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}
      >
        {content}
      </VStack>
    </VStack>
  );

  const withHairline = (index: number, row: ReactNode, key: string) => (
    <div key={key} style={{ position: "relative" }}>
      {row}
      {index > 0 && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <SLHairline />
        </div>
      )}
    </div>
  );

  // MARK: - To do

  const primary = (title: string, perform: () => void) => (
    <button
      type="button"
      className="sl-pressable"
      onClick={perform}
      style={{ minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", flexShrink: 0, background: "transparent" }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          paddingLeft: SL.Space.s3,
          paddingRight: SL.Space.s3,
          minHeight: 32,
          borderRadius: SL.Radius.pill,
          background: SL.Signal.action,
          whiteSpace: "nowrap",
        }}
      >
        <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} color={SL.Signal.onAction}>
          {title}
        </Text>
      </span>
    </button>
  );

  const line = (icon: string, tint: string, title: string, detail: string, action: string, perform: () => void) => (
    <HStack alignment="center" spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2 }}>
      <HStack spacing={SL.Space.s3} style={{ flex: "1 1 0" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: colorOpacity(tint, 0.14), display: "grid", placeItems: "center", flexShrink: 0 }}>
          <SFSymbol name={icon} size={14} weight={600} color={tint} />
        </div>
        <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0" }}>
          <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
            {title}
          </Text>
          <Text {...slMeta()} numerals color={SL.Ink.secondary}>
            {detail}
          </Text>
        </VStack>
      </HStack>
      {primary(action, perform)}
    </HStack>
  );

  const missedRow = (day: AgendaDay, workout: WorkoutDay) => {
    const when = `${WeekPlan.fullWeekday(day.date).slice(0, 2).toLowerCase()} ${NumberDisplay.shortDate(app.display, day.date)}`;
    return (
      <HStack alignment="center" spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2 }}>
        <HStack
          spacing={SL.Space.s3}
          style={{ flex: "1 1 0" }}
          aria-label={`${workout.short}, ${WeekPlan.fullWeekday(day.date)} ${NumberDisplay.shortDate(app.display, day.date)}, not logged`}
        >
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <SLWorkoutSymbol dayName={workout.short} size={17} color={SL.Ink.primary} />
          </div>
          <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0" }}>
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
              {`${workout.short} not logged`}
            </Text>
            <Text {...slMeta()} numerals color={SL.Ink.secondary}>
              {when}
            </Text>
          </VStack>
        </HStack>
        <HStack spacing={SL.Space.s2} style={{ flexShrink: 0 }}>
          <button
            type="button"
            className="sl-pressable"
            onClick={() => app.answerMissed(day.key)}
            style={{ background: "transparent", flexShrink: 0, whiteSpace: "nowrap", padding: `14px ${14 + SL.Space.s2}px`, margin: -14 }}
          >
            <Text size={SL.TypeSize.meta} weight={SL.Weight.regular} color={SL.Ink.secondary}>
              Didn't train
            </Text>
          </button>
          {primary("Log it", () => onLogPast(workout, day.date))}
        </HStack>
      </HStack>
    );
  };

  const todoRow = (todo: Alerts_Todo): ReactNode => {
    switch (todo.kind.kind) {
      case "paused": {
        const resumable = app.resumableSession;
        const name = (resumable ? app.day({ for: resumable })?.short : undefined) ?? "Your workout";
        return line(
          "pause.fill",
          SL.Signal.attention,
          `${name} is paused`,
          `${resumable ? ActiveSessionSnapshot.loggedSetCount(resumable) : 0} sets logged so far`,
          "Resume",
          onResume,
        );
      }
      case "missed":
        return missedRow(todo.kind._0, todo.kind._1);
      case "meals": {
        const labels = todo.kind.value;
        return line(
          "fork.knife",
          SL.Signal.attention,
          labels.length === 1 ? `${labels[0]} not logged` : `${labels.join(", ")} not logged`,
          "Today",
          "Log food",
          onNutrition,
        );
      }
      case "weighIn":
        return line("scalemass", SL.Signal.recovery, "Time to weigh in", `Last one ${todo.kind.days} days ago`, "Weigh in", onProgress);
    }
  };

  // MARK: - Wins

  const winLine = (art: ReactNode, title: string, detail: string) => (
    <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
      <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", flexShrink: 0 }}>{art}</div>
      <VStack alignment="leading" spacing={2}>
        <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
          {title}
        </Text>
        <Text {...slMeta()} numerals color={SL.Ink.secondary}>
          {detail}
        </Text>
      </VStack>
      <Spacer minLength={0} />
    </HStack>
  );

  const winRow = (win: Alerts_Win): ReactNode => {
    switch (win.kind.kind) {
      case "badge":
        return winLine(<SLBadge milestone={win.kind.value} size={40} />, `New badge: ${win.kind.value.title}`, win.kind.value.howTo);
      case "medal":
        return winLine(
          <SLMedal place={LiftMedal_Place.gold} size={34} />,
          `Best ever on ${win.kind.value.name}`,
          `${NumberDisplay.kg(app.display, win.kind.value.weightKg)} × ${win.kind.value.reps}`,
        );
      case "week": {
        const streak = win.kind.value;
        return winLine(
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: SL.Signal.action, display: "grid", placeItems: "center" }}>
            <SLGlyph name="flameFill" size={16} fixed color={SL.Signal.onAction} />
          </div>,
          "Week secured",
          streak.weeks === 1 ? "Your streak has started" : `${streak.weeks} weeks in a row`,
        );
      }
    }
  };

  return (
    <VStack alignment="leading" spacing={0} style={{ flex: "1 1 0", minHeight: 0, alignSelf: "stretch", justifyContent: "flex-start", background: SL.Surface.ground }}>
      <HStack
        alignment="firstTextBaseline"
        style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s5, paddingBottom: SL.Space.s4, alignSelf: "stretch" }}
      >
        <VStack alignment="leading" spacing={2}>
          <Text as="h2" {...slTitle()} color={SL.Ink.primary}>
            Alerts
          </Text>
          <Text {...slBody()} color={SL.Ink.secondary}>
            {todos.length === 0 ? "Nothing needs you" : todos.length === 1 ? "1 thing to do" : `${todos.length} things to do`}
          </Text>
        </VStack>
        <Spacer />
        <button type="button" className="sl-pressable" onClick={onClose} style={{ background: "transparent", flexShrink: 0, ...slHitTarget() }}>
          <Text size={SL.TypeSize.body} weight={SL.Weight.medium} color={SL.Ink.secondary}>
            Done
          </Text>
        </button>
      </HStack>

      <ScrollView style={{ flex: "1 1 0", alignSelf: "stretch" }}>
        <VStack alignment="leading" spacing={SL.Space.s6} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: SL.Space.s6 }}>
          {section(
            "To do",
            todos.length === 0 ? (
              <HStack spacing={SL.Space.s3} style={{ padding: SL.Space.s4 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: SL.Signal.actionTint, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <SLGlyph name="check" size={16} fixed color={SL.Signal.action} />
                </div>
                <Text {...slBody()} color={SL.Ink.secondary}>
                  All caught up — workouts, meals and weigh-ins.
                </Text>
                <Spacer minLength={0} />
              </HStack>
            ) : (
              todos.map((todo, index) => withHairline(index, todoRow(todo), todo.id))
            ),
          )}

          {wins.length > 0 && section("This week's wins", wins.map((win, index) => withHairline(index, winRow(win), win.id)))}
        </VStack>
      </ScrollView>
    </VStack>
  );
}

// Unused-import guard: `Agenda.when` is the Swift accessibility hint's wording.
void Agenda;
