import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { refreshAccessToken, getRecentlyPlayed } from '@/lib/spotify'
import { BLACKPINK_TRACKS } from '@/lib/tracks'

type StreamsByDate = Record<string, { jump: number; shutdown: number; ddududu: number }>

async function getValidToken(account: Record<string, any>): Promise<string> {
  const expiresAt = new Date(account.expires_at).getTime()
  if (Date.now() < expiresAt - 60_000) return account.access_token

  const refreshed = await refreshAccessToken(account.refresh_token)
  if (!refreshed.access_token) throw new Error('Token refresh failed')

  await supabaseAdmin
    .from('spotify_accounts')
    .update({
      access_token: refreshed.access_token,
      expires_at:   new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
    })
    .eq('id', account.id)

  return refreshed.access_token
}

async function fetchStreamsForAccount(account: Record<string, any>): Promise<StreamsByDate> {
  const token     = await getValidToken(account)
  let   cursor    = account.last_cursor ?? 0
  let   maxCursor = cursor
  const byDate: StreamsByDate = {}

  // Paginate until we get < 50 results (no more history in this window)
  while (true) {
    const data  = await getRecentlyPlayed(token, cursor)
    const items: any[] = data.items ?? []
    if (items.length === 0) break

    for (const item of items) {
      const songKey = BLACKPINK_TRACKS[item.track?.id]
      if (!songKey) continue

      const playedAt = new Date(item.played_at)
      const date     = playedAt.toISOString().split('T')[0]
      const ms       = playedAt.getTime()

      if (!byDate[date]) byDate[date] = { jump: 0, shutdown: 0, ddududu: 0 }
      byDate[date][songKey]++
      if (ms > maxCursor) maxCursor = ms
    }

    if (items.length < 50) break
    // Move cursor forward to continue pagination
    const nextCursor = data.cursors?.after
    if (!nextCursor || Number(nextCursor) <= cursor) break
    cursor = Number(nextCursor)
  }

  if (maxCursor > (account.last_cursor ?? 0)) {
    await supabaseAdmin
      .from('spotify_accounts')
      .update({ last_cursor: maxCursor })
      .eq('id', account.id)
  }

  return byDate
}

async function refreshForUser(userId: string) {
  const { data: accounts } = await supabaseAdmin
    .from('spotify_accounts')
    .select('*')
    .eq('user_id', userId)

  if (!accounts || accounts.length === 0) return

  // Aggregate streams from all linked accounts
  const combined: StreamsByDate = {}
  for (const acc of accounts) {
    try {
      const streams = await fetchStreamsForAccount(acc)
      for (const [date, counts] of Object.entries(streams)) {
        if (!combined[date]) combined[date] = { jump: 0, shutdown: 0, ddududu: 0 }
        combined[date].jump     += counts.jump
        combined[date].shutdown += counts.shutdown
        combined[date].ddududu  += counts.ddududu
      }
    } catch (e: any) {
      console.error(`streams refresh: account ${acc.id}:`, e.message)
    }
  }

  // Upsert into stream_counts (add to existing counts so we don't overwrite)
  for (const [date, counts] of Object.entries(combined)) {
    const { data: existing } = await supabaseAdmin
      .from('stream_counts')
      .select('jump, shutdown, ddududu')
      .eq('user_id', userId)
      .eq('date', date)
      .single()

    if (existing) {
      await supabaseAdmin
        .from('stream_counts')
        .update({
          jump:       existing.jump     + counts.jump,
          shutdown:   existing.shutdown + counts.shutdown,
          ddududu:    existing.ddududu  + counts.ddududu,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('date', date)
    } else {
      await supabaseAdmin.from('stream_counts').insert({
        user_id: userId,
        date,
        ...counts,
      })
    }
  }
}

// POST: manual refresh by signed-in user
export async function POST() {
  const { userId } = await auth()
  if (!userId) return new NextResponse('Unauthorized', { status: 401 })
  await refreshForUser(userId)
  return NextResponse.json({ ok: true })
}

// GET: Vercel cron (refreshes all users)
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { data: profiles } = await supabaseAdmin.from('profiles').select('id')
  const userIds = (profiles ?? []).map((p: any) => p.id)

  for (const userId of userIds) {
    await refreshForUser(userId)
  }

  return NextResponse.json({ ok: true, refreshed: userIds.length })
}
