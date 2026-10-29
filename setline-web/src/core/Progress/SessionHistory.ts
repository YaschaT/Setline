import type { TrainingSession } from "../Domain/Model";
import { RecordsEngine } from "../Engine/RecordsEngine";

// Artboard 20 · segment Historiek, row shape from the ≥1024 layout (27):
// `Push A · 7 sep` / `18/18 · 53 min` / `6.480 kg`.
//
// A row states only what the session stored. Sessions logged before set
// counts were recorded keep their percentage, and a session with no recorded
// duration says nothing about time rather than inventing one.

export interface SessionHistoryRow_Counts {
  completed: number;
  planned: number;
}

export const SessionHistoryRow_Counts = {
  make(a: { completed: number; planned: number }): SessionHistoryRow_Counts {
    return { completed: a.completed, planned: a.planned };
  },
};

export interface SessionHistoryRow {
  id: string;
  date: Date;
  dayLabel: string;
  volumeKg: number;
  /** Prescribed working sets, when the session recorded them. */
  counts?: SessionHistoryRow_Counts;
  /** What older sessions carry instead: the percentage as it was stored. */
  completionPercent?: number;
  /** `nil` when the session never recorded one. */
  durationSeconds?: number;
}

export const SessionHistoryRow = {
  make(a: {
    id: string;
    date: Date;
    dayLabel: string;
    volumeKg: number;
    counts: SessionHistoryRow_Counts | undefined;
    completionPercent: number | undefined;
    durationSeconds: number | undefined;
  }): SessionHistoryRow {
    return {
      id: a.id,
      date: a.date,
      dayLabel: a.dayLabel,
      volumeKg: a.volumeKg,
      counts: a.counts,
      completionPercent: a.completionPercent,
      durationSeconds: a.durationSeconds,
    };
  },
};

export const SessionHistory = {
  /**
   * Every workout this account holds, newest first.
   *
   * Recovery days are not workouts and stay out of this list; they have
   * their own place in the design.
   */
  rows(a: { from: TrainingSession[] }): SessionHistoryRow[] {
    return a.from
      .filter((session) => session.kind === "workout")
      .sort((x, y) => y.date.getTime() - x.date.getTime())
      .map((session) =>
        SessionHistoryRow.make({
          id: session.id,
          date: session.date,
          dayLabel: session.dayLabel,
          volumeKg: RecordsEngine.volumeLoad(session.results.flatMap((result) => result.sets)),
          counts: SessionHistory.counts({ of: session }),
          completionPercent: SessionHistory.counts({ of: session }) === undefined ? session.completion : undefined,
          durationSeconds:
            session.durationSeconds === undefined ? undefined : session.durationSeconds > 0 ? session.durationSeconds : undefined,
        }),
      );
  },

  /** Both numbers, or neither: half a fraction says nothing. */
  counts(a: { of: TrainingSession }): SessionHistoryRow_Counts | undefined {
    const planned = a.of.plannedSetCount;
    const completed = a.of.completedSetCount;
    if (planned === undefined || completed === undefined || !(planned > 0) || !(completed >= 0 && completed <= planned)) {
      return undefined;
    }
    return SessionHistoryRow_Counts.make({ completed, planned });
  },
};
