import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// Client-side Supabase client for use in components
export const createClient = () => {
  return createClientComponentClient()
}