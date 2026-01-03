'use client'

import React, { useState } from 'react'
import DailyProgressView from '@/app/components/DailyProgressView'
import WeeklyAdherenceView from '@/app/components/WeeklyAdherenceView'
import MealCameraCapture from '@/app/components/MealCameraCapture'
import TargetManagement from '@/app/components/TargetManagement'
import Breadcrumbs from '@/app/components/Breadcrumbs'
import OfflineQueueStatus from '@/app/components/OfflineQueueStatus'
import { MealUploadResponse, DailyTargets } from '@/app/lib/types/food-tracking'

export default function FoodProgressPage() {
  const [currentView, setCurrentView] = useState<'daily' | 'weekly' | 'camera' | 'targets'>('daily')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [targets, setTargets] = useState<DailyTargets | null>(null)
  
  // Mock user ID for testing - in real app this would come from auth
  const userId = 'test-user-id'

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumbs */}
        <div className="mb-4">
          <Breadcrumbs items={getBreadcrumbs()} />
        </div>

        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            {currentView === 'camera' ? 'Add New Meal' :
             currentView === 'weekly' ? `Weekly Progress` :
             currentView === 'targets' ? 'Manage Targets' :
             'Daily Progress'}
          </h1>
          {currentView === 'daily' && (
            <p className="text-gray-600 mt-1">{formatDateForTitle(selectedDate)}</p>
          )}
          {currentView === 'weekly' && (
            <p className="text-gray-600 mt-1">{formatWeekForTitle(getWeekStart(selectedDate))}</p>
          )}
          {currentView === 'targets' && (
            <p className="text-gray-600 mt-1">Set your daily macro and calorie targets</p>
          )}
        </div>
        {/* Navigation Header */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <div className="flex items-center justify-between">
            {/* View Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setCurrentView('daily')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  currentView === 'daily'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Daily View
              </button>
              <button
                onClick={() => setCurrentView('weekly')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  currentView === 'weekly'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Weekly View
              </button>
              <button
                onClick={() => setCurrentView('camera')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  currentView === 'camera'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📷 Add Meal
              </button>
              <button
                onClick={() => setCurrentView('targets')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  currentView === 'targets'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🎯 Targets
              </button>
            </div>

            {/* Date Navigation - only show for daily/weekly views */}
            {(currentView === 'daily' || currentView === 'weekly') && (
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => navigateDate('prev')}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                <button
                  onClick={goToToday}
                  className="px-4 py-2 text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  Today
                </button>
                
                <button
                  onClick={() => navigateDate('next')}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}

            {/* Back button for camera and targets view */}
            {(currentView === 'camera' || currentView === 'targets') && (
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleBackToDaily}
                  className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Back to Daily</span>
                </button>
                
                <div className="text-sm text-gray-500">
                  Press <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Esc</kbd> to go back
                </div>
              </div>
            )}

            {/* Keyboard shortcuts help */}
            {(currentView === 'daily' || currentView === 'weekly') && (
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <span>Shortcuts:</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">←→</kbd>
                <span>navigate</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">T</kbd>
                <span>today</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Cmd+C</kbd>
                <span>camera</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Cmd+T</kbd>
                <span>targets</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {currentView === 'daily' && (
          <>
            <DailyProgressView
              date={selectedDate}
              userId={userId}
              onAddMeal={handleAddMeal}
            />
            
            {/* Offline Queue Status */}
            <div className="mt-6">
              <OfflineQueueStatus userId={userId} />
            </div>
          </>
        )}
        
        {currentView === 'weekly' && (
          <>
            <WeeklyAdherenceView
              weekStart={getWeekStart(selectedDate)}
              userId={userId}
              onDateSelect={handleDateSelect}
            />
            
            {/* Offline Queue Status */}
            <div className="mt-6">
              <OfflineQueueStatus userId={userId} />
            </div>
          </>
        )}
        
        {currentView === 'targets' && (
          <>
            <TargetManagement
              userId={userId}
              onTargetsUpdated={handleTargetsUpdated}
            />
            
            {/* Offline Queue Status */}
            <div className="mt-6">
              <OfflineQueueStatus userId={userId} />
            </div>
          </>
        )}
        
        {currentView === 'camera' && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Add New Meal</h2>
            <MealCameraCapture
              userId={userId}
              onUploadComplete={handlePhotoUploadComplete}
              onError={handleCameraError}
            />
          </div>
        )}
      </div>
    </div>
  )
}