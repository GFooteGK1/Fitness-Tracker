'use client'

import React from 'react'
import DayCard from './DayCard'
import { DailyAdherenceScore } from '@/app/lib/adherence-calculator'

/**
 * DailyBreakdown Component
 * 
 * Displays a horizontally-scrollable layout of day cards for the week.
 * Supports smooth swipe gestures with scroll-snap for mobile-first experience.
 * 
 * Requirements: 2.1, 4.3
 * - 2.1: Horizontally-scrollable layout allowing users to swipe through day cards
 * - 4.3: Support smooth horizontal swipe gestures on touch devices
 */

interface DailyBreakdownProps {
  weekDays: Date[]
  dailyScores: DailyAdherenceScore[]
  onDateSelect?: (date: Date) => void
}

/**
 * Converts a date to YYYY-MM-DD string format for comparison
 */
function toDateString(date: Date | string): string {
  if (typeof date === 'string') {
    // Already a string, extract just the date part if it's an ISO string
    return date.split('T')[0]
  }
  // For Date objects, use local date components to avoid timezone shifts
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Checks if two dates are the same calendar day
 * Handles both Date objects and date strings from API responses
 */
function isSameDay(date1: Date | string, date2: Date | string): boolean {
  return toDateString(date1) === toDateString(date2)
}

/**
 * Checks if a date is today (in local timezone)
 */
function isToday(date: Date | string): boolean {
  return toDateString(date) === toDateString(new Date())
}

/**
 * Checks if a date is in the future (in local timezone)
 */
function isFutureDate(date: Date | string): boolean {
  const dateStr = toDateString(date)
  const todayStr = toDateString(new Date())
  return dateStr > todayStr
}

/**
 * Finds the matching DailyAdherenceScore for a given date
 */
function findDayData(
  date: Date,
  dailyScores: DailyAdherenceScore[]
): DailyAdherenceScore | null {
  return dailyScores.find(score => isSameDay(score.date, date)) || null
}

export default function DailyBreakdown({
  weekDays,
  dailyScores,
  onDateSelect
}: DailyBreakdownProps) {
  return (
    <div className="w-full">
      {/* Section header */}
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 px-1">
        Daily Breakdown
      </h3>
      
      {/* Horizontal scrollable container */}
      <div
        className="
          flex
          gap-3
          overflow-x-auto
          pb-4
          -mx-4 px-4
          scroll-smooth
          snap-x snap-mandatory
          scrollbar-hide
        "
        style={{
          /* Hide scrollbar for cleaner mobile experience */
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {weekDays.map((date, index) => {
          const dayData = findDayData(date, dailyScores)
          const isTodayDate = isToday(date)
          const isFuture = isFutureDate(date)
          
          return (
            <div
              key={date.toISOString()}
              className="snap-start flex-shrink-0"
            >
              <DayCard
                date={date}
                dayData={dayData}
                isToday={isTodayDate}
                isFuture={isFuture}
                onSelect={onDateSelect ? () => onDateSelect(date) : undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
