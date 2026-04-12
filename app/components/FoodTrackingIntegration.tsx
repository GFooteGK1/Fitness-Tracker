'use client'

import React, { useState, useEffect } from 'react'
import { MealEntry, DailyTargets, MealUploadResponse } from '@/app/lib/types/food-tracking'
import MealCameraCapture from './MealCameraCapture'
import DailyProgressView from './DailyProgressView'
import WeeklyAdherenceView from './WeeklyAdherenceView'
import TargetManagement from './TargetManagement'
import OfflineQueueStatus from './OfflineQueueStatus'
import { useAuth } from '@/app/lib/auth/AuthContext'

interface FoodTrackingIntegrationProps {
  initialView?: 'daily' | 'weekly' | 'camera' | 'targets'
  onViewChange?: (view: string) => void
}

/**
 * Comprehensive integration component that demonstrates all food tracking
 * components working together seamlessly. This component serves as the
 * main orchestrator for the food tracking feature.
 * 
 * Requirements addressed:
 * - Wire camera capture to meal logging flow
 * - Connect daily/weekly views to data APIs
 * - Integrate target management with progress tracking
 */
export default function FoodTrackingIntegration({
  initialView = 'daily',
  onViewChange
}: FoodTrackingIntegrationProps) {
  const { user } = useAuth()
  const [currentView, setCurrentView] = useState(initialView)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [targets, setTargets] = useState<DailyTargets | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Handle view changes and notify parent
  const handleViewChange = (newView: string) => {
    setCurrentView(newView as any)
    onViewChange?.(newView)
  }

  // Handle successful photo upload - return to daily view and refresh
  const handlePhotoUploadComplete = (response: MealUploadResponse) => {
    console.log('Photo upload completed:', response)
    
    // Trigger refresh of daily data
    setRefreshTrigger(prev => prev + 1)
    
    // Return to daily view to see the new meal
    handleViewChange('daily')
    
    // Show success feedback (could be enhanced with toast notifications)
    console.log('Meal logged successfully, returning to daily view')
  }

  // Handle camera errors
  const handleCameraError = (error: string) => {
    console.error('Camera error:', error)
    // Could show toast notification or error state
  }

  // Handle target updates - refresh progress views
  const handleTargetsUpdated = (updatedTargets: DailyTargets) => {
    console.log('Targets updated:', updatedTargets)
    setTargets(updatedTargets)
    
    // Trigger refresh of progress views
    setRefreshTrigger(prev => prev + 1)
    
    // Return to daily view to see updated progress
    handleViewChange('daily')
  }

  // Handle date selection from weekly view
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    handleViewChange('daily')
  }

  // Handle add meal button from daily view
  const handleAddMeal = () => {
    handleViewChange('camera')
  }

  // Get week start for weekly view
  const getWeekStart = (date: Date) => {
    const weekStart = new Date(date)
    const day = weekStart.getDay()
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1)
    weekStart.setDate(diff)
    weekStart.setHours(0, 0, 0, 0)
    return weekStart
  }

  return (
    <div className="food-tracking-integration">
      {/* View Navigation */}
      <div className="mb-6 bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleViewChange('daily')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                currentView === 'daily'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => handleViewChange('weekly')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                currentView === 'weekly'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => handleViewChange('camera')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                currentView === 'camera'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📷 Add Meal
            </button>
            <button
              onClick={() => handleViewChange('targets')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                currentView === 'targets'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🎯 Targets
            </button>
          </div>

          {/* Integration Status Indicator */}
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>All systems connected</span>
          </div>
        </div>
      </div>

      {/* View Content */}
      <div className="view-content">
        {currentView === 'daily' && (
          <DailyProgressView
            date={selectedDate}
            onAddMeal={handleAddMeal}
            key={`daily-${refreshTrigger}`} // Force refresh when needed
          />
        )}

        {currentView === 'weekly' && (
          <WeeklyAdherenceView
            weekStart={getWeekStart(selectedDate)}
            onDateSelect={handleDateSelect}
            key={`weekly-${refreshTrigger}`} // Force refresh when needed
          />
        )}

        {currentView === 'camera' && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Add New Meal</h2>
              <button
                onClick={() => handleViewChange('daily')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <MealCameraCapture
              onUploadComplete={handlePhotoUploadComplete}
              onError={handleCameraError}
            />
          </div>
        )}

        {currentView === 'targets' && (
          <TargetManagement
            onTargetsUpdated={handleTargetsUpdated}
          />
        )}
      </div>

      {/* Offline Queue Status - Always visible */}
      <div className="mt-6">
        <OfflineQueueStatus />
      </div>

      {/* Integration Debug Info (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-6 p-4 bg-gray-100 rounded-lg border border-gray-300">
          <h3 className="font-medium text-gray-900 mb-2">Integration Status</h3>
          <div className="text-sm text-gray-600 space-y-1">
            <div>Current View: {currentView}</div>
            <div>Selected Date: {`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`}</div>
            <div>User ID: {user?.id || 'Not authenticated'}</div>
            <div>Targets Set: {targets ? 'Yes' : 'No'}</div>
            <div>Refresh Trigger: {refreshTrigger}</div>
          </div>
        </div>
      )}
    </div>
  )
}