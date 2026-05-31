import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export const revalidate = 60

type LeaderboardEntry = {
  id: string
  username: string
  avatar_url: string | null
  jump: number
  shutdown: number
  ddududu: number
  total: number
}

const PINK = '#ff69b4'

export default async function HomePage() {
  const { data: board } = await supabase
    .from('leaderboard_alltime')
    .select('*')
    .limit(50)

  const entries: LeaderboardEntry[] = board || []

  return (
    <main>
      {/* Nav */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid #1f1f1f',
        position: 'sticky',
        top: 0,
        background: '#0a0a0a',
        zIndex: 10,
      }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: PINK, letterSpacing: '0.08em' }}>
          BLINKS UNITED
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <SignedOut>
            <SignInButton mode="modal">
              <button style={{
                background: 'transparent',
                border: '1px solid #333',
                color: '#ccc',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
              }}>
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button style={{
                background: PINK,
                border: 'none',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
              }}>
                Join
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard" style={{ fontSize: 13, color: PINK, fontWeight: 600 }}>
              Dashboard
            </Link>
            <UserButton />
          </SignedIn>
        </div>
      </nav>

      {/* Leaderboard */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>
          All-Time Leaderboard
        </h1>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 32 }}>
          Total BLACKPINK streams contributed across all linked Spotify accounts
        </p>

        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#444', padding: '80px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎧</div>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No streamers yet</p>
            <p style={{ fontSize: 13 }}>Sign up, link your Spotify, and be first on the board!</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', width: 40 }}>#</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>User</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>JUMP</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Shut Down</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>DDU-DU</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr
                    key={e.id}
                    style={{ borderBottom: '1px solid #141414' }}
                  >
                    <td style={{
                      padding: '13px 10px',
                      fontWeight: 700,
                      color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#444',
                    }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '13px 10px', fontWeight: 600 }}>{e.username}</td>
                    <td style={{ padding: '13px 10px', textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>
                      {e.jump.toLocaleString()}
                    </td>
                    <td style={{ padding: '13px 10px', textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>
                      {e.shutdown.toLocaleString()}
                    </td>
                    <td style={{ padding: '13px 10px', textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>
                      {e.ddududu.toLocaleString()}
                    </td>
                    <td style={{ padding: '13px 10px', textAlign: 'right', fontWeight: 700, color: PINK, fontVariantNumeric: 'tabular-nums' }}>
                      {e.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
