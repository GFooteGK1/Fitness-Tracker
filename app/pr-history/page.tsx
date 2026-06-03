'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { formatPRValue } from '@/app/lib/pr-detection'

interface PRRecord {
  id: string
  exercise: string
  pr_type: 'weight' | 'reps' | 'time' | 'volume'
  value: number
  previous_value: number | null
  achieved_at: string
  workout_id: string | null
}

interface PRSummary {
  thisWeek: number
  thisMonth: number
  thisYear: number
  allTime: number
}

const PR_TYPE_LABELS: Record<string, string> = {
  weight: 'Max Weight',
  reps: 'Rep Record',
  time: 'Time Record',
  volume: 'Volume Record',
}

const PR_TYPE_COLORS: Record<string, string> = {
  weight: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  reps: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  time: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  volume: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

function formatImprovement(prType: string, value: number, previousValue: number | null): string {
  if (!previousValue || previousValue === 0) return 'First time!'
  if (prType === 'time') {
    const diff = previousValue - value
    const pct = ((diff / previousValue) * 100).toFixed(1)
    return `${pct}% faster`
  }
  const diff = value - previousValue
  const pct = ((diff / previousValue) * 100).toFixed(1)
  return `+${pct}%`
}

export default function PRHistory() {
  const { user } = useAuth()
  const [records, setRecords] = useState<PRRecord[]>([])
  const [summary, setSummary] = useState<PRSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterExercise, setFilterExercise] = useState('')
  const [filterType, setFilterType] = useState('')

  const fetchPRHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const params = new URLSearchParams()
      if (filterExercise) params.set('exercise', filterExercise)
      if (filterType) params.set('prType', filterType)
      params.set('limit', '100')

      const response = await fetch(`/api/pr-history?${params}`)
      const data = await response.json()

      if (response.ok) {
        setRecords(data.records)
        setSummary(data.summary)
      } else {
        setError(data.error || 'Failed to load PR history')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PR history')
    } finally {
      setLoading(false)
    }
  }, [filterExercise, filterType])

  useEffect(() => {
    if (user) {
      fetchPRHistory()
    }
  }, [fetchPRHistory, user])

  // Get unique exercises for filter dropdown
  const uniqueExercises = [...new Set(records.map(r => r.exercise))].sort()

  return (
    <ProtectedRoute>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">PR History</h1>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
              <div className="text-2xl font-bold text-amber-500">{summary.thisWeek}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">This Week</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
              <div className="text-2xl font-bold text-amber-500">{summary.thisMonth}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">This Month</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
              <div className="text-2xl font-bold text-amber-500">{summary.thisYear}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">This Year</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
              <div className="text-2xl font-bold text-amber-500">{summary.allTime}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">All Time</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            placeholder="Filter by exercise..."
            value={filterExercise}
            onChange={e => setFilterExercise(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          >
            <option value="">All Types</option>
            <option value="weight">Max Weight</option>
            <option value="reps">Rep Record</option>
            <option value="time">Time Record</option>
            <option value="volume">Volume Record</option>
          </select>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mb-3"></div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button
              onClick={fetchPRHistory}
              className="bg-amber-500 text-white px-6 py-2 rounded-lg hover:bg-amber-600 transition-colors font-semibold"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && records.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="text-5xl mb-4">&#127942;</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No PRs Yet</h3>
            <p className="text-gray-500 dark:text-gray-400">
              Log workouts and your personal records will show up here!
            </p>
          </div>
        )}

        {/* PR Records List */}
        {!loading && !error && records.length > 0 && (
          <div className="space-y-3">
            {records.map(record => (
              <div
                key={record.id}
                className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                        {record.exercise}
                      </h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PR_TYPE_COLORS[record.pr_type]}`}>
                        {PR_TYPE_LABELS[record.pr_type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-400 line-through">
                        {record.previous_value ? formatPRValue(record.pr_type, record.previous_value) : '--'}
                      </span>
                      <span className="text-gray-400">&rarr;</span>
                      <span className="font-bold text-green-600 dark:text-green-400">
                        {formatPRValue(record.pr_type, Number(record.value))}
                      </span>
                      <span className="text-green-600 dark:text-green-400 text-xs font-medium">
                        {formatImprovement(record.pr_type, Number(record.value), record.previous_value ? Number(record.previous_value) : null)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-4">
                    {new Date(record.achieved_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
