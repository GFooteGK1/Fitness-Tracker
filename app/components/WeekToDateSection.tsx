'use client'

import React from 'react'
import { CumulativeAdherenceData, DailyTargets } from '@/app/lib/types/food-tracking'
import { 
  formatDeviation, 
  getAdherenceColor, 
  shouldHighlightDeviation 
} from '@/app/lib/adherence-calculator'

/**
 * WeekToDateSection Component
 * 
 * Displays cumulative progress against prorated targets based on days elapsed.
 * Shows a prominent week-to-date summary with progress bars for each macro.
 * 
 * Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 3.2, 3.3, 3.4, 3.5, 4.2, 5.4
 */

interface WeekToDateSectionProps {
  cumulativeData: CumulativeAdherenceData
  targets: DailyTargets
  daysElapsed: number
  daysWithData: number
}

/**
 * Maps adherence color string to Tailwind CSS classes
 */
function getColorClasses(color: string): {
  bg: string
  text: string
  progressBg: string
  border: string
} {
  switch (color) {
    case 'green':
      return {
        bg: 'bg-green-100',
        text: 'text-green-700',
        progressBg: 'bg-green-500',
        border: 'border-green-500'
      }
    case 'yellow':
      return {
        bg: 'bg-yellow-100',
        text: 'text-yellow-700',
        progressBg: 'bg-yellow-500',
        border: 'border-yellow-500'
      }
    case 'orange':
      return {
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        progressBg: 'bg-orange-500',
        border: 'border-orange-500'
      }
    case 'red':
    default:
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        progressBg: 'bg-red-500',
        border: 'border-red-500'
      }
  }
}

/**
 * Gets the status badge styling and text based on overall status
 */
function getStatusBadge(status: 'on-track' | 'ahead' | 'behind'): {
  text: string
  icon: string
  className: string
} {
  switch (status) {
    case 'on-track':
      return {
        text: 'On Track',
        icon: '✓',
        className: 'bg-green-100 text-green-700 border-green-300'
      }
    case 'ahead':
      return {
        text: 'Ahead',
        icon: '↑',
        className: 'bg-blue-100 text-blue-700 border-blue-300'
      }
    case 'behind':
      return {
        text: 'Behind',
        icon: '↓',
        className: 'bg-orange-100 text-orange-700 border-orange-300'
      }
  }
}

/**
 * Progress bar component for individual macros
 */
interface MacroProgressBarProps {
  label: string
  actual: number
  target: number
  deviation: number
  adherence: number
  unit: string
  isHighlighted: boolean
}

function MacroProgressBar({
  label,
  actual,
  target,
  deviation,
  adherence,
  unit,
  isHighlighted
}: MacroProgressBarProps) {
  const color = getAdherenceColor(adherence)
  const colorClasses = getColorClasses(color)
  
  // Calculate progress percentage (capped at 100% for display)
  const progressPercent = Math.min(100, (actual / target) * 100)
  
  // Format values for display
  const actualDisplay = Math.round(actual)
  const targetDisplay = Math.round(target)
  const deviationDisplay = formatDeviation(deviation, unit)
  
  return (
    <div 
      className={`py-3 px-4 rounded-lg transition-all ${
        isHighlighted ? `${colorClasses.bg} border-2 ${colorClasses.border}` : 'bg-gray-50'
      }`}
    >
      {/* Label and values row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-base font-medium text-gray-900">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-base text-gray-700">
            {actualDisplay}{unit} / {targetDisplay}{unit}
          </span>
          <span 
            className={`text-base font-semibold min-w-[60px] text-right ${
              deviation >= 0 ? 'text-blue-600' : 'text-orange-600'
            }`}
          >
            {deviationDisplay}
          </span>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all duration-300 ${colorClasses.progressBg}`}
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} progress: ${Math.round(adherence)}%`}
        />
      </div>
    </div>
  )
}

export default function WeekToDateSection({
  cumulativeData,
  targets,
  daysElapsed,
  daysWithData
}: WeekToDateSectionProps) {
  const statusBadge = getStatusBadge(cumulativeData.overallStatus)
  
  // Check if there's no data logged (empty state)
  const hasNoData = daysWithData === 0
  
  // Determine which macros should be highlighted (>10% deviation)
  const proteinHighlighted = shouldHighlightDeviation(
    cumulativeData.totalProtein,
    cumulativeData.proratedProteinTarget
  )
  const carbsHighlighted = shouldHighlightDeviation(
    cumulativeData.totalCarbs,
    cumulativeData.proratedCarbsTarget
  )
  const fatHighlighted = shouldHighlightDeviation(
    cumulativeData.totalFat,
    cumulativeData.proratedFatTarget
  )
  const caloriesHighlighted = shouldHighlightDeviation(
    cumulativeData.totalCalories,
    cumulativeData.proratedCaloriesTarget
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header with status badge */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            Week to Date
          </h2>
          <p className="text-base text-gray-600 mt-0.5">
            {daysWithData} of {daysElapsed} days logged
          </p>
        </div>
        <div 
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-base font-semibold ${statusBadge.className}`}
        >
          <span>{statusBadge.text}</span>
          <span>{statusBadge.icon}</span>
        </div>
      </div>
      
      {/* Content area */}
      <div className="p-4">
        {hasNoData ? (
          /* Empty state - no meals logged */
          <div className="text-center py-6">
            <div className="text-4xl mb-3">🍽️</div>
            <p className="text-base text-gray-600 mb-2">No meals logged yet this week</p>
            <p className="text-base text-gray-500">
              Start tracking to see your progress toward weekly goals
            </p>
          </div>
        ) : (
          /* Macro progress bars */
          <div className="space-y-3">
            <MacroProgressBar
              label="Protein"
              actual={cumulativeData.totalProtein}
              target={cumulativeData.proratedProteinTarget}
              deviation={cumulativeData.proteinDeviation}
              adherence={cumulativeData.proteinAdherence}
              unit="g"
              isHighlighted={proteinHighlighted}
            />
            
            <MacroProgressBar
              label="Carbs"
              actual={cumulativeData.totalCarbs}
              target={cumulativeData.proratedCarbsTarget}
              deviation={cumulativeData.carbsDeviation}
              adherence={cumulativeData.carbsAdherence}
              unit="g"
              isHighlighted={carbsHighlighted}
            />
            
            <MacroProgressBar
              label="Fat"
              actual={cumulativeData.totalFat}
              target={cumulativeData.proratedFatTarget}
              deviation={cumulativeData.fatDeviation}
              adherence={cumulativeData.fatAdherence}
              unit="g"
              isHighlighted={fatHighlighted}
            />
            
            <MacroProgressBar
              label="Calories"
              actual={cumulativeData.totalCalories}
              target={cumulativeData.proratedCaloriesTarget}
              deviation={cumulativeData.caloriesDeviation}
              adherence={cumulativeData.caloriesAdherence}
              unit=""
              isHighlighted={caloriesHighlighted}
            />
          </div>
        )}
      </div>
    </div>
  )
}
