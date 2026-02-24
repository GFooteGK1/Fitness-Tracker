import type { AgentRequest } from './types'

/**
 * Preprocess user input before classification.
 *
 * - Voice: transcription happens client-side via Web Speech API,
 *   so the content field already contains the transcribed text.
 * - Photo: base64 or storage URL is passed through as-is;
 *   the content field should describe what was sent (e.g., "photo attached").
 * - File: similar to photo — content describes the file.
 * - Text: passed through directly.
 *
 * Returns the text content to send to the classifier.
 */
export async function preprocessInput(request: AgentRequest): Promise<string> {
  const { content, input_mode, photo_data } = request

  switch (input_mode) {
    case 'voice':
      // Client already transcribed via Web Speech API
      return content.trim()

    case 'photo':
      // If content is empty but photo_data exists, provide a hint
      if (!content.trim() && photo_data) {
        return '[Photo attached for analysis]'
      }
      return content.trim() || '[Photo attached]'

    case 'file':
      return content.trim() || '[File attached]'

    case 'text':
    default:
      return content.trim()
  }
}

/**
 * Validate the incoming AgentRequest.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateRequest(request: AgentRequest): string | null {
  if (!request.content && !request.photo_data && !request.audio_data) {
    return 'No input provided. Send text, photo, or audio.'
  }

  // Text max 5000 chars
  if (request.content && request.content.length > 5000) {
    return 'Text input too long (max 5000 characters).'
  }

  // Photo max 5MB (base64 is ~33% larger than raw)
  if (request.photo_data && request.photo_data.length > 7_000_000) {
    return 'Photo too large (max 5MB).'
  }

  // Audio max 10MB
  if (request.audio_data && request.audio_data.length > 14_000_000) {
    return 'Audio too large (max 10MB).'
  }

  // Validate input_mode
  const validModes = ['text', 'voice', 'photo', 'file']
  if (!validModes.includes(request.input_mode)) {
    return `Invalid input_mode. Must be one of: ${validModes.join(', ')}`
  }

  return null
}
