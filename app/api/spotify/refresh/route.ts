import { NextRequest, NextResponse } from 'next/server';
import { fetchAllTracks } from '@/lib/spotify';
import { createClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Fetch fresh stream data from Spotify and update the Supabase cache.
 *
 * Called by Vercel Cron (GET) or manually (GET/POST) with an Authorization header.
 * Set CRON_SECRET in environment variables and protect this endpoint so only your
 * cron job can trigger a forced refresh.
 *
 * Usage:
 *   curl -X GET https://your-site.com/api/spotify/refresh \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export async function GET(req: NextRequest) {
  return handleRefresh(req);
}

export async function POST(req: NextRequest) {
  return handleRefresh(req);
}

async function handleRefresh(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const startedAt = Date.now();

  try {
    const data = await fetchAllTracks();

    // Write results to Supabase
    const supabase = createClient();
    const rows = Object.entries(data)
      .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== null)
      .map(([key, d]) => ({
        track_key: key,
        track_id: d.id,
        track_name: d.name,
        artist_name: d.artist,
        play_count: d.playCount,
        popularity: d.popularity,
        fetched_at: d.fetchedAt,
      }));

    const { error } = await supabase.from('spotify_streams').upsert(rows);
    if (error) throw error;

    const summary = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [
        k,
        v ? { playCount: v.playCount, popularity: v.popularity } : null,
      ]),
    );

    return NextResponse.json({
      success: true,
      refreshedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      tracks: summary,
    });
  } catch (error) {
    console.error('[api/spotify/refresh]', error);
    return NextResponse.json(
      { success: false, error: String(error), durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
