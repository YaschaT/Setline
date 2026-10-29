import { type ExerciseResult, PlannedExercise, type TrainingSession, type WorkoutDay } from "../Domain/Model";
import { addDays, startOfDay } from "../Support/calendar";
import { dayComponent, sortedWhere } from "../Support/engine";
import { grouping, rounded } from "../Support/swift";
import { NumberDisplay } from "./NumberDisplay";
import { WeekPlan } from "./WeekPlan";

export type Fatigue_Signal = "performanceRegression" | "effortDrift" | "completionDrop";
export const Fatigue_Signal = {
  /**
   * Reps at the same load falling on two sessions running, on at least
   * two exercises of the same session type.
   */
  performanceRegression: "performanceRegression" as Fatigue_Signal,
  /** Same load and reps, but RIR reported one lower. */
  effortDrift: "effortDrift" as Fatigue_Signal,
  /** Under 80% of the planned sets finished, twice running. */
  completionDrop: "completionDrop" as Fatigue_Signal,
  allCases: ["performanceRegression", "effortDrift", "completionDrop"] as Fatigue_Signal[],
};

/** What one exercise did, in the words the proposal uses as evidence. */
export interface Fatigue_Evidence {
  readonly exerciseName: string;
  readonly detail: string;
}
export const Fatigue_Evidence = {
  make(a: { exerciseName: string; detail: string }): Fatigue_Evidence {
    return { exerciseName: a.exerciseName, detail: a.detail };
  },
};

export interface Fatigue_Reading {
  readonly signals: Set<Fatigue_Signal>;
  readonly evidence: Fatigue_Evidence[];
}
export const Fatigue_Reading = {
  make(a: { signals: Set<Fatigue_Signal>; evidence: Fatigue_Evidence[] }): Fatigue_Reading {
    return { signals: a.signals, evidence: a.evidence };
  },

  /** Two or more signals in the same window, never one. */
  proposes(self: Fatigue_Reading): boolean {
    return self.signals.size >= 2;
  },

  get none(): Fatigue_Reading {
    return { signals: new Set(), evidence: [] };
  },
};

function maxOfNumbers(values: number[]): number | undefined {
  let best: number | undefined;
  for (const v of values) if (best === undefined || v > best) best = v;
  return best;
}
function minOfNumbers(values: number[]): number | undefined {
  let best: number | undefined;
  for (const v of values) if (best === undefined || v < best) best = v;
  return best;
}
function present<T>(values: (T | undefined)[]): T[] {
  return values.filter((v): v is T => v !== undefined);
}

/**
 * Fatigue, read from what was actually logged (TRAINING_LOGIC §11).
 *
 * Nothing here comes from a calendar, a wearable or a questionnaire. Every
 * signal is a pattern in the sets this account wrote down, and no single one
 * proposes anything: two or more inside one week do. The evidence for deloads
 * is thin, which is why Setline never applies one by itself.
 */
export const Fatigue = {
  /** The window the signals have to share, in days. */
  windowDays: 7,

  read(a: { sessions: TrainingSession[]; now?: Date; display?: NumberDisplay }): Fatigue_Reading {
    const now = a.now ?? new Date();
    const display = a.display ?? NumberDisplay.english;
    const recent = sortedWhere(
      a.sessions
        .filter((s) => s.kind === "workout")
        .filter((s) => dayComponent(s.date, now) <= Fatigue.windowDays),
      (l, r) => l.date.getTime() > r.date.getTime(),
    );

    // Two consecutive sessions of the same day are what every signal
    // compares; without them there is nothing to say.
    if (recent.length < 2) return Fatigue_Reading.none;

    const signals = new Set<Fatigue_Signal>();
    const evidence: Fatigue_Evidence[] = [];

    // Swift iterates a Dictionary here, in no fixed order; first-seen
    // (newest first) order stands in for it.
    const byDay = grouping(recent, (s) => s.dayID);
    for (const [, sessions] of byDay) {
      if (sessions.length < 2) continue;
      const newest = sessions[0];
      const previous = sessions[1];

      const regressed: Fatigue_Evidence[] = [];
      const drifted: Fatigue_Evidence[] = [];
      for (const result of newest.results) {
        const before = previous.results.find((r) => r.exerciseID === result.exerciseID);
        if (!before) continue;
        const fell = repsFell(before, result, display);
        if (fell !== undefined) {
          regressed.push(Fatigue_Evidence.make({ exerciseName: result.name, detail: fell }));
        }
        const drift = effortDrifted(before, result, display);
        if (drift !== undefined) {
          signals.add("effortDrift");
          drifted.push(Fatigue_Evidence.make({ exerciseName: "RIR", detail: drift }));
        }
      }
      if (regressed.length >= 2) {
        signals.add("performanceRegression");
        // 18R's order: the first exercise that slipped, what the
        // reserve did, then the next one.
        evidence.push(regressed[0]);
        evidence.push(...drifted);
        evidence.push(...regressed.slice(1, 2));
      } else {
        evidence.push(...drifted);
      }

      if (completionFell(newest) && completionFell(previous)) {
        signals.add("completionDrop");
        evidence.push(Fatigue_Evidence.make({
          exerciseName: newest.dayLabel,
          detail: "Less than 80% of planned sets done, two sessions in a row",
        }));
      }
    }

    return Fatigue_Reading.make({ signals, evidence: evidence.slice(0, 3) });
  },
};

/** Reps down at the same load: "102,5 kg · 6 → 5 reps". */
function repsFell(before: ExerciseResult, after: ExerciseResult, display: NumberDisplay): string | undefined {
  const load = maxOfNumbers(present(after.sets.map((s) => s.weightKg)));
  if (load === undefined) return undefined;
  if (maxOfNumbers(present(before.sets.map((s) => s.weightKg))) !== load) return undefined;
  const reps = maxOfNumbers(after.sets.filter((s) => s.weightKg === load).map((s) => s.reps));
  if (reps === undefined) return undefined;
  const was = maxOfNumbers(before.sets.filter((s) => s.weightKg === load).map((s) => s.reps));
  if (was === undefined || !(reps < was)) return undefined;
  return `${NumberDisplay.kg(display, load)} · ${was} → ${reps} reps`;
}

/** Same work, less left in the tank: "2 → 1". */
function effortDrifted(before: ExerciseResult, after: ExerciseResult, display: NumberDisplay): string | undefined {
  void display;
  const load = maxOfNumbers(present(after.sets.map((s) => s.weightKg)));
  if (load === undefined) return undefined;
  if (maxOfNumbers(present(before.sets.map((s) => s.weightKg))) !== load) return undefined;
  const reps = maxOfNumbers(after.sets.filter((s) => s.weightKg === load).map((s) => s.reps));
  if (reps === undefined) return undefined;
  const wasReps = maxOfNumbers(before.sets.filter((s) => s.weightKg === load).map((s) => s.reps));
  if (wasReps === undefined || reps !== wasReps) return undefined;
  const rir = minOfNumbers(present(after.sets.map((s) => s.rirReported)));
  if (rir === undefined) return undefined;
  const wasRIR = minOfNumbers(present(before.sets.map((s) => s.rirReported)));
  if (wasRIR === undefined || !(wasRIR - rir >= 1)) return undefined;
  return `${wasRIR} → ${rir}`;
}

function completionFell(session: TrainingSession): boolean {
  const planned = session.plannedSetCount;
  const completed = session.completedSetCount;
  if (planned === undefined || !(planned > 0) || completed === undefined) return false;
  return completed / planned < 0.8;
}

/**
 * What Setline offers when the signals agree, and what taking it does
 * (TRAINING_LOGIC §11.2). Never applied on its own, always reversible.
 */
export interface Deload {
  readonly startedAt: Date;
  readonly days: number;
  /** The share of sets removed, as a fraction. */
  readonly setReduction: number;
  readonly rirIncrease: number;
}
export const Deload = {
  make(a: { startedAt: Date; days?: number; setReduction?: number; rirIncrease?: number }): Deload {
    return {
      startedAt: a.startedAt,
      days: a.days ?? 5,
      setReduction: a.setReduction ?? 0.4,
      rirIncrease: a.rirIncrease ?? 2,
    };
  },

  isActive(self: Deload, a: { on: Date }): boolean {
    const ends = addDays(self.startedAt, self.days);
    return a.on.getTime() >= self.startedAt.getTime() && a.on.getTime() < ends.getTime();
  },

  /**
   * Whether a lighter week covers a whole calendar day.
   *
   * `isActive(on:)` answers for an instant, which is what "is one running
   * right now" needs. A date in a week view is midnight, so a deload begun
   * at nine in the morning would not cover its own day. The dates a
   * calendar shows are days, and a lighter week covers days.
   */
  covers(self: Deload, date: Date): boolean {
    const start = startOfDay(self.startedAt);
    const ends = addDays(start, self.days);
    const day = startOfDay(date);
    return day.getTime() >= start.getTime() && day.getTime() < ends.getTime();
  },

  /** Sets are cut, never exercises, so progression state survives. */
  sets(self: Deload, a: { from: number }): number {
    return Math.max(1, Math.trunc(rounded(a.from * (1 - self.setReduction))));
  },

  /**
   * The proposal's own words. 40% fewer sets at two more in reserve, for
   * five days, at the same weight.
   */
  headline(self: Deload): string {
    return `Suggestion: ${self.days} lighter days`;
  },

  detail(self: Deload): string {
    return `Same exercises, ${Math.trunc(self.setReduction * 100)}% fewer sets, RIR +${self.rirIncrease}. Weight stays.`;
  },

  footnote: "Based on your last three sessions, not the calendar.",
};

/**
 * The plan a session opened now works from.
 *
 * A lighter week cuts sets, never exercises (TRAINING_LOGIC §11.2): every
 * exercise stays and keeps its first sets. The session builds its rows from
 * this, and whatever describes today's session before it opens counts from
 * it too — never from the plan as written.
 */
export const SessionPrescription = {
  planned(planned: PlannedExercise, a: { deload?: Deload }): PlannedExercise {
    const deload = a.deload;
    if (deload === undefined) return planned;
    return PlannedExercise.lightened(planned, {
      setsTo: Deload.sets(deload, { from: PlannedExercise.targetSets(planned) }),
    });
  },

  /**
   * The day as a session opened now would lay it out: the same exercises,
   * in the same order, with the lighter week applied where one runs.
   *
   * Everything that previews a date — the card on Training, the Agenda row,
   * the workout preview — builds on this, so what a date shows and what it
   * opens with cannot drift apart.
   */
  day(day: WorkoutDay, a: { deload?: Deload }): WorkoutDay {
    if (a.deload === undefined) return day;
    return { ...day, exercises: day.exercises.map((p) => SessionPrescription.planned(p, { deload: a.deload })) };
  },

  /**
   * Prescribed sets across a day, as a session opened now lays them out.
   * Sets added during a session are never part of a prescription.
   */
  setCount(a: { of: WorkoutDay; deload?: Deload }): number {
    return WeekPlan.sets({ of: SessionPrescription.day(a.of, { deload: a.deload }) });
  },
};
