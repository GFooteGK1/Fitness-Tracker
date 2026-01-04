import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { 
  uploadMealPhoto, 
  generateSignedUrl, 
  handleStorageFailure,
  initializeStorage,
  PHOTO_EXPIRY_DAYS 
} from '@/app/lib/storage'
import { 
  categorizeError, 
  retryWithBackoff, 
  logError, 
  DEFAULT_RETRY_CONFIG,
  ErrorContext 
} from '@/app/lib/error-handling'

// Maximum file size: 30MB
const MAX_FILE_SIZE = 30 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg']

export async function POST(request: NextRequest) {
  const context: ErrorContext = {
    operation: 'photo_upload',
    userAgent: request.headers.get('user-agent') || undefined,
    networkStatus: 'online'
  }

  try {
    const supabase = await createServerClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    context.userId = user.id

    // Initialize storage if needed with retry logic
    try {
      await retryWithBackoff(
        async () => {
          const storageInit = await initializeStorage()
          if (!storageInit.success) {
            throw new Error(storageInit.error || 'Storage initialization failed')
          }
        },
        { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 },
        { ...context, operation: 'storage_init' }
      )
    } catch (error) {
      // Log warning but continue - storage failures shouldn't block meal entry
      logError(error, { ...context, operation: 'storage_init' })
      console.warn('Storage initialization failed, continuing without photo storage')
    }

    const formData = await request.formData()
    const file = formData.get('photo') as File
    const timestamp = formData.get('timestamp') as string

    // Validate required fields
    if (!file || !timestamp) {
      const error = new Error('Missing required fields: photo, timestamp')
      logError(error, context)
      return NextResponse.json(
        { error: 'Missing required fields: photo, timestamp' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const error = new Error(`File size ${file.size} exceeds 30MB limit`)
      logError(error, context)
      const errorResult = categorizeError(error, context)
      return NextResponse.json(
        { 
          error: errorResult.userMessage,
          details: errorResult.technicalMessage,
          shouldRetry: errorResult.shouldRetry,
          fallbackAction: errorResult.fallbackAction
        },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      const error = new Error(`Invalid file type ${file.type}. Only JPEG and PNG are allowed`)
      logError(error, context)
      const errorResult = categorizeError(error, context)
      return NextResponse.json(
        { 
          error: errorResult.userMessage,
          details: errorResult.technicalMessage,
          shouldRetry: errorResult.shouldRetry,
          fallbackAction: errorResult.fallbackAction
        },
        { status: 400 }
      )
    }

    // Generate unique filename with timestamp
    const fileExtension = file.name.split('.').pop() || 'jpg'
    const fileName = `meal_${user.id}_${Date.now()}.${fileExtension}`

    // Convert file to buffer for upload
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    // Calculate expiration date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + PHOTO_EXPIRY_DAYS)

    let photoUrl: string | null = null
    let storageError: string | null = null

    // Attempt photo upload with retry logic
    try {
      const uploadResult = await retryWithBackoff(
        async () => {
          const result = await uploadMealPhoto(fileBuffer, fileName, file.type, user.id)
          if (!result.success) {
            throw new Error(result.error || 'Upload failed')
          }
          return result
        },
        { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 },
        { ...context, operation: 'photo_upload' }
      )
      
      if (uploadResult.filePath) {
        try {
          const urlResult = await retryWithBackoff(
            async () => {
              const result = await generateSignedUrl(uploadResult.filePath!)
              if (!result.success) {
                throw new Error(result.error || 'URL generation failed')
              }
              return result
            },
            { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 },
            { ...context, operation: 'url_generation' }
          )
          
          if (urlResult.success) {
            photoUrl = urlResult.signedUrl!
          } else {
            storageError = urlResult.error!
          }
        } catch (error) {
          logError(error, { ...context, operation: 'url_generation' })
          const errorResult = categorizeError(error, { ...context, operation: 'url_generation' })
          storageError = errorResult.userMessage
        }
      }
    } catch (error) {
      logError(error, context)
      const errorResult = categorizeError(error, context)
      storageError = errorResult.userMessage
      
      // For storage errors, we continue without photo per Requirements 10.5
      console.warn('Photo upload failed, continuing without photo:', errorResult.technicalMessage)
    }

    // Create meal entry in database with retry logic
    let mealData
    try {
      const result = await retryWithBackoff(
        async () => {
          const { data, error } = await supabase
            .from('meals')
            .insert({
              user_id: user.id,
              meal_timestamp: new Date(timestamp).toISOString(),
              photo_url: photoUrl,
              photo_expires_at: photoUrl ? expiresAt.toISOString() : null,
              items: [],
              total_protein: 0,
              total_carbs: 0,
              total_fat: 0,
              total_calories: 0,
              needs_review: true,
              ai_confidence: null
            })
            .select()
            .single()

          if (error) {
            throw error
          }
          return data
        },
        DEFAULT_RETRY_CONFIG,
        { ...context, operation: 'database' }
      )
      
      mealData = result
    } catch (error) {
      logError(error, { ...context, operation: 'database' })
      const errorResult = categorizeError(error, { ...context, operation: 'database' })
      
      return NextResponse.json(
        { 
          error: errorResult.userMessage,
          details: errorResult.technicalMessage,
          shouldRetry: errorResult.shouldRetry,
          retryAfter: errorResult.retryAfter
        },
        { status: 500 }
      )
    }

    context.mealId = mealData.id

    // Return response with storage status
    const response: any = {
      mealId: mealData.id,
      analysisStatus: 'processing'
    }

    if (photoUrl) {
      response.photoUrl = photoUrl
      response.expiresAt = expiresAt.toISOString()
      response.storageStatus = 'success'
    } else {
      response.storageWarning = storageError || 'Photo upload failed'
      response.photoUrl = null
      response.storageStatus = 'failed'
      response.fallbackAction = 'save_without_photo'
      
      // Log successful fallback
      console.info('Meal created successfully without photo due to storage failure')
    }

    return NextResponse.json(response)

  } catch (error) {
    logError(error, context)
    const errorResult = categorizeError(error, context)
    
    return NextResponse.json(
      { 
        error: errorResult.userMessage,
        details: errorResult.technicalMessage,
        shouldRetry: errorResult.shouldRetry,
        retryAfter: errorResult.retryAfter
      },
      { status: 500 }
    )
  }
}