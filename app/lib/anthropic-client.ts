import Anthropic from '@anthropic-ai/sdk'

let anthropicClient: Anthropic | null = null

export type AnthropicModelPurpose =
  | 'default'
  | 'nutrition'
  | 'vision'
  | 'workout'
  | 'query'
  | 'agent'
  | 'fast'

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6'
export const DEFAULT_ANTHROPIC_FAST_MODEL = 'claude-haiku-4-5-20251001'

const MODEL_ENV_BY_PURPOSE: Record<AnthropicModelPurpose, string | undefined> = {
  default: 'ANTHROPIC_MODEL',
  nutrition: 'ANTHROPIC_NUTRITION_MODEL',
  vision: 'ANTHROPIC_VISION_MODEL',
  workout: 'ANTHROPIC_WORKOUT_MODEL',
  query: 'ANTHROPIC_QUERY_MODEL',
  agent: 'ANTHROPIC_AGENT_MODEL',
  fast: 'ANTHROPIC_FAST_MODEL',
}

const RETIRED_OR_STALE_MODEL_IDS = new Set([
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-5-sonnet-20241022',
  'claude-opus-4-5',
])

function cleanModel(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || RETIRED_OR_STALE_MODEL_IDS.has(trimmed)) {
    return null
  }
  return trimmed
}

export function getAnthropicModel(purpose: AnthropicModelPurpose = 'default'): string {
  if (purpose === 'fast') {
    return cleanModel(process.env.ANTHROPIC_FAST_MODEL)
      ?? cleanModel(process.env.ANTHROPIC_MODEL)
      ?? DEFAULT_ANTHROPIC_FAST_MODEL
  }

  const purposeEnvName = MODEL_ENV_BY_PURPOSE[purpose]
  return cleanModel(purposeEnvName ? process.env[purposeEnvName] : undefined)
    ?? cleanModel(process.env.ANTHROPIC_MODEL)
    ?? DEFAULT_ANTHROPIC_MODEL
}

export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey })
  }

  return anthropicClient
}
