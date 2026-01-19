'use client'

import React, { useState } from 'react'
import { FoodItem, PortionSpec, RelativePortionSize, MeasurementUnit, FractionalAmount } from '@/app/lib/types/food-tracking'

interface PortionSelectorProps {
  items: FoodItem[]
  onConfirm: (items: FoodItem[]) => void
  onSkip: () => void
  isRefining?: boolean
}

const RELATIVE_PORTIONS: { value: RelativePortionSize; label: string; description: string }[] = [
  { value: 'thumb', label: '👍 Thumb', description: '~1 tbsp' },
  { value: 'cupped-hand', label: '🤲 Cupped Hand', description: '~½ cup' },
  { value: 'palm', label: '✋ Palm', description: '~3-4 oz' },
  { value: 'fist', label: '✊ Fist', description: '~1 cup' },
  { value: 'quarter-plate', label: '🍽️ ¼ Plate', description: 'Small' },
  { value: 'half-plate', label: '🍽️ ½ Plate', description: 'Large' },
]

const UNITS: { value: MeasurementUnit; label: string }[] = [
  { value: 'g', label: 'grams' },
  { value: 'oz', label: 'oz' },
  { value: 'cup', label: 'cups' },
  { value: 'tbsp', label: 'tbsp' },
  { value: 'tsp', label: 'tsp' },
]

const FRACTIONS: { value: FractionalAmount; label: string }[] = [
  { value: '1/8', label: '⅛' },
  { value: '1/4', label: '¼' },
  { value: '1/3', label: '⅓' },
  { value: '1/2', label: '½' },
  { value: '2/3', label: '⅔' },
  { value: '3/4', label: '¾' },
  { value: '1', label: '1' },
  { value: '1.5', label: '1½' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
]

export default function PortionSelector({ items, onConfirm, onSkip, isRefining = false }: PortionSelectorProps) {
  const [editedItems, setEditedItems] = useState<FoodItem[]>(items)
  const [expandedItem, setExpandedItem] = useState<number | null>(null)
  const [exactMode, setExactMode] = useState<Record<number, boolean>>({})

  const updateItemPortion = (index: number, portionSpec: PortionSpec) => {
    setEditedItems(prev => prev.map((item, i) => 
      i === index ? { ...item, portionSpec } : item
    ))
  }

  const setRelativePortion = (index: number, size: RelativePortionSize) => {
    updateItemPortion(index, { type: 'relative', relative: size })
    setExpandedItem(null)
  }

  const setExactPortion = (index: number, amount: FractionalAmount, unit: MeasurementUnit) => {
    updateItemPortion(index, { type: 'exact', exact: { amount, unit } })
  }

  const getPortionDisplay = (item: FoodItem): string => {
    if (!item.portionSpec) return item.portion
    if (item.portionSpec.type === 'relative' && item.portionSpec.relative) {
      const found = RELATIVE_PORTIONS.find(p => p.value === item.portionSpec!.relative)
      return found ? found.label : item.portion
    }
    if (item.portionSpec.type === 'exact' && item.portionSpec.exact) {
      const { amount, unit } = item.portionSpec.exact
      const unitLabel = UNITS.find(u => u.value === unit)?.label || unit
      return `${amount} ${unitLabel}`
    }
    return item.portion
  }

  const hasAnyPortionSet = editedItems.some(item => item.portionSpec)

  return (
    <div className="portion-selector bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Refine Portion Sizes
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Tap each item to specify portion size for better macro estimates
        </p>
      </div>

      <div className="space-y-3">
        {editedItems.map((item, index) => (
          <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
            {/* Item Header */}
            <button
              onClick={() => setExpandedItem(expandedItem === index ? null : index)}
              className="w-full p-3 flex items-center justify-between bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div className="flex-1 text-left">
                <span className="font-medium text-gray-900 dark:text-gray-100">{item.food}</span>
                <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                  ({getPortionDisplay(item)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {item.portionSpec && (
                  <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                    ✓ Set
                  </span>
                )}
                <svg 
                  className={`w-5 h-5 text-gray-400 transition-transform ${expandedItem === index ? 'rotate-180' : ''}`} 
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Expanded Portion Options */}
            {expandedItem === index && (
              <div className="p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-600">
                {/* Toggle between relative and exact */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setExactMode(prev => ({ ...prev, [index]: false }))}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      !exactMode[index] 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Quick Select
                  </button>
                  <button
                    onClick={() => setExactMode(prev => ({ ...prev, [index]: true }))}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      exactMode[index] 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Exact Amount
                  </button>
                </div>

                {!exactMode[index] ? (
                  /* Relative Portion Chips */
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {RELATIVE_PORTIONS.map(portion => (
                      <button
                        key={portion.value}
                        onClick={() => setRelativePortion(index, portion.value)}
                        className={`p-2 rounded-lg border text-left transition-colors ${
                          item.portionSpec?.relative === portion.value
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                        }`}
                      >
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {portion.label}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {portion.description}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Exact Amount Selector */
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Amount</label>
                      <div className="flex flex-wrap gap-1.5">
                        {FRACTIONS.map(frac => (
                          <button
                            key={frac.value}
                            onClick={() => {
                              const currentUnit = item.portionSpec?.exact?.unit || 'g'
                              setExactPortion(index, frac.value, currentUnit)
                            }}
                            className={`px-3 py-1.5 rounded text-sm transition-colors ${
                              item.portionSpec?.exact?.amount === frac.value
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            {frac.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Unit</label>
                      <div className="flex flex-wrap gap-1.5">
                        {UNITS.map(unit => (
                          <button
                            key={unit.value}
                            onClick={() => {
                              const currentAmount = item.portionSpec?.exact?.amount || '1'
                              setExactPortion(index, currentAmount as FractionalAmount, unit.value)
                            }}
                            className={`px-3 py-1.5 rounded text-sm transition-colors ${
                              item.portionSpec?.exact?.unit === unit.value
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            {unit.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => onConfirm(editedItems)}
          disabled={isRefining}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center transition-colors"
        >
          {isRefining ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Refining Macros...
            </>
          ) : hasAnyPortionSet ? (
            'Refine & Save Meal'
          ) : (
            'Save with AI Estimates'
          )}
        </button>
        <button
          onClick={onSkip}
          disabled={isRefining}
          className="sm:w-auto bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 py-3 px-4 rounded-lg font-medium transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
