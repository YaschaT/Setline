-- Friends, posts and kudos for Setline.
--
-- Run once, in the SQL editor of the Supabase project the app points at
-- (NEXT_PUBLIC_SUPABASE_URL). Safe to re-run.
--
-- The rules live here, not in the app: row-level security decides who sees
-- what, so a modified client can read no more than the real one.
--
--   * A profile (username, name) is visible to every signed-in account, so
--     a friend can be found by username. Nothing else about an account is.
--   * Friendship is two-way: one asks, the other accepts. Either can end it.
--   * A post is a workout summary — never the log, body weight or photos —
--     and only its owner and the owner's accepted friends can see it.
--   * Kudos can be given on a post you can see, once, and not on your own.
--   * A block ends any friendship and stops new requests either way.
--   * Reports can be written, never read back by clients.

-- ------------------------------------------------------------------ profiles

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable when signed in" on public.profiles;
create policy "profiles readable when signed in" on public.profiles
  for select to authenticated using (true);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own profile delete" on public.profiles;
create policy "own profile delete" on public.profiles
  for delete to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------------ blocks

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users on delete cascade,
  blocked_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks
  for all to authenticated using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- Either side blocked the other. Security definer, so it can see the other
-- account's block without that row being readable.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- ------------------------------------------------------------------ friendships

create table if not exists public.friendships (
  requester_id uuid not null references public.profiles (user_id) on delete cascade,
  addressee_id uuid not null references public.profiles (user_id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- One friendship per pair, whichever way round it was asked.
create unique index if not exists friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester_id, addressee_id));

drop policy if exists "ask for a friendship" on public.friendships;
create policy "ask for a friendship" on public.friendships
  for insert to authenticated with check (
    auth.uid() = requester_id
    and status = 'pending'
    and not public.is_blocked(requester_id, addressee_id)
  );

-- Only the one asked can accept; nobody can change who is in it.
drop policy if exists "accept a friendship" on public.friendships;
create policy "accept a friendship" on public.friendships
  for update to authenticated
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id and status = 'accepted');

drop policy if exists "end a friendship" on public.friendships;
create policy "end a friendship" on public.friendships
  for delete to authenticated using (auth.uid() in (requester_id, addressee_id));

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  ) and not public.is_blocked(a, b);
$$;

-- A block ends the friendship on the spot.
create or replace function public.end_friendship_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
  where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
     or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists blocks_end_friendship on public.blocks;
create trigger blocks_end_friendship after insert on public.blocks
  for each row execute function public.end_friendship_on_block();

-- ------------------------------------------------------------------ posts

create table if not exists public.posts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (user_id) on delete cascade,
  -- The session it summarises, so saving it again updates the one post.
  session_id       text not null,
  workout_date     timestamptz not null,
  title            text not null check (char_length(title) between 1 and 60),
  volume_kg        numeric not null default 0 check (volume_kg >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  set_count        integer not null default 0 check (set_count >= 0),
  -- [{ "place": 1, "name": "Flat bench press", "weight_kg": 102.5, "reps": 8 }]
  medals           jsonb not null default '[]'::jsonb,
  streak_weeks     integer not null default 0 check (streak_weeks >= 0),
  created_at       timestamptz not null default now(),
  unique (user_id, session_id)
);

create index if not exists posts_feed_idx on public.posts (workout_date desc);

alter table public.posts enable row level security;

drop policy if exists "see own and friends posts" on public.posts;
create policy "see own and friends posts" on public.posts
  for select to authenticated using (
    auth.uid() = user_id or public.are_friends(auth.uid(), user_id)
  );

drop policy if exists "own posts insert" on public.posts;
create policy "own posts insert" on public.posts
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own posts update" on public.posts;
create policy "own posts update" on public.posts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own posts delete" on public.posts;
create policy "own posts delete" on public.posts
  for delete to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------------ kudos

create table if not exists public.kudos (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.kudos enable row level security;

-- Kudos are as visible as the post they are on.
drop policy if exists "see kudos on visible posts" on public.kudos;
create policy "see kudos on visible posts" on public.kudos
  for select to authenticated using (
    exists (select 1 from public.posts p where p.id = post_id)
  );

drop policy if exists "give kudos" on public.kudos;
create policy "give kudos" on public.kudos
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.user_id <> auth.uid()
    )
  );

drop policy if exists "take back kudos" on public.kudos;
create policy "take back kudos" on public.kudos
  for delete to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------------ reports

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users on delete cascade,
  post_id     uuid references public.posts (id) on delete set null,
  reported_id uuid references auth.users on delete set null,
  reason      text not null check (char_length(reason) between 1 and 500),
  created_at  timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists "file a report" on public.reports;
create policy "file a report" on public.reports
  for insert to authenticated with check (auth.uid() = reporter_id);
-- No select policy: reports are read in the dashboard only.
