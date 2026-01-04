'use client'

import React, { useState } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import DailyProgressView from '@/app/components/DailyProgressView'
import WeeklyAdherenceView from '@/app/components/WeeklyAdherenceView'
import MealCameraCaptureFixed from '@/app/components/MealCameraCaptureFixed'
import TargetManagement from '@/app/components/TargetManagement'
import Breadcrumbs from '@/app/components/Breadcrumbs'
import OfflineQueueStatus from '@/app/components/OfflineQueueStatus'
import { MealUploadResponse, DailyTargets } from '@/app/lib/types/food-tracking'

export default function FoodProgressPage() {
  const { user } = useAuth()
  const [currentView, setCurrentView] = useState<'daily' | 'weekly' | 'camera' | 'targets'>('daily')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [targets, setTargets] = useState<DailyTargets | null>(null)

  // Handle URL parameters for direct camera access
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const view = params.get('view')
      if (view === 'camera') {
        setCurrentView('camera')
      } else if (view === 'targets') {
        setCurrentView('targets')
      }
    }
  }, [])

  // Keyboard shortcuts for navigation
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when not in an input field
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.key) {
        case '1':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            setCurrentView('daily')
          }
          break
        case '2':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            setCurrentView('weekly')
          }
          break
        case '3':
        case 'c':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            setCurrentView('camera')
          }
          break
        case '4':
        case 't':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            setCurrentView('targets')
          }
          break
        case 'ArrowLeft':
          if (currentView !== 'camera') {
            event.preventDefault()
            navigateDate('prev')
          }
          break
        case 'ArrowRight':
          if (currentView !== 'camera') {
            event.preventDefault()
            navigateDate('next')
          }
          break
        case 't':
          if (currentView !== 'camera') {
            event.preventDefault()
            goToToday()
          }
          break
        case 'Escape':
          if (currentView === 'camera' || currentView === 'targets') {
            event.preventDefault()
            handleBackToDaily()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentView])

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    setCurrentView('daily')
  }

  const getWeekStart = (date: Date) => {
    const weekStart = new Date(date)
    const day = weekStart.getDay()
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
    weekStart.setDate(diff)
    weekStart.setHours(0, 0, 0, 0)
    return weekStart
  }

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    if (currentView === 'daily') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
    }
    setSelectedDate(newDate)
  }

  const goToToday = () => {
    setSelectedDate(new Date())
  }

  const handleAddMeal = () => {
    setCurrentView('camera')
  }

  const handlePhotoUploadComplete = (response: MealUploadResponse) => {
    // After successful upload, return to daily view and refresh data
    setCurrentView('daily')
    // The DailyProgressView will automatically refresh when it mounts
  }

  const handleTargetsUpdated = (updatedTargets: DailyTargets) => {
    setTargets(updatedTargets)
    // Return to daily view to see updated progress
    setCurrentView('daily')
  }

  const handleCameraError = (error: string) => {
    console.error('Camera error:', error)
    // You could show a toast notification here
  }

  const handleBackToDaily = () => {
    setCurrentView('daily')
  }

  const getBreadcrumbs = () => {
    const breadcrumbs = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Nutrition', href: '/food-progress' }
    ]

    if (currentView === 'camera') {
      breadcrumbs.push({ label: 'Add Meal', current: true } as any)
    } else if (currentView === 'weekly') {
      breadcrumbs.push({ label: 'Weekly View', current: true } as any)
    } else if (currentView === 'targets') {
      breadcrumbs.push({ label: 'Manage Targets', current: true } as any)
    } else {
      breadcrumbs.push({ label: 'Daily View', current: true } as any)
    }

    return breadcrumbs
  }

  const formatDateForTitle = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date)
  }

  const formatWeekForTitle = (weekStart: Date) => {
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    
    const startStr = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric'
    }).format(weekStart)
    
    const endStr = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(weekEnd)
    
    return `${startStr} - ${endStr}`
  }

  return (
    <ProtectedRoute requireOnboarding={true}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Breadcrumbs - Hidden on mobile to save space */}
        <div className="mb-3 sm:mb-4 hidden sm:block">
          <Breadcrumbs items={getBreadcrumbs()} />
        </div>

        {/* Mobile-First Page Title */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {currentView === 'camera' ? 'Add New Meal' :
             currentView === 'weekly' ? `Weekly Progress` :
             currentView === 'targets' ? 'Manage Targets' :
             'Daily Progress'}
          </h1>
          {currentView === 'daily' && (
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">{formatDateForTitle(selectedDate)}</p>
          )}
          {currentView === 'weekly' && (
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">{formatWeekForTitle(getWeekStart(selectedDate))}</p>
          )}
          {currentView === 'targets' && (
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">Set your daily macro and calorie targets</p>
          )}
        </div>

        {/* Mobile-Optimized Navigation Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-4 sm:mb-6">
          {/* Mobile View Toggle - Horizontal scroll on small screens */}
          <div className="mb-4 sm:mb-0">
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 overflow-x-auto">
              <button
                onClick={() => setCurrentView('daily')}
                className={`px-3 sm:px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  currentView === 'daily'
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                Daily View
              </button>
              <button
                onClick={() => setCurrentView('weekly')}
                className={`px-3 sm:px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  currentView === 'weekly'
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                Weekly View
              </button>
              <button
                onClick={() => setCurrentView('camera')}
                className={`px-3 sm:px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  currentView === 'camera'
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                📷 Add Meal
              </button>
              <button
                onClick={() => setCurrentView('targets')}
                className={`px-3 sm:px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  currentView === 'targets'
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                🎯 Targets
              </button>
            </div>
          </div>

          {/* Mobile-Optimized Date Navigation */}
          {(currentView === 'daily' || currentView === 'weekly') && (
            <div className="flex items-center justify-between sm:justify-end sm:space-x-4">
              <div className="flex items-center space-x-2 sm:space-x-4">
                <button
                  onClick={() => navigateDate('prev')}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors touch-target"
                  aria-label="Previous day"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                <button
                  onClick={goToToday}
                  className="px-3 sm:px-4 py-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors text-sm sm:text-base touch-target"
                >
                  Today
                </button>
                
                <button
                  onClick={() => navigateDate('next')}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors touch-target"
                  aria-label="Next day"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Keyboard shortcuts help - Hidden on mobile */}
              <div className="hidden lg:flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <span>Shortcuts:</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">←→</kbd>
                <span>navigate</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">T</kbd>
                <span>today</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Cmd+C</kbd>
                <span>camera</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Cmd+T</kbd>
                <span>targets</span>
              </div>
            </div>
          )}

          {/* Mobile-Optimized Back button for camera and targets view */}
          {(currentView === 'camera' || currentView === 'targets') && (
            <div className="flex items-center justify-between">
              <button
                onClick={handleBackToDaily}
                className="flex items-center space-x-2 px-3 sm:px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors touch-target"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm sm:text-base">Back to Daily</span>
              </button>
              
              {/* Escape hint - Hidden on mobile */}
              <div className="hidden sm:block text-sm text-gray-500 dark:text-gray-400">
                Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Esc</kbd> to go back
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        {currentView === 'daily' && (
          <>
            <DailyProgressView
              date={selectedDate}
              onAddMeal={handleAddMeal}
            />
            
            {/* Offline Queue Status */}
            <div className="mt-4 sm:mt-6">
              <OfflineQueueStatus />
            </div>
          </>
        )}
        
        {currentView === 'weekly' && (
          <>
            <WeeklyAdherenceView
              weekStart={getWeekStart(selectedDate)}
              onDateSelect={handleDateSelect}
            />
            
            {/* Offline Queue Status */}
            <div className="mt-4 sm:mt-6">
              <OfflineQueueStatus />
            </div>
          </>
        )}
        
        {currentView === 'targets' && (
          <>
            <TargetManagement
              onTargetsUpdated={handleTargetsUpdated}
            />
            
            {/* Offline Queue Status */}
            <div className="mt-4 sm:mt-6">
              <OfflineQueueStatus />
            </div>
          </>
        )}
        
        {currentView === 'camera' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 sm:mb-6">Add New Meal</h2>
            <MealCameraCaptureFixed
              onUploadComplete={handlePhotoUploadComplete}
              onError={handleCameraError}
            />
          </div>
        )}
      </div>
    </div>
    </ProtectedRoute>
  )
}