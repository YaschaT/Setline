// NutritionHomeView.swift — Redesign 1c · Voeding.
//
// What is left to eat is the one loud number, in the card at the top with the
// one action beside it. Under it the day's macros against their targets, and
// then what was eaten: one row per item, with when, which meal and what it
// cost. Tapping a row opens the item; a swipe offers to take it off the day.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { SL, slFont, slNumerals } from "../../design/tokens";
import {
  ConfirmationDialog, HStack, Pressable, ScrollView, Sheet, Spacer, Text, VStack, useAppStorage, useScenePhase,
} from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLPrimaryButton, SLMotion, colorOpacity, spring } from "../../design/SetlineTokens";
import { useReduceMotion } from "../../design/support";
import { slFixed, slLineHeight } from "../../design/SLDynamicType";
import { SLSound } from "../../design/SLSound";
import { SLFoodPhoto } from "../../design/components/SLFoodPhoto";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slLead, slMeta } from "../../design/components/SLText";
import {
  SLAdaptiveRow, SLBar, SLDateText, SLHeaderButton, SLSectionHead, SLTabHeader, SLTabHeaderPinned, slUnbroken,
} from "../../design/components/SLPieces";
import { SLPress } from "../../design/components/SLPress";
import { SLUndoToast } from "../../design/components/SLUndoToast";
import { useApp } from "../../data/AppState";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Schedule } from "../../core/Engine/Schedule";
import { FoodIdea, FoodIdeas } from "../../core/Nutrition/FoodIdeas";
import { FavoriteFood } from "../../core/Nutrition/FoodLookup";
import { FoodMemory } from "../../core/Nutrition/FoodMemory";
import { Macro, Meal, MealSection, NutritionDay, NutritionEntry } from "../../core/Nutrition/NutritionDay";
import { NutritionHistory, NutritionHistory_Day, NutritionHistory_Flag } from "../../core/Nutrition/NutritionHistory";
import { Recipe } from "../../core/Nutrition/Recipes";
import { GoalCheck, MealWindow } from "../../core/Progress/WeightGoal";
import { BodyProgress } from "../../core/Progress/BodyProgress";
import { formatEnUS } from "../../core/Support/calendar";
import { deepEqual, rounded, uuid } from "../../core/Support/swift";
import { GoalCheckCard, GoalPreference, NutritionReminders } from "../Progress/GoalViews";
import { TargetsSheet } from "../Account/TargetsSheet";
import { AddFoodSheet } from "./AddFoodSheet";
import { FoodEntrySheet } from "./FoodEntrySheet";
import { RecipeSheet, RecipesSection } from "./RecipeViews";
import { BodyProfilePreference, NutritionPlan, NutritionPlanCard, NutritionPlanSheet } from "./PlanViews";

/** `NutritionHomeView.Sheet` — one sheet at a time. */
export type NutritionHomeView_Sheet =
  | { kind: "add"; value: Meal }
  | { kind: "edit"; value: NutritionEntry }
  | { kind: "targets" }
  | { kind: "recipe"; value: Recipe }
  | { kind: "plan" };

const sheetID = (s: NutritionHomeView_Sheet | undefined): string | undefined => {
  if (!s) return undefined;
  switch (s.kind) {
    case "add":
      return `add-${s.value}`;
    case "edit":
      return `edit-${s.value.id}`;
    case "targets":
      return "targets";
    case "recipe":
      return `recipe-${s.value.id}`;
    case "plan":
      return "plan";
  }
};

interface Toast {
  id: string;
  message: string;
  undo?: () => void;
}

const swipeReveal = 112;
/** 48 in the design; it has to grow with the text or "12:45" is cut. */
const timeWidth = 48;

/** "12:45" — the hour it was logged, as the clock had it. */
function clock(date: Date): string {
  return formatEnUS(date, "HH:mm");
}

const foodID = (moment: Date) => `food-${Math.trunc(moment.getTime())}`;

/**
 * Redesign 1c · Voeding. Amber appears once, and only when the account's own
 * log earns it: two or more whole days in a row under the protein target.
 */
export function NutritionHomeView({ onAccount = () => {} }: { /** The avatar's way to Account, as on Training. */ onAccount?: () => void }) {
  const app = useApp();
  const display = app.display;
  const whole = (v: number) => NumberDisplay.whole(display, v);
  const kcal = (v: number) => NumberDisplay.kcal(display, v);
  /** The likely meal's ring breathes, like today's on Training. */
  const [breathes, setBreathes] = useState(false);
  /** The protein goal's moment has played for this date. */
  const [proteinCelebrated, setProteinCelebrated] = useAppStorage("setline.nutrition.proteinCelebrated", "");
  const [proteinPops, setProteinPops] = useState(0);
  /** The quick add just tapped, shown as added for a moment. */
  const [addedIdea, setAddedIdea] = useState<string | undefined>(undefined);
  const addedRef = useRef<string | undefined>(undefined);
  addedRef.current = addedIdea;
  const reduceMotion = useReduceMotion();
  const scenePhase = useScenePhase();

  /**
   * The clock this screen is reading. Held rather than asked for on every
   * line, so the date, the meal the sheet opens on and what a tap logs are
   * one moment; read again whenever the screen is come back to.
   */
  const [now, setNow] = useState(() => new Date());

  const [sheet, setSheet] = useState<NutritionHomeView_Sheet | undefined>(undefined);
  /** The sheet on screen, kept through its exit so it does not empty as it slides away. */
  const lastSheet = useRef<NutritionHomeView_Sheet | undefined>(undefined);
  if (sheet) lastSheet.current = sheet;
  const [toast, setToast] = useState<Toast | undefined>(undefined);
  /** The row whose delete is showing, by entry id. One at a time. */
  const [swiped, setSwiped] = useState<string | undefined>(undefined);
  /** The day the food log shows, by date key; nil is today. */
  const [diaryDay, setDiaryDayState] = useState<string | undefined>(undefined);
  const [mealReminders, setMealReminders] = useAppStorage<boolean>(NutritionReminders.mealsKey, false);
  /** The offer to switch reminders on, once answered, isn't made again. */
  const [remindersOffered, setRemindersOffered] = useAppStorage<boolean>("setline.reminders.offered", false);
  const [remindersDenied, setRemindersDenied] = useState(false);
  /** The meals opened in the food log. Closed by default. */
  const [openMeals, setOpenMeals] = useState<Set<string>>(new Set());
  /** A held row's menu (`.contextMenu`). */
  const [menuEntry, setMenuEntry] = useState<NutritionEntry | undefined>(undefined);

  const setDiaryDay = (key: string | undefined) => {
    if (key !== diaryDay) setOpenMeals(new Set());
    setDiaryDayState(key);
  };

  const day: NutritionDay = app.nutrition({ on: now });
  const sections = NutritionDay.sections(day);
  /** What the hour suggests. The sheet opens there, one tap from any other meal. */
  const likely: Meal = Meal.likely({ at: now });

  // .onAppear / scenePhase active: read the clock again.
  useEffect(() => {
    if (scenePhase === "active") setNow(new Date());
  }, [scenePhase]);

  // A tap anywhere else puts a revealed row back.
  const currentSheetID = sheetID(sheet);
  useEffect(() => {
    setSwiped(undefined);
  }, [currentSheetID]);

  // The undo leaves after the design system's window.
  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const t = setTimeout(() => setToast((current) => (current?.id === id ? undefined : current)), SL.Metric.undoWindow * 1000);
    return () => clearTimeout(t);
  }, [toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // MARK: - Writing one entry

  const show = (message: string, undo: (() => void) | undefined) => {
    setToast({
      id: uuid(),
      message,
      undo: undo
        ? () => {
            undo();
            setToast(undefined);
          }
        : undefined,
    });
  };

  const mealName = (entry: NutritionEntry): string => {
    const meal = Meal.fromRawValue(entry.meal);
    return meal ? Meal.label(meal) : "Snacks";
  };

  const add = (entry: NutritionEntry) => {
    void app.log({ food: entry });
    SLSound.play("pop");
    show(`${entry.name} added to ${mealName(entry).toLowerCase()}`, () => {
      void app.removeFood({ id: entry.id });
    });
  };

  /** A meal scan's items, in one go, with one undo for all of them. */
  const addAll = (entries: NutritionEntry[]) => {
    if (entries.length === 0) return;
    void (async () => {
      for (const entry of entries) await app.log({ food: entry });
    })();
    SLSound.play("pop");
    show(entries.length === 1 ? `${entries[0].name} added` : `${entries.length} items added`, () => {
      void (async () => {
        for (const entry of entries) await app.removeFood({ id: entry.id });
      })();
    });
  };

  const save = (changed: NutritionEntry, previous: NutritionEntry) => {
    if (deepEqual(changed, previous)) return;
    void app.log({ food: changed });
    show(`${changed.name} updated`, () => {
      void app.log({ food: previous });
    });
  };

  const del = (entry: NutritionEntry) => {
    setSwiped(undefined);
    void app.removeFood({ id: entry.id });
    show(`${entry.name} deleted`, () => {
      void app.log({ food: entry });
    });
  };

  // MARK: - What is left

  /** Over the target there is nothing left to eat: the card says by how much it was passed. */
  const over: number = (() => {
    const target = day.targets?.calories;
    if (!NutritionDay.hasTarget(day) || target === undefined) return 0;
    return Math.max(0, day.calories - target);
  })();

  // MARK: - The day

  const proteinTarget = NutritionDay.target(day, { for: Macro.protein });
  const proteinEaten = NutritionDay.total(day, { of: Macro.protein });
  const proteinMet = proteinTarget > 0 && proteinEaten >= proteinTarget;

  // .onChange(of: proteinMet, initial: true)
  useEffect(() => {
    const key = Schedule.dateKey(now);
    if (!proteinMet || proteinCelebrated === key) return;
    setProteinCelebrated(key);
    setProteinPops((n) => n + 1);
    SLSound.play("chime");
  }, [proteinMet]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (reduceMotion || breathes) return;
    setBreathes(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // MARK: - The head

  /** Training's head: the avatar to Account, the tab's name and the date, and one round button — the targets. */
  const header = (
    <SLTabHeader
      title="Nutrition"
      subtitle={SLDateText.long(now)}
      onAccount={onAccount}
      trailing={<SLHeaderButton glyph="target" label="Daily targets" action={() => setSheet({ kind: "targets" })} />}
    />
  );

  // MARK: - Nudges

  /**
   * The in-app side of the meal reminders: a meal whose reminder time has
   * passed with nothing logged says so here, with the way to log it; and
   * while reminders are off, the app offers them once.
   */
  const mealNudge = (() => {
    const missing = MealWindow.missing({ entries: app.nutritionEntries, now });
    if (missing) {
      return (
        <HStack
          spacing={SL.Space.s3}
          style={{
            alignSelf: "stretch",
            padding: SL.Space.s3,
            background: SL.Surface.raised,
            borderRadius: SL.Radius.lg,
            boxShadow: `inset 0 0 0 1px ${colorOpacity(SL.Signal.attention, 0.35)}`,
          }}
        >
          <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: colorOpacity(SL.Signal.attention, 0.14), display: "grid", placeItems: "center" }}>
            <SFSymbol name="bell.badge.fill" size={16} weight={600} color={SL.Signal.attention} />
          </div>
          <VStack alignment="leading" spacing={1} style={{ flex: "0 1 auto" }}>
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
              {`${missing.label} isn't logged yet`}
            </Text>
            <Text {...slMeta()} color={SL.Ink.secondary}>
              {missing.endHour >= 24 ? "Dinner and snacks count until midnight" : `Your ${missing.label.toLowerCase()} window closes at ${missing.endHour}:00`}
            </Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
          <SLPress
            scale={0.94}
            aria-label={`Log ${missing.label.toLowerCase()}`}
            onPress={() => {
              setNow(new Date());
              setSheet({ kind: "add", value: missing.meal });
            }}
            style={{ flexShrink: 0 }}
          >
            <span
              style={{
                ...slFont(SL.TypeSize.body, SL.Weight.semibold),
                color: SL.Signal.onAction,
                display: "flex",
                alignItems: "center",
                paddingLeft: SL.Space.s4,
                paddingRight: SL.Space.s4,
                minHeight: 36,
                borderRadius: SL.Radius.pill,
                background: SL.Signal.action,
              }}
            >
              Log
            </span>
          </SLPress>
        </HStack>
      );
    }
    if (!mealReminders && !remindersOffered) {
      return (
        <HStack alignment="top" spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s3, background: SL.Surface.raised, borderRadius: SL.Radius.lg }}>
          <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: SL.Signal.actionTint, display: "grid", placeItems: "center" }}>
            <SFSymbol name="bell.fill" size={15} weight={600} color={SL.Signal.action} />
          </div>
          <VStack alignment="leading" spacing={SL.Space.s2} style={{ flex: "0 1 auto" }}>
            <VStack alignment="leading" spacing={1}>
              <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
                Get a nudge when a meal isn't logged
              </Text>
              <Text {...slMeta()} color={SL.Ink.secondary}>
                {remindersDenied
                  ? "Notifications are off for Setline. Turn them on in Settings › Setline › Notifications."
                  : "Breakfast at 10:30, lunch at 14:30, dinner at 20:30 — only when nothing is logged yet."}
              </Text>
            </VStack>
            <HStack spacing={SL.Space.s2}>
              <SLPress
                scale={0.94}
                onPress={() => {
                  void (async () => {
                    if (await NutritionReminders.requestPermission()) {
                      setMealReminders(true);
                      setRemindersOffered(true);
                      await NutritionReminders.update(app);
                    } else {
                      setRemindersDenied(true);
                    }
                  })();
                }}
              >
                <span
                  style={{
                    ...slFont(SL.TypeSize.body, SL.Weight.semibold),
                    color: SL.Signal.onAction,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: SL.Space.s4,
                    paddingRight: SL.Space.s4,
                    minHeight: 36,
                    borderRadius: SL.Radius.pill,
                    background: SL.Signal.action,
                  }}
                >
                  {remindersDenied ? "Try again" : "Turn on"}
                </span>
              </SLPress>
              <Pressable
                onPress={() => setRemindersOffered(true)}
                style={{ ...slFont(SL.TypeSize.body, SL.Weight.medium), color: SL.Ink.secondary, minHeight: 36, background: "transparent" }}
              >
                Not now
              </Pressable>
            </HStack>
          </VStack>
          <Spacer minLength={0} />
        </HStack>
      );
    }
    return null;
  })();

  /** Weight, goal and whether the eating fits it: where people look for it. */
  const planCard = (
    <NutritionPlanCard
      plan={NutritionPlan.make(app, GoalPreference.goal, BodyProfilePreference.profile)}
      onOpen={() => setSheet({ kind: "plan" })}
    />
  );

  // MARK: - The hero card

  /** Protein against its target, as a ring where Training keeps Tally. Full, it turns into a check. */
  const ringRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (proteinPops === 0 || !ringRef.current?.animate) return;
    ringRef.current.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.18)", offset: 0.31 }, { transform: "scale(1)" }],
      { duration: 580, easing: "cubic-bezier(.3,1.4,.5,1)" },
    );
  }, [proteinPops]);

  const proteinRing = (() => {
    const fraction = Math.min(1, proteinEaten / Math.max(proteinTarget, 1));
    const percent = rounded(fraction * 100);
    const r = 30;
    const length = 2 * Math.PI * r;
    return (
      <div
        ref={ringRef}
        role="img"
        aria-label={proteinMet ? "Protein goal hit" : `${percent} percent of your protein`}
        style={{ position: "relative", width: 60, height: 60, flexShrink: 0, display: "grid", placeItems: "center" }}
      >
        <svg aria-hidden width={60} height={60} viewBox="0 0 60 60" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <circle cx={30} cy={30} r={r} fill="none" stroke={colorOpacity(SL.Signal.action, 0.14)} strokeWidth={6} />
          <circle
            cx={30}
            cy={30}
            r={r}
            fill="none"
            stroke={SL.Signal.action}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${length * fraction} ${length}`}
            transform="rotate(-90 30 30)"
            style={{ transition: reduceMotion ? "none" : `stroke-dasharray ${spring(0.8, 0.8)} 0.2s` }}
            opacity={fraction > 0 ? 1 : 0}
          />
        </svg>
        {proteinMet ? (
          <SLGlyph name="check" size={20} fixed color={SL.Signal.action} style={{ position: "relative" }} />
        ) : (
          <VStack spacing={0} style={{ position: "relative" }}>
            <span style={{ ...slFixed(14, SL.Weight.bold), ...slNumerals, color: SL.Ink.primary, lineHeight: 1.2 }}>{`${percent}%`}</span>
            <span style={{ ...slFixed(9, SL.Weight.medium), color: SL.Ink.secondary, lineHeight: 1.2 }}>protein</span>
          </VStack>
        )}
      </div>
    );
  })();

  const mealMark = (logged: boolean, isNow: boolean): ReactNode => {
    const size = 28;
    if (logged) {
      return (
        <div style={{ width: size, height: size, borderRadius: "50%", background: SL.Signal.action, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <SLGlyph name="check" size={13} color={SL.Signal.onAction} />
        </div>
      );
    }
    if (isNow) {
      return (
        <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center" }}>
          {/* The breathing ring, behind. */}
          <div
            className={breathes ? "sl-nutrition-breathe" : undefined}
            style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `inset 0 0 0 1.5px ${colorOpacity(SL.Signal.action, 0.5)}` }}
          />
          <div style={{ position: "absolute", inset: -4, borderRadius: "50%", background: colorOpacity(SL.Signal.action, 0.12) }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `inset 0 0 0 2px ${SL.Signal.action}` }} />
          <SLGlyph name="plus" size={12} color={SL.Signal.action} style={{ position: "relative" }} />
        </div>
      );
    }
    return <div style={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", boxShadow: `inset 0 0 0 1.5px ${SL.Surface.mute}` }} />;
  };

  /**
   * The day's four meals as Training's week marks: logged ones filled, the
   * one the clock suggests ringed and breathing, the rest waiting. A tap
   * logs into that meal.
   */
  const mealMarks = (() => {
    const current = sections.find((s) => s.meal === likely)?.meal ?? (likely === Meal.preWorkout ? Meal.snack : likely);
    return (
      <HStack spacing={0} style={{ alignSelf: "stretch", marginLeft: -SL.Space.s1, marginRight: -SL.Space.s1, marginTop: SL.Space.s5 }}>
        {sections.map((section) => {
          const logged = !MealSection.isEmpty(section);
          const isNow = section.meal === current && !logged;
          const name = section.meal === Meal.snack ? "Snacks" : Meal.label(section.meal);
          return (
            <SLPress
              key={MealSection.id(section)}
              scale={0.85}
              bounces
              aria-label={`${name}, ${logged ? kcal(section.calories) : "nothing yet"}`}
              onPress={() => {
                setNow(new Date());
                setSheet({ kind: "add", value: section.meal });
              }}
              style={{ flex: "1 1 0", minWidth: 0 }}
            >
              <VStack spacing={6} style={{ minHeight: SL.Space.hitMin, justifyContent: "center" }}>
                <Text size={SL.TypeSize.micro} weight={isNow ? SL.Weight.bold : SL.Weight.regular} color={isNow ? SL.Ink.primary : SL.Ink.secondary} lineLimit={1}>
                  {name}
                </Text>
                {mealMark(logged, isNow)}
                <Text size={SL.TypeSize.micro} weight={SL.Weight.medium} numerals color={SL.Ink.secondary} style={{ whiteSpace: "pre" }}>
                  {logged ? whole(section.calories) : " "}
                </Text>
              </VStack>
            </SLPress>
          );
        })}
      </HStack>
    );
  })();

  /** The macros as Training's stat row: a number over a word, a thin bar under each against its target, hairlines between. */
  const macroRow = (
    <HStack alignment="top" spacing={0} style={{ alignSelf: "stretch" }}>
      {Macro.allCases.map((macro, index) => {
        const total = NutritionDay.total(day, { of: macro });
        const target = NutritionDay.target(day, { for: macro });
        const isOver = target > 0 && total > target;
        return (
          <HStack
            key={macro}
            spacing={0}
            role="group"
            aria-label={
              target > 0
                ? `${Macro.label(macro)}, ${whole(total)} of ${whole(target)} grams`
                : `${Macro.label(macro)}, ${whole(total)} grams`
            }
            style={{ flex: "1 1 0", minWidth: 0 }}
          >
            {index > 0 && <div aria-hidden style={{ width: SL.Metric.border, height: 46, background: SL.Surface.hairline, marginRight: SL.Space.s4, flexShrink: 0 }} />}
            <VStack alignment="leading" spacing={4} style={{ flex: "1 1 0", minWidth: 0 }}>
              <HStack alignment="firstTextBaseline" spacing={1} style={{ ...slNumerals, whiteSpace: "nowrap", maxWidth: "100%" }}>
                <Text size={SL.TypeSize.title} weight={SL.Weight.semibold} color={isOver ? SL.Signal.attention : SL.Ink.primary} numerals lineLimit={1} minimumScaleFactor={0.75}>
                  {whole(total)}
                </Text>
                <Text {...slMeta()} color={SL.Ink.secondary} numerals lineLimit={1} minimumScaleFactor={0.75} style={{ whiteSpace: "pre" }}>
                  {target > 0 ? `/${whole(target)} g` : " g"}
                </Text>
              </HStack>
              <Text {...slMeta()} color={SL.Ink.secondary}>
                {Macro.label(macro).toLowerCase()}
              </Text>
              {target > 0 && (
                <SLBar
                  fraction={NutritionDay.fraction(day, { of: macro })}
                  height={4}
                  fill={isOver ? SL.Signal.attention : colorOpacity(SL.Signal.action, [1, 0.6, 0.4][Math.min(index, 2)])}
                  style={{ marginRight: SL.Space.s3 }}
                />
              )}
            </VStack>
          </HStack>
        );
      })}
    </HStack>
  );

  /**
   * Training's card, read for food: the number first, the day's four meals
   * as its marks, the macros as its stat row, and the one action. Protein is
   * the goal the day is won by.
   */
  const hero = (() => {
    const isOver = over > 0;
    const hasTarget = NutritionDay.hasTarget(day);
    const value = !hasTarget ? day.calories : isOver ? over : NutritionDay.remaining(day);
    const unit = !hasTarget ? "kcal today" : isOver ? "kcal over" : "kcal left";
    const proteinLeft = Math.max(0, proteinTarget - proteinEaten);
    const nudge = !hasTarget
      ? "Set a target to count down"
      : proteinMet
        ? "Protein goal hit"
        : proteinTarget > 0
          ? `${whole(proteinLeft)} g protein to go`
          : `of ${whole(day.targets?.calories ?? 0)} kcal`;
    const likelySection = sections.find((s) => s.meal === likely);
    return (
      <VStack
        alignment="leading"
        spacing={0}
        style={{
          alignSelf: "stretch",
          padding: SL.Space.s5,
          borderRadius: 28,
          overflow: "hidden",
          background: `radial-gradient(circle ${proteinMet ? 380 : 280}px at 100% 0%, ${colorOpacity(SL.Signal.action, proteinMet ? 0.24 : 0.1)}, rgba(0,0,0,0)), ${SL.Surface.raised}`,
          boxShadow: [
            `inset 0 0 0 ${SL.Metric.border}px ${proteinMet ? colorOpacity(SL.Signal.action, 0.45) : colorOpacity(SL.Surface.hairlineStrong, 0.6)}`,
            proteinMet ? `0 0 24px ${colorOpacity(SL.Signal.action, 0.14)}` : "0 0 24px rgba(0,0,0,0)",
          ].join(", "),
          transition: reduceMotion ? "none" : "box-shadow 0.4s ease-in-out, background 0.4s ease-in-out",
        }}
      >
        <HStack alignment="bottom" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
          <Pressable
            onPress={() => setSheet({ kind: "targets" })}
            aria-label={`${kcal(value)} ${unit.replace("kcal ", "")}. ${nudge}. Opens your daily targets`}
            style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "flex-end", gap: SL.Space.s3, background: "transparent", textAlign: "left" }}
          >
            <Text
              size={64}
              weight={SL.Weight.bold}
              tracking={-2}
              numerals
              color={isOver ? SL.Signal.attention : SL.Ink.primary}
              lineLimit={1}
              minimumScaleFactor={0.6}
              style={{ marginTop: -8, marginBottom: -8, flexShrink: 1, lineHeight: 1.2 }}
            >
              {whole(value)}
            </Text>
            <VStack alignment="leading" spacing={2} style={{ paddingBottom: 2, flex: "0 1 auto" }}>
              <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>
                {unit}
              </Text>
              <HStack spacing={4} style={{ color: proteinMet ? SL.Signal.action : SL.Ink.secondary }}>
                {proteinMet && <SLGlyph name="check" size={12} />}
                <Text {...slMeta(SL.Weight.semibold)} numerals color={proteinMet ? SL.Signal.action : SL.Ink.secondary}>
                  {nudge}
                </Text>
              </HStack>
            </VStack>
            <Spacer minLength={0} />
          </Pressable>
          {proteinTarget > 0 && proteinRing}
        </HStack>

        {mealMarks}

        <div
          aria-hidden
          style={{
            height: SL.Metric.border,
            background: proteinMet ? colorOpacity(SL.Signal.action, 0.18) : SL.Surface.hairline,
            marginLeft: -SL.Space.s5,
            marginRight: -SL.Space.s5,
            marginTop: SL.Space.s5,
            marginBottom: SL.Space.s5,
            alignSelf: "stretch",
          }}
        />

        {macroRow}

        <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", marginTop: SL.Space.s5 }}>
          <SLPrimaryButton
            aria-label={likelySection && !MealSection.isEmpty(likelySection) ? `Add to ${Meal.spoken(likely)}` : `Log ${Meal.spoken(likely)}`}
            onPress={() => {
              // The clock is read again as the sheet opens: a screen left open
              // since breakfast must not log lunch as breakfast.
              const moment = new Date();
              setNow(moment);
              setSheet({ kind: "add", value: Meal.likely({ at: moment }) });
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <SLGlyph name="plus" size={16} />
              {/* "Log lunch" until lunch has something in it; then what the tap does is add to it. */}
              {likelySection && !MealSection.isEmpty(likelySection) ? `Add to ${Meal.spoken(likely)}` : `Log ${Meal.spoken(likely)}`}
            </span>
          </SLPrimaryButton>
        </div>
      </VStack>
    );
  })();

  // MARK: - Quick adds

  /** A quick add in one line: a small photo, the name and what it brings, and the add. */
  const quickPill = (id: string, name: string, detail: string, art: ReactNode, entry: (moment: Date) => NutritionEntry) => {
    const justAdded = addedIdea === id;
    return (
      <SLPress
        key={id}
        aria-label={`${name}, ${detail}. Adds it to ${Meal.spoken(likely)}`}
        onPress={() => {
          const moment = new Date();
          setNow(moment);
          add(entry(moment));
          setAddedIdea(id);
          setTimeout(() => {
            if (addedRef.current === id) setAddedIdea(undefined);
          }, 1400);
        }}
        style={{ textAlign: "left" }}
      >
        <HStack
          spacing={SL.Space.s3}
          style={{
            width: 250,
            height: 56,
            paddingLeft: 10,
            paddingRight: SL.Space.s2,
            background: SL.Surface.raised,
            borderRadius: SL.Radius.lg,
            boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${justAdded ? colorOpacity(SL.Signal.action, 0.5) : SL.Surface.hairline}`,
            transition: reduceMotion ? "none" : `box-shadow ${spring(0.3, 0.7)}`,
          }}
        >
          {art}
          <VStack alignment="leading" spacing={1} style={{ flex: "0 1 auto", minWidth: 0 }}>
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={1} style={{ maxWidth: "100%" }}>
              {name}
            </Text>
            <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} numerals color={SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
              {detail}
            </Text>
          </VStack>
          <Spacer minLength={SL.Space.s1} />
          <div
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: justAdded ? SL.Signal.action : SL.Surface.raised2,
              transition: reduceMotion ? "none" : `background-color ${spring(0.3, 0.7)}`,
            }}
          >
            <SLGlyph name={justAdded ? "check" : "plus"} size={12} fixed color={justAdded ? SL.Signal.onAction : SL.Signal.action} />
          </div>
        </HStack>
      </SLPress>
    );
  };

  /**
   * Everyday foods with their photo, one tap to log at the meal the clock
   * suggests. Protein-dense ones lead while protein is what is missing.
   */
  const ideasSection = (() => {
    const proteinLeft = Math.max(0, proteinTarget - proteinEaten);
    const ideas = FoodIdeas.ordered({ proteinLeft });
    const favorites = app.foodFavorites;
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <SLSectionHead title="Quick adds" meta={favorites.length > 0 ? "favorites first" : proteinLeft > 0 ? "high protein first" : undefined} />
        {/* Two short rows rather than one row of tall cards: a quick add is one tap, and should look like one. */}
        <ScrollView axis="horizontal" style={{ marginLeft: -SL.Space.gutterSession, marginRight: -SL.Space.gutterSession, alignSelf: "stretch" }}>
          <div
            style={{
              display: "grid",
              gridAutoFlow: "column",
              gridTemplateRows: "56px 56px",
              gridAutoColumns: 250,
              columnGap: SL.Space.s2,
              rowGap: SL.Space.s2,
              paddingLeft: SL.Space.gutterSession,
              paddingRight: SL.Space.gutterSession,
              width: "max-content",
            }}
          >
            {favorites.map((favorite) =>
              quickPill(
                `fav-${FavoriteFood.id(favorite)}`,
                favorite.name,
                `${whole(favorite.protein)} g protein · ${whole(favorite.calories)}`,
                <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: SL.Signal.actionTint, display: "grid", placeItems: "center" }}>
                  <SFSymbol name="star.fill" size={13} weight={600} color={SL.Signal.action} />
                </div>,
                (moment) => FavoriteFood.entry(favorite, { id: foodID(moment), on: moment, meal: Meal.likely({ at: moment }) }),
              ),
            )}
            {ideas.map((idea) =>
              quickPill(
                idea.id,
                idea.name,
                `${whole(FoodIdea.protein(idea))} g protein · ${whole(FoodIdea.calories(idea))}`,
                <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0, borderRadius: "50%", overflow: "hidden" }}>
                  <SLFoodPhoto source={{ kind: "asset", value: idea.imageName }} cornerRadius={18} style={{ width: 36, height: 36, filter: "saturate(0.7)" }} />
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}` }} />
                </div>,
                (moment) => FoodIdea.entry(idea, { id: foodID(moment), date: moment, meal: Meal.likely({ at: moment }) }),
              ),
            )}
          </div>
        </ScrollView>
      </VStack>
    );
  })();

  // MARK: - The food log

  const history: NutritionHistory = app.nutritionHistory({ before: now });

  /** The day on screen in the log: today, or a day picked from the strip. */
  const shownDay: { day: NutritionDay; past?: NutritionHistory_Day } = (() => {
    const past = diaryDay === undefined ? undefined : history.days.find((d) => NutritionHistory_Day.id(d) === diaryDay);
    if (!past) return { day };
    return { day: past.summary, past };
  })();

  const stripRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // reader.scrollTo("today", anchor: .trailing)
    const el = stripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const dayChip = (date: Date, key: string | undefined, dot: string | undefined, enabled: boolean) => {
    const isSelected = diaryDay === key;
    return (
      <SLPress
        key={key ?? "today"}
        scale={0.94}
        disabled={!enabled}
        aria-label={key === undefined ? "Today" : `${formatEnUS(date, "EEEE, MMMM d")}${enabled ? "" : ", Nothing logged"}`}
        onPress={() => setDiaryDay(key)}
        style={{ flexShrink: 0 }}
      >
        <VStack
          spacing={3}
          style={{
            width: key === undefined ? 52 : 44,
            height: 62,
            justifyContent: "center",
            borderRadius: SL.Radius.md,
            background: isSelected ? SL.Surface.raised2 : "transparent",
            boxShadow: `inset 0 0 0 1px ${isSelected ? SL.Surface.hairlineStrong : "transparent"}`,
            transition: `background-color ${SL.Motion.base}s ease-out, box-shadow ${SL.Motion.base}s ease-out`,
          }}
        >
          <Text size={SL.TypeSize.micro} weight={SL.Weight.medium} color={isSelected ? SL.Ink.primary : SL.Ink.secondary} lineLimit={1}>
            {key === undefined ? "Today" : formatEnUS(date, "EEE")}
          </Text>
          <Text size={SL.TypeSize.lead} weight={SL.Weight.semibold} numerals color={enabled ? SL.Ink.primary : SL.Ink.tertiary}>
            {formatEnUS(date, "d")}
          </Text>
          <div aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: dot ?? "transparent" }} />
        </VStack>
      </SLPress>
    );
  };

  /** Two weeks and today, today on the right: the weekday, the date, and a dot for how the day went. */
  const dayStrip = (() => {
    const past = [...history.days].reverse();
    return (
      <ScrollView axis="horizontal" innerRef={stripRef} style={{ paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3, alignSelf: "stretch" }}>
        <HStack spacing={SL.Space.s1} style={{ paddingLeft: SL.Space.s3, paddingRight: SL.Space.s4, width: "max-content" }}>
          {past.map((d) =>
            dayChip(
              d.date,
              NutritionHistory_Day.id(d),
              !NutritionHistory_Day.isLogged(d)
                ? undefined
                : NutritionHistory_Day.onTarget(d) || !NutritionDay.hasTarget(d.summary)
                  ? SL.Signal.recovery
                  : SL.Signal.attention,
              NutritionHistory_Day.isLogged(d),
            ),
          )}
          {dayChip(now, undefined, day.entries.length === 0 ? undefined : SL.Signal.action, true)}
        </HStack>
      </ScrollView>
    );
  })();

  const flagChip = (text: string, ink: string) => (
    <span
      key={text}
      style={{
        ...slFont(SL.TypeSize.micro, SL.Weight.semibold),
        color: ink,
        paddingLeft: SL.Space.s2,
        paddingRight: SL.Space.s2,
        paddingTop: 4,
        paddingBottom: 4,
        borderRadius: SL.Radius.pill,
        background: colorOpacity(ink, 0.14),
        whiteSpace: "nowrap",
        flexShrink: 0,
        lineHeight: 1.25,
      }}
    >
      {text}
    </span>
  );

  const macroFigure = (letter: string, eaten: number, target: number, low: boolean) => (
    <HStack key={letter} alignment="firstTextBaseline" spacing={3} style={{ ...slNumerals, whiteSpace: "nowrap", flexShrink: 0 }}>
      <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} color={SL.Ink.secondary} lineLimit={1}>
        {letter}
      </Text>
      <Text {...slBody(SL.Weight.semibold)} numerals color={low ? SL.Signal.attention : SL.Ink.primary} lineLimit={1}>
        {whole(eaten)}
      </Text>
      {target > 0 && (
        <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1}>
          {`/${whole(target)}`}
        </Text>
      )}
    </HStack>
  );

  /** A past day in one line: its calories, the three macros against their targets, and what it missed. */
  const pastSummary = (past: NutritionHistory_Day) => {
    const target = past.summary.targets?.calories;
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ padding: SL.Space.s4, alignSelf: "stretch" }}>
        <HStack alignment="firstTextBaseline" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
          <Text {...slLead()} numerals color={SL.Ink.primary}>
            {kcal(past.summary.calories)}
          </Text>
          {target !== undefined && target > 0 && (
            <Text {...slMeta()} numerals color={SL.Ink.secondary}>
              {`of ${whole(target)}`}
            </Text>
          )}
          <Spacer minLength={SL.Space.s2} />
          {NutritionHistory_Day.onTarget(past) && flagChip("On target", SL.Signal.recovery)}
        </HStack>
        <HStack spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
          {macroFigure("P", past.summary.protein, NutritionDay.target(past.summary, { for: Macro.protein }), past.flags.includes(NutritionHistory_Flag.lowProtein))}
          {macroFigure("C", past.summary.carbs, NutritionDay.target(past.summary, { for: Macro.carbs }), past.flags.includes(NutritionHistory_Flag.lowCarbs))}
          {macroFigure("F", past.summary.fat, NutritionDay.target(past.summary, { for: Macro.fat }), false)}
          <Spacer minLength={0} />
        </HStack>
        {past.flags.length > 0 && <HStack spacing={SL.Space.s1}>{past.flags.map((f) => flagChip(NutritionHistory_Flag.label(f), SL.Signal.attention))}</HStack>}
      </VStack>
    );
  };

  /** "12 items" · the detail under an item's name: "100 g · 46 g protein". */
  const detail = (entry: NutritionEntry): string =>
    [NutritionEntry.portion(entry), `${whole(entry.protein)} g protein`].filter((s): s is string => s !== undefined).join(" · ");

  const spoken = (entry: NutritionEntry, section: MealSection): string =>
    [
      entry.loggedAt ? `logged at ${clock(entry.loggedAt)}` : undefined,
      section.title,
      entry.name,
      NutritionEntry.portion(entry),
      kcal(entry.calories),
      `${whole(entry.protein)} grams of protein`,
    ]
      .filter((s): s is string => s !== undefined)
      .join(", ");

  /** One logged item: when, what it was and which meal, and what it cost. */
  const row = (entry: NutritionEntry, section: MealSection) => (
    <FoodRow
      key={entry.id}
      isSwiped={swiped === entry.id}
      reduceMotion={reduceMotion}
      label={spoken(entry, section)}
      onTap={() => setSheet(swiped === entry.id ? undefined : { kind: "edit", value: entry })}
      onSwipe={(dx) => setSwiped(dx < -24 ? entry.id : undefined)}
      onDelete={() => del(entry)}
      onHold={() => setMenuEntry(entry)}
    >
      <SLAdaptiveRow
        leading={
          <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8} style={{ width: timeWidth, flexShrink: 0 }}>
            {entry.loggedAt ? clock(entry.loggedAt) : ""}
          </Text>
        }
        main={
          <VStack alignment="leading" spacing={3}>
            <Text {...slLead()} color={SL.Ink.primary} lineLimit={2} style={slLineHeight(1.3, { size: SL.TypeSize.lead })}>
              {entry.name}
            </Text>
            <Text {...slBody()} numerals color={SL.Ink.secondary} lineLimit={2}>
              {slUnbroken(detail(entry))}
            </Text>
          </VStack>
        }
        trailing={
          <span style={{ ...slNumerals, whiteSpace: "nowrap", flexShrink: 0 }}>
            <span style={{ ...slFont(SL.TypeSize.lead, SL.Weight.semibold), color: SL.Ink.primary }}>{whole(entry.calories)}</span>
            <span style={{ ...slFont(SL.TypeSize.meta, SL.Weight.regular), color: SL.Ink.secondary }}> kcal</span>
          </span>
        }
      />
    </FoodRow>
  );

  /** A meal in one line — its name, how many items, its calories — opening to the items. */
  const mealGroup = (section: MealSection, today: boolean) => {
    const id = MealSection.id(section);
    const isOpen = openMeals.has(id);
    if (MealSection.isEmpty(section)) {
      return (
        <Pressable
          disabled={!today}
          aria-label={today ? `${section.title}, nothing yet. Add` : `${section.title}, nothing logged`}
          onPress={() => {
            if (today) setSheet({ kind: "add", value: section.meal });
          }}
          style={{ display: "flex", alignItems: "center", gap: SL.Space.s3, paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 52, width: "100%", background: "transparent", textAlign: "left" }}
        >
          <Text {...slBody()} color={SL.Ink.secondary}>
            {section.title}
          </Text>
          <Spacer minLength={SL.Space.s2} />
          {today ? (
            <HStack spacing={4} style={{ color: SL.Ink.secondary }}>
              <SLGlyph name="plus" size={12} fixed />
              <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>
                Add
              </Text>
            </HStack>
          ) : (
            <Text {...slBody()} color={SL.Ink.tertiary}>
              —
            </Text>
          )}
        </Pressable>
      );
    }
    const count = section.entries.length;
    return (
      <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
        <Pressable
          aria-label={`${section.title}, ${count} ${count === 1 ? "item" : "items"}, ${kcal(section.calories)}. ${isOpen ? "Folds the items away" : "Shows the items"}`}
          onPress={() => {
            const next = new Set(openMeals);
            if (isOpen) next.delete(id);
            else next.add(id);
            setOpenMeals(next);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: SL.Space.s3,
            paddingLeft: SL.Space.s4,
            paddingRight: SL.Space.s4,
            paddingTop: SL.Space.s3,
            paddingBottom: SL.Space.s3,
            minHeight: 60,
            width: "100%",
            background: "transparent",
            textAlign: "left",
          }}
        >
          <VStack alignment="leading" spacing={1} style={{ flex: "0 1 auto", minWidth: 0 }}>
            <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
              {section.title}
            </Text>
            <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
              {section.entries.map((e) => e.name).join(", ")}
            </Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
          <span style={{ ...slNumerals, whiteSpace: "nowrap", flexShrink: 0 }}>
            <span style={{ ...slFont(SL.TypeSize.body, SL.Weight.semibold), color: SL.Ink.primary }}>{whole(section.calories)}</span>
            <span style={{ ...slFont(SL.TypeSize.meta, SL.Weight.regular), color: SL.Ink.secondary }}> kcal</span>
          </span>
          <SLGlyph
            name="chevronDown"
            size={12}
            color={SL.Ink.tertiary}
            style={{ transform: `rotate(${isOpen ? 180 : 0}deg)`, transition: `transform ${SL.Motion.base}s ease-out` }}
          />
        </Pressable>
        {isOpen &&
          section.entries.map((entry) => (
            <div key={entry.id} style={{ position: "relative" }}>
              {row(entry, section)}
              <SLHairline style={{ position: "absolute", top: 0, left: SL.Space.s4, right: 0 }} />
            </div>
          ))}
      </VStack>
    );
  };

  /** "Last 14 days · avg 2,350 kcal · on target 4/6 · protein 3/6" */
  const stretchLine = (() => {
    const logged = NutritionHistory.logged(history).length;
    const parts = ["Last 14 days"];
    const average = NutritionHistory.averageCalories(history);
    if (average !== undefined) parts.push(`avg ${whole(average)} kcal`);
    if (history.calorieTarget !== undefined) {
      parts.push(`on target ${NutritionHistory.daysOnCalories(history)}/${logged}`);
      parts.push(`protein ${NutritionHistory.daysProteinHit(history)}/${logged}`);
    }
    return (
      <HStack spacing={SL.Space.s2} style={{ paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3, alignSelf: "stretch" }}>
        <SFSymbol name="chart.bar.fill" size={12} weight={600} color={SL.Ink.secondary} />
        <Text {...slMeta()} numerals color={SL.Ink.secondary}>
          {parts.join(" · ")}
        </Text>
      </HStack>
    );
  })();

  /**
   * One card for what was eaten, today and before: a strip of days to pick
   * from, the picked day's meals folded to one line each, and how the two
   * weeks went in one line at the foot.
   */
  const foodLog = (() => {
    const shown = shownDay;
    const count = shown.day.entries.length;
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <SLSectionHead title={shown.past === undefined ? "Eaten today" : formatEnUS(shown.past.date, "EEEE, MMM d")} meta={`${count} ${count === 1 ? "item" : "items"}`} />
        <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch", background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}>
          {dayStrip}
          {shown.past && (
            <>
              <SLHairline />
              {pastSummary(shown.past)}
            </>
          )}
          {NutritionDay.sections(shown.day).map((section) => (
            <div key={MealSection.id(section)} style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
              <SLHairline />
              {mealGroup(section, shown.past === undefined)}
            </div>
          ))}
          {NutritionHistory.logged(history).length > 0 && (
            <>
              <SLHairline />
              {stretchLine}
            </>
          )}
        </VStack>
      </VStack>
    );
  })();

  // MARK: - Sheets

  const close = () => setSheet(undefined);
  const presented = sheet ?? lastSheet.current;
  const sheetContent = (() => {
    if (!presented) return null;
    switch (presented.kind) {
      case "add":
        return (
          <AddFoodSheet
            key={sheetID(presented)}
            date={now}
            meal={presented.value}
            onLog={(entry) => {
              close();
              add(entry);
            }}
            onLogAll={(entries) => {
              close();
              addAll(entries);
            }}
            onClose={close}
          />
        );
      case "edit": {
        const entry = presented.value;
        return (
          <FoodEntrySheet
            key={sheetID(presented)}
            entry={entry}
            onSave={(changed) => {
              close();
              save(changed, entry);
            }}
            onDelete={(removed) => {
              close();
              del(removed);
            }}
            onRelog={(again) => {
              close();
              const moment = new Date();
              setNow(moment);
              add(FoodMemory.repeated(again, { on: moment, meal: Meal.likely({ at: moment }) }));
            }}
          />
        );
      }
      case "recipe": {
        const recipe = presented.value;
        return (
          <RecipeSheet
            key={sheetID(presented)}
            recipe={recipe}
            display={display}
            onLog={(meal) => {
              close();
              const moment = new Date();
              setNow(moment);
              add(Recipe.entry(recipe, { id: foodID(moment), date: moment, meal }));
            }}
            onClose={close}
          />
        );
      }
      case "plan":
        return <NutritionPlanSheet key="plan" onClose={close} />;
      case "targets":
        return (
          <TargetsSheet
            key="targets"
            targets={app.targets}
            onSave={(changes) => {
              close();
              void app.record(changes);
            }}
            onClose={close}
          />
        );
    }
  })();

  // The held row's menu.
  const menuActions = (() => {
    const entry = menuEntry;
    if (!entry) return [];
    const favorite = app.isFavorite(entry);
    const actions = [{ title: favorite ? "Remove from favorites" : "Add to favorites", action: () => app.toggleFavorite(entry) }];
    if (entry.date !== Schedule.dateKey(new Date())) {
      actions.push({
        title: "Log again today",
        action: () => {
          const moment = new Date();
          setNow(moment);
          add(FoodMemory.repeated(entry, { on: moment, meal: Meal.likely({ at: moment }) }));
        },
      });
    }
    return [...actions, { title: "Cancel", role: "cancel" as const }];
  })();

  return (
    <SLTabHeaderPinned header={header}>
      <style>{breatheCSS}</style>
      <ScrollView style={{ flex: "1 1 0" }}>
        {/* 24 between sections, 8 from a section's head to its card. */}
        <VStack
          alignment="leading"
          spacing={SL.Space.s6}
          style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Metric.tabContentTop, paddingBottom: SL.Space.s6 }}
        >
          {/* Today, then what it was made of, then ideas for what is still missing — Training's order: now, done, next. */}
          {hero}
          {mealNudge}
          {planCard}
          {foodLog}
          {ideasSection}
          <RecipesSection display={display} initial={likely} onOpen={(recipe) => setSheet({ kind: "recipe", value: recipe })} />
        </VStack>
      </ScrollView>
      {/* The undo sits above the tab bar, where a deleted row can be put back without anything being covered. */}
      <div
        role="status"
        aria-live="polite"
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          paddingLeft: SL.Space.gutterSession,
          paddingRight: SL.Space.gutterSession,
          paddingBottom: toast ? SL.Space.s2 : 0,
          opacity: toast ? 1 : 0,
          transition: `opacity ${SLMotion.duration(SL.Motion.base, { reduceMotion })}s ease-out`,
        }}
      >
        {toast && <SLUndoToast key={toast.id} message={toast.message} onUndo={toast.undo} onDismiss={() => setToast(undefined)} />}
      </div>

      <Sheet isPresented={sheet !== undefined} onDismiss={close}>
        {sheetContent}
      </Sheet>

      <ConfirmationDialog isPresented={menuEntry !== undefined} onDismiss={() => setMenuEntry(undefined)} actions={menuActions} />
    </SLTabHeaderPinned>
  );
}

const breatheCSS = `
@keyframes sl-nutrition-breathe { from { transform: scale(1); opacity: 1; } to { transform: scale(1.7); opacity: 0; } }
.sl-nutrition-breathe { animation: sl-nutrition-breathe 1.6s ease-out 0.8s infinite; }
@media (prefers-reduced-motion: reduce) { .sl-nutrition-breathe { animation: none; } }
`;

/**
 * A logged row: a plain row rather than a button, so a sideways drag across
 * it offers the delete instead of opening the item. Holding it opens its menu.
 */
function FoodRow({
  isSwiped,
  reduceMotion,
  label,
  onTap,
  onSwipe,
  onDelete,
  onHold,
  children,
}: {
  isSwiped: boolean;
  reduceMotion: boolean;
  label: string;
  onTap: () => void;
  onSwipe: (dx: number) => void;
  onDelete: () => void;
  onHold: () => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = undefined;
  };
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "flex-end", alignItems: "stretch", overflow: "hidden" }}>
      <button
        type="button"
        className="sl-pressable"
        aria-hidden={!isSwiped}
        tabIndex={isSwiped ? 0 : -1}
        onClick={onDelete}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          ...slFont(SL.TypeSize.body, SL.Weight.semibold),
          color: SL.Signal.loss,
          paddingLeft: SL.Space.s4,
          paddingRight: SL.Space.s4,
          background: "transparent",
          opacity: isSwiped ? 1 : 0,
          transition: `opacity ${SLMotion.duration(SL.Motion.fast, { reduceMotion })}s ease-out`,
        }}
      >
        Delete
      </button>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${label}. Double-tap to change the amount, meal or delete`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTap();
          } else if (e.key === "Delete" || e.key === "Backspace") {
            onDelete();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          cancelHold();
          held.current = true;
          onHold();
        }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY, moved: false };
          held.current = false;
          cancelHold();
          hold.current = setTimeout(() => {
            held.current = true;
            onHold();
          }, 500);
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancelHold();
        }}
        onPointerUp={(e) => {
          cancelHold();
          const s = start.current;
          start.current = null;
          if (!s || held.current) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.hypot(dx, dy) >= 16) {
            s.moved = true;
            if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx);
            return;
          }
          onTap();
        }}
        onPointerCancel={() => {
          cancelHold();
          start.current = null;
        }}
        style={{
          position: "relative",
          width: "100%",
          minHeight: 72,
          paddingLeft: SL.Space.s4,
          paddingRight: SL.Space.s4,
          paddingTop: SL.Space.s3,
          paddingBottom: SL.Space.s3,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: SL.Surface.raised,
          transform: `translateX(${isSwiped ? -swipeReveal : 0}px)`,
          transition: `transform ${SLMotion.duration(SL.Motion.fast, { reduceMotion })}s ease-out`,
          touchAction: "pan-y",
          cursor: "pointer",
          WebkitUserSelect: "none",
          userSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

