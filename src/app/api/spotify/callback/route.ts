import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode, getSpotifyUser } from '@/lib/spotify'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code   = searchParams.get('code')
  const userId = searchParams.get('state')
  const error  = searchParams.get('error')

  const dashboard = new URL('/dashboard', req.url)

  if (error || !code || !userId) {
    dashboard.searchParams.set('error', 'spotify_auth')
    return NextResponse.redirect(dashboard)
  }

  const tokens = await exchangeCode(code)
  if (!tokens.access_token) {
    dashboard.searchParams.set('error', 'spotify_token')
    return NextResponse.redirect(dashboard)
  }

  const spotifyUser = await getSpotifyUser(tokens.access_token)
  if (!spotifyUser.id) {
    dashboard.searchParams.set('error', 'spotify_user')
    return NextResponse.redirect(dashboard)
  }

  await supabaseAdmin.from('spotify_accounts').upsert(
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

  dashboard.searchParams.set('success', 'spotify_linked')
  return NextResponse.redirect(dashboard)
}
