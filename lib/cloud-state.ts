import { supabase } from "@/lib/supabase";
import {
  isObject,
  mergeWebSnapshot,
  RESET_KEY,
  resetTime,
  sameJson,
  toJson,
  type JsonObject,
} from "@/lib/state-merge";

/**
 * Account-scoped storage for the whole training state.
 *
 * The Cloudflare build has /api/user-state backed by D1, but the Vercel build
 * ships a static SPA where that route does not exist — which is why signing out
 * there used to lose everything. Supabase is available in both, so it is the
 * store of record, with the D1 route kept as a fallback where it is real.
 *
 * Requires this table (RLS on, each row owned by its user):
 *
 *   create table public.user_state (
 *     user_id uuid primary key references auth.users on delete cascade,
 *     state jsonb not null,
 *     updated_at timestamptz not null default now()
 *   );
 *   alter table public.user_state enable row level security;
 *   create policy "own state" on public.user_state
 *     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
 *
 * Saving is a merge, never a replace. The iOS app writes to the same row, and
 * a browser tab can sit open for hours on an old copy. So a save fetches the
 * latest row, applies only what this page changed (see `lib/state-merge.ts`),
 * and writes back only if the row's `updated_at` is still the one it read;
 * otherwise it fetches again and reapplies the same change.
 */

export type CloudState = { state: Record<string, unknown>; updatedAt: string | null } | null;

type StoredRow = { state: JsonObject; version: string };
type WriteResult = { status: "ok"; version: string } | { status: "conflict" } | { status: "error" };

export type CloudBackend = {
  userId(): Promise<string | null>;
  /** `null` when the account has no row yet; "error" when that cannot be known. */
  fetch(userId: string): Promise<StoredRow | null | "error">;
  /** Writes only when the stored version is still `expectedVersion`. */
  update(userId: string, state: JsonObject, expectedVersion: string, nextVersion: string): Promise<WriteResult>;
  /** Creates the row; a row that appeared in the meantime is a conflict. */
  insert(userId: string, state: JsonObject, nextVersion: string): Promise<WriteResult>;
  /** Unconditional: only an explicit reset may overwrite whatever is stored. */
  replace(userId: string, state: JsonObject, nextVersion: string): Promise<boolean>;
};

/** The last page state this browser saved, and the row version it produced. */
export type SyncedBase = { snapshot: JsonObject; version: string };

export type BaseStore = {
  read(userId: string): SyncedBase | null;
  write(userId: string, base: SyncedBase): void;
  clear(userId: string): void;
};

const MAX_ATTEMPTS = 3;

export function createCloudState({
  backend,
  baseStore,
  now = () => new Date(),
}: {
  backend: CloudBackend;
  baseStore: BaseStore;
  now?: () => Date;
}) {
  // What this page's state provably descends from. `loaded` is the row the
  // page last read; `previous` is the last snapshot this page saved.
  let loaded: { userId: string; state: JsonObject } | null = null;
  let previous: { userId: string; snapshot: JsonObject } | null = null;
  // One save at a time, so each one merges against the result of the last.
  let queue: Promise<unknown> = Promise.resolve();

  /** Strictly after the version it replaces, whatever this device's clock says. */
  function nextVersion(current?: string): string {
    const floor = current ? Date.parse(current) + 1 : 0;
    return new Date(Math.max(now().getTime(), Number.isNaN(floor) ? 0 : floor)).toISOString();
  }

  function ancestryFor(userId: string, isDeviceCopy: boolean): JsonObject | null {
    // A copy read back from this device's storage descends from whatever this
    // browser last saved — not from the row it happened to read just now.
    if (isDeviceCopy) return baseStore.read(userId)?.snapshot ?? null;
    if (previous?.userId === userId) return previous.snapshot;
    if (loaded?.userId === userId) return loaded.state;
    return null;
  }

  function remember(userId: string, snapshot: JsonObject, version: string | undefined): void {
    previous = { userId, snapshot };
    if (version) baseStore.write(userId, { snapshot, version });
  }

  async function loadCloudState(): Promise<CloudState> {
    const userId = await backend.userId();
    if (!userId) return null;
    const row = await backend.fetch(userId);
    // A missing table or a network failure must not look like "no data saved":
    // callers treat null as unknown and keep whatever is on the device.
    if (row === "error") return null;
    previous = null;
    // With no row, what the page goes on to show comes from this device or the
    // D1 fallback — not from an empty account — so it has no provable ancestor.
    loaded = row ? { userId, state: row.state } : null;
    if (!row) return null;
    return { state: row.state, updatedAt: row.version };
  }

  async function save(state: Record<string, unknown>): Promise<boolean> {
    const userId = await backend.userId();
    if (!userId) return false;

    const snapshot = toJson(state);
    // Only a copy read straight from this device's storage carries its own
    // `updatedAt`; the page's regular saves never include one.
    const deviceStamp = typeof snapshot.updatedAt === "string" ? Date.parse(snapshot.updatedAt) : null;
    delete snapshot.updatedAt;
    const isDeviceCopy = deviceStamp !== null;
    const ancestry = ancestryFor(userId, isDeviceCopy);
    if (isDeviceCopy) {
      // The page goes on showing this copy rather than the row it loaded, so
      // that row is no longer what its state descends from. If this save
      // fails, later saves may only add until one succeeds.
      loaded = null;
      previous = null;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const row = await backend.fetch(userId);
      if (row === "error") return false;
      const remote = row?.state ?? {};

      const reset = resetTime(remote);
      if (isDeviceCopy && reset !== null && (deviceStamp === null || Number.isNaN(deviceStamp) || deviceStamp < reset)) {
        // Written before the account was wiped everywhere: nothing in it may
        // come back. The page keeps showing it until it reloads, and its later
        // saves only carry what changes from here.
        remember(userId, snapshot, undefined);
        return true;
      }

      const merged = mergeWebSnapshot({ remote, snapshot, ancestry, now: now().toISOString() });
      if (row && sameJson(merged, remote)) {
        remember(userId, snapshot, row.version);
        return true;
      }

      const version = nextVersion(row?.version);
      const result = row
        ? await backend.update(userId, merged, row.version, version)
        : await backend.insert(userId, merged, version);
      if (result.status === "ok") {
        remember(userId, snapshot, result.version);
        return true;
      }
      if (result.status === "error") return false;
      // Someone wrote first: fetch their version and apply the same change to it.
    }
    return false;
  }

  function saveCloudState(state: Record<string, unknown>): Promise<boolean> {
    const run = queue.then(() => save(state), () => save(state));
    queue = run.catch(() => false);
    return run;
  }

  /** Removes this account's stored state entirely. Used by "wis alle progressie". */
  async function clearCloudState(): Promise<boolean> {
    const userId = await backend.userId();
    if (!userId) return false;
    // Written as an explicit reset rather than a missing row, so a client
    // holding an older copy can tell "wiped" from "never saved" and does not
    // put the old data back.
    const ok = await backend.replace(userId, { [RESET_KEY]: { at: now().toISOString() } }, nextVersion());
    loaded = null;
    previous = null;
    baseStore.clear(userId);
    return ok;
  }

  return { loadCloudState, saveCloudState, clearCloudState };
}

const TABLE = "user_state";
const BASE_PREFIX = "setline-sync-base-v1:";

const supabaseBackend: CloudBackend = {
  async userId() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  },

  async fetch(userId) {
    if (!supabase) return "error";
    const { data, error } = await supabase
      .from(TABLE)
      .select("state, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return "error";
    if (!data) return null;
    return { state: isObject(data.state) ? data.state : {}, version: String(data.updated_at) };
  },

  async update(userId, state, expectedVersion, nextVersion) {
    if (!supabase) return { status: "error" };
    const { data, error } = await supabase
      .from(TABLE)
      .update({ state, updated_at: nextVersion })
      .eq("user_id", userId)
      .eq("updated_at", expectedVersion)
      .select("updated_at");
    if (error) return { status: "error" };
    const row = data?.[0];
    return row ? { status: "ok", version: String(row.updated_at) } : { status: "conflict" };
  },

  async insert(userId, state, nextVersion) {
    if (!supabase) return { status: "error" };
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ user_id: userId, state, updated_at: nextVersion })
      .select("updated_at");
    if (error) return error.code === "23505" ? { status: "conflict" } : { status: "error" };
    const row = data?.[0];
    return row ? { status: "ok", version: String(row.updated_at) } : { status: "error" };
  },

  async replace(userId, state, nextVersion) {
    if (!supabase) return false;
    const { error } = await supabase
      .from(TABLE)
      .upsert({ user_id: userId, state, updated_at: nextVersion }, { onConflict: "user_id" });
    return !error;
  },
};

const browserBaseStore: BaseStore = {
  read(userId) {
    try {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(BASE_PREFIX + userId);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (!isObject(parsed) || !isObject(parsed.snapshot) || typeof parsed.version !== "string") return null;
      return { snapshot: parsed.snapshot, version: parsed.version };
    } catch {
      return null;
    }
  },
  write(userId, base) {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(BASE_PREFIX + userId, JSON.stringify(base));
    } catch {
      // A full store only means the next push of a device copy merges without
      // a known ancestor, which can add but never overwrite or delete.
    }
  },
  clear(userId) {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(BASE_PREFIX + userId);
    } catch {
      // Nothing to clear.
    }
  },
};

const cloud = createCloudState({ backend: supabaseBackend, baseStore: browserBaseStore });

export const loadCloudState = cloud.loadCloudState;
export const saveCloudState = cloud.saveCloudState;
export const clearCloudState = cloud.clearCloudState;
