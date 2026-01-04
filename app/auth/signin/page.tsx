'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/lib/auth/AuthContext'
import AuthLayout from '@/app/components/auth/AuthLayout'
import SignInForm from '@/app/components/auth/SignInForm'

export default function SignInPage() {
  const { user, loading, hasCompletedOnboarding } = useAuth()
  const router = useRouter()

  // Redirect authenticated users
  useEffect(() => {
    if (!loading && user) {
      if (hasCompletedOnboarding) {
        router.push('/dashboard')
      } else {
        router.push('/onboarding')
      }
    }
  }, [user, loading, hasCompletedOnboarding, router])

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
      title="Welcome Back"
      subtitle="Sign in to continue your fitness journey"
    >
      <SignInForm />
    </AuthLayout>
  )
}