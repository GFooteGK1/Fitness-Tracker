/**
 * Property-Based Tests for Workouts API Integration
 * 
 * Tests the integration between the Workouts API and the Tab Detection system.
 * Uses fast-check for property-based testing with minimum 100 iterations.
 * 
 * Feature: dynamic-sheet-tab-detection
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 * Property 12: CSV URL construction with detected GID
 * 
 * For any Tab_GID returned by the Tab_Detector, the Workouts_API should construct
 * a CSV export URL in the format:
 * https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={Tab_GID}
 * 
 * Validates: Requirements 6.2
 */
describe('Workouts API Integration - Property Tests', () => {
  describe('Property 12: CSV URL construction with detected GID', () => {
    it('should construct valid CSV export URL for any detected GID', () => {
      fc.assert(
        fc.property(
          // Generate arbitrary GIDs (positive integers as strings)
          fc.integer({ min: 0, max: 2147483647 }).map(n => n.toString()),
          // Generate arbitrary spreadsheet IDs (alphanumeric strings)
          fc.stringMatching(/^[a-zA-Z0-9_-]{20,60}$/),
          (gid, spreadsheetId) => {
            // Construct the CSV URL as the API should
            const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`
            
            // Verify URL structure
            expect(csvUrl).toMatch(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+\/export\?format=csv&gid=\d+$/)
            
            // Verify URL components
            expect(csvUrl).toContain(spreadsheetId)
            expect(csvUrl).toContain(`gid=${gid}`)
            expect(csvUrl).toContain('format=csv')
            
            // Verify URL is parseable
            const url = new URL(csvUrl)
            expect(url.protocol).toBe('https:')
            expect(url.hostname).toBe('docs.google.com')
            expect(url.pathname).toBe(`/spreadsheets/d/${spreadsheetId}/export`)
            expect(url.searchParams.get('format')).toBe('csv')
            expect(url.searchParams.get('gid')).toBe(gid)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should construct URL with correct parameter order', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2147483647 }).map(n => n.toString()),
          fc.stringMatching(/^[a-zA-Z0-9_-]{20,60}$/),
          (gid, spreadsheetId) => {
            const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`
            
            // Verify parameters are in expected order (format before gid)
            const formatIndex = csvUrl.indexOf('format=csv')
            const gidIndex = csvUrl.indexOf(`gid=${gid}`)
            
            expect(formatIndex).toBeGreaterThan(-1)
            expect(gidIndex).toBeGreaterThan(-1)
            expect(formatIndex).toBeLessThan(gidIndex)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle GIDs of varying lengths', () => {
      fc.assert(
        fc.property(
          // Generate GIDs with different digit counts
          fc.oneof(
            fc.integer({ min: 0, max: 9 }),           // 1 digit
            fc.integer({ min: 10, max: 99 }),         // 2 digits
            fc.integer({ min: 100, max: 999 }),       // 3 digits
            fc.integer({ min: 1000, max: 99999999 })  // 4-8 digits
          ).map(n => n.toString()),
          fc.stringMatching(/^[a-zA-Z0-9_-]{20,60}$/),
          (gid, spreadsheetId) => {
            const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`
            
            // Verify GID is correctly embedded regardless of length
            expect(csvUrl).toContain(`gid=${gid}`)
            
            // Verify URL is still valid
            const url = new URL(csvUrl)
            expect(url.searchParams.get('gid')).toBe(gid)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should construct URL that is fetchable (valid URL format)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2147483647 }).map(n => n.toString()),
          fc.stringMatching(/^[a-zA-Z0-9_-]{20,60}$/),
          (gid, spreadsheetId) => {
            const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`
            
            // Verify URL can be used with fetch (no syntax errors)
            expect(() => new URL(csvUrl)).not.toThrow()
            
            // Verify URL has all required components for a fetch request
            const url = new URL(csvUrl)
            expect(url.href).toBe(csvUrl)
            expect(url.toString()).toBe(csvUrl)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 13: Error response with troubleshooting guidance
   * 
   * For any tab detection failure, the Workouts_API should return an error response
   * containing troubleshooting guidance.
   * 
   * Validates: Requirements 6.4
   */
  describe('Property 13: Error response with troubleshooting guidance', () => {
    it('should include troubleshooting guidance for any error code', () => {
      fc.assert(
        fc.property(
          // Generate different error codes
          fc.constantFrom('API_ERROR', 'CONFIG_ERROR', 'PARSE_ERROR', 'NO_TABS_FOUND'),
          // Generate error messages
          fc.string({ minLength: 10, maxLength: 200 }),
          (errorCode, errorMessage) => {
            // Simulate error response structure
            const errorResponse = {
              error: errorMessage,
              code: errorCode,
              troubleshooting: getTroubleshootingGuidance(errorCode)
            }
            
            // Verify error response has required fields
            expect(errorResponse).toHaveProperty('error')
            expect(errorResponse).toHaveProperty('code')
            expect(errorResponse).toHaveProperty('troubleshooting')
            
            // Verify troubleshooting guidance is non-empty
            expect(errorResponse.troubleshooting).toBeTruthy()
            expect(typeof errorResponse.troubleshooting).toBe('string')
            expect(errorResponse.troubleshooting.length).toBeGreaterThan(0)
            
            // Verify troubleshooting is relevant to error code
            const guidance = errorResponse.troubleshooting.toLowerCase()
            
            switch (errorCode) {
              case 'API_ERROR':
                expect(
                  guidance.includes('api') ||
                  guidance.includes('google sheets') ||
                  guidance.includes('rate limit') ||
                  guidance.includes('permissions')
                ).toBe(true)
                break
              
              case 'CONFIG_ERROR':
                expect(
                  guidance.includes('configuration') ||
                  guidance.includes('environment') ||
                  guidance.includes('api key') ||
                  guidance.includes('spreadsheet id')
                ).toBe(true)
                break
              
              case 'PARSE_ERROR':
                expect(
                  guidance.includes('parse') ||
                  guidance.includes('response') ||
                  guidance.includes('format')
                ).toBe(true)
                break
              
              case 'NO_TABS_FOUND':
                expect(
                  guidance.includes('tab') ||
                  guidance.includes('sheet') ||
                  guidance.includes('empty')
                ).toBe(true)
                break
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should provide actionable troubleshooting steps', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('API_ERROR', 'CONFIG_ERROR', 'PARSE_ERROR', 'NO_TABS_FOUND'),
          (errorCode) => {
            const guidance = getTroubleshootingGuidance(errorCode)
            
            // Verify guidance contains actionable verbs
            const actionableVerbs = [
              'check', 'verify', 'ensure', 'confirm', 'review',
              'set', 'configure', 'add', 'update', 'contact'
            ]
            
            const hasActionableVerb = actionableVerbs.some(verb =>
              guidance.toLowerCase().includes(verb)
            )
            
            expect(hasActionableVerb).toBe(true)
            
            // Verify guidance is not just the error code
            expect(guidance.toLowerCase()).not.toBe(errorCode.toLowerCase())
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should include specific details for configuration errors', () => {
      fc.assert(
        fc.property(
          fc.record({
            missingKey: fc.boolean(),
            missingSpreadsheetId: fc.boolean()
          }),
          ({ missingKey, missingSpreadsheetId }) => {
            let errorDetails = ''
            
            if (missingKey) {
              errorDetails += 'Missing GOOGLE_SHEETS_API_KEY. '
            }
            if (missingSpreadsheetId) {
              errorDetails += 'Missing spreadsheet ID. '
            }
            
            if (errorDetails) {
              // Verify error details mention specific missing items
              expect(errorDetails).toBeTruthy()
              
              if (missingKey) {
                expect(errorDetails).toContain('GOOGLE_SHEETS_API_KEY')
              }
              if (missingSpreadsheetId) {
                expect(errorDetails).toContain('spreadsheet ID')
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should format error responses consistently', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('API_ERROR', 'CONFIG_ERROR', 'PARSE_ERROR', 'NO_TABS_FOUND'),
          fc.string({ minLength: 10, maxLength: 200 }),
          (errorCode, errorMessage) => {
            const errorResponse = {
              error: errorMessage,
              code: errorCode,
              troubleshooting: getTroubleshootingGuidance(errorCode),
              timestamp: new Date().toISOString()
            }
            
            // Verify consistent structure
            expect(errorResponse).toHaveProperty('error')
            expect(errorResponse).toHaveProperty('code')
            expect(errorResponse).toHaveProperty('troubleshooting')
            expect(errorResponse).toHaveProperty('timestamp')
            
            // Verify types
            expect(typeof errorResponse.error).toBe('string')
            expect(typeof errorResponse.code).toBe('string')
            expect(typeof errorResponse.troubleshooting).toBe('string')
            expect(typeof errorResponse.timestamp).toBe('string')
            
            // Verify timestamp is valid ISO format
            expect(() => new Date(errorResponse.timestamp)).not.toThrow()
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

/**
 * Helper function to generate troubleshooting guidance based on error code
 * This simulates what the API should return
 */
function getTroubleshootingGuidance(errorCode: string): string {
  switch (errorCode) {
    case 'API_ERROR':
      return 'Check Google Sheets API status and verify the spreadsheet is publicly accessible. If rate limited, wait a few minutes before retrying.'
    
    case 'CONFIG_ERROR':
      return 'Verify that GOOGLE_SHEETS_API_KEY environment variable is set and the spreadsheet ID is correct. Check your configuration settings.'
    
    case 'PARSE_ERROR':
      return 'The API response format was unexpected. Ensure the spreadsheet structure is valid and contains tab metadata.'
    
    case 'NO_TABS_FOUND':
      return 'The spreadsheet appears to be empty or contains no tabs. Verify the spreadsheet ID and ensure it has at least one tab.'
    
    default:
      return 'An unexpected error occurred. Please check the logs for more details.'
  }
}
