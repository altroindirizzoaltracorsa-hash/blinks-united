-- ════════════════════════════════════════════════════════
-- BLINKS UNITED — Spotify Streams Cache
-- Run this in Supabase → SQL Editor → New Query
-- ════════════════════════════════════════════════════════

create table public.spotify_streams (
  track_key    text primary key,   -- 'jump' | 'shutdown' | 'ddududu'
  track_id     text not null,      -- Spotify track ID (22-char URI ID)
  track_name   text,
  artist_name  text,
  play_count   bigint,             -- all-time streams; null if scraping failed
  popularity   smallint,           -- 0-100 official Spotify popularity score
  fetched_at   timestamptz default now()
);

alter table public.spotify_streams enable row level security;

-- Anyone can read stream counts (for displaying on the public site)
create policy "Spotify streams are publicly readable"
  on public.spotify_streams for select using (true);
