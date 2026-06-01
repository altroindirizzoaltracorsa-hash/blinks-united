import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!
const SCOPES    = 'user-read-recently-played user-read-private user-read-email'

export async function GET(req: NextRequest) {
  const { userId } = auth()
  if (!userId) return new NextResponse('Unauthorized', { status: 401 })

  const origin      = new URL(req.url).origin
  const redirectUri = `${origin}/api/spotify/callback`

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         SCOPES,
    state:         userId,
  })

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`)
}
