import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// Client-side Supabase client for use in components
export const createClient = () => {
  return createClientComponentClient()
}

// Type definitions for our database
export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          user_id: string
          fitness_goals: string[]
          activity_level: string
          body_metrics: Record<string, any>
          preferences: Record<string, any>
          medical_conditions: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          fitness_goals?: string[]
          activity_level?: string
          body_metrics?: Record<string, any>
          preferences?: Record<string, any>
          medical_conditions?: string[]
        }
        Update: {
          fitness_goals?: string[]
          activity_level?: string
          body_metrics?: Record<string, any>
          preferences?: Record<string, any>
          medical_conditions?: string[]
        }
      }
    }
  }
}