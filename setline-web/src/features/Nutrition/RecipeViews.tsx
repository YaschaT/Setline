// RecipeViews.swift — recipes on Nutrition: a tab for each meal, opening on
// the one the clock suggests, and a row of cards in the quick adds' language.
import { useState } from "react";
import { SL, slFont, slNumerals } from "../../design/tokens";
import { HStack, Menu, Pressable, ScrollView, Spacer, Text, VStack } from "../../design/swiftui";
import { SLPrimaryButton, colorOpacity, spring } from "../../design/SetlineTokens";
import { useReduceMotion } from "../../design/support";
import { slFixed } from "../../design/SLDynamicType";
import { SLFoodPhoto } from "../../design/components/SLFoodPhoto";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slHitTarget, slMeta } from "../../design/components/SLText";
import { SLSectionHead } from "../../design/components/SLPieces";
import { SLPress } from "../../design/components/SLPress";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { Meal } from "../../core/Nutrition/NutritionDay";
import { Recipe, Recipes, type Recipe_Ingredient } from "../../core/Nutrition/Recipes";

const meals: Meal[] = [Meal.ontbijt, Meal.lunch, Meal.avondeten, Meal.snack];

/**
 * Recipes on Nutrition: a tab for each meal, opening on the one the clock
 * suggests, and a row of cards in the quick adds' language — the protein as
 * the number, the main ingredient as a small round photo.
 */
export function RecipesSection({ display, initial, onOpen }: { display: NumberDisplay; initial: Meal; onOpen: (recipe: Recipe) => void }) {
  const [meal, setMeal] = useState<Meal | undefined>(undefined);
  const reduceMotion = useReduceMotion();
  const shown: Meal = meal ?? (initial === Meal.preWorkout ? Meal.snack : initial);

  return (
    <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
      <SLSectionHead title="Recipes" meta="high protein" />

      {/* A segmented row, Training's week marks in words: the meal shown is the one on a raised pill. */}
      <HStack
        spacing={0}
        style={{
          alignSelf: "stretch",
          padding: 4,
          minHeight: SL.Space.hitMin,
          background: SL.Surface.raised,
          borderRadius: SL.Radius.pill,
          boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairline}`,
        }}
      >
        {meals.map((item) => {
          const on = item === shown;
          return (
            <Pressable
              key={item}
              onPress={() => setMeal(item)}
              aria-label={item === Meal.snack ? "Snacks" : Meal.label(item)}
              style={{
                flex: "1 1 0",
                minWidth: 0,
                minHeight: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: SL.Radius.pill,
                background: on ? SL.Surface.hairlineStrong : "transparent",
                transition: reduceMotion ? "none" : `background-color ${spring(0.3, 0.85)}`,
              }}
            >
              <Text {...slMeta(on ? SL.Weight.semibold : SL.Weight.regular)} color={on ? SL.Ink.primary : SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8}>
                {item === Meal.snack ? "Snacks" : Meal.label(item)}
              </Text>
            </Pressable>
          );
        })}
      </HStack>

      <ScrollView axis="horizontal" style={{ marginLeft: -SL.Space.gutterSession, marginRight: -SL.Space.gutterSession, alignSelf: "stretch" }}>
        <HStack spacing={SL.Space.s3} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, width: "max-content" }}>
          {Recipes.for(shown).map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} display={display} onOpen={() => onOpen(recipe)} />
          ))}
        </HStack>
      </ScrollView>
    </VStack>
  );
}

/** One recipe as a card. */
export function RecipeCard({ recipe, display, onOpen }: { recipe: Recipe; display: NumberDisplay; onOpen: () => void }) {
  const m = Recipe.macros(recipe);
  return (
    <SLPress
      onPress={onOpen}
      aria-label={`${recipe.name}, ${recipe.minutes} minutes, ${NumberDisplay.whole(display, m.protein)} grams of protein, ${NumberDisplay.kcal(display, m.calories)}`}
      style={{ flexShrink: 0, textAlign: "left" }}
    >
      <VStack
        alignment="leading"
        spacing={SL.Space.s3}
        style={{
          width: 196,
          height: 178,
          padding: SL.Space.s4,
          justifyContent: "flex-start",
          background: SL.Surface.raised,
          borderRadius: SL.Radius.xl,
          boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairline}`,
        }}
      >
        <HStack alignment="top" spacing={8} style={{ alignSelf: "stretch" }}>
          <RecipePhoto name={recipe.imageName} size={48} />
          <Spacer minLength={0} />
          <HStack spacing={4} style={{ paddingLeft: 8, paddingRight: 8, height: 24, borderRadius: SL.Radius.pill, background: SL.Surface.raised2, color: SL.Ink.secondary, flexShrink: 0 }}>
            <SLGlyph name="clock" size={12} fixed />
            <span style={{ ...slFixed(12, SL.Weight.medium), whiteSpace: "nowrap" }}>{`${recipe.minutes} min`}</span>
          </HStack>
        </HStack>
        <HStack alignment="firstTextBaseline" spacing={3}>
          <Text size={SL.TypeSize.title} weight={SL.Weight.semibold} color={SL.Ink.primary} numerals>
            {NumberDisplay.whole(display, m.protein)}
          </Text>
          <Text {...slMeta()} color={SL.Ink.secondary} numerals>
            g protein
          </Text>
        </HStack>
        <VStack alignment="leading" spacing={2} style={{ alignSelf: "stretch" }}>
          <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={2}>
            {recipe.name}
          </Text>
          <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} style={{ maxWidth: "100%" }}>
            {`${NumberDisplay.kcal(display, m.calories)} · ${recipe.ingredients.length} ingredients`}
          </Text>
        </VStack>
        <Spacer minLength={0} />
      </VStack>
    </SLPress>
  );
}

/** The main ingredient's photo, graded down to sit on the dark ground. */
export function RecipePhoto({ name, size }: { name: string; size: number }) {
  return (
    <div aria-hidden style={{ position: "relative", width: size, height: size, flexShrink: 0, borderRadius: "50%", overflow: "hidden" }}>
      <SLFoodPhoto source={{ kind: "asset", value: name }} cornerRadius={size / 2} style={{ width: size, height: size, filter: "saturate(0.7)" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: colorOpacity(SL.Surface.ground, 0.32) }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `inset 0 0 0 1.5px ${SL.Surface.hairlineStrong}` }} />
    </div>
  );
}

/**
 * A recipe, opened: what it gives, what goes in — ticked off while you
 * shop or cook — how to make it, and one action, logging it.
 */
export function RecipeSheet({ recipe, display, onLog, onClose }: { recipe: Recipe; display: NumberDisplay; onLog: (meal: Meal) => void; onClose: () => void }) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [meal, setMeal] = useState<Meal>(recipe.meal);
  const m = Recipe.macros(recipe);

  const stat = (value: string, label: string) => (
    <VStack key={label} alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
      <Text size={SL.TypeSize.title} weight={SL.Weight.semibold} numerals color={SL.Ink.primary}>
        {value}
      </Text>
      <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8} style={{ maxWidth: "100%" }}>
        {label}
      </Text>
    </VStack>
  );

  const ingredientRow = (item: Recipe_Ingredient, index: number) => {
    const on = ticked.has(index);
    return (
      <Pressable
        onPress={() => {
          const next = new Set(ticked);
          if (on) next.delete(index);
          else next.add(index);
          setTicked(next);
        }}
        aria-label={`${item.name}, ${item.amount}`}
        style={{ display: "flex", alignItems: "center", gap: SL.Space.s3, minHeight: 50, width: "100%", textAlign: "left", background: "transparent" }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            flexShrink: 0,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: on ? SL.Signal.action : "transparent",
            boxShadow: on ? "none" : `inset 0 0 0 1.5px ${SL.Surface.mute}`,
          }}
        >
          {on && <SLGlyph name="check" size={12} fixed color={SL.Signal.onAction} />}
        </div>
        <Text {...slBody()} color={on ? SL.Ink.secondary : SL.Ink.primary} style={{ flex: "1 1 0", textDecoration: on ? "line-through" : "none", textDecorationColor: SL.Ink.tertiary }}>
          {item.name}
        </Text>
        <Text {...slMeta()} numerals color={SL.Ink.secondary}>
          {item.amount}
        </Text>
      </Pressable>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", background: SL.Surface.ground }}>
      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack
          alignment="leading"
          spacing={SL.Space.s6}
          style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: SL.Space.s6, paddingTop: 14 }}
        >
          <HStack style={{ alignSelf: "stretch" }}>
            <Spacer />
            <Pressable onPress={onClose} style={{ background: "transparent" }}>
              <span style={{ ...slFont(SL.TypeSize.body, SL.Weight.medium), color: SL.Ink.secondary, display: "inline-block", ...slHitTarget() }}>Done</span>
            </Pressable>
          </HStack>

          {/* The head: the photo, which meal, the name, the time. */}
          <HStack alignment="center" spacing={SL.Space.s4}>
            <RecipePhoto name={recipe.imageName} size={72} />
            <VStack alignment="leading" spacing={4} style={{ flex: "0 1 auto" }}>
              <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={1} color={SL.Ink.secondary}>
                {recipe.meal === Meal.snack ? "SNACK" : Meal.label(recipe.meal).toUpperCase()}
              </Text>
              <Text size={SL.TypeSize.title} weight={SL.Weight.bold} color={SL.Ink.primary}>
                {recipe.name}
              </Text>
              <Text {...slMeta()} color={SL.Ink.secondary}>
                {`${recipe.minutes} min · 1 serving`}
              </Text>
            </VStack>
          </HStack>

          <Text {...slBody()} color={SL.Ink.secondary} style={{ marginTop: -SL.Space.s3 }}>
            {recipe.summary}
          </Text>

          {/* What one serving gives, as Training's stat row. */}
          <HStack
            alignment="top"
            spacing={0}
            style={{
              alignSelf: "stretch",
              padding: SL.Space.s4,
              background: SL.Surface.raised,
              borderRadius: SL.Radius.xl,
              boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairline}`,
            }}
          >
            {stat(NumberDisplay.whole(display, m.protein), "g protein")}
            {stat(NumberDisplay.whole(display, m.calories), "kcal")}
            {stat(NumberDisplay.whole(display, m.carbs), "g carbs")}
            {stat(NumberDisplay.whole(display, m.fat), "g fat")}
          </HStack>

          <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
            <SLSectionHead title="Ingredients" meta={ticked.size === 0 ? "tap to tick off" : `${ticked.size} of ${recipe.ingredients.length}`} />
            <VStack
              spacing={0}
              style={{
                alignSelf: "stretch",
                alignItems: "stretch",
                paddingLeft: SL.Space.s4,
                paddingRight: SL.Space.s4,
                background: SL.Surface.raised,
                borderRadius: SL.Radius.xl,
                boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.hairline}`,
              }}
            >
              {recipe.ingredients.map((item, index) => (
                <div key={index} style={{ position: "relative" }}>
                  {ingredientRow(item, index)}
                  {index > 0 && <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />}
                </div>
              ))}
            </VStack>
          </VStack>

          <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
            <SLSectionHead title="Method" meta={`${recipe.steps.length} steps`} />
            {recipe.steps.map((step, index) => (
              <HStack key={index} alignment="top" spacing={SL.Space.s3} aria-label={`Step ${index + 1}. ${step}`} style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1 }}>
                <div
                  style={{
                    ...slFixed(13, SL.Weight.bold),
                    color: SL.Ink.primary,
                    width: 26,
                    height: 26,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "50%",
                    background: SL.Surface.raised2,
                    boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
                    // The circle's centre sits 5 above the step's first baseline.
                    marginTop: 0,
                  }}
                >
                  {`${index + 1}`}
                </div>
                <Text {...slBody()} color={SL.Ink.primary} lineHeight={(SL.TypeSize.body * 1.25 + 3) / SL.TypeSize.body} style={{ flex: "1 1 0", paddingTop: 2 }}>
                  {step}
                </Text>
              </HStack>
            ))}
          </VStack>

          <Text {...slMeta()} color={SL.Ink.tertiary}>
            Values worked out per ingredient from USDA FoodData Central.
          </Text>
        </VStack>
      </ScrollView>

      <VStack
        spacing={SL.Space.s2}
        style={{
          flexShrink: 0,
          alignItems: "center",
          paddingLeft: SL.Space.gutterSession,
          paddingRight: SL.Space.gutterSession,
          paddingTop: SL.Space.s2,
          paddingBottom: `calc(${SL.Space.s3}px + env(safe-area-inset-bottom))`,
          background: SL.Surface.ground,
        }}
      >
        <Menu
          entries={meals.map((item) => ({
            kind: "button" as const,
            title: item === Meal.snack ? "Snacks" : Meal.label(item),
            action: () => setMeal(item),
          }))}
          label={
            <HStack spacing={4} style={{ ...slFont(SL.TypeSize.meta, SL.Weight.medium), color: SL.Ink.secondary, minHeight: 32 }}>
              <span>{`Log to ${meal === Meal.snack ? "snacks" : Meal.spoken(meal)}`}</span>
              <SLGlyph name="chevronDown" size={12} />
            </HStack>
          }
        />
        <SLPrimaryButton onPress={() => onLog(meal)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, ...slNumerals }}>
            <SLGlyph name="plus" size={16} />
            {`Log this · ${NumberDisplay.whole(display, m.protein)} g protein`}
          </span>
        </SLPrimaryButton>
      </VStack>
    </div>
  );
}
