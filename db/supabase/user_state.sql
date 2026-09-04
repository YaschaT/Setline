-- Cross-device sync for Setline.
--
-- lib/cloud-state.ts reads and writes this table; it is the store of record
-- because Supabase exists in every deployment while the D1-backed
-- /api/user-state route only exists on Cloudflare. Without this table every
-- read returns PGRST205 ("Could not find the table"), cloud-state treats that
-- as "unknown" and keeps the device's own copy — so a phone and a PC signed
-- into the same account each keep a private localStorage state and never meet.
--
-- Run once, in the SQL editor of the Supabase project the app points at
-- (NEXT_PUBLIC_SUPABASE_URL). Safe to re-run.

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- One row per account, readable and writable only by that account.
drop policy if exists "own state" on public.user_state;
create policy "own state" on public.user_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
