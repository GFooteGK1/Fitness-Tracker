'use client'

import React, { useState } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'

interface SimpleMealCaptureProps {
  onUploadComplete?: (response: any) => void
  onError?: (error: string) => void
}

export default function SimpleMealCapture({
  onUploadComplete,
  onError
}: SimpleMealCaptureProps) {
  const { user } = useAuth()
  const [isActive, setIsActive] = useState(false)

  const handleStartCamera = () => {
    if (!user) {
      onError?.('User not authenticated')
      return
    }
    setIsActive(true)
  }

  const handleStop = () => {
    setIsActive(false)
  }

  return (
    <div className="simple-meal-capture">
      <div className="text-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          Simple Meal Capture Test
        </h3>
        
        {!isActive ? (
          <div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Test version - click to activate camera interface
            </p>
            <button
              onClick={handleStartCamera}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
            >
              Start Camera Test
            </button>
          </div>
        ) : (
          <div>
            <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4 flex items-center justify-center">
              <p className="text-gray-600 dark:text-gray-400">Camera View Placeholder</p>
            </div>
            <button
              onClick={handleStop}
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg"
            >
              Stop Camera
            </button>
          </div>
        )}
      </div>
    </div>
  )
}