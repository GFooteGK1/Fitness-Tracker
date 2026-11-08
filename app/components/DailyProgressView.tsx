'use client'

import { sendCaptureCorrection, assertCaptureOwner } from '@/app/lib/client/logging-request'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { MealEntry, DailyTargets, MacroTotals, DailyMealsResponse, DailyMealsAvailabilityResponse } from '@/app/lib/types/food-tracking'
import { isDailyTotals, readDailyComparison, type DailyComparison } from '@/app/lib/client/daily-meals'
import MealEntryCard from './MealEntryCard'
import MealEditModal from './MealEditModal'
import { useToast } from './Toast'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'

interface DailyProgressViewProps {
  date: Date
  onAddMeal?: () => void
}

const DAILY_PROGRESS_FETCH_TIMEOUT_MS = process.env.NODE_ENV === 'test' ? 50 : 10000

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMessage: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort)
  if (signal?.aborted) controller.abort()
  const timeoutId = window.setTimeout(() => controller.abort(), DAILY_PROGRESS_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) {
      let errorMessage = 'Request failed'
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch {
        // Keep the generic message if the server returns a non-JSON error.
      }
      throw new Error(errorMessage)
    }

    return await response.json()
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(timeoutMessage)
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abort)
  }
}

export default function DailyProgressView({ date, onAddMeal }: DailyProgressViewProps) {
  const { user } = useAuth()
  const [meals, setMeals] = useState<MealEntry[]>([])
  const [dailyTotals, setDailyTotals] = useState<MacroTotals>({ protein: 0, carbs: 0, fat: 0, calories: 0 })
  const [comparison, setComparison] = useState<DailyComparison>({ adherenceAvailability: 'unverified', adherence: null })
  const [comparisonPending, setComparisonPending] = useState(false)
  const [targets, setTargets] = useState<DailyTargets | null>(null)
  const [targetStatus, setTargetStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const scope = `${user?.id ?? ''}:${getLocalDate(date)}`
  const [readScope, setReadScope] = useState('')
  const dailyRead = useRef<AbortController | null>(null)
  const targetRead = useRef<AbortController | null>(null)
  const factsScope = useRef('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null)

  const { showToast } = useToast()

  const fetchTargets = useCallback(async () => {
    if (!user) return
    targetRead.current?.abort()
    const controller = new AbortController()
    targetRead.current = controller
    setTargets(null)
    setTargetStatus('loading')

    try {
      const targetsData = await fetchJsonWithTimeout<DailyTargets>(
        '/api/targets',
        'Nutrition targets request timed out. Progress targets may be temporarily unavailable.',
        controller.signal
      )
      if (controller.signal.aborted) return
      setTargets(targetsData)
      setTargetStatus('ready')
    } catch (err) {
      if (controller.signal.aborted) return
      console.warn('Failed to fetch targets:', err)
      setTargetStatus('error')
    }
  }, [user])

  const fetchDailyData = useCallback(async (preserveFacts = false) => {
    if (!user) return
    const retainingFacts = preserveFacts && factsScope.current === scope
    dailyRead.current?.abort()
    targetRead.current?.abort()
    const controller = new AbortController()
    dailyRead.current = controller

    try {
      setLoading(!retainingFacts)
      setComparisonPending(true)
      setComparison({ adherenceAvailability: 'unverified', adherence: null })
      setError('')
      setReadScope(scope)
      setTargets(null)
      setTargetStatus('loading')

      const dateStr = getLocalDate(date)
      // Send timezone offset so server can query correct UTC range
      const tzOffset = getTimezoneOffset()
      const data = await fetchJsonWithTimeout<DailyMealsResponse | DailyMealsAvailabilityResponse>(
        `/api/meals/daily?date=${dateStr}&tzOffset=${tzOffset}&availability=explicit`,
        'Nutrition data request timed out. Please try again.',
        controller.signal
      )
      if (controller.signal.aborted) return
      if (!data || !Array.isArray(data.meals) || !isDailyTotals(data.dailyTotals)) {
        throw new Error('Unable to read daily meal facts. Please try again.')
      }
      setMeals(data.meals)
      setDailyTotals(data.dailyTotals)
      setComparison(readDailyComparison(data))
      factsScope.current = scope
      // Confirmed meal facts stay readable while the independent target read settles.
      setLoading(false)

      // Fetch targets separately if not included in response
      void fetchTargets()
    } catch (err) {
      if (controller.signal.aborted) return
      if (retainingFacts) setComparison({ adherenceAvailability: 'unavailable', adherence: null })
      else setError(err instanceof Error ? err.message : 'Failed to load daily data')
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        setComparisonPending(false)
      }
    }
  }, [date, fetchTargets, scope, user])

  useEffect(() => {
    if (user) {
      fetchDailyData()
    }
    return () => {
      dailyRead.current?.abort()
      targetRead.current?.abort()
    }
  }, [fetchDailyData, user])

  const handleEditMeal = async (mealId: string) => {
    if (!user) return
    try {
      const response = await fetch(`/api/meals/${mealId}`)
      const data = await response.json()
      await assertCaptureOwner(user.id)
      if (!response.ok || data.meal?.userId !== user.id) throw new Error('Meal unavailable for this account.')
      setEditingMeal(data.meal)
    } catch (error) { setError(error instanceof Error ? error.message : 'Meal unavailable') }
  }
  const handleSaveMeal = async (updates: import('@/app/lib/types/food-tracking').MealUpdates) => {
    if (!editingMeal || !user) return
    const response = await sendCaptureCorrection(`/api/meals/${editingMeal.id}`, 'PUT', updates as Record<string, unknown>, user.id)
    if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? 'Correction remains unconfirmed. Retry the unchanged correction.') }
    setEditingMeal(null)
    await fetchDailyData()
  }
  const handleDeleteMeal = async (mealId: string) => {
    if (!user) return
    try {
      const currentResponse = await fetch(`/api/meals/${mealId}`)
      const current = await currentResponse.json()
      await assertCaptureOwner(user.id)
      if (!currentResponse.ok || current.meal?.userId !== user.id) throw new Error('Meal unavailable for this account.')
      const response = await sendCaptureCorrection(`/api/meals/${mealId}`, 'DELETE', { expectedRevision: current.meal.captureRevision }, user.id)
      if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? 'Deletion remains unconfirmed. Retry the same action.') }
      await fetchDailyData()
    } catch (error) { setError(error instanceof Error ? error.message : 'Deletion remains unconfirmed.') }
  }

  const formatMacro = (value: number, unit: string = 'g') => {
    return `${Math.round(value * 10) / 10}${unit}`
  }

  const configuredTargets = comparison.adherenceAvailability === 'available' && targetStatus === 'ready' && targets &&
    targets.targetProtein > 0 &&
    targets.targetCarbs > 0 &&
    targets.targetFat > 0 &&
    targets.targetCalories > 0
    ? targets
    : null

  if (!user) return null

  if (loading || readScope !== scope) {
    return (
      <div className="flex items-center justify-center py-8 sm:py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-b-2 border-[var(--accent-line)] mb-3"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 sm:py-12">
        <div className="text-4xl sm:text-6xl mb-4">⚠️</div>
        <p className="text-red-600 dark:text-red-400 mb-4 text-sm sm:text-base px-4">{error}</p>
        <button
          onClick={() => fetchDailyData()}
          className="app-primary transition-colors text-sm sm:text-base touch-target"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - Mobile Optimized */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
          {meals.length} meal{meals.length !== 1 ? 's' : ''} logged
        </p>

        {onAddMeal && (
          <button
            onClick={onAddMeal}
            className="app-primary flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Add Meal</span>
          </button>
        )}
      </div>

      <section className="app-panel p-4" aria-label="Daily nutrition summary">
        <h2 className="text-lg font-semibold">{getLocalDate(date) === getLocalDate() ? 'Today so far' : 'Logged nutrition'}</h2>
        <p className="app-muted mt-1 mb-4 text-sm">
          {meals.length === 0 ? 'No meals logged yet. Missing entries are not a measure of what you ate.' : 'Based on logged meals. This may not represent your whole day.'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([
            ['Protein', dailyTotals.protein, configuredTargets?.targetProtein, 'g'],
            ['Carbs', dailyTotals.carbs, configuredTargets?.targetCarbs, 'g'],
            ['Fat', dailyTotals.fat, configuredTargets?.targetFat, 'g'],
            ['Calories', dailyTotals.calories, configuredTargets?.targetCalories, '']
          ] as const).map(([label, actual, target, unit]) => (
            <div key={label}>
              <p className="app-muted text-sm">{label}</p>
              <p className="text-xl font-semibold">{formatMacro(actual, unit)}</p>
              {target && <p className="app-muted text-sm">of {formatMacro(target, unit)} target</p>}
            </div>
          ))}
        </div>
        {(comparisonPending || (comparison.adherenceAvailability !== 'not_configured' && !configuredTargets)) && <div className="mt-4">
          <p role={comparisonPending || (comparison.adherenceAvailability === 'available' && targetStatus === 'loading') ? 'status' : 'alert'} className="app-muted text-sm">
            {comparisonPending || (comparison.adherenceAvailability === 'available' && targetStatus === 'loading')
              ? 'Loading target comparison…'
              : comparison.adherenceAvailability === 'available'
                ? 'Daily targets are temporarily unavailable. Please try again.'
                : comparison.adherenceAvailability === 'unverified'
                  ? 'Target comparison could not be verified. Please try again.'
                  : 'Target comparison is temporarily unavailable. Please try again.'}
          </p>
          <button type="button" disabled={comparisonPending || (comparison.adherenceAvailability === 'available' && targetStatus === 'loading')} onClick={() => fetchDailyData(true)} className="app-primary mt-2 transition-colors touch-target disabled:opacity-50">
            Retry comparison
          </button>
        </div>}
        {!comparisonPending && comparison.adherenceAvailability === 'not_configured' && <p className="app-muted mt-4 text-sm"><span>No Daily Targets Set</span>. <Link className="underline inline-flex min-h-11 items-center" href="/food-progress?view=targets">Set Targets</Link></p>}
        {!comparisonPending && configuredTargets && comparison.adherence && meals.length > 0 && <details className="mt-4 border-t border-[var(--line)] pt-2">
          <summary className="min-h-11 flex items-center cursor-pointer font-medium">Target comparison</summary>
          <p className="app-muted text-sm">{Math.round(comparison.adherence.overallScore)}% adherence for logged meals only. Unlogged meals may change this comparison.</p>
        </details>}
      </section>

      {/* Meals List - Mobile Optimized */}
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Meals</h2>

        {meals.length === 0 ? (
          <div className="text-center py-6 sm:py-8">
            {onAddMeal && (
              <button
                onClick={onAddMeal}
                className="app-primary transition-colors text-base touch-target"
              >
                + Add Your First Meal
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {meals.map((meal) => (
              <MealEntryCard
                key={meal.id}
                meal={meal}
                onEdit={handleEditMeal}
                onDelete={handleDeleteMeal}
                showPhoto={true}
                compact={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingMeal && (
        <MealEditModal
          meal={editingMeal}
          isOpen={!!editingMeal}
          onSave={handleSaveMeal}
          onClose={() => setEditingMeal(null)}
        />
      )}
    </div>
  )
}
