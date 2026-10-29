// AddFoodSheet.swift — Artboard 42c · Toevoegen.
//
// The meal is already chosen, because the hour knows which one it is, and one
// tap changes it. Under it: a search, then what this account eats at this
// meal, then what it ate last — each row an item it has logged before, at the
// amount it was logged at, one ⊕ from being logged again.
//
// Nothing here is invented. The lists are the account's own entries, and the
// search is the web app's endpoint (`/api/food-search`), shown in the order
// the server ranked it.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SL, slFont } from "../../design/tokens";
import { FullScreenCover, HStack, Pressable, ScrollView, Spacer, Text, VStack, type Binding } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { Presentation } from "../../design/support";
import { slLineHeight } from "../../design/SLDynamicType";
import { SLSound } from "../../design/SLSound";
import { SLFoodPhoto, type SLFoodPhoto_Source } from "../../design/components/SLFoodPhoto";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLEyebrow, SLHairline, slBody, slHitTarget, slLead, slMeta, slTitle } from "../../design/components/SLText";
import { SLPress } from "../../design/components/SLPress";
import { useApp } from "../../data/AppState";
import { NumberDisplay, NumberInput } from "../../core/Engine/NumberDisplay";
import { Schedule } from "../../core/Engine/Schedule";
import { FoodProduct, FoodSearch } from "../../core/Nutrition/FoodSearch";
import { FavoriteFood, ScannedFood } from "../../core/Nutrition/FoodLookup";
import { FoodMemory } from "../../core/Nutrition/FoodMemory";
import { MealRecognition, MealRecognition_Food } from "../../core/Nutrition/MealRecognition";
import { Meal, MealSection, NutritionEntry } from "../../core/Nutrition/NutritionDay";
import { charCount, trimmingWhitespaces, trimmingWhitespacesAndNewlines } from "../../core/Support/nutrition";
import { BarcodeScanSheet, FoodPhotoScanSheet } from "./FoodScanViews";

type Scanner = "barcode" | "photo";
type Field = "query" | "name" | "amount" | "unit" | "calories" | "protein" | "carbs" | "fat";

function newID(): string {
  return `food-${Math.trunc(Date.now())}`;
}

/** The search's products, the ones whose name says what was typed first. */
function ranked(products: FoodProduct[], query: string): FoodProduct[] {
  return products
    .map((element, offset) => ({ element, offset, score: MealRecognition.similarity(query, { to: element.name, brand: element.brand }) }))
    .sort((a, b) => (a.score === b.score ? a.offset - b.offset : b.score - a.score))
    .map((x) => x.element);
}

/** A text field with no chrome of its own: the lime caret and the tertiary prompt. */
export const bareInput: CSSProperties = {
  border: "none",
  outline: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  minWidth: 0,
  appearance: "none",
};

export function AddFoodSheet({
  date,
  meal,
  onLog,
  onLogAll,
  onClose,
}: {
  date: Date;
  /** Which heading the ⊕ adds to. 42c preselects it from the hour. */
  meal: Meal;
  onLog: (entry: NutritionEntry) => void;
  /** Several at once, from a meal scan. Falls back to one by one. */
  onLogAll?: (entries: NutritionEntry[]) => void;
  onClose: () => void;
}) {
  const app = useApp();
  const display = app.display;
  const kcal = (v: number) => NumberDisplay.kcal(display, v);
  const whole = (v: number) => NumberDisplay.whole(display, v);
  /** The ⊕'s size. */
  const plusSize = 24;

  const [chosen, setChosen] = useState<Meal>(meal);
  const [scanning, setScanning] = useState<Scanner | undefined>(undefined);
  const lastScanner = useRef<Scanner | undefined>(undefined);
  if (scanning) lastScanner.current = scanning;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodProduct[]>([]);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  /** The food that is not in any database, written out by hand. */
  const [manual, setManual] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("100");
  const [unit, setUnit] = useState("g");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [focused, setFocused] = useState<Field | undefined>(undefined);
  const queryRef = useRef<HTMLInputElement>(null);

  // Typing finds things without asking for the return key, and one request
  // is sent per pause rather than per letter.
  useEffect(() => {
    const asked = trimmingWhitespacesAndNewlines(query);
    if (charCount(asked) < FoodSearch.shortestQuery) {
      setResults([]);
      setNote(undefined);
      setSearching(false);
      return;
    }
    // What was said about the last query does not belong to this one.
    setNote(undefined);
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const outcome = await app.searchFood(asked);
        if (cancelled) return;
        setSearching(false);
        switch (outcome.kind) {
          case "found":
            setResults(ranked(outcome.value, asked));
            setNote(undefined);
            break;
          case "partial":
            setResults(ranked(outcome.value, asked));
            setNote(outcome.note);
            break;
          case "failed":
            setResults([]);
            setNote(outcome.value);
            break;
        }
      })();
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSearch = charCount(trimmingWhitespacesAndNewlines(query)) >= FoodSearch.shortestQuery;

  // MARK: - Chrome

  const grip = (
    <div aria-hidden style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", paddingBottom: 18, flexShrink: 0 }}>
      <div style={{ width: 36, height: 5, borderRadius: SL.Radius.pill, background: SL.Surface.hairlineStrong }} />
    </div>
  );

  const head = (
    <HStack alignment="firstTextBaseline" spacing={SL.Space.s3} style={{ minHeight: 24, paddingBottom: 14, alignSelf: "stretch", flexShrink: 0 }}>
      <Text as="h2" {...slTitle()} color={SL.Ink.primary}>
        {manual ? "Enter manually" : "Add food"}
      </Text>
      <Spacer minLength={SL.Space.s2} />
      <Pressable
        onPress={() => {
          if (manual) setManual(false);
          else onClose();
        }}
        style={{ background: "transparent", flexShrink: 0 }}
      >
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary} style={{ display: "inline-block", ...slHitTarget() }}>
          {manual ? "Back" : "Close"}
        </Text>
      </Pressable>
    </HStack>
  );

  // MARK: - Without typing

  const scanTile = (title: string, detail: string, symbol: string, action: () => void) => (
    <SLPress scale={0.97} onPress={action} aria-label={`${title}. ${title === "Barcode" ? "Opens the camera to scan a barcode" : "Opens the meal scan"}`} style={{ flex: "1 1 0", minWidth: 0, textAlign: "left" }}>
      <HStack spacing={SL.Space.s3} style={{ padding: SL.Space.s2, minHeight: 56, borderRadius: SL.Radius.md, background: SL.Surface.raised2 }}>
        <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: SL.Radius.sm, background: SL.Signal.actionTint, display: "grid", placeItems: "center" }}>
          <SFSymbol name={symbol} size={18} weight={600} color={SL.Signal.action} />
        </div>
        <VStack alignment="leading" spacing={0} style={{ flex: "0 1 auto", minWidth: 0 }}>
          <Text {...slBody(SL.Weight.semibold)} color={SL.Ink.primary}>
            {title}
          </Text>
          <Text {...slMeta()} color={SL.Ink.tertiary} lineLimit={1} style={{ maxWidth: "100%" }}>
            {detail}
          </Text>
        </VStack>
        <Spacer minLength={0} />
      </HStack>
    </SLPress>
  );

  /** The two ways in that skip the keyboard: a barcode, or a photo (or a line) of the meal. */
  const scanTools = (
    <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingTop: SL.Space.s2, flexShrink: 0 }}>
      {scanTile("Barcode", "Packaged food", "barcode.viewfinder", () => setScanning("barcode"))}
      {scanTile("Scan meal", "Photo or a line", "camera.viewfinder", () => setScanning("photo"))}
    </HStack>
  );

  // MARK: - Looking it up

  const searchField = (
    <div
      onClick={() => queryRef.current?.focus()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        paddingLeft: 14,
        paddingRight: 6,
        minHeight: SL.Space.hitMin,
        borderRadius: SL.Radius.md,
        background: SL.Surface.raised2,
        marginTop: SL.Space.s3,
        alignSelf: "stretch",
        flexShrink: 0,
      }}
    >
      <SLGlyph name="search" size={20} color={SL.Ink.tertiary} />
      {/* A product name is not prose: autocorrect turns "skyr" into "Skye". */}
      <input
        ref={queryRef}
        className="sl-stepper-field"
        value={query}
        placeholder="Search food"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        onFocus={() => setFocused("query")}
        onBlur={() => setFocused((f) => (f === "query" ? undefined : f))}
        onChange={(e) => setQuery(e.target.value)}
        style={{ ...bareInput, ...slFont(SL.TypeSize.lead, SL.Weight.regular), color: SL.Ink.primary, flex: "1 1 0", minHeight: SL.Space.hitMin }}
      />
      {query.length > 0 && (
        <Pressable
          onPress={() => setQuery("")}
          aria-label="Clear search"
          style={{ background: "transparent", minWidth: 40, minHeight: 40, marginRight: -6, display: "grid", placeItems: "center", flexShrink: 0 }}
        >
          <Text {...slMeta(SL.Weight.medium)} color={SL.Ink.tertiary}>
            Clear
          </Text>
        </Pressable>
      )}
    </div>
  );

  /** The component sheet's loading state: a tonal row, never a spinner and never a pulse. */
  const loading = (
    <HStack spacing={SL.Space.s3} aria-label="Search" style={{ minHeight: 50, paddingTop: SL.Space.s3, alignSelf: "stretch" }}>
      <div style={{ width: 120, height: 12, borderRadius: SL.Radius.sm, background: SL.Surface.raised2, flexShrink: 0 }} />
      <Spacer />
      <Text {...slMeta()} color={SL.Ink.tertiary}>
        Searching…
      </Text>
    </HStack>
  );

  // MARK: - Rows

  const group = (title: string, top: number, rows: ReactNode) => (
    <VStack key={title} alignment="leading" spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
      <Text size={SL.TypeSize.micro} weight={SL.Weight.medium} tracking={SL.TypeSize.micro * 0.06} color={SL.Ink.tertiary} style={{ paddingTop: top, paddingBottom: SL.Space.s1 }}>
        {title}
      </Text>
      {rows}
    </VStack>
  );

  /** A food to add: the photo or star, the name and its portion, a star to keep it as a favorite, and the ⊕. */
  const row = (a: { key: string; title: string; detail: string; photo?: SLFoodPhoto_Source; star?: boolean; favorite?: NutritionEntry; add: () => void }) => {
    const isFavorite = a.favorite ? app.isFavorite(a.favorite) : false;
    return (
      <HStack key={a.key} spacing={SL.Space.s1} style={{ alignSelf: "stretch" }}>
        <Pressable
          onPress={a.add}
          aria-label={`${a.title}, ${a.detail}. Double-tap to add to ${Meal.spoken(chosen)}`}
          style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", gap: SL.Space.s3, minHeight: 50, background: "transparent", textAlign: "left" }}
        >
          {a.photo ? (
            <SLFoodPhoto source={a.photo} style={{ width: 44, height: 44 }} />
          ) : a.star ? (
            <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: "50%", background: SL.Signal.actionTint, display: "grid", placeItems: "center" }}>
              <SFSymbol name="star.fill" size={14} weight={600} color={SL.Signal.action} />
            </div>
          ) : null}
          <VStack alignment="leading" spacing={0} style={{ flex: "0 1 auto", minWidth: 0 }}>
            <Text {...slLead()} color={SL.Ink.primary}>
              {a.title}
            </Text>
            <Text {...slMeta()} numerals color={SL.Ink.tertiary}>
              {a.detail}
            </Text>
          </VStack>
          <Spacer minLength={SL.Space.s2} />
        </Pressable>

        {a.favorite && (
          <Pressable
            aria-label={isFavorite ? `Remove ${a.title} from favorites` : `Add ${a.title} to favorites`}
            onPress={() => {
              app.toggleFavorite(a.favorite!);
              if (!isFavorite) SLSound.play("pop");
            }}
            style={{ background: "transparent", minWidth: 40, minHeight: SL.Space.hitMin, display: "grid", placeItems: "center", flexShrink: 0 }}
          >
            <SFSymbol name={isFavorite ? "star.fill" : "star"} size={18} weight={400} color={isFavorite ? SL.Signal.action : SL.Ink.tertiary} />
          </Pressable>
        )}

        <Pressable
          onPress={a.add}
          aria-label={`Add ${a.title} to ${Meal.spoken(chosen)}`}
          style={{
            background: "transparent",
            minWidth: SL.Space.hitMin,
            minHeight: SL.Space.hitMin,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            // 42c hangs the ⊕ 10 past the gutter, so the glyph lines up with the text above it.
            marginRight: -Math.max(0, (SL.Space.hitMin - plusSize) / 2),
          }}
        >
          <SFSymbol name="plus.circle" size={24} weight={400} color={SL.Ink.secondary} />
        </Pressable>
      </HStack>
    );
  };

  /** A row the account has eaten before, offered again exactly as it was written. */
  const memoryRow = (entry: NutritionEntry) =>
    row({
      key: entry.id,
      title: entry.name,
      detail: [NutritionEntry.portion(entry), kcal(entry.calories)].filter((s): s is string => s !== undefined).join(" · "),
      favorite: entry,
      // The day this sheet logs to, at the moment it is tapped.
      add: () => onLog(FoodMemory.repeated(entry, { on: date, meal: chosen })),
    });

  /** Dishes the app knows by name, with a usual portion and standard values. */
  const dishMatches: MealRecognition_Food[] = (() => {
    const asked = trimmingWhitespacesAndNewlines(query);
    if (charCount(asked) < FoodSearch.shortestQuery) return [];
    const list: MealRecognition_Food[] = [];
    const best = MealRecognition.match(asked);
    if (best) list.push(best);
    for (const food of MealRecognition.candidates(asked, { limit: 3 })) {
      if (!list.some((f) => f.key === food.key)) list.push(food);
    }
    return list.slice(0, 3);
  })();

  /** A dish that is what was typed leads; one that is only part of it waits under the products. */
  const bestDishes: MealRecognition_Food[] = (() => {
    const asked = trimmingWhitespacesAndNewlines(query);
    return dishMatches.filter((food) => MealRecognition.coverage(asked, { by: food }) >= 0.6 || (results.length === 0 && !searching));
  })();

  const generalDishes = dishMatches.filter((food) => !bestDishes.some((b) => b.key === food.key));

  const dishRow = (food: MealRecognition_Food) => {
    const portion = MealRecognition_Food.scanned(food, { confidence: "medium" });
    const entry = ScannedFood.entry(portion, { id: newID(), on: date, meal: chosen });
    return row({
      key: food.key,
      title: food.name,
      detail: `${Math.trunc(portion.grams)} g · ${kcal(portion.calories)} · ${whole(portion.protein)} g protein`,
      favorite: entry,
      add: () => onLog(ScannedFood.entry(portion, { id: newID(), on: date, meal: chosen })),
    });
  };

  /** A product at 100 g, as it would be logged — what a star keeps. */
  const productEntry = (product: FoodProduct): NutritionEntry => {
    const draft = FoodSearch.portion({ of: product, grams: 100 });
    return NutritionEntry.make({
      id: `fav-${product.id}`,
      date: Schedule.dateKey(date),
      meal: chosen,
      name: draft.name,
      calories: draft.calories,
      protein: draft.protein,
      carbs: draft.carbs,
      fat: draft.fat,
      amount: draft.amount,
      unit: draft.unit,
    });
  };

  const productRow = (product: FoodProduct) =>
    row({
      key: product.id,
      title: product.name,
      detail: `100 g · ${kcal(product.calories)}${product.brand === "" ? "" : ` · ${product.brand}`}`,
      photo: { kind: "url", value: product.imageURL },
      favorite: productEntry(product),
      add: () => {
        const draft = FoodSearch.portion({ of: product, grams: 100 });
        onLog(
          NutritionEntry.make({
            id: newID(),
            date: Schedule.dateKey(date),
            meal: chosen,
            name: draft.name,
            calories: draft.calories,
            protein: draft.protein,
            carbs: draft.carbs,
            fat: draft.fat,
            amount: draft.amount,
            unit: draft.unit,
            loggedAt: new Date(),
          }),
        );
      },
    });

  // MARK: - Food no database has

  const ownValuesInvitation = (top: number) => (
    <Pressable
      onPress={() => setManual(true)}
      aria-label="Enter manually. For food the search doesn't know"
      style={{
        display: "flex",
        alignItems: "center",
        gap: SL.Space.s3,
        paddingLeft: 14,
        paddingRight: 14,
        minHeight: SL.Space.hitMin + 2 * SL.Metric.border,
        borderRadius: SL.Radius.md,
        background: SL.Surface.ground,
        border: `${SL.Metric.border}px solid ${SL.Surface.hairline}`,
        marginTop: top,
        alignSelf: "stretch",
        textAlign: "left",
      }}
    >
      <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>
        Enter manually
      </Text>
      <Spacer minLength={SL.Space.s2} />
      <SLGlyph name="chevronRight" size={18} color={SL.Ink.tertiary} />
    </Pressable>
  );

  const footnoteStyle = slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.meta });

  /** The hour is only given as the reason when the hour is actually the reason. */
  const footnote =
    chosen === Meal.likely({ at: new Date() })
      ? `${MealSection.title({ of: chosen })} is preselected because it's ${NumberDisplay.clock(display, new Date())}. One tap on ⊕ adds the item with this amount.`
      : `One tap on ⊕ adds the item to ${Meal.spoken(chosen)}, with this amount.`;

  /** 42c: what is logged at this meal most often, then what was logged last. */
  const memory = (() => {
    const today = Schedule.dateKey(date);
    const entries = app.nutritionEntries;
    const often = FoodMemory.often({ at: chosen, in: entries, excluding: today });
    const recent = FoodMemory.recent({ in: entries, excluding: today }).filter(
      (entry) => !often.some((o) => o.name.toLowerCase() === entry.name.toLowerCase()),
    );
    const favorites = app.foodFavorites;
    return (
      <>
        {favorites.length > 0 &&
          group(
            "FAVORITES",
            22,
            favorites.map((favorite) =>
              row({
                key: FavoriteFood.id(favorite),
                title: favorite.name,
                detail: [FavoriteFood.portion(favorite), kcal(favorite.calories)].filter((s): s is string => s !== undefined).join(" · "),
                star: true,
                favorite: FavoriteFood.entry(favorite, { id: "fav", on: date, meal: chosen }),
                add: () => onLog(FavoriteFood.entry(favorite, { id: newID(), on: date, meal: chosen })),
              }),
            ),
          )}
        {often.length === 0 && recent.length === 0 && favorites.length === 0 ? (
          <>
            <Text {...slBody()} color={SL.Ink.secondary} style={{ ...slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.body }), paddingTop: 22 }}>
              Search for a product, or enter it yourself. What you log appears here.
            </Text>
            {ownValuesInvitation(SL.Space.s4)}
          </>
        ) : (
          <>
            {often.length > 0 && group(`OFTEN AT ${Meal.label(chosen).toUpperCase()}`, favorites.length === 0 ? 22 : 18, often.map(memoryRow))}
            {recent.length > 0 && group("RECENT", often.length === 0 && favorites.length === 0 ? 22 : 18, recent.map(memoryRow))}
            <Text {...slMeta()} color={SL.Ink.tertiary} style={{ ...footnoteStyle, paddingTop: SL.Space.s3 }}>
              {footnote}
            </Text>
            {ownValuesInvitation(SL.Space.s4)}
          </>
        )}
      </>
    );
  })();

  // MARK: - Own values

  const value = (text: string) => NumberInput.value(text);
  const energy = value(calories) > 0 ? value(calories) : NutritionEntry.calories({ protein: value(protein), carbs: value(carbs), fat: value(fat) });
  /** Said only when it changes what gets stored: macros filled in, calories left blank. */
  const energyNote = value(calories) <= 0 && energy > 0 ? `Worked out from the macros: ${kcal(energy)}.` : undefined;
  const isLoggable = trimmingWhitespaces(name).length > 0 && energy > 0;

  const logOwn = () => {
    if (!isLoggable) return;
    const written = value(amount);
    const named = trimmingWhitespaces(unit);
    onLog(
      NutritionEntry.make({
        id: newID(),
        date: Schedule.dateKey(date),
        meal: chosen,
        name: trimmingWhitespaces(name),
        calories: energy,
        protein: value(protein),
        carbs: value(carbs),
        fat: value(fat),
        amount: written > 0 ? written : undefined,
        unit: written > 0 && named.length > 0 ? named : undefined,
        loggedAt: new Date(),
      }),
    );
  };

  const field = (label: string, text: Binding<string>, which: Field, unitText?: string, numeric = false) => (
    <OwnField key={which} label={label} text={text} isFocused={focused === which} onFocus={() => setFocused(which)} onBlur={() => setFocused((f) => (f === which ? undefined : f))} unit={unitText} numeric={numeric} />
  );

  const hairline = <SLHairline style={{ marginLeft: 14, marginRight: 14 }} />;
  const ownValues = (
    <VStack alignment="leading" spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
      <VStack
        spacing={0}
        style={{
          alignItems: "stretch",
          padding: 6,
          marginTop: SL.Space.s4,
          borderRadius: SL.Radius.option,
          background: SL.Surface.ground,
          border: `${SL.Metric.border}px solid ${SL.Surface.hairline}`,
        }}
      >
        {field("Name", { value: name, set: setName }, "name")}
        {hairline}
        {field("Amount", { value: amount, set: setAmount }, "amount", undefined, true)}
        {hairline}
        {field("Unit", { value: unit, set: setUnit }, "unit")}
        {hairline}
        {field("Calories", { value: calories, set: setCalories }, "calories", "kcal", true)}
        {hairline}
        {field("Protein", { value: protein, set: setProtein }, "protein", "g", true)}
        {hairline}
        {field("Carbs", { value: carbs, set: setCarbs }, "carbs", "g", true)}
        {hairline}
        {field("Fat", { value: fat, set: setFat }, "fat", "g", true)}
      </VStack>
      {energyNote !== undefined && (
        <Text {...slMeta()} color={SL.Ink.tertiary} style={{ paddingTop: SL.Space.s3 }}>
          {energyNote}
        </Text>
      )}
    </VStack>
  );

  const presentedScanner = scanning ?? lastScanner.current;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", background: SL.Surface.raised }}>
      <Presentation detents={[{ fraction: 0.94 }]} dragIndicator="hidden" background={SL.Surface.raised} />
      <div
        style={{
          flex: "1 1 0",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          paddingLeft: SL.Space.gutterSession,
          paddingRight: SL.Space.gutterSession,
          paddingTop: 10,
          paddingBottom: manual ? 34 : `calc(34px + env(safe-area-inset-bottom))`,
        }}
      >
        {grip}
        {head}

        <MealSegment selection={{ value: chosen, set: setChosen }} />

        {manual ? (
          <ScrollView style={{ flex: "1 1 0", alignSelf: "stretch" }}>
            <div style={{ paddingBottom: SL.Space.s5, display: "flex", flexDirection: "column" }}>{ownValues}</div>
          </ScrollView>
        ) : (
          <>
            {searchField}
            {!isSearch && scanTools}
            <ScrollView style={{ flex: "1 1 0", alignSelf: "stretch" }}>
              <VStack alignment="leading" spacing={0} style={{ paddingBottom: SL.Space.s5, alignItems: "stretch" }}>
                {note !== undefined && (
                  <Text {...slMeta()} color={SL.Ink.tertiary} style={{ ...footnoteStyle, paddingTop: SL.Space.s3 }}>
                    {note}
                  </Text>
                )}
                {isSearch && bestDishes.length > 0 && group("BEST MATCH", 22, bestDishes.map(dishRow))}
                {searching ? (
                  loading
                ) : results.length > 0 ? (
                  <>
                    {group(bestDishes.length === 0 ? "RESULTS" : "PRODUCTS", bestDishes.length === 0 ? 22 : 18, results.map(productRow))}
                    {generalDishes.length > 0 && group("GENERAL ESTIMATE", 18, generalDishes.map(dishRow))}
                    <Text {...slMeta()} color={SL.Ink.tertiary} style={{ ...footnoteStyle, paddingTop: SL.Space.s3 }}>
                      Check the packaging; Open Food Facts is maintained by its users.
                    </Text>
                  </>
                ) : isSearch ? (
                  ownValuesInvitation(SL.Space.s4)
                ) : (
                  memory
                )}
              </VStack>
            </ScrollView>
          </>
        )}
      </div>

      {manual && (
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingBottom: `calc(${SL.Space.s3}px + env(safe-area-inset-bottom))`, background: SL.Surface.raised }}>
          <SLPrimaryButton disabled={!isLoggable} onPress={logOwn}>
            {`Add to ${Meal.spoken(chosen)}`}
          </SLPrimaryButton>
        </div>
      )}

      <FullScreenCover isPresented={scanning !== undefined}>
        {presentedScanner === "barcode" ? (
          <BarcodeScanSheet
            date={date}
            meal={chosen}
            onLog={(entry) => {
              setScanning(undefined);
              onLog(entry);
            }}
            onClose={() => setScanning(undefined)}
          />
        ) : presentedScanner === "photo" ? (
          <FoodPhotoScanSheet
            date={date}
            meal={chosen}
            onLog={(entries) => {
              setScanning(undefined);
              if (onLogAll) onLogAll(entries);
              else entries.forEach(onLog);
            }}
            onClose={() => setScanning(undefined)}
          />
        ) : null}
      </FullScreenCover>
    </div>
  );
}

/** One field of "Enter manually": its eyebrow, the value at 17/500, and its unit. */
function OwnField({
  label,
  text,
  isFocused,
  onFocus,
  onBlur,
  unit,
  numeric,
}: {
  label: string;
  text: Binding<string>;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  unit?: string;
  numeric: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => ref.current?.focus()}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 2,
        paddingLeft: 14,
        paddingRight: 14,
        paddingTop: 10,
        paddingBottom: 10,
        minHeight: 60,
        borderRadius: SL.Radius.lg,
        background: isFocused ? SL.Surface.raised2 : "transparent",
        boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${isFocused ? SL.Signal.action : "transparent"}`,
      }}
    >
      <SLEyebrow text={label.toUpperCase()} size={SL.TypeSize.micro} />
      <HStack spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <input
          ref={ref}
          className="sl-stepper-field"
          aria-label={label}
          value={text.value}
          inputMode={numeric ? "decimal" : "text"}
          autoCapitalize={numeric ? "none" : "sentences"}
          autoCorrect={numeric ? "off" : undefined}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(e) => {
            const next = e.target.value;
            if (!numeric) return text.set(next);
            text.set(NumberInput.numericOnly(next));
          }}
          // 17pt, comfortably above the 16pt floor that stops a browser zooming a field on focus.
          style={{ ...bareInput, ...slFont(SL.TypeSize.lead, SL.Weight.medium), color: SL.Ink.primary, flex: "1 1 0" }}
        />
        {unit !== undefined && (
          <Text {...slBody()} color={SL.Ink.tertiary}>
            {unit}
          </Text>
        )}
      </HStack>
    </div>
  );
}

/**
 * The four headings as one control (42c, 42d): 44 high on the ground surface,
 * the chosen one raised with the .28 edge.
 */
export function MealSegment({ selection }: { selection: Binding<Meal> }) {
  /** The four the day is read in. Pre-workout is stored, and read under Snacks, but it is not one of the four a reader assigns. */
  const options = MealSection.headings.map((h) => h[0]);
  return (
    <div
      role="group"
      aria-label="Meal"
      style={{
        display: "flex",
        flexDirection: "row",
        gap: 4,
        padding: 3,
        alignSelf: "stretch",
        flexShrink: 0,
        borderRadius: SL.Radius.lg - 2,
        background: SL.Surface.ground,
        border: `${SL.Metric.border}px solid ${SL.Surface.hairline}`,
      }}
    >
      {options.map((option) => {
        const isChosen = option === selection.value;
        return (
          <Pressable
            key={option}
            onPress={() => selection.set(option)}
            aria-label={MealSection.title({ of: option })}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              // 42 of content inside its own hairline is the 44 the artboard draws.
              minHeight: SL.Space.hitMin,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 11,
              background: isChosen ? SL.Surface.raised2 : "transparent",
              boxShadow: `inset 0 0 0 ${SL.Metric.border}px ${isChosen ? SL.Surface.selection : "transparent"}`,
            }}
          >
            {/* 42c sets these at 14 — off the type scale, because four names have to fit across one row. */}
            <Text size={14} weight={isChosen ? SL.Weight.semibold : SL.Weight.regular} color={isChosen ? SL.Ink.primary : SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.8}>
              {MealSection.title({ of: option })}
            </Text>
          </Pressable>
        );
      })}
    </div>
  );
}
