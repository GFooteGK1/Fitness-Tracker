import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_ANTHROPIC_FAST_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  getAnthropicModel,
} from '@/app/lib/anthropic-client'

const MODEL_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_NUTRITION_MODEL',
  'ANTHROPIC_VISION_MODEL',
  'ANTHROPIC_WORKOUT_MODEL',
  'ANTHROPIC_QUERY_MODEL',
  'ANTHROPIC_AGENT_MODEL',
  'ANTHROPIC_FAST_MODEL',
] as const

describe('Anthropic model selection', () => {
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    originalEnv = Object.fromEntries(
      MODEL_ENV_KEYS.map(key => [key, process.env[key]])
    )
    MODEL_ENV_KEYS.forEach(key => {
      delete process.env[key]
    })
  })

  afterEach(() => {
    MODEL_ENV_KEYS.forEach(key => {
      const value = originalEnv[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    })
  })

  it('uses the current Sonnet default when no model env is set', () => {
    expect(getAnthropicModel()).toBe(DEFAULT_ANTHROPIC_MODEL)
    expect(getAnthropicModel('nutrition')).toBe(DEFAULT_ANTHROPIC_MODEL)
    expect(getAnthropicModel('vision')).toBe(DEFAULT_ANTHROPIC_MODEL)
  })

  it('allows purpose-specific overrides', () => {
    process.env.ANTHROPIC_NUTRITION_MODEL = 'custom-nutrition-model'
    process.env.ANTHROPIC_VISION_MODEL = 'custom-vision-model'

    expect(getAnthropicModel('nutrition')).toBe('custom-nutrition-model')
    expect(getAnthropicModel('vision')).toBe('custom-vision-model')
  })

  it('falls back to the generic model override when a purpose override is absent', () => {
    process.env.ANTHROPIC_MODEL = 'custom-shared-model'

    expect(getAnthropicModel('nutrition')).toBe('custom-shared-model')
    expect(getAnthropicModel('agent')).toBe('custom-shared-model')
  })

  it('ignores retired model IDs from deployment env overrides', () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'
    process.env.ANTHROPIC_NUTRITION_MODEL = 'claude-3-5-sonnet-20241022'
    process.env.ANTHROPIC_VISION_MODEL = 'claude-opus-4-5'

    expect(getAnthropicModel()).toBe(DEFAULT_ANTHROPIC_MODEL)
    expect(getAnthropicModel('nutrition')).toBe(DEFAULT_ANTHROPIC_MODEL)
    expect(getAnthropicModel('vision')).toBe(DEFAULT_ANTHROPIC_MODEL)
  })

  it('uses the current fast default for classifier-style calls', () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'

    expect(getAnthropicModel('fast')).toBe(DEFAULT_ANTHROPIC_FAST_MODEL)
  })
})
