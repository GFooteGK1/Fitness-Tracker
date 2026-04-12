'use client'

import { useEffect, useState, useRef } from 'react'

export default function ConnectivityIndicator() {
  const [isOnline, setIsOnline] = useState(true)
  const [showReconnected, setShowReconnected] = useState(false)
  const [syncedCount, setSyncedCount] = useState(0)
  const wasOffline = useRef(false)

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      if (wasOffline.current) {
        wasOffline.current = false
        syncQueuedItems()
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      wasOffline.current = true
      setShowReconnected(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const syncQueuedItems = () => {
    let pending = 0

    try {
      const foodQueue = localStorage.getItem('food_tracking_offline_queue')
      if (foodQueue) {
        const items = JSON.parse(foodQueue)
        pending += items.filter((op: any) => op.status === 'pending').length
      }
    } catch { /* ignore */ }

    try {
      const workoutQueue = localStorage.getItem('workout_offline_queue')
      if (workoutQueue) {
        const items = JSON.parse(workoutQueue)
        pending += items.filter((op: any) => op.status === 'pending').length
      }
    } catch { /* ignore */ }

    setSyncedCount(pending)
    setShowReconnected(true)

    setTimeout(() => {
      setShowReconnected(false)
      setSyncedCount(0)
    }, 5000)
  }

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true
    }
  }, [isOnline])

  if (isOnline && !showReconnected) return null

  return (
    <>
      {/* Offline indicator bar */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-yellow-500 text-yellow-900 text-center py-1.5 text-xs font-medium shadow-sm">
          <div className="flex items-center justify-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-700 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-700" />
            </span>
            You&apos;re offline — changes will sync when you reconnect
          </div>
        </div>
      )}

      {/* Reconnected toast */}
      {showReconnected && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-slide-down">
          <div className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {syncedCount > 0
              ? `Back online — syncing ${syncedCount} queued ${syncedCount === 1 ? 'item' : 'items'}`
              : 'Back online'}
          </div>
        </div>
      )}
    </>
  )
}
