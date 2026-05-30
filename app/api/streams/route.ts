import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

const TRACKS: Record<string, string> = {
  jump:     '5H1sKFMzDeMtXwND3V6hRY',
  shutdown: '6tCd8bPvYnceDG7W9M1RMk',
  ddududu:  '69BIczdH6QMnFx7dsSssN8',
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type HistEntry = { date: string; streams: number; note?: string };
type LiveCache = { total: number; ts: number };
type PrevSnap  = { total: number; date: string };

function getDateLabel(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function parseDateLabel(label: string): Date {
  const [dd, mm] = label.split('/').map(Number);
  return new Date(Date.UTC(new Date().getUTCFullYear(), mm - 1, dd));
}

function daysBetween(labelA: string, labelB: string): number {
  const a = parseDateLabel(labelA);
  const b = parseDateLabel(labelB);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

async function fetchPlayCount(trackId: string): Promise<number> {
  const r = await fetch(
    `https://spotify-scraper.p.rapidapi.com/v1/track/metadata?trackId=${trackId}`,
    {
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
        'x-rapidapi-host': 'spotify-scraper.p.rapidapi.com',
      },
      cache: 'no-store',
    }
  );
  if (!r.ok) throw new Error(`RapidAPI ${r.status}`);
  const data = await r.json();
  return (data?.playCount as number) || 0;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isCron = searchParams.get('cron') === '1';

  if (isCron) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const today = new Date();
  const todayLabel = getDateLabel(today);
  const results: Record<string, { total: number; history: HistEntry[] }> = {};
  let fetchedLive = false;

  for (const [name, trackId] of Object.entries(TRACKS)) {
    try {
      const liveKey = `bp_live_${name}`;
      const prevKey = `bp_prev_${name}`;
      const histKey = `bp_hist_${name}`;

      const [cached, prev, hist] = await Promise.all([
        redis.get<LiveCache>(liveKey),
        redis.get<PrevSnap>(prevKey),
        redis.get<HistEntry[]>(histKey),
      ]);

      const history: HistEntry[] = hist || [];
      let total: number;

      const cacheAge = cached?.ts ? Date.now() - cached.ts : Infinity;
      const cacheValid = !isCron && cacheAge < CACHE_TTL_MS;

      if (cacheValid) {
        total = cached!.total;
      } else {
        total = await fetchPlayCount(trackId);
        fetchedLive = true;
        await redis.set(liveKey, { total, ts: Date.now() });

        if (prev && total > prev.total) {
          const gap = daysBetween(prev.date, todayLabel);
          if (gap >= 1) {
            const dailyStreams = total - prev.total;
            const existing = history.find(h => h.date === prev.date);
            if (!existing) {
              const entry: HistEntry = { date: prev.date, streams: dailyStreams };
              if (gap > 1) entry.note = `${gap}-day gap`;
              history.push(entry);
            } else {
              existing.streams = dailyStreams;
            }
            if (history.length > 60) history.shift();
            await redis.set(histKey, history);
          }
        }

        await redis.set(prevKey, { total, date: todayLabel });
      }

      results[name] = { total, history };
    } catch (e: unknown) {
      console.error(`streams: ${name}:`, (e as Error).message);
      results[name] = { total: 0, history: [] };
    }
  }

  return NextResponse.json(
    { ...results, _meta: { updatedAt: new Date().toISOString(), live: fetchedLive } },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      },
    }
  );
}
