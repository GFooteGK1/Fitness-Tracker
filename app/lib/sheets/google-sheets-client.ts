/**
 * Google Sheets API v4 Client
 * 
 * Wrapper for Google Sheets API with error handling and retry logic.
 * Fetches tab metadata from spreadsheets using API key authentication.
 */

import { SheetTab, TabDetectionError } from './types'

/**
 * Base URL for Google Sheets API v4
 */
const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

/**
 * Maximum number of retry attempts for failed API calls
 */
const MAX_RETRIES = 3

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Fetches all tabs from a Google Sheets spreadsheet
 * 
 * @param spreadsheetId - The ID of the spreadsheet
 * @param apiKey - Google Sheets API key for authentication
 * @returns Array of sheet tabs with metadata
 * @throws TabDetectionError for API failures, configuration errors, or parsing errors
 * 
 * Requirements: 1.1, 1.2, 1.3, 7.1, 7.2, 7.4, 7.5, 7.6
 */
export async function fetchSheetTabs(
  spreadsheetId: string,
  apiKey: string
): Promise<SheetTab[]> {
  // Validate inputs
  if (!spreadsheetId || !apiKey) {
    throw new TabDetectionError(
      'Missing required configuration: spreadsheetId and apiKey are required',
      'CONFIG_ERROR',
      { spreadsheetId: !!spreadsheetId, apiKey: !!apiKey }
    )
  }

  // Build API URL with fields parameter to minimize response size
  const url = `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties(sheetId,title,index)&key=${apiKey}`

  // Fetch with retry logic
  const response = await fetchWithRetry(url, MAX_RETRIES)

  // Handle non-OK responses
  if (!response.ok) {
    await handleApiError(response, spreadsheetId)
  }

  // Parse response
  let responseData: any
  try {
    responseData = await response.json()
  } catch (error) {
    throw new TabDetectionError(
      'Failed to parse Google Sheets API response',
      'PARSE_ERROR',
      { error: error instanceof Error ? error.message : String(error) }
    )
  }

  // Extract tabs from response
  return extractTabsFromResponse(responseData, spreadsheetId)
}

/**
 * Fetches a URL with exponential backoff retry logic
 * 
 * @param url - The URL to fetch
 * @param maxRetries - Maximum number of retry attempts
 * @returns Response object
 * @throws Error if max retries exceeded
 * 
 * Requirements: 7.5
 */
async function fetchWithRetry(url: string, maxRetries: number): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      })

      // If rate limited, retry with exponential backoff
      if (response.status === 429) {
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
          console.warn('[TabDetection] GoogleSheetsClient: rate_limit_retry', {
            timestamp: new Date().toISOString(),
            level: 'WARN',
            component: 'GoogleSheetsClient',
            action: 'rate_limit_retry',
            details: {
              attempt: attempt + 1,
              maxRetries,
              delayMs: delay
            }
          })
          await sleep(delay)
          continue
        }
      }

      // If server error (5xx), retry with exponential backoff
      if (response.status >= 500) {
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
          console.warn('[TabDetection] GoogleSheetsClient: server_error_retry', {
            timestamp: new Date().toISOString(),
            level: 'WARN',
            component: 'GoogleSheetsClient',
            action: 'server_error_retry',
            details: {
              status: response.status,
              attempt: attempt + 1,
              maxRetries,
              delayMs: delay
            }
          })
          await sleep(delay)
          continue
        }
      }

      // Return response (success or non-retryable error)
      return response

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // Retry on network errors
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
        console.warn('[TabDetection] GoogleSheetsClient: network_error_retry', {
          timestamp: new Date().toISOString(),
          level: 'WARN',
          component: 'GoogleSheetsClient',
          action: 'network_error_retry',
          details: {
            error: lastError.message,
            attempt: attempt + 1,
            maxRetries,
            delayMs: delay
          }
        })
        await sleep(delay)
        continue
      }
    }
  }

  // Max retries exceeded
  throw new TabDetectionError(
    `Failed to fetch sheet tabs after ${maxRetries} attempts`,
    'API_ERROR',
    { lastError: lastError?.message }
  )
}

/**
 * Handles API error responses with appropriate error messages
 * 
 * @param response - The failed response object
 * @param spreadsheetId - The spreadsheet ID for context
 * @throws TabDetectionError with appropriate error code and message
 * 
 * Requirements: 7.4
 */
async function handleApiError(response: Response, spreadsheetId: string): Promise<never> {
  let errorDetails: any = {}
  
  try {
    errorDetails = await response.json()
  } catch {
    // Ignore JSON parse errors for error responses
  }

  const status = response.status

  // 401 Unauthorized - Invalid API key
  if (status === 401) {
    throw new TabDetectionError(
      'Invalid Google Sheets API key. Please check your GOOGLE_SHEETS_API_KEY environment variable.',
      'CONFIG_ERROR',
      {
        status,
        spreadsheetId,
        message: errorDetails.error?.message || 'Unauthorized'
      }
    )
  }

  // 403 Forbidden - Permissions issue
  if (status === 403) {
    throw new TabDetectionError(
      'Access forbidden. Ensure the spreadsheet is publicly readable or the API key has proper permissions.',
      'API_ERROR',
      {
        status,
        spreadsheetId,
        message: errorDetails.error?.message || 'Forbidden',
        troubleshooting: 'Check spreadsheet sharing settings and API key restrictions'
      }
    )
  }

  // 404 Not Found - Spreadsheet doesn't exist
  if (status === 404) {
    throw new TabDetectionError(
      `Spreadsheet not found: ${spreadsheetId}. Please verify the spreadsheet ID.`,
      'CONFIG_ERROR',
      {
        status,
        spreadsheetId,
        message: errorDetails.error?.message || 'Not Found'
      }
    )
  }

  // 429 Rate Limit - Should have been retried, but max retries exceeded
  if (status === 429) {
    throw new TabDetectionError(
      'Google Sheets API rate limit exceeded. Please try again later.',
      'API_ERROR',
      {
        status,
        spreadsheetId,
        message: errorDetails.error?.message || 'Rate Limit Exceeded',
        troubleshooting: 'Wait a few minutes before retrying'
      }
    )
  }

  // 500+ Server Error - Should have been retried, but max retries exceeded
  if (status >= 500) {
    throw new TabDetectionError(
      'Google Sheets API server error. Please try again later.',
      'API_ERROR',
      {
        status,
        spreadsheetId,
        message: errorDetails.error?.message || 'Server Error'
      }
    )
  }

  // Other errors
  throw new TabDetectionError(
    `Google Sheets API error: ${status}`,
    'API_ERROR',
    {
      status,
      spreadsheetId,
      message: errorDetails.error?.message || response.statusText
    }
  )
}

/**
 * Extracts tab metadata from Google Sheets API response
 * 
 * @param responseData - The parsed JSON response from the API
 * @param spreadsheetId - The spreadsheet ID for error context
 * @returns Array of sheet tabs
 * @throws TabDetectionError if response structure is invalid or no tabs found
 * 
 * Requirements: 1.3
 */
function extractTabsFromResponse(responseData: any, spreadsheetId: string): SheetTab[] {
  // Validate response structure
  if (!responseData || typeof responseData !== 'object') {
    throw new TabDetectionError(
      'Invalid API response structure',
      'PARSE_ERROR',
      { spreadsheetId, responseData }
    )
  }

  if (!Array.isArray(responseData.sheets)) {
    throw new TabDetectionError(
      'No sheets found in API response',
      'NO_TABS_FOUND',
      { spreadsheetId, responseData }
    )
  }

  if (responseData.sheets.length === 0) {
    throw new TabDetectionError(
      'Spreadsheet contains no tabs',
      'NO_TABS_FOUND',
      { spreadsheetId }
    )
  }

  // Extract tab metadata
  const tabs: SheetTab[] = []

  for (const sheet of responseData.sheets) {
    const properties = sheet.properties

    // Validate required fields
    if (!properties || typeof properties !== 'object') {
      console.warn('[TabDetection] GoogleSheetsClient: invalid_sheet_properties', {
        timestamp: new Date().toISOString(),
        level: 'WARN',
        component: 'GoogleSheetsClient',
        action: 'invalid_sheet_properties',
        details: {
          spreadsheetId,
          sheet
        }
      })
      continue
    }

    if (
      typeof properties.sheetId !== 'number' ||
      typeof properties.title !== 'string' ||
      typeof properties.index !== 'number'
    ) {
      console.warn('[TabDetection] GoogleSheetsClient: missing_required_fields', {
        timestamp: new Date().toISOString(),
        level: 'WARN',
        component: 'GoogleSheetsClient',
        action: 'missing_required_fields',
        details: {
          spreadsheetId,
          properties
        }
      })
      continue
    }

    tabs.push({
      sheetId: properties.sheetId,
      title: properties.title,
      index: properties.index
    })
  }

  // Ensure we extracted at least one valid tab
  if (tabs.length === 0) {
    throw new TabDetectionError(
      'No valid tabs found in spreadsheet',
      'NO_TABS_FOUND',
      { spreadsheetId, totalSheets: responseData.sheets.length }
    )
  }

  console.log('[TabDetection] GoogleSheetsClient: tabs_fetched', {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    component: 'GoogleSheetsClient',
    action: 'tabs_fetched',
    details: {
      spreadsheetId,
      tabCount: tabs.length,
      tabs: tabs.map(t => ({ title: t.title, sheetId: t.sheetId, index: t.index }))
    }
  })

  return tabs
}
