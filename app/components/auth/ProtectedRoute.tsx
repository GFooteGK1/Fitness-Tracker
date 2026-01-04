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
  const { user, loading, hasCompletedOnboarding } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Not authenticated, redirect to sign in
        router.push('/auth/signin')
      } else if (requireOnboarding && !hasCompletedOnboarding) {
        // Authenticated but onboarding not complete
        router.push('/onboarding')
      }
    }
  }, [user, loading, hasCompletedOnboarding, requireOnboarding, router])

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null
  }

  // Don't render if onboarding required but not completed (will redirect)
  if (requireOnboarding && !hasCompletedOnboarding) {
    return null
  }

  return <>{children}</>
}