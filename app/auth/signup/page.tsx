'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/lib/auth/AuthContext'
import AuthLayout from '@/app/components/auth/AuthLayout'
import SignUpForm from '@/app/components/auth/SignUpForm'

export default function SignUpPage() {
  const { user, loading, hasCompletedOnboarding, profileStatus } = useAuth()
  const router = useRouter()

  // Redirect authenticated users
  useEffect(() => {
    if (!loading && user) {
      if (profileStatus === 'ready' && !hasCompletedOnboarding) {
        router.push('/onboarding')
      } else if (profileStatus !== 'loading') {
        router.push('/dashboard')
      }
    }
  }, [user, loading, hasCompletedOnboarding, profileStatus, router])

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    )
  }

  // Don't render if user is authenticated (will redirect)
  if (user) {
    return null
  }

  return (
    <AuthLayout
      title="Create Your Account"
      subtitle="Join SociusFit and start your holistic fitness journey"
    >
      <SignUpForm />
    </AuthLayout>
  )
}
