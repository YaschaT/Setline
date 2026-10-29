// GoalViews.swift — the body-weight goal kept on this phone, the sheet that
// picks it, the check as a card, and the meal and goal reminders.
import { useState, type CSSProperties, type ReactNode } from "react";
import { Circle, Hourglass } from "lucide-react";
import { SL } from "../../design/tokens";
import { HStack, Spacer, Text, UserDefaults, VStack, Pressable } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, SLPrimaryButton, colorOpacity } from "../../design/SetlineTokens";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLSheet } from "../../design/components/SLSheet";
import { slLead, slMeta } from "../../design/components/SLText";
import { useApp, type AppState } from "../../data/AppState";
import { BodyProgress } from "../../core/Progress/BodyProgress";
import { GoalCheck, MealWindow, WeightGoal } from "../../core/Progress/WeightGoal";
import { Milestones, type Milestone } from "../../core/Progress/Milestones";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { NutritionHistory } from "../../core/Nutrition/NutritionHistory";
import { StateChange } from "../../core/Sync/StateChange";
import { Meal } from "../../core/Nutrition/NutritionDay";
import { addDays, addingTimeInterval, settingTime, timeIntervalSince } from "../../core/Support/calendar";
import { formatF } from "../../core/Support/nutrition";
import { rounded } from "../../core/Support/swift";

// MARK: - The chosen goal

/**
 * `extension AppState { func habitMilestones(photoDates:) }` — badges for the
 * habits around training: food, weigh-ins, the goal, photos. Photo dates are
 * passed in where they have been read.
 */
export function habitMilestones(app: AppState, a: { photoDates?: Date[] } = {}): Milestone[] {
  const weighIns = GoalCheckExt.weighIns(BodyProgress.make({ metrics: app.metrics }));
  const goal = GoalPreference.goal;
  if (goal !== undefined) {
    GoalPreference.noteWeeksOnTrack(GoalCheckExt.weeksOnTrack({ goal, weighIns }));
  }
  return Milestones.habits({
    entries: app.nutritionEntries,
    proteinTarget: app.targets === undefined ? undefined : app.targets.protein,
    weighInDates: weighIns.map((w) => w.date),
    photoDates: a.photoDates ?? [],
    bestWeeksOnTrack: GoalPreference.bestWeeksOnTrack,
  });
}

/** A `Date` kept in UserDefaults (stored as its ISO string on the web). */
function readDate(key: string): Date | undefined {
  const raw = UserDefaults.get<unknown>(key);
  if (typeof raw === "string") {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof raw === "number") return new Date(raw);
  return undefined;
}

const goalKey = "setline.weightGoal";
const sinceKey = "setline.weightGoal.since";
const bestKey = "setline.weightGoal.bestWeeks";

/** The body-weight goal, kept on this phone (the web app has no goal yet). */
export const GoalPreference = {
  get goal(): WeightGoal | undefined {
    const raw = UserDefaults.get<unknown>(goalKey);
    return typeof raw === "string" ? WeightGoal.fromRawValue(raw) : undefined;
  },
  set goal(newValue: WeightGoal | undefined) {
    UserDefaults.set(goalKey, newValue);
    UserDefaults.set(sinceKey, newValue === undefined ? undefined : new Date().toISOString());
  },

  get since(): Date | undefined {
    return readDate(sinceKey);
  },

  /** The longest run on track ever seen, kept so a badge once earned stays. */
  get bestWeeksOnTrack(): number {
    const raw = UserDefaults.get<unknown>(bestKey);
    return typeof raw === "number" ? Math.trunc(raw) : 0;
  },

  noteWeeksOnTrack(weeks: number): void {
    if (weeks > GoalPreference.bestWeeksOnTrack) UserDefaults.set(bestKey, weeks);
  },
};

/** `extension GoalCheck` (this file's two extensions): call as `GoalCheckExt.headline(check)`. */
export const GoalCheckExt = {
  /** Off track: there is something to change. */
  needsAction(self: GoalCheck): boolean {
    switch (self.verdict.kind) {
      case "onTrack":
      case "tooEarly":
      case "unclear":
        return false;
      default:
        return true;
    }
  },

  /** The weigh-ins the check reads, from the app's metrics. */
  weighIns(progress: BodyProgress): { date: Date; kg: number }[] {
    return progress.entries.map((e) => ({ date: e.date, kg: e.weightKg }));
  },

  /** Whole weeks in a row the trend was on track, counted back from now. */
  weeksOnTrack(a: { goal: WeightGoal; weighIns: { date: Date; kg: number }[]; now?: Date }): number {
    const now = a.now ?? new Date();
    let weeks = 0;
    for (let back = 0; back < 26; back++) {
      const moment = addingTimeInterval(now, -back * 7 * 86_400);
      const since = GoalPreference.since;
      if (since !== undefined && moment.getTime() < addingTimeInterval(since, -GoalCheck.window * 86_400).getTime()) break;
      if (GoalCheck.evaluate({ goal: a.goal, weighIns: a.weighIns, startedAt: GoalPreference.since, now: moment }).verdict.kind !== "onTrack") break;
      weeks += 1;
    }
    return weeks;
  },

  headline(self: GoalCheck): string {
    switch (self.verdict.kind) {
      case "tooEarly":
        return "Checking your trend";
      case "unclear":
        return "Not clear yet";
      case "onTrack":
        return "On track";
      case "tooSlow":
        return self.goal === "cut" ? "Losing too slowly" : "Gaining too slowly";
      case "tooFast":
        return self.goal === "cut" ? "Losing too fast" : "Gaining too fast";
      case "wrongWay":
        switch (self.goal) {
          case "cut":
            return "Weight is going up";
          case "maintain":
          case "recomp":
            return (self.weeklyKg ?? 0) > 0 ? "Drifting up" : "Drifting down";
          default:
            return "Weight is going down";
        }
    }
  },

  /** One plain sentence: where the trend is and what to do about it. */
  detail(self: GoalCheck, display: NumberDisplay): string {
    void display;
    const kg = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + formatF(Math.abs(v), 2) + " kg";
    const target = `${kg(self.targetKg.lowerBound)} to ${kg(self.targetKg.upperBound)} a week`;
    const verdict = self.verdict;
    switch (verdict.kind) {
      case "tooEarly": {
        const parts: string[] = [];
        if (verdict.weighInsNeeded > 0) parts.push(verdict.weighInsNeeded === 1 ? "1 more weigh-in" : `${verdict.weighInsNeeded} more weigh-ins`);
        if (verdict.daysNeeded > 0) parts.push(verdict.daysNeeded === 1 ? "1 more day" : `${verdict.daysNeeded} more days`);
        return `${parts.join(" and ")} and Setline can tell you if you're on track. Goal: ${target}.`;
      }
      case "onTrack":
        return `${kg(self.weeklyKg ?? 0)} a week, right in your ${WeightGoal.title(self.goal).toLowerCase()} range (${target}).`;
      case "unclear":
        return `About ${kg(self.weeklyKg ?? 0)} a week so far, but your weigh-ins swing more than that from day to day. A few more mornings will tell. Goal: ${target}.`;
      default: {
        const pace = `${kg(self.weeklyKg ?? 0)} a week over ${self.days} days; goal ${target}.`;
        const kcal = self.dailyKcalAdjustment;
        if (kcal === undefined || kcal === 0) return pace;
        return pace + ` About ${kcal > 0 ? "+" : "−"}${Math.abs(kcal)} kcal a day should fix it.`;
      }
    }
  },

  /** Mint on track, amber off it, quiet while there is too little to say. */
  verdictInk(self: GoalCheck): string {
    switch (self.verdict.kind) {
      case "onTrack":
        return SL.Signal.recovery;
      case "tooEarly":
      case "unclear":
        return SL.Ink.secondary;
      default:
        return SL.Signal.attention;
    }
  },

  verdictSymbol(self: GoalCheck): string {
    switch (self.verdict.kind) {
      case "onTrack":
        return "checkmark.seal.fill";
      case "tooEarly":
        return "hourglass";
      case "unclear":
        return "chart.dots.scatter";
      case "tooFast":
        return "hare.fill";
      default:
        return "exclamationmark.triangle.fill";
    }
  },
};

const STROKE: Record<number, number> = { 400: 1.75, 500: 2, 600: 2.25, 700: 2.5 };

/**
 * `Image(systemName:)` for the symbols this file and the Progress tab use;
 * the two SFSymbol.tsx has no drawing for ("hourglass", "circle") are drawn
 * with their Lucide icon at the same size and weight.
 */
export function GoalSymbol({ name, size, weight = 400, color, style }: { name: string; size: number; weight?: 400 | 500 | 600 | 700; color?: string; style?: CSSProperties }) {
  if (name === "hourglass" || name === "circle") {
    const Icon = name === "hourglass" ? Hourglass : Circle;
    return <Icon aria-hidden size={size * 1.15} strokeWidth={STROKE[weight]} color={color ?? "currentColor"} style={{ flexShrink: 0, display: "block", ...style }} />;
  }
  return <SFSymbol name={name} size={size} weight={weight} color={color} style={style} />;
}

// MARK: - Picking a goal

export function GoalSheet({ latestKg, onPick, onClose }: { latestKg: number | undefined; onPick: (goal: WeightGoal | undefined) => void; onClose: () => void }) {
  const app = useApp();
  const [selection, setSelection] = useState<WeightGoal | undefined>(() => GoalPreference.goal);
  const [appliedProtein, setAppliedProtein] = useState(false);

  const option = (goal: WeightGoal) => {
    const isOn = selection === goal;
    const range = WeightGoal.weeklyRange(goal);
    const signed = (x: number, places: number) => {
      const body = formatF(x, places);
      return body.startsWith("-") ? body : `+${body}`;
    };
    const pace =
      latestKg === undefined
        ? `${signed(range.lowerBound * 100, 2)} to ${signed(range.upperBound * 100, 2)} % a week`
        : `${signed(range.lowerBound * latestKg, 2)} to ${signed(range.upperBound * latestKg, 2)} kg a week`;
    return (
      <Pressable
        key={goal}
        onPress={() => setSelection(goal)}
        aria-label={undefined}
        style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", padding: 0 }}
      >
        <HStack
          alignment="top"
          spacing={SL.Space.s3}
          style={{
            padding: SL.Space.s3,
            background: SL.Surface.raised2,
            borderRadius: SL.Radius.lg,
            boxShadow: `inset 0 0 0 1px ${isOn ? SL.Surface.selection : SL.Surface.hairline}`,
          }}
        >
          <VStack alignment="leading" spacing={3} style={{ minWidth: 0 }}>
            <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>
              {WeightGoal.title(goal)}
            </Text>
            <Text {...slMeta()} color={SL.Ink.secondary}>
              {WeightGoal.summary(goal)}
            </Text>
            <Text {...slMeta(SL.Weight.semibold)} numerals color={isOn ? SL.Signal.action : SL.Ink.secondary}>
              {pace}
            </Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
          <GoalSymbol name={isOn ? "checkmark.circle.fill" : "circle"} size={22} color={isOn ? SL.Signal.action : SL.Ink.tertiary} />
        </HStack>
      </Pressable>
    );
  };

  let proteinBlock: ReactNode = null;
  if (selection !== undefined && latestKg !== undefined) {
    const goal = selection;
    const kg = latestKg;
    const protein = WeightGoal.proteinPerKg(goal);
    const low = Math.trunc(rounded((protein.lowerBound * kg) / 5)) * 5;
    const high = Math.trunc(rounded((protein.upperBound * kg) / 5)) * 5;
    const middle = Math.trunc((low + high) / 2);
    proteinBlock = (
      <VStack
        alignment="leading"
        spacing={SL.Space.s2}
        style={{ alignSelf: "stretch", padding: SL.Space.s4, background: SL.Surface.raised2, borderRadius: SL.Radius.lg }}
      >
        <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} color={SL.Ink.primary}>
          {`Protein for a ${WeightGoal.title(goal).toLowerCase()}`}
        </Text>
        <Text {...slMeta()} color={SL.Ink.secondary}>
          {`${low}–${high} g a day at ${formatF(kg, 1)} kg (${formatF(protein.lowerBound, 1)}–${formatF(protein.upperBound, 1)} g per kg).`}
        </Text>
        <Pressable
          disabled={appliedProtein}
          onPress={() => {
            void (async () => {
              await app.record([StateChange.make({ kind: "setTarget", field: "protein", value: middle }, { createdAt: new Date() })]);
              setAppliedProtein(true);
            })();
          }}
          style={{
            minHeight: SL.Space.hitMin,
            background: "transparent",
            padding: 0,
            textAlign: "left",
            fontFamily: "Archivo, system-ui, sans-serif",
            fontSize: SL.TypeSize.body,
            fontWeight: SL.Weight.semibold,
            color: appliedProtein ? SL.Ink.secondary : SL.Signal.action,
          }}
        >
          {appliedProtein ? `Protein target set to ${middle} g` : `Use ${middle} g as my protein target`}
        </Pressable>
      </VStack>
    );
  }

  return (
    <SLSheet title="Your goal" subtitle="Setline checks your weigh-ins against it" onClose={onClose}>
      <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        {WeightGoal.allCases.map((goal) => option(goal))}

        {proteinBlock}

        <div style={{ paddingTop: SL.Space.s2, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
          <SLPrimaryButton onPress={() => onPick(selection)}>Save goal</SLPrimaryButton>
        </div>
        {GoalPreference.goal !== undefined && (
          <Pressable
            onPress={() => onPick(undefined)}
            style={{
              alignSelf: "stretch",
              minHeight: SL.Space.hitMin,
              background: "transparent",
              fontFamily: "Archivo, system-ui, sans-serif",
              fontSize: SL.TypeSize.body,
              fontWeight: SL.Weight.medium,
              color: SL.Ink.secondary,
            }}
          >
            Remove goal
          </Pressable>
        )}
      </VStack>
    </SLSheet>
  );
}

// MARK: - The check, as a card

/**
 * Where the weigh-ins stand against the goal: a verdict in a pill, the
 * pace in one sentence, weeks on track as the streak, and — when off
 * track — the calorie change that should fix it, one tap away.
 */
export function GoalCheckCard({ check, weeksOnTrack, onChangeGoal }: { check: GoalCheck; weeksOnTrack: number; onChangeGoal?: () => void }) {
  const app = useApp();
  const [applied, setApplied] = useState(false);
  const ink = GoalCheckExt.verdictInk(check);
  const symbol = GoalCheckExt.verdictSymbol(check);

  /**
   * What the food log says over the same two weeks: whether the target
   * was eaten at all, before the target itself is blamed.
   */
  const eatenLine = ((): string | undefined => {
    const history = app.nutritionHistory();
    const logged = NutritionHistory.logged(history);
    const average = NutritionHistory.averageCalories(history);
    if (!(logged.length >= 3) || average === undefined) return undefined;
    const avg = NumberDisplay.whole(app.display, average);
    const gap = NutritionHistory.averageGap(history);
    const target = history.calorieTarget;
    if (gap === undefined || target === undefined) {
      return `You logged ${avg} kcal a day on ${logged.length} days.`;
    }
    if (Math.abs(gap) <= Math.trunc(target / 10)) {
      return `You logged ${avg} kcal a day, on your target: the target itself needs to move.`;
    }
    return `You logged ${avg} kcal a day, ${NumberDisplay.whole(app.display, Math.abs(gap))} ${gap > 0 ? "over" : "under"} your target. Eat to the target first.`;
  })();

  const kcal = check.dailyKcalAdjustment;
  const calories = app.targets?.calories;

  return (
    <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s4, background: SL.Surface.raised2, borderRadius: SL.Radius.lg }}>
      <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} tracking={1.2} color={SL.Ink.secondary}>
          {WeightGoal.title(check.goal).toUpperCase()}
        </Text>
        <Spacer minLength={SL.Space.s2} />
        {onChangeGoal !== undefined && (
          <Pressable
            onPress={onChangeGoal}
            style={{
              minHeight: 32,
              background: "transparent",
              padding: 0,
              fontFamily: "Archivo, system-ui, sans-serif",
              fontSize: SL.TypeSize.meta,
              fontWeight: SL.Weight.medium,
              color: SL.Ink.secondary,
            }}
          >
            Change
          </Pressable>
        )}
      </HStack>
      <HStack spacing={SL.Space.s2} style={{ color: ink, paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, minHeight: 34, borderRadius: SL.Radius.pill, background: colorOpacity(ink, 0.14) }}>
        <GoalSymbol name={symbol} size={14} weight={700} color={ink} />
        <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} color={ink}>
          {GoalCheckExt.headline(check)}
        </Text>
      </HStack>
      <Text {...slMeta()} numerals color={SL.Ink.meta}>
        {GoalCheckExt.detail(check, app.display)}
      </Text>
      {GoalCheckExt.needsAction(check) && eatenLine !== undefined && (
        <HStack alignment="top" spacing={SL.Space.s2} style={{ color: SL.Ink.primary }}>
          <SFSymbol name="fork.knife" size={12} weight={600} color={SL.Ink.primary} style={{ marginTop: 2 }} />
          <Text {...slMeta()} numerals color={SL.Ink.primary}>
            {eatenLine}
          </Text>
        </HStack>
      )}
      {check.verdict.kind === "onTrack" && weeksOnTrack > 0 && (
        <HStack spacing={6} style={{ color: SL.Signal.action }}>
          <SLGlyph name="flameFill" size={14} fixed color={SL.Signal.action} />
          <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} color={SL.Signal.action}>
            {weeksOnTrack === 1 ? "1 week on track" : `${weeksOnTrack} weeks on track`}
          </Text>
        </HStack>
      )}
      {kcal !== undefined && kcal !== 0 && calories !== undefined && calories > 0 && (
        <SLOutlineButton
          disabled={applied}
          onPress={() => {
            void (async () => {
              await app.record([StateChange.make({ kind: "setTarget", field: "calories", value: calories + kcal }, { createdAt: new Date() })]);
              setApplied(true);
            })();
          }}
          style={applied ? { opacity: 0.5 } : undefined}
        >
          {applied ? "Calorie target updated" : `Set calories to ${calories + kcal} kcal (${kcal > 0 ? "+" : "−"}${Math.abs(kcal)})`}
        </SLOutlineButton>
      )}
    </VStack>
  );
}

// MARK: - Reminders

const goalNotifiedKey = "setline.reminders.goalNotified";
const goalID = "setline.goal.checkin";

/**
 * Meal reminders and the weekly goal check-in, both local notifications.
 * On the web the settings, keys and texts are kept and every decision is
 * made as on the phone; only the scheduling itself is a no-op (a page cannot
 * schedule a notification for when it is closed).
 */
export const NutritionReminders = {
  mealsKey: "setline.reminders.meals",

  get mealsOn(): boolean {
    return UserDefaults.get<boolean>(NutritionReminders.mealsKey) === true;
  },

  /** Asks once, when the lifter turns a reminder on. */
  async requestPermission(): Promise<boolean> {
    try {
      if (typeof Notification === "undefined") return false;
      if (Notification.permission === "granted") return true;
      return (await Notification.requestPermission()) === "granted";
    } catch {
      return false;
    }
  },

  async update(app: AppState, a: { now?: Date } = {}): Promise<void> {
    const now = a.now ?? new Date();
    // `removePendingNotificationRequests` — nothing is pending on the web.
    void goalID;
    if (!app.isSignedIn) return;
    const authorized = typeof Notification !== "undefined" && Notification.permission === "granted";
    if (!authorized) return;

    if (NutritionReminders.mealsOn) {
      for (const { window, fire } of MealWindow.upcoming({ entries: app.nutritionEntries, now })) {
        const title = `${window.label} not logged yet`;
        const body =
          window.meal === Meal.avondeten
            ? "Log dinner and any snacks — a full day keeps your goal check honest."
            : `Takes ten seconds. Your ${window.label.toLowerCase()} window closes at ${window.endHour}:00.`;
        // `center.add(UNNotificationRequest(…))` at `fire`: no scheduler on the web.
        void title;
        void body;
        void fire;
      }
    }

    // Off track: one check-in at most every seven days, next morning at 9.
    const goal = GoalPreference.goal;
    if (goal === undefined) return;
    const check = GoalCheck.evaluate({
      goal,
      weighIns: GoalCheckExt.weighIns(BodyProgress.make({ metrics: app.metrics })),
      startedAt: GoalPreference.since,
      now,
    });
    const last = readDate(goalNotifiedKey) ?? new Date(-62135596800000);
    if (!(GoalCheck.isOffTrack(check) && timeIntervalSince(now, last) > 7 * 86_400)) return;
    const fire = settingTime(addDays(now, 1), 9, 0, 0);
    const title = `${WeightGoal.title(goal)} check-in: ${GoalCheckExt.headline(check).toLowerCase()}`;
    const body = GoalCheckExt.detail(check, app.display);
    // `center.add(UNNotificationRequest(identifier: goalID, …))` at `fire`: no scheduler on the web.
    void fire;
    void title;
    void body;
    UserDefaults.set(goalNotifiedKey, now.toISOString());
  },
};
