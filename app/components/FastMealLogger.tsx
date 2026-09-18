'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { sendLoggingRequest } from '@/app/lib/client/logging-request'
import { CaptureReceiptPanel } from './capture/CaptureReceiptPanel'
import type { MealUploadResponse } from '@/app/lib/types/food-tracking'
import { getMealTimestamp, getLocalDate } from '@/app/lib/timezone-utils'
import { scaleNutrition, type FoodCatalogDraft } from '@/app/lib/nutrition/reviewed-food'
import type { CommonMeal } from '@/app/lib/nutrition/fast-log'

interface FastMealLoggerProps {
  selectedDate?: Date
  onLogged?: (response: MealUploadResponse) => void
  onError?: (error: string) => void
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
  const { user } = useAuth()
  const [loadedOwner, setLoadedOwner] = useState(user?.id)
  const [lastResult, setLastResult] = useState<MealUploadResponse | null>(null)
  const [commonMeals, setCommonMeals] = useState<CommonMeal[]>([])
  const [loadingCommon, setLoadingCommon] = useState(true)
  const [commonError, setCommonError] = useState(false)
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState<FoodCatalogDraft | null>(null)
  const [servings, setServings] = useState(1)
  const [loggingFood, setLoggingFood] = useState(false)

  useEffect(() => {
    let active = true
    setLoadedOwner(user?.id)
    setCommonMeals([]); setLastResult(null); setDraft(null); setStatus('')
    void fetch('/api/meals/common?limit=4')
      .then(async response => {
        if (!response.ok) throw new Error('Common meals unavailable')
        return response.json() as Promise<{ meals?: CommonMeal[] }>
      })
      .then(result => { if (active) setCommonMeals(Array.isArray(result.meals) ? result.meals : []) })
      .catch(error => {
        if (active) setCommonError(true)
        console.warn('Unable to load common meals:', error)
      })
      .finally(() => { if (active) setLoadingCommon(false) })
    return () => { active = false }
  }, [user?.id])

  const showError = useCallback((message: string) => {
    setStatus(message)
    onError?.(message)
  }, [onError])

  const logCommonMeal = async (meal: CommonMeal) => {
    setLoggingMealId(meal.sourceMealId)
    try {
      const response = await sendLoggingRequest('/api/meals/quick-log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceMealId: meal.sourceMealId, timestamp: getMealTimestamp(selectedDate) }),
      }, user?.id ?? '', 60_000, JSON.stringify([meal.sourceMealId, selectedDate ? getLocalDate(selectedDate) : 'today']))
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to log common meal')
      if (result.state === 'save_unconfirmed' || result.receiptBundle?.state === 'save_unconfirmed') throw new Error('Save unconfirmed. Retry this same entry.')
      const saved = { ...result, analysisStatus: 'complete' as const }
      setLastResult(saved); onLogged?.(saved)
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
    setLoggingFood(true)
    try {
      const response = await sendLoggingRequest('/api/foods/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: getMealTimestamp(selectedDate), servings, food: draft }),
      }, user?.id ?? '', 60_000, JSON.stringify([draft, servings, selectedDate ? getLocalDate(selectedDate) : 'today']))
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to log food')
      if (result.state === 'save_unconfirmed' || result.receiptBundle?.state === 'save_unconfirmed') throw new Error('Save unconfirmed. Retry this same entry.')
      const saved = { ...result, analysisStatus: 'complete' as const }
      setLastResult(saved); onLogged?.(saved)
      setDraft(null)
      setStatus('Food logged.')
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to log food')
    } finally { setLoggingFood(false) }
  }

  const scaled = draft ? scaleNutrition(draft.nutrition, servings) : null

  if (loadedOwner !== user?.id) return null
  return (
    <div className="space-y-4">
      {lastResult && <CaptureReceiptPanel result={lastResult} />}
      {!loadingCommon && commonMeals.length === 0 && <p className="app-muted text-sm">{commonError ? 'Recent meals could not load.' : 'No recent meals to repeat yet.'} Use a photo, voice, text, or a nutrition label.</p>}
      {(loadingCommon || commonMeals.length > 0) && (
        <section aria-labelledby="common-meals-heading" className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="mb-3">
            <h3 id="common-meals-heading" className="font-semibold text-gray-900 dark:text-gray-100">Common meals</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Copy a past meal with a fresh time. No AI analysis.</p>
          </div>
          {loadingCommon ? <p className="text-sm text-gray-500">Loading recent meals...</p> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {commonMeals.map(meal => (
                <button key={meal.signature} type="button" onClick={() => void logCommonMeal(meal)} disabled={loggingMealId !== null} aria-label={`Log ${meal.title}`} className="app-secondary flex-col items-start text-left gap-1 transition-colors disabled:opacity-50">
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
        <button type="button" onClick={beginManualEntry} className="min-h-11 text-sm font-semibold text-[var(--accent)] underline-offset-2 hover:underline">Enter label manually</button>
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
            <button type="button" onClick={() => void logReviewedFood()} disabled={loggingFood || !draft.name.trim() || !draft.servingLabel.trim() || !draft.servingUnit.trim() || !Number.isFinite(draft.servingAmount) || draft.servingAmount <= 0 || !Number.isFinite(servings) || servings <= 0} className="app-primary w-full">{loggingFood ? 'Logging...' : 'Log reviewed food'}</button>
          </div>
        )}
      </section>
    </div>
  )
}
