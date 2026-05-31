import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

const TRACKS: Record<string, string> = {
  jump:     '5H1sKFMzDeMtXwND3V6hRY',
  shutdown: '6tCd8bPvYnceDG7W9M1RMk',
  ddududu:  '69BIczdH6QMnFx7dsSssN8',
};

const LIVE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

type HistEntry = { date: string; streams: number; note?: string };
type LiveCache = { total: number; ts: number };
type PrevSnap  = { total: number; date: string };
type TokenCache = { token: string; expiresAt: number };

// ── Anonymous Spotify token ───────────────────────────────────────────────────

async function getAnonToken(): Promise<string> {
  const cached = await redis.get<TokenCache>('sp_anon_token');
  if (cached?.token && cached.expiresAt > Date.now() + 120_000) {
    return cached.token;
  }

  const res = await fetch(
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
    {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'sp_t=1',
      },
      cache: 'no-store',
    }
  );
  if (!res.ok) throw new Error(`Spotify token ${res.status}`);

  const { accessToken, accessTokenExpirationTimestampMs } = await res.json();
  await redis.set<TokenCache>('sp_anon_token', {
    token: accessToken,
    expiresAt: accessTokenExpirationTimestampMs,
  });
  return accessToken as string;
}

// ── Primary: Spotify internal partner GraphQL API ────────────────────────────

async function fetchViaPartnerAPI(trackId: string, token: string): Promise<number> {
  const variables  = encodeURIComponent(JSON.stringify({ uri: `spotify:track:${trackId}`, locale: '' }));
  const extensions = encodeURIComponent(JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: 'ae85b52abb74d20a4c331d4143d4772c95f34757' },
  }));

  const res = await fetch(
    `https://api-partner.spotify.com/pathfinder/v1/query?operationName=getTrack&variables=${variables}&extensions=${extensions}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': UA,
        'Accept': 'application/json',
        'App-Platform': 'WebPlayer',
      },
      cache: 'no-store',
    }
  );

  if (res.status === 401) {
    await redis.del('sp_anon_token');
    throw new Error('Spotify token expired (401)');
  }
  if (!res.ok) throw new Error(`Partner API ${res.status}`);

  const data = await res.json();
  const raw  = data?.data?.trackUnion?.playcount as string | undefined;
  if (!raw) throw new Error('playcount missing from partner API response');
  return Number(raw);
}

// ── Fallback: scrape open.spotify.com/track page ─────────────────────────────

async function fetchViaHTMLScrape(trackId: string): Promise<number> {
  const res = await fetch(`https://open.spotify.com/track/${trackId}`, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTML scrape ${res.status}`);
  const html = await res.text();

  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
  if (!match) throw new Error('__NEXT_DATA__ not found');

  const nextData = JSON.parse(match[1]);
  const entity   = nextData?.props?.pageProps?.state?.data?.entity;
  const raw      = entity?.playcount ?? entity?.play_count;
  if (!raw) throw new Error('playcount not in __NEXT_DATA__');
  return Number(raw);
}

// ── Play count with automatic fallback ───────────────────────────────────────

async function fetchPlayCount(trackId: string, token: string | null): Promise<number> {
  if (token) {
    try {
      return await fetchViaPartnerAPI(trackId, token);
    } catch (e: unknown) {
      console.warn(`streams: partner API failed (${trackId}) — falling back to HTML scrape:`, (e as Error).message);
    }
  }
  return fetchViaHTMLScrape(trackId);
}

// ── Date helpers ──────────────────────────────────────────────────────────────

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
  return Math.round((parseDateLabel(labelB).getTime() - parseDateLabel(labelA).getTime()) / 86_400_000);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isCron = searchParams.get('cron') === '1';

  if (isCron) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const todayLabel = getDateLabel(new Date());
  const results: Record<string, { total: number; history: HistEntry[] }> = {};
  let fetchedLive = false;

  let token: string | null = null;
  try {
    token = await getAnonToken();
  } catch (e: unknown) {
    console.warn('streams: token unavailable, will use HTML scrape:', (e as Error).message);
  }

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

      const cacheAge   = cached?.ts ? Date.now() - cached.ts : Infinity;
      const cacheValid = !isCron && cacheAge < LIVE_CACHE_TTL_MS;

      if (cacheValid) {
        total = cached!.total;
      } else {
        total       = await fetchPlayCount(trackId, token);
        fetchedLive = true;
        await redis.set(liveKey, { total, ts: Date.now() });

        if (prev && total > prev.total) {
          const gap = daysBetween(prev.date, todayLabel);
          if (gap >= 1) {
            const dailyStreams = total - prev.total;
            const existing    = history.find(h => h.date === prev.date);
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
      const stale   = await redis.get<LiveCache>(`bp_live_${name}`);
      const history = await redis.get<HistEntry[]>(`bp_hist_${name}`);
      results[name] = { total: stale?.total || 0, history: history || [] };
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
