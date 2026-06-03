'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/lib/auth/AuthContext'
import AuthLayout from '@/app/components/auth/AuthLayout'
import BodyMetricsForm from '@/app/components/profile/BodyMetricsForm'
import GoalsSelection from '@/app/components/profile/GoalsSelection'
import { BodyMetrics, UserPreferences, OnboardingRequest } from '@/app/lib/auth/types'

type OnboardingStep = 'welcome' | 'body-metrics' | 'goals' | 'complete'

export default function OnboardingPage() {
  const { user, profile, loading, updateProfile, hasCompletedOnboarding } = useAuth()
  const router = useRouter()

  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetrics>({})
  const [preferences, setPreferences] = useState<UserPreferences>({
    units: 'metric',
    notifications: true,
    privacy_level: 'private'
  })
  const [fitnessGoals, setFitnessGoals] = useState<string[]>([])
  const [activityLevel, setActivityLevel] = useState('moderately_active')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin')
    }
  }, [user, loading, router])

  // Redirect if onboarding already completed
  useEffect(() => {
    if (!loading && user && hasCompletedOnboarding) {
      router.push('/dashboard')
    }
  }, [user, loading, hasCompletedOnboarding, router])

  // Initialize with existing profile data if available
  useEffect(() => {
    if (profile) {
      setBodyMetrics(profile.bodyMetrics || {})
      setPreferences(prev => profile.preferences || prev)
      setFitnessGoals(profile.fitnessGoals || [])
      setActivityLevel(profile.activityLevel || 'moderately_active')
    }
  }, [profile])

  // Show loading while checking auth state
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    )
  }

  const validateBodyMetrics = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!bodyMetrics.height_cm || bodyMetrics.height_cm < 50 || bodyMetrics.height_cm > 300) {
      newErrors.height = 'Please enter a valid height'
    }

    if (!bodyMetrics.weight_kg || bodyMetrics.weight_kg < 20 || bodyMetrics.weight_kg > 500) {
      newErrors.weight = 'Please enter a valid weight'
    }

    if (!bodyMetrics.age || bodyMetrics.age < 13 || bodyMetrics.age > 120) {
      newErrors.age = 'Please enter a valid age'
    }

    if (!bodyMetrics.gender) {
      newErrors.gender = 'Please select your gender'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateGoals = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (fitnessGoals.length === 0) {
      newErrors.goals = 'Please select at least one fitness goal'
    }

    if (!activityLevel) {
      newErrors.activityLevel = 'Please select your activity level'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    setErrors({})

    if (currentStep === 'welcome') {
      setCurrentStep('body-metrics')
    } else if (currentStep === 'body-metrics') {
      if (validateBodyMetrics()) {
        setCurrentStep('goals')
      }
    } else if (currentStep === 'goals') {
      if (validateGoals()) {
        handleComplete()
      }
    }
  }

  const handleBack = () => {
    setErrors({})

    if (currentStep === 'goals') {
      setCurrentStep('body-metrics')
    } else if (currentStep === 'body-metrics') {
      setCurrentStep('welcome')
    }
  }

  const handleComplete = async () => {
    if (!validateBodyMetrics() || !validateGoals()) {
      return
    }

    setSaving(true)
    setErrors({})

    try {
      // Use the dedicated onboarding API endpoint
      const response = await fetch('/api/profile/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body_metrics: bodyMetrics,
          fitness_goals: fitnessGoals,
          activity_level: activityLevel,
          preferences: preferences
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete onboarding')
      }

      setCurrentStep('complete')

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)

    } catch (error: any) {
      console.error('Onboarding completion error:', error)
      setErrors({ general: error.message || 'Failed to complete onboarding' })
    } finally {
      setSaving(false)
    }
  }

  const getStepContent = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="text-center space-y-6">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Welcome to SociusFit!
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Let&apos;s set up your profile to provide personalized fitness and nutrition recommendations.
            </p>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-left">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                What makes SociusFit different:
              </h4>
              <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                <li className="flex items-center space-x-2">
                  <span>💪</span>
                  <span>Integrated workout and nutrition tracking</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span>🤖</span>
                  <span>AI-powered insights and recommendations</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span>📱</span>
                  <span>Mobile-first design for gym and kitchen use</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span>📊</span>
                  <span>Holistic progress tracking and correlations</span>
                </li>
              </ul>
            </div>
          </div>
        )

      case 'body-metrics':
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Tell us about yourself
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                This helps us calculate personalized targets and recommendations
              </p>
            </div>

            <BodyMetricsForm
              initialData={bodyMetrics}
              preferences={preferences}
              onDataChange={setBodyMetrics}
              onPreferencesChange={setPreferences}
              errors={errors}
            />
          </div>
        )

      case 'goals':
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                What are your goals?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Help us tailor your experience to your fitness objectives
              </p>
            </div>

            <GoalsSelection
              selectedGoals={fitnessGoals}
              selectedActivityLevel={activityLevel}
              onGoalsChange={setFitnessGoals}
              onActivityLevelChange={setActivityLevel}
              errors={errors}
            />
          </div>
        )

      case 'complete':
        return (
          <div className="text-center space-y-6">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              You&apos;re all set!
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Your profile has been created. Redirecting to your dashboard...
            </p>
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400"></div>
          </div>
        )

      default:
        return null
    }
  }

  const getProgressPercentage = () => {
    switch (currentStep) {
      case 'welcome': return 0
      case 'body-metrics': return 33
      case 'goals': return 66
      case 'complete': return 100
      default: return 0
    }
  }

  return (
    <AuthLayout
      title="Setup Your Profile"
      subtitle={`Step ${currentStep === 'welcome' ? 1 : currentStep === 'body-metrics' ? 2 : currentStep === 'goals' ? 3 : 4} of 3`}
      showLogo={false}
    >
      <div className="space-y-6">
        {/* Progress Bar */}
        {currentStep !== 'complete' && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>
        )}

        {/* General Error */}
        {errors.general && (
          <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">{errors.general}</p>
          </div>
        )}

        {/* Step Content */}
        {getStepContent()}

        {/* Navigation Buttons */}
        {currentStep !== 'complete' && (
          <div className="flex flex-col sm:flex-row justify-between space-y-3 sm:space-y-0 sm:space-x-3 pt-6">
            {currentStep !== 'welcome' && (
              <button
                onClick={handleBack}
                disabled={saving}
                className="px-6 py-3 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 font-medium text-base touch-target"
              >
                Back
              </button>
            )}

            <button
              onClick={handleNext}
              disabled={saving}
              className="flex-1 sm:flex-none bg-blue-600 dark:bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium text-base touch-target flex items-center justify-center"
            >
              {saving && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              )}
              {currentStep === 'welcome' ? 'Get Started' :
               currentStep === 'goals' ? (saving ? 'Completing...' : 'Complete Setup') :
               'Continue'}
            </button>
          </div>
        )}

        {/* Skip Option */}
        {currentStep === 'goals' && (
          <div className="text-center pt-2">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
            >
              Skip for now (you can complete this later)
            </button>
          </div>
        )}
      </div>
    </AuthLayout>
  )
}
