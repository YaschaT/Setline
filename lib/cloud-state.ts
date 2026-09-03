import { supabase } from "@/lib/supabase";

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
 */

export type CloudState = { state: Record<string, unknown>; updatedAt: string | null } | null;

const TABLE = "user_state";

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function loadCloudState(): Promise<CloudState> {
  const userId = await currentUserId();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("state, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  // A missing table or a network failure must not look like "no data saved":
  // callers treat null as unknown and keep whatever is on the device.
  if (error || !data) return null;
  return { state: (data.state ?? {}) as Record<string, unknown>, updatedAt: data.updated_at ?? null };
}

export async function saveCloudState(state: Record<string, unknown>): Promise<boolean> {
  const userId = await currentUserId();
  if (!supabase || !userId) return false;
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, state, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}
