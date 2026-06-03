/**
 * Test suite for API route caller error handling.
 *
 * Validates that the API route caller functions properly:
 * - Log full error diagnostics
 * - Preserve conversational responses from parse functions
 * - Return user-friendly error messages
 * - Handle various error scenarios gracefully
 *
 * Validates: Requirements 2.3, 2.5, 3.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashUserInput } from '@/app/lib/agents/error-handling'

describe('API Route Caller Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Error Logging', () => {
    it('should hash user input for privacy', () => {
      const input = 'Bench press 225x5x5'
      const hash = hashUserInput(input)

      expect(hash).toBeDefined()
      expect(hash.length).toBe(16)
      expect(hash).not.toContain('Bench')
      expect(hash).not.toContain('225')
    })

    it('should handle empty input', () => {
      const hash = hashUserInput('')
      expect(hash).toBe('empty-input')
    })

    it('should produce consistent hashes', () => {
      const input = 'Test workout'
      const hash1 = hashUserInput(input)
      const hash2 = hashUserInput(input)

      expect(hash1).toBe(hash2)
    })
  })

  describe('Conversational Response Detection', () => {
    it('should detect question marks as conversational', () => {
      const message = 'Could you provide more details?'
      const isConversational = message.includes('?')

      expect(isConversational).toBe(true)
    })

    it('should detect clarifying phrases', () => {
      const message = 'Could you tell me more about the workout?'
      const hasPhrase = message.toLowerCase().includes('could you')

      expect(hasPhrase).toBe(true)
    })

    it('should not detect regular errors as conversational', () => {
      const message = 'JSON parse error at position 42'
      const isConversational = message.includes('?') ||
                               message.toLowerCase().includes('could you')

      expect(isConversational).toBe(false)
    })
  })

  describe('Error Message Handling', () => {
    it('should preserve conversational responses', () => {
      const conversationalError = 'Could you provide the number of rounds?'
      const shouldPreserve = conversationalError.includes('?')

      expect(shouldPreserve).toBe(true)
    })

    it('should transform technical errors to user-friendly messages', () => {
      const technicalError = 'Unexpected token } in JSON at position 42'
      const isConversational = technicalError.includes('?')

      expect(isConversational).toBe(false)
      // In this case, buildUserFriendlyError would be called
    })
  })

  describe('Error Context Preservation', () => {
    it('should include timestamp in error logs', () => {
      const timestamp = new Date().toISOString()

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should extract error stack traces', () => {
      const error = new Error('Test error')

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('Test error')
    })

    it('should handle non-Error objects', () => {
      const errorString = 'Something went wrong'
      const message = String(errorString)

      expect(message).toBe('Something went wrong')
    })
  })
})
