import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CLIENT_ID      = process.env.SPOTIFY_CLIENT_ID!
const SCOPES         = 'user-read-recently-played user-read-private user-read-email'
const REDIRECT_URI   = 'https://blinks-united.vercel.app/api/spotify/callback'

export async function GET(req: NextRequest) {
  const { userId } = auth()
  if (!userId) return new NextResponse('Unauthorized', { status: 401 })

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'code',
    redirect_uri:  REDIRECT_URI,
    scope:         SCOPES,
    state:         userId,
  })

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`)
}
