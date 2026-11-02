// MealBuilder.swift — builds or edits a meal: its name, then each ingredient
// with what it adds. The totals follow as you type, and the meal is saved for
// next time.
import { useState, type CSSProperties } from "react";
import { SL, slFont } from "../../design/tokens";
import { Alert, HStack, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLOutlineButton, SLPrimaryButton, colorOpacity } from "../../design/SetlineTokens";
import { SLPress } from "../../design/components/SLPress";
import { SLOverline } from "../../design/components/SLPieces";
import { SLSheet } from "../../design/components/SLSheet";
import { SLEyebrow, slMeta } from "../../design/components/SLText";
import { useApp } from "../../data/AppState";
import { NumberDisplay, NumberInput } from "../../core/Engine/NumberDisplay";
import { Meal, NutritionEntry } from "../../core/Nutrition/NutritionDay";
import { SavedMeal } from "../../core/Nutrition/SavedMeal";

interface Draft {
  id: string;
  name: string;
  amount: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

const blank = (): Draft => ({ id: crypto.randomUUID(), name: "", amount: "", calories: "", protein: "", carbs: "", fat: "" });
const text = (value: number) => (value === 0 ? "" : `${value}`);
const value = (typed: string) => NumberInput.value(typed);

/** Calories as typed, or worked out from the macros when left blank. */
const energy = (draft: Draft) => {
  const typed = value(draft.calories);
  return typed > 0 ? typed : NutritionEntry.calories({ protein: value(draft.protein), carbs: value(draft.carbs), fat: value(draft.fat) });
};

const inputStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  outline: "none",
  padding: 0,
  minWidth: 0,
  width: "100%",
  color: SL.Ink.primary,
  caretColor: SL.Signal.action,
};

export function MealBuilderSheet({
  meal,
  mealTime,
  onSave,
  onDelete,
  onClose,
}: {
  meal: SavedMeal | undefined;
  /** Where "Save and add" puts it. */
  mealTime: Meal;
  onSave: (meal: SavedMeal, log: boolean) => void;
  onDelete: (() => void) | undefined;
  onClose: () => void;
}) {
  const app = useApp();
  const [name, setName] = useState(meal?.name ?? "");
  const [drafts, setDrafts] = useState<Draft[]>(
    meal
      ? meal.ingredients.map((item) => ({
          id: item.id,
          name: item.name,
          amount: item.amount,
          calories: text(item.calories),
          protein: text(item.protein),
          carbs: text(item.carbs),
          fat: text(item.fat),
        }))
      : [blank()],
  );
  const [confirmsDelete, setConfirmsDelete] = useState(false);
  const [mealID] = useState(() => meal?.id ?? `meal-${Date.now()}`);

  const built: SavedMeal = {
    id: mealID,
    name: name.trim(),
    ingredients: drafts
      .filter((draft) => draft.name.trim().length > 0)
      .map((draft) => ({
        id: draft.id,
        name: draft.name.trim(),
        amount: draft.amount.trim(),
        calories: energy(draft),
        protein: value(draft.protein),
        carbs: value(draft.carbs),
        fat: value(draft.fat),
      })),
  };
  const isSavable = built.name.length > 0 && built.ingredients.length > 0 && SavedMeal.calories(built) > 0;

  const update = (id: string, change: Partial<Draft>) => setDrafts((list) => list.map((draft) => (draft.id === id ? { ...draft, ...change } : draft)));

  const card: CSSProperties = {
    background: SL.Surface.ground,
    borderRadius: SL.Radius.lg,
    boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}`,
  };

  const macroField = (label: string, draft: Draft, key: "calories" | "protein" | "carbs" | "fat") => (
    <label key={key} style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", borderRadius: SL.Radius.md, background: SL.Surface.raised2 }}>
      <span style={{ ...slFont(SL.TypeSize.micro, SL.Weight.semibold), color: SL.Ink.tertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <input
        inputMode="decimal"
        placeholder="0"
        value={draft[key]}
        onChange={(event) => update(draft.id, { [key]: NumberInput.numericOnly(event.target.value) })}
        style={{ ...inputStyle, ...slFont(SL.TypeSize.body, SL.Weight.medium), fontVariantNumeric: "tabular-nums" }}
      />
    </label>
  );

  return (
    <SLSheet title={meal ? "Edit meal" : "Build a meal"} subtitle="Name it, then add what goes in it. Saved for next time." onClose={onClose}>
      <VStack alignment="leading" spacing={SL.Space.s5} style={{ alignSelf: "stretch", alignItems: "stretch", paddingTop: SL.Space.s2 }}>
        <label style={{ ...card, display: "flex", flexDirection: "column", gap: 2, padding: "12px 14px" }}>
          <SLEyebrow text="MEAL NAME" size={SL.TypeSize.micro} />
          <input
            autoFocus={!meal}
            placeholder="Spaghetti bolognese"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ ...inputStyle, ...slFont(SL.TypeSize.lead, SL.Weight.semibold) }}
          />
        </label>

        <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignItems: "stretch" }}>
          <SLOverline text="Ingredients" style={{ paddingLeft: SL.Space.s1 }} />
          {drafts.map((draft) => (
            <div key={draft.id} style={{ ...card, display: "flex", flexDirection: "column", gap: SL.Space.s2, padding: SL.Space.s3 }}>
              <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
                <input
                  placeholder="Ingredient, like olive oil"
                  value={draft.name}
                  onChange={(event) => update(draft.id, { name: event.target.value })}
                  style={{ ...inputStyle, ...slFont(SL.TypeSize.body, SL.Weight.medium), flex: "1 1 0" }}
                />
                <input
                  placeholder="Amount"
                  value={draft.amount}
                  onChange={(event) => update(draft.id, { amount: event.target.value })}
                  style={{ ...inputStyle, ...slFont(SL.TypeSize.body, SL.Weight.regular), color: SL.Ink.secondary, textAlign: "right", width: 96, flex: "0 0 96px" }}
                />
                {drafts.length > 1 && (
                  <SLPress
                    scale={0.9}
                    onPress={() => setDrafts((list) => list.filter((d) => d.id !== draft.id))}
                    aria-label={`Remove ${draft.name || "ingredient"}`}
                    style={{ width: 32, height: 32, borderRadius: "50%", background: SL.Surface.raised2, display: "grid", placeItems: "center", flexShrink: 0 }}
                  >
                    <SFSymbol name="xmark" size={12} weight={700} color={SL.Ink.tertiary} />
                  </SLPress>
                )}
              </HStack>
              <div style={{ display: "flex", gap: SL.Space.s2 }}>
                {macroField("kcal", draft, "calories")}
                {macroField("Protein g", draft, "protein")}
                {macroField("Carbs g", draft, "carbs")}
                {macroField("Fat g", draft, "fat")}
              </div>
            </div>
          ))}
          <SLPress
            scale={0.98}
            onPress={() => setDrafts((list) => [...list, blank()])}
            style={{
              minHeight: 52,
              borderRadius: SL.Radius.lg,
              border: `1px dashed ${colorOpacity(SL.Signal.action, 0.45)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              color: SL.Signal.action,
              ...slFont(SL.TypeSize.body, SL.Weight.semibold),
            }}
          >
            <SFSymbol name="plus" size={14} weight={700} color={SL.Signal.action} />
            Add ingredient
          </SLPress>
        </VStack>

        {/* What the whole meal adds, as you type. */}
        <HStack alignment="firstTextBaseline" spacing={SL.Space.s2} style={{ alignSelf: "stretch", padding: SL.Space.s4, borderRadius: SL.Radius.lg, background: SL.Signal.actionTint }}>
          <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0" }}>
            <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.secondary}>Whole meal</Text>
            <Text size={SL.TypeSize.title} weight={SL.Weight.bold} numerals color={SL.Ink.primary}>{NumberDisplay.kcal(app.display, SavedMeal.calories(built))}</Text>
          </VStack>
          <Text {...slMeta()} numerals color={SL.Ink.secondary}>
            {`P ${SavedMeal.protein(built)} g · C ${SavedMeal.carbs(built)} g · F ${SavedMeal.fat(built)} g`}
          </Text>
        </HStack>

        {onDelete && (
          <SLPress onPress={() => setConfirmsDelete(true)} style={{ minHeight: SL.Space.hitMin, color: SL.Signal.loss, ...slFont(SL.TypeSize.body, SL.Weight.medium), display: "grid", placeItems: "center" }}>
            Delete meal
          </SLPress>
        )}

        <VStack spacing={SL.Space.s2} style={{ position: "sticky", bottom: 0, alignItems: "stretch", paddingTop: SL.Space.s2, paddingBottom: SL.Space.s3, background: SL.Surface.raised }}>
          <SLPrimaryButton disabled={!isSavable} onPress={() => onSave(built, true)}>{`Save and add to ${Meal.spoken(mealTime)}`}</SLPrimaryButton>
          <SLOutlineButton emphasis="tertiary" disabled={!isSavable} onPress={() => onSave(built, false)}>Save meal</SLOutlineButton>
        </VStack>
      </VStack>

      <Alert
        isPresented={confirmsDelete}
        title={`Delete ${meal?.name ?? "this meal"}?`}
        message="What you already logged stays in your day."
        actions={[
          { title: "Cancel", role: "cancel" },
          { title: "Delete", role: "destructive", action: () => onDelete?.() },
        ]}
        onDismiss={() => setConfirmsDelete(false)}
      />
    </SLSheet>
  );
}
