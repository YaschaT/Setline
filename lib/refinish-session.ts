import { DERIVED_SESSION_FIELDS, sameJson } from "@/lib/state-merge";

/**
 * Finishing a workout again on a day that already has one.
 *
 * The page rebuilds a day from its own plan, but the saved session can hold
 * more than that plan lists: iOS logs a temporary swap under the substitute, a
 * program replacement under the new exercise and a custom exercise under its
 * own id, and it stores fields this page has never heard of. Finishing again
 * may only change what was typed this time. Removing an exercise from a saved
 * session stays an explicit edit, made in the session editor.
 */

type ResultLike = { exerciseId: string; sets?: readonly unknown[] };

/**
 * `rows` are the page's rows for the day's planned exercises, in plan order.
 *
 * - A row with sets holds what was typed this time. It replaces every saved
 *   result for that exercise.
 * - A row without sets was left alone. That exercise keeps exactly what was
 *   saved, or stays an empty row if nothing was.
 * - Saved results for exercises the plan does not list follow, as saved.
 */
export function refinishResults<R extends ResultLike>(saved: readonly R[], rows: readonly R[]): R[] {
  const planned = new Set(rows.map((row) => row.exerciseId));
  const results = rows.flatMap((row) => {
    if ((row.sets?.length ?? 0) > 0) return [row];
    const kept = saved.filter((result) => result.exerciseId === row.exerciseId);
    return kept.length > 0 ? kept : [row];
  });
  return [...results, ...saved.filter((result) => !planned.has(result.exerciseId))];
}

type SessionLike = { results: ResultLike[]; dayId: string; dayLabel: string; completion: number };

/**
 * The saved session with this finish applied. Every field the page does not
 * set is kept. The set counts iOS derived from the old results are dropped once
 * the results change, because they no longer describe them.
 */
export function refinishSession<S extends SessionLike>(
  existing: S,
  update: Pick<S, "dayId" | "dayLabel" | "completion"> & { rows: S["results"] },
): S {
  const results = refinishResults(existing.results, update.rows);
  const session = { ...existing, dayId: update.dayId, dayLabel: update.dayLabel, completion: update.completion, results };
  if (!sameJson(asStored(existing.results), asStored(results))) {
    for (const field of DERIVED_SESSION_FIELDS) delete (session as unknown as Record<string, unknown>)[field];
  }
  return session;
}

/** As it would be stored: `undefined` disappears. */
function asStored(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null));
}
