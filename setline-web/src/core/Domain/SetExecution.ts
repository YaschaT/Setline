import type { LoggedSet } from "./Model";

/**
 * How the reps of a set were performed, as far as measuring it against
 * another set goes (TRAINING_LOGIC §9.2): with no pause, with every rep
 * paused, or with some of them paused — a mixed set, which carries how many.
 *
 * Both clients read it from the same stored fields — `setExecution()` in
 * `lib/set-reps.ts` on the web — and `tests/fixtures/best-set-comparison.json`
 * holds them to it. The paused count stays inside the reps either way: six
 * reps with two paused is a mixed set of six reps.
 */
export interface SetExecution {
  readonly kind: SetExecution_Kind;
  /** How many of the reps carried the pause: none, all of them, or some. */
  readonly pausedReps: number;
  /** The pause in seconds, for a paused or mixed set. */
  readonly pauseSeconds?: number;
}

export type SetExecution_Kind = "touch-and-go" | "paused" | "mixed";
export const SetExecution_Kind = {
  touchAndGo: "touch-and-go" as SetExecution_Kind,
  paused: "paused" as SetExecution_Kind,
  mixed: "mixed" as SetExecution_Kind,
};

export const SetExecution = {
  make(p: { kind: SetExecution_Kind; pausedReps: number; pauseSeconds: number | undefined }): SetExecution {
    return { kind: p.kind, pausedReps: p.pausedReps, pauseSeconds: p.pauseSeconds };
  },

  /**
   * Whether the two sets were performed the same way, so one may be
   * measured against the other: touch-and-go with touch-and-go, a paused
   * set with a paused set of the same pause length (±0.5 s), and a mixed
   * set only with a mixed set that paused the same number of reps for the
   * same length.
   */
  isComparable(self: SetExecution, a: { to: SetExecution }): boolean {
    const other = a.to;
    if (self.kind !== other.kind) return false;
    if (self.kind === "mixed" && self.pausedReps !== other.pausedReps) return false;
    if (self.kind === "touch-and-go") return true;
    return Math.abs((self.pauseSeconds ?? 2) - (other.pauseSeconds ?? 2)) <= 0.5;
  },
};

/**
 * `extension LoggedSet { var execution: SetExecution }` — exposed as
 * `LoggedSet.execution(set)` on the companion in Model.ts.
 *
 * A count that covers every rep is a paused set, and so is the pause
 * modifier without a count — the shape this app writes. A pause without
 * a length is the 2 s `LegacyAdapter` has always read it as.
 */
export function loggedSetExecution(self: LoggedSet): SetExecution {
  const stored = Math.max(self.pausedReps ?? 0, 0);
  const length = self.modifiers.pauseSeconds ?? 2;
  if (self.reps > 0 && stored >= self.reps) {
    return SetExecution.make({ kind: "paused", pausedReps: self.reps, pauseSeconds: length });
  }
  const paused = self.reps > 0 ? stored : 0;
  if (paused > 0) {
    return SetExecution.make({ kind: "mixed", pausedReps: paused, pauseSeconds: length });
  }
  if (self.modifiers.pauseEnabled) {
    return SetExecution.make({ kind: "paused", pausedReps: self.reps, pauseSeconds: length });
  }
  return SetExecution.make({ kind: "touch-and-go", pausedReps: 0, pauseSeconds: undefined });
}
