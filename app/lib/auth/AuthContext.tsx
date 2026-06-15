'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { User, Session } from '@supabase/auth-helpers-nextjs'
import { createClient } from './supabase'
import { AuthContextType, UserProfile, DatabaseUserProfile } from './types'
import { sessionCleanupService } from './session-cleanup-service'
import { sessionSyncService } from './session-sync-service'
import { authErrorLogger } from './auth-error-logger'

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const PROFILE_FETCH_TIMEOUT_MS = process.env.NODE_ENV === 'test' ? 50 : 5000

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
  const [profileStatus, setProfileStatus] = useState<AuthContextType['profileStatus']>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [whoopConnected, setWhoopConnected] = useState(false)
  const [whoopTokensValid, setWhoopTokensValid] = useState(false)
  const whoopInitRequestIdRef = useRef(0)
  const profileRequestIdRef = useRef(0)
  const supabase = useMemo(() => createClient(), [])

  // Convert database profile to client profile format
  const convertDatabaseProfile = useCallback((dbProfile: DatabaseUserProfile): UserProfile => {
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
  }, [])

  // Fetch user profile from database
  const fetchProfile = useCallback(async (userId: string) => {
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
            throw createError
          }

          return convertDatabaseProfile(newProfile)
        } else {
          throw error
        }
      }

      return convertDatabaseProfile(data)
    } catch (error) {
      console.error('Error in fetchProfile:', error)
      throw error
    }
  }, [convertDatabaseProfile, supabase])

  const loadProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    const requestId = profileRequestIdRef.current + 1
    profileRequestIdRef.current = requestId
    setProfileStatus('loading')
    setProfileError(null)

    const profilePromise = fetchProfile(userId)

    void profilePromise
      .then((loadedProfile) => {
        if (profileRequestIdRef.current !== requestId) {
          return
        }

        setProfile(loadedProfile)
        setProfileStatus('ready')
        setProfileError(null)
      })
      .catch((error) => {
        if (profileRequestIdRef.current !== requestId) {
          return
        }

        const message = error instanceof Error ? error.message : 'Failed to load profile'
        setProfile(null)
        setProfileStatus('error')
        setProfileError(message)
      })

    const timeoutPromise = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), PROFILE_FETCH_TIMEOUT_MS)
    })

    let loadedProfile: UserProfile | null = null
    try {
      loadedProfile = await Promise.race([profilePromise, timeoutPromise])
    } catch {
      return null
    }

    if (loadedProfile === null && profileRequestIdRef.current === requestId) {
      setProfile(null)
      setProfileStatus('error')
      setProfileError('Profile lookup timed out')
    }

    return loadedProfile
  }, [fetchProfile])

  // Shared helper: call /api/whoop/initialize and update state
  const callWhoopInitialize = useCallback(async (): Promise<void> => {
    const requestId = whoopInitRequestIdRef.current + 1
    whoopInitRequestIdRef.current = requestId

    try {
      const response = await fetch('/api/whoop/initialize', { method: 'POST' })
      if (whoopInitRequestIdRef.current !== requestId) {
        return
      }

      if (response.ok) {
        const { initialized } = await response.json()
        if (whoopInitRequestIdRef.current !== requestId) {
          return
        }

        setWhoopConnected(initialized)
        setWhoopTokensValid(initialized)
        if (initialized) console.log('[AuthContext] WHOOP connection initialized successfully')
      } else {
        setWhoopConnected(false)
        setWhoopTokensValid(false)
      }
    } catch (whoopError) {
      if (whoopInitRequestIdRef.current !== requestId) {
        return
      }

      authErrorLogger.logTokenOperationFailure({
        operation: 'initializeConnection',
        component: 'AuthContext',
        error: whoopError,
      })
      setWhoopConnected(false)
      setWhoopTokensValid(false)
    }
  }, [])

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Get initial session
        const { data: { session: initialSession } } = await supabase.auth.getSession()

        if (initialSession?.user) {
          setUser(initialSession.user)
          setSession(initialSession)

          // WHOOP status is supplemental and must not block auth-gated pages.
          void callWhoopInitialize()

          await loadProfile(initialSession.user.id)
          setLoading(false)
        } else {
          // No session, set loading to false immediately
          profileRequestIdRef.current += 1
          setProfile(null)
          setProfileStatus('idle')
          setProfileError(null)
          setLoading(false)
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        setLoading(false)
      }
    }

    initializeAuth()

    // Initialize cross-tab session sync
    sessionSyncService.initialize()
    sessionSyncService.onSessionChange(async (event) => {
      if (event === 'logout') {
        whoopInitRequestIdRef.current += 1
        profileRequestIdRef.current += 1
        setUser(null)
        setProfile(null)
        setProfileStatus('idle')
        setProfileError(null)
        setSession(null)
        setWhoopConnected(false)
        setWhoopTokensValid(false)
      } else if (event === 'login' || event === 'token_refresh') {
        // Re-fetch session from Supabase
        const { data: { session: refreshedSession } } = await supabase.auth.getSession()
        if (refreshedSession?.user) {
          setUser(refreshedSession.user)
          setSession(refreshedSession)
          void callWhoopInitialize()
          await loadProfile(refreshedSession.user.id)
        }
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          // Initialize WHOOP status in the background when user signs in.
          void callWhoopInitialize()

          await loadProfile(session.user.id)
        } else {
          // Clear profile and WHOOP state when user signs out
          whoopInitRequestIdRef.current += 1
          profileRequestIdRef.current += 1
          setProfile(null)
          setProfileStatus('idle')
          setProfileError(null)
          setWhoopConnected(false)
          setWhoopTokensValid(false)
        }

        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
      sessionSyncService.cleanup()
    }
  }, [callWhoopInitialize, loadProfile, supabase])

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
        authErrorLogger.logSignOutFailure({
          userId: user?.id,
          step: 'cleanup',
          component: 'AuthContext',
          error: result.errors.join('; '),
          stepsCompleted: result.steps,
        })
      }

      // Broadcast logout to other tabs
      sessionSyncService.broadcastSessionChange('logout')

      // Reset AuthContext state
      setUser(null)
      setProfile(null)
      setProfileStatus('idle')
      setProfileError(null)
      setSession(null)
      whoopInitRequestIdRef.current += 1
      profileRequestIdRef.current += 1
      setWhoopConnected(false)
      setWhoopTokensValid(false)

      // Redirect to login
      window.location.href = '/auth/signin'
    } catch (error) {
      authErrorLogger.logSignOutFailure({
        userId: user?.id,
        step: 'signOut',
        component: 'AuthContext',
        error,
        stepsCompleted: {},
      })

      // Even if cleanup fails, reset state and redirect
      setUser(null)
      setProfile(null)
      setProfileStatus('idle')
      setProfileError(null)
      setSession(null)
      whoopInitRequestIdRef.current += 1
      profileRequestIdRef.current += 1
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
    setProfileStatus('ready')
    setProfileError(null)

    return convertedProfile
  }

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!user) {
      return null
    }

    return loadProfile(user.id)
  }, [loadProfile, user])

  // Check if user has completed onboarding
  const hasCompletedOnboarding = profile ? (
    profile.bodyMetrics.height_cm !== undefined &&
    profile.bodyMetrics.weight_kg !== undefined &&
    profile.bodyMetrics.age !== undefined &&
    profile.fitnessGoals.length > 0
  ) : false

  // Initialize WHOOP connection manually (public API — delegates to shared helper)
  const initializeWhoopConnection = async () => {
    if (!user) {
      console.warn('[AuthContext] Cannot initialize WHOOP: no user')
      return
    }
    console.log('[AuthContext] Manually initializing WHOOP connection')
    await callWhoopInitialize()
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
    profileStatus,
    profileError,
    session,
    loading,
    whoopConnected,
    whoopTokensValid,
    signUp,
    signIn,
    signOut,
    updateProfile,
    refreshProfile,
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
