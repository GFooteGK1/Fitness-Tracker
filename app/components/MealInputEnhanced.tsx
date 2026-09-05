'use client'
import { sendLoggingRequest } from '@/app/lib/client/logging-request'

import React, { useEffect, useRef, useState } from 'react'
import MealCameraCapture from './MealCameraCapture'
import FastMealLogger from './FastMealLogger'
import type { MealUploadResponse } from '@/app/lib/types/food-tracking'
import { getMealTimestamp, getLocalDate } from '@/app/lib/timezone-utils'

interface MealInputEnhancedProps {
  onUploadComplete?: (response: MealUploadResponse) => void
  onError?: (error: string) => void
  userId?: string
  selectedDate?: Date
}

interface SpeechRecognitionResultLike {
  0: { transcript: string }
  isFinal: boolean
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultLike }
}

interface SpeechRecognitionErrorEventLike {
  error?: string
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type OptionalMediaDevices = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
}

export default function MealInputEnhanced({
  onUploadComplete,
  onError,
  userId,
  selectedDate
}: MealInputEnhancedProps) {
  const [mealText, setMealText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [recorderSupported, setRecorderSupported] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showTextInput, setShowTextInput] = useState(false)
  const transcriptRef = useRef('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const speechErrorRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const speechAvailable = Boolean(
      browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition
    )
    const MediaRecorderConstructor = (globalThis as typeof globalThis & {
      MediaRecorder?: typeof MediaRecorder
    }).MediaRecorder
    const mediaDevices = (navigator as unknown as {
      mediaDevices?: OptionalMediaDevices
    }).mediaDevices
    const audioRecorderAvailable = Boolean(
      mediaDevices?.getUserMedia && MediaRecorderConstructor
    )
    const matchMedia = (window as typeof window & {
      matchMedia?: typeof window.matchMedia
    }).matchMedia
    const standalone = Boolean(
      (navigator as Navigator & { standalone?: boolean }).standalone
      || (typeof matchMedia === 'function' && matchMedia.call(window, '(display-mode: standalone)').matches)
    )

    setSpeechSupported(speechAvailable)
    setRecorderSupported(audioRecorderAvailable)
    setIsStandalone(standalone)

    return () => {
      mountedRef.current = false
      recognitionRef.current?.abort()
      if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
      for (const track of mediaStreamRef.current?.getTracks() || []) track.stop()
      recognitionRef.current = null
      mediaRecorderRef.current = null
      mediaStreamRef.current = null
    }
  }, [])

  function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null
  }

  function speechErrorMessage(error: string | undefined): string {
    switch (error) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Microphone or voice service access was denied. Allow it in browser settings, or use text entry.'
      case 'audio-capture':
        return 'No microphone was available. Check microphone access, or use text entry.'
      case 'no-speech':
        return 'No speech was detected. Try again and speak after the recording starts.'
      case 'network':
        return 'Voice recognition could not reach its speech service. Try Safari or use text entry.'
      default:
        return 'Voice input failed. Try again or use text entry.'
    }
  }

  function initializeSpeechRecognition(): SpeechRecognitionLike | null {
    const SpeechRecognition = getSpeechRecognitionConstructor()
    if (!SpeechRecognition) return null

    const recognitionInstance = new SpeechRecognition()
    // One utterance is more reliable on iOS than a continuous session.
    recognitionInstance.continuous = false
    recognitionInstance.interimResults = false
    recognitionInstance.lang = 'en-US'

    recognitionInstance.onstart = () => {
      if (!mountedRef.current) return
      setIsRecording(true)
      transcriptRef.current = ''
    }

    recognitionInstance.onresult = (event: SpeechRecognitionEventLike) => {
      if (!mountedRef.current) return
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript
      }

      if (finalTranscript.trim()) {
        transcriptRef.current = `${transcriptRef.current} ${finalTranscript}`.trim()
        setMealText(transcriptRef.current)
        setShowTextInput(true)
      }
    }

    recognitionInstance.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (!mountedRef.current) return
      console.error('Speech recognition error:', event.error)
      speechErrorRef.current = true
      setIsRecording(false)
      recognitionRef.current = null
      onError?.(speechErrorMessage(event.error))
    }

    recognitionInstance.onend = () => {
      if (!mountedRef.current) return
      setIsRecording(false)
      recognitionRef.current = null
      if (!speechErrorRef.current && !transcriptRef.current.trim()) {
        onError?.(speechErrorMessage('no-speech'))
      }
    }

    return recognitionInstance
  }

  function stopVoiceRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      return
    }
    recognitionRef.current?.stop()
  }

  async function finishRecordedVoice(recorder: MediaRecorder) {
    for (const track of mediaStreamRef.current?.getTracks() || []) track.stop()
    mediaStreamRef.current = null
    mediaRecorderRef.current = null
    if (!mountedRef.current) return

    const audioBlob = new Blob(audioChunksRef.current, {
      type: recorder.mimeType || 'audio/webm'
    })
    audioChunksRef.current = []
    setIsRecording(false)

    if (!audioBlob.size) {
      onError?.('The audio recording was empty. Try again.')
      return
    }

    setIsTranscribing(true)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'meal-voice')
      const response = await fetch('/api/transcribe-audio', {
        method: 'POST',
        body: formData
      })
      const result = await response.json().catch(() => ({})) as { text?: string; error?: string }
      if (!response.ok || !result.text?.trim()) {
        throw new Error(result.error || 'Voice transcription failed. Try again or use text entry.')
      }

      setMealText(result.text.trim())
      setShowTextInput(true)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Voice transcription failed. Try again or use text entry.')
    } finally {
      if (mountedRef.current) setIsTranscribing(false)
    }
  }

  async function startRecordedVoice() {
    const MediaRecorderConstructor = (globalThis as typeof globalThis & {
      MediaRecorder?: typeof MediaRecorder
    }).MediaRecorder
    const mediaDevices = (navigator as unknown as {
      mediaDevices?: OptionalMediaDevices
    }).mediaDevices
    if (!mediaDevices?.getUserMedia || !MediaRecorderConstructor) {
      onError?.('Voice input is unavailable in this app. Open the page in Safari or use text entry.')
      return
    }

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        for (const track of stream.getTracks()) track.stop()
        return
      }

      const mimeType = typeof MediaRecorderConstructor.isTypeSupported === 'function'
        ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
          .find(type => MediaRecorderConstructor.isTypeSupported(type))
        : undefined
      const recorder = mimeType
        ? new MediaRecorderConstructor(stream, { mimeType })
        : new MediaRecorderConstructor(stream)
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      recorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        for (const track of stream.getTracks()) track.stop()
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        if (mountedRef.current) {
          setIsRecording(false)
          onError?.('Microphone recording failed. Try again or use text entry.')
        }
      }
      recorder.onstop = () => void finishRecordedVoice(recorder)
      recorder.start()
      setIsRecording(true)
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      onError?.(name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in browser settings, or use text entry.'
        : 'Microphone recording could not start. Try again or use text entry.')
    }
  }

  function startBrowserSpeech() {
    const newRecognition = initializeSpeechRecognition()
    if (!newRecognition) {
      onError?.('Voice recognition is unavailable here. Use text entry or try Safari.')
      return
    }

    recognitionRef.current = newRecognition
    speechErrorRef.current = false
    transcriptRef.current = ''
    setMealText('')
    try {
      newRecognition.start()
    } catch {
      recognitionRef.current = null
      setIsRecording(false)
      onError?.('Voice input could not start. Try again or use text entry.')
    }
  }

  function toggleVoiceRecording() {
    if (isRecording) {
      stopVoiceRecording()
      return
    }

    transcriptRef.current = ''
    setMealText('')
    if ((isStandalone && recorderSupported) || !speechSupported) {
      void startRecordedVoice()
      return
    }

    if (speechSupported) {
      startBrowserSpeech()
      return
    }

    if (recorderSupported) {
      void startRecordedVoice()
      return
    }

    onError?.('Voice input is unavailable in this app. Open the page in Safari or use text entry.')
  }

  async function handleTextSubmit() {
    if (!mealText.trim()) {
      onError?.('Please enter meal details')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await sendLoggingRequest('/api/meals/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: mealText,
          timestamp: getMealTimestamp(selectedDate)
        })
      }, userId ?? '', 60_000, JSON.stringify([mealText, selectedDate ? getLocalDate(selectedDate) : 'today']))
      const result = await response.json().catch(() => ({})) as { mealId?: string; error?: string }

      if (!response.ok) {
        throw new Error(result.error || `Meal analysis failed (${response.status}). Try again.`)
      }
      if (!result.mealId) throw new Error('Meal was analyzed but could not be saved. Try again.')

      onUploadComplete?.({ mealId: result.mealId, analysisStatus: 'complete' })
      setMealText('')
      transcriptRef.current = ''
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to log meal')
    } finally {
      setIsSubmitting(false)
    }
  }

  const voiceAvailable = speechSupported || recorderSupported

  return (
    <div className="space-y-4">
      <FastMealLogger
        selectedDate={selectedDate}
        onLogged={onUploadComplete}
        onError={onError}
      />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300 dark:border-gray-600" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            OR USE PHOTO, VOICE, OR TEXT
          </span>
        </div>
      </div>

      <MealCameraCapture
        onUploadComplete={onUploadComplete}
        onError={onError}
        userId={userId}
        selectedDate={selectedDate}
      />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300 dark:border-gray-600" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">OR</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={toggleVoiceRecording}
            disabled={!voiceAvailable || isTranscribing || isSubmitting}
            className={`min-h-12 flex-1 rounded-lg px-4 py-3 font-semibold transition-colors ${
              !voiceAvailable
                ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800'
                : isRecording
                ? 'bg-red-500 text-white'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {!voiceAvailable
              ? 'Voice unavailable'
              : isRecording
              ? 'Stop recording'
              : isTranscribing
              ? 'Transcribing...'
              : 'Voice input'}
          </button>

          <button
            type="button"
            onClick={() => setShowTextInput(!showTextInput)}
            className="min-h-12 flex-1 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
          >
            {showTextInput ? 'Hide text input' : 'Show text input'}
          </button>
        </div>

        {showTextInput && (
          <div className="space-y-3">
            <textarea
              value={mealText}
              onChange={event => setMealText(event.target.value)}
              placeholder="Chicken breast 6oz, brown rice 1 cup, broccoli 1 cup, olive oil 1 tbsp"
              rows={4}
              className="w-full resize-y rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-base text-gray-900 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
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
                className="min-h-11 rounded-lg border-2 border-gray-300 px-6 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                disabled={isSubmitting}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={isSubmitting || !mealText.trim()}
                className="min-h-11 flex-1 rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {isSubmitting ? 'Analyzing...' : 'Submit meal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
