'use client'

import React, { useState, useEffect, useRef } from 'react'
import MealCameraCapture from './MealCameraCapture'
import { MealUploadResponse } from '@/app/lib/types/food-tracking'
import { getMealTimestamp } from '@/app/lib/timezone-utils'

interface MealInputEnhancedProps {
  onUploadComplete?: (response: MealUploadResponse) => void
  onError?: (error: string) => void
  userId?: string
  selectedDate?: Date  // Optional date for logging meals to past dates
}

export default function MealInputEnhanced({
  onUploadComplete,
  onError,
  userId,
  selectedDate
}: MealInputEnhancedProps) {
  const [mealText, setMealText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recognition, setRecognition] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showTextInput, setShowTextInput] = useState(false)
  const transcriptRef = useRef('')

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        setRecognition({} as any) // Placeholder to indicate it's available
      }
    }
  }, [])

  function initializeSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return null

    const recognitionInstance = new SpeechRecognition()
    recognitionInstance.continuous = true
    recognitionInstance.interimResults = true
    recognitionInstance.lang = 'en-US'

    recognitionInstance.onstart = () => {
      setIsRecording(true)
      transcriptRef.current = ''
    }

    recognitionInstance.onresult = (event: any) => {
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          transcriptRef.current += transcript + ' '
        } else {
          interimTranscript += transcript
        }
      }

      const fullText = transcriptRef.current + interimTranscript
      setMealText(fullText)
      
      // Auto-open text input as soon as we get any speech
      if (fullText.trim().length > 0) {
        setShowTextInput(true)
      }
    }

    recognitionInstance.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsRecording(false)
      if (event.error === 'not-allowed') {
        onError?.('Microphone access denied')
      }
    }

    recognitionInstance.onend = () => {
      setIsRecording(false)
      if (transcriptRef.current.trim()) {
        setMealText(transcriptRef.current.trim())
        setShowTextInput(true)
      }
    }

    return recognitionInstance
  }

  function toggleVoiceRecording() {
    if (isRecording && recognition && typeof recognition.stop === 'function') {
      recognition.stop()
      return
    }

    if (!recognition || typeof recognition.start !== 'function') {
      const newRecognition = initializeSpeechRecognition()
      if (!newRecognition) {
        onError?.('Voice input not supported in this browser')
        return
      }
      setRecognition(newRecognition)
      transcriptRef.current = ''
      setMealText('')
      try {
        newRecognition.start()
      } catch (error) {
        onError?.('Failed to start voice input')
      }
    } else {
      transcriptRef.current = ''
      setMealText('')
      try {
        recognition.start()
      } catch (error) {
        onError?.('Failed to start voice input')
      }
    }
  }

  async function handleTextSubmit() {
    if (!mealText.trim()) {
      onError?.('Please enter meal details')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/meals/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: mealText,
          timestamp: getMealTimestamp(selectedDate)
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse meal')
      }

      // Call onUploadComplete with the result
      onUploadComplete?.({
        mealId: result.mealId,
        analysisStatus: 'complete'
      })

      // Clear form
      setMealText('')
      transcriptRef.current = ''
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to log meal')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Camera Component - Always visible */}
      <MealCameraCapture
        onUploadComplete={onUploadComplete}
        onError={onError}
        userId={userId}
        selectedDate={selectedDate}
      />

      {/* Divider with "OR" */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
            OR
          </span>
        </div>
      </div>

      {/* Voice/Text Input Section */}
      <div className="space-y-4">
        <div className="flex gap-3">
          {/* Voice Button */}
          <button
            type="button"
            onClick={toggleVoiceRecording}
            disabled={!recognition}
            className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
              !recognition
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                : isRecording
                ? 'bg-red-500 text-white'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {!recognition ? '🚫 Voice Not Supported' : isRecording ? '⏹️ Stop Recording' : '🎤 Voice Input'}
          </button>

          {/* Text Input Toggle */}
          <button
            type="button"
            onClick={() => setShowTextInput(!showTextInput)}
            className="flex-1 px-4 py-3 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            ✏️ {showTextInput ? 'Hide' : 'Show'} Text Input
          </button>
        </div>

        {/* Text Input Area (collapsible) */}
        {showTextInput && (
          <div className="space-y-3">
            <textarea
              value={mealText}
              onChange={(e) => setMealText(e.target.value)}
              placeholder="Chicken breast 6oz, brown rice 1 cup, broccoli 1 cup, olive oil 1 tbsp"
              rows={4}
              className="w-full px-4 py-3 text-base border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-y bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Type naturally. Include portion sizes when possible.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setMealText('')
                  transcriptRef.current = ''
                }}
                className="px-6 py-2 font-semibold border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                disabled={isSubmitting}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={isSubmitting || !mealText.trim()}
                className="flex-1 bg-blue-600 text-white px-6 py-2 font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? '⏳ Analyzing...' : '✓ Submit Meal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
