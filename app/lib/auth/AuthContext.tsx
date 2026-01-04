'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/auth-helpers-nextjs'
import { createClient } from './supabase'
import { AuthContextType, UserProfile, DatabaseUserProfile } from './types'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Convert database profile to client profile format
  const convertDatabaseProfile = (dbProfile: DatabaseUserProfile): UserProfile => {
    return {
      userId: dbProfile.user_id,
      fitnessGoals: dbProfile.fitness_goals || [],
      activityLevel: dbProfile.activity_level as any,
      bodyMetrics: dbProfile.body_metrics || {},
      preferences: {
        units: 'metric',
        notifications: true,
        privacy_level: 'private',
        ...dbProfile.preferences
      },
      medicalConditions: dbProfile.medical_conditions || [],
      createdAt: new Date(dbProfile.created_at),
      updatedAt: new Date(dbProfile.updated_at)
    }
  }

  // Fetch user profile from database
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist, create one
          const defaultProfile = {
            user_id: userId,
            fitness_goals: [],
            activity_level: 'moderately_active',
            body_metrics: {},
            preferences: {
              units: 'metric',
              notifications: true,
              privacy_level: 'private'
            },
            medical_conditions: []
          }

          const { data: newProfile, error: createError } = await supabase
            .from('user_profiles')
            .insert(defaultProfile)
            .select()
            .single()

          if (createError) {
            console.error('Error creating profile:', createError)
            return null
          }

          return convertDatabaseProfile(newProfile)
        } else {
          console.error('Error fetching profile:', error)
          return null
        }
      }

      return convertDatabaseProfile(data)
    } catch (error) {
      console.error('Error in fetchProfile:', error)
      return null
    }
  }

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Get initial session
        const { data: { session: initialSession } } = await supabase.auth.getSession()
        
        if (initialSession?.user) {
          setUser(initialSession.user)
          setSession(initialSession)
          
          // Fetch user profile
          const userProfile = await fetchProfile(initialSession.user.id)
          setProfile(userProfile)
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          // Fetch profile when user signs in
          const userProfile = await fetchProfile(session.user.id)
          setProfile(userProfile)
        } else {
          // Clear profile when user signs out
          setProfile(null)
        }

        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Sign up function
  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    })

    if (error) {
      throw error
    }

    // Profile will be created automatically when the user is confirmed
    return data
  }

  // Sign in function
  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      throw error
    }

    return data
  }

  // Sign out function
  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      throw error
    }
  }

  // Update profile function
  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) {
      throw new Error('No authenticated user')
    }

    // Convert client format to database format
    const dbUpdates: any = {}
    
    if (updates.fitnessGoals !== undefined) {
      dbUpdates.fitness_goals = updates.fitnessGoals
    }
    if (updates.activityLevel !== undefined) {
      dbUpdates.activity_level = updates.activityLevel
    }
    if (updates.bodyMetrics !== undefined) {
      dbUpdates.body_metrics = updates.bodyMetrics
    }
    if (updates.preferences !== undefined) {
      dbUpdates.preferences = updates.preferences
    }
    if (updates.medicalConditions !== undefined) {
      dbUpdates.medical_conditions = updates.medicalConditions
    }

    // Use API endpoint instead of direct Supabase call
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dbUpdates),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to update profile')
    }

    const { profile: updatedProfile } = await response.json()

    // Update local profile state with the response data
    const convertedProfile = convertDatabaseProfile(updatedProfile)
    setProfile(convertedProfile)
    
    return convertedProfile
  }

  // Check if user has completed onboarding
  const hasCompletedOnboarding = profile ? (
    profile.bodyMetrics.height_cm !== undefined &&
    profile.bodyMetrics.weight_kg !== undefined &&
    profile.bodyMetrics.age !== undefined &&
    profile.fitnessGoals.length > 0
  ) : false

  const value: AuthContextType = {
    user,
    profile,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
    hasCompletedOnboarding
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}