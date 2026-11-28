'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { formatPRValue, personalRecordLabels, REP_MAX_TYPES } from '@/app/lib/pr-detection'

interface PRRecord {
  id: string
  exercise: string
  pr_type: (typeof REP_MAX_TYPES)[number]
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

function formatImprovement(value: number, previousValue: number): string {
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
  const [includeBaselines, setIncludeBaselines] = useState(true)

  const fetchPRHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const params = new URLSearchParams()
      if (filterExercise) params.set('exercise', filterExercise)
      if (filterType) params.set('prType', filterType)
      params.set('limit', '100')
      if (includeBaselines) params.set('includeBaselines', 'true')

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
  }, [filterExercise, filterType, includeBaselines])

  useEffect(() => {
    if (user) {
      fetchPRHistory()
    }
  }, [fetchPRHistory, user])


  return (
    <ProtectedRoute>
      <div>
        <header className="mb-6">
          <h1 className="app-title">Records</h1>
          <p className="app-muted mt-2">Your best sets of 1, 3, and 5 reps. The first result for each lift and rep count sets the baseline.</p>
        </header>

        {/* Summary Stats */}
        {summary && (
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" aria-label="Record improvements">
            <div className="app-panel p-4 text-center">
              <div className="text-2xl font-bold text-amber-500">{summary.thisWeek}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">This week</div>
            </div>
            <div className="app-panel p-4 text-center">
              <div className="text-2xl font-bold text-amber-500">{summary.thisMonth}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">This month</div>
            </div>
            <div className="app-panel p-4 text-center">
              <div className="text-2xl font-bold text-amber-500">{summary.thisYear}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">This year</div>
            </div>
            <div className="app-panel p-4 text-center">
              <div className="text-2xl font-bold text-amber-500">{summary.allTime}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">All time</div>
            </div>
          </section>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-2">
          <input
            type="search"
            aria-label="Filter by lift"
            placeholder="Filter by lift"
            value={filterExercise}
            onChange={e => setFilterExercise(e.target.value)}
            className="min-h-11 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-base"
          />
          <select
            aria-label="Rep max"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-base"
          >
            <option value="">All rep maxes</option>
            {REP_MAX_TYPES.map(type => (
              <option key={type} value={type}>{personalRecordLabels[type]}</option>
            ))}
          </select>
        </div>
        <label className="mb-4 flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={includeBaselines} onChange={event => setIncludeBaselines(event.target.checked)} />
          Include first-attempt baselines
        </label>

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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {filterExercise || filterType || !includeBaselines ? 'No matching records' : 'No records yet'}
            </h2>
          </div>
        )}

        {/* PR Records List */}
        {!loading && !error && records.length > 0 && (
          <div className="space-y-3">
            {records.map(record => {
              const value = Number(record.value)
              const previousValue = Number(record.previous_value)
              const isBaseline = previousValue === 0

              return (
                <div key={record.id} className="app-panel flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{record.exercise}</h3>
                      <span className="app-badge font-medium">{personalRecordLabels[record.pr_type]}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {!isBaseline && (
                        <>
                          <span className="app-muted line-through">{formatPRValue(previousValue)}</span>
                          <span className="app-muted" aria-hidden="true">&rarr;</span>
                        </>
                      )}
                      <span className="font-semibold tabular-nums">{formatPRValue(value)}</span>
                      <span className="app-muted text-xs font-medium">
                        {isBaseline ? 'Baseline recorded' : formatImprovement(value, previousValue)}
                      </span>
                    </div>
                  </div>
                  <time dateTime={record.achieved_at} className="app-muted shrink-0 text-right text-xs">
                    {new Date(record.achieved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                  </time>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
