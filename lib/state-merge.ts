/**
 * How a web save joins the one shared training state without destroying what
 * another client wrote.
 *
 * Both Setline clients follow the same loop: fetch the latest stored state,
 * apply only their own intended changes to it, write it back only if nobody
 * wrote in the meantime, and otherwise fetch again and reapply. This module is
 * the "apply only our changes" step for the web app; `lib/cloud-state.ts` runs
 * the loop. The iOS app implements the same rules in SetlineCore
 * (`Sync/StateMerge.swift`), and `tests/fixtures/sync` holds scenarios both
 * implementations are tested against.
 *
 * Three rules keep deletion honest:
 * - A key or field a client does not know about is never removed by it.
 * - A client only deletes what it can prove it had: an item present in the
 *   state its snapshot descends from, and missing from the snapshot now.
 * - A deleted item leaves a tombstone, so an older copy cannot bring it back.
 *
 * The page hands over its whole React state on every save. What it changed is
 * the difference between that snapshot and the state it descends from — never
 * the difference between the snapshot and whatever is stored now.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export const TOMBSTONES_KEY = "syncTombstones";
export const RESET_KEY = "syncReset";

/** Long enough for any device to come back online; short enough not to grow forever. */
const TOMBSTONE_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

/** Whole values the web app owns: a change replaces the value. */
export const WEB_VALUE_KEYS = [
  "plan",
  "planMode",
  "sciencePlanId",
  "planSchemaVersion",
  "targets",
  "recoveryDraft",
] as const;

/** Objects the web app owns entry by entry. */
export const WEB_MAP_KEYS = ["scheduleOverrides", "completed", "performance"] as const;

/** Lists of items with an `id`, merged item by item and field by field. */
export const WEB_COLLECTION_KEYS = ["sessions", "metrics", "nutritionEntries", "chatMessages"] as const;

export type CollectionKey = (typeof WEB_COLLECTION_KEYS)[number];

/** The fields of each item the web app knows — and therefore the only ones it may change or remove. */
export const WEB_ITEM_FIELDS: Record<CollectionKey, readonly string[]> = {
  sessions: ["id", "date", "dayId", "dayLabel", "completion", "sessionType", "results", "recovery"],
  metrics: ["id", "date", "weight", "waist"],
  nutritionEntries: ["id", "date", "meal", "name", "calories", "protein", "carbs", "fat"],
  chatMessages: ["id", "role", "content", "changes", "applied"],
};

/** Set counts iOS derives from a session's results. They are wrong once another client rewrites those results. */
export const DERIVED_SESSION_FIELDS = ["iosPlannedSetCount", "iosCompletedSetCount"] as const;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** React state to stored JSON: `undefined` disappears exactly as it would in storage. */
export function toJson(value: unknown): JsonObject {
  const parsed: unknown = JSON.parse(JSON.stringify(value ?? {}));
  return isObject(parsed) ? parsed : {};
}

export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, index) => sameJson(item, b[index]));
  }
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => has(b, key) && sameJson(a[key], b[key]));
  }
  return false;
}

function has(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function clone<T extends Json>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function itemId(item: Json | undefined): string | null {
  return isObject(item) && typeof item.id === "string" && item.id.length > 0 ? item.id : null;
}

function indexOfId(items: Json[], id: string): number {
  return items.findIndex((item) => itemId(item) === id);
}

/** When the account was explicitly wiped, if it was. */
export function resetTime(state: JsonObject): number | null {
  const reset = state[RESET_KEY];
  if (!isObject(reset) || typeof reset.at !== "string") return null;
  const at = Date.parse(reset.at);
  return Number.isNaN(at) ? null : at;
}

function tombstoneLists(state: JsonObject): JsonObject {
  const value = state[TOMBSTONES_KEY];
  return isObject(value) ? value : {};
}

export function isTombstoned(state: JsonObject, key: string, id: string): boolean {
  const list = tombstoneLists(state)[key];
  return isObject(list) && typeof list[id] === "string";
}

function addTombstone(state: JsonObject, key: string, id: string, now: string): void {
  const lists = tombstoneLists(state);
  const list = isObject(lists[key]) ? lists[key] : {};
  state[TOMBSTONES_KEY] = { ...lists, [key]: { ...list, [id]: now } };
}

function pruneTombstones(state: JsonObject, now: string): void {
  const cutoff = Date.parse(now) - TOMBSTONE_RETENTION_MS;
  const kept: JsonObject = {};
  for (const [key, list] of Object.entries(tombstoneLists(state))) {
    if (!isObject(list)) continue;
    const entries = Object.entries(list).filter(([, at]) => typeof at === "string" && Date.parse(at) >= cutoff);
    if (entries.length > 0) kept[key] = Object.fromEntries(entries);
  }
  state[TOMBSTONES_KEY] = kept;
}

/** Places a new item after its nearest predecessor in the snapshot, so the page's own order survives. */
function insertInSnapshotOrder(target: Json[], item: JsonObject, snapshotItems: Json[], position: number): void {
  for (let index = position - 1; index >= 0; index -= 1) {
    const neighbour = itemId(snapshotItems[index]);
    if (!neighbour) continue;
    const at = indexOfId(target, neighbour);
    if (at !== -1) {
      target.splice(at + 1, 0, clone(item));
      return;
    }
  }
  target.splice(0, 0, clone(item));
}

/**
 * Applies the web-known fields the page changed. Without a prior copy of the
 * item nothing is overwritten: only fields the stored item lacks are added.
 * A session's results are merged exercise by exercise (see `mergeResults`).
 */
function applyItemFields(target: JsonObject, prior: JsonObject | undefined, item: JsonObject, key: CollectionKey): boolean {
  let changed = false;
  for (const field of WEB_ITEM_FIELDS[key]) {
    const nextHas = has(item, field);
    if (!prior) {
      if (nextHas && !has(target, field)) {
        target[field] = clone(item[field]);
        changed = true;
      }
      continue;
    }
    if (has(prior, field) === nextHas && sameJson(prior[field], item[field])) continue;
    if (key === "sessions" && field === "results") {
      const before = prior[field];
      const next = item[field];
      const stored = target[field];
      if (Array.isArray(before) && Array.isArray(next) && Array.isArray(stored)) {
        const results = mergeResults(before, next, stored);
        if (sameJson(results, stored)) continue;
        target[field] = results;
        for (const derived of DERIVED_SESSION_FIELDS) delete target[derived];
        changed = true;
        continue;
      }
    }
    if (nextHas) {
      if (has(target, field) && sameJson(target[field], item[field])) continue;
      target[field] = clone(item[field]);
    } else {
      if (!has(target, field)) continue;
      delete target[field];
    }
    changed = true;
    if (key === "sessions" && field === "results") {
      for (const derived of DERIVED_SESSION_FIELDS) delete target[derived];
    }
  }
  return changed;
}

/**
 * A session's results, exercise by exercise.
 *
 * The page's results are compared with the ones it started from. An exercise
 * it typed or changed is written, and one it removed is removed. One it left
 * alone keeps whatever is stored now — which may be newer, or gone because
 * someone removed it. An exercise the page did not start with never replaces
 * a stored one, and stored exercises the page never had are kept.
 */
function mergeResults(before: Json[], next: Json[], stored: Json[]): Json[] {
  const started = resultsByExercise(before);
  const latest = resultsByExercise(stored);
  const merged: Json[] = [];
  const placed = new Set<string>();

  for (const [key, result] of resultsByExercise(next)) {
    placed.add(key);
    const original = started.get(key);
    const current = latest.get(key);
    if (original === undefined) {
      merged.push(clone(current !== undefined ? current : result));
    } else if (current !== undefined) {
      merged.push(clone(sameJson(original, result) ? current : result));
    }
    // Otherwise it was removed elsewhere since: carrying it along or editing
    // it here does not bring it back.
  }
  for (const [key, result] of latest) {
    if (!placed.has(key) && !started.has(key)) merged.push(clone(result));
  }
  return merged;
}

/** Results keyed by exercise, with repeats of one exercise counted in order. */
function resultsByExercise(results: Json[]): Map<string, Json> {
  const repeats = new Map<string, number>();
  const keyed = new Map<string, Json>();
  results.forEach((result, position) => {
    if (!isObject(result) || typeof result.exerciseId !== "string") {
      keyed.set(` ${position}`, result);
      return;
    }
    const seen = repeats.get(result.exerciseId) ?? 0;
    repeats.set(result.exerciseId, seen + 1);
    keyed.set(`${result.exerciseId}#${seen}`, result);
  });
  return keyed;
}

export type WebMergeInput = {
  /** The latest stored state. */
  remote: JsonObject;
  /** The page's whole state, as it would be stored. */
  snapshot: JsonObject;
  /** The state `snapshot` provably descends from, or null when that cannot be shown. */
  ancestry: JsonObject | null;
  /** ISO timestamp recorded on tombstones. */
  now: string;
};

/** The stored state with the page's own changes applied, and nothing else touched. */
export function mergeWebSnapshot({ remote, snapshot, ancestry, now }: WebMergeInput): JsonObject {
  const merged = clone(remote);
  if (!ancestry) {
    // Without a proven ancestor the page's copy may be stale in any direction,
    // so it can add what is missing but never overwrite or delete. After an
    // explicit reset it cannot even add: its items predate the wipe.
    if (resetTime(merged) === null) mergeWithoutAncestry(merged, snapshot);
    return merged;
  }

  for (const key of WEB_VALUE_KEYS) {
    if (has(snapshot, key) && !sameJson(ancestry[key], snapshot[key])) merged[key] = clone(snapshot[key]);
  }

  for (const key of WEB_MAP_KEYS) {
    const next = snapshot[key];
    if (!isObject(next)) continue;
    const before = isObject(ancestry[key]) ? ancestry[key] : {};
    const target: JsonObject = isObject(merged[key]) ? merged[key] : {};
    let changed = false;
    for (const [entry, value] of Object.entries(next)) {
      if (sameJson(before[entry], value) && has(before, entry)) continue;
      target[entry] = clone(value);
      changed = true;
    }
    for (const entry of Object.keys(before)) {
      if (has(next, entry) || !has(target, entry)) continue;
      delete target[entry];
      changed = true;
    }
    if (changed) merged[key] = target;
  }

  let tombstoned = false;
  for (const key of WEB_COLLECTION_KEYS) {
    const next = snapshot[key];
    if (!Array.isArray(next)) continue;
    const before = new Map<string, JsonObject>();
    for (const item of Array.isArray(ancestry[key]) ? ancestry[key] : []) {
      const id = itemId(item);
      if (id && isObject(item)) before.set(id, item);
    }
    const target: Json[] = Array.isArray(merged[key]) ? merged[key] : [];
    const nextIds = new Set(next.map(itemId).filter((id): id is string => id !== null));
    let changed = false;

    for (const id of before.keys()) {
      if (nextIds.has(id)) continue;
      const at = indexOfId(target, id);
      if (at !== -1) target.splice(at, 1);
      addTombstone(merged, key, id, now);
      tombstoned = true;
      changed = true;
    }

    next.forEach((item, position) => {
      const id = itemId(item);
      if (!id || !isObject(item)) return;
      const prior = before.get(id);
      const at = indexOfId(target, id);
      if (!prior) {
        if (at !== -1) {
          changed = applyItemFields(target[at] as JsonObject, undefined, item, key) || changed;
        } else if (!isTombstoned(merged, key, id)) {
          insertInSnapshotOrder(target, item, next, position);
          changed = true;
        }
        return;
      }
      // Deleted by someone else since: an edit here must not bring it back.
      if (at === -1 || sameJson(prior, item)) return;
      changed = applyItemFields(target[at] as JsonObject, prior, item, key) || changed;
    });

    if (changed) merged[key] = target;
  }

  if (tombstoned) pruneTombstones(merged, now);
  return merged;
}

function mergeWithoutAncestry(merged: JsonObject, snapshot: JsonObject): void {
  for (const key of WEB_VALUE_KEYS) {
    if (has(snapshot, key) && !has(merged, key)) merged[key] = clone(snapshot[key]);
  }
  for (const key of WEB_MAP_KEYS) {
    const next = snapshot[key];
    if (!isObject(next)) continue;
    const target: JsonObject = isObject(merged[key]) ? merged[key] : {};
    let changed = false;
    for (const [entry, value] of Object.entries(next)) {
      if (has(target, entry)) continue;
      target[entry] = clone(value);
      changed = true;
    }
    if (changed) merged[key] = target;
  }
  for (const key of WEB_COLLECTION_KEYS) {
    const next = snapshot[key];
    if (!Array.isArray(next)) continue;
    const target: Json[] = Array.isArray(merged[key]) ? merged[key] : [];
    let changed = false;
    next.forEach((item, position) => {
      const id = itemId(item);
      if (!id || !isObject(item)) return;
      const at = indexOfId(target, id);
      if (at !== -1) {
        changed = applyItemFields(target[at] as JsonObject, undefined, item, key) || changed;
      } else if (!isTombstoned(merged, key, id)) {
        insertInSnapshotOrder(target, item, next, position);
        changed = true;
      }
    });
    if (changed) merged[key] = target;
  }
}
