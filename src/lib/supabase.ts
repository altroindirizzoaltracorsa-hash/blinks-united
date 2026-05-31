import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const svc  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Public client — respects RLS, safe in browser
export const supabase = createClient(url, anon)

// Admin client — bypasses RLS, server-side only
export const supabaseAdmin = createClient(url, svc)
