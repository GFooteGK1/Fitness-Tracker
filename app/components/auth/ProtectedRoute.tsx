'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/lib/auth/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireOnboarding?: boolean
}

export default function ProtectedRoute({ 
  children, 
  requireOnboarding = false 
}: ProtectedRouteProps) {
  const { user, loading, hasCompletedOnboarding, profileStatus } = useAuth()
  const router = useRouter()
  const waitingForRequiredProfile = Boolean(user && requireOnboarding && profileStatus === 'loading')

  useEffect(() => {
    if (!loading && !waitingForRequiredProfile) {
      if (!user) {
        // Not authenticated, redirect to sign in
        router.push('/auth/signin')
      } else if (requireOnboarding && profileStatus === 'ready' && !hasCompletedOnboarding) {
        // Authenticated but onboarding not complete
        router.push('/onboarding')
      }
    }
  }, [user, loading, waitingForRequiredProfile, hasCompletedOnboarding, profileStatus, requireOnboarding, router])

  // Show loading while checking auth state
  if (loading || waitingForRequiredProfile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
          <p className="text-gray-600 dark:text-gray-400">
            {waitingForRequiredProfile ? 'Loading profile...' : 'Loading...'}
          </p>
        </div>
      </div>
    )
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null
  }

  // Don't render if onboarding required but not completed (will redirect)
  if (requireOnboarding && profileStatus === 'ready' && !hasCompletedOnboarding) {
    return null
  }

  return <>{children}</>
}
