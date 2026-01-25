/**
 * WHOOP Error Handling Utilities
 * Centralized error handling for WHOOP integration
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

/**
 * WHOOP-specific error types
 */
export enum WhoopErrorType {
  // OAuth errors
  OAUTH_STATE_MISMATCH = 'OAUTH_STATE_MISMATCH',
  OAUTH_CODE_EXCHANGE_FAILED = 'OAUTH_CODE_EXCHANGE_FAILED',
  OAUTH_ACCESS_DENIED = 'OAUTH_ACCESS_DENIED',
  
  // Token errors
  TOKEN_REFRESH_FAILED = 'TOKEN_REFRESH_FAILED',
  TOKEN_ENCRYPTION_FAILED = 'TOKEN_ENCRYPTION_FAILED',
  TOKEN_DECRYPTION_FAILED = 'TOKEN_DECRYPTION_FAILED',
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  
  // API errors
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_TIMEOUT = 'API_TIMEOUT',
  API_SERVER_ERROR = 'API_SERVER_ERROR',
  API_UNAUTHORIZED = 'API_UNAUTHORIZED',
  
  // Sync errors
  SYNC_FAILED = 'SYNC_FAILED',
  SYNC_PARTIAL_FAILURE = 'SYNC_PARTIAL_FAILURE',
  
  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  
  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * WHOOP error class with additional context
 */
export class WhoopError extends Error {
  constructor(
    public type: WhoopErrorType,
    message: string,
    public userMessage: string,
    public context?: Record<string, any>,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'WhoopError';
  }
}

/**
 * User-friendly error messages for each error type
 */
const USER_ERROR_MESSAGES: Record<WhoopErrorType, string> = {
  [WhoopErrorType.OAUTH_STATE_MISMATCH]: 'Security validation failed. Please try connecting again.',
  [WhoopErrorType.OAUTH_CODE_EXCHANGE_FAILED]: 'Failed to complete WHOOP connection. Please try again.',
  [WhoopErrorType.OAUTH_ACCESS_DENIED]: 'WHOOP authorization was denied. Please try again if you want to connect.',
  
  [WhoopErrorType.TOKEN_REFRESH_FAILED]: 'Failed to refresh WHOOP connection. Please reconnect your account.',
  [WhoopErrorType.TOKEN_ENCRYPTION_FAILED]: 'Failed to secure WHOOP credentials. Please try again.',
  [WhoopErrorType.TOKEN_DECRYPTION_FAILED]: 'Failed to access WHOOP credentials. Please reconnect your account.',
  [WhoopErrorType.TOKEN_NOT_FOUND]: 'WHOOP account not connected. Please connect your account first.',
  
  [WhoopErrorType.API_RATE_LIMIT]: 'WHOOP API rate limit reached. Please try again in a few minutes.',
  [WhoopErrorType.API_TIMEOUT]: 'WHOOP API request timed out. Please try again.',
  [WhoopErrorType.API_SERVER_ERROR]: 'WHOOP service is temporarily unavailable. Please try again later.',
  [WhoopErrorType.API_UNAUTHORIZED]: 'WHOOP authorization expired. Please reconnect your account.',
  
  [WhoopErrorType.SYNC_FAILED]: 'Failed to sync WHOOP data. Please try again.',
  [WhoopErrorType.SYNC_PARTIAL_FAILURE]: 'Some WHOOP data failed to sync. Your data may be incomplete.',
  
  [WhoopErrorType.DATABASE_ERROR]: 'Failed to save WHOOP data. Please try again.',
  
  [WhoopErrorType.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.'
};

/**
 * Creates a WHOOP error with appropriate type and messages
 */
export function createWhoopError(
  type: WhoopErrorType,
  technicalMessage: string,
  context?: Record<string, any>,
  originalError?: Error
): WhoopError {
  const userMessage = USER_ERROR_MESSAGES[type];
  return new WhoopError(type, technicalMessage, userMessage, context, originalError);
}

/**
 * Logs WHOOP errors with context
 */
export function logWhoopError(error: WhoopError | Error, additionalContext?: Record<string, any>): void {
  if (error instanceof WhoopError) {
    console.error('[WHOOP Error]', {
      type: error.type,
      message: error.message,
      userMessage: error.userMessage,
      context: { ...error.context, ...additionalContext },
      stack: error.stack,
      originalError: error.originalError?.message
    });
  } else {
    console.error('[WHOOP Error - Unexpected]', {
      message: error.message,
      context: additionalContext,
      stack: error.stack
    });
  }
}

/**
 * Handles WHOOP errors and returns appropriate HTTP response data
 */
export function handleWhoopError(error: unknown): {
  status: number;
  error: string;
  details?: string;
} {
  if (error instanceof WhoopError) {
    logWhoopError(error);
    
    // Map error types to HTTP status codes
    const statusMap: Partial<Record<WhoopErrorType, number>> = {
      [WhoopErrorType.OAUTH_STATE_MISMATCH]: 400,
      [WhoopErrorType.OAUTH_CODE_EXCHANGE_FAILED]: 502,
      [WhoopErrorType.OAUTH_ACCESS_DENIED]: 403,
      
      [WhoopErrorType.TOKEN_REFRESH_FAILED]: 401,
      [WhoopErrorType.TOKEN_ENCRYPTION_FAILED]: 500,
      [WhoopErrorType.TOKEN_DECRYPTION_FAILED]: 500,
      [WhoopErrorType.TOKEN_NOT_FOUND]: 404,
      
      [WhoopErrorType.API_RATE_LIMIT]: 429,
      [WhoopErrorType.API_TIMEOUT]: 504,
      [WhoopErrorType.API_SERVER_ERROR]: 502,
      [WhoopErrorType.API_UNAUTHORIZED]: 401,
      
      [WhoopErrorType.SYNC_FAILED]: 500,
      [WhoopErrorType.SYNC_PARTIAL_FAILURE]: 207, // Multi-status
      
      [WhoopErrorType.DATABASE_ERROR]: 500,
      [WhoopErrorType.UNKNOWN_ERROR]: 500
    };
    
    return {
      status: statusMap[error.type] || 500,
      error: error.userMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
  
  // Handle generic errors
  logWhoopError(error as Error);
  return {
    status: 500,
    error: 'An unexpected error occurred',
    details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
  };
}

/**
 * Detects WHOOP API error type from response
 */
export function detectApiErrorType(statusCode: number, errorBody?: any): WhoopErrorType {
  if (statusCode === 429) {
    return WhoopErrorType.API_RATE_LIMIT;
  }
  
  if (statusCode === 401 || statusCode === 403) {
    return WhoopErrorType.API_UNAUTHORIZED;
  }
  
  if (statusCode >= 500) {
    return WhoopErrorType.API_SERVER_ERROR;
  }
  
  return WhoopErrorType.UNKNOWN_ERROR;
}

/**
 * Wraps async WHOOP operations with error handling
 */
export async function withWhoopErrorHandling<T>(
  operation: () => Promise<T>,
  errorType: WhoopErrorType,
  context?: Record<string, any>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw createWhoopError(
      errorType,
      error instanceof Error ? error.message : 'Unknown error',
      context,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Checks if error is retryable
 */
export function isRetryableError(error: WhoopError | Error): boolean {
  if (error instanceof WhoopError) {
    const retryableTypes = [
      WhoopErrorType.API_TIMEOUT,
      WhoopErrorType.API_SERVER_ERROR,
      WhoopErrorType.API_RATE_LIMIT
    ];
    return retryableTypes.includes(error.type);
  }
  return false;
}

/**
 * Gets retry delay in milliseconds based on error type
 */
export function getRetryDelay(error: WhoopError, attemptNumber: number): number {
  if (error.type === WhoopErrorType.API_RATE_LIMIT) {
    // Longer delay for rate limits
    return Math.min(60000, 5000 * Math.pow(2, attemptNumber)); // Max 60s
  }
  
  // Exponential backoff for other retryable errors
  return Math.min(10000, 1000 * Math.pow(2, attemptNumber)); // Max 10s
}
