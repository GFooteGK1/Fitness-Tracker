/**
 * Shared error handling utilities for all agents (Trainer, Nutritionist, Socius).
 *
 * This module provides:
 * - Diagnostic logging for parsing failures
 * - Conversational response detection
 * - Response formatting cleanup
 * - User-friendly error message generation
 * - User input hashing for privacy-preserving correlation
 *
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5
 */

import type { AgentDomain } from './types'
import { createHash } from 'crypto'

/**
 * Hash user input for privacy-preserving error correlation.
 *
 * Creates a SHA-256 hash of the user input to allow correlation
 * of errors with specific inputs without storing sensitive data.
 *
 * @param userInput - The user input to hash
 * @returns SHA-256 hash of the input (first 16 characters)
 */
export function hashUserInput(userInput: string): string {
  if (!userInput) return 'empty-input'

  const hash = createHash('sha256')
  hash.update(userInput)
  return hash.digest('hex').substring(0, 16)
}

/**
 * Log detailed diagnostic information when parsing fails.
 *
 * Logs:
 * - Timestamp
 * - Agent type
 * - Error message
 * - Raw LLM response (truncated if >1000 chars)
 * - User input hash for correlation
 *
 * @param agentType - The agent that encountered the error ('trainer', 'nutritionist', 'socius')
 * @param rawResponse - The raw LLM response that failed to parse
 * @param userInputHash - Hash of user input for correlation (for privacy)
 * @param error - The error that occurred during parsing
 */
export function logParsingError(
  agentType: AgentDomain,
  rawResponse: string,
  userInputHash: string,
  error: unknown
): void {
  const timestamp = new Date().toISOString()
  const errorMessage = error instanceof Error ? error.message : String(error)

  // Truncate response if too long for readability
  const truncatedResponse = rawResponse.length > 1000
    ? rawResponse.substring(0, 1000) + '... [truncated]'
    : rawResponse

  console.error('=== AGENT PARSING ERROR ===')
  console.error(`Timestamp: ${timestamp}`)
  console.error(`Agent: ${agentType}`)
  console.error(`Error: ${errorMessage}`)
  console.error(`User Input Hash: ${userInputHash}`)
  console.error(`Raw Response:\n${truncatedResponse}`)
  console.error('===========================')
}

/**
 * Detect if an LLM response is conversational text rather than structured JSON.
 *
 * Checks for:
 * - Question marks (indicating questions)
 * - Clarifying phrases ("could you", "can you", "please tell me", "what", "which")
 * - Conversational patterns
 *
 * @param rawResponse - The raw LLM response to check
 * @returns true if the response appears to be conversational, false otherwise
 */
export function detectConversationalResponse(rawResponse: string): boolean {
  const normalized = rawResponse.toLowerCase().trim()

  // Check for question marks
  if (normalized.includes('?')) {
    return true
  }

  // Check for clarifying phrases
  const clarifyingPhrases = [
    'could you',
    'can you',
    'please tell me',
    'what ',
    'which ',
    'would you',
    'can you provide',
    'could you clarify',
    'i need more',
    'tell me more',
    'describe',
    'explain'
  ]

  for (const phrase of clarifyingPhrases) {
    if (normalized.includes(phrase)) {
      return true
    }
  }

  return false
}

/**
 * Clean an LLM response by stripping formatting artifacts before JSON parsing.
 *
 * Strips:
 * - Markdown code fences (```json, ```)
 * - Leading/trailing whitespace
 * - BOM characters (\uFEFF)
 *
 * @param rawResponse - The raw LLM response to clean
 * @returns The cleaned response ready for JSON parsing
 */
export function cleanResponseForParsing(rawResponse: string): string {
  let cleaned = rawResponse.trim()

  // Strip BOM characters
  if (cleaned.charCodeAt(0) === 0xFEFF) {
    cleaned = cleaned.substring(1)
  }

  // Strip markdown code fences
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }

  // Strip leading/trailing whitespace again after fence removal
  cleaned = cleaned.trim()

  return cleaned
}

/**
 * Extract useful conversational content from a failed parse attempt.
 *
 * Cleans up formatting artifacts and extracts the conversational text
 * that should be presented to the user.
 *
 * @param rawResponse - The raw LLM response that failed to parse
 * @returns The cleaned conversational text, or null if not conversational
 */
export function extractConversationalContent(rawResponse: string): string | null {
  if (!detectConversationalResponse(rawResponse)) {
    return null
  }

  // Clean up formatting artifacts
  let cleaned = rawResponse.trim()

  // Remove markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\s*/, '').replace(/\s*```$/, '')
  }

  // Remove BOM characters
  if (cleaned.charCodeAt(0) === 0xFEFF) {
    cleaned = cleaned.substring(1)
  }

  // Trim again
  cleaned = cleaned.trim()

  // Return null if the cleaned content is empty or too short
  if (cleaned.length < 10) {
    return null
  }

  return cleaned
}

/**
 * Build a user-friendly error message based on agent type and error context.
 *
 * Provides actionable guidance to users based on:
 * - The agent that encountered the error
 * - Whether the response was conversational
 * - The type of error that occurred
 *
 * @param agentType - The agent that encountered the error
 * @param error - The error that occurred
 * @param rawResponse - The raw LLM response (may contain conversational content)
 * @returns A user-friendly error message with actionable guidance
 */
export function buildUserFriendlyError(
  agentType: AgentDomain,
  error: unknown,
  rawResponse: string | null
): string {
  // Check if the response was conversational
  const conversationalContent = rawResponse ? extractConversationalContent(rawResponse) : null

  // If we have conversational content, return it directly
  if (conversationalContent) {
    return conversationalContent
  }

  // Build agent-specific error messages with actionable guidance
  const errorMessage = error instanceof Error ? error.message : String(error)

  switch (agentType) {
    case 'trainer':
      return `I had trouble processing that workout. ${getTrainerGuidance(errorMessage)}`

    case 'nutritionist':
      return `I had trouble processing that meal. ${getNutritionistGuidance(errorMessage)}`

    case 'socius':
      return `I had trouble analyzing that. ${getSociusGuidance(errorMessage)}`

    default:
      return 'I had trouble processing your request. Could you try rephrasing it?'
  }
}

/**
 * Get specific guidance for Trainer agent errors.
 */
function getTrainerGuidance(errorMessage: string): string {
  if (errorMessage.toLowerCase().includes('json')) {
    return 'Could you describe your workout in more detail? Include exercises, sets, reps, and any scores.'
  }

  return 'Could you try describing your workout differently? For example: "5 rounds of 10 push-ups, 15 squats, 20 sit-ups"'
}

/**
 * Get specific guidance for Nutritionist agent errors.
 */
function getNutritionistGuidance(errorMessage: string): string {
  if (errorMessage.toLowerCase().includes('json')) {
    return 'Could you describe your meal in more detail? Include the foods you ate and approximate portions.'
  }

  return 'Could you try describing your meal differently? For example: "6 oz chicken breast, 1 cup rice, 1 cup broccoli"'
}

/**
 * Get specific guidance for Socius agent errors.
 */
function getSociusGuidance(errorMessage: string): string {
  if (errorMessage.toLowerCase().includes('json')) {
    return 'Could you ask your question in a different way? I can help analyze your workouts, nutrition, and recovery patterns.'
  }

  return 'Could you try rephrasing your question? For example: "How is my recovery trending?" or "Am I eating enough protein?"'
}
