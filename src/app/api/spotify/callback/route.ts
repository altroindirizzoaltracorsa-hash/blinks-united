import { NextRequest, NextResponse } from 'next/server'
import { getSpotifyUser } from '@/lib/spotify'
import { supabaseAdmin } from '@/lib/supabase'

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID!
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!
const REDIRECT_URI  = 'https://blinks-united.vercel.app/api/spotify/callback'

async function exchangeCode(code: string) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  })
  return res.json()
}

export async function GET(req: NextRequest) {
  const dashboard = new URL('/dashboard', 'https://blinks-united.vercel.app')

  try {
    const { searchParams } = req.nextUrl
    const code   = searchParams.get('code')
    const userId = searchParams.get('state')
    const error  = searchParams.get('error')

    if (error || !code || !userId) {
      dashboard.searchParams.set('error', `spotify_auth:${error || 'no_code'}`)
      return NextResponse.redirect(dashboard)
    }

    const tokens = await exchangeCode(code)
    if (!tokens.access_token) {
      dashboard.searchParams.set('error', `spotify_token:${tokens.error || 'no_token'}`)
      return NextResponse.redirect(dashboard)
    }

    const spotifyUser = await getSpotifyUser(tokens.access_token)
    if (!spotifyUser.id) {
      dashboard.searchParams.set('error', `spotify_user:${JSON.stringify(spotifyUser)}`)
      return NextResponse.redirect(dashboard)
    }

    // Ensure profile exists before FK insert
    await supabaseAdmin
      .from('profiles')
      .upsert({ id: userId, username: userId.slice(5, 13) }, { onConflict: 'id', ignoreDuplicates: true })

    const { error: upsertError } = await supabaseAdmin.from('spotify_accounts').upsert(
      {
        user_id:         userId,
        spotify_user_id: spotifyUser.id,
        display_name:    spotifyUser.display_name ?? null,
        access_token:    tokens.access_token,
        refresh_token:   tokens.refresh_token,
        expires_at:      new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        last_cursor:     0,
      },
      { onConflict: 'user_id,spotify_user_id' },
    )

    if (upsertError) {
      dashboard.searchParams.set('error', `db:${upsertError.code}:${upsertError.message}`)
      return NextResponse.redirect(dashboard)
    }

    dashboard.searchParams.set('success', 'spotify_linked')
    return NextResponse.redirect(dashboard)

  } catch (e: any) {
    console.error('Spotify callback fatal error:', e)
    dashboard.searchParams.set('error', `fatal:${e?.message || 'unknown'}`)
    return NextResponse.redirect(dashboard)
  }
}
