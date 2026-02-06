'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/auth-helpers-nextjs'
import { createClient } from './supabase'
import { AuthContextType, UserProfile, DatabaseUserProfile } from './types'
import { sessionCleanupService } from './session-cleanup-service'

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
  const [whoopConnected, setWhoopConnected] = useState(false)
  const [whoopTokensValid, setWhoopTokensValid] = useState(false)
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
          
          // Initialize WHOOP connection on startup
          try {
            const response = await fetch('/api/whoop/initialize', {
              method: 'POST'
            })
            
            if (response.ok) {
              const { initialized } = await response.json()
              setWhoopConnected(initialized)
              setWhoopTokensValid(initialized)
              
              if (initialized) {
                console.log('[AuthContext] WHOOP connection initialized successfully')
              }
            } else {
              setWhoopConnected(false)
              setWhoopTokensValid(false)
            }
          } catch (whoopError) {
            console.error('[AuthContext] Failed to initialize WHOOP connection:', whoopError)
            setWhoopConnected(false)
            setWhoopTokensValid(false)
          }
          
          // Fetch user profile asynchronously but ensure loading state is handled
          fetchProfile(initialSession.user.id)
            .then(setProfile)
            .catch(error => {
              console.error('Error fetching profile:', error)
              setProfile(null)
            })
            .finally(() => {
              setLoading(false)
            })
        } else {
          // No session, set loading to false immediately
          setLoading(false)
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
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
          // Initialize WHOOP connection when user signs in
          try {
            const response = await fetch('/api/whoop/initialize', {
              method: 'POST'
            })
            
            if (response.ok) {
              const { initialized } = await response.json()
              setWhoopConnected(initialized)
              setWhoopTokensValid(initialized)
            } else {
              setWhoopConnected(false)
              setWhoopTokensValid(false)
            }
          } catch (whoopError) {
            console.error('[AuthContext] Failed to initialize WHOOP on auth change:', whoopError)
            setWhoopConnected(false)
            setWhoopTokensValid(false)
          }
          
          // Fetch profile asynchronously when user signs in
          fetchProfile(session.user.id)
            .then(setProfile)
            .catch(error => {
              console.error('Error fetching profile:', error)
              setProfile(null)
            })
        } else {
          // Clear profile and WHOOP state when user signs out
          setProfile(null)
          setWhoopConnected(false)
          setWhoopTokensValid(false)
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

  // Sign out function - uses SessionCleanupService
  const signOut = async () => {
    try {
      console.log('[AuthContext] Starting sign-out process')
      
      // Use comprehensive cleanup service
      const result = await sessionCleanupService.signOut()
      
      if (!result.success) {
        console.error('[AuthContext] Sign-out had errors:', result.errors)
        // Still proceed with state reset and redirect
      } else {
        console.log('[AuthContext] Sign-out completed successfully')
      }
      
      // Reset AuthContext state
      setUser(null)
      setProfile(null)
      setSession(null)
      setWhoopConnected(false)
      setWhoopTokensValid(false)
      
      // Redirect to login
      window.location.href = '/auth/signin'
    } catch (error) {
      console.error('[AuthContext] Sign-out error:', error)
      
      // Even if cleanup fails, reset state and redirect
      setUser(null)
      setProfile(null)
      setSession(null)
      setWhoopConnected(false)
      setWhoopTokensValid(false)
      
      window.location.href = '/auth/signin'
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

  // Initialize WHOOP connection manually
  const initializeWhoopConnection = async () => {
    if (!user) {
      console.warn('[AuthContext] Cannot initialize WHOOP: no user')
      return
    }
    
    try {
      console.log('[AuthContext] Manually initializing WHOOP connection')
      const response = await fetch('/api/whoop/initialize', {
        method: 'POST'
      })
      
      if (response.ok) {
        const { initialized } = await response.json()
        setWhoopConnected(initialized)
        setWhoopTokensValid(initialized)
        
        if (initialized) {
          console.log('[AuthContext] WHOOP connection initialized successfully')
        } else {
          console.log('[AuthContext] WHOOP connection not available')
        }
      } else {
        console.error('[AuthContext] Failed to initialize WHOOP connection')
        setWhoopConnected(false)
        setWhoopTokensValid(false)
      }
    } catch (error) {
      console.error('[AuthContext] Failed to initialize WHOOP connection:', error)
      setWhoopConnected(false)
      setWhoopTokensValid(false)
    }
  }

  // Refresh WHOOP tokens manually
  const refreshWhoopTokens = async () => {
    if (!user) {
      console.warn('[AuthContext] Cannot refresh WHOOP tokens: no user')
      return
    }
    
    try {
      console.log('[AuthContext] Refreshing WHOOP tokens')
      const response = await fetch('/api/whoop/refresh', {
        method: 'POST'
      })
      
      if (response.ok) {
        setWhoopTokensValid(true)
        setWhoopConnected(true)
        console.log('[AuthContext] WHOOP tokens refreshed successfully')
      } else {
        console.error('[AuthContext] Failed to refresh WHOOP tokens')
        setWhoopTokensValid(false)
        setWhoopConnected(false)
      }
    } catch (error) {
      console.error('[AuthContext] Failed to refresh WHOOP tokens:', error)
      setWhoopTokensValid(false)
      setWhoopConnected(false)
    }
  }

  // Disconnect WHOOP
  const disconnectWhoop = async () => {
    if (!user) {
      console.warn('[AuthContext] Cannot disconnect WHOOP: no user')
      return
    }
    
    try {
      console.log('[AuthContext] Disconnecting WHOOP')
      const response = await fetch('/api/whoop/disconnect', {
        method: 'POST'
      })
      
      if (response.ok) {
        setWhoopConnected(false)
        setWhoopTokensValid(false)
        console.log('[AuthContext] WHOOP disconnected successfully')
      } else {
        console.error('[AuthContext] Failed to disconnect WHOOP')
        throw new Error('Failed to disconnect WHOOP')
      }
    } catch (error) {
      console.error('[AuthContext] Failed to disconnect WHOOP:', error)
      throw error
    }
  }

  const value: AuthContextType = {
    user,
    profile,
    session,
    loading,
    whoopConnected,
    whoopTokensValid,
    signUp,
    signIn,
    signOut,
    updateProfile,
    hasCompletedOnboarding,
    initializeWhoopConnection,
    refreshWhoopTokens,
    disconnectWhoop
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}