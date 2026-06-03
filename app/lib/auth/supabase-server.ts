import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Server-side Supabase client for use in API routes and server components
export const createServerClient = async () => {
  return createServerComponentClient({ cookies })
}
