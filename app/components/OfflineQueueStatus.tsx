'use client'

import React from 'react'
import { useOfflineQueue } from '@/app/lib/offline-queue'

interface OfflineQueueStatusProps {
  userId: string
  className?: string
}

export default function OfflineQueueStatus({ userId, className = '' }: OfflineQueueStatusProps) {
  const { stats, isOnline, processQueue, clearCompleted } = useOfflineQueue()

  if (isOnline && stats.pendingOperations === 0 && stats.failedOperations === 0) {
    return null // Don't show anything when online with no pending operations
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">
          Sync Status
        </h3>
        
        <div className="flex items-center">
          <div className={`w-2 h-2 rounded-full mr-2 ${
            isOnline ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          <span className="text-xs text-gray-600">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Queue Statistics */}
      <div className="space-y-2">
        {stats.pendingOperations > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Pending uploads:</span>
            <span className="font-medium text-yellow-600">
              {stats.pendingOperations}
            </span>
          </div>
        )}

        {stats.failedOperations > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Failed uploads:</span>
            <span className="font-medium text-red-600">
              {stats.failedOperations}
            </span>
          </div>
        )}

        {stats.completedOperations > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Completed:</span>
            <span className="font-medium text-green-600">
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
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-2 rounded-lg font-medium"
          >
            Sync Now
          </button>
        )}

        {stats.completedOperations > 0 && (
          <button
            onClick={clearCompleted}
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-xs px-3 py-2 rounded-lg font-medium"
          >
            Clear Completed
          </button>
        )}
      </div>

      {/* Status Messages */}
      {!isOnline && stats.pendingOperations > 0 && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          <div className="flex items-center">
            <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Operations will sync when connection is restored
          </div>
        </div>
      )}

      {stats.failedOperations > 0 && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
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