'use client'

import React, { useState } from 'react'
import { FoodItem } from '@/app/lib/types/food-tracking'

interface PortionSelectorProps {
  items: FoodItem[]
  onConfirm: (items: FoodItem[]) => void
  onSkip: () => void
  isRefining?: boolean
}

// Standard units for portion measurement
const STANDARD_UNITS = [
  'g',
  'oz',
  'cups',
  'cup',
  'tbsp',
  'tsp',
  'pieces',
  'piece',
  'servings',
  'serving',
  'handful',
  'handfuls',
  'fist size',
  'plate',
  'plates',
  'thumb',
  'thumbs',
  'lb',
  'lbs',
  'ml',
  'l'
] as const

export default function PortionSelector({
  items,
  onConfirm,
  onSkip,
  isRefining = false
}: PortionSelectorProps) {
  const [editedItems, setEditedItems] = useState<FoodItem[]>(items)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [foodName, setFoodName] = useState<string>('')
  const [portionAmount, setPortionAmount] = useState<string>('')
  const [portionUnit, setPortionUnit] = useState<string>('oz')

  const handleEditClick = (index: number) => {
    const item = editedItems[index]
    
    // Set food name
    setFoodName(item.food)
    
    // Parse existing portionSpec if available
    if (item.portionSpec) {
      if (item.portionSpec.type === 'exact' && item.portionSpec.exact) {
        setPortionAmount(String(item.portionSpec.exact.amount))
        setPortionUnit(item.portionSpec.exact.unit)
      } else {
        setPortionAmount('')
        setPortionUnit('oz')
      }
    } else {
      setPortionAmount('')
      setPortionUnit('oz')
    }
    
    setEditingIndex(index)
  }

  const handleSavePortion = () => {
    if (editingIndex === null) return
    
    const name = foodName.trim()
    const amount = portionAmount.trim()
    const unit = portionUnit.trim()
    
    setEditedItems(prev => {
      const updated = [...prev]
      updated[editingIndex] = {
        ...updated[editingIndex],
        food: name || updated[editingIndex].food,
        portionSpec: amount && unit ? {
          type: 'exact',
          exact: {
            amount: parseFloat(amount) || amount as any,
            unit: unit as any
          }
        } : updated[editingIndex].portionSpec
      }
      return updated
    })
    
    setEditingIndex(null)
    setFoodName('')
    setPortionAmount('')
    setPortionUnit('oz')
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setFoodName('')
    setPortionAmount('')
    setPortionUnit('oz')
  }

  const hasAnyEdits = editedItems.some((item, i) => 
    item.portionSpec || item.food !== items[i]?.food
  )

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <div
        role="note"
        className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide dark:bg-amber-800">
            Photo estimate
          </span>
        </div>
        <p className="mt-2 text-sm">
          Macros from a photo can be rough. Confirm the food names and portions before relying on them.
        </p>
      </div>

      <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
        Review the estimate
      </h3>
      
      <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
        Correct food names or portions now. You can edit every macro again after saving.
      </p>

      <div className="space-y-3">
        {editedItems.map((item, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 rounded-lg p-3">
            {editingIndex === index ? (
              // Edit mode
              <div>
                <div className="mb-3">
                  <label htmlFor={`food-${index}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Food Name
                  </label>
                  <input
                    id={`food-${index}`}
                    type="text"
                    value={foodName}
                    onChange={(e) => setFoodName(e.target.value)}
                    placeholder="e.g., Grilled chicken breast"
                    className="w-full px-3 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    autoFocus
                  />
                </div>
                
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label htmlFor={`amount-${index}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Amount
                    </label>
                    <input
                      id={`amount-${index}`}
                      type="text"
                      inputMode="decimal"
                      value={portionAmount}
                      onChange={(e) => setPortionAmount(e.target.value)}
                      placeholder="e.g., 6"
                      className="w-full px-3 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  
                  <div className="flex-1">
                    <label htmlFor={`unit-${index}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Unit
                    </label>
                    <select
                      id={`unit-${index}`}
                      value={portionUnit}
                      onChange={(e) => setPortionUnit(e.target.value)}
                      className="w-full px-3 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    >
                      {STANDARD_UNITS.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={handleSavePortion}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium touch-target"
                  >
                    Save item changes
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm font-medium touch-target"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // View mode
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                      {item.food}
                    </h4>
                    {item.portionSpec && item.portionSpec.exact && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                        {item.portionSpec.exact.amount} {item.portionSpec.exact.unit}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {item.protein}g P • {item.carbs}g C • {item.fat}g F • {item.calories} cal
                  </p>
                </div>
                
                <button
                  onClick={() => handleEditClick(index)}
                  className="ml-2 p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg touch-target"
                  aria-label={`Edit ${item.food}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-4">
        <button
          onClick={() => onConfirm(editedItems)}
          disabled={isRefining || editingIndex !== null}
          className="flex-1 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium text-sm sm:text-base touch-target flex items-center justify-center"
        >
          {isRefining ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Refining estimate...
            </>
          ) : hasAnyEdits ? (
            'Apply corrections'
          ) : (
            'Use these estimates'
          )}
        </button>
        
        <button
          onClick={onSkip}
          disabled={isRefining || editingIndex !== null}
          className="flex-1 bg-gray-600 dark:bg-gray-500 hover:bg-gray-700 dark:hover:bg-gray-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium text-sm sm:text-base touch-target"
        >
          Skip review
        </button>
      </div>
    </div>
  )
}
