'use client'

import React, { useState, useRef, useCallback } from 'react'
import { compressImage, isSupportedImageFormat, formatFileSize } from '@/app/lib/imageUtils'
import { MealUploadResponse, FoodItem } from '@/app/lib/types/food-tracking'
import { createUserErrorMessage, ErrorContext } from '@/app/lib/error-handling'
import { queuePhotoUpload, useOfflineQueue } from '@/app/lib/offline-queue'
import { useSession } from '@/app/lib/session-management'
import { useAuth } from '@/app/lib/auth/AuthContext'
import PortionSelector from './PortionSelector'

interface MealCameraCaptureProps {
  onPhotoCapture?: (photo: File) => void
  onUploadComplete?: (response: MealUploadResponse) => void
  onError?: (error: string) => void
  isLoading?: boolean
  userId?: string
}

interface AnalysisResult {
  mealId: string
  items: FoodItem[]
  totals: {
    protein: number
    carbs: number
    fat: number
    calories: number
  }
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
  uploadProgress: number
  analysisStatus: 'idle' | 'uploading' | 'analyzing' | 'portion-select' | 'refining' | 'complete' | 'failed'
  analysisProgress: number
  estimatedTimeRemaining: number | null
  retryCount: number
  shouldRetry: boolean
  retryAfter?: number
  fallbackAction?: string
}

interface NetworkState {
  isOnline: boolean
  connectionType: string | null
}

export default function MealCameraCapture({
  onPhotoCapture,
  onUploadComplete,
  onError,
  isLoading = false,
  userId
}: MealCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const { stats: queueStats, isOnline } = useOfflineQueue()
  const { user } = useAuth() // Use Supabase auth instead of session manager
  const isSessionValid = !!user // Session is valid if user exists

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
    uploadError: null,
    uploadProgress: 0,
    analysisStatus: 'idle',
    analysisProgress: 0,
    estimatedTimeRemaining: null,
    retryCount: 0,
    shouldRetry: false,
    retryAfter: undefined,
    fallbackAction: undefined
  })

  const [networkState, setNetworkState] = useState<NetworkState>({
    isOnline: isOnline,
    connectionType: null
  })

  // State for portion selection flow
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isRefining, setIsRefining] = useState(false)

  // Monitor network connectivity and sync with offline queue
  React.useEffect(() => {
    const handleOnline = () => setNetworkState(prev => ({ ...prev, isOnline: true }))
    const handleOffline = () => setNetworkState(prev => ({ ...prev, isOnline: false }))

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Sync with offline queue status
    setNetworkState(prev => ({ ...prev, isOnline }))

    // Get connection type if available
    if ('connection' in navigator) {
      const connection = (navigator as any).connection
      setNetworkState(prev => ({ 
        ...prev, 
        connectionType: connection?.effectiveType || null 
      }))
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isOnline])

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
          uploadError: null,
          uploadProgress: 0,
          analysisStatus: 'idle',
          analysisProgress: 0,
          estimatedTimeRemaining: null,
          retryCount: 0,
          shouldRetry: false,
          retryAfter: undefined,
          fallbackAction: undefined
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

    // Validate file type
    if (!isSupportedImageFormat(file)) {
      onError?.('Please select a valid image file (JPEG, PNG, WebP, or GIF)')
      return
    }

    // Validate file size (30MB limit)
    const maxSize = 30 * 1024 * 1024
    if (file.size > maxSize) {
      onError?.(`File size (${formatFileSize(file.size)}) exceeds 30MB limit`)
      return
    }

    try {
      // Compress image if needed
      let finalFile = file
      if (file.size > 4.5 * 1024 * 1024) {
        const compressionResult = await compressImage(file)
        const compressedBlob = await fetch(compressionResult.compressedDataUrl).then(r => r.blob())
        finalFile = new File([compressedBlob], file.name, { type: file.type })
      }

      const preview = URL.createObjectURL(finalFile)

      setPhotoState({
        file: finalFile,
        preview,
        isUploading: false,
        uploadError: null,
        uploadProgress: 0,
        analysisStatus: 'idle',
        analysisProgress: 0,
        estimatedTimeRemaining: null,
        retryCount: 0,
        shouldRetry: false,
        retryAfter: undefined,
        fallbackAction: undefined
      })

      onPhotoCapture?.(finalFile)
    } catch (error) {
      console.error('File processing error:', error)
      onError?.('Failed to process selected image')
    }
  }, [onPhotoCapture, onError])

  // Upload photo to API with comprehensive error handling, retry logic, and offline queuing
  const uploadPhoto = useCallback(async () => {
    if (!photoState.file) {
      onError?.('No photo to upload')
      return
    }

    // Check session validity
    if (!isSessionValid) {
      const errorMessage = 'Your session has expired. Please sign in again.'
      setPhotoState(prev => ({ 
        ...prev, 
        uploadError: errorMessage,
        shouldRetry: false,
        fallbackAction: 'redirect_to_login'
      }))
      onError?.(errorMessage)
      return
    }

    // Handle offline scenario - queue for later processing
    if (!networkState.isOnline) {
      try {
        const queueId = queuePhotoUpload(
          photoState.file,
          userId,
          new Date().toISOString()
        )

        setPhotoState(prev => ({ 
          ...prev, 
          analysisStatus: 'complete',
          analysisProgress: 100,
          estimatedTimeRemaining: 0,
          fallbackAction: 'queued_for_sync'
        }))

        // Create a queued response
        const queuedResponse: MealUploadResponse = {
          mealId: `queued_${queueId}`,
          analysisStatus: 'processing',
          photoUrl: null,
          storageWarning: 'Photo queued for upload when connection is restored'
        }

        onUploadComplete?.(queuedResponse)
        return
      } catch (error) {
        const errorMessage = 'Failed to queue photo for offline processing'
        setPhotoState(prev => ({ 
          ...prev, 
          uploadError: errorMessage,
          shouldRetry: false
        }))
        onError?.(errorMessage)
        return
      }
    }

    const startTime = Date.now()
    
    setPhotoState(prev => ({ 
      ...prev, 
      isUploading: true, 
      uploadError: null,
      uploadProgress: 0,
      analysisStatus: 'uploading',
      analysisProgress: 0,
      estimatedTimeRemaining: 30, // Initial estimate of 30 seconds
      shouldRetry: false,
      retryAfter: undefined,
      fallbackAction: undefined
    }))

    const attemptUpload = async (attemptNumber: number = 1): Promise<void> => {
      try {
        const formData = new FormData()
        formData.append('photo', photoState.file!)
        formData.append('userId', userId)
        // Send full ISO timestamp with timezone - database will store in UTC
        // and the client will convert back to local time for display
        const timestamp = new Date().toISOString()
        formData.append('timestamp', timestamp)

        // Enhanced upload progress simulation with time estimation
        const progressInterval = setInterval(() => {
          setPhotoState(prev => {
            const elapsed = (Date.now() - startTime) / 1000
            let newProgress = prev.uploadProgress
            let timeRemaining = prev.estimatedTimeRemaining
            
            if (prev.analysisStatus === 'uploading' && prev.uploadProgress < 90) {
              // Upload phase: progress more quickly initially, then slow down
              const progressIncrement = prev.uploadProgress < 50 ? 15 : 8
              newProgress = Math.min(90, prev.uploadProgress + progressIncrement)
              
              // Estimate time remaining based on current progress
              if (newProgress > 10) {
                const estimatedTotal = (elapsed / newProgress) * 100
                timeRemaining = Math.max(0, estimatedTotal - elapsed)
              }
            }
            
            return { 
              ...prev, 
              uploadProgress: newProgress,
              estimatedTimeRemaining: timeRemaining
            }
          })
        }, 300)

        // Upload photo with regular fetch (Supabase auth handles session)
        const response = await fetch('/api/meals/upload', {
          method: 'POST',
          body: formData
        })

        clearInterval(progressInterval)

        if (!response.ok) {
          const errorData = await response.json()
          
          // Handle specific error responses with retry logic
          if (errorData.shouldRetry && attemptNumber < 3) {
            console.warn(`Upload attempt ${attemptNumber} failed, retrying:`, errorData.error)
            
            setPhotoState(prev => ({ 
              ...prev, 
              uploadProgress: 0,
              retryCount: attemptNumber,
              shouldRetry: true,
              retryAfter: errorData.retryAfter || 5
            }))
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, (errorData.retryAfter || 5) * 1000))
            
            // Reset progress for retry
            setPhotoState(prev => ({ 
              ...prev, 
              uploadProgress: 0,
              analysisStatus: 'uploading',
              estimatedTimeRemaining: 30
            }))
            
            return attemptUpload(attemptNumber + 1)
          }
          
          throw new Error(errorData.error || 'Upload failed')
        }

        const result: MealUploadResponse = await response.json()
        
        // Handle analysis failure
        if (result.analysisStatus === 'failed' || result.error) {
          console.error('Analysis failed:', result.error)
          
          setPhotoState(prev => ({ 
            ...prev, 
            isUploading: false,
            uploadError: result.error || 'AI could not analyze the photo. Please try again with a clearer image.',
            analysisStatus: 'failed',
            uploadProgress: 0,
            analysisProgress: 0,
            estimatedTimeRemaining: null,
            shouldRetry: true
          }))
          
          onError?.(result.error || 'Analysis failed')
          return
        }
        
        // Handle storage warnings gracefully
        if (result.storageWarning) {
          console.warn('Storage warning:', result.storageWarning)
          
          setPhotoState(prev => ({ 
            ...prev, 
            uploadProgress: 100,
            analysisStatus: 'complete',
            analysisProgress: 100,
            estimatedTimeRemaining: 0,
            fallbackAction: 'save_without_photo'
          }))
          
          // Show warning but continue
          onUploadComplete?.(result)
          return
        }
        
        // Update to analyzing status with progress tracking
        setPhotoState(prev => ({ 
          ...prev, 
          uploadProgress: 100,
          analysisStatus: 'analyzing',
          analysisProgress: 0,
          estimatedTimeRemaining: 15 // AI analysis typically takes 10-15 seconds
        }))

        // Simulate AI analysis progress
        const analysisInterval = setInterval(() => {
          setPhotoState(prev => {
            if (prev.analysisProgress < 90) {
              const elapsed = (Date.now() - startTime) / 1000
              const progressIncrement = prev.analysisProgress < 30 ? 20 : 10
              const newProgress = Math.min(90, prev.analysisProgress + progressIncrement)
              
              // Update time remaining for analysis phase
              const analysisTimeElapsed = elapsed - 5 // Subtract upload time
              const estimatedAnalysisTotal = 15
              const timeRemaining = Math.max(0, estimatedAnalysisTotal - analysisTimeElapsed)
              
              return { 
                ...prev, 
                analysisProgress: newProgress,
                estimatedTimeRemaining: timeRemaining
              }
            }
            return prev
          })
        }, 800)

        // Complete analysis after realistic time - show portion selection
        setTimeout(() => {
          clearInterval(analysisInterval)
          
          // Extract items from analysis result for portion selection
          const analysisItems: FoodItem[] = result.analysis?.items || []
          
          if (analysisItems.length > 0) {
            // Show portion selection UI
            setAnalysisResult({
              mealId: result.mealId,
              items: analysisItems,
              totals: {
                protein: result.analysis?.total_protein || 0,
                carbs: result.analysis?.total_carbs || 0,
                fat: result.analysis?.total_fat || 0,
                calories: result.analysis?.total_calories || 0
              }
            })
            setPhotoState(prev => ({ 
              ...prev, 
              isUploading: false,
              analysisStatus: 'portion-select',
              analysisProgress: 100,
              estimatedTimeRemaining: 0
            }))
          } else {
            // No items detected, complete without portion selection
            setPhotoState(prev => ({ 
              ...prev, 
              isUploading: false,
              analysisStatus: 'complete',
              analysisProgress: 100,
              estimatedTimeRemaining: 0
            }))
            onUploadComplete?.(result)
          }
        }, 3000) // 3 seconds for analysis simulation

      } catch (error) {
        console.error('Upload error:', error)
        
        const errorContext: ErrorContext = {
          operation: 'photo_upload',
          userId,
          networkStatus: networkState.isOnline ? 'online' : 'offline'
        }
        
        const errorMessage = createUserErrorMessage(error, errorContext)
        
        setPhotoState(prev => ({ 
          ...prev, 
          isUploading: false, 
          uploadError: errorMessage.message,
          analysisStatus: 'failed',
          uploadProgress: 0,
          analysisProgress: 0,
          estimatedTimeRemaining: null,
          shouldRetry: errorMessage.actionType === 'retry',
          fallbackAction: errorMessage.actionType === 'fallback' ? 'save_without_photo' : undefined
        }))
        
        onError?.(errorMessage.message)
      }
    }

    await attemptUpload()
  }, [photoState.file, userId, networkState.isOnline, isSessionValid, onUploadComplete, onError])

  // Retake photo
  const retakePhoto = useCallback(() => {
    if (photoState.preview) {
      URL.revokeObjectURL(photoState.preview)
    }
    
    setPhotoState({
      file: null,
      preview: null,
      isUploading: false,
      uploadError: null,
      uploadProgress: 0,
      analysisStatus: 'idle',
      analysisProgress: 0,
      estimatedTimeRemaining: null,
      retryCount: 0,
      shouldRetry: false,
      retryAfter: undefined,
      fallbackAction: undefined
    })
    setAnalysisResult(null)
  }, [photoState.preview])

  // Handle portion confirmation - refine macros with user-specified portions
  const handlePortionConfirm = useCallback(async (items: FoodItem[]) => {
    if (!analysisResult) return

    const hasPortionSpecs = items.some(item => item.portionSpec)
    
    if (!hasPortionSpecs) {
      // No portions specified, complete with original estimates
      setPhotoState(prev => ({ ...prev, analysisStatus: 'complete' }))
      onUploadComplete?.({
        mealId: analysisResult.mealId,
        analysisStatus: 'complete'
      })
      return
    }

    // Refine macros with portion specs
    setIsRefining(true)
    setPhotoState(prev => ({ ...prev, analysisStatus: 'refining' }))

    try {
      const response = await fetch('/api/meals/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealId: analysisResult.mealId,
          items
        })
      })

      if (!response.ok) {
        throw new Error('Failed to refine macros')
      }

      const result = await response.json()
      
      setPhotoState(prev => ({ ...prev, analysisStatus: 'complete' }))
      onUploadComplete?.({
        mealId: analysisResult.mealId,
        analysisStatus: 'complete'
      })
    } catch (error) {
      console.error('Portion refinement error:', error)
      onError?.('Failed to refine portions. Meal saved with original estimates.')
      setPhotoState(prev => ({ ...prev, analysisStatus: 'complete' }))
      onUploadComplete?.({
        mealId: analysisResult.mealId,
        analysisStatus: 'complete'
      })
    } finally {
      setIsRefining(false)
    }
  }, [analysisResult, onUploadComplete, onError])

  // Handle skip portion selection
  const handlePortionSkip = useCallback(() => {
    if (!analysisResult) return
    
    setPhotoState(prev => ({ ...prev, analysisStatus: 'complete' }))
    onUploadComplete?.({
      mealId: analysisResult.mealId,
      analysisStatus: 'complete'
    })
  }, [analysisResult, onUploadComplete])

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
      
      {/* Hidden file input for gallery selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      {/* Hidden file input for native camera capture (mobile) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Camera view - Mobile Optimized */}
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

      {/* Photo preview - Mobile Optimized */}
      {photoState.preview && (
        <div className="photo-preview">
          <img
            src={photoState.preview}
            alt="Captured meal"
            className="w-full h-48 sm:h-64 object-cover rounded-lg"
          />
          
          {/* Upload Progress Indicator - Mobile Optimized */}
          {photoState.isUploading && (
            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {photoState.analysisStatus === 'uploading' ? 'Uploading photo...' : 
                   photoState.analysisStatus === 'analyzing' ? 'Analyzing meal...' : 'Processing...'}
                </span>
                {photoState.estimatedTimeRemaining !== null && photoState.estimatedTimeRemaining > 0 && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    ~{Math.ceil(photoState.estimatedTimeRemaining)}s remaining
                  </span>
                )}
              </div>
              
              {/* Upload Progress Bar */}
              {photoState.analysisStatus === 'uploading' && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400 mb-1">
                    <span>Upload Progress</span>
                    <span>{Math.round(photoState.uploadProgress)}%</span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                    <div 
                      className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${photoState.uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
              
              {/* Analysis Progress Bar */}
              {photoState.analysisStatus === 'analyzing' && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400 mb-1">
                    <span>AI Analysis Progress</span>
                    <span>{Math.round(photoState.analysisProgress)}%</span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                    <div 
                      className="bg-green-600 dark:bg-green-400 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${photoState.analysisProgress}%` }}
                    />
                  </div>
                </div>
              )}
              
              {/* Status Messages */}
              <div className="text-xs text-blue-700 dark:text-blue-300">
                {photoState.analysisStatus === 'uploading' && (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 dark:border-blue-400 mr-2"></div>
                    Uploading your meal photo to secure storage...
                  </div>
                )}
                {photoState.analysisStatus === 'analyzing' && (
                  <div className="flex items-center">
                    <div className="animate-pulse rounded-full h-3 w-3 bg-green-600 dark:bg-green-400 mr-2"></div>
                    AI is identifying food items and calculating nutrition...
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Network Status Warning with Queue Info - Mobile Optimized */}
          {!networkState.isOnline && (
            <div className="mt-2 p-3 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start">
                <svg className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div className="flex-1">
                  <span className="text-sm text-yellow-800 dark:text-yellow-200">
                    Offline - Photos will be queued for upload when connection is restored
                  </span>
                  {queueStats.pendingOperations > 0 && (
                    <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                      {queueStats.pendingOperations} operation{queueStats.pendingOperations !== 1 ? 's' : ''} queued
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Connection Quality Indicator - Mobile Optimized */}
          {networkState.isOnline && networkState.connectionType && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                networkState.connectionType === '4g' ? 'bg-green-500' :
                networkState.connectionType === '3g' ? 'bg-yellow-500' :
                networkState.connectionType === '2g' ? 'bg-red-500' : 'bg-gray-500'
              }`}></div>
              Connection: {networkState.connectionType?.toUpperCase() || 'Unknown'}
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mt-4">
            <button
              onClick={uploadPhoto}
              disabled={photoState.isUploading || isLoading || !networkState.isOnline}
              className="bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-lg font-medium flex items-center justify-center text-sm sm:text-base touch-target"
            >
              {photoState.isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {photoState.analysisStatus === 'uploading' ? 'Uploading...' : 'Analyzing...'}
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
          
          {/* Portion Selection UI - shown after initial analysis */}
          {photoState.analysisStatus === 'portion-select' && analysisResult && (
            <div className="mt-4">
              <PortionSelector
                items={analysisResult.items}
                onConfirm={handlePortionConfirm}
                onSkip={handlePortionSkip}
                isRefining={isRefining}
              />
            </div>
          )}

          {/* Refining Status */}
          {photoState.analysisStatus === 'refining' && (
            <div className="mt-2 p-3 bg-blue-100 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-800 rounded-lg">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 dark:border-blue-400 mr-2"></div>
                <span className="text-sm text-blue-800 dark:text-blue-200">
                  Refining macro estimates with your portion sizes...
                </span>
              </div>
            </div>
          )}
          
          {/* Success Message - Mobile Optimized */}
          {photoState.analysisStatus === 'complete' && (
            <div className="mt-2 p-3 bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-800 rounded-lg">
              <div className="flex items-center">
                <svg className="h-4 w-4 text-green-600 dark:text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-green-800 dark:text-green-200">
                  Meal analyzed successfully! Nutritional data has been saved.
                </span>
              </div>
            </div>
          )}
          
          {/* Error Message with Retry Options - Mobile Optimized */}
          {photoState.uploadError && (
            <div className="mt-2 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
              <div className="flex items-start">
                <svg className="h-4 w-4 text-red-600 dark:text-red-500 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <div className="text-sm font-medium text-red-800 dark:text-red-200">Upload Failed</div>
                  <div className="text-sm text-red-700 dark:text-red-300 mt-1">{photoState.uploadError}</div>
                  
                  {/* Retry Information */}
                  {photoState.shouldRetry && photoState.retryAfter && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {photoState.retryCount > 0 && `Attempt ${photoState.retryCount + 1} of 3. `}
                      Retrying in {photoState.retryAfter} seconds...
                    </div>
                  )}
                  
                  {/* Network Status */}
                  {!networkState.isOnline && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Check your internet connection and try again.
                    </div>
                  )}
                  
                  {/* Fallback Action Info */}
                  {photoState.fallbackAction === 'save_without_photo' && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      You can continue logging your meal without the photo.
                    </div>
                  )}
                  
                  {/* Queued Status */}
                  {photoState.fallbackAction === 'queued_for_sync' && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Photo queued for upload when connection is restored.
                    </div>
                  )}
                </div>
              </div>
              
              {/* Action Buttons - Mobile Optimized */}
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                {photoState.shouldRetry && !photoState.isUploading && (
                  <button
                    onClick={uploadPhoto}
                    disabled={!networkState.isOnline}
                    className="text-sm bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-3 py-1 rounded touch-target"
                  >
                    Try Again
                  </button>
                )}
                
                {photoState.fallbackAction === 'save_without_photo' && (
                  <button
                    onClick={() => {
                      // Simulate successful upload without photo
                      const fallbackResponse: MealUploadResponse = {
                        mealId: `fallback_${Date.now()}`,
                        analysisStatus: 'processing',
                        photoUrl: null,
                        storageWarning: 'Meal saved without photo'
                      }
                      onUploadComplete?.(fallbackResponse)
                    }}
                    className="text-sm bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white px-3 py-1 rounded touch-target"
                  >
                    Continue Without Photo
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Initial state - no camera active, no photo - Mobile Optimized */}
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
            
            {/* Network Status Indicator with Queue Info - Mobile Optimized */}
            {!networkState.isOnline && (
              <div className="mb-4 p-3 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-800 rounded-lg">
                <div className="flex items-center justify-center">
                  <svg className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div className="text-center">
                    <span className="text-sm text-yellow-800 dark:text-yellow-200">
                      Offline - Photos can be captured and will be queued for upload
                    </span>
                    {queueStats.pendingOperations > 0 && (
                      <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                        {queueStats.pendingOperations} operation{queueStats.pendingOperations !== 1 ? 's' : ''} waiting to sync
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={isLoading || cameraState.isInitializing}
                className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-lg font-medium flex items-center justify-center text-sm sm:text-base touch-target"
              >
                {isLoading ? 'Loading...' : 'Open Camera'}
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

      {/* Camera permission error - Mobile Optimized */}
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