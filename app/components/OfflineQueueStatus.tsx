'use client'

import React from 'react'
import { useOfflineQueue } from '@/app/lib/offline-queue'
import { useAuth } from '@/app/lib/auth/AuthContext'

interface OfflineQueueStatusProps {
  className?: string
}

export default function OfflineQueueStatus({ className = '' }: OfflineQueueStatusProps) {
  const { user } = useAuth()
  const { stats, isOnline, processQueue, clearCompleted } = useOfflineQueue()

  // Don't show if user is not authenticated
  if (!user) {
    return null
  }

  if (isOnline && stats.pendingOperations === 0 && stats.failedOperations === 0) {
    return null // Don't show anything when online with no pending operations
  }

  return (
    <div className={`app-panel p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-[var(--foreground)]">
          Sync Status
        </h3>
        
        <div className="flex items-center">
          <div className={`w-2 h-2 rounded-full mr-2 ${
            isOnline ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          <span className="text-xs app-muted">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Queue Statistics */}
      <div className="space-y-2">
        {stats.pendingOperations > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="app-muted">Pending uploads:</span>
            <span className="font-medium text-[var(--warning)]">
              {stats.pendingOperations}
            </span>
          </div>
        )}

        {stats.failedOperations > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="app-muted">Failed uploads:</span>
            <span className="font-medium text-[var(--danger)]">
              {stats.failedOperations}
            </span>
          </div>
        )}

        {stats.completedOperations > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="app-muted">Completed:</span>
            <span className="font-medium text-[var(--accent)]">
              {stats.completedOperations}
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex gap-2">
        {isOnline && stats.pendingOperations > 0 && (
          <button
            onClick={processQueue}
            className="app-primary flex-1 text-xs"
          >
            Sync Now
          </button>
        )}

        {stats.completedOperations > 0 && (
          <button
            onClick={clearCompleted}
            className="app-secondary flex-1 text-xs"
          >
            Clear Completed
          </button>
        )}
      </div>

      {/* Status Messages */}
      {!isOnline && stats.pendingOperations > 0 && (
        <div className="app-notice app-notice-warning mt-3 text-xs">
          <div className="flex items-center">
            <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Operations will sync when connection is restored
          </div>
        </div>
      )}

      {stats.failedOperations > 0 && (
        <div className="app-notice app-notice-error mt-3 text-xs">
          <div className="flex items-center">
            <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Some operations failed and need attention
          </div>
        </div>
      )}

      {stats.lastSyncAttempt && (
        <div className="mt-2 text-xs text-gray-500">
          Last sync: {new Date(stats.lastSyncAttempt).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}