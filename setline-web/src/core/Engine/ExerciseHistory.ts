import { LoggedSet, type TrainingSession } from "../Domain/Model";
import { SetModifiers } from "../Domain/Vocabulary";
import { deepEqual, maxBy, rounded } from "../Support/swift";
import { formatFixed, sortedWhere } from "../Support/engine";
import { Estimates } from "./Estimates";

/** One past appearance of an exercise, reduced to what the engine compares. */
export interface ExerciseAppearance {
  readonly date: Date;
  readonly sets: LoggedSet[];
}
export const ExerciseAppearance = {
  make(a: { date: Date; sets: LoggedSet[] }): ExerciseAppearance {
    return { date: a.date, sets: a.sets };
  },

  topSet(self: ExerciseAppearance): LoggedSet | undefined {
    return maxBy(self.sets.filter((s) => LoggedSet.countsTowardProgression(s)), (lhs, rhs) => {
      const l = Estimates.e1RM({ weightKg: lhs.weightKg ?? 0, reps: lhs.reps }) ?? (lhs.weightKg ?? 0);
      const r = Estimates.e1RM({ weightKg: rhs.weightKg ?? 0, reps: rhs.reps }) ?? (rhs.weightKg ?? 0);
      return l < r;
    });
  },
};

/**
 * One comparable series of an exercise: the sets that may be compared to
 * each other, and how much of it the account has.
 *
 * An exercise can hold more than one. Bench pressed touch-and-go and
 * bench pressed with a two-second pause are two series of the same
 * exercise (§9.2), and a screen that shows one of them has to know which.
 */
export interface ExerciseHistory_Series {
  readonly modifiers: SetModifiers;
  readonly sessions: number;
  readonly lastTrained: Date;
}
export const ExerciseHistory_Series = {
  make(a: { modifiers: SetModifiers; sessions: number; lastTrained: Date }): ExerciseHistory_Series {
    return { modifiers: a.modifiers, sessions: a.sessions, lastTrained: a.lastTrained };
  },

  /** How a reader tells two series of one exercise apart. */
  label(self: ExerciseHistory_Series): string {
    const parts: string[] = [];
    if (self.modifiers.pauseEnabled) {
      const seconds = self.modifiers.pauseSeconds ?? 2;
      const whole = seconds === rounded(seconds) ? String(Math.trunc(seconds)) : formatFixed(seconds, 1);
      parts.push(`paused · ${whole} s`);
    } else {
      parts.push("no pause");
    }
    if (self.modifiers.restrictedROM) parts.push("partial ROM");
    return parts.join(" · ");
  },
};

/**
 * The comparability rule from TRAINING_LOGIC §1, applied once, here.
 *
 * "Two sets may be compared (for progression, PR or trend) only when
 * exerciseId, modifiers and unilateral all match. This one rule prevents
 * most of the wrong-number bugs in a training app."
 */
export interface ExerciseHistory {
  readonly exerciseID: string;
  readonly modifiers: SetModifiers;
  readonly appearances: ExerciseAppearance[];
}
export const ExerciseHistory = {
  make(a: { exerciseID: string; modifiers: SetModifiers; appearances: ExerciseAppearance[] }): ExerciseHistory {
    return { exerciseID: a.exerciseID, modifiers: a.modifiers, appearances: a.appearances };
  },

  /**
   * Builds the comparable history for one exercise, newest first.
   *
   * Sets logged on a substitute belong to the substitute's own series and
   * never enter the origin exercise's history (§12.5).
   */
  build(a: { exerciseID: string; modifiers: SetModifiers; from: TrainingSession[]; before?: Date }): ExerciseHistory {
    const { exerciseID, modifiers } = a;
    const cutoff = a.before;
    const appearances: ExerciseAppearance[] = [];
    for (const session of a.from) {
      if (session.kind !== "workout") continue;
      if (cutoff !== undefined && !(session.date.getTime() < cutoff.getTime())) continue;
      const result = session.results.find((r) => r.exerciseID === exerciseID);
      if (!result) continue;
      const comparable = result.sets.filter(
        (s) => LoggedSet.countsTowardProgression(s) && SetModifiers.isComparable(s.modifiers, { to: modifiers }),
      );
      if (comparable.length === 0) continue;
      appearances.push(ExerciseAppearance.make({ date: session.date, sets: comparable }));
    }
    const sorted = sortedWhere(appearances, (l, r) => l.date.getTime() > r.date.getTime());
    return ExerciseHistory.make({ exerciseID, modifiers, appearances: sorted });
  },

  mostRecent(self: ExerciseHistory): ExerciseAppearance | undefined {
    return self.appearances[0];
  },

  /**
   * Every series this account has for one exercise, the one it has most of
   * first (ties to the one trained most recently).
   *
   * Sets that belong to no series — a mix of paused and unpaused reps, a
   * technical breakdown, a warm-up — are in none of them, exactly as they
   * are in no progression.
   */
  series(a: { exerciseID: string; from: TrainingSession[] }): ExerciseHistory_Series[] {
    // Swift keys a dictionary by the modifiers; its iteration order is
    // unspecified, so first-seen order stands in for it here.
    const found: { key: SetModifiers; sessions: number; last: Date }[] = [];

    for (const session of a.from) {
      if (session.kind !== "workout") continue;
      const result = session.results.find((r) => r.exerciseID === a.exerciseID);
      if (!result) continue;
      const seenHere: SetModifiers[] = [];
      for (const set of result.sets) {
        if (!LoggedSet.countsTowardProgression(set)) continue;
        // Pause length is compared with a tolerance, so a series is
        // keyed by the first shape that matched it rather than by an
        // exact 2.0 vs 2.0000001.
        const key = found.find((f) => SetModifiers.isComparable(f.key, { to: set.modifiers }))?.key ?? set.modifiers;
        if (seenHere.some((k) => deepEqual(k, key))) continue;
        seenHere.push(key);
        const held = found.find((f) => deepEqual(f.key, key));
        if (held) {
          held.sessions += 1;
          held.last = new Date(Math.max(held.last.getTime(), session.date.getTime()));
        } else {
          found.push({ key, sessions: 1, last: session.date });
        }
      }
    }

    return sortedWhere(
      found.map((f) => ExerciseHistory_Series.make({ modifiers: f.key, sessions: f.sessions, lastTrained: f.last })),
      (left, right) => {
        if (left.sessions !== right.sessions) return left.sessions > right.sessions;
        if (left.lastTrained.getTime() !== right.lastTrained.getTime()) {
          return left.lastTrained.getTime() > right.lastTrained.getTime();
        }
        return !left.modifiers.pauseEnabled && right.modifiers.pauseEnabled;
      },
    );
  },

  /**
   * Sets the reference gate. No proposal and no record until three
   * comparable sessions exist (§10.2 guard 4; design 28b/29b "Referentie
   * opbouwen · sessie N van 3").
   */
  sessionsBeforeReference: 3,

  hasReference(self: ExerciseHistory): boolean {
    return self.appearances.length >= ExerciseHistory.sessionsBeforeReference;
  },

  /**
   * 1-based position in the reference build-up, for the copy
   * "Referentie opbouwen · sessie 2 van 3".
   */
  referenceSessionNumber(self: ExerciseHistory): number {
    return Math.min(self.appearances.length + 1, ExerciseHistory.sessionsBeforeReference);
  },
};
