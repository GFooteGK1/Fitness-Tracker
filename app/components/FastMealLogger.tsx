'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { MealUploadResponse } from '@/app/lib/types/food-tracking'
import { getMealTimestamp } from '@/app/lib/timezone-utils'
import { scaleNutrition, type FoodCatalogDraft } from '@/app/lib/nutrition/reviewed-food'
import type { CommonMeal } from '@/app/lib/nutrition/fast-log'

interface FastMealLoggerProps {
  selectedDate?: Date
  onLogged?: (response: MealUploadResponse) => void
  onError?: (error: string) => void
}

function requestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function manualDraft(): FoodCatalogDraft {
  return {
    name: '', brand: '', source: 'manual_label', sourceKey: '',
    servingAmount: 1, servingUnit: 'serving', servingLabel: '1 serving', nutritionBasis: 'per_serving',
    nutrition: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    sourceNutrition: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    sourcePayload: { entry: 'manual_label' },
  }
}

export default function FastMealLogger({ selectedDate, onLogged, onError }: FastMealLoggerProps) {
  const [commonMeals, setCommonMeals] = useState<CommonMeal[]>([])
  const [loadingCommon, setLoadingCommon] = useState(true)
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState<FoodCatalogDraft | null>(null)
  const [servings, setServings] = useState(1)
  const [loggingFood, setLoggingFood] = useState(false)
  const commonRequestIdsRef = useRef(new Map<string, string>())
  const foodRequestIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    void fetch('/api/meals/common?limit=4')
      .then(async response => {
        if (!response.ok) throw new Error('Common meals unavailable')
        return response.json() as Promise<{ meals?: CommonMeal[] }>
      })
      .then(result => { if (active) setCommonMeals(Array.isArray(result.meals) ? result.meals : []) })
      .catch(error => console.warn('Unable to load common meals:', error))
      .finally(() => { if (active) setLoadingCommon(false) })
    return () => { active = false }
  }, [])

  useEffect(() => { foodRequestIdRef.current = null }, [draft, servings])

  const showError = useCallback((message: string) => {
    setStatus(message)
    onError?.(message)
  }, [onError])

  const logCommonMeal = async (meal: CommonMeal) => {
    const retryRequestId = commonRequestIdsRef.current.get(meal.sourceMealId) || requestId()
    commonRequestIdsRef.current.set(meal.sourceMealId, retryRequestId)
    setLoggingMealId(meal.sourceMealId)
    try {
      const response = await fetch('/api/meals/quick-log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceMealId: meal.sourceMealId, requestId: retryRequestId, timestamp: getMealTimestamp(selectedDate) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to log common meal')
      commonRequestIdsRef.current.delete(meal.sourceMealId)
      onLogged?.({ mealId: result.mealId, analysisStatus: 'complete' })
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to log common meal')
    } finally { setLoggingMealId(null) }
  }

  const beginManualEntry = () => {
    setDraft(manualDraft())
    setServings(1)
    setStatus('Enter the values printed on the nutrition label.')
  }

  const updateNutrition = (field: keyof FoodCatalogDraft['nutrition'], value: number) => {
    setDraft(current => current ? { ...current, nutrition: { ...current.nutrition, [field]: value } } : current)
  }

  const logReviewedFood = async () => {
    if (!draft) return
    const retryRequestId = foodRequestIdRef.current || requestId()
    foodRequestIdRef.current = retryRequestId
    setLoggingFood(true)
    try {
      const response = await fetch('/api/foods/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: retryRequestId, timestamp: getMealTimestamp(selectedDate), servings, food: draft }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to log food')
      foodRequestIdRef.current = null
      onLogged?.({ mealId: result.mealId, analysisStatus: 'complete' })
      setDraft(null)
      setStatus('Food logged.')
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to log food')
    } finally { setLoggingFood(false) }
  }

  const scaled = draft ? scaleNutrition(draft.nutrition, servings) : null

  return (
    <div className="space-y-4">
      {(loadingCommon || commonMeals.length > 0) && (
        <section aria-labelledby="common-meals-heading" className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="mb-3">
            <h3 id="common-meals-heading" className="font-semibold text-gray-900 dark:text-gray-100">Common meals</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Copy a past meal with a fresh time. No AI analysis.</p>
          </div>
          {loadingCommon ? <p className="text-sm text-gray-500">Loading recent meals...</p> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {commonMeals.map(meal => (
                <button key={meal.signature} type="button" onClick={() => void logCommonMeal(meal)} disabled={loggingMealId !== null} aria-label={`Log ${meal.title}`} className="min-h-12 rounded-lg border border-gray-200 bg-white px-3 py-3 text-left transition-colors hover:border-blue-400 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800">
                  <span className="block font-medium text-gray-900 dark:text-gray-100">{loggingMealId === meal.sourceMealId ? 'Logging...' : meal.title}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{Math.round(meal.totals.calories)} cal · {Math.round(meal.totals.protein)}g protein{meal.timesLogged > 1 ? ` · ${meal.timesLogged} times` : ' · recent'}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="nutrition-label-heading" className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <div className="mb-3">
          <h3 id="nutrition-label-heading" className="font-semibold text-gray-900 dark:text-gray-100">Nutrition label</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Enter the package values yourself.</p>
        </div>
        <button type="button" onClick={beginManualEntry} className="min-h-11 text-sm font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">Enter label manually</button>
        {status && <p role="status" className="mt-3 text-sm text-gray-600 dark:text-gray-300">{status}</p>}
        {draft && (
          <div className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <div><h4 className="font-semibold text-gray-900 dark:text-gray-100">Review label</h4><p className="text-xs text-gray-500 dark:text-gray-400">These structured values are saved for faster future logging; no label image is retained.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Product name<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Brand (optional)<input value={draft.brand} onChange={event => setDraft({ ...draft, brand: event.target.value })} className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Serving label<input value={draft.servingLabel} onChange={event => setDraft({ ...draft, servingLabel: event.target.value })} className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Serving amount<input type="number" min="0.001" step="0.1" value={draft.servingAmount} onChange={event => setDraft({ ...draft, servingAmount: Number(event.target.value) })} className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" /></label>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Serving unit<input value={draft.servingUnit} onChange={event => setDraft({ ...draft, servingUnit: event.target.value })} className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" /></label>
              </div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Servings eaten<input type="number" min="0.1" max="20" step="0.1" value={servings} onChange={event => setServings(Number(event.target.value))} className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" /></label>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold text-gray-700 dark:text-gray-300">Nutrition per {draft.servingLabel || 'serving'}</legend>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(['protein', 'carbs', 'fat', 'calories'] as const).map(field => (
                  <label key={field} className="text-xs font-medium capitalize text-gray-600 dark:text-gray-400">{field}<input aria-label={`${field} per serving`} type="number" min="0" step="0.1" value={draft.nutrition[field]} onChange={event => updateNutrition(field, Number(event.target.value))} className="mt-1 min-h-12 w-full rounded-lg border px-2 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" /></label>
                ))}
              </div>
            </fieldset>
            {scaled && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-300">Log total: {scaled.calories} cal · {scaled.protein}g protein · {scaled.carbs}g carbs · {scaled.fat}g fat</p>}
            <button type="button" onClick={() => void logReviewedFood()} disabled={loggingFood || !draft.name.trim() || !draft.servingLabel.trim() || !draft.servingUnit.trim() || !Number.isFinite(draft.servingAmount) || draft.servingAmount <= 0 || !Number.isFinite(servings) || servings <= 0} className="min-h-12 w-full rounded-lg bg-green-600 px-4 font-semibold text-white hover:bg-green-700 disabled:bg-gray-400">{loggingFood ? 'Logging...' : 'Log reviewed food'}</button>
          </div>
        )}
      </section>
    </div>
  )
}
