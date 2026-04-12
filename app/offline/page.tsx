'use client'

import { useEffect, useState } from 'react'

export default function OfflinePage() {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    try {
      const queue = localStorage.getItem('food_tracking_offline_queue')
      if (queue) {
        const items = JSON.parse(queue)
        const pending = items.filter((op: any) => op.status === 'pending' || op.status === 'processing')
        setPendingCount(pending.length)
      }
      const workoutQueue = localStorage.getItem('workout_offline_queue')
      if (workoutQueue) {
        const items = JSON.parse(workoutQueue)
        const pending = items.filter((op: any) => op.status === 'pending' || op.status === 'processing')
        setPendingCount(prev => prev + pending.length)
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728m2.828 9.9a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M12 12h.01"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            You&apos;re Offline
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            It looks like you&apos;ve lost your internet connection.
            Don&apos;t worry — your cached data is still available.
          </p>
        </div>

        {pendingCount > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <span className="font-semibold">{pendingCount} queued {pendingCount === 1 ? 'entry' : 'entries'}</span>{' '}
              will sync automatically when your connection is restored.
            </p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-left space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            While offline, you can:
          </h2>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              View previously loaded dashboard data
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Log workouts and meals (they&apos;ll sync later)
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Browse cached pages and food progress
            </li>
          </ul>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Try Again
        </button>
      </div>
    </div>
  )
}
