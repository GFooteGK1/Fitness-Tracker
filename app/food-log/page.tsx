'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { compressImage, isSupportedImageFormat, formatFileSize, type ImageCompressionResult } from '../lib/imageUtils'
import { getLocalDate } from '@/app/lib/timezone-utils'

export default function FoodLog() {
  const { user } = useAuth()
  const [mealText, setMealText] = useState('')
  const [mealDate, setMealDate] = useState(getLocalDate())
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recognition, setRecognition] = useState<any>(null)
  const [finalTranscript, setFinalTranscript] = useState('')

  // Image processing states
  const [isCompressing, setIsCompressing] = useState(false)
  const [compressionResult, setCompressionResult] = useState<ImageCompressionResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Setup speech recognition on mount
  useEffect(() => {
    // Just check if speech recognition is available
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

      if (SpeechRecognition) {
        console.log('Speech recognition is available')
        // Don't create the instance yet - wait for user interaction
        // Just set a flag that it's available
        setRecognition({} as any) // Placeholder to indicate it's available
      } else {
        console.log('Speech recognition not supported in this browser')
      }
    }
  }, [])

  function initializeSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      return null
    }

    const recognitionInstance = new SpeechRecognition()

    recognitionInstance.continuous = true
    recognitionInstance.interimResults = true
    recognitionInstance.lang = 'en-US'

    recognitionInstance.onstart = () => {
      console.log('Speech recognition started')
      setIsRecording(true)
      setStatus({ message: '🎤 Listening... Speak what you ate', type: 'info' })
    }

    recognitionInstance.onresult = (event: any) => {
      let interimTranscript = ''
      let newFinalTranscript = finalTranscript

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          newFinalTranscript += transcript + ' '
        } else {
          interimTranscript += transcript
        }
      }

      setFinalTranscript(newFinalTranscript)
      setMealText(newFinalTranscript + interimTranscript)
    }

    recognitionInstance.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsRecording(false)

      if (event.error === 'not-allowed') {
        setStatus({ message: 'Microphone access denied. Please enable it in your browser settings.', type: 'error' })
      } else if (event.error === 'no-speech') {
        setStatus({ message: 'No speech detected. Try again.', type: 'error' })
      } else {
        setStatus({ message: 'Voice recognition error: ' + event.error, type: 'error' })
      }
    }

    recognitionInstance.onend = () => {
      console.log('Speech recognition ended')
      setIsRecording(false)

      if (finalTranscript.trim()) {
        setMealText(finalTranscript.trim())
        setStatus({ message: '✓ Voice input captured', type: 'success' })
        setTimeout(() => {
          setStatus(null)
        }, 2000)
      }
    }

    return recognitionInstance
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!mealText.trim()) {
      setStatus({ message: 'Please enter meal details', type: 'error' })
      return
    }

    setLoading(true)
    setStatus({ message: 'Analyzing meal with AI...', type: 'info' })

    try {
      const response = await fetch('/api/meals/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: mealText,
          timestamp: new Date(mealDate + 'T12:00:00').toISOString()
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse meal')
      }

      setStatus({
        message: `✓ Meal logged! ${result.totals.protein}g protein, ${result.totals.carbs}g carbs, ${result.totals.fat}g fat`,
        type: 'success'
      })

      // Clear form after success
      setTimeout(() => {
        setMealText('')
        setStatus(null)
      }, 3000)

    } catch (error) {
      setStatus({
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  function handleGalleryPicker() {
    console.log('Gallery button clicked - opening file picker')
    // Create file input for gallery (shows picker)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    // No capture attribute = shows picker with camera + gallery options

    console.log('File input created, triggering click')

    input.onchange = async (e) => {
      console.log('File selected')
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      // Validate file format
      if (!isSupportedImageFormat(file)) {
        setStatus({
          message: 'Unsupported image format. Please use JPEG, PNG, WebP, or GIF.',
          type: 'error'
        })
        return
      }

      // Show file size validation
      const fileSizeMB = file.size / (1024 * 1024)
      if (fileSizeMB > 50) {
        setStatus({
          message: 'Image too large. Please use a smaller image.',
          type: 'error'
        })
        return
      }

      setIsCompressing(true)
      setStatus({
        message: `🔄 Compressing image (${formatFileSize(file.size)})...`,
        type: 'info'
      })

      try {
        // Compress the image
        const result = await compressImage(file)
        setCompressionResult(result)
        setCapturedImage(result.compressedDataUrl)

        setStatus({
          message: `📸 Image ready! Compressed from ${formatFileSize(file.size)} to ${result.compressedSizeMB.toFixed(1)}MB`,
          type: 'success'
        })
      } catch (error) {
        console.error('Compression error:', error)
        setStatus({
          message: 'Failed to process image. Please try again.',
          type: 'error'
        })
      } finally {
        setIsCompressing(false)
      }
    }

    input.click()
  }

  function removePhoto() {
    setCapturedImage(null)
    setCompressionResult(null)
    setStatus(null)
  }

  async function analyzeImage() {
    if (!capturedImage) {
      setStatus({
        message: 'No image to analyze',
        type: 'error'
      })
      return
    }

    setIsAnalyzing(true)
    setStatus({
      message: '🔍 For full photo analysis with portion refinement, use the camera view in Food Progress. This quick photo option saves directly.',
      type: 'info'
    })

    try {
      // Use existing meal upload endpoint
      const formData = new FormData()

      // Convert base64 to blob
      const response = await fetch(capturedImage)
      const blob = await response.blob()
      const file = new File([blob], 'meal.jpg', { type: 'image/jpeg' })

      formData.append('photo', file)
      formData.append('timestamp', new Date(mealDate + 'T12:00:00').toISOString())

      const uploadResponse = await fetch('/api/meals/upload', {
        method: 'POST',
        body: formData
      })

      const data = await uploadResponse.json()

      if (data.analysisStatus === 'complete' && data.analysis) {
        // Photo analysis complete - meal already saved by upload API
        setStatus({
          message: `✅ Meal logged! ${data.analysis.total_protein}g protein, ${data.analysis.total_carbs}g carbs, ${data.analysis.total_fat}g fat. Redirecting...`,
          type: 'success'
        })

        // Clear form and redirect after success
        setTimeout(() => {
          window.location.href = '/food-progress'
        }, 2000)
      } else {
        const errorMsg = data.error || 'Could not analyze meal photo'
        setStatus({
          message: `⚠️ ${errorMsg}. Try a different angle or type manually.`,
          type: 'error'
        })
      }
    } catch (error) {
      console.error('Analysis error:', error)
      setStatus({
        message: 'Failed to analyze meal photo. Please try again.',
        type: 'error'
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  function toggleVoiceRecording() {
    if (isRecording && recognition) {
      // Stop recording
      recognition.stop()
      return
    }

    // Initialize recognition on first use (required for iOS Safari)
    if (!recognition || typeof recognition.start !== 'function') {
      const newRecognition = initializeSpeechRecognition()
      if (!newRecognition) {
        setStatus({
          message: 'Voice input not supported in this browser. Try Chrome or Safari.',
          type: 'error'
        })
        return
      }
      setRecognition(newRecognition)

      // Clear previous transcript and start
      setFinalTranscript('')
      setMealText('')

      try {
        newRecognition.start()
      } catch (error) {
        console.error('Failed to start recognition:', error)
        setStatus({
          message: 'Failed to start voice input. Please try again.',
          type: 'error'
        })
      }
    } else {
      // Clear previous transcript and start fresh
      setFinalTranscript('')
      setMealText('')

      try {
        recognition.start()
      } catch (error) {
        console.error('Failed to start recognition:', error)
        setStatus({
          message: 'Failed to start voice input. Please try again.',
          type: 'error'
        })
      }
    }
  }

  function clearVoiceRecording() {
    setFinalTranscript('')
    setMealText('')
    setStatus(null)
  }

  return (
    <ProtectedRoute>
      <div className="pb-4">
        <h1 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Log Meal</h1>

        {status && (
          <div className={`mb-3 sm:mb-4 p-3 sm:p-4 rounded-lg sm:rounded-xl text-sm font-medium ${
            status.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-2 border-green-200 dark:border-green-800' :
            status.type === 'error' ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-2 border-red-200 dark:border-red-800' :
            'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-2 border-blue-200 dark:border-blue-800'
          }`}>
            {status.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <label htmlFor="date" className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
              📅 Meal Date
            </label>
            <input
              type="date"
              id="date"
              value={mealDate}
              onChange={(e) => setMealDate(e.target.value)}
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

          {/* Input Method Selection */}
          <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-center text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Choose how to log your meal:
            </h3>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">
              💡 For photos with portion refinement, use <Link href="/food-progress?view=camera" className="text-blue-600 dark:text-blue-400 underline">Camera View</Link>
            </p>

            {/* Show full-width photo preview when image is captured, otherwise show grid */}
            {capturedImage ? (
              <div className="relative">
                <button
                  onClick={removePhoto}
                  className="absolute -top-2 -right-2 z-10 w-8 h-8 bg-red-500 text-white rounded-full text-sm flex items-center justify-center shadow-lg"
                >
                  ×
                </button>
                <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-400 dark:border-blue-500 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capturedImage}
                    alt="Captured meal"
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    {compressionResult && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-3 text-center">
                        📸 Compressed to {compressionResult.compressedSizeMB.toFixed(1)}MB
                        ({compressionResult.compressionRatio.toFixed(1)}x smaller)
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={removePhoto}
                        disabled={isAnalyzing}
                        className="flex-1 px-4 py-3 text-base font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        📷 Retake
                      </button>
                      <button
                        type="button"
                        onClick={analyzeImage}
                        disabled={isAnalyzing}
                        className="flex-1 px-4 py-3 text-base font-semibold text-white bg-blue-600 dark:bg-blue-700 rounded-xl hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isAnalyzing ? '🔍 Analyzing...' : '🔍 Analyze'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* Capture Picker - First */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleGalleryPicker}
                    disabled={isCompressing || isAnalyzing}
                    className="w-full p-6 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className={`text-4xl transition-transform ${isCompressing ? 'animate-pulse' : 'group-hover:scale-110'}`}>
                        {isCompressing ? '🔄' : '📷'}
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                          {isCompressing ? 'Processing...' : 'Capture'}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {isCompressing ? 'Compressing image' : 'Add photo'}
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Voice Recording - Second */}
                <div className="relative">
                  {finalTranscript && !isRecording && (
                    <button
                      onClick={clearVoiceRecording}
                      className="absolute -top-2 -right-2 z-10 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    disabled={!recognition}
                    className={`w-full h-full p-6 rounded-xl border-2 transition-colors group ${
                      !recognition
                        ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 opacity-50 cursor-not-allowed'
                        : isRecording
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-500'
                        : finalTranscript
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-500'
                        : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-green-400 dark:hover:border-green-500'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className={`text-4xl transition-transform ${
                        isRecording ? 'animate-pulse' : !recognition ? '' : 'group-hover:scale-110'
                      }`}>
                        {!recognition ? '🚫' : isRecording ? '⏹️' : finalTranscript ? '✅' : '🎤'}
                      </div>
                      <div className="text-center">
                        <div className={`font-semibold mb-1 ${
                          !recognition
                            ? 'text-gray-500 dark:text-gray-400'
                            : isRecording
                            ? 'text-red-700 dark:text-red-300'
                            : finalTranscript
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          Voice
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {!recognition ? 'Not supported' : isRecording ? 'Tap to stop' : finalTranscript ? 'Captured!' : 'Speak meal'}
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  alert('💡 Quick Tips:\n\n• Use natural language: "Chicken breast 6oz, brown rice 1 cup, broccoli"\n• Include portion sizes when possible\n• Separate items with commas\n• Be specific about cooking methods (grilled, fried, etc.)')
                }}
                className="text-xl active:scale-95 transition-transform"
                aria-label="Show tips"
              >
                💡
              </button>
              <label htmlFor="meal" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                🍽️ Meal Details
              </label>
            </div>
            <textarea
              id="meal"
              value={mealText}
              onChange={(e) => setMealText(e.target.value)}
              placeholder="Chicken breast 6oz, brown rice 1 cup, broccoli 1 cup, olive oil 1 tbsp"
              rows={6}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-base border-2 border-gray-200 dark:border-gray-600 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-y bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              style={{ minHeight: '140px' }}
            />
            <p className="mt-2 sm:mt-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Type naturally, include portion sizes when you know them
            </p>
          </div>

          <div className="flex gap-2 sm:gap-3 sticky bottom-0 bg-gray-50 dark:bg-gray-900 -mx-4 px-4 py-3 sm:static sm:bg-transparent sm:dark:bg-transparent sm:mx-0 sm:px-0 sm:py-0 border-t sm:border-t-0 border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => {
                setMealText('')
                setStatus(null)
              }}
              className="px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base font-semibold border-2 border-gray-300 dark:border-gray-600 rounded-lg sm:rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors disabled:opacity-50 text-gray-700 dark:text-gray-300"
              disabled={loading}
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 dark:bg-blue-700 text-white px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base font-semibold rounded-lg sm:rounded-xl hover:bg-blue-700 dark:hover:bg-blue-600 active:bg-blue-800 dark:active:bg-blue-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? '⏳ Analyzing...' : '✓ Submit Meal'}
            </button>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  )
}
