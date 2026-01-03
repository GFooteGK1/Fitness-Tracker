/**
 * Comprehensive error handling utilities for the food tracking system
 * Implements Requirements 2.5, 10.5 - graceful error handling and user-friendly messages
 */

export interface ErrorContext {
  operation: string
  userId?: string
  mealId?: string
  photoUrl?: string
  timestamp?: string
  userAgent?: string
  networkStatus?: 'online' | 'offline'
}

export interface ErrorResult {
  userMessage: string
  technicalMessage: string
  shouldRetry: boolean
  retryAfter?: number // seconds
  fallbackAction?: string
  errorCode: string
}

export interface RetryConfig {
  maxAttempts: number
  baseDelay: number // milliseconds
  maxDelay: number // milliseconds
  backoffMultiplier: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
}

/**
 * Categorizes errors and provides appropriate user messages and retry strategies
 */
export function categorizeError(error: unknown, context: ErrorContext): ErrorResult {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorName = error instanceof Error ? error.name : 'UnknownError'

  // Network and connectivity errors
  if (isNetworkError(error)) {
    return {
      userMessage: 'Network connection issue. Please check your internet connection and try again.',
      technicalMessage: `Network error: ${errorMessage}`,
      shouldRetry: true,
      retryAfter: 5,
      fallbackAction: 'queue_for_later',
      errorCode: 'NETWORK_ERROR'
    }
  }

  // AI Analysis specific errors
  if (context.operation === 'ai_analysis') {
    return categorizeAIError(error, errorMessage, errorName)
  }

  // Photo upload specific errors
  if (context.operation === 'photo_upload') {
    return categorizeUploadError(error, errorMessage, errorName)
  }

  // Database operation errors
  if (context.operation === 'database') {
    return categorizeDatabaseError(error, errorMessage, errorName)
  }

  // Authentication errors
  if (isAuthError(error)) {
    return {
      userMessage: 'Your session has expired. Please sign in again.',
      technicalMessage: `Auth error: ${errorMessage}`,
      shouldRetry: false,
      fallbackAction: 'redirect_to_login',
      errorCode: 'AUTH_ERROR'
    }
  }

  // Validation errors
  if (isValidationError(error)) {
    return {
      userMessage: 'The data provided is invalid. Please check your input and try again.',
      technicalMessage: `Validation error: ${errorMessage}`,
      shouldRetry: false,
      errorCode: 'VALIDATION_ERROR'
    }
  }

  // Generic server errors
  if (isServerError(error)) {
    return {
      userMessage: 'A server error occurred. Our team has been notified. Please try again in a few minutes.',
      technicalMessage: `Server error: ${errorMessage}`,
      shouldRetry: true,
      retryAfter: 30,
      errorCode: 'SERVER_ERROR'
    }
  }

  // Default fallback
  return {
    userMessage: 'An unexpected error occurred. Please try again.',
    technicalMessage: `Unknown error: ${errorMessage}`,
    shouldRetry: true,
    retryAfter: 10,
    errorCode: 'UNKNOWN_ERROR'
  }
}

function categorizeAIError(error: unknown, errorMessage: string, errorName: string): ErrorResult {
  // Claude API timeout
  if (errorMessage.includes('timeout') || errorMessage.includes('AI analysis timeout')) {
    return {
      userMessage: 'AI analysis is taking longer than expected. Your meal has been saved and will be analyzed shortly.',
      technicalMessage: `AI timeout: ${errorMessage}`,
      shouldRetry: true,
      retryAfter: 30,
      fallbackAction: 'flag_for_manual_review',
      errorCode: 'AI_TIMEOUT'
    }
  }

  // Claude API rate limiting
  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return {
      userMessage: 'AI analysis is temporarily unavailable due to high demand. Please try again in a few minutes.',
      technicalMessage: `AI rate limit: ${errorMessage}`,
      shouldRetry: true,
      retryAfter: 120,
      fallbackAction: 'flag_for_manual_review',
      errorCode: 'AI_RATE_LIMIT'
    }
  }

  // Invalid AI response format
  if (errorMessage.includes('Invalid JSON') || errorMessage.includes('parse')) {
    return {
      userMessage: 'AI analysis returned unexpected results. Your meal has been flagged for review.',
      technicalMessage: `AI parse error: ${errorMessage}`,
      shouldRetry: true,
      retryAfter: 10,
      fallbackAction: 'flag_for_manual_review',
      errorCode: 'AI_PARSE_ERROR'
    }
  }

  // Claude API service errors
  if (errorMessage.includes('service unavailable') || errorMessage.includes('503')) {
    return {
      userMessage: 'AI analysis service is temporarily unavailable. Your meal has been saved for later analysis.',
      technicalMessage: `AI service error: ${errorMessage}`,
      shouldRetry: true,
      retryAfter: 60,
      fallbackAction: 'flag_for_manual_review',
      errorCode: 'AI_SERVICE_ERROR'
    }
  }

  // Generic AI error
  return {
    userMessage: 'AI analysis failed. Your meal has been saved and flagged for manual review.',
    technicalMessage: `AI error: ${errorMessage}`,
    shouldRetry: true,
    retryAfter: 30,
    fallbackAction: 'flag_for_manual_review',
    errorCode: 'AI_ERROR'
  }
}

function categorizeUploadError(error: unknown, errorMessage: string, errorName: string): ErrorResult {
  // File size errors
  if (errorMessage.includes('size') || errorMessage.includes('30MB')) {
    return {
      userMessage: 'Photo file is too large. Please select a smaller image (under 30MB).',
      technicalMessage: `File size error: ${errorMessage}`,
      shouldRetry: false,
      fallbackAction: 'compress_image',
      errorCode: 'FILE_SIZE_ERROR'
    }
  }

  // File type errors
  if (errorMessage.includes('type') || errorMessage.includes('format')) {
    return {
      userMessage: 'Invalid file type. Please select a JPEG or PNG image.',
      technicalMessage: `File type error: ${errorMessage}`,
      shouldRetry: false,
      fallbackAction: 'convert_format',
      errorCode: 'FILE_TYPE_ERROR'
    }
  }

  // Storage service errors
  if (errorMessage.includes('storage') || errorMessage.includes('S3') || errorMessage.includes('Drive')) {
    return {
      userMessage: 'Photo storage is temporarily unavailable. Your meal data will be saved without the photo.',
      technicalMessage: `Storage error: ${errorMessage}`,
      shouldRetry: true,
      retryAfter: 30,
      fallbackAction: 'save_without_photo',
      errorCode: 'STORAGE_ERROR'
    }
  }

  // Generic upload error
  return {
    userMessage: 'Photo upload failed. Please try again or continue without the photo.',
    technicalMessage: `Upload error: ${errorMessage}`,
    shouldRetry: true,
    retryAfter: 10,
    fallbackAction: 'save_without_photo',
    errorCode: 'UPLOAD_ERROR'
  }
}

function categorizeDatabaseError(error: unknown, errorMessage: string, errorName: string): ErrorResult {
  // Connection errors
  if (errorMessage.includes('connection') || errorMessage.includes('timeout')) {
    return {
      userMessage: 'Database connection issue. Please try again in a moment.',
      technicalMessage: `DB connection error: ${errorMessage}`,
      shouldRetry: true,
      retryAfter: 15,
      errorCode: 'DB_CONNECTION_ERROR'
    }
  }

  // Constraint violations
  if (errorMessage.includes('constraint') || errorMessage.includes('duplicate')) {
    return {
      userMessage: 'This meal entry already exists or conflicts with existing data.',
      technicalMessage: `DB constraint error: ${errorMessage}`,
      shouldRetry: false,
      errorCode: 'DB_CONSTRAINT_ERROR'
    }
  }

  // Generic database error
  return {
    userMessage: 'Database error occurred. Please try again.',
    technicalMessage: `DB error: ${errorMessage}`,
    shouldRetry: true,
    retryAfter: 20,
    errorCode: 'DB_ERROR'
  }
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    const name = error.name.toLowerCase()
    
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      name.includes('networkerror') ||
      name.includes('typeerror') && message.includes('failed to fetch')
    )
  }
  return false
}

function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('session expired') ||
      message.includes('401')
    )
  }
  return false
}

function isValidationError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required') ||
      message.includes('400')
    )
  }
  return false
}

function isServerError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('internal server error')
    )
  }
  return false
}

/**
 * Implements exponential backoff retry logic
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context: ErrorContext
): Promise<T> {
  let lastError: unknown
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      
      const errorResult = categorizeError(error, context)
      
      // Don't retry if error is not retryable
      if (!errorResult.shouldRetry) {
        throw error
      }
      
      // Don't retry on last attempt
      if (attempt === config.maxAttempts) {
        break
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      )
      
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, errorResult.technicalMessage)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError
}

/**
 * Logs errors with appropriate context for monitoring and debugging
 */
export function logError(error: unknown, context: ErrorContext): void {
  const errorResult = categorizeError(error, context)
  
  const logData = {
    timestamp: new Date().toISOString(),
    errorCode: errorResult.errorCode,
    operation: context.operation,
    userId: context.userId,
    mealId: context.mealId,
    userMessage: errorResult.userMessage,
    technicalMessage: errorResult.technicalMessage,
    shouldRetry: errorResult.shouldRetry,
    retryAfter: errorResult.retryAfter,
    fallbackAction: errorResult.fallbackAction,
    userAgent: context.userAgent,
    networkStatus: context.networkStatus
  }
  
  // Log to console (in production, this would go to a logging service)
  if (errorResult.errorCode.includes('NETWORK') || errorResult.errorCode.includes('TIMEOUT')) {
    console.warn('Recoverable error:', logData)
  } else {
    console.error('Application error:', logData)
  }
  
  // In production, send to monitoring service like Sentry, DataDog, etc.
  // sendToMonitoringService(logData)
}

/**
 * Creates user-friendly error messages for UI display
 */
export function createUserErrorMessage(error: unknown, context: ErrorContext): {
  title: string
  message: string
  actionText?: string
  actionType?: 'retry' | 'fallback' | 'redirect'
} {
  const errorResult = categorizeError(error, context)
  
  let title = 'Something went wrong'
  let actionText: string | undefined
  let actionType: 'retry' | 'fallback' | 'redirect' | undefined
  
  switch (errorResult.errorCode) {
    case 'NETWORK_ERROR':
      title = 'Connection Issue'
      actionText = 'Try Again'
      actionType = 'retry'
      break
      
    case 'AI_TIMEOUT':
    case 'AI_RATE_LIMIT':
    case 'AI_SERVICE_ERROR':
      title = 'AI Analysis Delayed'
      actionText = 'Continue Anyway'
      actionType = 'fallback'
      break
      
    case 'FILE_SIZE_ERROR':
    case 'FILE_TYPE_ERROR':
      title = 'Invalid Photo'
      actionText = 'Select Different Photo'
      actionType = 'fallback'
      break
      
    case 'STORAGE_ERROR':
      title = 'Photo Storage Issue'
      actionText = 'Continue Without Photo'
      actionType = 'fallback'
      break
      
    case 'AUTH_ERROR':
      title = 'Session Expired'
      actionText = 'Sign In Again'
      actionType = 'redirect'
      break
      
    default:
      if (errorResult.shouldRetry) {
        actionText = 'Try Again'
        actionType = 'retry'
      }
  }
  
  return {
    title,
    message: errorResult.userMessage,
    actionText,
    actionType
  }
}