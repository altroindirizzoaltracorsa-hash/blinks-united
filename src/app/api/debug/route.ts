import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  // Test 1: can we read profiles?
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, username')
    .limit(5)

  // Test 2: can we read spotify_accounts?
  const { data: accounts, error: accountsError } = await supabaseAdmin
    .from('spotify_accounts')
    .select('id, user_id')
    .limit(5)

  // Test 3: try inserting a test profile
  const testId = 'debug_test_user'
  const { error: insertError } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: testId, username: 'debug_test' }, { onConflict: 'id', ignoreDuplicates: true })

  // Clean up test profile
  await supabaseAdmin.from('profiles').delete().eq('id', testId)

  return NextResponse.json({
    env: {
      hasSupabaseUrl:    !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseAnon:   !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasSupabaseSvc:    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    profiles:      { data: profiles, error: profilesError },
    spotifyAccounts: { data: accounts, error: accountsError },
    insertTest:    { error: insertError },
  })
}
