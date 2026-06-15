'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { MealEntry, DailyTargets, MacroTotals, AdherenceStatus, DailyMealsResponse } from '@/app/lib/types/food-tracking'
import MealEntryCard from './MealEntryCard'
import MealEditModal from './MealEditModal'
import { useToast } from './Toast'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'

interface DailyProgressViewProps {
  date: Date
  onAddMeal?: () => void
}

export default function DailyProgressView({ date, onAddMeal }: DailyProgressViewProps) {
  const { user } = useAuth()
  const [meals, setMeals] = useState<MealEntry[]>([])
  const [dailyTotals, setDailyTotals] = useState<MacroTotals>({ protein: 0, carbs: 0, fat: 0, calories: 0 })
  const [adherence, setAdherence] = useState<AdherenceStatus>({
    proteinAdherence: 0,
    carbsAdherence: 0,
    fatAdherence: 0,
    caloriesAdherence: 0,
    overallScore: 0,
    withinTolerance: false
  })
  const [targets, setTargets] = useState<DailyTargets | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null)

  const { showToast } = useToast()

  const fetchTargets = useCallback(async () => {
    if (!user) return

    try {
      const response = await fetch('/api/targets')
      if (response.ok) {
        const targetsData = await response.json()
        setTargets(targetsData)
      }
    } catch (err) {
      console.warn('Failed to fetch targets:', err)
    }
  }, [user])

  const fetchDailyData = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      setError('')

      const dateStr = getLocalDate(date)
      // Send timezone offset so server can query correct UTC range
      const tzOffset = getTimezoneOffset()
      const response = await fetch(`/api/meals/daily?date=${dateStr}&tzOffset=${tzOffset}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch daily data')
      }

      const data: DailyMealsResponse = await response.json()
      setMeals(data.meals)
      setDailyTotals(data.dailyTotals)
      setAdherence(data.adherence)

      // Fetch targets separately if not included in response
      await fetchTargets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load daily data')
    } finally {
      setLoading(false)
    }
  }, [date, fetchTargets, user])

  useEffect(() => {
    if (user) {
      fetchDailyData()
    }
  }, [fetchDailyData, user])

  const handleEditMeal = (mealId: string) => {
    const meal = meals.find(m => m.id === mealId)
    if (meal) {
      setEditingMeal(meal)
    }
  }

  const handleSaveMeal = async (updates: any) => {
    if (!editingMeal) return

    try {
      const response = await fetch(`/api/meals/${editingMeal.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error('Failed to update meal')
      }

      // Refresh data after successful update
      await fetchDailyData()
      setEditingMeal(null)

      // Show success message (you could use a toast here)
      console.log('Meal updated successfully')
    } catch (err) {
      console.error('Error updating meal:', err)
      // You might want to show an error message to the user here
    }
  }

  const handleDeleteMeal = async (mealId: string) => {
    try {
      const response = await fetch(`/api/meals/${mealId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete meal')
      }

      // Refresh data after successful delete
      await fetchDailyData()
      console.log('Meal deleted successfully')
    } catch (err) {
      console.error('Error deleting meal:', err)
    }
  }

  const formatMacro = (value: number, unit: string = 'g') => {
    return `${Math.round(value * 10) / 10}${unit}`
  }

  const getAdherenceColor = (adherence: number) => {
    if (adherence >= 95) return 'text-green-600 bg-green-50 border-green-200'
    if (adherence >= 85) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const getProgressBarColor = (adherence: number) => {
    if (adherence >= 95) return 'bg-green-500'
    if (adherence >= 85) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const calculateProgress = (actual: number, target: number) => {
    if (!target || target <= 0) return 0
    return Math.min((actual / target) * 100, 100)
  }

  const configuredTargets = targets &&
    targets.targetProtein > 0 &&
    targets.targetCarbs > 0 &&
    targets.targetFat > 0 &&
    targets.targetCalories > 0
    ? targets
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 sm:py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-b-2 border-blue-600 dark:border-blue-400 mb-3"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 sm:py-12">
        <div className="text-4xl sm:text-6xl mb-4">⚠️</div>
        <p className="text-red-600 dark:text-red-400 mb-4 text-sm sm:text-base px-4">{error}</p>
        <button
          onClick={fetchDailyData}
          className="bg-blue-600 dark:bg-blue-500 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-semibold text-sm sm:text-base touch-target"
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
            className="bg-blue-600 dark:bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-semibold flex items-center justify-center space-x-2 text-sm sm:text-base touch-target w-full sm:w-auto"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Add Meal</span>
          </button>
        )}
      </div>

      {/* Daily Totals and Targets - Mobile Optimized */}
      {configuredTargets && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Daily Progress</h2>

          {/* Overall Adherence Score */}
          <div className={`rounded-lg p-3 sm:p-4 mb-4 border ${getAdherenceColor(adherence.overallScore)}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm sm:text-base">Overall Adherence</h3>
                <p className="text-xs sm:text-sm opacity-75">
                  {adherence.withinTolerance ? 'Within target range' : 'Outside target range'}
                </p>
              </div>
              <div className="text-xl sm:text-2xl font-bold">
                {Math.round(adherence.overallScore)}%
              </div>
            </div>
          </div>

          {/* Macro Progress Bars - Mobile Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Protein */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Protein</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {formatMacro(dailyTotals.protein)} / {formatMacro(configuredTargets.targetProtein)}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(adherence.proteinAdherence)}`}
                  style={{ width: `${calculateProgress(dailyTotals.protein, configuredTargets.targetProtein)}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {Math.round(adherence.proteinAdherence)}% adherence
              </div>
            </div>

            {/* Carbs */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Carbs</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {formatMacro(dailyTotals.carbs)} / {formatMacro(configuredTargets.targetCarbs)}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(adherence.carbsAdherence)}`}
                  style={{ width: `${calculateProgress(dailyTotals.carbs, configuredTargets.targetCarbs)}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {Math.round(adherence.carbsAdherence)}% adherence
              </div>
            </div>

            {/* Fat */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Fat</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {formatMacro(dailyTotals.fat)} / {formatMacro(configuredTargets.targetFat)}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(adherence.fatAdherence)}`}
                  style={{ width: `${calculateProgress(dailyTotals.fat, configuredTargets.targetFat)}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {Math.round(adherence.fatAdherence)}% adherence
              </div>
            </div>

            {/* Calories */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Calories</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {formatMacro(dailyTotals.calories, '')} / {formatMacro(configuredTargets.targetCalories, '')}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(adherence.caloriesAdherence)}`}
                  style={{ width: `${calculateProgress(dailyTotals.calories, configuredTargets.targetCalories)}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {Math.round(adherence.caloriesAdherence)}% adherence
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No targets message - Mobile Optimized */}
      {!configuredTargets && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start sm:items-center">
              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mr-2 mt-0.5 sm:mt-0 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="font-medium text-yellow-800 dark:text-yellow-200 text-sm sm:text-base">No Daily Targets Set</h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Set your daily macro targets to see adherence tracking and progress indicators.
                </p>
              </div>
            </div>
            <Link
              href="/food-progress?view=targets"
              className="bg-yellow-600 dark:bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 dark:hover:bg-yellow-600 transition-colors font-medium text-sm whitespace-nowrap touch-target w-full sm:w-auto text-center"
            >
              Set Targets
            </Link>
          </div>
        </div>
      )}

      {/* Meals List - Mobile Optimized */}
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Today&apos;s Meals</h2>

        {meals.length === 0 ? (
          <div className="text-center py-6 sm:py-8">
            {onAddMeal && (
              <button
                onClick={onAddMeal}
                className="bg-blue-600 dark:bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-semibold text-base touch-target"
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
