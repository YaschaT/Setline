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

-- Where the workout happened — only when the lifter chose to say, per post.
-- A gym is a public place and keeps its coordinates; outdoors is stored
-- rounded to about a kilometre; a home workout never carries coordinates.
alter table public.posts add column if not exists place_kind text;
alter table public.posts add column if not exists place_name text;
alter table public.posts add column if not exists place_lat double precision;
alter table public.posts add column if not exists place_lon double precision;
alter table public.posts drop constraint if exists posts_place_kind_check;
alter table public.posts add constraint posts_place_kind_check
  check (place_kind is null or place_kind in ('gym', 'home', 'outdoors'));
alter table public.posts drop constraint if exists posts_place_name_check;
alter table public.posts add constraint posts_place_name_check
  check (place_name is null or char_length(place_name) between 1 and 80);
alter table public.posts drop constraint if exists posts_place_coordinates_check;
alter table public.posts add constraint posts_place_coordinates_check
  check (
    (place_lat is null) = (place_lon is null)
    and (place_kind is distinct from 'home' or place_lat is null)
    and (place_lat is null or (place_lat between -90 and 90 and place_lon between -180 and 180))
  );

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

-- ================================================================== posts v2
-- SOCIAL_FEATURES.md: a post is an explicit choice, with a visibility, an
-- optional title, notes, photos, music and hidden stats. Safe to re-run.

alter table public.posts add column if not exists visibility text not null default 'friends';
alter table public.posts drop constraint if exists posts_visibility_check;
-- Public comes later (phase 2); the check widens then.
alter table public.posts add constraint posts_visibility_check
  check (visibility in ('private', 'friends'));
alter table public.posts add column if not exists custom_title text;
alter table public.posts drop constraint if exists posts_custom_title_check;
alter table public.posts add constraint posts_custom_title_check
  check (custom_title is null or char_length(custom_title) between 1 and 60);
alter table public.posts add column if not exists notes text;
alter table public.posts drop constraint if exists posts_notes_check;
alter table public.posts add constraint posts_notes_check
  check (notes is null or char_length(notes) between 1 and 2000);
alter table public.posts add column if not exists hidden_stats text[] not null default '{}';
alter table public.posts drop constraint if exists posts_hidden_stats_check;
alter table public.posts add constraint posts_hidden_stats_check
  check (hidden_stats <@ array['duration', 'volume', 'weights']::text[]);
alter table public.posts add column if not exists edited_at timestamptz;

-- The one visibility rule. Friendship is checked when the post is READ, so a
-- friend added later sees earlier Friends posts and an unfriended person
-- loses them at once; Private posts are never anyone else's.
create or replace function public.can_see_post(p uuid, viewer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts
    where id = p
      and (user_id = viewer or (visibility = 'friends' and public.are_friends(viewer, user_id)))
  );
$$;

drop policy if exists "see own and friends posts" on public.posts;
create policy "see own and friends posts" on public.posts
  for select to authenticated using (
    auth.uid() = user_id
    or (visibility = 'friends' and public.are_friends(auth.uid(), user_id))
  );

drop policy if exists "give kudos" on public.kudos;
create policy "give kudos" on public.kudos
  for insert to authenticated with check (
    auth.uid() = user_id
    and public.can_see_post(post_id, auth.uid())
    and not exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- ------------------------------------------------------------------ photos

create table if not exists public.post_media (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  -- <user_id>/<post_id>/<uuid>.jpg in the private post-media bucket.
  path       text not null unique check (char_length(path) between 1 and 200),
  width      integer check (width is null or width > 0),
  height     integer check (height is null or height > 0),
  position   smallint not null default 0 check (position between 0 and 3),
  created_at timestamptz not null default now()
);

alter table public.post_media enable row level security;

drop policy if exists "see media on visible posts" on public.post_media;
create policy "see media on visible posts" on public.post_media
  for select to authenticated using (public.can_see_post(post_id, auth.uid()));

drop policy if exists "add media to own posts" on public.post_media;
create policy "add media to own posts" on public.post_media
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
    and split_part(path, '/', 1) = auth.uid()::text
  );

drop policy if exists "remove own media" on public.post_media;
create policy "remove own media" on public.post_media
  for delete to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------------ music

create table if not exists public.post_tracks (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  position   smallint not null default 0 check (position between 0 and 5),
  kind       text not null default 'song' check (kind in ('song', 'playlist')),
  title      text not null check (char_length(title) between 1 and 120),
  artist     text check (artist is null or char_length(artist) <= 120),
  url        text check (url is null or (char_length(url) <= 500 and url ~ '^https://')),
  created_at timestamptz not null default now()
);

alter table public.post_tracks enable row level security;

drop policy if exists "see tracks on visible posts" on public.post_tracks;
create policy "see tracks on visible posts" on public.post_tracks
  for select to authenticated using (public.can_see_post(post_id, auth.uid()));

drop policy if exists "add tracks to own posts" on public.post_tracks;
create policy "add tracks to own posts" on public.post_tracks
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

drop policy if exists "remove own tracks" on public.post_tracks;
create policy "remove own tracks" on public.post_tracks
  for delete to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------------ comments

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists comments_post_idx on public.comments (post_id, created_at);

alter table public.comments enable row level security;

drop policy if exists "see comments on visible posts" on public.comments;
create policy "see comments on visible posts" on public.comments
  for select to authenticated using (public.can_see_post(post_id, auth.uid()));

-- Whoever can see a post can comment on it: its owner and, for a Friends
-- post, the owner's friends.
drop policy if exists "comment on visible posts" on public.comments;
create policy "comment on visible posts" on public.comments
  for insert to authenticated with check (
    auth.uid() = user_id and public.can_see_post(post_id, auth.uid())
  );

-- Your own comment, or any comment on your own post.
drop policy if exists "remove comments" on public.comments;
create policy "remove comments" on public.comments
  for delete to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

alter table public.reports add column if not exists comment_id uuid references public.comments (id) on delete set null;

-- ------------------------------------------------------------------ photo storage

-- Private bucket: files are read only by those who can see their post.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists "post media upload own folder" on storage.objects;
create policy "post media upload own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "post media read when post visible" on storage.objects;
create policy "post media read when post visible" on storage.objects
  for select to authenticated using (
    bucket_id = 'post-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.post_media m
        where m.path = storage.objects.name and public.can_see_post(m.post_id, auth.uid())
      )
    )
  );

drop policy if exists "post media delete own" on storage.objects;
create policy "post media delete own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ================================================================== rest days
-- A rest day can be posted too, with why: it is not a workout, carries no
-- numbers and never counts toward a streak. Its session_id is
-- "rest-YYYY-MM-DD", one per day.
alter table public.posts add column if not exists kind text not null default 'workout';
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('workout', 'rest'));
alter table public.posts add column if not exists rest_reason text;
alter table public.posts drop constraint if exists posts_rest_reason_check;
alter table public.posts add constraint posts_rest_reason_check
  check (rest_reason is null or (kind = 'rest' and char_length(rest_reason) between 1 and 40));

-- ------------------------------------------------------------------ training together

-- What was trained, for whoever sees the post: one entry per exercise,
-- [{ "name": "Flat bench press", "sets": 3, "weight_kg": 100, "reps": 5 }],
-- the best set; weight and reps are left out when the lifter hides weights.
alter table public.posts add column if not exists exercises jsonb;
alter table public.posts drop constraint if exists posts_exercises_check;
alter table public.posts add constraint posts_exercises_check
  check (exercises is null or (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 40));

-- Friends the lifter trained with, named on the post.
create table if not exists public.post_participants (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_participants enable row level security;

-- As visible as the post; and the friend named can always see that they were.
drop policy if exists "see participants on visible posts" on public.post_participants;
create policy "see participants on visible posts" on public.post_participants
  for select to authenticated using (
    public.can_see_post(post_id, auth.uid()) or user_id = auth.uid()
  );

-- Only the post's author names people, and only their friends.
drop policy if exists "name friends on own posts" on public.post_participants;
create policy "name friends on own posts" on public.post_participants
  for insert to authenticated with check (
    exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
    and public.are_friends(auth.uid(), user_id)
  );

-- The author takes a name off; the friend named can take themselves off.
drop policy if exists "remove a name" on public.post_participants;
create policy "remove a name" on public.post_participants
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- ================================================================== chat
-- The Friends tab's chat: one conversation for you and your friends, about
-- training, food, or just keeping each other going. Like a post, a message
-- is seen by its author and the author's accepted friends, never by
-- strangers, and a block hides it both ways. Safe to re-run.
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  topic      text check (topic in ('training', 'food', 'motivation')),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_created_at on public.chat_messages (created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "see own and friends messages" on public.chat_messages;
create policy "see own and friends messages" on public.chat_messages
  for select to authenticated using (
    auth.uid() = user_id or public.are_friends(auth.uid(), user_id)
  );

drop policy if exists "write own messages" on public.chat_messages;
create policy "write own messages" on public.chat_messages
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "delete own messages" on public.chat_messages;
create policy "delete own messages" on public.chat_messages
  for delete to authenticated using (auth.uid() = user_id);

-- A report can name the message it is about.
alter table public.reports add column if not exists message_id uuid references public.chat_messages (id) on delete set null;

-- ================================================================== chat rooms
-- More than one conversation: Everyone (every Setline lifter), private
-- messages between two friends, and rooms a lifter starts on a topic and
-- invites friends to. A message can carry one photo. The friends' chat above
-- stays as it was: its messages have no room. Safe to re-run.
create table if not exists public.chat_rooms (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('everyone', 'direct', 'room')),
  name       text check (name is null or char_length(btrim(name)) between 1 and 40),
  created_by uuid references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  room_id    uuid not null references public.chat_rooms (id) on delete cascade,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists chat_members_user on public.chat_members (user_id);

-- The one Everyone room.
insert into public.chat_rooms (id, kind, name)
values ('00000000-0000-0000-0000-000000000001', 'everyone', 'Everyone')
on conflict (id) do nothing;

alter table public.chat_messages add column if not exists room_id uuid references public.chat_rooms (id) on delete cascade;
alter table public.chat_messages add column if not exists image_path text;
create index if not exists chat_messages_room on public.chat_messages (room_id, created_at desc);

-- A photo can go without words.
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check
  check (char_length(body) <= 1000 and (char_length(btrim(body)) >= 1 or image_path is not null));

-- In the room: Everyone is open to every account; the rest to their members.
-- Security definer, so the policies on chat_members can use it without
-- reading themselves.
create or replace function public.in_chat_room(room uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_rooms r
    where r.id = room
      and (r.kind = 'everyone' or exists (select 1 from public.chat_members m where m.room_id = room and m.user_id = uid))
  );
$$;

alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;

drop policy if exists "see rooms you are in" on public.chat_rooms;
create policy "see rooms you are in" on public.chat_rooms
  for select to authenticated using (created_by = auth.uid() or public.in_chat_room(id, auth.uid()));

drop policy if exists "start a room" on public.chat_rooms;
create policy "start a room" on public.chat_rooms
  for insert to authenticated with check (created_by = auth.uid() and kind in ('direct', 'room'));

drop policy if exists "rename own room" on public.chat_rooms;
create policy "rename own room" on public.chat_rooms
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid() and kind in ('direct', 'room'));

drop policy if exists "delete own room" on public.chat_rooms;
create policy "delete own room" on public.chat_rooms
  for delete to authenticated using (created_by = auth.uid() and kind in ('direct', 'room'));

drop policy if exists "see members of your rooms" on public.chat_members;
create policy "see members of your rooms" on public.chat_members
  for select to authenticated using (public.in_chat_room(room_id, auth.uid()));

-- The room's starter adds themself and their friends.
drop policy if exists "add friends to own room" on public.chat_members;
create policy "add friends to own room" on public.chat_members
  for insert to authenticated with check (
    exists (select 1 from public.chat_rooms r where r.id = room_id and r.created_by = auth.uid() and r.kind in ('direct', 'room'))
    and (user_id = auth.uid() or public.are_friends(auth.uid(), user_id))
  );

-- Anyone leaves; the starter can take someone out.
drop policy if exists "leave or remove" on public.chat_members;
create policy "leave or remove" on public.chat_members
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.chat_rooms r where r.id = room_id and r.created_by = auth.uid())
  );

-- Messages: the friends' chat as before; a room's to whoever is in it, with
-- a block hiding the other side either way.
drop policy if exists "see own and friends messages" on public.chat_messages;
create policy "see own and friends messages" on public.chat_messages
  for select to authenticated using (
    auth.uid() = user_id
    or (room_id is null and public.are_friends(auth.uid(), user_id))
    or (room_id is not null and public.in_chat_room(room_id, auth.uid()) and not public.is_blocked(auth.uid(), user_id))
  );

drop policy if exists "write own messages" on public.chat_messages;
create policy "write own messages" on public.chat_messages
  for insert to authenticated with check (
    auth.uid() = user_id and (room_id is null or public.in_chat_room(room_id, auth.uid()))
  );

-- Chat photos live in the post-media bucket under <user_id>/chat/, readable
-- by whoever can read the message.
drop policy if exists "chat photos read when message visible" on storage.objects;
create policy "chat photos read when message visible" on storage.objects
  for select to authenticated using (
    bucket_id = 'post-media'
    and exists (select 1 from public.chat_messages c where c.image_path = storage.objects.name)
  );

-- ================================================================== chat push
-- A notification when someone writes to you: the browser's own push, free in
-- every browser and on an iPhone once Setline is on the Home Screen. Each
-- browser that turns notifications on keeps one row here. When a message
-- lands, the database hands it with its recipients to /api/chat-push, which
-- signs and sends the pushes. Everyone is left out: it would buzz every phone.
-- Safe to re-run.
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "see own push subscriptions" on public.push_subscriptions;
create policy "see own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "remove own push subscriptions" on public.push_subscriptions;
create policy "remove own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- A browser belongs to whoever signed in on it last.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Where to send, and the secret /api/chat-push checks. Not reachable through
-- the API. Set once in the SQL editor, never in this file:
--   insert into private.settings values
--     ('chat_push_url', 'https://youfit-app.vercel.app/api/chat-push'),
--     ('chat_push_secret', '<CHAT_PUSH_SECRET from Vercel>')
--   on conflict (key) do update set value = excluded.value;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
alter table private.settings enable row level security;

-- Browsers the push services no longer know, as /api/chat-push reports them.
create or replace function public.forget_push_subscriptions(p_secret text, p_endpoints text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_secret is distinct from (select value from private.settings where key = 'chat_push_secret') then
    return;
  end if;
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
end;
$$;

create or replace function private.chat_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url    text := (select value from private.settings where key = 'chat_push_url');
  v_secret text := (select value from private.settings where key = 'chat_push_secret');
  v_room   public.chat_rooms;
  v_sender text;
  v_to     jsonb;
begin
  if v_url is null or v_secret is null then
    return new;
  end if;
  if new.room_id is not null then
    select * into v_room from public.chat_rooms where id = new.room_id;
    if v_room.kind = 'everyone' then
      return new;
    end if;
  end if;
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
    into v_to
    from public.push_subscriptions s
   where s.user_id <> new.user_id
     and not public.is_blocked(s.user_id, new.user_id)
     and case
           when new.room_id is null then public.are_friends(s.user_id, new.user_id)
           else exists (select 1 from public.chat_members m where m.room_id = new.room_id and m.user_id = s.user_id)
         end;
  if v_to is null then
    return new;
  end if;
  select coalesce(nullif(btrim(p.display_name), ''), p.username) into v_sender
    from public.profiles p where p.user_id = new.user_id;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'to', v_to, 'sender', v_sender, 'body', new.body, 'photo', new.image_path is not null,
      'kind', coalesce(v_room.kind, 'friends'), 'room', v_room.name, 'roomID', new.room_id
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-chat-push-secret', v_secret)
  );
  return new;
exception when others then
  -- A push never stops a message.
  return new;
end;
$$;

drop trigger if exists chat_push on public.chat_messages;
create trigger chat_push after insert on public.chat_messages
  for each row execute function private.chat_push();
