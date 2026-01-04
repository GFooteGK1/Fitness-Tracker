'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/lib/auth/AuthContext'

// Helper function to get local date in YYYY-MM-DD format
function getLocalDate(offset = 0) {
  const now = new Date()
  now.setDate(now.getDate() + offset)
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper to format date nicely
function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetDate = new Date(date)
  targetDate.setHours(0, 0, 0, 0)
  
  const diffTime = targetDate.getTime() - today.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays === 1) return 'Tomorrow'
  
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function Home() {
  const { user, loading, hasCompletedOnboarding } = useAuth()
  const [selectedDate, setSelectedDate] = useState(getLocalDate())
  const [workoutText, setWorkoutText] = useState('')
  const [workoutLoading, setWorkoutLoading] = useState(false)
  const [error, setError] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Fetch workout when date changes (only if authenticated)
  useEffect(() => {
    if (user && hasCompletedOnboarding) {
      fetchWorkout(selectedDate)
    }
  }, [selectedDate, user, hasCompletedOnboarding])

  async function fetchWorkout(date: string) {
    setWorkoutLoading(true)
    setError('')
    
    try {
      const response = await fetch(`/api/workouts?date=${date}`)
      const data = await response.json()
      
      if (data.workout) {
        setWorkoutText(data.workout)
        setError('')
      } else {
        setWorkoutText('')
        if (data.message) {
          setError(data.message)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workout')
      setWorkoutText('')
    } finally {
      setWorkoutLoading(false)
    }
  }

  function changeDate(offset: number) {
    const current = new Date(selectedDate + 'T00:00:00')
    current.setDate(current.getDate() + offset)
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, '0')
    const day = String(current.getDate()).padStart(2, '0')
    const newDate = `${year}-${month}-${day}`
    setSelectedDate(newDate)
    if (user && hasCompletedOnboarding) {
      fetchWorkout(newDate)
    }
  }

  function handleDatePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDate = e.target.value
    setSelectedDate(newDate)
    setShowDatePicker(false)
    if (user && hasCompletedOnboarding) {
      fetchWorkout(newDate)
    }
  }

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    )
  }

  // Show authentication prompt for unauthenticated users
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto">
        {/* Welcome Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
          <div className="text-center space-y-4">
            <div className="text-6xl mb-4">🏋️</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Welcome to SociusFit
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Your holistic AI-powered fitness companion integrating workout tracking, 
              nutrition monitoring, and personalized insights.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
            What makes SociusFit different:
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3">
              <span className="text-2xl">💪</span>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Integrated Tracking</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Workout and nutrition data work together for complete insights
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-2xl">🤖</span>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">AI-Powered</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Smart analysis of your fitness patterns and recommendations
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-2xl">📱</span>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Mobile-First</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Optimized for gym and kitchen use on your smartphone
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-2xl">📊</span>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Holistic Insights</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Correlate nutrition with performance for better results
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Authentication CTAs */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div className="text-center space-y-4">
            <h2 className="text-lg font-bold text-blue-900 dark:text-blue-100">
              Ready to start your fitness journey?
            </h2>
            <p className="text-blue-700 dark:text-blue-300 text-sm">
              Create your account to access personalized workout programs and nutrition tracking
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2">
              <Link
                href="/auth/signup"
                className="flex-1 bg-blue-600 dark:bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-semibold text-center text-base touch-target"
              >
                Create Account
              </Link>
              <Link
                href="/auth/signin"
                className="flex-1 bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 border-2 border-blue-600 dark:border-blue-400 px-6 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors font-semibold text-center text-base touch-target"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show onboarding prompt for users who haven't completed setup
  if (!hasCompletedOnboarding) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
          <div className="text-center space-y-4">
            <div className="text-6xl mb-4">⚡</div>
            <h2 className="text-lg font-bold text-yellow-900 dark:text-yellow-100">
              Complete Your Setup
            </h2>
            <p className="text-yellow-700 dark:text-yellow-300 text-sm">
              Finish setting up your profile to get personalized workout programs and nutrition targets
            </p>
            
            <Link
              href="/onboarding"
              className="inline-block bg-yellow-600 dark:bg-yellow-500 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 dark:hover:bg-yellow-600 transition-colors font-semibold text-base touch-target"
            >
              Complete Setup
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Show main app for authenticated users with completed onboarding
  return (
    <div>
      {/* Date Navigation */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => changeDate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Previous day"
          >
            <span className="text-2xl">←</span>
          </button>
          
          <div className="text-center relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Select date"
            >
              <span className="text-2xl">📅</span>
            </button>
            
            {showDatePicker && (
              <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 z-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={handleDatePickerChange}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  autoFocus
                />
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="mt-2 w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          
          <button
            onClick={() => changeDate(1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Next day"
          >
            <span className="text-2xl">→</span>
          </button>
        </div>
      </div>

      {/* Workout Display */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Workout {formatDate(selectedDate)}
          </h2>
          <button
            onClick={() => fetchWorkout(selectedDate)}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            disabled={workoutLoading}
          >
            🔄 Refresh
          </button>
        </div>
        
        {workoutLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 dark:border-blue-400 mb-3"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading workout...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button
              onClick={() => fetchWorkout(selectedDate)}
              className="bg-blue-600 dark:bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-semibold"
            >
              Try Again
            </button>
          </div>
        ) : workoutText ? (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
              {workoutText}
            </pre>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              No workout programmed for this day
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Check your Google Sheet or try a different date
            </p>
          </div>
        )}
      </div>

      {/* Quick Action - Mobile Optimized */}
      {workoutText && (
        <div className="mt-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-4 sm:p-6">
          <div className="mb-4">
            <div className="font-semibold text-green-900 dark:text-green-100 text-lg">Ready to log this workout?</div>
            <div className="text-sm text-green-700 dark:text-green-300 mt-1">Copy the workout and log your results</div>
          </div>
          <a
            href={`/log?workout=${encodeURIComponent(workoutText)}&date=${selectedDate}`}
            className="block w-full bg-green-600 dark:bg-green-700 text-white px-6 py-3 rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors font-semibold text-center text-base touch-target"
          >
            Log Results →
          </a>
        </div>
      )}

      {/* Nutrition Quick Access - Mobile Optimized */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 sm:p-6">
        <div className="mb-4">
          <div className="font-semibold text-blue-900 dark:text-blue-100 text-lg">Track your nutrition</div>
          <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">Log meals and monitor your daily progress</div>
        </div>
        
        {/* Mobile-First Button Layout */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
          <a
            href="/food-progress?view=camera"
            className="flex-1 bg-blue-600 dark:bg-blue-700 text-white px-4 py-3 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-semibold text-center text-base touch-target flex items-center justify-center gap-2"
          >
            <span>📷</span>
            <span>Quick Log</span>
          </a>
          <a
            href="/food-progress"
            className="flex-1 bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 border-2 border-blue-600 dark:border-blue-400 px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors font-semibold text-center text-base touch-target"
          >
            View Progress
          </a>
          <a
            href="/food-progress?view=targets"
            className="flex-1 bg-purple-600 dark:bg-purple-700 text-white px-4 py-3 rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors font-semibold text-center text-base touch-target flex items-center justify-center gap-2"
          >
            <span>🎯</span>
            <span>Targets</span>
          </a>
        </div>
      </div>
    </div>
  );
}
