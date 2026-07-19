import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Server-side Supabase client for use in API routes and server components.
// Cookie-scoped: it acts AS the signed-in user, so RLS applies. Correct for
// any route that runs in a user's session; wrong for cron/system contexts
// that have no session (RLS then returns zero rows — see createServiceRoleClient).
export const createServerClient = async () => {
  return createServerComponentClient({ cookies })
}

/**
 * Service-role Supabase client for TRUSTED server-only contexts that have no
 * user session — Vercel Cron jobs and other system tasks that must operate
 * across all users. This key bypasses RLS, so this client must NEVER be
 * reachable from user input or a request whose identity isn't already trusted.
 *
 * Fails loudly if the key is missing rather than silently degrading: a
 * misconfigured deploy should error visibly, not quietly sync nobody (which is
 * exactly how the anon-client cron failed before).
 */
export const createServiceRoleClient = (): SupabaseClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      'createServiceRoleClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set'
    )
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
