/**
 * Unit tests for error handling utilities
 *
 * Tests all shared error handling functions used by Trainer, Nutritionist, and Socius agents.
 *
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  logParsingError,
  detectConversationalResponse,
  cleanResponseForParsing,
  extractConversationalContent,
  buildUserFriendlyError,
  hashUserInput
} from '@/app/lib/agents/error-handling'

describe('Error Handling Utilities', () => {
  describe('hashUserInput', () => {
    it('should return consistent hash for same input', () => {
      const input = 'test workout input'
      const hash1 = hashUserInput(input)
      const hash2 = hashUserInput(input)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(16)
    })

    it('should return different hashes for different inputs', () => {
      const hash1 = hashUserInput('workout 1')
      const hash2 = hashUserInput('workout 2')

      expect(hash1).not.toBe(hash2)
    })

    it('should handle empty input', () => {
      const hash = hashUserInput('')
      expect(hash).toBe('empty-input')
    })
  })

  describe('logParsingError', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleErrorSpy.mockRestore()
    })

    it('should log all diagnostic information with correct format', () => {
      const error = new Error('JSON parse error')
      const rawResponse = 'Could you tell me more?'
      const userInputHash = 'abc123'

      logParsingError('trainer', rawResponse, userInputHash, error)

      expect(consoleErrorSpy).toHaveBeenCalledWith('=== AGENT PARSING ERROR ===')
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Timestamp:'))
      expect(consoleErrorSpy).toHaveBeenCalledWith('Agent: trainer')
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: JSON parse error')
      expect(consoleErrorSpy).toHaveBeenCalledWith('User Input Hash: abc123')
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Raw Response:'))
      expect(consoleErrorSpy).toHaveBeenCalledWith('===========================')
    })

    it('should truncate long responses', () => {
      const error = new Error('Test error')
      const longResponse = 'a'.repeat(1500)
      const userInputHash = 'xyz789'

      logParsingError('nutritionist', longResponse, userInputHash, error)

      const rawResponseCall = consoleErrorSpy.mock.calls.find((call: unknown[]) =>
        String(call[0]).startsWith('Raw Response:')
      )

      expect(rawResponseCall).toBeDefined()
      expect(String(rawResponseCall![0])).toContain('[truncated]')
      expect(String(rawResponseCall![0]).length).toBeLessThan(1100)
    })

    it('should not truncate short responses', () => {
      const error = new Error('Test error')
      const shortResponse = 'Short response'
      const userInputHash = 'def456'

      logParsingError('socius', shortResponse, userInputHash, error)

      const rawResponseCall = consoleErrorSpy.mock.calls.find((call: unknown[]) =>
        String(call[0]).startsWith('Raw Response:')
      )

      expect(rawResponseCall).toBeDefined()
      expect(String(rawResponseCall![0])).not.toContain('[truncated]')
      expect(String(rawResponseCall![0])).toContain(shortResponse)
    })

    it('should work with different agent types', () => {
      const error = new Error('Test')
      const response = 'test response'
      const hash = 'hash123'

      logParsingError('trainer', response, hash, error)
      expect(consoleErrorSpy).toHaveBeenCalledWith('Agent: trainer')

      consoleErrorSpy.mockClear()

      logParsingError('nutritionist', response, hash, error)
      expect(consoleErrorSpy).toHaveBeenCalledWith('Agent: nutritionist')

      consoleErrorSpy.mockClear()

      logParsingError('socius', response, hash, error)
      expect(consoleErrorSpy).toHaveBeenCalledWith('Agent: socius')
    })

    it('should handle non-Error objects', () => {
      const errorString = 'String error'
      const response = 'test'
      const hash = 'hash'

      logParsingError('trainer', response, hash, errorString)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: String error')
    })
  })

  describe('detectConversationalResponse', () => {
    it('should detect questions with question marks', () => {
      expect(detectConversationalResponse('Could you tell me more?')).toBe(true)
      expect(detectConversationalResponse('What exercises did you do?')).toBe(true)
      expect(detectConversationalResponse('Which workout was it?')).toBe(true)
    })

    it('should detect clarifying phrases', () => {
      expect(detectConversationalResponse('Could you provide more details')).toBe(true)
      expect(detectConversationalResponse('Can you tell me about the workout')).toBe(true)
      expect(detectConversationalResponse('Please tell me more about that')).toBe(true)
      expect(detectConversationalResponse('What did you eat')).toBe(true)
      expect(detectConversationalResponse('Which exercises were included')).toBe(true)
      expect(detectConversationalResponse('Would you mind clarifying')).toBe(true)
      expect(detectConversationalResponse('Can you provide more information')).toBe(true)
      expect(detectConversationalResponse('Could you clarify that')).toBe(true)
      expect(detectConversationalResponse('I need more details')).toBe(true)
      expect(detectConversationalResponse('Tell me more about it')).toBe(true)
      expect(detectConversationalResponse('Describe the workout')).toBe(true)
      expect(detectConversationalResponse('Explain what you did')).toBe(true)
    })

    it('should not detect non-conversational text', () => {
      expect(detectConversationalResponse('{"blocks": []}')).toBe(false)
      expect(detectConversationalResponse('Error: Invalid JSON')).toBe(false)
      expect(detectConversationalResponse('Processing complete')).toBe(false)
    })

    it('should handle empty strings', () => {
      expect(detectConversationalResponse('')).toBe(false)
    })

    it('should handle special characters', () => {
      expect(detectConversationalResponse('!@#$%^&*()')).toBe(false)
      expect(detectConversationalResponse('What? Really!')).toBe(true)
    })

    it('should be case insensitive', () => {
      expect(detectConversationalResponse('COULD YOU TELL ME MORE?')).toBe(true)
      expect(detectConversationalResponse('What Did You Do?')).toBe(true)
    })
  })

  describe('cleanResponseForParsing', () => {
    it('should strip markdown code fences with json', () => {
      const input = '```json\n{"key": "value"}\n```'
      const cleaned = cleanResponseForParsing(input)

      expect(cleaned).toBe('{"key": "value"}')
    })

    it('should strip markdown code fences without language', () => {
      const input = '```\n{"key": "value"}\n```'
      const cleaned = cleanResponseForParsing(input)

      expect(cleaned).toBe('{"key": "value"}')
    })

    it('should strip leading and trailing whitespace', () => {
      const input = '   \n  {"key": "value"}  \n  '
      const cleaned = cleanResponseForParsing(input)

      expect(cleaned).toBe('{"key": "value"}')
    })

    it('should strip BOM characters', () => {
      const input = '\uFEFF{"key": "value"}'
      const cleaned = cleanResponseForParsing(input)

      expect(cleaned).toBe('{"key": "value"}')
    })

    it('should handle mixed formatting artifacts', () => {
      const input = '  \uFEFF```json\n  {"key": "value"}  \n```  '
      const cleaned = cleanResponseForParsing(input)

      expect(cleaned).toBe('{"key": "value"}')
    })

    it('should produce valid JSON-parseable output', () => {
      const input = '```json\n{"name": "test", "value": 123}\n```'
      const cleaned = cleanResponseForParsing(input)

      expect(() => JSON.parse(cleaned)).not.toThrow()
      expect(JSON.parse(cleaned)).toEqual({ name: 'test', value: 123 })
    })

    it('should handle already clean JSON', () => {
      const input = '{"key": "value"}'
      const cleaned = cleanResponseForParsing(input)

      expect(cleaned).toBe('{"key": "value"}')
    })
  })

  describe('extractConversationalContent', () => {
    it('should extract pure conversational text', () => {
      const input = 'Could you tell me more about the workout?'
      const extracted = extractConversationalContent(input)

      expect(extracted).toBe('Could you tell me more about the workout?')
    })

    it('should clean formatting artifacts from conversational text', () => {
      const input = '```\nCould you tell me more?\n```'
      const extracted = extractConversationalContent(input)

      expect(extracted).toBe('Could you tell me more?')
    })

    it('should handle BOM characters in conversational text', () => {
      const input = '\uFEFFWhat did you eat today?'
      const extracted = extractConversationalContent(input)

      expect(extracted).toBe('What did you eat today?')
    })

    it('should return null for non-conversational content', () => {
      const input = '{"blocks": []}'
      const extracted = extractConversationalContent(input)

      expect(extracted).toBeNull()
    })

    it('should return null for empty strings', () => {
      const input = ''
      const extracted = extractConversationalContent(input)

      expect(extracted).toBeNull()
    })

    it('should return null for very short content', () => {
      const input = 'What?'
      const extracted = extractConversationalContent(input)

      expect(extracted).toBeNull()
    })

    it('should handle mixed content with conversational indicators', () => {
      const input = 'Could you provide more details about the exercises you performed?'
      const extracted = extractConversationalContent(input)

      expect(extracted).toBe('Could you provide more details about the exercises you performed?')
    })
  })

  describe('buildUserFriendlyError', () => {
    describe('with conversational responses', () => {
      it('should return conversational content directly', () => {
        const rawResponse = 'Could you tell me more about the workout?'
        const error = new Error('Parse error')

        const message = buildUserFriendlyError('trainer', error, rawResponse)

        expect(message).toBe('Could you tell me more about the workout?')
      })

      it('should work for all agent types', () => {
        const rawResponse = 'What did you eat?'
        const error = new Error('Parse error')

        const trainerMsg = buildUserFriendlyError('trainer', error, rawResponse)
        const nutritionistMsg = buildUserFriendlyError('nutritionist', error, rawResponse)
        const sociusMsg = buildUserFriendlyError('socius', error, rawResponse)

        expect(trainerMsg).toBe('What did you eat?')
        expect(nutritionistMsg).toBe('What did you eat?')
        expect(sociusMsg).toBe('What did you eat?')
      })
    })

    describe('trainer agent errors', () => {
      it('should provide JSON-specific guidance', () => {
        const error = new Error('Unexpected token in JSON')
        const message = buildUserFriendlyError('trainer', error, null)

        expect(message).toContain('trouble processing that workout')
        expect(message).toContain('describe your workout in more detail')
        expect(message).toContain('exercises, sets, reps')
      })

      it('should provide general guidance for non-JSON errors', () => {
        const error = new Error('Network error')
        const message = buildUserFriendlyError('trainer', error, null)

        expect(message).toContain('trouble processing that workout')
        expect(message).toContain('try describing your workout differently')
        expect(message).toContain('rounds')
      })
    })

    describe('nutritionist agent errors', () => {
      it('should provide JSON-specific guidance', () => {
        const error = new Error('Invalid JSON format')
        const message = buildUserFriendlyError('nutritionist', error, null)

        expect(message).toContain('trouble processing that meal')
        expect(message).toContain('describe your meal in more detail')
        expect(message).toContain('foods you ate')
      })

      it('should provide general guidance for non-JSON errors', () => {
        const error = new Error('Unknown error')
        const message = buildUserFriendlyError('nutritionist', error, null)

        expect(message).toContain('trouble processing that meal')
        expect(message).toContain('try describing your meal differently')
        expect(message).toContain('chicken breast')
      })
    })

    describe('socius agent errors', () => {
      it('should provide JSON-specific guidance', () => {
        const error = new Error('JSON parsing failed')
        const message = buildUserFriendlyError('socius', error, null)

        expect(message).toContain('trouble analyzing that')
        expect(message).toContain('ask your question in a different way')
        expect(message).toContain('workouts, nutrition, and recovery')
      })

      it('should provide general guidance for non-JSON errors', () => {
        const error = new Error('Processing error')
        const message = buildUserFriendlyError('socius', error, null)

        expect(message).toContain('trouble analyzing that')
        expect(message).toContain('try rephrasing your question')
        expect(message).toContain('recovery trending')
      })
    })

    it('should handle null rawResponse', () => {
      const error = new Error('Test error')

      const message = buildUserFriendlyError('trainer', error, null)

      expect(message).toBeTruthy()
      expect(message).toContain('trouble processing')
    })

    it('should handle non-Error objects', () => {
      const error = 'String error'

      const message = buildUserFriendlyError('trainer', error, null)

      expect(message).toBeTruthy()
      expect(message).toContain('trouble processing')
    })

    it('should provide actionable guidance for all agent types', () => {
      const error = new Error('Test')

      const trainerMsg = buildUserFriendlyError('trainer', error, null)
      const nutritionistMsg = buildUserFriendlyError('nutritionist', error, null)
      const sociusMsg = buildUserFriendlyError('socius', error, null)

      // All should contain actionable guidance (Could you, try, For example)
      expect(trainerMsg).toMatch(/could you|try|for example/i)
      expect(nutritionistMsg).toMatch(/could you|try|for example/i)
      expect(sociusMsg).toMatch(/could you|try|for example/i)
    })
  })
})
