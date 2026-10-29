// WorkoutPreviewView.swift — Redesign 1a · "Preview · nothing starts yet".
//
// What a date holds, read from the programme and the schedule: four numbers
// about the session, then its exercises in order. Opening it writes nothing
// and starts nothing — starting is the lime button, and only today has one.
//
// A day that has gone by offers writing it down afterwards instead; a day
// still to come offers nothing but a look. Every unlogged day can be given
// another session from here ("Change this day").
import { SL } from "../../design/tokens";
import { Text, VStack } from "../../design/swiftui";
import { SLOutlineButton, SLPrimaryButton, SLQuietButton } from "../../design/SetlineTokens";
import { slLineHeight } from "../../design/SLDynamicType";
import { SLGlyph } from "../../design/components/SLGlyph";
import { SLHairline, slLead, slMeta, slTitle } from "../../design/components/SLText";
import { SLAdaptiveRow, slUnbroken } from "../../design/components/SLPieces";
import { SLSheet } from "../../design/components/SLSheet";
import { useApp } from "../../data/AppState";
import { roundPlaces } from "../../core/Support/swift";
import type { AgendaDay } from "../../core/Engine/Agenda";
import { WeekPlan } from "../../core/Engine/WeekPlan";
import { NumberDisplay } from "../../core/Engine/NumberDisplay";
import { ExerciseHistory } from "../../core/Engine/ExerciseHistory";
import { ProgressionEngine } from "../../core/Engine/ProgressionEngine";
import { PlannedExercise, type TrainingSession, type WorkoutDay } from "../../core/Domain/Model";

export function WorkoutPreviewView({
  day,
  workout,
  onStart,
  onLogPast,
  onChangeDay,
  onClose,
}: {
  day: AgendaDay;
  workout: WorkoutDay;
  /** Today only: start the session. */
  onStart: (() => void) | undefined;
  /** A day that passed unlogged: write it down on its own date. */
  onLogPast: (() => void) | undefined;
  onChangeDay: () => void;
  onClose: () => void;
}) {
  const app = useApp();
  const display = app.display;

  // MARK: - Head

  /** "Push A · bench & shoulders" */
  const title = (() => {
    const first = workout.focus.slice(0, 1);
    if (first === "") return workout.short;
    return `${workout.short} · ${first.toLowerCase()}${workout.focus.slice(1)}`;
  })();

  const subtitle = (() => {
    if (day.isToday) return "Preview · nothing starts yet";
    const date = `${WeekPlan.fullWeekday(day.date)} ${NumberDisplay.shortDate(display, day.date)}`;
    if (day.content.kind === "missed") return `Not logged · ${date}`;
    return `Preview · ${date}`;
  })();

  /**
   * What the exercise would open with, read as the date would open it:
   * history up to that date only, so a look at a past day never borrows
   * numbers from after it.
   */
  const target = (planned: PlannedExercise): { weight: number | undefined; previous: number | undefined } => {
    const history = app.history({ for: planned, before: day.date });
    const previous = ExerciseHistory.mostRecent(history)?.sets[0]?.weightKg;
    const proposal = ProgressionEngine.proposal({ planned, exercise: app.exercise(planned.exerciseID), history });
    return { weight: proposal.weightKg ?? previous, previous };
  };

  /** The volume the day would come to at the weights it would open with. */
  const plannedVolume = workout.exercises.reduce((total, planned) => {
    const weight = target(planned).weight;
    if (weight === undefined) return total;
    const reps = planned.sets.reduce((sum, s) => sum + s.repRange.upperBound, 0);
    return total + weight * reps;
  }, 0);

  /** Kilos as tonnes, to one decimal. */
  const tonnes = (kilos: number) => roundPlaces(kilos / 1000, 1);

  // MARK: - Four numbers

  const items: { value: string; label: string }[] = [
    { value: `~${WeekPlan.minutes({ of: workout })}`, label: "min" },
    { value: `${workout.exercises.length}`, label: workout.exercises.length === 1 ? "exercise" : "exercises" },
    { value: `${WeekPlan.sets({ of: workout })}`, label: "sets" },
  ];
  // Tonnage needs weights to reckon with; a first session has none, and the
  // column is left out rather than filled with a guess.
  if (plannedVolume > 0) items.push({ value: NumberDisplay.number(display, tonnes(plannedVolume)), label: "tonnes planned" });

  const stats = (
    <div style={{ position: "relative", alignSelf: "stretch" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
          columnGap: SL.Space.s2,
          rowGap: SL.Space.s3,
          paddingTop: SL.Space.s3,
          paddingBottom: SL.Space.s3,
        }}
      >
        {items.map((item, i) => (
          <VStack key={i} alignment="leading" spacing={2} style={{ minWidth: 0 }}>
            <Text {...slTitle()} numerals color={SL.Ink.primary} lineLimit={1} minimumScaleFactor={0.7} style={{ maxWidth: "100%" }}>
              {item.value}
            </Text>
            <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1} minimumScaleFactor={0.7} style={{ maxWidth: "100%" }}>
              {item.label}
            </Text>
          </VStack>
        ))}
      </div>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <SLHairline />
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <SLHairline />
      </div>
    </div>
  );

  // MARK: - The exercises

  /** "4 × 8 · last 82.5 kg", or the weight the session would propose where that is no longer the previous one. */
  const prescription = (planned: PlannedExercise): string => {
    const reps = planned.sets[0]?.repRange.upperBound ?? 0;
    const line = `${PlannedExercise.targetSets(planned)} × ${reps}`;
    const { weight, previous } = target(planned);
    if (weight !== undefined && previous !== undefined && weight !== previous) {
      return `${line} · target ${NumberDisplay.kg(display, weight)}`;
    }
    if (previous !== undefined) return `${line} · last ${NumberDisplay.kg(display, previous)}`;
    const note = planned.authoredNote?.load;
    if (note !== undefined && note !== "") return `${line} · ${note}`;
    return line;
  };

  const exercises = (
    <VStack spacing={0} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
      {workout.exercises.map((planned, index) => (
        <div key={index} style={{ position: "relative" }}>
          <SLAdaptiveRow
            spacing={SL.Space.s3}
            style={{ paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2, minHeight: 56 }}
            leading={
              <Text {...slMeta()} numerals color={SL.Ink.secondary} style={{ minWidth: 24, flexShrink: 0 }}>
                {`${index + 1}`}
              </Text>
            }
            main={
              <VStack alignment="leading" spacing={2}>
                <Text {...slLead(SL.Weight.regular)} color={SL.Ink.primary}>
                  {app.exercise(planned.exerciseID).name}
                </Text>
              </VStack>
            }
            trailing={
              <Text {...slMeta()} numerals align="trailing" color={SL.Ink.secondary}>
                {slUnbroken(prescription(planned))}
              </Text>
            }
          />
          {index < workout.exercises.length - 1 && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
              <SLHairline />
            </div>
          )}
        </div>
      ))}
    </VStack>
  );

  const lastSession: TrainingSession | undefined = app.sessions
    .filter((s) => s.kind === "workout" && s.dayID === workout.id && s.date.getTime() < day.date.getTime())
    .reduce<TrainingSession | undefined>((best, s) => (best === undefined || best.date.getTime() < s.date.getTime() ? s : best), undefined);

  const footnote = (() => {
    const lines: string[] = [];
    if (day.movedFrom !== undefined) lines.push(`Moved from ${day.movedFrom}.`);
    if (day.content.kind === "missed") {
      lines.push("No sets saved. SETLINE doesn't catch up or shift anything — your plan for next week stays.");
    } else if (day.isToday) {
      lines.push("Weights come from your last session. Everything can be changed during the session.");
    } else if (lastSession !== undefined) {
      lines.push(`Expected weights, worked out from your session on ${NumberDisplay.shortDate(display, lastSession.date)}. You can start on the day itself.`);
    } else {
      lines.push("You can start on the day itself.");
    }
    return lines.join(" ");
  })();

  // MARK: - What can be done from here

  const actions = (
    <VStack spacing={SL.Space.s1} style={{ alignSelf: "stretch", alignItems: "stretch" }}>
      {onStart !== undefined && (
        <SLPrimaryButton onPress={onStart}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <SLGlyph name="play" size={16} />
            <span>Start training</span>
          </span>
        </SLPrimaryButton>
      )}
      {onLogPast !== undefined && (
        <div style={{ display: "flex", flexDirection: "column", paddingBottom: SL.Space.s1 }}>
          <SLOutlineButton onPress={onLogPast}>Log afterwards</SLOutlineButton>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", paddingTop: onStart === undefined ? 0 : SL.Space.s1 }}>
        <SLOutlineButton onPress={onChangeDay}>Change this day</SLOutlineButton>
      </div>
      <SLQuietButton onPress={onClose}>Back to overview</SLQuietButton>
    </VStack>
  );

  return (
    <SLSheet title={slUnbroken(title)} subtitle={subtitle} onClose={onClose}>
      <VStack alignment="leading" spacing={SL.Space.s4}>
        {stats}
        {exercises}
        <Text {...slMeta()} numerals color={SL.Ink.secondary} style={slLineHeight(SL.LineHeight.body, { size: SL.TypeSize.meta })}>
          {slUnbroken(footnote)}
        </Text>
        {actions}
      </VStack>
    </SLSheet>
  );
}
