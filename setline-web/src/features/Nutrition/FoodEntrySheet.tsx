// FoodEntrySheet.swift — Artboard 42d · Item wijzigen.
//
// One logged row: how much of it, what that comes to, which meal it belongs
// to. The amount is the control, and the numbers under it are what this
// amount is worth — recomputed as it changes, so nothing is saved that the
// reader has not already seen.
//
// Only this entry is written, and only when Save is tapped. Its id, its date
// and the hour it was logged at are kept.
import { useState, type CSSProperties } from "react";
import { SL } from "../../design/tokens";
import { HStack, Pressable, ScrollView, Spacer, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, SLPrimaryButton } from "../../design/SetlineTokens";
import { Presentation } from "../../design/support";
import { slLineHeight } from "../../design/SLDynamicType";
import { SLSound } from "../../design/SLSound";
import { slBody, slMeta } from "../../design/components/SLText";
import { SLPress } from "../../design/components/SLPress";
import { useApp } from "../../data/AppState";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Schedule } from "../../core/Engine/Schedule";
import { Meal, MealSection, NutritionEntry } from "../../core/Nutrition/NutritionDay";
import { deepEqual, rounded } from "../../core/Support/swift";
import { trimmingWhitespaces } from "../../core/Support/nutrition";
import { MealSegment } from "./AddFoodSheet";

/**
 * Where the day reads this entry: its own meal, or Snacks for pre-workout and
 * for a name this app does not know — the same reading `NutritionDay` groups by.
 */
function heading(entry: NutritionEntry): Meal {
  const stored = Meal.fromRawValue(entry.meal);
  if (stored === undefined) return Meal.snack;
  return MealSection.headings.some((h) => h[0] === stored) ? stored : Meal.snack;
}

export function FoodEntrySheet({
  entry,
  onSave,
  onDelete,
  onRelog,
}: {
  entry: NutritionEntry;
  onSave: (entry: NutritionEntry) => void;
  onDelete: (entry: NutritionEntry) => void;
  /** Logs the same item again, today. Offered on an item from another day. */
  onRelog?: (entry: NutritionEntry) => void;
}) {
  const app = useApp();
  const display = app.display;
  const [amount, setAmount] = useState<number>(entry.amount ?? 0);
  const [meal, setMeal] = useState<Meal>(() => heading(entry));
  /** Whether anything has been changed yet: touched, not merely different. */
  const [touched, setTouched] = useState(false);

  /** What is on screen: this entry at the amount now showing, under the meal now chosen. */
  const edited: NutritionEntry = NutritionEntry.filed(amount === entry.amount ? entry : NutritionEntry.scaled(entry, { to: amount }), { under: meal });
  const step = NutritionEntry.step(entry);

  // MARK: - Chrome

  const grip = (
    <div aria-hidden style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", paddingBottom: 18, flexShrink: 0 }}>
      <div style={{ width: 36, height: 5, borderRadius: SL.Radius.pill, background: SL.Surface.hairlineStrong }} />
    </div>
  );

  const eyebrow = (text: string, style?: CSSProperties) => (
    <Text size={SL.TypeSize.micro} weight={SL.Weight.medium} tracking={SL.TypeSize.micro * 0.06} color={SL.Ink.tertiary} style={style}>
      {text}
    </Text>
  );

  /** Kept as a favorite: one tap to log it again from Add food or the quick adds. */
  const isFavorite = app.isFavorite(entry);
  const favoriteButton = (
    <SLPress
      scale={0.9}
      bounces
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      onPress={() => {
        app.toggleFavorite(entry);
        if (!isFavorite) SLSound.play("pop");
      }}
      style={{ borderRadius: "50%", flexShrink: 0 }}
    >
      <div style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
        <SFSymbol name={isFavorite ? "star.fill" : "star"} size={18} weight={600} color={isFavorite ? SL.Signal.action : SL.Ink.secondary} />
      </div>
    </SLPress>
  );

  /** The hour is said only when the entry carries one; it is never derived from the meal it is filed under. */
  const standing = (() => {
    const title = MealSection.title({ of: Meal.fromRawValue(entry.meal) ?? Meal.snack });
    if (!entry.loggedAt) return title;
    return `${title} · logged ${NumberDisplay.clock(display, entry.loggedAt)}`;
  })();

  const head = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
      <HStack alignment="top" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
        <Text as="h2" size={28} weight={SL.Weight.semibold} color={SL.Ink.primary} style={{ flex: "1 1 0" }}>
          {entry.name}
        </Text>
        {favoriteButton}
      </HStack>
      <Text {...slBody()} numerals color={SL.Ink.secondary} style={{ paddingTop: SL.Space.s1 }}>
        {standing}
      </Text>
    </VStack>
  );

  // MARK: - How much of it

  const stepLabel = trimmingWhitespaces(`${NumberDisplay.number(display, step)} ${entry.unit ?? ""}`).toUpperCase();
  const amountLabel = trimmingWhitespaces(`${NumberDisplay.number(display, amount)} ${entry.unit ?? ""}`);

  /** The step never takes the amount to nothing: an item that is not eaten is deleted. */
  const canChange = (delta: number) => amount + delta >= step;
  const change = (delta: number) => {
    if (!canChange(delta)) return;
    setAmount(rounded((amount + delta) * 10) / 10);
    setTouched(true);
  };

  const stepButton = (symbol: string, delta: number, label: string) => (
    <Pressable
      onPress={() => change(delta)}
      disabled={!canChange(delta)}
      aria-label={label}
      style={{ background: "transparent", minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin, display: "grid", placeItems: "center", flexShrink: 0 }}
    >
      <SFSymbol name={symbol} size={SL.TypeSize.title} weight={500} color={canChange(delta) ? SL.Ink.primary : SL.Ink.tertiary} />
    </Pressable>
  );

  /** 42d's stepper: the label says what one tap is worth, so the number never jumps by a surprise. */
  const quantity = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch", paddingTop: SL.Space.s5 }}>
      {eyebrow(`AMOUNT · PER ${stepLabel}`)}
      <HStack
        spacing={0}
        role="group"
        aria-label={`Amount, ${amountLabel}`}
        style={{ alignSelf: "stretch", paddingLeft: 6, paddingRight: 6, minHeight: 56, marginTop: SL.Space.s2, borderRadius: SL.Radius.lg, background: SL.Surface.raised2 }}
      >
        {stepButton("minus", -step, "Less")}
        <Spacer minLength={0} />
        <Text size={28} weight={SL.Weight.semibold} numerals lineLimit={1} minimumScaleFactor={0.6} color={SL.Ink.primary}>
          {amountLabel}
        </Text>
        <Spacer minLength={0} />
        {stepButton("plus", step, "More")}
      </HStack>
    </VStack>
  );

  // MARK: - What that comes to

  /** The numbers the amount on screen is worth, so what Save writes was already read before it was written. */
  const macros = (top: number) => {
    const columns: [string, string][] = [
      ["kcal", NumberDisplay.whole(display, edited.calories)],
      ["Protein", NumberDisplay.grams(display, edited.protein)],
      ["Carbs", NumberDisplay.grams(display, edited.carbs)],
      ["Fat", NumberDisplay.grams(display, edited.fat)],
    ];
    return (
      <HStack alignment="top" spacing={SL.Space.s3} style={{ alignSelf: "stretch", paddingTop: top }}>
        {columns.map(([title, value]) => (
          <VStack key={title} alignment="leading" spacing={2} aria-label={`${title}, ${value}`} style={{ flex: "1 1 0", minWidth: 0 }}>
            <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.tertiary} lineLimit={1} minimumScaleFactor={0.7} style={{ maxWidth: "100%" }}>
              {title}
            </Text>
            <Text {...slBody(SL.Weight.semibold)} numerals lineLimit={1} minimumScaleFactor={0.7} color={SL.Ink.primary} style={{ maxWidth: "100%" }}>
              {value}
            </Text>
          </VStack>
        ))}
      </HStack>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        flex: "1 1 0",
        minHeight: 0,
        height: "100%",
        paddingLeft: SL.Space.gutterSession,
        paddingRight: SL.Space.gutterSession,
        paddingTop: 10,
        paddingBottom: `calc(34px + env(safe-area-inset-bottom))`,
        background: SL.Surface.raised,
      }}
    >
      {/* 42d opens 200 from the top of the frame, measured like 42c's. */}
      <Presentation detents={[{ fraction: 0.84 }]} dragIndicator="hidden" background={SL.Surface.raised} />
      {grip}

      {/* The item scrolls and the two actions stay put. */}
      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack alignment="leading" spacing={0} style={{ paddingBottom: SL.Space.s4, alignItems: "stretch" }}>
          {head}

          {entry.amount !== undefined ? (
            <>
              {quantity}
              {macros(14)}
            </>
          ) : (
            <>
              {/* An entry the web app wrote kept no amount, so there is nothing to scale. */}
              {macros(SL.Space.s5)}
              <Text {...slMeta()} color={SL.Ink.tertiary} style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.meta }), paddingTop: SL.Space.s3 }}>
                This item was logged without an amount, so it can't be changed here.
              </Text>
            </>
          )}

          {eyebrow("MEAL", { paddingTop: SL.Space.s6, paddingBottom: SL.Space.s2 })}
          <MealSegment
            selection={{
              value: meal,
              set: (next) => {
                if (next !== meal) setTouched(true);
                setMeal(next);
              },
            }}
          />
        </VStack>
      </ScrollView>

      {onRelog && entry.date !== Schedule.dateKey(new Date()) && (
        <div style={{ display: "flex", flexDirection: "column", paddingBottom: SL.Space.s2, flexShrink: 0 }}>
          <SLOutlineButton onPress={() => onRelog(edited)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <SFSymbol name="arrow.uturn.forward" size={SL.TypeSize.body} />
              Log again today
            </span>
          </SLOutlineButton>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <SLPrimaryButton disabled={!touched || deepEqual(edited, entry)} onPress={() => onSave(edited)}>
          Save
        </SLPrimaryButton>
      </div>

      <Pressable
        onPress={() => onDelete(entry)}
        style={{ background: "transparent", minHeight: SL.Space.hitMin, width: "100%", display: "grid", placeItems: "center", flexShrink: 0 }}
      >
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>
          Delete
        </Text>
      </Pressable>
    </div>
  );
}
