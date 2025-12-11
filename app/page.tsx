'use client'

import { useState, useEffect } from 'react'

// Helper function to get local date in YYYY-MM-DD format
function getLocalDate(offset = 0) {
  const now = new Date()
  now.setDate(now.getDate() + offset)
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper to format date nicely
function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetDate = new Date(date)
  targetDate.setHours(0, 0, 0, 0)
  
  const diffTime = targetDate.getTime() - today.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays === 1) return 'Tomorrow'
  
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(getLocalDate())
  const [workoutText, setWorkoutText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Fetch workout when date changes
  useEffect(() => {
    fetchWorkout(selectedDate)
  }, [selectedDate])

  async function fetchWorkout(date: string) {
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch(`/api/workouts?date=${date}`)
      const data = await response.json()
      
      if (data.workout) {
        setWorkoutText(data.workout)
        setError('')
      } else {
        setWorkoutText('')
        if (data.message) {
          setError(data.message)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workout')
      setWorkoutText('')
    } finally {
      setLoading(false)
    }
  }

  function changeDate(offset: number) {
    const current = new Date(selectedDate + 'T00:00:00')
    current.setDate(current.getDate() + offset)
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, '0')
    const day = String(current.getDate()).padStart(2, '0')
    const newDate = `${year}-${month}-${day}`
    setSelectedDate(newDate)
    fetchWorkout(newDate)
  }

  function handleDatePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDate = e.target.value
    setSelectedDate(newDate)
    setShowDatePicker(false)
    fetchWorkout(newDate)
  }

  return (
    <div>

      {/* Date Navigation */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => changeDate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Previous day"
          >
            <span className="text-2xl">←</span>
          </button>
          
          <div className="text-center relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Select date"
            >
              <span className="text-2xl">📅</span>
            </button>
            
            {showDatePicker && (
              <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 z-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={handleDatePickerChange}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  autoFocus
                />
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="mt-2 w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          
          <button
            onClick={() => changeDate(1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Next day"
          >
            <span className="text-2xl">→</span>
          </button>
        </div>
      </div>

      {/* Workout Display */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Workout {formatDate(selectedDate)}
          </h2>
          <button
            onClick={() => fetchWorkout(selectedDate)}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            disabled={loading}
          >
            🔄 Refresh
          </button>
        </div>
        
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 dark:border-blue-400 mb-3"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading workout...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button
              onClick={() => fetchWorkout(selectedDate)}
              className="bg-blue-600 dark:bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-semibold"
            >
              Try Again
            </button>
          </div>
        ) : workoutText ? (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
              {workoutText}
            </pre>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              No workout programmed for this day
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Check your Google Sheet or try a different date
            </p>
          </div>
        )}
      </div>

      {/* Quick Action */}
      {workoutText && (
        <div className="mt-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-green-900 dark:text-green-100">Ready to log this workout?</div>
              <div className="text-sm text-green-700 dark:text-green-300">Copy the workout and log your results</div>
            </div>
            <a
              href={`/log?workout=${encodeURIComponent(workoutText)}&date=${selectedDate}`}
              className="bg-green-600 dark:bg-green-700 text-white px-6 py-2 rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors font-semibold whitespace-nowrap"
            >
              Log Results →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
