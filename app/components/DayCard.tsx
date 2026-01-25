'use client'

import React from 'react'
import { DailyAdherenceScore, getAdherenceColor } from '@/app/lib/adherence-calculator'

/**
 * DayCard Component
 * 
 * Displays an individual day's nutrition data within the horizontal scroll daily breakdown.
 * Shows day name, date number, adherence score badge, and macro values in a compact format.
 * 
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.1
 */

interface DayCardProps {
  date: Date
  dayData: DailyAdherenceScore | null
  isToday: boolean
  isFuture: boolean
  onSelect?: () => void
}

/**
 * Maps adherence color string to Tailwind CSS classes for the score badge
 */
function getScoreBadgeClasses(color: string): string {
  switch (color) {
    case 'green':
      return 'bg-green-100 text-green-700 border-green-300'
    case 'yellow':
      return 'bg-yellow-100 text-yellow-700 border-yellow-300'
    case 'orange':
      return 'bg-orange-100 text-orange-700 border-orange-300'
    case 'red':
    default:
      return 'bg-red-100 text-red-700 border-red-300'
  }
}

/**
 * Formats a day name from a Date object (e.g., "Mon", "Tue")
 */
function getDayName(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' })
}

/**
 * Gets the date number from a Date object (e.g., 13, 14)
 */
function getDateNumber(date: Date): number {
  return date.getDate()
}

export default function DayCard({
  date,
  dayData,
  isToday,
  isFuture,
  onSelect
}: DayCardProps) {
  const dayName = getDayName(date)
  const dateNumber = getDateNumber(date)
  
  // Determine if we have data to display
  const hasData = dayData !== null && !isFuture
  
  // Get adherence score and color if we have data
  const overallScore = hasData ? dayData.adherenceStatus.overallScore : 0
  const scoreColor = hasData ? getAdherenceColor(overallScore) : 'gray'
  const scoreBadgeClasses = hasData ? getScoreBadgeClasses(scoreColor) : ''
  
  // Get macro values if we have data
  const protein = hasData ? Math.round(dayData.dailyTotals.protein) : 0
  const carbs = hasData ? Math.round(dayData.dailyTotals.carbs) : 0
  const fat = hasData ? Math.round(dayData.dailyTotals.fat) : 0
  const calories = hasData ? Math.round(dayData.dailyTotals.calories) : 0

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect}
      className={`
        flex flex-col items-center
        min-w-[100px] min-h-[44px]
        px-3 py-3
        rounded-xl
        border-2
        transition-all duration-200
        touch-action-manipulation
        ${isToday 
          ? 'border-blue-500 bg-blue-50 shadow-md' 
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
        }
        ${onSelect ? 'cursor-pointer active:scale-95' : 'cursor-default'}
        ${!hasData && !isFuture ? 'opacity-75' : ''}
      `}
      aria-label={`${dayName} ${dateNumber}${isToday ? ' (Today)' : ''}${isFuture ? ' (Future)' : hasData ? `, Score: ${Math.round(overallScore)}%` : ', No data'}`}
    >
      {/* Day name */}
      <span className={`
        text-sm font-semibold uppercase tracking-wide
        ${isToday ? 'text-blue-700' : 'text-gray-600'}
      `}>
        {dayName}
      </span>
      
      {/* Date number */}
      <span className={`
        text-2xl font-bold mt-0.5
        ${isToday ? 'text-blue-900' : 'text-gray-900'}
      `}>
        {dateNumber}
      </span>
      
      {/* Score badge, "No data", or "Future" indicator */}
      <div className="mt-2 min-h-[24px] flex items-center justify-center">
        {isFuture ? (
          <span className="text-xs font-medium text-gray-400 italic">
            Future
          </span>
        ) : hasData ? (
          <span className={`
            px-2 py-0.5
            text-sm font-bold
            rounded-full
            border
            ${scoreBadgeClasses}
          `}>
            {Math.round(overallScore)}%
          </span>
        ) : (
          <span className="text-xs font-medium text-gray-400 italic">
            No data
          </span>
        )}
      </div>
      
      {/* Macro values - only shown when we have data */}
      {hasData && (
        <div className="mt-2 flex flex-col items-center text-xs text-gray-600 space-y-0.5">
          <span className="font-medium">
            P:<span className="text-gray-800">{protein}g</span>
          </span>
          <span className="font-medium">
            C:<span className="text-gray-800">{carbs}g</span>
          </span>
          <span className="font-medium">
            F:<span className="text-gray-800">{fat}g</span>
          </span>
          <span className="font-medium text-gray-800">
            {calories}
          </span>
        </div>
      )}
      
      {/* Today indicator dot */}
      {isToday && (
        <div className="mt-2 w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
      )}
    </button>
  )
}
