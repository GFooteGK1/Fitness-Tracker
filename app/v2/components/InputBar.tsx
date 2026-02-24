'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { AgentRequest } from '@/app/lib/agents/types'
import { compressImage } from '@/app/lib/imageUtils'

// ─── Web Speech API type augmentation ────────────────────────────────

interface SpeechRecognitionResult {
  readonly [index: number]: { transcript: string }
}

interface SpeechRecognitionResultList {
  readonly [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}

// ─── Props ───────────────────────────────────────────────────────────

export interface InputBarProps {
  onSubmit: (request: AgentRequest) => void
  isLoading: boolean
}

// ─── Component ───────────────────────────────────────────────────────

export default function InputBar({ onSubmit, isLoading }: InputBarProps) {
  const [text, setText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const [showCamera, setShowCamera] = useState(false)

  // Check Web Speech API support on mount
  useEffect(() => {
    const supported = typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    setSpeechSupported(supported)
  }, [])

  // ─── Text submit ─────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    onSubmit({ content: trimmed, input_mode: 'text' })
    setText('')
  }, [text, isLoading, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  // ─── Voice input ───────────────────────────────────────────────────

  const handleVoiceToggle = useCallback(() => {
    if (isLoading) return

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop()
      setIsRecording(false)
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (transcript.trim()) {
        onSubmit({ content: transcript.trim(), input_mode: 'voice' })
      }
      setIsRecording(false)
    }

    recognition.onerror = () => {
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }, [isLoading, isRecording, onSubmit])

  // ─── Camera capture ────────────────────────────────────────────────

  const openCamera = useCallback(async () => {
    if (isLoading) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      setShowCamera(true)
      // Attach stream to video element after render
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
    } catch {
      // Camera not available — silently fail
    }
  }, [isLoading])

  const closeCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setShowCamera(false)
  }, [])

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)

    // Convert to blob then File for compressImage
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' })
      try {
        const result = await compressImage(file, 1, 1200)
        closeCamera()
        onSubmit({ content: 'Photo captured', input_mode: 'photo', photo_data: result.compressedDataUrl })
      } catch {
        closeCamera()
      }
    }, 'image/jpeg', 0.9)
  }, [closeCamera, onSubmit])

  // ─── File upload ───────────────────────────────────────────────────

  const handleFileClick = useCallback(() => {
    if (isLoading) return
    fileInputRef.current?.click()
  }, [isLoading])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      const isImage = file.type.startsWith('image/')
      onSubmit({
        content: file.name,
        input_mode: isImage ? 'photo' : 'file',
        photo_data: isImage ? base64 : undefined,
      })
    }
    reader.readAsDataURL(file)

    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [onSubmit])

  // ─── Camera overlay ────────────────────────────────────────────────

  if (showCamera) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col" data-testid="camera-overlay">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="flex-1 object-cover"
          aria-label="Camera preview"
        />
        <div className="flex items-center justify-center gap-6 p-4 bg-black/80">
          <button
            onClick={closeCamera}
            className="min-w-[44px] min-h-[44px] px-5 py-3 rounded-full bg-gray-700 text-white text-sm font-medium"
            style={{ touchAction: 'manipulation' }}
            aria-label="Cancel camera"
          >
            Cancel
          </button>
          <button
            onClick={capturePhoto}
            className="min-w-[64px] min-h-[64px] rounded-full bg-white border-4 border-gray-300"
            style={{ touchAction: 'manipulation' }}
            aria-label="Capture photo"
          />
          </div>
      </div>
    )
  }

  // ─── Main input bar ────────────────────────────────────────────────

  return (
    <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-end gap-2">
        {/* Voice button */}
        {speechSupported && (
          <button
            onClick={handleVoiceToggle}
            disabled={isLoading}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full shrink-0 transition-colors ${
              isRecording
                ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 animate-pulse'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            } disabled:opacity-50`}
            style={{ touchAction: 'manipulation' }}
            aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
          >
            🎤
          </button>
        )}

        {/* Camera button */}
        <button
          onClick={openCamera}
          disabled={isLoading}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full shrink-0 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          style={{ touchAction: 'manipulation' }}
          aria-label="Open camera"
        >
          📷
        </button>

        {/* File upload button + hidden input */}
        <button
          onClick={handleFileClick}
          disabled={isLoading}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full shrink-0 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          style={{ touchAction: 'manipulation' }}
          aria-label="Upload file"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept="image/*,.pdf,.txt,.csv"
          aria-hidden="true"
        />

        {/* Text input */}
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a workout, meal, or question..."
          disabled={isLoading}
          className="flex-1 min-h-[44px] px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
          style={{ fontSize: '16px' }}
          aria-label="Message input"
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isLoading}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full shrink-0 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ touchAction: 'manipulation' }}
          aria-label="Send message"
        >
          ➤
        </button>
      </div>
    </div>
  )
}
