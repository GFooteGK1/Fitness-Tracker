'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import PerformanceMonitor from '@/app/components/PerformanceMonitor'
import { WhoopMetricsCard } from '@/app/components/whoop/WhoopMetricsCard'
import ExportDialog from '@/app/components/ExportDialog'
import { AppIcon } from '@/app/components/AppIcon'
import { formatPRValue } from '@/app/lib/pr-detection'
import { getTimezoneOffset } from '@/app/lib/timezone-utils'
import type { DashboardWorkoutAggregates } from '@/app/lib/aggregates/dashboard'

interface RecentPR {
  id: string
  exercise: string
  pr_type: 'weight' | 'reps' | 'time' | 'volume'
  value: number
  previous_value: number | null
  achieved_at: string
}

const recordLabels = { weight: 'Max weight', reps: 'Rep record', time: 'Time record', volume: 'Volume record' }

export default function Progress() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardWorkoutAggregates | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showExport, setShowExport] = useState(false)
  const [recentPRs, setRecentPRs] = useState<RecentPR[]>([])
  const [prCount, setPrCount] = useState(0)
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recordsError, setRecordsError] = useState('')

  useEffect(() => {
    if (user) {
      void fetchStats()
      void fetchRecentPRs()
    }
  }, [user])

  async function fetchRecentPRs() {
    setRecordsLoading(true)
    setRecordsError('')
    try {
      const response = await fetch('/api/pr-history?limit=5')
      const data = await response.json()
      if (!response.ok) throw new Error('Your records could not load.')
      setRecentPRs(data.records || [])
      setPrCount(data.summary?.thisMonth || 0)
    } catch {
      setRecordsError('Your records could not load.')
    } finally {
      setRecordsLoading(false)
    }
  }

  async function fetchStats() {
    try {
      setLoading(true)
      setError('')
      const response = await fetch(`/api/dashboard-stats?tzOffset=${getTimezoneOffset()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Your training summary could not load.')
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your training summary could not load.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute>
      <PerformanceMonitor pageName="Progress" />
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4 py-2">
          <div className="min-w-0">
            <p className="app-eyebrow">See what is adding up.</p>
            <h1 className="app-title">Your progress</h1>
            <p className="app-muted mt-3 text-sm">Training, records, and recovery in one place.</p>
          </div>
          <button onClick={() => setShowExport(true)} className="app-secondary text-sm">Export</button>
        </header>
        <ExportDialog isOpen={showExport} onClose={() => setShowExport(false)} />

        <section className="app-panel p-5 sm:p-6" aria-labelledby="training-summary-heading" aria-busy={loading}>
          <h2 id="training-summary-heading" className="font-semibold">Training summary</h2>
          {loading ? <p role="status" className="app-muted py-6 text-sm">Loading your training…</p>
            : error ? <div role="alert" className="mt-4 space-y-4"><p className="app-muted text-sm">{error}</p><button onClick={fetchStats} className="app-secondary">Retry summary</button></div>
            : stats && <>
              <dl className="mt-5 grid grid-cols-2 gap-4">
                <div><dt className="app-muted text-sm">Workouts in {stats.currentMonth}</dt><dd className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-[var(--accent)]">{stats.monthToDate}</dd></div>
                <div className="border-l border-[var(--line)] pl-5"><dt className="app-muted text-sm">Workouts all time</dt><dd className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{stats.totalWorkouts}</dd></div>
              </dl>
              {stats.totalWorkouts === 0 && <div className="mt-5 border-t border-[var(--line)] pt-4"><p className="app-muted text-sm">Your first logged workout starts the picture.</p><Link className="app-primary mt-4" href="/log">Log a workout</Link></div>}
              {stats.totalWorkouts > 0 && <div className="mt-6 border-t border-[var(--line)] pt-4">
                <h3 className="text-sm font-semibold">Training mix <span className="app-muted font-normal">· All time</span></h3>
                <dl className="mt-3 divide-y divide-[var(--line)]">
                  {[
                    { label: 'Strength', value: stats.strengthSessions },
                    { label: 'Metcons', value: stats.metcons },
                    { label: 'Cardio', value: stats.cardio },
                  ].map(item => <div key={item.label} className="flex items-center justify-between gap-4 py-3 text-sm"><dt className="app-muted">{item.label}</dt><dd className="font-semibold tabular-nums">{item.value}</dd></div>)}
                </dl>
                <p className="app-muted mt-3 text-xs">A mixed workout can count in more than one category.</p>
              </div>}
            </>}
        </section>

        <section className="app-panel p-5 sm:p-6" aria-labelledby="recent-records-heading" aria-busy={recordsLoading}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h2 id="recent-records-heading" className="font-semibold">Recent records</h2>
            <Link href="/pr-history" className="flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--accent)]">View records <span aria-hidden="true">→</span></Link>
          </div>
          {recordsLoading ? <p role="status" className="app-muted py-4 text-sm">Loading records…</p>
            : recordsError ? <div role="alert" className="mt-3 space-y-4"><p className="app-muted text-sm">{recordsError}</p><button className="app-secondary" onClick={fetchRecentPRs}>Retry records</button></div>
            : <>
              {prCount > 0 && <p className="app-muted mt-1 text-sm">{prCount} {prCount === 1 ? 'improvement' : 'improvements'} this month</p>}
              {recentPRs.length ? <ul className="mt-3 divide-y divide-[var(--line)]">
                {recentPRs.map(pr => <li key={pr.id} className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0"><p className="break-words text-sm font-medium">{pr.exercise}</p><p className="app-muted mt-1 text-xs">{recordLabels[pr.pr_type]}</p></div>
                  <div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums text-[var(--accent)]">{formatPRValue(pr.pr_type, Number(pr.value))}</p><p className="app-muted mt-1 text-xs">{new Date(pr.achieved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p></div>
                </li>)}
              </ul> : <p className="app-muted py-4 text-sm">Your first results establish a baseline. Improvements will appear here.</p>}
            </>}
        </section>

        <WhoopMetricsCard compact />

        <section className="app-panel divide-y divide-[var(--line)] px-5" aria-label="Explore your progress">
          <Link className="flex min-h-16 items-center gap-4 py-4" href="/food-progress"><AppIcon name="food" className="h-5 w-5 shrink-0 text-[var(--accent)]" /><span className="flex-1"><span className="block text-sm font-medium">Nutrition</span><span className="app-muted text-xs">Meals and targets</span></span><span aria-hidden="true" className="app-muted">→</span></Link>
          <Link className="flex min-h-16 items-center gap-4 py-4" href="/pr-history"><AppIcon name="progress" className="h-5 w-5 shrink-0 text-[var(--accent)]" /><span className="flex-1"><span className="block text-sm font-medium">All records</span><span className="app-muted text-xs">Results and baselines</span></span><span aria-hidden="true" className="app-muted">→</span></Link>
        </section>
      </div>
    </ProtectedRoute>
  )
}
