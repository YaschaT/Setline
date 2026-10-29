// LichaamSegmentView.swift — Artboard 20 · segment Lichaam.
//
// Wording and colour come from the ≥1024 tile (27): `LICHAAMSGEWICHT`,
// `82,4 kg`, `+0,3 / 4 weken` in the recovery mint. A weigh-in is a status,
// not a training win, so lime stays out of the reading entirely.
//
// The action is reachable in every state the screen has, because the account
// takes a weigh-in in every one of them: with a series behind it, with only
// today's, and with none at all.
import { SL, slListCard } from "../../design/tokens";
import { HStack, ScrollView, Sheet, Spacer, Text, VStack } from "../../design/swiftui";
import { SLOutlineButton, colorOpacity } from "../../design/SetlineTokens";
import { SLHairline, slBody, slLead, slMeta } from "../../design/components/SLText";
import { slCapped, slLineHeight } from "../../design/SLDynamicType";
import { useApp } from "../../data/AppState";
import { BodyProgress, type BodyProgress_Entry } from "../../core/Progress/BodyProgress";
import { LegacyAdapter } from "../../core/Legacy/LegacyAdapter";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { addingTimeInterval, timeIntervalSince } from "../../core/Support/calendar";
import { useState } from "react";
import { useGeometry } from "./ProgressHomeView";
import { WeighInSheet } from "./WeighInSheet";

/** The change column at the default text size (`@ScaledMetric … = 44`). */
const changeWidth = 44;

/** Swift Charts' `.interpolationMethod(.monotone)`: a monotone cubic through the points (d3's monotoneX). */
function monotonePath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0].x},${points[0].y}`;
  if (n === 2) return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
  const sign = (v: number) => (v < 0 ? -1 : 1);
  const slope3 = (p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const h0 = p1.x - p0.x;
    const h1 = p2.x - p1.x;
    const s0 = (p1.y - p0.y) / (h0 || (h1 < 0 ? -0 : 0));
    const s1 = (p2.y - p1.y) / (h1 || (h0 < 0 ? -0 : 0));
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  };
  const slope2 = (p0: { x: number; y: number }, p1: { x: number; y: number }, t: number) => {
    const h = p1.x - p0.x;
    return h ? ((3 * (p1.y - p0.y)) / h - t) / 2 : t;
  };
  const tangents: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) tangents[i] = slope3(points[i - 1], points[i], points[i + 1]);
  tangents[0] = slope2(points[0], points[1], tangents[1]);
  tangents[n - 1] = slope2(points[n - 2], points[n - 1], tangents[n - 2]);
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) / 3;
    d += ` C${p0.x + dx},${p0.y + dx * tangents[i]} ${p1.x - dx},${p1.y - dx * tangents[i + 1]} ${p1.x},${p1.y}`;
  }
  return d;
}

/** The `Chart`: area from the floor, the monotone line, and the last point, on time, axes hidden. */
function WeightChart({ points, range, spoken }: { points: BodyProgress_Entry[]; range: { lower: number; upper: number }; spoken: string }) {
  const [ref, size] = useGeometry<HTMLDivElement>();
  const first = points[0]?.date.getTime() ?? 0;
  const last = points[points.length - 1]?.date.getTime() ?? 0;
  const span = last - first;
  const x = (date: Date) => (span > 0 ? ((date.getTime() - first) / span) * size.width : size.width / 2);
  const y = (kg: number) => size.height - ((kg - range.lower) / (range.upper - range.lower)) * size.height;
  const plotted = points.map((p) => ({ x: x(p.date), y: y(p.weightKg) }));
  const floor = y(range.lower);
  const area =
    plotted.length > 0
      ? `M${plotted[0].x},${floor} ${plotted.map((p) => `L${p.x},${p.y}`).join(" ")} L${plotted[plotted.length - 1].x},${floor} Z`
      : "";
  const end = plotted[plotted.length - 1];
  return (
    <div ref={ref} role="img" aria-label={spoken} style={{ height: 140, alignSelf: "stretch", position: "relative" }}>
      {size.width > 0 && (
        <svg width={size.width} height={size.height} style={{ display: "block", overflow: "visible", position: "absolute", inset: 0 }}>
          <path d={area} fill={colorOpacity(SL.Signal.recovery, 0.08)} />
          <path d={monotonePath(plotted)} fill="none" stroke={SL.Signal.recovery} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {end !== undefined && <circle cx={end.x} cy={end.y} r={Math.sqrt(70) / 2} fill={SL.Signal.recovery} />}
        </svg>
      )}
    </div>
  );
}

export function LichaamSegmentView() {
  const app = useApp();
  const display = app.display;
  const [weighing, setWeighing] = useState(false);
  const progress = app.state === undefined ? BodyProgress.empty : BodyProgress.make({ metrics: LegacyAdapter.metrics({ from: app.state }) });
  const points = BodyProgress.points(progress);

  /** Today's weigh-in, which decides whether this writes a new one or corrects the one already standing. */
  const today = app.weighIn();

  /** The one action on this screen. */
  const weighInButton = (
    <SLOutlineButton onPress={() => setWeighing(true)} style={{ alignSelf: "stretch" }}>
      {today === undefined ? "Weigh in" : "Edit today's weigh-in"}
    </SLOutlineButton>
  );

  const range = (() => {
    const values = points.map((p) => p.weightKg);
    const low = values.length > 0 ? Math.min(...values) : 0;
    const high = values.length > 0 ? Math.max(...values) : 1;
    const padding = Math.max((high - low) * 0.25, 0.5);
    return { lower: low - padding, upper: high + padding };
  })();

  /** First, middle and last. The middle label is the date halfway between the two ends. */
  const chartLabels = (() => {
    const first = points[0]?.date;
    const last = points[points.length - 1]?.date;
    if (first === undefined || last === undefined) return [];
    if (!(points.length > 2)) return [NumberDisplay.shortDate(display, first), NumberDisplay.shortDate(display, last)];
    const middle = addingTimeInterval(first, timeIntervalSince(last, first) / 2);
    return [first, middle, last].map((d) => NumberDisplay.shortDate(display, d));
  })();

  const chart = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <WeightChart points={points} range={range} spoken={`Your weight over ${points.length} weigh-ins`} />
      <HStack aria-hidden spacing={0} style={{ alignSelf: "stretch" }}>
        {chartLabels.map((label, index) => (
          <span key={index} style={{ display: "contents" }}>
            <Text size={SL.TypeSize.micro} weight={SL.Weight.regular} color={SL.Ink.secondary}>
              {label}
            </Text>
            {index < chartLabels.length - 1 && <Spacer minLength={SL.Space.s2} />}
          </span>
        ))}
      </HStack>
    </VStack>
  );

  /** The weight as a hero card: the number, how it moved as a mint pill, the line, and the one action. */
  const header = (latest: BodyProgress_Entry) => (
    <VStack alignment="leading" spacing={SL.Space.s4} style={{ alignSelf: "stretch", padding: SL.Space.s5, ...slListCard({ radius: SL.Radius.xl }) }}>
      <VStack alignment="leading" spacing={SL.Space.s1} style={{ alignSelf: "stretch" }}>
        <HStack alignment="firstTextBaseline" spacing={SL.Space.s1} style={{ alignSelf: "stretch" }}>
          <Text numerals lineLimit={1} minimumScaleFactor={0.5} color={SL.Ink.primary} style={slCapped(48, SL.Weight.semibold, { maxScale: 1.4 })}>
            {NumberDisplay.number(display, latest.weightKg)}
          </Text>
          <Text {...slLead()} color={SL.Ink.secondary}>
            kg
          </Text>
          <Spacer minLength={SL.Space.s2} />
          {progress.change !== undefined && (
            <span style={{ flexShrink: 0, whiteSpace: "nowrap", paddingLeft: SL.Space.s3, paddingRight: SL.Space.s3, paddingTop: 5, paddingBottom: 5, borderRadius: SL.Radius.pill, background: SL.Signal.recoveryTint }}>
              <Text size={SL.TypeSize.meta} weight={SL.Weight.semibold} numerals color={SL.Signal.recovery}>
                {`${NumberDisplay.signedDelta(display, progress.change.value)} kg · ${progress.change.weeks} wk`}
              </Text>
            </span>
          )}
        </HStack>
        <Text {...slMeta()} color={SL.Ink.secondary}>
          {`Last weigh-in · ${NumberDisplay.shortDate(display, latest.date)}`}
        </Text>
      </VStack>

      {points.length > 1 && chart}
      {weighInButton}
    </VStack>
  );

  /** Every weigh-in, newest first, in one card; each change as a quiet pill. */
  const entries = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
      <Text
        as="h2"
        size={SL.TypeSize.title}
        weight={SL.Weight.semibold}
        color={SL.Ink.primary}
        style={{ paddingLeft: SL.Space.s1, paddingRight: SL.Space.s1, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s1 }}
      >
        Weigh-ins
      </Text>

      <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch", ...slListCard() }}>
        {progress.entries.map((entry, index) => {
          const change = entry.change;
          const pill = (text: string, ink: string, fill: string) => (
            <span style={{ whiteSpace: "nowrap", paddingLeft: SL.Space.s2, paddingRight: SL.Space.s2, paddingTop: 3, paddingBottom: 3, borderRadius: SL.Radius.pill, background: fill }}>
              <Text size={SL.TypeSize.micro} weight={SL.Weight.semibold} numerals color={ink}>
                {text}
              </Text>
            </span>
          );
          return (
            <HStack key={entry.id} alignment="center" spacing={SL.Space.s3} role="group" style={{ position: "relative", paddingLeft: SL.Space.s4, paddingRight: SL.Space.s4, minHeight: 52 }}>
              <Text {...slBody()} color={SL.Ink.secondary}>
                {NumberDisplay.shortDate(display, entry.date)}
              </Text>
              <Spacer minLength={SL.Space.s4} />
              <Text {...slBody(SL.Weight.semibold)} numerals color={SL.Ink.primary} style={{ whiteSpace: "nowrap" }}>
                {NumberDisplay.kg(display, entry.weightKg)}
              </Text>
              <div style={{ minWidth: changeWidth + 12, display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
                {change !== undefined
                  ? pill(change === 0 ? "±0" : NumberDisplay.signedDelta(display, change), change === 0 ? SL.Ink.secondary : SL.Signal.recovery, change === 0 ? SL.Surface.raised2 : SL.Signal.recoveryTint)
                  : pill("Start", SL.Ink.secondary, SL.Surface.raised2)}
              </div>
              {index > 0 && <SLHairline style={{ position: "absolute", top: 0, left: SL.Space.s4, right: 0 }} />}
            </HStack>
          );
        })}
      </VStack>
    </VStack>
  );

  const emptyState = (
    <VStack alignment="leading" spacing={SL.Space.s2} style={{ paddingTop: SL.Space.s2 }}>
      <Text {...slLead()}>No weigh-ins yet</Text>
      <Text {...slBody()} color={SL.Ink.secondary} style={slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.body })}>
        Weigh yourself in the morning, before eating. From the second weigh-in, your trend shows here.
      </Text>
    </VStack>
  );

  const latest = BodyProgress.latest(progress);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, alignSelf: "stretch", width: "100%" }}>
      <ScrollView style={{ flex: "1 1 0" }}>
        <VStack alignment="leading" spacing={SL.Space.s4} style={{ paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s3, paddingBottom: SL.Space.s8 }}>
          {latest !== undefined ? (
            <>
              {header(latest)}
              {progress.entries.length > 0 && entries}
            </>
          ) : (
            <VStack alignment="leading" spacing={SL.Space.s5} style={{ alignSelf: "stretch", padding: SL.Space.s5, ...slListCard({ radius: SL.Radius.xl }) }}>
              {emptyState}
              {weighInButton}
            </VStack>
          )}
        </VStack>
      </ScrollView>

      <Sheet isPresented={weighing} onDismiss={() => setWeighing(false)}>
        {weighing && (
          <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0 }}>
            <WeighInSheet
              date={new Date()}
              existing={today}
              latest={latest?.weightKg}
              onSave={(weight) => {
                setWeighing(false);
                void app.saveWeighIn(weight);
              }}
              onClose={() => setWeighing(false)}
            />
          </div>
        )}
      </Sheet>
    </div>
  );
}
