// WorkoutShareCard.swift — a workout as a picture to share: story-sized, in
// the app's own colours, with the numbers that say what the day was — volume,
// time, sets — the medals it earned and the streak it kept. Drawn at fixed
// sizes, since it is an image and not a screen.
//
// `image()` (ImageRenderer at scale 3) becomes a canvas drawing of the same
// card at three times its points, returned as a PNG blob.
import { SL } from "../../design/tokens";
import { HStack, Spacer, Text, VStack } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { colorOpacity } from "../../design/SetlineTokens";
import { slFixed } from "../../design/SLDynamicType";
import { SLMedal } from "../../design/components/SLMedal";
import { LoggedSet, type TrainingSession } from "../../core/Domain/Model";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { RecordsEngine } from "../../core/Engine/RecordsEngine";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { LiftMedal_Place, type LiftMedal } from "../../core/Progress/Medals";

export interface WorkoutShareCardProps {
  session: TrainingSession;
  medals: LiftMedal[];
  streakWeeks: number;
  display: NumberDisplay;
}

const size = { width: 360, height: 640 };

const volumeOf = (session: TrainingSession) => RecordsEngine.volumeLoad(session.results.flatMap((r) => r.sets));
const setCountOf = (session: TrainingSession) => session.results.flatMap((r) => r.sets).filter((s) => LoggedSet.countsTowardVolume(s)).length;

export function WorkoutShareCard({ session, medals, streakWeeks, display }: WorkoutShareCardProps) {
  const stat = (value: string, label: string) => (
    <VStack key={label} alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
      <Text color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.7} style={{ ...slFixed(20, SL.Weight.bold), maxWidth: "100%" }}>
        {value}
      </Text>
      <Text color={SL.Ink.secondary} style={slFixed(12, SL.Weight.regular)}>
        {label}
      </Text>
    </VStack>
  );
  const seconds = session.durationSeconds;
  return (
    <VStack
      alignment="leading"
      spacing={0}
      style={{ width: size.width, height: size.height, padding: 28, boxSizing: "border-box", background: SL.Surface.ground, flexShrink: 0 }}
    >
      <HStack style={{ alignSelf: "stretch" }}>
        <Text color={SL.Signal.action} tracking={3} style={slFixed(13, SL.Weight.bold)}>
          SETLINE
        </Text>
        <Spacer />
        <Text color={SL.Ink.secondary} style={slFixed(13, SL.Weight.medium)}>
          {NumberDisplay.shortDate(display, session.date)}
        </Text>
      </HStack>

      <Spacer minLength={0} />

      <Text color={SL.Ink.secondary} tracking={1.5} style={slFixed(12, SL.Weight.bold)}>
        {WeekPlan.fullWeekday(session.date).toUpperCase()}
      </Text>
      <Text color={SL.Ink.primary} tracking={-2} lineLimit={1} minimumScaleFactor={0.5} style={{ ...slFixed(64, SL.Weight.bold), maxWidth: "100%" }}>
        {session.dayLabel}
      </Text>

      <HStack alignment="top" spacing={0} style={{ paddingTop: 20, alignSelf: "stretch" }}>
        {stat(NumberDisplay.volumeKg(display, volumeOf(session)), "volume")}
        {seconds !== undefined && seconds > 0 && stat(NumberDisplay.minutes(display, seconds), "time")}
        {stat(`${setCountOf(session)}`, "sets")}
      </HStack>

      {medals.length > 0 && (
        <VStack alignment="leading" spacing={12} style={{ paddingTop: 28 }}>
          {medals.slice(0, 3).map((medal) => (
            <HStack key={medal.exerciseID} spacing={12}>
              <SLMedal place={medal.place} size={30} />
              <VStack alignment="leading" spacing={1} style={{ minWidth: 0 }}>
                <Text color={SL.Ink.primary} lineLimit={1} style={slFixed(15, SL.Weight.semibold)}>
                  {medal.name}
                </Text>
                <Text color={SL.Ink.secondary} style={slFixed(12, SL.Weight.regular)}>
                  {`${LiftMedal_Place.title(medal.place)} · ${NumberDisplay.kg(display, medal.weightKg)} × ${medal.reps}`}
                </Text>
              </VStack>
            </HStack>
          ))}
          {medals.length > 3 && (
            <Text color={SL.Ink.secondary} style={slFixed(12, SL.Weight.medium)}>
              {`+${medals.length - 3} more medals`}
            </Text>
          )}
        </VStack>
      )}

      <Spacer minLength={0} />

      {streakWeeks > 0 && (
        <HStack spacing={8} style={{ color: SL.Signal.onAction, paddingLeft: 14, paddingRight: 14, paddingTop: 9, paddingBottom: 9, borderRadius: SL.Radius.pill, background: SL.Signal.action }}>
          <SFSymbol name="flame" size={15} weight={600} color={SL.Signal.onAction} />
          <Text color={SL.Signal.onAction} style={slFixed(15, SL.Weight.semibold)}>
            {streakWeeks === 1 ? "1-week streak" : `${streakWeeks}-week streak`}
          </Text>
        </HStack>
      )}
    </VStack>
  );
}

WorkoutShareCard.size = size;

/** Lucide's flame (the `flame` symbol SFSymbol.tsx draws), on a 24 grid. */
const flamePath =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";

/** The card as an image, three times its points for a sharp story. */
WorkoutShareCard.image = async (p: WorkoutShareCardProps): Promise<Blob | undefined> => {
  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = size.width * scale;
  canvas.height = size.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  try {
    await Promise.all([400, 500, 600, 700].map((w) => document.fonts.load(`${w} 20px Archivo`)));
  } catch {
    /* the fallback face draws it */
  }
  ctx.scale(scale, scale);
  ctx.fillStyle = SL.Surface.ground;
  ctx.fillRect(0, 0, size.width, size.height);

  const L = 1.2;
  const pad = 28;
  const inner = size.width - 2 * pad;
  const font = (px: number, weight: number) => `${weight} ${px}px Archivo, system-ui, sans-serif`;
  const text = (s: string, x: number, top: number, px: number, weight: number, color: string, a: { tracking?: number; align?: CanvasTextAlign; maxWidth?: number } = {}) => {
    ctx.font = font(px, weight);
    ctx.fillStyle = color;
    ctx.textAlign = a.align ?? "left";
    ctx.textBaseline = "middle";
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${a.tracking ?? 0}px`;
    let shown = s;
    if (a.maxWidth !== undefined) {
      while (shown.length > 1 && ctx.measureText(shown).width > a.maxWidth) shown = shown.slice(0, -2) + "…";
    }
    ctx.fillText(shown, x, top + (px * L) / 2);
  };
  const width = (s: string, px: number, weight: number, tracking = 0) => {
    ctx.font = font(px, weight);
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${tracking}px`;
    return ctx.measureText(s).width;
  };

  const medal = (place: LiftMedal_Place, x: number, y: number, s: number) => {
    const metal = SLMedal.metal(place);
    const ribbonW = s * 0.26;
    const ribbonH = s * 0.42;
    const gap = s * 0.04;
    const left = x + (s - (2 * ribbonW + gap)) / 2;
    [metal.edge, colorOpacity(metal.edge, 0.75)].forEach((fill, i) => {
      const rx = left + i * (ribbonW + gap);
      ctx.beginPath();
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + ribbonW, y);
      ctx.lineTo(rx + ribbonW, y + ribbonH);
      ctx.lineTo(rx + ribbonW / 2, y + ribbonH * 0.78);
      ctx.lineTo(rx, y + ribbonH);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    });
    const disc = s * 0.82;
    const cx = x + s / 2;
    const cy = y + s * 0.24 + disc / 2;
    const circle = (r: number, fill?: string, stroke?: { color: string; width: number }) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.stroke();
      }
    };
    circle(disc / 2, metal.edge);
    circle(disc / 2 - s * 0.07, metal.face);
    const ring = Math.max(1, s * 0.035);
    circle(disc / 2 - s * 0.17 - ring / 2, undefined, { color: colorOpacity(metal.edge, 0.55), width: ring });
    ctx.font = font(s * 0.36, 700);
    ctx.fillStyle = metal.edge;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
    ctx.fillText(`${place}`, cx, cy);
  };

  const { session, medals, streakWeeks, display } = p;
  const seconds = session.durationSeconds;
  const stats: [string, string][] = [[NumberDisplay.volumeKg(display, volumeOf(session)), "volume"]];
  if (seconds !== undefined && seconds > 0) stats.push([NumberDisplay.minutes(display, seconds), "time"]);
  stats.push([`${setCountOf(session)}`, "sets"]);

  // Heights, to share what is left between the two spacers as SwiftUI does.
  const topBar = 13 * L;
  const statsHeight = 20 * L + 2 + 12 * L;
  const medalRow = Math.max(30 * 1.06, 15 * L + 1 + 12 * L);
  const shownMedals = medals.slice(0, 3);
  const medalsHeight =
    medals.length === 0 ? 0 : 28 + shownMedals.length * medalRow + (shownMedals.length - 1) * 12 + (medals.length > 3 ? 12 + 12 * L : 0);
  const middle = 12 * L + 64 * L + 20 + statsHeight + medalsHeight;
  const pill = streakWeeks > 0 ? 15 * L + 18 : 0;
  const leftover = Math.max(0, size.height - 2 * pad - topBar - middle - pill);

  let y = pad;
  text("SETLINE", pad, y, 13, 700, SL.Signal.action, { tracking: 3 });
  text(NumberDisplay.shortDate(display, session.date), size.width - pad, y, 13, 500, SL.Ink.secondary, { align: "right" });
  y += topBar + leftover / 2;

  text(WeekPlan.fullWeekday(session.date).toUpperCase(), pad, y, 12, 700, SL.Ink.secondary, { tracking: 1.5 });
  y += 12 * L;
  // `.lineLimit(1).minimumScaleFactor(0.5)`.
  const natural = width(session.dayLabel, 64, 700, -2);
  const titleSize = natural > inner ? Math.max(32, (64 * inner) / natural) : 64;
  text(session.dayLabel, pad, y + (64 * L - titleSize * L) / 2, titleSize, 700, SL.Ink.primary, { tracking: -2 * (titleSize / 64), maxWidth: inner });
  y += 64 * L + 20;

  const column = inner / stats.length;
  stats.forEach(([value, label], i) => {
    const x = pad + i * column;
    const natural20 = width(value, 20, 700);
    const valueSize = natural20 > column ? Math.max(14, (20 * column) / natural20) : 20;
    text(value, x, y + (20 * L - valueSize * L) / 2, valueSize, 700, SL.Ink.primary);
    text(label, x, y + 20 * L + 2, 12, 400, SL.Ink.secondary);
  });
  y += statsHeight;

  if (medals.length > 0) {
    y += 28;
    shownMedals.forEach((m, i) => {
      const top = y + i * (medalRow + 12);
      medal(m.place, pad, top + (medalRow - 30 * 1.06) / 2, 30);
      const textTop = top + (medalRow - (15 * L + 1 + 12 * L)) / 2;
      text(m.name, pad + 42, textTop, 15, 600, SL.Ink.primary, { maxWidth: inner - 42 });
      text(`${LiftMedal_Place.title(m.place)} · ${NumberDisplay.kg(display, m.weightKg)} × ${m.reps}`, pad + 42, textTop + 15 * L + 1, 12, 400, SL.Ink.secondary);
    });
    y += shownMedals.length * medalRow + (shownMedals.length - 1) * 12;
    if (medals.length > 3) {
      text(`+${medals.length - 3} more medals`, pad, y + 12, 12, 500, SL.Ink.secondary);
      y += 12 + 12 * L;
    }
  }
  y += leftover / 2;

  if (streakWeeks > 0) {
    const label = streakWeeks === 1 ? "1-week streak" : `${streakWeeks}-week streak`;
    const icon = 15 * 1.15;
    const w = 14 + icon + 8 + width(label, 15, 600) + 14;
    const h = pill;
    ctx.beginPath();
    ctx.roundRect(pad, y, w, h, h / 2);
    ctx.fillStyle = SL.Signal.action;
    ctx.fill();
    ctx.save();
    ctx.translate(pad + 14, y + (h - icon) / 2);
    ctx.scale(icon / 24, icon / 24);
    ctx.strokeStyle = SL.Signal.onAction;
    ctx.lineWidth = 2.25;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(flamePath));
    ctx.restore();
    text(label, pad + 14 + icon + 8, y + 9, 15, 600, SL.Signal.onAction);
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), "image/png"));
};
