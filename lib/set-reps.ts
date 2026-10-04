/**
 * How a logged set's reps read — the one rule both clients follow.
 *
 * `reps` is the total reps performed in the set. `pausedReps` says how many of
 * those reps carried the pause. So "120 kg × 6, de laatste 2 gepauzeerd" is
 * `reps: 6, pausedReps: 2`: one set, six reps, two of them paused.
 *
 * The count is therefore **metadata inside the reps, never reps beside them**.
 * It is never added on: six reps with two paused is six reps for the rep
 * count, six for the volume and one completed set — not eight, and not two
 * sets. This app used to sum the two in `completedReps()`, which fed a number
 * nobody performed into progression, PR detection and the strength trend
 * (TRAINING_LOGIC §9 rule 2, "Bug to fix"). The native app has always read the
 * shared state this way; this is the same reading, on this side.
 *
 * Stored rows are untouched by the change: the same JSON now means what it
 * always said it meant. The one shape that reads differently than before is a
 * row with an empty `reps` and a paused count — reps nobody recorded as
 * performed. Both clients read that as an empty set, and the count stays on
 * the row.
 */

/** A logged set, as both clients store one. */
export type SetRepFields = {
  weight?: string | number | null;
  reps?: string | number | null;
  pausedReps?: string | number | null;
  pauseSeconds?: string | number | null;
  pauseEnabled?: boolean;
};

/** A field as a whole count: blank, junk and negatives all read as none. */
function count(value: string | number | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

/**
 * The reps performed in this set, paused ones included — the number that
 * drives progression targets, the strength trend and volume.
 */
export function completedReps(set: SetRepFields): number {
  return count(set.reps);
}

/**
 * How many of those reps were paused: at least one, never more than were
 * performed. A count on a set with no reps yet describes nothing, so it reads
 * as none until the reps are there.
 */
export function pausedReps(set: SetRepFields): number {
  const reps = completedReps(set);
  if (reps <= 0) return 0;
  return Math.min(count(set.pausedReps), reps);
}

/**
 * How the reps of a set were performed, as far as measuring it against
 * another set goes (TRAINING_LOGIC §9.2): with no pause, with every rep
 * paused, or with some of them paused — a mixed set, which carries how many.
 *
 * Read from the stored fields exactly as the native app reads them
 * (`LoggedSet.execution`, through `LegacyAdapter`): a count that covers every
 * rep is a paused set, and so is the pause flag without a count — the shape
 * the native app writes. A pause without a length reads as the 2 s the native
 * app has always assumed. The count stays inside the reps either way: six
 * reps with two paused is a mixed set of six reps.
 */
export type SetExecution = {
  kind: "touch-and-go" | "paused" | "mixed";
  /** How many of the reps carried the pause: none, all of them, or some. */
  pausedReps: number;
  /** The pause in seconds, for a paused or mixed set. */
  pauseSeconds: number | null;
};

/** A stored pause length: "2", 2, "2,5". Blank and junk are no length. */
function seconds(value: string | number | null | undefined): number | null {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function setExecution(set: SetRepFields): SetExecution {
  const reps = completedReps(set);
  const stored = count(set.pausedReps);
  const length = seconds(set.pauseSeconds);
  const everyRep = reps > 0 && stored >= reps;
  const pauseOn =
    everyRep || (typeof set.pauseEnabled === "boolean" ? set.pauseEnabled : stored > 0 || (length ?? 0) > 0);
  const pause = pauseOn ? (length ?? 2) : 2;
  if (everyRep) return { kind: "paused", pausedReps: reps, pauseSeconds: pause };
  const paused = pausedReps(set);
  if (paused > 0) return { kind: "mixed", pausedReps: paused, pauseSeconds: pause };
  if (pauseOn) return { kind: "paused", pausedReps: reps, pauseSeconds: pause };
  return { kind: "touch-and-go", pausedReps: 0, pauseSeconds: null };
}

/**
 * Whether two sets were performed the same way, so one may be measured
 * against the other: touch-and-go with touch-and-go, a paused set with a
 * paused set of the same pause length (±0.5 s), and a mixed set only with a
 * mixed set that paused the same number of reps for the same length.
 */
export function sameExecution(a: SetExecution, b: SetExecution): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "mixed" && a.pausedReps !== b.pausedReps) return false;
  if (a.kind === "touch-and-go") return true;
  return Math.abs((a.pauseSeconds ?? 2) - (b.pauseSeconds ?? 2)) <= 0.5;
}

/**
 * The same set with its paused count brought back inside the reps, for the
 * moment a number is typed. A count is left alone while the reps field is
 * still empty: the two are typed in either order, and clearing one must not
 * quietly erase the other.
 */
export function boundPausedReps<T extends SetRepFields>(set: T): T {
  const reps = completedReps(set);
  if (reps <= 0) return set;
  if (count(set.pausedReps) <= reps) return set;
  return { ...set, pausedReps: String(reps) };
}

/**
 * What a logged set says in one line: "6 reps", or the reps of it that were
 * paused, with the pause length where the set carries one.
 */
export function setSummary(set: SetRepFields): string {
  const reps = completedReps(set);
  const paused = pausedReps(set);
  if (!paused) return `${reps} reps`;
  const seconds = set.pauseSeconds ? ` · ${set.pauseSeconds}s` : "";
  return `${reps} reps · ${paused} paused${seconds}`;
}
