'use client'

import React, { useState, useEffect } from 'react'
import { DailyTargets, DailySummary, CumulativeAdherenceData } from '@/app/lib/types/food-tracking'
import { WeeklyAdherenceScore, CorrectionGuidance } from '@/app/lib/adherence-calculator'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'
import WeekToDateSection from './WeekToDateSection'
import DailyBreakdown from './DailyBreakdown'

interface WeeklyAdherenceViewProps {
  weekStart: Date
  onDateSelect?: (date: Date) => void
}

/**
 * Enhanced API response interface with cumulative tracking fields
 * Requirements: 1.1, 4.4, 4.5
 */
interface WeeklyAdherenceResponse {
  // Existing fields
  weeklyAdherence: WeeklyAdherenceScore
  correctionGuidance: CorrectionGuidance
  targets: DailyTargets
  daysWithData: number
  weekStart: string
  weekEnd: string
  
  // New fields for cumulative tracking
  daysElapsed: number
  cumulativeData: CumulativeAdherenceData
}

export default function WeeklyAdherenceView({ weekStart, onDateSelect }: WeeklyAdherenceViewProps) {
  const { user } = useAuth()
  const [weeklyData, setWeeklyData] = useState<WeeklyAdherenceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) {
      fetchWeeklyData()
    }
  }, [weekStart, user])

  const fetchWeeklyData = async () => {
    if (!user) return
    
    try {
      setLoading(true)
      setError('')

      const weekStartStr = getLocalDate(weekStart)
      // Send timezone offset so server can query correct UTC range
      const tzOffset = getTimezoneOffset()
      const response = await fetch(`/api/adherence/weekly?weekStart=${weekStartStr}&tzOffset=${tzOffset}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch weekly data')
      }

      const data: WeeklyAdherenceResponse = await response.json()
      setWeeklyData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load weekly data')
    } finally {
      setLoading(false)
    }
  }

  const formatWeekRange = (start: Date, end: Date) => {
    const startStr = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric'
    }).format(start)
    
    const endStr = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(end)
    
    return `${startStr} - ${endStr}`
  }

  const formatMacro = (value: number, unit: string = 'g') => {
    return `${Math.round(value * 10) / 10}${unit}`
  }

  const generateWeekDays = () => {
    const days = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + i)
      days.push(date)
    }
    return days
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">⚠️</div>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchWeeklyData}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!weeklyData) {
    return <div>No data available</div>
  }

  const weekDays = generateWeekDays()
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Adherence</h1>
          <p className="text-gray-600 mt-1">
            {formatWeekRange(weekStart, weekEnd)} • {weeklyData.daysWithData} of 7 days logged
          </p>
        </div>
      </div>

      {/* Week-to-Date Section */}
      {/* Requirements: 1.1, 4.4, 4.5 */}
      <WeekToDateSection
        cumulativeData={weeklyData.cumulativeData}
        targets={weeklyData.targets}
        daysElapsed={weeklyData.daysElapsed}
        daysWithData={weeklyData.daysWithData}
      />

      {/* Daily Breakdown (horizontal scroll) - replaces existing daily grid */}
      {/* Requirements: 2.1, 4.3 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <DailyBreakdown
          weekDays={weekDays}
          dailyScores={weeklyData.weeklyAdherence.dailyScores}
          onDateSelect={onDateSelect}
        />
        
        {/* Legend */}
        <div className="mt-4 flex items-center justify-center flex-wrap gap-3 text-xs">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span className="text-gray-600">95%+ Excellent</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span className="text-gray-600">85-94% Good</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-orange-500 rounded"></div>
            <span className="text-gray-600">70-84% Fair</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span className="text-gray-600">&lt;70% Needs Work</span>
          </div>
        </div>
      </div>

      {/* Correction Guidance */}
      {weeklyData.correctionGuidance.needsImprovement && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-yellow-800 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Improvement Suggestions
          </h2>
          
          <div className="space-y-3">
            <p className="text-yellow-800 font-medium">
              {weeklyData.correctionGuidance.overallGuidance}
            </p>
            
            {weeklyData.correctionGuidance.proteinGuidance && (
              <div className="bg-white rounded-lg p-3 border border-yellow-300">
                <h4 className="font-semibold text-yellow-800 mb-1">🥩 Protein</h4>
                <p className="text-yellow-700 text-sm">{weeklyData.correctionGuidance.proteinGuidance}</p>
              </div>
            )}
            
            {weeklyData.correctionGuidance.carbsGuidance && (
              <div className="bg-white rounded-lg p-3 border border-yellow-300">
                <h4 className="font-semibold text-yellow-800 mb-1">🍞 Carbohydrates</h4>
                <p className="text-yellow-700 text-sm">{weeklyData.correctionGuidance.carbsGuidance}</p>
              </div>
            )}
            
            {weeklyData.correctionGuidance.fatGuidance && (
              <div className="bg-white rounded-lg p-3 border border-yellow-300">
                <h4 className="font-semibold text-yellow-800 mb-1">🥑 Fat</h4>
                <p className="text-yellow-700 text-sm">{weeklyData.correctionGuidance.fatGuidance}</p>
              </div>
            )}
            
            {weeklyData.correctionGuidance.caloriesGuidance && (
              <div className="bg-white rounded-lg p-3 border border-yellow-300">
                <h4 className="font-semibold text-yellow-800 mb-1">🔥 Calories</h4>
                <p className="text-yellow-700 text-sm">{weeklyData.correctionGuidance.caloriesGuidance}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success Message */}
      {!weeklyData.correctionGuidance.needsImprovement && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <div className="flex items-center">
            <svg className="w-8 h-8 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-lg font-bold text-green-800">Excellent Work!</h3>
              <p className="text-green-700 mt-1">{weeklyData.correctionGuidance.overallGuidance}</p>
            </div>
          </div>
        </div>
      )}

      {/* Targets Reference */}
      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Your Daily Targets</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-xl font-bold text-gray-900">
              {formatMacro(weeklyData.targets.targetProtein)}
            </div>
            <div className="text-sm text-gray-600">Protein</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-gray-900">
              {formatMacro(weeklyData.targets.targetCarbs)}
            </div>
            <div className="text-sm text-gray-600">Carbs</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-gray-900">
              {formatMacro(weeklyData.targets.targetFat)}
            </div>
            <div className="text-sm text-gray-600">Fat</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-gray-900">
              {formatMacro(weeklyData.targets.targetCalories, '')}
            </div>
            <div className="text-sm text-gray-600">Calories</div>
          </div>
        </div>
        <div className="mt-3 text-center text-sm text-gray-600">
          Tolerance: ±{weeklyData.targets.tolerancePct}%
        </div>
      </div>
    </div>
  )
}