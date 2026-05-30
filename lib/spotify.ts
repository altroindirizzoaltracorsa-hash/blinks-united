const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

// Set SPOTIFY_SP_DC to your Spotify sp_dc cookie value for more reliable play counts.
// Get it from browser DevTools → Application → Cookies → open.spotify.com → sp_dc
const SP_DC = process.env.SPOTIFY_SP_DC;

export const TRACKS: Record<string, string> = {
  jump:     process.env.SPOTIFY_TRACK_JUMP     ?? '',
  shutdown: process.env.SPOTIFY_TRACK_SHUTDOWN ?? '',
  ddududu:  process.env.SPOTIFY_TRACK_DDUDUDU  ?? '',
};

// ── Token management ──────────────────────────────────────────────────────────

let officialToken: { value: string; exp: number } | null = null;

async function getOfficialToken(): Promise<string> {
  if (officialToken && Date.now() < officialToken.exp) return officialToken.value;
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
  const { access_token, expires_in } = await res.json();
  officialToken = { value: access_token, exp: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

let webToken: { value: string; exp: number } | null = null;

async function getWebPlayerToken(): Promise<string | null> {
  if (webToken && Date.now() < webToken.exp) return webToken.value;
  try {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json',
    };
    // sp_dc cookie unlocks higher-fidelity data from the partner API
    if (SP_DC) headers.Cookie = `sp_dc=${SP_DC}`;

    const res = await fetch('https://open.spotify.com/api/token', {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const { accessToken, accessTokenExpirationTimestampMs } = await res.json();
    webToken = {
      value: accessToken,
      exp: accessTokenExpirationTimestampMs - 60_000,
    };
    return accessToken;
  } catch {
    return null;
  }
}

// ── Play count fetching ───────────────────────────────────────────────────────

// Unofficial Spotify partner GraphQL API — returns playcount.
// The sha256Hash identifies the `getTrack` persisted query in Spotify's app bundle.
// If play counts return null, this hash may have rotated; check the network tab
// on open.spotify.com and look for /pathfinder/v1/query?operationName=getTrack.
const GET_TRACK_HASH = 'ae85b52abb74d20a4c331d4143d4772c95f34757bfa8c625474b912b9055b5c0';

async function fetchPlayCountViaPartnerApi(
  trackId: string,
  token: string,
): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      operationName: 'getTrack',
      variables: JSON.stringify({ uri: `spotify:track:${trackId}` }),
      extensions: JSON.stringify({
        persistedQuery: { version: 1, sha256Hash: GET_TRACK_HASH },
      }),
    });
    const res = await fetch(
      `https://api-partner.spotify.com/pathfinder/v1/query?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const body = await res.json();
    const raw = body?.data?.trackUnion?.playcount;
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

async function fetchPlayCountViaHtmlScrape(trackId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://open.spotify.com/track/${trackId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Spotify SSR embeds page state in __NEXT_DATA__
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (match) {
      try {
        const blob = JSON.parse(match[1]);
        const entity = blob?.props?.pageProps?.state?.data?.entity;
        if (entity?.playcount) return parseInt(entity.playcount, 10);
      } catch { /* malformed JSON */ }
    }

    // Broad fallback: any "playcount":"digits" occurrence in the HTML
    const raw = html.match(/"playcount"\s*:\s*"(\d+)"/);
    if (raw) return parseInt(raw[1], 10);

    return null;
  } catch {
    return null;
  }
}

// ── Public types & API ────────────────────────────────────────────────────────

export interface TrackData {
  id: string;
  name: string;
  artist: string;
  /** Spotify popularity score 0–100, always available via the official API */
  popularity: number;
  /** Total all-time streams; null when all scraping methods fail */
  playCount: number | null;
  fetchedAt: string;
}

export async function fetchTrackData(trackId: string): Promise<TrackData> {
  const [official, webPlayerToken] = await Promise.all([
    getOfficialToken(),
    getWebPlayerToken(),
  ]);

  const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${official}` },
  });
  if (!trackRes.ok) throw new Error(`Track ${trackId}: ${trackRes.status}`);
  const track = await trackRes.json();

  // Try partner API first (fastest), then HTML scraping as fallback
  let playCount: number | null = null;
  if (webPlayerToken) {
    playCount = await fetchPlayCountViaPartnerApi(trackId, webPlayerToken);
  }
  if (playCount === null) {
    playCount = await fetchPlayCountViaHtmlScrape(trackId);
  }

  return {
    id: trackId,
    name: track.name,
    artist: (track.artists as Array<{ name: string }>)[0]?.name ?? 'Unknown',
    popularity: track.popularity,
    playCount,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchAllTracks(): Promise<Record<string, TrackData | null>> {
  const results: Record<string, TrackData | null> = {};
  await Promise.all(
    Object.entries(TRACKS).map(async ([key, trackId]) => {
      if (!trackId) {
        results[key] = null;
        return;
      }
      try {
        results[key] = await fetchTrackData(trackId);
      } catch (err) {
        console.error(`[spotify] Failed to fetch ${key}:`, err);
        results[key] = null;
      }
    }),
  );
  return results;
}
