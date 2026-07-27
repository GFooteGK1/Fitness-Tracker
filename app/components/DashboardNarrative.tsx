'use client'

import React from 'react'
import { useCallback, useEffect, useState } from 'react'
import type {
  DashboardNarrativeComposition,
  DashboardNarrativeHighlight,
} from '@/app/lib/dashboard-narrative'

const SECTION_LABELS: Record<DashboardNarrativeHighlight['section'], string> = {
  workout_summary: 'Training',
  personal_records: 'Personal records',
  recovery: 'Recovery',
  nutrition: 'Nutrition',
  leaderboard: 'Leaderboard',
}

type State =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error' }
  | {
      status: 'ready'
      composition: DashboardNarrativeComposition
      cached: boolean
    }

export function DashboardNarrativeView({
  composition,
  cached,
}: {
  composition: DashboardNarrativeComposition
  cached: boolean
}) {
  return (
    <section
      aria-label="Today's read"
      aria-live="polite"
      className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm dark:border-blue-900 dark:from-blue-950/40 dark:to-gray-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Today&apos;s read
        </p>
        {cached && (
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800/80 dark:text-gray-400 dark:ring-gray-700">
            Updated today
          </span>
        )}
      </div>
      <h2 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">
        {composition.headline}
      </h2>
      <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
        {composition.summary}
      </p>
      {composition.highlights.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {composition.highlights.map(highlight => (
            <div
              key={`${highlight.section}-${highlight.text}`}
              className="rounded-lg border border-white/80 bg-white/70 p-3 dark:border-gray-700 dark:bg-gray-800/70"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {SECTION_LABELS[highlight.section]}
              </p>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{highlight.text}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        AI-composed from the numbers shown in SociusFit. Treat this as context, not medical advice.
      </p>
    </section>
  )
}

export default function DashboardNarrative() {
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: 'loading' })
    try {
      const tzOffset = new Date().getTimezoneOffset()
      const response = await fetch(`/api/dashboard-narrative?tzOffset=${tzOffset}`, { signal })
      if (!response.ok) throw new Error('Dashboard narrative unavailable')

      const data = await response.json()
      if (data.status !== 'ready' || !data.composition) {
        setState({ status: 'hidden' })
        return
      }
      setState({
        status: 'ready',
        composition: data.composition as DashboardNarrativeComposition,
        cached: Boolean(data.cached),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setState({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (state.status === 'hidden') return null

  if (state.status === 'loading') {
    return (
      <section
        aria-label="Today's read"
        role="status"
        className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm dark:border-blue-900 dark:from-blue-950/40 dark:to-gray-800"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Today&apos;s read
        </p>
        <div className="mt-3 h-5 w-56 animate-pulse rounded bg-blue-100 dark:bg-blue-900/50" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Preparing today&apos;s read from your current data…
        </p>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section
        aria-label="Today's read unavailable"
        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Today&apos;s read is unavailable</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your dashboard numbers are still current.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Retry
          </button>
        </div>
      </section>
    )
  }

  return <DashboardNarrativeView composition={state.composition} cached={state.cached} />
}
