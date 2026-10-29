import { ExerciseCatalog } from "../Catalog/ExerciseCatalog";
import type { LoggedSet, TrainingSession, WorkoutDay } from "../Domain/Model";
import { SetModifiers } from "../Domain/Vocabulary";
import { Estimates } from "../Engine/Estimates";
import { ExerciseAppearance, ExerciseHistory } from "../Engine/ExerciseHistory";
import { LegacyAdapter } from "../Legacy/LegacyAdapter";
import { addWeeks, timeIntervalSince } from "../Support/calendar";
import { dayComponent, sortedWhere } from "../Support/engine";
import { dec, maxBy, minBy, rounded } from "../Support/swift";

// Artboard 20 · Progressie, segment Kracht: one exercise's strength over time.
//
// Comparability is settled before anything is drawn. `ExerciseHistory` applies
// the one rule from TRAINING_LOGIC §1 — same exercise, same modifiers, no
// warm-ups, no technical breakdowns, no work logged on a substitute — so every
// point on the chart and every row in the list belongs to the same series.

export interface StrengthProgress_Point {
  date: Date;
  estimate: number;
}

export const StrengthProgress_Point = {
  make(a: { date: Date; estimate: number }): StrengthProgress_Point {
    return { date: a.date, estimate: a.estimate };
  },
};

/**
 * Movement over the window the screen can actually show. 40a names the
 * date it is measured from — "+6,2 kg sinds 13 jul" — because a reader
 * can place a date and cannot place "in 8 weken"; the weeks are still
 * counted, never assumed, for anything that wants a span.
 */
export interface StrengthProgress_Change {
  value: number;
  weeks: number;
  /** The session the comparison starts at, and what was estimated there. */
  since: Date;
  baseline: number;
}

export const StrengthProgress_Change = {
  make(a: { value: number; weeks: number; since: Date; baseline: number }): StrengthProgress_Change {
    return { value: a.value, weeks: a.weeks, since: a.since, baseline: a.baseline };
  },
};

/**
 * The set the current estimate was computed from (40a's source line, and
 * the first row of 40e). It is a set that was really performed: the
 * estimate is derived from it and was never itself lifted.
 */
export interface StrengthProgress_SourceSet {
  date: Date;
  weightKg: number;
  reps: number;
}

export const StrengthProgress_SourceSet = {
  make(a: { date: Date; weightKg: number; reps: number }): StrengthProgress_SourceSet {
    return { date: a.date, weightKg: a.weightKg, reps: a.reps };
  },
};

/** What the trailing edge of a session row states. */
export type StrengthProgress_Marker =
  /** Heaviest load this exercise has carried (§10.1, Load PR). */
  | { kind: "record" }
  /** Load against the session before it. */
  | { kind: "delta"; value: number }
  | { kind: "same" }
  /**
   * Inside the three-session reference period, where no record counts
   * (§10.2 guard 4).
   */
  | { kind: "building"; session: number; of: number };

export interface StrengthProgress_SessionRow {
  id: string;
  date: Date;
  dayLabel: string;
  setCount: number;
  weightKg: number;
  reps: number;
  marker: StrengthProgress_Marker;
}

export const StrengthProgress_SessionRow = {
  make(a: {
    id: string;
    date: Date;
    dayLabel: string;
    setCount: number;
    weightKg: number;
    reps: number;
    marker: StrengthProgress_Marker;
  }): StrengthProgress_SessionRow {
    return {
      id: a.id,
      date: a.date,
      dayLabel: a.dayLabel,
      setCount: a.setCount,
      weightKg: a.weightKg,
      reps: a.reps,
      marker: a.marker,
    };
  },
};

export interface StrengthProgress {
  exerciseID: string;
  name: string;
  /**
   * `nil` when the most recent work holds no set of ≤10 reps: above that the
   * estimate is not honest enough to show (§10.2 guard 2).
   */
  estimate?: number;
  change?: StrengthProgress_Change;
  /** `nil` when there is no estimate to explain. */
  source?: StrengthProgress_SourceSet;
  points: StrengthProgress_Point[];
  /** Newest first, as the artboard lists them. */
  rows: StrengthProgress_SessionRow[];
  sessionCount: number;
}

export const StrengthProgress = {
  /**
   * The change as a screen may state it: the difference between the two
   * numbers it actually shows, each rounded to the step a gym has.
   *
   * Rounding both ends and subtracting keeps 126,5 − 120,5 = 6 — the
   * arithmetic a reader can do on the explanation sheet (40e) — where
   * rounding the exact difference would print 6,5 beside two numbers that
   * differ by 6. `change.value` stays exact for anything that computes.
   */
  shownChange(self: StrengthProgress, a: { toIncrement?: number } = {}): number | undefined {
    const increment = a.toIncrement ?? 0.5;
    const change = self.change;
    const estimate = self.estimate;
    if (change === undefined || estimate === undefined) return undefined;
    return dec(
      Estimates.round(estimate, { toIncrement: increment }) - Estimates.round(change.baseline, { toIncrement: increment }),
    );
  },

  hasReference(self: StrengthProgress): boolean {
    return self.sessionCount >= ExerciseHistory.sessionsBeforeReference;
  },
  /** "Referentie opbouwen · sessie 2 van 3" while the series is too short. */
  referenceSessionNumber(self: StrengthProgress): number {
    return Math.min(self.sessionCount + 1, ExerciseHistory.sessionsBeforeReference);
  },

  /**
   * Eight weeks is the window the design states; a shorter history reports
   * the span it really has.
   */
  changeWindowWeeks: 8,

  make(a: { exerciseID: string; name: string; modifiers?: SetModifiers; sessions: TrainingSession[] }): StrengthProgress {
    const exerciseID = a.exerciseID;
    const history = ExerciseHistory.build({
      exerciseID,
      modifiers: a.modifiers ?? SetModifiers.none,
      from: a.sessions,
    });
    // Oldest first: a record is only a record against what came before it.
    const appearances = [...history.appearances].reverse();
    const sessionsByDate = new Map<number, TrainingSession[]>();
    for (const session of a.sessions) {
      const key = session.date.getTime();
      const list = sessionsByDate.get(key);
      if (list) list.push(session);
      else sessionsByDate.set(key, [session]);
    }

    const points: StrengthProgress_Point[] = [];
    const rows: StrengthProgress_SessionRow[] = [];
    let heaviestSoFar = 0;
    let previousTopLoad: number | undefined;

    let source: StrengthProgress_SourceSet | undefined;

    appearances.forEach((appearance, index) => {
      const top = ExerciseAppearance.topSet(appearance);
      const load = top?.weightKg;
      if (top === undefined || load === undefined) return;
      const best = StrengthProgress.bestSet({ in: appearance.sets });
      if (best !== undefined && best.estimate !== undefined) {
        points.push(StrengthProgress_Point.make({ date: appearance.date, estimate: best.estimate }));
        // The newest session with an estimate wins, because that is
        // the estimate the screen states.
        source = StrengthProgress_SourceSet.make({ date: appearance.date, weightKg: best.weightKg, reps: best.reps });
      }

      let marker: StrengthProgress_Marker;
      if (index < ExerciseHistory.sessionsBeforeReference) {
        marker = { kind: "building", session: index + 1, of: ExerciseHistory.sessionsBeforeReference };
      } else if (load > heaviestSoFar + Estimates.epsilonKg) {
        marker = { kind: "record" };
      } else if (previousTopLoad !== undefined) {
        const difference = dec(load - previousTopLoad);
        marker = Math.abs(difference) <= Estimates.epsilonKg ? { kind: "same" } : { kind: "delta", value: difference };
      } else {
        marker = { kind: "same" };
      }

      const session = (sessionsByDate.get(appearance.date.getTime()) ?? []).find((s) => s.kind === "workout");
      rows.push(
        StrengthProgress_SessionRow.make({
          id: (session?.id ?? LegacyAdapter.isoString(appearance.date)) + ":" + exerciseID,
          date: appearance.date,
          dayLabel: session?.dayLabel ?? "",
          setCount: appearance.sets.length,
          weightKg: load,
          reps: top.reps,
          marker,
        }),
      );

      heaviestSoFar = Math.max(heaviestSoFar, load);
      previousTopLoad = load;
    });

    return {
      exerciseID,
      name: a.name,
      estimate: points[points.length - 1]?.estimate,
      change: StrengthProgress.change({ in: points }),
      source,
      points,
      rows: [...rows].reverse(),
      sessionCount: appearances.length,
    };
  },

  /** The best estimate one session offers, over its comparable sets. */
  bestEstimate(a: { in: LoggedSet[] }): number | undefined {
    return StrengthProgress.bestSet({ in: a.in })?.estimate;
  },

  /** The set that estimate came from, so the screen can say which one it was. */
  bestSet(a: { in: LoggedSet[] }): { weightKg: number; reps: number; estimate: number | undefined } | undefined {
    return maxBy(
      a.in
        .map((set) => ({
          weightKg: set.weightKg ?? 0,
          reps: set.reps,
          estimate: Estimates.e1RM({ weightKg: set.weightKg ?? 0, reps: set.reps }),
        }))
        .filter((entry) => entry.estimate !== undefined),
      (x, y) => (x.estimate ?? 0) < (y.estimate ?? 0),
    );
  },

  /**
   * Against the session nearest to eight weeks back — before or after it,
   * whichever is closer, so a gap in training does not stretch the window
   * the screen names.
   */
  change(a: { in: StrengthProgress_Point[] }): StrengthProgress_Change | undefined {
    const points = a.in;
    const latest = points[points.length - 1];
    if (latest === undefined || !(points.length > 1)) return undefined;
    const windowStart = addWeeks(latest.date, -StrengthProgress.changeWindowWeeks);
    const earlier = points.slice(0, -1);
    const baseline = minBy(
      earlier,
      (x, y) => Math.abs(timeIntervalSince(x.date, windowStart)) < Math.abs(timeIntervalSince(y.date, windowStart)),
    );
    if (baseline === undefined) return undefined;
    if (!(baseline.date.getTime() < latest.date.getTime())) return undefined;

    const days = dayComponent(baseline.date, latest.date);
    return StrengthProgress_Change.make({
      value: dec(latest.estimate - baseline.estimate),
      weeks: Math.max(1, Math.trunc(rounded(days / 7))),
      since: baseline.date,
      baseline: baseline.estimate,
    });
  },
};

// Which exercises the Kracht segment offers, and in which order.

export interface StrengthSelection_Choice {
  exerciseID: string;
  name: string;
  modifiers: SetModifiers;
}

export const StrengthSelection_Choice = {
  make(a: { exerciseID: string; name: string; modifiers: SetModifiers }): StrengthSelection_Choice {
    return { exerciseID: a.exerciseID, name: a.name, modifiers: a.modifiers };
  },
  id(self: StrengthSelection_Choice): string {
    return self.exerciseID;
  },
};

export const StrengthSelection = {
  /**
   * Only exercises with enough comparable history to say anything, the
   * current plan's primary lifts first, then the most recently trained.
   * Ties break on name, so the row never reshuffles between launches.
   */
  choices(a: { sessions: TrainingSession[]; plan: WorkoutDay[] }): StrengthSelection_Choice[] {
    const planned = a.plan.flatMap((day) => day.exercises);
    const seen = new Set<string>();
    const candidates: { choice: StrengthSelection_Choice; isPrimary: boolean; planIndex: number; lastTrained: Date }[] = [];

    for (const session of a.sessions.filter((s) => s.kind === "workout")) {
      for (const result of session.results) {
        if (seen.has(result.exerciseID)) continue;
        const plannedExercise = planned.find((exercise) => exercise.exerciseID === result.exerciseID);
        const modifiers = plannedExercise?.modifiers ?? SetModifiers.none;
        const history = ExerciseHistory.build({
          exerciseID: result.exerciseID,
          modifiers,
          from: a.sessions,
        });
        const lastTrained = ExerciseHistory.mostRecent(history)?.date;
        if (!ExerciseHistory.hasReference(history) || lastTrained === undefined) continue;
        seen.add(result.exerciseID);

        const name = ExerciseCatalog.exercise(result.exerciseID)?.name ?? result.name;
        const planIndex = planned.findIndex((exercise) => exercise.exerciseID === result.exerciseID);
        candidates.push({
          choice: StrengthSelection_Choice.make({ exerciseID: result.exerciseID, name, modifiers }),
          isPrimary: plannedExercise?.role === "primaryStrength",
          planIndex: planIndex === -1 ? Number.MAX_SAFE_INTEGER : planIndex,
          lastTrained,
        });
      }
    }

    return sortedWhere(candidates, (lhs, rhs) => {
      if (lhs.isPrimary !== rhs.isPrimary) return lhs.isPrimary;
      if (lhs.isPrimary && lhs.planIndex !== rhs.planIndex) return lhs.planIndex < rhs.planIndex;
      if (lhs.lastTrained.getTime() !== rhs.lastTrained.getTime()) return lhs.lastTrained.getTime() > rhs.lastTrained.getTime();
      return lhs.choice.name < rhs.choice.name;
    }).map((candidate) => candidate.choice);
  },
};
