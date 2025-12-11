'use client'

import { useState, useEffect } from 'react'

interface WorkoutStats {
  totalWorkouts: number
  monthToDate: number
  strengthSessions: number
  metcons: number
  cardio: number
  currentMonth: string
}

export default function Dashboard() {
  const [stats, setStats] = useState<WorkoutStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const response = await fetch('/api/dashboard-stats')
      const data = await response.json()
      
      if (response.ok) {
        setStats(data)
      } else {
        setError(data.error || 'Failed to load stats')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 dark:border-blue-400 mb-3"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">⚠️</div>
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchStats}
          className="bg-blue-600 dark:bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-semibold"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Dashboard</h1>

      {stats && (
        <div className="space-y-6">
          {/* Month to Date Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              📅 {stats.currentMonth} Summary
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.monthToDate}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Workouts This Month
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {stats.totalWorkouts}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total Workouts
                </div>
              </div>
            </div>
          </div>

          {/* Workout Type Breakdown */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              🏋️ Workout Types
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Strength */}
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">💪</span>
                  <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {stats.strengthSessions}
                  </span>
                </div>
                <div className="text-sm font-medium text-red-700 dark:text-red-300">
                  Strength Sessions
                </div>
                <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Squats, deadlifts, presses
                </div>
              </div>

              {/* Metcons */}
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">🔥</span>
                  <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {stats.metcons}
                  </span>
                </div>
                <div className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  Metcons
                </div>
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  AMRAP, For Time, EMOM
                </div>
              </div>

              {/* Cardio */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">🏃</span>
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {stats.cardio}
                  </span>
                </div>
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Cardio
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Running, rowing, biking
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              ⚡ Quick Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a
                href="/log"
                className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
              >
                <span className="text-2xl">📝</span>
                <div>
                  <div className="font-semibold text-green-700 dark:text-green-300">
                    Log Workout
                  </div>
                  <div className="text-sm text-green-600 dark:text-green-400">
                    Record today&apos;s session
                  </div>
                </div>
              </a>
              
              <a
                href="/query"
                className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
              >
                <span className="text-2xl">🔍</span>
                <div>
                  <div className="font-semibold text-purple-700 dark:text-purple-300">
                    Search History
                  </div>
                  <div className="text-sm text-purple-600 dark:text-purple-400">
                    Find past workouts
                  </div>
                </div>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}