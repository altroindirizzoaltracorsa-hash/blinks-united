import { NextResponse } from 'next/server';
import { fetchAllTracks, TRACKS, type TrackData } from '@/lib/spotify';
import { createClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Returns cached Spotify stream data from Supabase; fetches fresh data when stale */
export async function GET() {
  try {
    // Try to serve from Supabase cache first
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient();
      const { data: rows, error } = await supabase
        .from('spotify_streams')
        .select('*')
        .in('track_key', Object.keys(TRACKS));

      if (!error && rows && rows.length > 0) {
        // Check how old the oldest entry is
        const oldest = rows.reduce((min, r) =>
          new Date(r.fetched_at) < new Date(min.fetched_at) ? r : min
        );
        const ageMs = Date.now() - new Date(oldest.fetched_at).getTime();
        const HOUR_MS = 60 * 60 * 1000;

        if (ageMs < HOUR_MS) {
          // Cache is fresh — return Supabase data directly
          const data: Record<string, TrackData | null> = {};
          for (const row of rows) {
            data[row.track_key] = {
              id: row.track_id,
              name: row.track_name,
              artist: row.artist_name,
              popularity: row.popularity,
              playCount: row.play_count,
              fetchedAt: row.fetched_at,
            };
          }
          return NextResponse.json({
            success: true,
            data,
            cached: true,
            cacheAgeSeconds: Math.floor(ageMs / 1000),
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Cache miss or stale — fetch live from Spotify
    const data = await fetchAllTracks();

    // Persist to Supabase (best-effort, non-blocking for the response)
    persistToSupabase(data);

    return NextResponse.json({
      success: true,
      data,
      cached: false,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[api/spotify/streams]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Spotify data' },
      { status: 500 },
    );
  }
}

function persistToSupabase(data: Record<string, TrackData | null>) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = createClient();
    const rows = Object.entries(data)
      .filter((entry): entry is [string, TrackData] => entry[1] !== null)
      .map(([key, d]) => ({
        track_key: key,
        track_id: d.id,
        track_name: d.name,
        artist_name: d.artist,
        play_count: d.playCount,
        popularity: d.popularity,
        fetched_at: d.fetchedAt,
      }));
    if (rows.length > 0) {
      supabase.from('spotify_streams').upsert(rows).then(() => {});
    }
  } catch { /* non-blocking */ }
}
