-- ════════════════════════════════════════════════════════
-- BLINKS UNITED — Supabase Schema
-- Run this in Supabase → SQL Editor → New Query
-- ════════════════════════════════════════════════════════

-- 1. PROFILES
-- Extends auth.users with display name and avatar
create table public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  username    text unique not null,
  avatar_url  text,
  created_at  timestamptz default now()
);
alter table public.profiles enable row level security;

-- Users can read all profiles (for leaderboard)
create policy "Profiles are publicly readable"
  on public.profiles for select using (true);

-- Users can only update their own profile
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 2. LASTFM ACCOUNTS
-- Each user can link one or more Last.fm usernames
create table public.lastfm_accounts (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users(id) on delete cascade not null,
  lastfm_username  text not null,
  is_primary       boolean default true,
  verified         boolean default false,
  created_at       timestamptz default now(),
  unique(user_id, lastfm_username)
);
alter table public.lastfm_accounts enable row level security;

-- Users can read their own Last.fm accounts
create policy "Users can view own lastfm accounts"
  on public.lastfm_accounts for select using (auth.uid() = user_id);

-- Users can insert their own Last.fm accounts
create policy "Users can add lastfm accounts"
  on public.lastfm_accounts for insert with check (auth.uid() = user_id);

-- Users can delete their own Last.fm accounts
create policy "Users can delete own lastfm accounts"
  on public.lastfm_accounts for delete using (auth.uid() = user_id);


-- 3. DAILY STATS
-- Daily scrobble snapshot per user per date
create table public.daily_stats (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references auth.users(id) on delete cascade not null,
  date                date not null,
  -- Raw scrobbles today
  jump_today          integer default 0,
  shutdown_today      integer default 0,
  ddududu_today       integer default 0,
  -- Derived: how many full playlist runs (accounts implied)
  jump_runs           integer generated always as (jump_today / 80) stored,
  shutdown_runs       integer generated always as (shutdown_today / 36) stored,
  ddududu_runs        integer generated always as (ddududu_today / 20) stored,
  -- Min runs across all 3 songs = verified full accounts
  verified_accounts   integer generated always as (
    least(jump_today / 80, shutdown_today / 36, ddududu_today / 20)
  ) stored,
  -- Total campaign scrobbles today
  total_today         integer generated always as (
    jump_today + shutdown_today + ddududu_today
  ) stored,
  -- All-time totals (updated on each fetch)
  jump_alltime        integer default 0,
  shutdown_alltime    integer default 0,
  ddududu_alltime     integer default 0,
  artist_alltime      integer default 0,
  -- Metadata
  last_fetched        timestamptz default now(),
  unique(user_id, date)
);
alter table public.daily_stats enable row level security;

-- Anyone can read daily stats (for leaderboard)
create policy "Daily stats are publicly readable"
  on public.daily_stats for select using (true);

-- Users can only insert/update their own stats
create policy "Users can insert own stats"
  on public.daily_stats for insert with check (auth.uid() = user_id);

create policy "Users can update own stats"
  on public.daily_stats for update using (auth.uid() = user_id);


-- 4. WEEKLY STATS
-- Weekly scrobble snapshot per user per week
create table public.weekly_stats (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references auth.users(id) on delete cascade not null,
  week_start        date not null,  -- Monday of that week
  jump_week         integer default 0,
  shutdown_week     integer default 0,
  ddududu_week      integer default 0,
  total_week        integer generated always as (
    jump_week + shutdown_week + ddududu_week
  ) stored,
  last_fetched      timestamptz default now(),
  unique(user_id, week_start)
);
alter table public.weekly_stats enable row level security;

create policy "Weekly stats are publicly readable"
  on public.weekly_stats for select using (true);

create policy "Users can insert own weekly stats"
  on public.weekly_stats for insert with check (auth.uid() = user_id);

create policy "Users can update own weekly stats"
  on public.weekly_stats for update using (auth.uid() = user_id);


-- ── Useful views for leaderboard queries ────────────────

-- Today's leaderboard (overall + per song)
create or replace view public.leaderboard_daily as
select
  p.id,
  p.username,
  p.avatar_url,
  d.date,
  d.jump_today,
  d.shutdown_today,
  d.ddududu_today,
  d.total_today,
  d.verified_accounts,
  d.jump_runs,
  d.shutdown_runs,
  d.ddududu_runs
from public.daily_stats d
join public.profiles p on p.id = d.user_id
where d.date = current_date
order by d.total_today desc;

-- This week's leaderboard
create or replace view public.leaderboard_weekly as
select
  p.id,
  p.username,
  p.avatar_url,
  w.week_start,
  w.jump_week,
  w.shutdown_week,
  w.ddududu_week,
  w.total_week
from public.weekly_stats w
join public.profiles p on p.id = w.user_id
where w.week_start = date_trunc('week', current_date)::date
order by w.total_week desc;

-- All-time leaderboard
create or replace view public.leaderboard_alltime as
select
  p.id,
  p.username,
  p.avatar_url,
  sum(d.jump_today) as jump_alltime,
  sum(d.shutdown_today) as shutdown_alltime,
  sum(d.ddududu_today) as ddududu_alltime,
  sum(d.total_today) as total_alltime
from public.daily_stats d
join public.profiles p on p.id = d.user_id
group by p.id, p.username, p.avatar_url
order by total_alltime desc;

