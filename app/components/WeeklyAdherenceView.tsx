'use client'

import React, { useState, useEffect } from 'react'
import { DailyTargets, DailySummary } from '@/app/lib/types/food-tracking'
import { WeeklyAdherenceScore, CorrectionGuidance } from '@/app/lib/adherence-calculator'
import { useAuth } from '@/app/lib/auth/AuthContext'

interface WeeklyAdherenceViewProps {
  weekStart: Date
  onDateSelect?: (date: Date) => void
}

interface WeeklyAdherenceResponse {
  weeklyAdherence: WeeklyAdherenceScore
  correctionGuidance: CorrectionGuidance
  targets: DailyTargets
  daysWithData: number
  weekStart: string
  weekEnd: string
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

      const weekStartStr = weekStart.toLocaleDateString('en-CA')
      // Send timezone offset so server can query correct UTC range
      const tzOffset = new Date().getTimezoneOffset()
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

  const getDayOfWeek = (dayIndex: number) => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    return days[dayIndex]
  }

  const getFullDayName = (dayIndex: number) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    return days[dayIndex]
  }

  const getScoreColor = (score: number) => {
    if (score >= 95) return 'bg-green-500 text-white'
    if (score >= 85) return 'bg-yellow-500 text-white'
    if (score >= 70) return 'bg-orange-500 text-white'
    return 'bg-red-500 text-white'
  }

  const getScoreBorderColor = (score: number) => {
    if (score >= 95) return 'border-green-500'
    if (score >= 85) return 'border-yellow-500'
    if (score >= 70) return 'border-orange-500'
    return 'border-red-500'
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

  const getDayData = (date: Date) => {
    if (!weeklyData) return null
    
    const dateStr = date.toLocaleDateString('en-CA')
    return weeklyData.weeklyAdherence.dailyScores.find(
      day => new Date(day.date).toLocaleDateString('en-CA') === dateStr
    )
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isFutureDate = (date: Date) => {
    const today = new Date()
    today.setHours(23, 59, 59, 999) // End of today
    return date > today
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

      {/* Weekly Score Summary */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Weekly Score</h2>
          <div className={`px-4 py-2 rounded-lg font-bold text-xl ${getScoreColor(weeklyData.weeklyAdherence.averageScore)}`}>
            {Math.round(weeklyData.weeklyAdherence.averageScore)}%
          </div>
        </div>

        {/* Macro Scores */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {Math.round(weeklyData.weeklyAdherence.proteinWeeklyScore)}%
            </div>
            <div className="text-sm text-gray-600">Protein</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {Math.round(weeklyData.weeklyAdherence.carbsWeeklyScore)}%
            </div>
            <div className="text-sm text-gray-600">Carbs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {Math.round(weeklyData.weeklyAdherence.fatWeeklyScore)}%
            </div>
            <div className="text-sm text-gray-600">Fat</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {Math.round(weeklyData.weeklyAdherence.caloriesWeeklyScore)}%
            </div>
            <div className="text-sm text-gray-600">Calories</div>
          </div>
        </div>
      </div>

      {/* Daily Grid */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Daily Breakdown</h2>
        
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((date, index) => {
            const dayData = getDayData(date)
            const isCurrentDay = isToday(date)
            const isFuture = isFutureDate(date)
            
            return (
              <div
                key={index}
                className={`p-3 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md ${
                  isCurrentDay ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
                } ${
                  isFuture ? 'bg-gray-50 border-gray-200' : 
                  dayData ? `border-2 ${getScoreBorderColor(dayData.adherenceStatus.overallScore)}` : 
                  'border-gray-200 bg-gray-50'
                }`}
                onClick={() => onDateSelect && onDateSelect(date)}
              >
                <div className="text-center">
                  <div className="text-xs font-medium text-gray-600 mb-1">
                    {getDayOfWeek(index)}
                  </div>
                  <div className="text-sm font-bold text-gray-900 mb-2">
                    {date.getDate()}
                  </div>
                  
                  {isFuture ? (
                    <div className="text-xs text-gray-400">Future</div>
                  ) : dayData ? (
                    <>
                      <div className={`text-xs font-bold px-2 py-1 rounded ${getScoreColor(dayData.adherenceStatus.overallScore)}`}>
                        {Math.round(dayData.adherenceStatus.overallScore)}%
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="text-xs text-gray-600">
                          P: {formatMacro(dayData.dailyTotals.protein)}
                        </div>
                        <div className="text-xs text-gray-600">
                          C: {formatMacro(dayData.dailyTotals.carbs)}
                        </div>
                        <div className="text-xs text-gray-600">
                          F: {formatMacro(dayData.dailyTotals.fat)}
                        </div>
                        <div className="text-xs text-gray-600">
                          Cal: {formatMacro(dayData.dailyTotals.calories, '')}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-400">No data</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center space-x-4 text-xs">
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