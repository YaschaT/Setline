// StrengthSegmentView.swift — Artboard 40a · Progressie, segment Kracht.
//
// One exercise at a time, and the exercise's own name is the control: it says
// what you are looking at and is where you change it (40b). Under it, three
// layers of the same number — the estimate, what it moved since a date, and
// the set it was computed from — so the headline can be read at a glance and
// questioned without leaving the screen.
//
// Comparability is settled before anything is drawn: `ExerciseHistory`
// applies TRAINING_LOGIC §1, so every point on the chart and every row in the
// list belongs to the same series.
import { useEffect, useState } from "react";
import { SL, slListCard } from "../../design/tokens";
import { HStack, Pressable, ScrollView, Sheet, Spacer, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { colorHex, colorOpacity } from "../../design/SetlineTokens";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLMedal } from "../../design/components/SLMedal";
import { MuscleFigure } from "../../design/components/MuscleFigure";
import { slBody, slLead, slMeta } from "../../design/components/SLText";
import { slCapped } from "../../design/SLDynamicType";
import { useApp } from "../../data/AppState";
import { ExercisePicker, ExercisePicker_Row } from "../../core/Progress/ExercisePicker";
import { StrengthProgress, type StrengthProgress_Marker, type StrengthProgress_Point, type StrengthProgress_SessionRow } from "../../core/Progress/StrengthProgress";
import { ExerciseHistory, ExerciseHistory_Series } from "../../core/Engine/ExerciseHistory";
import { Estimates } from "../../core/Engine/Estimates";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { MuscleGroup } from "../../core/Domain/MuscleGroup";
import { SetModifiers } from "../../core/Domain/Vocabulary";
import { LiftMedal_Place } from "../../core/Progress/Medals";
import { addingTimeInterval, formatEnUS, timeIntervalSince } from "../../core/Support/calendar";
import { maxBy } from "../../core/Support/swift";
import { StrengthArea } from "./ProgressHomeView";
import { ExercisePickerSheet } from "./ExercisePickerSheet";
import { OneRepMaxSheet } from "./OneRepMaxSheet";

const gold = colorHex(0xffd166);

interface StrengthData {
  selected: string | undefined;
  rows: ExercisePicker_Row[];
  series: ExerciseHistory_Series[];
  progress: StrengthProgress | undefined;
}

export function StrengthSegmentView({ opening: openingExercise }: { opening?: string }) {
  const app = useApp();
  const display = app.display;
  const [picking, setPicking] = useState(false);
  const [explaining, setExplaining] = useState(false);

  /**
   * Where the screen opens: what you starred, then the lift your programme
   * is actually built around, then whatever was trained last.
   */
  const opening = (rows: ExercisePicker_Row[]): string | undefined => {
    const starred = ExercisePicker.favorites({ in: rows })[0];
    if (starred !== undefined) return starred.exerciseID;
    const primaries = app.plan.flatMap((d) => d.exercises).filter((e) => e.role === "primaryStrength");
    const trained = new Set(rows.filter((r) => ExercisePicker_Row.hasHistory(r)).map((r) => r.exerciseID));
    const primary = primaries.find((p) => trained.has(p.exerciseID));
    if (primary !== undefined) return primary.exerciseID;
    const recent = ExercisePicker.recent({ in: rows, limit: 1 })[0];
    if (recent !== undefined) return recent.exerciseID;
    const listed = new Set(rows.map((r) => r.exerciseID));
    return primaries.find((p) => listed.has(p.exerciseID))?.exerciseID ?? rows[0]?.exerciseID;
  };

  const progressFor = (selected: string | undefined, rows: ExercisePicker_Row[]): Pick<StrengthData, "series" | "progress"> => {
    const row = rows.find((r) => r.exerciseID === selected);
    if (row === undefined) return { series: [], progress: undefined };
    const series = ExerciseHistory.series({ exerciseID: row.exerciseID, from: app.sessions });
    // The series this account actually has, not the one its programme happens to prescribe.
    const modifiers =
      series[0]?.modifiers ?? app.plan.flatMap((d) => d.exercises).find((e) => e.exerciseID === row.exerciseID)?.modifiers ?? SetModifiers.none;
    return { series, progress: StrengthProgress.make({ exerciseID: row.exerciseID, name: row.name, modifiers, sessions: app.sessions }) };
  };

  const reload = (current: string | undefined): StrengthData => {
    const rows = ExercisePicker.rowsSessions({ sessions: app.sessions, favorites: app.favoriteExercises, custom: app.customExercises });
    const selected = current === undefined || !rows.some((r) => r.exerciseID === current) ? opening(rows) : current;
    return { selected, rows, ...progressFor(selected, rows) };
  };

  const [data, setData] = useState<StrengthData>(() => reload(openingExercise));
  useEffect(() => {
    setData((d) => reload(d.selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.revision]);
  const { selected, rows, series, progress } = data;
  const select = (id: string) => setData((d) => ({ ...d, selected: id, ...progressFor(id, d.rows) }));

  const current = rows.find((r) => r.exerciseID === selected);

  /** "Chest · favourite" — where this exercise sits, and whether it is one of yours. */
  const standing = (() => {
    if (current === undefined) return undefined;
    const parts = [MuscleGroup.title(current.group)];
    if (current.isFavorite) parts.push("favourite");
    if (series.length > 1 && series[0] !== undefined) parts.push(ExerciseHistory_Series.label(series[0]));
    return parts.join(" · ");
  })();

  // MARK: - The exercise is the title

  const title = (
    <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s4, ...slListCard({ radius: SL.Radius.xl }) }}>
      <Pressable
        onPress={() => setPicking(true)}
        aria-label={`Exercise: ${progress?.name ?? "none"}`}
        style={{ flex: "1 1 0", minWidth: 0, background: "transparent", padding: 0, textAlign: "left" }}
      >
        <HStack spacing={SL.Space.s3}>
          <div style={{ width: 48, height: 48, flexShrink: 0, padding: 7, boxSizing: "border-box", borderRadius: 14, background: SL.Signal.actionTint, display: "grid", placeItems: "center" }}>
            <MuscleFigure group={current?.group} highlight={SL.Signal.action} outline={colorOpacity(SL.Ink.secondary, 0.8)} style={{ width: "100%", height: "100%" }} />
          </div>
          <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
            <HStack spacing={6} style={{ maxWidth: "100%" }}>
              <Text as="h2" size={SL.TypeSize.title} weight={SL.Weight.semibold} color={SL.Ink.primary} lineLimit={2} minimumScaleFactor={0.8}>
                {progress?.name ?? "Exercise"}
              </Text>
              <SLGlyph name="chevronDown" size={14} color={SL.Ink.secondary} />
            </HStack>
            {standing !== undefined && (
              <Text {...slMeta()} color={SL.Ink.secondary}>
                {standing}
              </Text>
            )}
          </VStack>
          <Spacer minLength={0} />
        </HStack>
      </Pressable>

      {current !== undefined && (
        <Pressable
          onPress={() => void app.setFavorite({ exerciseID: current.exerciseID, isFavorite: !current.isFavorite })}
          aria-label={current.isFavorite ? "Remove star" : "Star this exercise"}
          style={{ minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin, background: "transparent", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <SFSymbol name={current.isFavorite ? "star.fill" : "star"} size={20} weight={400} color={current.isFavorite ? gold : SL.Ink.tertiary} />
        </Pressable>
      )}
    </HStack>
  );

  // MARK: - The estimate

  /** The reference period as a meter that fills: three sessions before a record can count. */
  const referenceMeter = (p: StrengthProgress) => {
    const total = ExerciseHistory.sessionsBeforeReference;
    const done = Math.min(StrengthProgress.referenceSessionNumber(p), total);
    return (
      <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
        <HStack spacing={4} style={{ alignSelf: "stretch" }}>
          {Array.from({ length: total }, (_, index) => (
            <div key={index} style={{ flex: "1 1 0", height: 6, borderRadius: SL.Radius.pill, background: index < done ? SL.Signal.action : SL.Surface.raised2 }} />
          ))}
        </HStack>
        <Text {...slMeta()} color={SL.Ink.secondary}>
          {`Building a reference · session ${StrengthProgress.referenceSessionNumber(p)} of ${total}`}
        </Text>
      </VStack>
    );
  };

  /** First, middle and last. The middle label is the date halfway between the two ends. */
  const chartLabels = (points: StrengthProgress_Point[]): string[] => {
    const first = points[0]?.date;
    const last = points[points.length - 1]?.date;
    if (first === undefined || last === undefined) return [];
    if (!(points.length > 2)) return [NumberDisplay.shortDate(display, first), NumberDisplay.shortDate(display, last)];
    const middle = addingTimeInterval(first, timeIntervalSince(last, first) / 2);
    return [first, middle, last].map((d) => NumberDisplay.shortDate(display, d));
  };

  const chart = (p: StrengthProgress) => {
    const labels = chartLabels(p.points);
    return (
      <VStack role="img" aria-label={`Estimated 1RM over ${p.points.length} sessions`} spacing={SL.Space.s2} style={{ alignSelf: "stretch", paddingTop: SL.Space.s1, paddingBottom: SL.Space.s1 }}>
        <div style={{ height: 110, alignSelf: "stretch" }}>
          <StrengthArea values={p.points.map((x) => x.estimate)} dates={p.points.map((x) => x.date)} ink={SL.Signal.action} />
        </div>
        <HStack spacing={0} style={{ alignSelf: "stretch" }}>
          {labels.map((label, index) => (
            <span key={index} style={{ display: "contents" }}>
              <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} numerals color={SL.Ink.secondary}>
                {label}
              </Text>
              {index < labels.length - 1 && <Spacer minLength={SL.Space.s2} />}
            </span>
          ))}
        </HStack>
      </VStack>
    );
  };

  /** The number the screen exists for, what it moved, and its line. */
  const heroCard = (p: StrengthProgress) => {
    const shown = StrengthProgress.shownChange(p);
    return (
      <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch", padding: SL.Space.s5, ...slListCard({ radius: SL.Radius.xl }) }}>
        <HStack spacing={SL.Space.s1} style={{ height: 24, alignSelf: "stretch" }}>
          <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} tracking={1.2} color={SL.Ink.secondary}>
            ESTIMATED 1RM
          </Text>
          {p.estimate !== undefined && (
            <Pressable onPress={() => setExplaining(true)} aria-label="What is estimated 1RM?" style={{ width: 32, height: 32, background: "transparent", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SFSymbol name="info.circle" size={15} weight={400} color={SL.Ink.tertiary} />
            </Pressable>
          )}
          <Spacer minLength={0} />
        </HStack>

        {p.estimate !== undefined ? (
          <>
            {/* Stated in the steps a gym actually has: 124.14 reads as 124. */}
            <Text numerals lineLimit={1} minimumScaleFactor={0.5} color={SL.Ink.primary} style={{ ...slCapped(48, SL.Weight.semibold, { maxScale: 1.4 }), maxWidth: "100%" }}>
              {NumberDisplay.kg(display, Estimates.round(p.estimate, { toIncrement: 0.5 }))}
            </Text>

            {p.change !== undefined && shown !== undefined ? (
              // A gain reads in lime; a drop in the sentence's own ink.
              <span
                aria-label={`${NumberDisplay.signedDelta(display, shown)} kilos since ${NumberDisplay.shortDate(display, p.change.since)}`}
                style={{ paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, paddingTop: 5, paddingBottom: 5, borderRadius: SL.Radius.pill, background: shown > 0 ? SL.Signal.actionTint : SL.Surface.raised2 }}
              >
                <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals color={shown > 0 ? SL.Signal.action : SL.Ink.secondary}>
                  {`${NumberDisplay.signedDelta(display, shown)} kg since ${NumberDisplay.shortDate(display, p.change.since)}`}
                </Text>
              </span>
            ) : !StrengthProgress.hasReference(p) ? (
              referenceMeter(p)
            ) : null}

            {p.points.length > 1 && chart(p)}

            {p.source !== undefined && (
              <Text {...slMeta()} numerals color={SL.Ink.secondary}>
                {`From your best set: ${NumberDisplay.kg(display, p.source.weightKg)} × ${p.source.reps} on ${NumberDisplay.shortDate(display, p.source.date)}`}
              </Text>
            )}
          </>
        ) : p.rows.length === 0 ? (
          <Text size={SL.TypeSize.display} weight={SL.Weight.semibold} color={SL.Ink.tertiary}>
            Not logged yet
          </Text>
        ) : (
          // §10.2: above ten reps the app states no estimate rather than a flattering one.
          <Text {...slBody()} color={SL.Ink.secondary}>
            Above 10 reps, SETLINE makes no estimate.
          </Text>
        )}
      </VStack>
    );
  };

  // MARK: - Stats

  const statTile = (label: string, value: string, unit: string | undefined, medal = false) => (
    <VStack key={label} alignment="leading" spacing={SL.Space.s2} role="group" style={{ flex: "1 1 0", minWidth: 0, padding: 14, ...slListCard() }}>
      <HStack spacing={4} style={{ height: 20, alignSelf: "stretch" }}>
        <Text {...slMeta()} color={SL.Ink.secondary}>
          {label}
        </Text>
        <Spacer minLength={0} />
        {medal && <SLMedal place={LiftMedal_Place.gold} size={18} />}
      </HStack>
      <HStack alignment="firstTextBaseline" spacing={2} style={{ maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden" }}>
        <Text size={24} weight={SL.Weight.semibold} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.7}>
          {value}
        </Text>
        {unit !== undefined && (
          <Text {...slMeta()} numerals color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.7}>
            {unit}
          </Text>
        )}
      </HStack>
    </VStack>
  );

  /** Three tiles, as Apple Fitness sums an activity: the heaviest set, how often, and how many records. */
  const stats = (p: StrengthProgress) => {
    const heaviest = maxBy(p.rows, (a, b) => a.weightKg < b.weightKg);
    const records = p.rows.filter((r) => r.marker.kind === "record").length;
    return (
      <HStack spacing={SL.Space.s3} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
        {statTile("Heaviest", heaviest !== undefined ? NumberDisplay.number(display, heaviest.weightKg) : "—", "kg")}
        {statTile("Sessions", `${p.sessionCount}`, undefined)}
        {statTile("Records", records === 0 ? "—" : `${records}`, undefined, records > 0)}
      </HStack>
    );
  };

  // MARK: - Sessions

  /** What a session did: a record earns the gold medal, a gain its lime kilos, a repeat an equals sign. */
  const marker = (m: StrengthProgress_Marker) => {
    switch (m.kind) {
      case "record":
        return (
          <HStack spacing={6} aria-label="Personal record" style={{ flexShrink: 0 }}>
            <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={0.8} color={gold}>
              PR
            </Text>
            <SLMedal place={LiftMedal_Place.gold} size={28} shines />
          </HStack>
        );
      case "delta":
        return (
          <span style={{ flexShrink: 0, whiteSpace: "nowrap", paddingLeft: SL.Space.s2, paddingRight: SL.Space.s2, paddingTop: 4, paddingBottom: 4, borderRadius: SL.Radius.pill, background: m.value > 0 ? SL.Signal.actionTint : SL.Surface.raised2 }}>
            <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} numerals color={m.value > 0 ? SL.Signal.action : SL.Ink.secondary}>
              {`${NumberDisplay.signedDelta(display, m.value)} kg`}
            </Text>
          </span>
        );
      case "same":
        return (
          <span aria-label="Same as before" style={{ flexShrink: 0, width: 28, height: 24, borderRadius: SL.Radius.pill, background: SL.Surface.raised2, display: "grid", placeItems: "center" }}>
            <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} color={SL.Ink.secondary}>
              =
            </Text>
          </span>
        );
      case "building":
        return (
          <span
            aria-label={`Reference session ${m.session} of ${m.of}`}
            style={{ flexShrink: 0, whiteSpace: "nowrap", paddingLeft: SL.Space.s2, paddingRight: SL.Space.s2, paddingTop: 4, paddingBottom: 4, borderRadius: SL.Radius.pill, background: SL.Surface.raised2 }}
          >
            <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} numerals color={SL.Ink.secondary}>
              {`Ref ${m.session}/${m.of}`}
            </Text>
          </span>
        );
    }
  };

  const sessionCard = (row: StrengthProgress_SessionRow) => {
    const isRecord = row.marker.kind === "record";
    return (
      <HStack
        key={row.id}
        spacing={SL.Space.s3}
        role="group"
        style={{
          alignSelf: "stretch",
          paddingLeft: SL.Space.s4 + SL.Metric.border,
          paddingRight: SL.Space.s4 + SL.Metric.border,
          paddingTop: SL.Space.s3 + SL.Metric.border,
          paddingBottom: SL.Space.s3 + SL.Metric.border,
          background: SL.Surface.raised,
          borderRadius: SL.Radius.lg,
          boxShadow: `inset 0 0 0 1px ${isRecord ? colorOpacity(gold, 0.45) : SL.Surface.hairline}`,
        }}
      >
        <VStack spacing={0} style={{ width: 44, height: 44, flexShrink: 0, justifyContent: "center", borderRadius: SL.Radius.md, background: SL.Surface.raised2 }}>
          <Text size={SL.TypeSize.lead} weight={SL.Weight.semibold} numerals color={SL.Ink.primary} lineHeight={1.15}>
            {`${row.date.getDate()}`}
          </Text>
          <Text size={10} weight={SL.Weight.semibold} tracking={0.6} color={SL.Ink.secondary} lineHeight={1.15}>
            {formatEnUS(row.date, "MMM").toUpperCase()}
          </Text>
        </VStack>

        <VStack alignment="leading" spacing={2} style={{ minWidth: 0 }}>
          <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary}>
            {`${NumberDisplay.kg(display, row.weightKg)} × ${row.reps}`}
          </Text>
          <Text {...slMeta()} numerals color={SL.Ink.secondary}>
            {row.dayLabel === "" ? `${row.setCount} sets` : `${row.dayLabel} · ${row.setCount} sets`}
          </Text>
        </VStack>
        <Spacer minLength={SL.Space.s2} />
        {marker(row.marker)}
      </HStack>
    );
  };

  const sessionList = (p: StrengthProgress) => (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <Text
        as="h2"
        size={SL.TypeSize.title}
        weight={SL.Weight.semibold}
        color={SL.Ink.primary}
        style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s1 }}
      >
        Sessions
      </Text>
      {p.rows.map((row) => sessionCard(row))}
    </VStack>
  );

  /** An exercise the catalogue offers and this account has never done. */
  const untrained = (
    <div style={{ alignSelf: "stretch", padding: SL.Space.s4, ...slListCard() }}>
      <Text {...slBody()} color={SL.Ink.secondary}>
        Log this exercise once and its sessions show up here as cards.
      </Text>
    </div>
  );

  const emptyState = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch", padding: SL.Space.s5, ...slListCard({ radius: SL.Radius.xl }) }}>
      <Text {...slLead()}>No exercises yet</Text>
      <Text {...slBody()} color={SL.Ink.secondary}>
        Your first session sets the starting weights.
      </Text>
    </VStack>
  );

  const sheetBody = { display: "flex", flexDirection: "column" as const, flex: "1 1 0", minHeight: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, alignSelf: "stretch", width: "100%" }}>
      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack alignment="leading" spacing={SL.Space.s4} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s8 }}>
          {rows.length === 0 ? (
            emptyState
          ) : (
            <>
              {title}
              {progress !== undefined && (
                <>
                  {heroCard(progress)}
                  {progress.rows.length === 0 ? (
                    untrained
                  ) : (
                    <>
                      {stats(progress)}
                      {sessionList(progress)}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </VStack>
      </ScrollView>

      <Sheet isPresented={picking} onDismiss={() => setPicking(false)}>
        {picking && (
          <div style={sheetBody}>
            <ExercisePickerSheet
              rows={rows}
              selected={selected}
              onPick={(row) => {
                select(row.exerciseID);
                setPicking(false);
              }}
              onStar={(row) => void app.setFavorite({ exerciseID: row.exerciseID, isFavorite: !row.isFavorite })}
              onClose={() => setPicking(false)}
            />
          </div>
        )}
      </Sheet>
      <Sheet isPresented={explaining} onDismiss={() => setExplaining(false)}>
        {explaining && progress !== undefined && (
          <div style={sheetBody}>
            <OneRepMaxSheet progress={progress} onClose={() => setExplaining(false)} />
          </div>
        )}
      </Sheet>
    </div>
  );
}
