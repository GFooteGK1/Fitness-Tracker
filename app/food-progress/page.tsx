'use client'

import React, { useState, lazy, Suspense } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import Breadcrumbs from '@/app/components/Breadcrumbs'
import OfflineQueueStatus from '@/app/components/OfflineQueueStatus'
import { MealUploadResponse, DailyTargets } from '@/app/lib/types/food-tracking'

// Lazy load heavy components to improve initial page load
const DailyProgressView = lazy(() => import('@/app/components/DailyProgressView'))
const WeeklyAdherenceView = lazy(() => import('@/app/components/WeeklyAdherenceView'))
const MealCameraCapture = lazy(() => import('@/app/components/MealCameraCapture'))
const TargetManagement = lazy(() => import('@/app/components/TargetManagement'))

// Loading component for lazy-loaded components
const ComponentLoader = ({ children }: { children: string }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
    <div className="flex items-center justify-center py-12">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400 mr-3"></div>
      <span className="text-gray-600 dark:text-gray-400">Loading {children}...</span>
    </div>
  </div>
)

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
        case 't':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            setCurrentView('targets')
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

          {/* Date Picker */}
          {(currentView === 'daily' || currentView === 'weekly') && (
            <div className="mt-4">
              <label htmlFor="nutrition-date" className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                📅 {currentView === 'daily' ? 'Date' : 'Week Of'}
              </label>
              <input
                type="date"
                id="nutrition-date"
                value={selectedDate.toISOString().split('T')[0]}
                onChange={(e) => {
                  const newDate = new Date(e.target.value + 'T00:00:00')
                  setSelectedDate(newDate)
                }}
                className="block w-full px-3 py-3 text-base border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 box-border"
                style={{
                  minHeight: '48px',
                  fontSize: '16px',
                  colorScheme: 'light dark',
                  maxWidth: '100%',
                  margin: '0',
                  WebkitAppearance: 'none',
                  appearance: 'none'
                }}
              />
            </div>
          )}

          {/* Back button for camera and targets view */}
          {(currentView === 'camera' || currentView === 'targets') && (
            <div className="mt-4">
              <button
                onClick={handleBackToDaily}
                className="flex items-center space-x-2 px-3 sm:px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors touch-target"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm sm:text-base">Back to Daily</span>
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        {currentView === 'daily' && (
          <Suspense fallback={<ComponentLoader>Daily Progress</ComponentLoader>}>
            <DailyProgressView
              date={selectedDate}
              onAddMeal={handleAddMeal}
            />
            
            {/* Offline Queue Status */}
            <div className="mt-4 sm:mt-6">
              <OfflineQueueStatus />
            </div>
          </Suspense>
        )}
        
        {currentView === 'weekly' && (
          <Suspense fallback={<ComponentLoader>Weekly Progress</ComponentLoader>}>
            <WeeklyAdherenceView
              weekStart={getWeekStart(selectedDate)}
              onDateSelect={handleDateSelect}
            />
            
            {/* Offline Queue Status */}
            <div className="mt-4 sm:mt-6">
              <OfflineQueueStatus />
            </div>
          </Suspense>
        )}
        
        {currentView === 'targets' && (
          <Suspense fallback={<ComponentLoader>Target Management</ComponentLoader>}>
            <TargetManagement
              onTargetsUpdated={handleTargetsUpdated}
            />
            
            {/* Offline Queue Status */}
            <div className="mt-4 sm:mt-6">
              <OfflineQueueStatus />
            </div>
          </Suspense>
        )}
        
        {currentView === 'camera' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 sm:mb-6">Add New Meal</h2>
            <Suspense fallback={<ComponentLoader>Camera</ComponentLoader>}>
              <MealCameraCapture
                onUploadComplete={handlePhotoUploadComplete}
                onError={handleCameraError}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
    </ProtectedRoute>
  )
}