-- ═══════════════════════════════════════════════════════════
-- BLINKS UNITED — Supabase Schema v2
-- Auth: Clerk (user IDs are text strings, not Supabase UUIDs)
-- Run in: Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════

-- 1. PROFILES
create table if not exists public.profiles (
  id          text primary key,   -- Clerk user ID (user_xxxx)
  username    text unique not null,
  avatar_url  text,
  created_at  timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Profiles are publicly readable"
  on public.profiles for select using (true);


-- 2. SPOTIFY ACCOUNTS (multiple per user)
create table if not exists public.spotify_accounts (
  id               uuid default gen_random_uuid() primary key,
  user_id          text references public.profiles(id) on delete cascade not null,
  spotify_user_id  text not null,
  display_name     text,
  access_token     text not null,
  refresh_token    text not null,
  expires_at       timestamptz not null,
  last_cursor      bigint default 0,   -- last played_at timestamp (ms) used as pagination cursor
  created_at       timestamptz default now(),
  unique(user_id, spotify_user_id)
);
alter table public.spotify_accounts enable row level security;
-- No public read policy — tokens are sensitive; all access via service role key


-- 3. STREAM COUNTS (daily per user, all accounts summed)
create table if not exists public.stream_counts (
  id         uuid default gen_random_uuid() primary key,
  user_id    text references public.profiles(id) on delete cascade not null,
  date       date not null,
  jump       integer default 0,
  shutdown   integer default 0,
  ddududu    integer default 0,
  total      integer generated always as (jump + shutdown + ddududu) stored,
  updated_at timestamptz default now(),
  unique(user_id, date)
);
alter table public.stream_counts enable row level security;
create policy "Stream counts are publicly readable"
  on public.stream_counts for select using (true);


-- ── LEADERBOARD VIEWS ────────────────────────────────────────

create or replace view public.leaderboard_alltime as
select
  p.id,
  p.username,
  p.avatar_url,
  coalesce(sum(s.jump),     0)::integer as jump,
  coalesce(sum(s.shutdown), 0)::integer as shutdown,
  coalesce(sum(s.ddududu),  0)::integer as ddududu,
  coalesce(sum(s.total),    0)::integer as total
from public.profiles p
left join public.stream_counts s on s.user_id = p.id
group by p.id, p.username, p.avatar_url
order by total desc;

create or replace view public.leaderboard_today as
select
  p.id,
  p.username,
  p.avatar_url,
  coalesce(s.jump,     0) as jump,
  coalesce(s.shutdown, 0) as shutdown,
  coalesce(s.ddududu,  0) as ddududu,
  coalesce(s.total,    0) as total
from public.profiles p
left join public.stream_counts s on s.user_id = p.id and s.date = current_date
order by total desc;
