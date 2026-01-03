'use client'

import React, { useState, useEffect } from 'react'
import { MealEntry, FoodItem, MealUpdates } from '@/app/lib/types/food-tracking'

interface MealEditModalProps {
  meal: MealEntry
  isOpen: boolean
  onClose: () => void
  onSave?: (updates: MealUpdates) => Promise<void>
  onMealUpdated?: (updatedMeal: MealEntry) => void
  isLoading?: boolean
}

interface EditableFoodItem extends FoodItem {
  id: string // Temporary ID for editing
}

export default function MealEditModal({
  meal,
  isOpen,
  onClose,
  onSave,
  onMealUpdated,
  isLoading = false
}: MealEditModalProps) {
  const [editableItems, setEditableItems] = useState<EditableFoodItem[]>([])
  const [totalProtein, setTotalProtein] = useState(meal.totalProtein)
  const [totalCarbs, setTotalCarbs] = useState(meal.totalCarbs)
  const [totalFat, setTotalFat] = useState(meal.totalFat)
  const [totalCalories, setTotalCalories] = useState(meal.totalCalories)
  const [autoCalculate, setAutoCalculate] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Initialize editable items when modal opens
  useEffect(() => {
    if (isOpen) {
      const itemsWithIds = meal.items.map((item, index) => ({
        ...item,
        id: `item-${index}`
      }))
      setEditableItems(itemsWithIds)
      setTotalProtein(meal.totalProtein)
      setTotalCarbs(meal.totalCarbs)
      setTotalFat(meal.totalFat)
      setTotalCalories(meal.totalCalories)
      setAutoCalculate(true)
      setHasChanges(false)
      setErrors([])
      setIsSaving(false)
    }
  }, [isOpen, meal])

  // Auto-calculate totals when items change
  useEffect(() => {
    if (autoCalculate) {
      const calculatedTotals = editableItems.reduce(
        (totals, item) => ({
          protein: totals.protein + (item.protein || 0),
          carbs: totals.carbs + (item.carbs || 0),
          fat: totals.fat + (item.fat || 0),
          calories: totals.calories + (item.calories || 0)
        }),
        { protein: 0, carbs: 0, fat: 0, calories: 0 }
      )

      setTotalProtein(Math.round(calculatedTotals.protein * 10) / 10)
      setTotalCarbs(Math.round(calculatedTotals.carbs * 10) / 10)
      setTotalFat(Math.round(calculatedTotals.fat * 10) / 10)
      setTotalCalories(Math.round(calculatedTotals.calories * 10) / 10)
    }
  }, [editableItems, autoCalculate])

  // Check for changes
  useEffect(() => {
    const originalTotals = {
      protein: meal.totalProtein,
      carbs: meal.totalCarbs,
      fat: meal.totalFat,
      calories: meal.totalCalories
    }

    const currentTotals = {
      protein: totalProtein,
      carbs: totalCarbs,
      fat: totalFat,
      calories: totalCalories
    }

    const totalsChanged = Object.keys(originalTotals).some(
      key => Math.abs(originalTotals[key as keyof typeof originalTotals] - currentTotals[key as keyof typeof currentTotals]) > 0.1
    )

    const itemsChanged = editableItems.length !== meal.items.length ||
      editableItems.some((item, index) => {
        const original = meal.items[index]
        if (!original) return true
        return (
          item.food !== original.food ||
          item.portion !== original.portion ||
          Math.abs(item.protein - original.protein) > 0.1 ||
          Math.abs(item.carbs - original.carbs) > 0.1 ||
          Math.abs(item.fat - original.fat) > 0.1 ||
          Math.abs(item.calories - original.calories) > 0.1
        )
      })

    setHasChanges(totalsChanged || itemsChanged)
  }, [meal, editableItems, totalProtein, totalCarbs, totalFat, totalCalories])

  const validateForm = (): boolean => {
    const newErrors: string[] = []

    // Validate totals
    if (totalProtein < 0 || totalProtein > 500) {
      newErrors.push('Protein must be between 0 and 500g')
    }
    if (totalCarbs < 0 || totalCarbs > 1000) {
      newErrors.push('Carbs must be between 0 and 1000g')
    }
    if (totalFat < 0 || totalFat > 300) {
      newErrors.push('Fat must be between 0 and 300g')
    }
    if (totalCalories < 0 || totalCalories > 5000) {
      newErrors.push('Calories must be between 0 and 5000')
    }

    // Validate items
    editableItems.forEach((item, index) => {
      if (!item.food.trim()) {
        newErrors.push(`Food item ${index + 1}: Food name is required`)
      }
      if (!item.portion.trim()) {
        newErrors.push(`Food item ${index + 1}: Portion is required`)
      }
      if (item.protein < 0 || item.carbs < 0 || item.fat < 0 || item.calories < 0) {
        newErrors.push(`Food item ${index + 1}: All macro values must be non-negative`)
      }
    })

    setErrors(newErrors)
    return newErrors.length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return

    setIsSaving(true)
    setErrors([])

    const updates: MealUpdates = {
      totalProtein,
      totalCarbs,
      totalFat,
      totalCalories,
      items: editableItems.map(({ id, ...item }) => item),
      manualOverride: true,
      reviewedAt: new Date()
    }

    try {
      if (onSave) {
        // Use custom save handler if provided
        await onSave(updates)
      } else {
        // Use default API call
        const response = await fetch(`/api/meals/${meal.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to update meal')
        }

        const result = await response.json()
        if (onMealUpdated && result.meal) {
          onMealUpdated(result.meal)
        }
      }
      
      onClose()
    } catch (error) {
      console.error('Failed to save meal updates:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save changes. Please try again.'
      setErrors([errorMessage])
    } finally {
      setIsSaving(false)
    }
  }

  const handleRevertToAI = () => {
    if (confirm('This will revert all changes back to the original AI analysis. Are you sure?')) {
      // Reset to original AI values
      setEditableItems(meal.items.map((item, index) => ({ ...item, id: `item-${index}` })))
      setAutoCalculate(true)
    }
  }

  const updateItem = (itemId: string, field: keyof FoodItem, value: string | number) => {
    setEditableItems(items =>
      items.map(item =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    )
  }

  const addItem = () => {
    const newItem: EditableFoodItem = {
      id: `new-${Date.now()}`,
      food: '',
      portion: '',
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 0
    }
    setEditableItems([...editableItems, newItem])
  }

  const removeItem = (itemId: string) => {
    setEditableItems(items => items.filter(item => item.id !== itemId))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Edit Meal</h2>
            <p className="text-sm text-gray-500 mt-1">
              {new Intl.DateTimeFormat('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              }).format(meal.mealTimestamp)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Error messages */}
          {errors.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex">
                <svg className="w-5 h-5 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Please fix the following errors:</h3>
                  <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* AI Analysis Info */}
          {!meal.manualOverride && meal.aiConfidence && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">Original AI Analysis</h3>
                  <p className="mt-1 text-sm text-blue-700">
                    AI Confidence: {Math.round(meal.aiConfidence * 100)}% • 
                    Making changes will mark this meal as manually edited
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Totals Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Nutritional Totals</h3>
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={autoCalculate}
                    onChange={(e) => setAutoCalculate(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Auto-calculate from items</span>
                </label>
                {!meal.manualOverride && (
                  <button
                    onClick={handleRevertToAI}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Revert to AI
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Protein (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="500"
                  value={totalProtein}
                  onChange={(e) => setTotalProtein(parseFloat(e.target.value) || 0)}
                  disabled={autoCalculate}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Carbs (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1000"
                  value={totalCarbs}
                  onChange={(e) => setTotalCarbs(parseFloat(e.target.value) || 0)}
                  disabled={autoCalculate}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fat (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="300"
                  value={totalFat}
                  onChange={(e) => setTotalFat(parseFloat(e.target.value) || 0)}
                  disabled={autoCalculate}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Calories
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="5000"
                  value={totalCalories}
                  onChange={(e) => setTotalCalories(parseFloat(e.target.value) || 0)}
                  disabled={autoCalculate}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Food Items Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Food Items</h3>
              <button
                onClick={addItem}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Item
              </button>
            </div>

            <div className="space-y-4">
              {editableItems.map((item, index) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-900">Item {index + 1}</h4>
                    {editableItems.length > 1 && (
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Remove item"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Food Name
                      </label>
                      <input
                        type="text"
                        value={item.food}
                        onChange={(e) => updateItem(item.id, 'food', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., Grilled chicken breast"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Portion
                      </label>
                      <input
                        type="text"
                        value={item.portion}
                        onChange={(e) => updateItem(item.id, 'portion', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., 6 oz, 1 cup, 150g"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Protein (g)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={item.protein}
                        onChange={(e) => updateItem(item.id, 'protein', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Carbs (g)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={item.carbs}
                        onChange={(e) => updateItem(item.id, 'carbs', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fat (g)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={item.fat}
                        onChange={(e) => updateItem(item.id, 'fat', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Calories
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={item.calories}
                        onChange={(e) => updateItem(item.id, 'calories', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {hasChanges ? (
              <span className="text-orange-600 font-medium">You have unsaved changes</span>
            ) : (
              <span>No changes made</span>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving || errors.length > 0}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </div>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}