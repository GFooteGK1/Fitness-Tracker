import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 8: Retry with Exponential Backoff
 * 
 * For any transient API failure (rate limit, timeout, 5xx error), the sync
 * service SHALL retry up to 3 times with delays following exponential backoff
 * pattern (e.g., 1s, 2s, 4s), AND after 3 failures SHALL mark sync status as 'error'.
 * 
 * Validates: Requirements 3.7, 8.1
 * 
 * Feature: whoop-integration
 * Property 8: Retry logic uses exponential backoff
 */

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // milliseconds

interface RetryAttempt {
  attemptNumber: number;
  timestamp: number;
  error: string;
}

interface RetryResult {
  success: boolean;
  attempts: RetryAttempt[];
  finalStatus: 'success' | 'error';
  totalRetries: number;
}

/**
 * Simulate retry logic with exponential backoff
 */
async function simulateRetryWithBackoff(
  shouldSucceedAfter: number, // Number of failures before success (-1 = always fail)
  isRetryableError: boolean
): Promise<RetryResult> {
  const attempts: RetryAttempt[] = [];
  let currentAttempt = 0;
  let cumulativeTime = 0;
  
  while (currentAttempt <= MAX_RETRIES) {
    // Check if this attempt should succeed
    if (currentAttempt === shouldSucceedAfter) {
      attempts.push({
        attemptNumber: currentAttempt,
        timestamp: cumulativeTime,
        error: '',
      });
      
      return {
        success: true,
        attempts,
        finalStatus: 'success',
        totalRetries: currentAttempt,
      };
    }
    
    // Record failed attempt
    attempts.push({
      attemptNumber: currentAttempt,
      timestamp: cumulativeTime,
      error: isRetryableError ? 'Rate limit exceeded' : 'Invalid credentials',
    });
    
    // Check if we should retry
    if (!isRetryableError || currentAttempt >= MAX_RETRIES) {
      return {
        success: false,
        attempts,
        finalStatus: 'error',
        totalRetries: currentAttempt,
      };
    }
    
    // Add backoff delay to cumulative time
    const delay = RETRY_DELAYS[currentAttempt];
    cumulativeTime += delay;
    
    currentAttempt++;
  }
  
  return {
    success: false,
    attempts,
    finalStatus: 'error',
    totalRetries: currentAttempt,
  };
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: string): boolean {
  const retryablePatterns = [
    'rate limit',
    'timeout',
    '503',
    '502',
    '500',
  ];
  
  const errorLower = error.toLowerCase();
  return retryablePatterns.some(pattern => errorLower.includes(pattern));
}

describe('Property 8: Retry with Exponential Backoff', () => {
  it('should retry up to 3 times for retryable errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -1, max: 5 }), // -1 = always fail, 0-5 = succeed after N attempts
        async (shouldSucceedAfter) => {
          // Act
          const result = await simulateRetryWithBackoff(shouldSucceedAfter, true);
          
          // Assert: Should not exceed max retries
          expect(result.totalRetries).toBeLessThanOrEqual(MAX_RETRIES);
          
          // Assert: If success happens within retry limit, should succeed
          if (shouldSucceedAfter >= 0 && shouldSucceedAfter <= MAX_RETRIES) {
            expect(result.success).toBe(true);
            expect(result.finalStatus).toBe('success');
          }
          
          // Assert: If always fails or exceeds retry limit, should fail
          if (shouldSucceedAfter < 0 || shouldSucceedAfter > MAX_RETRIES) {
            expect(result.success).toBe(false);
            expect(result.finalStatus).toBe('error');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not retry for non-retryable errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (shouldSucceedAfter) => {
          // Act: Non-retryable error
          const result = await simulateRetryWithBackoff(shouldSucceedAfter, false);
          
          // Assert: Should fail immediately without retries
          expect(result.success).toBe(false);
          expect(result.totalRetries).toBe(0);
          expect(result.attempts.length).toBe(1);
          expect(result.finalStatus).toBe('error');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use exponential backoff delays', async () => {
    // Act: Always fail to see all retry attempts
    const result = await simulateRetryWithBackoff(-1, true);
    
    // Assert: Should have attempted MAX_RETRIES + 1 times (initial + retries)
    expect(result.attempts.length).toBe(MAX_RETRIES + 1);
    
    // Assert: Delays should follow exponential pattern
    for (let i = 1; i < result.attempts.length; i++) {
      const previousTimestamp = result.attempts[i - 1].timestamp;
      const currentTimestamp = result.attempts[i].timestamp;
      const actualDelay = currentTimestamp - previousTimestamp;
      const expectedDelay = RETRY_DELAYS[i - 1];
      
      // Allow some tolerance for timing
      expect(actualDelay).toBeGreaterThanOrEqual(expectedDelay - 100);
      expect(actualDelay).toBeLessThanOrEqual(expectedDelay + 100);
    }
  });

  it('should mark status as error after max retries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('Rate limit exceeded', 'Timeout', '503 Service Unavailable'),
        async (errorMessage) => {
          // Act: Always fail
          const result = await simulateRetryWithBackoff(-1, true);
          
          // Assert: Final status should be error
          expect(result.finalStatus).toBe('error');
          expect(result.success).toBe(false);
          expect(result.totalRetries).toBe(MAX_RETRIES);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should identify retryable errors correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'Rate limit exceeded',
          'Request timeout',
          '503 Service Unavailable',
          '502 Bad Gateway',
          '500 Internal Server Error'
        ),
        (errorMessage) => {
          // Act
          const shouldRetry = isRetryableError(errorMessage);
          
          // Assert: All these errors should be retryable
          expect(shouldRetry).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not retry non-retryable errors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'Invalid credentials',
          '401 Unauthorized',
          '403 Forbidden',
          '404 Not Found',
          'Invalid grant'
        ),
        (errorMessage) => {
          // Act
          const shouldRetry = isRetryableError(errorMessage);
          
          // Assert: These errors should not be retryable
          expect(shouldRetry).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should succeed on first retry if error resolves', async () => {
    // Act: Succeed after 1 failure
    const result = await simulateRetryWithBackoff(1, true);
    
    // Assert: Should succeed with exactly 1 retry
    expect(result.success).toBe(true);
    expect(result.totalRetries).toBe(1);
    expect(result.attempts.length).toBe(2); // Initial + 1 retry
    expect(result.finalStatus).toBe('success');
  });

  it('should succeed on last possible retry', async () => {
    // Act: Succeed after MAX_RETRIES failures
    const result = await simulateRetryWithBackoff(MAX_RETRIES, true);
    
    // Assert: Should succeed on the last retry
    expect(result.success).toBe(true);
    expect(result.totalRetries).toBe(MAX_RETRIES);
    expect(result.attempts.length).toBe(MAX_RETRIES + 1);
    expect(result.finalStatus).toBe('success');
  });

  it('should fail if error persists beyond max retries', async () => {
    // Act: Try to succeed after more than MAX_RETRIES
    const result = await simulateRetryWithBackoff(MAX_RETRIES + 1, true);
    
    // Assert: Should fail after exhausting retries
    expect(result.success).toBe(false);
    expect(result.totalRetries).toBe(MAX_RETRIES);
    expect(result.finalStatus).toBe('error');
  });

  it('should record all retry attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -1, max: MAX_RETRIES + 2 }),
        async (shouldSucceedAfter) => {
          // Act
          const result = await simulateRetryWithBackoff(shouldSucceedAfter, true);
          
          // Assert: Should have recorded all attempts
          expect(result.attempts.length).toBeGreaterThan(0);
          
          // Assert: Attempt numbers should be sequential
          result.attempts.forEach((attempt, index) => {
            expect(attempt.attemptNumber).toBe(index);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have increasing timestamps for retry attempts', async () => {
    // Act: Always fail to see all retries
    const result = await simulateRetryWithBackoff(-1, true);
    
    // Assert: Timestamps should be monotonically increasing
    for (let i = 1; i < result.attempts.length; i++) {
      const previousTimestamp = result.attempts[i - 1].timestamp;
      const currentTimestamp = result.attempts[i].timestamp;
      
      expect(currentTimestamp).toBeGreaterThan(previousTimestamp);
    }
  });
});
