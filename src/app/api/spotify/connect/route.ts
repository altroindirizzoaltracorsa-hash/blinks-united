import { auth } from '@clerk/nextjs/server'
import { getAuthUrl } from '@/lib/spotify'
import { NextResponse } from 'next/server'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return new NextResponse('Unauthorized', { status: 401 })
  return NextResponse.redirect(getAuthUrl(userId))
}
