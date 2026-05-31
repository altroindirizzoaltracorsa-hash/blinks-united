import { auth, currentUser } from '@clerk/nextjs/server'
import { UserButton } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { TRACK_LABELS } from '@/lib/tracks'
import RefreshButton from './RefreshButton'

const PINK = '#ff69b4'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string }
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const clerkUser = await currentUser()

  // Upsert profile (lazy creation)
  const username =
    clerkUser?.username ||
    clerkUser?.firstName ||
    clerkUser?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
    userId.slice(5, 13)

  await supabaseAdmin.from('profiles').upsert(
    { id: userId, username, avatar_url: clerkUser?.imageUrl ?? null },
    { onConflict: 'id', ignoreDuplicates: true },
  )

  // Linked Spotify accounts (no tokens returned)
  const { data: spotifyAccounts } = await supabaseAdmin
    .from('spotify_accounts')
    .select('id, display_name, spotify_user_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  // Stream counts (last 7 days)
  const { data: recentCounts } = await supabaseAdmin
    .from('stream_counts')
    .select('date, jump, shutdown, ddududu, total')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(7)

  // All-time totals
  const { data: alltime } = await supabaseAdmin
    .from('leaderboard_alltime')
    .select('jump, shutdown, ddududu, total')
    .eq('id', userId)
    .single()

  const accounts = spotifyAccounts || []
  const recent   = recentCounts   || []

  return (
    <main>
      {/* Nav */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid #1f1f1f',
        background: '#0a0a0a',
      }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: 17, color: PINK, letterSpacing: '0.08em' }}>
          BLINKS UNITED
        </Link>
        <UserButton />
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 24px' }}>
        {/* Feedback banners */}
        {searchParams.success === 'spotify_linked' && (
          <div style={{ background: '#0d2b1d', border: '1px solid #1e5c38', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#4caf50' }}>
            Spotify account linked successfully!
          </div>
        )}
        {searchParams.error && (
          <div style={{ background: '#2b0d0d', border: '1px solid #5c1e1e', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#f44' }}>
            Error linking Spotify account. Please try again.
          </div>
        )}

        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Your Dashboard</h1>
        <p style={{ color: '#555', fontSize: 13, marginBottom: 32 }}>@{username}</p>

        {/* All-time stats */}
        {alltime && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 36 }}>
            {(['jump', 'shutdown', 'ddududu'] as const).map(key => (
              <div key={key} style={{ background: '#111', borderRadius: 10, padding: '16px 14px' }}>
                <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  {TRACK_LABELS[key]}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {(alltime[key] as number).toLocaleString()}
                </div>
              </div>
            ))}
            <div style={{ background: '#1a0d11', border: `1px solid ${PINK}33`, borderRadius: 10, padding: '16px 14px' }}>
              <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Total
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: PINK, fontVariantNumeric: 'tabular-nums' }}>
                {(alltime.total as number).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Spotify accounts */}
        <section style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Linked Spotify Accounts</h2>
            <a
              href="/api/spotify/connect"
              style={{
                background: '#1DB954',
                color: '#fff',
                padding: '7px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-block',
              }}
            >
              + Add Account
            </a>
          </div>

          {accounts.length === 0 ? (
            <div style={{ background: '#111', borderRadius: 10, padding: '24px', textAlign: 'center', color: '#444', fontSize: 13 }}>
              No Spotify accounts linked yet.<br />Click <strong style={{ color: '#ccc' }}>+ Add Account</strong> to connect your first one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {accounts.map((acc: any) => (
                <div key={acc.id} style={{
                  background: '#111',
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{acc.display_name || acc.spotify_user_id}</div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                      {acc.spotify_user_id} · linked {new Date(acc.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={{ color: '#1DB954', fontSize: 11, fontWeight: 600 }}>● Connected</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Refresh + recent history */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Recent Streams (last 7 days)</h2>
            <RefreshButton />
          </div>

          {recent.length === 0 ? (
            <div style={{ background: '#111', borderRadius: 10, padding: '24px', textAlign: 'center', color: '#444', fontSize: 13 }}>
              No stream data yet. Link a Spotify account then hit Refresh.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>JUMP</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Shut Down</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>DDU-DU</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row: any) => (
                  <tr key={row.date} style={{ borderBottom: '1px solid #141414' }}>
                    <td style={{ padding: '11px 10px', color: '#aaa' }}>{row.date}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.jump}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.shutdown}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.ddududu}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', fontWeight: 700, color: PINK, fontVariantNumeric: 'tabular-nums' }}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  )
}
