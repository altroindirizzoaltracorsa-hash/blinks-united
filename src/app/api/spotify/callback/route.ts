import { NextRequest, NextResponse } from 'next/server'
import { getSpotifyUser } from '@/lib/spotify'
import { supabaseAdmin } from '@/lib/supabase'

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID!
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!

async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  return res.json()
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code   = searchParams.get('code')
  const userId = searchParams.get('state')
  const error  = searchParams.get('error')

  const dashboard  = new URL('/dashboard', 'https://blinks-united.vercel.app')

  if (error || !code || !userId) {
    dashboard.searchParams.set('error', 'spotify_auth')
    return NextResponse.redirect(dashboard)
  }

  const redirectUri = 'https://blinks-united.vercel.app/api/spotify/callback'
  const tokens      = await exchangeCode(code, redirectUri)

  if (!tokens.access_token) {
    dashboard.searchParams.set('error', 'spotify_token')
    return NextResponse.redirect(dashboard)
  }

  const spotifyUser = await getSpotifyUser(tokens.access_token)
  if (!spotifyUser.id) {
    dashboard.searchParams.set('error', 'spotify_user')
    return NextResponse.redirect(dashboard)
  }

  // Ensure profile exists before inserting spotify_accounts (FK constraint)
  await supabaseAdmin.from('profiles').upsert(
    { id: userId, username: userId.slice(5, 13) },
    { onConflict: 'id', ignoreDuplicates: true },
  )

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
    console.error('spotify_accounts upsert error:', upsertError)
    dashboard.searchParams.set('error', 'db_error')
    return NextResponse.redirect(dashboard)
  }

  dashboard.searchParams.set('success', 'spotify_linked')
  return NextResponse.redirect(dashboard)
}
