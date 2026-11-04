// ExercisePickerSheet.swift — Artboards 40b–40d · which exercise Progressie is showing.
//
// One sheet with two faces: the list you start on — what you starred, or what
// you trained last if you have starred nothing — with the six muscle groups
// under it, and a group opened into its own exercises. A search runs over all
// of them at once.
//
// Every row is recognisable before it is remembered: the name, where it sits,
// and when it was last done. An exercise with nothing logged says so and can
// still be picked, because a screen that only lists what you already trained
// cannot tell you what you have not.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SL, slFont } from "../../design/tokens";
import { HStack, Pressable, ScrollView, Spacer, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { Presentation } from "../../design/support";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLHairline, slBody, slHitTarget, slLead, slMeta, slTitle } from "../../design/components/SLText";
import { slLineHeight } from "../../design/SLDynamicType";
import { useApp } from "../../data/AppState";
import { ExercisePicker, ExercisePicker_Row } from "../../core/Progress/ExercisePicker";
import { ExerciseLibrary_Entry } from "../../core/Catalog/ExerciseLibrary";
import { ExerciseMedia } from "../../core/Catalog/ExerciseMedia";
import { ExerciseLibraryStore } from "../../data/ExerciseLibraryStore";
import { MuscleGroup } from "../../core/Domain/MuscleGroup";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";

/** The star's size at the default text size (`@ScaledMetric … = 18`). */
const starSize = 18;

export function ExercisePickerSheet({
  rows,
  selected,
  onPick,
  onStar,
  onClose,
  adds = false,
}: {
  rows: ExercisePicker_Row[];
  selected: string | undefined;
  onPick: (row: ExercisePicker_Row) => void;
  onStar: (row: ExercisePicker_Row) => void;
  onClose: () => void;
  /** Picking adds the exercise to a workout: each row says so with "+ Add" where the star would be, since a star read as the way to add it. */
  adds?: boolean;
}) {
  const app = useApp();
  const [group, setGroup] = useState<MuscleGroup | undefined>(undefined);
  const [query, setQuery] = useState("");
  const field = useRef<HTMLInputElement>(null);

  const isSearching = query.trim().length > 0;

  // MARK: - Chrome

  const grip = (
    <div aria-hidden style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", paddingBottom: 18 }}>
      <div style={{ width: 36, height: 5, borderRadius: SL.Radius.pill, background: SL.Surface.hairlineStrong }} />
    </div>
  );

  /** 40b names the sheet; 40d replaces that with the way back to the groups. */
  const head = (
    <HStack spacing={SL.Space.s3} style={{ minHeight: 24, paddingBottom: 14, alignSelf: "stretch" }}>
      {group !== undefined && !isSearching ? (
        <Pressable onPress={() => setGroup(undefined)} style={{ background: "transparent", padding: 0 }}>
          <HStack spacing={2} style={{ marginLeft: -6, minHeight: SL.Space.hitMin, color: SL.Ink.secondary }}>
            <SFSymbol name="chevron.left" size={20} weight={500} color={SL.Ink.secondary} />
            <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary}>
              Muscle groups
            </Text>
          </HStack>
        </Pressable>
      ) : (
        <Text as="h2" {...slTitle()} color={SL.Ink.primary}>
          Exercise
        </Text>
      )}

      <Spacer minLength={SL.Space.s2} />

      <Pressable onPress={onClose} style={{ background: "transparent", padding: 0 }}>
        <Text {...slBody(SL.Weight.medium)} color={SL.Ink.secondary} style={{ ...slHitTarget(), display: "block" }}>
          Close
        </Text>
      </Pressable>
    </HStack>
  );

  /** The count is the catalogue's own, so the sheet never promises more exercises than it holds. */
  const placeholder = `Search ${rows.length} exercises`;

  const searchField = (
    <HStack
      spacing={10}
      onClick={() => field.current?.focus()}
      style={{ alignSelf: "stretch", paddingLeft: 14, paddingRight: 6, minHeight: SL.Space.hitMin, background: SL.Surface.raised2, borderRadius: SL.Radius.md }}
    >
      <style>{`.sl-picker-search::placeholder { color: ${SL.Ink.tertiary}; opacity: 1; }`}</style>
      <SLGlyph name="search" size={20} color={SL.Ink.tertiary} />
      <input
        ref={field}
        className="sl-picker-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        type="search"
        style={{
          ...slFont(SL.TypeSize.lead, SL.Weight.regular),
          flex: "1 1 0",
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          color: SL.Ink.primary,
          caretColor: SL.Signal.action,
          padding: 0,
          WebkitAppearance: "none",
        }}
      />
      {query.length > 0 && (
        <Pressable onPress={() => setQuery("")} aria-label="Clear search" style={{ background: "transparent", padding: 0, marginRight: -6 }}>
          <span style={{ minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text {...slMeta(SL.Weight.medium)} color={SL.Ink.tertiary}>
              Clear
            </Text>
          </span>
        </Pressable>
      )}
    </HStack>
  );

  // MARK: - One row

  /** "Borst · 7 sep", or where it sits when it has never been logged. */
  const standing = (row: ExercisePicker_Row): string => {
    if (row.lastTrained === undefined) return `${MuscleGroup.title(row.group)} · not logged yet`;
    return `${MuscleGroup.title(row.group)} · ${NumberDisplay.shortDate(app.display, row.lastTrained)}`;
  };

  /** "laatst 7 sep · 50 kg × 8" — 40d's second line. */
  const lastSet = (row: ExercisePicker_Row): string => {
    const last = row.lastTrained;
    if (last === undefined) return "not logged yet";
    if (row.topSetKg === undefined || row.topSetReps === undefined) return `last ${NumberDisplay.shortDate(app.display, last)}`;
    return `last ${NumberDisplay.shortDate(app.display, last)} · ${NumberDisplay.kg(app.display, row.topSetKg)} × ${row.topSetReps}`;
  };

  const card = (row: ExercisePicker_Row, detail: string, paddingTop = 0) => {
    const isSelected = row.exerciseID === selected;
    return (
      <div key={row.exerciseID} style={{ paddingTop, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
        <HStack
          spacing={SL.Space.s3}
          style={{
            paddingLeft: 12,
            paddingRight: 12,
            minHeight: 52,
            marginLeft: -12,
            marginRight: -12,
            borderRadius: SL.Radius.md,
            background: isSelected ? SL.Surface.raised2 : "transparent",
            boxShadow: isSelected ? `inset 0 0 0 ${SL.Metric.border}px ${SL.Surface.selection}` : undefined,
          }}
        >
          <Pressable onPress={() => onPick(row)} style={{ flex: "1 1 0", minWidth: 0, background: "transparent", padding: 0, textAlign: "left", alignSelf: "stretch", display: "flex", alignItems: "center" }}>
            <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
              <Text {...slLead()} color={ExercisePicker_Row.hasHistory(row) ? SL.Ink.primary : SL.Ink.secondary}>
                {row.name}
              </Text>
              <Text {...slMeta()} numerals color={SL.Ink.tertiary}>
                {detail}
              </Text>
            </VStack>
          </Pressable>

          {isSelected && <SFSymbol name="checkmark" size={17} weight={600} color={SL.Ink.primary} />}

          {adds ? (
            <Pressable
              onPress={() => onPick(row)}
              aria-label={`Add ${row.name}`}
              style={{ background: "transparent", padding: 0, minHeight: SL.Space.hitMin, display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              <span
                style={{
                  ...slFont(SL.TypeSize.meta, SL.Weight.semibold),
                  color: SL.Signal.action,
                  background: SL.Signal.actionTint,
                  borderRadius: 999,
                  minHeight: 32,
                  padding: `0 ${SL.Space.s3}px`,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <SFSymbol name="plus" size={12} weight={700} color={SL.Signal.action} />
                Add
              </span>
            </Pressable>
          ) : (
          <Pressable
            onPress={() => onStar(row)}
            aria-label={row.isFavorite ? `Remove star from ${row.name}` : `Star ${row.name}`}
            style={{
              background: "transparent",
              padding: 0,
              minWidth: SL.Space.hitMin,
              minHeight: SL.Space.hitMin,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              // The tap area hangs past the list's edge so the glyph lines up with it.
              marginRight: -Math.max(0, (SL.Space.hitMin - starSize) / 2 - 3),
            }}
          >
            <SFSymbol name={row.isFavorite ? "star.fill" : "star"} size={starSize} weight={400} color={row.isFavorite ? SL.Ink.primary : SL.Ink.tertiary} />
          </Pressable>
          )}
        </HStack>
      </div>
    );
  };

  const section = (title: string, top: number, content: ReactNode) => (
    <VStack key={title} alignment="leading" spacing={0} style={{ alignSelf: "stretch" }}>
      <Text size={SL.TypeSize.micro} weight={SL.Weight.medium} tracking={SL.TypeSize.micro * 0.06} color={SL.Ink.tertiary} style={{ paddingTop: top, paddingBottom: 6 }}>
        {title}
      </Text>
      {content}
    </VStack>
  );

  // MARK: - 40b / 40c · where the sheet opens

  const start = () => {
    const favorites = ExercisePicker.favorites({ in: rows });
    const recent = ExercisePicker.recent({ in: rows });
    return (
      <>
        {favorites.length === 0 && adds ? (
          recent.length > 0 && section("RECENT", 22, recent.map((row) => card(row, standing(row))))
        ) : favorites.length === 0 ? (
          <>
            {/* 40c: the star's own explanation, where the favourites would be. */}
            <div style={{ paddingTop: 22, alignSelf: "flex-start", maxWidth: "100%" }}>
              <HStack alignment="top" spacing={10} style={{ position: "relative", paddingTop: 14, paddingBottom: 14 }}>
                <SFSymbol name="star" size={20} weight={400} color={SL.Ink.tertiary} />
                <Text {...slBody()} color={SL.Ink.secondary} style={slLineHeight(1.4, { size: SL.TypeSize.body })}>
                  Tap the star on an exercise to pin it here.
                </Text>
                <SLHairline style={{ position: "absolute", top: 0, left: 0, right: 0 }} />
                <SLHairline style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} />
              </HStack>
            </div>
            {recent.length > 0 && section("RECENT", 18, recent.map((row) => card(row, standing(row))))}
          </>
        ) : (
          section("FAVOURITES", 22, favorites.map((row) => card(row, standing(row))))
        )}

        {section(
          "MUSCLE GROUP",
          22,
          ExercisePicker.groups({ in: rows }).map((entry) => (
            <Pressable
              key={entry.group}
              onPress={() => setGroup(entry.group)}
              aria-label={`${MuscleGroup.title(entry.group)}, ${entry.count} exercises`}
              style={{ alignSelf: "stretch", background: "transparent", padding: 0, textAlign: "left" }}
            >
              <HStack spacing={SL.Space.s3} style={{ minHeight: 46 }}>
                <Text {...slLead(SL.Weight.medium)} color={SL.Ink.primary}>
                  {MuscleGroup.title(entry.group)}
                </Text>
                <Spacer minLength={SL.Space.s2} />
                <Text {...slBody()} numerals color={SL.Ink.tertiary}>
                  {`${entry.count}`}
                </Text>
                <SFSymbol name="chevron.right" size={17} weight={400} color={SL.Ink.tertiary} />
              </HStack>
            </Pressable>
          )),
        )}
      </>
    );
  };

  // MARK: - 40d · one group

  const opened = (g: MuscleGroup) => (
    <>
      <Text as="h2" size={28} weight={SL.Weight.semibold} color={SL.Ink.primary}>
        {MuscleGroup.title(g)}
      </Text>
      <Text {...slMeta()} numerals color={SL.Ink.tertiary} style={{ paddingTop: SL.Space.s1, paddingBottom: SL.Space.s4 }}>
        {ExercisePicker.summary({ of: g, in: rows })}
      </Text>
      {ExercisePicker.rowsIn({ in: g, of: rows }).map((row) => card(row, lastSet(row)))}
    </>
  );

  // MARK: - Search

  // MARK: - Found online

  /** The online library's answers to the query, in a picker that adds: one request per pause in typing, the library fetched once. */
  const [online, setOnline] = useState<ExerciseLibrary_Entry[]>([]);
  const [searchingOnline, setSearchingOnline] = useState(false);
  const [onlineFailed, setOnlineFailed] = useState(false);
  useEffect(() => {
    const asked = query.trim();
    if (!adds || asked.length < 3) {
      setOnline([]);
      setSearchingOnline(false);
      return;
    }
    let cancelled = false;
    setSearchingOnline(true);
    const timer = setTimeout(() => {
      void ExerciseLibraryStore.load().then((library) => {
        if (cancelled) return;
        setOnlineFailed(library === undefined);
        setOnline(library?.search(asked, { excludingNames: new Set(rows.map((r) => r.name)) }) ?? []);
        setSearchingOnline(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, adds, rows]);

  /** Writes it as an exercise of your own first, so whatever picked it can find it, then picks it like any other. */
  const add = (entry: ExerciseLibrary_Entry) => {
    const custom = ExerciseLibrary_Entry.customExercise(entry);
    void app.addCustomExercise(custom).then(() =>
      onPick(
        ExercisePicker_Row.make({
          exerciseID: custom.id,
          name: custom.name,
          group: custom.muscleGroup ?? "core",
          lastTrained: undefined,
          topSetKg: undefined,
          topSetReps: undefined,
          isFavorite: false,
        }),
      ),
    );
  };

  const onlineRow = (entry: ExerciseLibrary_Entry) => {
    const group = ExerciseLibrary_Entry.muscleGroup(entry);
    const detail = [group !== undefined ? MuscleGroup.title(group) : undefined, ExerciseLibrary_Entry.equipmentLabel(entry)].filter((x) => x !== undefined).join(" · ");
    return (
      <Pressable
        key={entry.id}
        onPress={() => add(entry)}
        aria-label={`Add ${entry.name}, ${ExerciseLibrary_Entry.equipmentLabel(entry)}`}
        style={{ alignSelf: "stretch", display: "flex", alignItems: "center", gap: SL.Space.s3, minHeight: 64, padding: "0 12px", background: "transparent", textAlign: "left" }}
      >
        <img
          src={ExerciseMedia.framesOfFolder(entry.id)[0]}
          alt=""
          loading="lazy"
          style={{ width: 48, height: 48, borderRadius: SL.Radius.md, objectFit: "cover", background: SL.Surface.raised2, flexShrink: 0 }}
        />
        <VStack alignment="leading" spacing={1} style={{ flex: "1 1 0", minWidth: 0 }}>
          <Text {...slLead()} color={SL.Ink.primary}>{entry.name}</Text>
          <Text {...slMeta()} color={SL.Ink.tertiary}>{detail}</Text>
        </VStack>
        <span style={{ ...slFont(SL.TypeSize.meta, SL.Weight.semibold), color: SL.Signal.action, background: SL.Signal.actionTint, borderRadius: 999, minHeight: 32, padding: `0 ${SL.Space.s3}px`, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <SFSymbol name="plus" size={12} weight={700} color={SL.Signal.action} />
          Add
        </span>
      </Pressable>
    );
  };

  const onlineResults = () => {
    if (online.length > 0) {
      return (
        <>
          {section("FOUND ONLINE", 22, <>{online.map(onlineRow)}</>)}
          <Text {...slMeta()} color={SL.Ink.tertiary} style={{ paddingTop: SL.Space.s2 }}>
            From free-exercise-db, a free exercise library. Adding one puts it in your own exercises, with its photos.
          </Text>
        </>
      );
    }
    if (searchingOnline) {
      return (
        <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingTop: 22 }}>
          Searching online…
        </Text>
      );
    }
    if (onlineFailed) {
      return (
        <Text {...slMeta()} color={SL.Ink.secondary} style={{ paddingTop: 22 }}>
          Couldn't search online. Check your connection and try again.
        </Text>
      );
    }
    return null;
  };

  const results = () => {
    const found = ExercisePicker.search(query, { in: rows });
    return (
      <>
        {found.length === 0 ? (
          <Text {...slBody()} color={SL.Ink.secondary} style={{ paddingTop: 22 }}>
            {adds ? "Not in Setline yet." : `Nothing found for ${query.trim()}.`}
          </Text>
        ) : (
          found.map((row) => card(row, standing(row), 6))
        )}
        {adds && onlineResults()}
      </>
    );
  };

  return (
    <VStack
      alignment="leading"
      spacing={0}
      style={{
        flex: "1 1 0",
        minHeight: 0,
        alignSelf: "stretch",
        width: "100%",
        height: "100%",
        paddingLeft: SL.Space.gutterSession,
        paddingRight: SL.Space.gutterSession,
        paddingTop: 10,
        paddingBottom: 34,
        background: SL.Surface.raised,
        boxSizing: "border-box",
      }}
    >
      {/* 40b opens 112 from the top of the frame. */}
      <Presentation detents={[{ fraction: 0.95 }]} dragIndicator="hidden" background={SL.Surface.raised} />
      {grip}
      {head}
      {searchField}
      <ScrollView style={{ flex: "1 1 0", alignSelf: "stretch" }}>
        <VStack alignment="leading" spacing={0} style={{ paddingBottom: SL.Space.s5 }}>
          {isSearching ? results() : group !== undefined ? opened(group) : start()}
        </VStack>
      </ScrollView>
    </VStack>
  );
}
