'use client'

import React, { useState, useRef, useCallback } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'

interface MealCameraCaptureProps {
  onPhotoCapture?: (photo: File) => void
  onUploadComplete?: (response: any) => void
  onError?: (error: string) => void
  isLoading?: boolean
}

interface CameraState {
  isActive: boolean
  hasPermission: boolean | null
  error: string | null
  stream: MediaStream | null
  isInitializing: boolean
}

interface PhotoState {
  file: File | null
  preview: string | null
  isUploading: boolean
  uploadError: string | null
}

export default function MealCameraCaptureFixed({
  onPhotoCapture,
  onUploadComplete,
  onError,
  isLoading = false
}: MealCameraCaptureProps) {
  const { user } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [cameraState, setCameraState] = useState<CameraState>({
    isActive: false,
    hasPermission: null,
    error: null,
    stream: null,
    isInitializing: false
  })

  const [photoState, setPhotoState] = useState<PhotoState>({
    file: null,
    preview: null,
    isUploading: false,
    uploadError: null
  })

  // Start camera stream
  const startCamera = useCallback(async () => {
    try {
      setCameraState(prev => ({ ...prev, error: null, isInitializing: true }))
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCameraState({
        isActive: true,
        hasPermission: true,
        error: null,
        stream,
        isInitializing: false
      })
    } catch (error) {
      console.error('Camera access error:', error)
      let errorMessage = 'Failed to access camera'
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Camera permission denied. Please allow camera access and try again.'
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No camera found on this device.'
        } else if (error.name === 'NotSupportedError') {
          errorMessage = 'Camera not supported on this device.'
        }
      }

      setCameraState({
        isActive: false,
        hasPermission: false,
        error: errorMessage,
        stream: null,
        isInitializing: false
      })

      onError?.(errorMessage)
    }
  }, [onError])

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (cameraState.stream) {
      cameraState.stream.getTracks().forEach(track => track.stop())
    }
    
    setCameraState({
      isActive: false,
      hasPermission: cameraState.hasPermission,
      error: null,
      stream: null,
      isInitializing: false
    })
  }, [cameraState.stream, cameraState.hasPermission])

  // Capture photo from video stream
  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) {
      onError?.('Camera not ready')
      return
    }

    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        onError?.('Failed to get canvas context')
        return
      }

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          onError?.('Failed to capture photo')
          return
        }

        const file = new File([blob], `meal_${Date.now()}.jpg`, {
          type: 'image/jpeg'
        })

        // Create preview URL
        const preview = URL.createObjectURL(blob)

        setPhotoState({
          file,
          preview,
          isUploading: false,
          uploadError: null
        })

        // Stop camera after capture
        stopCamera()

        // Notify parent component
        onPhotoCapture?.(file)
      }, 'image/jpeg', 0.9)

    } catch (error) {
      console.error('Photo capture error:', error)
      onError?.('Failed to capture photo')
    }
  }, [onPhotoCapture, onError, stopCamera])

  // Handle file input selection
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Basic validation
    if (!file.type.startsWith('image/')) {
      onError?.('Please select a valid image file')
      return
    }

    const preview = URL.createObjectURL(file)

    setPhotoState({
      file,
      preview,
      isUploading: false,
      uploadError: null
    })

    onPhotoCapture?.(file)
  }, [onPhotoCapture, onError])

  // Simple upload function
  const uploadPhoto = useCallback(async () => {
    if (!photoState.file || !user) {
      onError?.('No photo to upload or user not authenticated')
      return
    }

    setPhotoState(prev => ({ ...prev, isUploading: true, uploadError: null }))

    try {
      const formData = new FormData()
      formData.append('photo', photoState.file)
      formData.append('timestamp', new Date().toISOString())

      const response = await fetch('/api/meals/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const result = await response.json()
      
      setPhotoState(prev => ({ ...prev, isUploading: false }))
      onUploadComplete?.(result)
    } catch (error) {
      console.error('Upload error:', error)
      setPhotoState(prev => ({ 
        ...prev, 
        isUploading: false, 
        uploadError: 'Failed to upload photo'
      }))
      onError?.('Failed to upload photo')
    }
  }, [photoState.file, user, onUploadComplete, onError])

  // Retake photo
  const retakePhoto = useCallback(() => {
    if (photoState.preview) {
      URL.revokeObjectURL(photoState.preview)
    }
    
    setPhotoState({
      file: null,
      preview: null,
      isUploading: false,
      uploadError: null
    })
  }, [photoState.preview])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stopCamera()
      if (photoState.preview) {
        URL.revokeObjectURL(photoState.preview)
      }
    }
  }, [stopCamera, photoState.preview])

  return (
    <div className="meal-camera-capture">
      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Camera view */}
      {cameraState.isActive && !photoState.preview && (
        <div className="camera-view">
          {cameraState.isInitializing ? (
            <div className="w-full h-48 sm:h-64 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 dark:border-blue-400 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Initializing camera...</p>
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-48 sm:h-64 object-cover rounded-lg bg-gray-100 dark:bg-gray-700"
            />
          )}
          
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mt-4">
            <button
              onClick={capturePhoto}
              disabled={isLoading || cameraState.isInitializing}
              className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-lg font-medium text-sm sm:text-base touch-target"
            >
              {isLoading || cameraState.isInitializing ? 'Initializing...' : 'Capture Photo'}
            </button>
            
            <button
              onClick={stopCamera}
              disabled={cameraState.isInitializing}
              className="bg-gray-600 dark:bg-gray-500 hover:bg-gray-700 dark:hover:bg-gray-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-lg font-medium text-sm sm:text-base touch-target"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Photo preview */}
      {photoState.preview && (
        <div className="photo-preview">
          <img
            src={photoState.preview}
            alt="Captured meal"
            className="w-full h-48 sm:h-64 object-cover rounded-lg"
          />
          
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mt-4">
            <button
              onClick={uploadPhoto}
              disabled={photoState.isUploading || isLoading}
              className="bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-lg font-medium flex items-center justify-center text-sm sm:text-base touch-target"
            >
              {photoState.isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Uploading...
                </>
              ) : (
                'Upload Photo'
              )}
            </button>
            
            <button
              onClick={retakePhoto}
              disabled={photoState.isUploading}
              className="bg-gray-600 dark:bg-gray-500 hover:bg-gray-700 dark:hover:bg-gray-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-lg font-medium text-sm sm:text-base touch-target"
            >
              Retake
            </button>
          </div>
          
          {/* Error Message */}
          {photoState.uploadError && (
            <div className="mt-2 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{photoState.uploadError}</p>
            </div>
          )}
        </div>
      )}

      {/* Initial state */}
      {!cameraState.isActive && !photoState.preview && (
        <div className="initial-state">
          <div className="text-center p-6 sm:p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <div className="mb-4">
              <svg className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              Capture Your Meal
            </h3>
            
            <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm sm:text-base">
              Take a photo or select an image to log your meal
            </p>
            
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <button
                onClick={startCamera}
                disabled={isLoading || cameraState.isInitializing}
                className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-lg font-medium flex items-center justify-center text-sm sm:text-base touch-target"
              >
                {cameraState.isInitializing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Starting Camera...
                  </>
                ) : isLoading ? (
                  'Loading...'
                ) : (
                  'Open Camera'
                )}
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || cameraState.isInitializing}
                className="bg-gray-600 dark:bg-gray-500 hover:bg-gray-700 dark:hover:bg-gray-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-lg font-medium text-sm sm:text-base touch-target"
              >
                Select Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera permission error */}
      {cameraState.error && (
        <div className="mt-4 p-3 sm:p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400 dark:text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Camera Error
              </h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                {cameraState.error}
              </div>
              {cameraState.hasPermission === false && (
                <div className="mt-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-600 text-white px-3 py-1 rounded touch-target"
                  >
                    Select Photo Instead
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}