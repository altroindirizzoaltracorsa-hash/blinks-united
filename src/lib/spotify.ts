const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID!
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!
const SCOPES        = 'user-read-recently-played user-read-private user-read-email'

function redirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/spotify/callback`
}

function basicAuth() {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
}

export function getAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'code',
    redirect_uri:  redirectUri(),
    scope:         SCOPES,
    state,
  })
  return `https://accounts.spotify.com/authorize?${params}`
}

export async function exchangeCode(code: string) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
  })
  return res.json()
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  return res.json()
}

export async function getSpotifyUser(accessToken: string) {
  const res  = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { error: text.slice(0, 200) } }
}

export async function getRecentlyPlayed(accessToken: string, after: number) {
  const params = new URLSearchParams({ limit: '50' })
  if (after > 0) params.set('after', String(after))
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/recently-played?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  return res.json()
}
